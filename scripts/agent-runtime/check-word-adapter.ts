import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { parseDocxPackage } from "@/lib/document/docx-package";
import { planAgentRuntimeTurn, type AgentRuntimeDecision } from "@/lib/agent/runtime";
import { executeRuntimeTool } from "@/lib/agent/runtime/tool-executor";
import type { SafeDeepWritingEvent } from "@/lib/agent/runtime/deep-writing-runner";
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
    tools: { webSearch: false, contentMode: "write" },
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
  messages,
  events
}: {
  userText: string;
  files?: File[];
  conversationFiles?: ConversationFileReference[];
  messages?: ToolAdapterContext["messages"];
  events?: SafeDeepWritingEvent[];
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
    tools: { webSearch: false, contentMode: "write" },
    signal: new AbortController().signal,
    allowDeterministicWriting: true,
    activeTask: null,
    emitDeepWritingEvent: events
      ? (event) => {
          events.push(event);
        }
      : undefined,
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

function assertDeepWriting(result: Awaited<ReturnType<typeof executeRuntimeTool>>, events: SafeDeepWritingEvent[]) {
  assert("resultCard" in result && result.resultCard?.mode === "deep_writing", "write-from-scratch should use deep writing card");
  assert(result.resultCard.panelAutoOpen === true, "deep writing panel should auto open");
  assert(events.some((event) => event.type === "deep_writing_started"), "deep writing should start");
  assert(events.some((event) => event.type === "deep_writing_outline"), "deep writing should emit outline");
  assert(events.some((event) => event.type === "deep_writing_section_delta"), "deep writing should stream section delta");
}

const checks: Check[] = [
  {
    name: "explicit Word write request enters deep writing instead of fast docx",
    async run() {
      const input = "帮我生成一份 AI 教育培训方案 Word 文档";
      const events: SafeDeepWritingEvent[] = [];
      const result = await executeWord(input, makeContext({ userText: input, events }));
      assertDeepWriting(result, events);
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
      const runtimePlan = planAgentRuntimeTurn({
        messages: [{ role: "user", content: "Word 怎么排版？" }],
        tools: { webSearch: false, contentMode: null }
      });
      assert(runtimePlan.decision.targetTool === "none", "Word advice should not target word");
      assert(runtimePlan.decision.nextAction === "answer_chat", "Word advice should answer chat");
    }
  },
  {
    name: "file analysis request does not generate Word",
    run() {
      const runtimePlan = planAgentRuntimeTurn({
        messages: [{ role: "user", content: "根据这个文件总结一下" }],
        files: [{ name: "source.txt", type: "text/plain", size: 120 }],
        tools: { webSearch: false, contentMode: null }
      });
      assert(runtimePlan.decision.targetTool === "file-analysis", "file summary should target file-analysis");
    }
  },
  {
    name: "missing subject or file asks clarification",
    run() {
      const noSubject = plan("帮我生成一份 Word");
      assert(noSubject.decision.nextAction === "ask_clarification", "generic Word should ask clarification");
      assert(noSubject.decision.missingInputs.includes("subject"), "generic Word should require subject");
      const noFile = plan("根据这个文件整理成 Word", { files: [] });
      assert(noFile.decision.nextAction === "ask_clarification", "missing file should ask clarification");
      assert(noFile.decision.missingInputs.includes("file"), "missing file should require file");
    }
  },
  {
    name: "polluted write input is sanitized through deep writing",
    async run() {
      const input = "生成一份教师培训 Word 文档。附件依据显示：我将围绕培训主题，避免空泛套话，生成正文时优先保留要点。";
      const events: SafeDeepWritingEvent[] = [];
      const result = await executeWord(input, makeContext({ userText: input, events }));
      assertDeepWriting(result, events);
      const text = JSON.stringify(events);
      for (const phrase of forbiddenPhrases) assert(!text.includes(phrase), `events should not include ${phrase}`);
    }
  },
  {
    name: "exported docx buffer passes base zip validation",
    async run() {
      const input = "把以上内容整理成 Word";
      const source = "基础校验材料说明：本次文档用于验证 Word 导出链路，内容包含标题、正文、后续建议和文件打开校验。";
      const result = await executeWord(input, makeContext({ userText: input, conversationFiles: [conversationFile(source)] }));
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
