import { rm, readFile } from "node:fs/promises";
import path from "node:path";

import { parseDocxPackage } from "@/lib/document/docx-package";
import { planAgentRuntimeTurn, type AgentRuntimeDecision } from "@/lib/agent/runtime";
import { executeRuntimeTool } from "@/lib/agent/runtime/tool-executor";
import type { ConversationFileReference, ToolAdapterContext } from "@/lib/agent/runtime/tool-adapters";
import type { AgentRunResult } from "@/lib/agent/types";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const forbiddenPhrases = ["我将围绕", "本文将", "附件依据", "避免空泛套话", "生成正文时优先", "根据用户要求", "作为 AI", "以下内容来自"];

type Check = {
  name: string;
  run: () => Promise<void> | void;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function baseAgentResult(content: string): AgentRunResult {
  return {
    content,
    modelUsed: "test",
    providerUsed: "xheai",
    routeReason: "test",
    fallbackUsed: false,
    extractedDocuments: [],
    generatedFiles: [],
    pendingTask: null,
    defaultsApplied: []
  };
}

function plan(input: string, overrides: Partial<Parameters<typeof planAgentRuntimeTurn>[0]> = {}) {
  return planAgentRuntimeTurn({
    messages: [{ role: "user", content: input }],
    ...overrides
  });
}

function conversationFile(text: string): ConversationFileReference {
  return {
    attachmentId: "attachment-1",
    fileName: "source.txt",
    mimeType: "text/plain",
    sizeBytes: text.length,
    objectKey: null,
    providerFileId: null,
    extractedText: text,
    textPreview: text.slice(0, 200),
    parseStatus: "parsed",
    sourceMessageId: "message-1",
    conversationId: "conversation-1"
  };
}

function makeContext({
  userText,
  files = [],
  conversationFiles = [],
  messages
}: {
  userText: string;
  files?: File[];
  conversationFiles?: ConversationFileReference[];
  messages?: ToolAdapterContext["messages"];
}): ToolAdapterContext {
  return {
    request: new Request("http://localhost/api/ai/chat"),
    origin: "http://localhost",
    userId: "word-adapter-test",
    conversationId: "conversation-1",
    userText,
    messages: messages || [{ role: "user", content: userText }],
    files,
    conversationFiles,
    tools: { webSearch: false, contentMode: null },
    signal: new AbortController().signal,
    activeTask: null,
    runLegacyAgent: async () => {
      throw new Error("LEGACY_AGENT_SHOULD_NOT_BE_CALLED");
    },
    runImageGeneration: async () => ({ result: baseAgentResult("image not used"), imageGeneration: null }),
    runChatAnswer: async () => baseAgentResult("chat answer")
  };
}

function localPathFromMockUrl(url: string | null) {
  assert(url, "generated file should include a download URL");
  assert(url.startsWith("/mock-storage/"), `unexpected generated URL: ${url}`);
  return path.join(process.cwd(), "public", url.replace(/^\//, ""));
}

async function readGeneratedDocx(result: Awaited<ReturnType<typeof executeRuntimeTool>>) {
  assert("adapterId" in result && result.adapterId === "word-adapter", `expected word-adapter, got ${"adapterId" in result ? result.adapterId : "none"}`);
  assert(!("validationFailed" in result), "adapter validation should pass");
  const generated = result.result.generatedFiles[0];
  assert(generated, "expected generated file");
  assert(generated.fileName.endsWith(".docx"), "fileName should end with .docx");
  assert(generated.mimeType === DOCX_MIME, "mimeType should be docx");
  assert(generated.sizeBytes > 0, "generated docx should not be empty");
  const filePath = localPathFromMockUrl(generated.url);
  const buffer = await readFile(filePath);
  await rm(filePath, { force: true });
  return { generated, buffer, xml: parseDocxPackage(buffer).getText("word/document.xml") || "" };
}

function textFromXml(xml: string) {
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

async function executeWord(input: string, context: ToolAdapterContext, decision?: AgentRuntimeDecision) {
  const runtimeDecision = decision || plan(input).decision;
  assert(runtimeDecision.targetTool === "word", `expected targetTool word, got ${runtimeDecision.targetTool}`);
  assert(runtimeDecision.nextAction === "run_legacy_tool", `expected run_legacy_tool, got ${runtimeDecision.nextAction}`);
  return executeRuntimeTool(runtimeDecision, context);
}

const checks: Check[] = [
  {
    name: "explicit Word request generates docx task card result",
    async run() {
      const input = "帮我生成一份 AI 教育培训方案 Word 文档";
      const result = await executeWord(input, makeContext({ userText: input }));
      const { generated, xml } = await readGeneratedDocx(result);
      const resultCard = "resultCard" in result ? result.resultCard : null;
      assert(result.result.generatedFiles.length === 1, "should generate exactly one docx");
      assert(resultCard?.taskType === "word", "resultCard should be word");
      assert(resultCard?.status === "completed", "resultCard should be completed");
      assert(resultCard?.downloadUrl === generated.url, "resultCard should expose generated downloadUrl");
      assert(resultCard?.wordTaskMemory?.currentStage === "completed", "resultCard should include completed wordTaskMemory");
      assert(textFromXml(xml).includes("AI 教育"), "docx should include topic");
    }
  },
  {
    name: "current uploaded file content is used for Word",
    async run() {
      const input = "根据这个文件整理成 Word";
      const file = new File(["项目式学习材料强调课堂观察、教师协作和过程评价。"], "source.txt", { type: "text/plain" });
      const runtimePlan = plan(input, { activeTask: { id: "file-task-1", kind: "file-analysis", title: "source.txt", status: "completed" } });
      const result = await executeWord(input, makeContext({ userText: input, files: [file] }), runtimePlan.decision);
      const { xml } = await readGeneratedDocx(result);
      assert(textFromXml(xml).includes("课堂观察"), "docx should include uploaded file content");
    }
  },
  {
    name: "recent summary exports to docx",
    async run() {
      const input = "把刚才的总结导出成 docx";
      const runtimePlan = plan(input, { cachedConversationSummary: "刚才总结了课程目标、实施步骤和评价方式。" });
      const result = await executeWord(
        input,
        makeContext({
          userText: input,
          messages: [
            { role: "assistant", content: "刚才总结了课程目标、实施步骤和评价方式。" },
            { role: "user", content: input }
          ]
        }),
        runtimePlan.decision
      );
      const { xml } = await readGeneratedDocx(result);
      assert(textFromXml(xml).includes("课程目标"), "docx should include recent summary");
    }
  },
  {
    name: "Word advice does not execute adapter",
    run() {
      const runtimePlan = plan("Word 怎么排版？");
      assert(runtimePlan.decision.targetTool === "none", "Word advice should not target word");
      assert(runtimePlan.decision.nextAction === "answer_chat", "Word advice should answer chat");
    }
  },
  {
    name: "file analysis request does not generate Word",
    run() {
      const runtimePlan = plan("根据这个文件总结一下");
      assert(runtimePlan.decision.targetTool === "file-analysis", "file summary should target file-analysis");
    }
  },
  {
    name: "missing subject or file asks clarification",
    run() {
      const noSubject = plan("帮我生成一份 Word");
      assert(noSubject.decision.nextAction === "ask_clarification", "generic Word should ask clarification");
      assert(noSubject.decision.missingInputs.includes("subject"), "generic Word should require subject");
      const noFile = plan("根据这个文件整理成 Word");
      assert(noFile.decision.nextAction === "ask_clarification", "missing file should ask clarification");
      assert(noFile.decision.missingInputs.includes("file"), "missing file should require file");
    }
  },
  {
    name: "polluted input is sanitized in generated docx",
    async run() {
      const input = "生成一份教师培训 Word 文档。附件依据显示：我将围绕培训主题，避免空泛套话，生成正文时优先保留要点。";
      const result = await executeWord(input, makeContext({ userText: input }));
      const { xml } = await readGeneratedDocx(result);
      const text = textFromXml(xml);
      for (const phrase of forbiddenPhrases) assert(!text.includes(phrase), `docx should not include ${phrase}`);
    }
  },
  {
    name: "generated docx buffer passes base zip validation",
    async run() {
      const input = "帮我生成一份基础校验 Word 文档";
      const result = await executeWord(input, makeContext({ userText: input }));
      const { buffer, xml } = await readGeneratedDocx(result);
      assert(buffer.length > 0, "buffer should not be empty");
      assert(xml.includes("<w:document"), "docx should include document.xml root");
    }
  }
];

async function main() {
  let failed = 0;
  for (const check of checks) {
    try {
      await check.run();
      console.log(`PASS ${check.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${check.name}`);
      console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failed > 0) {
    console.error(`Agent Word adapter checks failed: ${failed}/${checks.length} cases failed.`);
    process.exit(1);
  }
  console.log(`Agent Word adapter checks passed. ${checks.length}/${checks.length} PASS.`);
}

void main();
