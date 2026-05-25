import { rm, readFile } from "node:fs/promises";
import path from "node:path";

import { parseDocxPackage } from "@/lib/document/docx-package";
import { planAgentRuntimeTurn, type AgentRuntimeDecision } from "@/lib/agent/runtime";
import { executeRuntimeTool } from "@/lib/agent/runtime/tool-executor";
import type { AgentActiveTask, ConversationFileReference, ToolAdapterContext } from "@/lib/agent/runtime/tool-adapters";
import type { AgentRunResult } from "@/lib/agent/types";

type Check = {
  name: string;
  run: () => Promise<void> | void;
};

const baseUrl = process.env.AGENT_E2E_BASE_URL || "http://localhost:3099";
const cookie = process.env.AGENT_E2E_COOKIE || "";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const sampleText = ["姓名,成绩", "张三,90", "李四,85", "说明：这是 AI 教育测试数据"].join("\n");
const forbiddenTerms = [
  "我将围绕",
  "本文将",
  "附件依据",
  "避免空泛套话",
  "生成正文时优先",
  "根据用户要求",
  "作为 AI",
  "以下内容来自",
  "wordTaskMemory",
  "completedSections",
  "pendingSections",
  "currentStage",
  "resumeInstruction",
  "failureReason",
  "mock",
  "placeholder",
  "TODO"
];

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

function makeTxtFile() {
  return new File([sampleText], "sample.txt", { type: "text/plain" });
}

function makeConversationFile(conversationId: string): ConversationFileReference {
  return {
    attachmentId: `${conversationId}-sample`,
    fileName: "sample.txt",
    mimeType: "text/plain",
    sizeBytes: sampleText.length,
    objectKey: null,
    providerFileId: null,
    extractedText: sampleText,
    textPreview: sampleText,
    parseStatus: "parsed",
    sourceMessageId: `${conversationId}-message`,
    conversationId
  };
}

function plan(input: string, overrides: Partial<Parameters<typeof planAgentRuntimeTurn>[0]> = {}) {
  return planAgentRuntimeTurn({
    messages: [{ role: "user", content: input }],
    tools: { webSearch: false, contentMode: null },
    ...overrides
  });
}

function wordDecision(overrides: Partial<AgentRuntimeDecision> = {}): AgentRuntimeDecision {
  return {
    intent: "create_document",
    targetTool: "word",
    confidence: 0.92,
    needsTool: true,
    needsConfirmation: false,
    missingInputs: [],
    activeTaskId: null,
    nextAction: "run_legacy_tool",
    reason: "word real chat local acceptance",
    ...overrides
  } as AgentRuntimeDecision;
}

function context({
  userText,
  conversationId = "word-real-chat-a",
  files = [],
  conversationFiles = [],
  messages,
  activeTask = null
}: {
  userText: string;
  conversationId?: string;
  files?: File[];
  conversationFiles?: ConversationFileReference[];
  messages?: ToolAdapterContext["messages"];
  activeTask?: AgentActiveTask | null;
}): ToolAdapterContext {
  return {
    request: new Request(`${baseUrl}/api/ai/chat`),
    origin: baseUrl,
    userId: "word-real-chat-test",
    conversationId,
    userText,
    messages: messages || [{ role: "user", content: userText }],
    files,
    conversationFiles,
    tools: { webSearch: false, contentMode: null },
    signal: new AbortController().signal,
    activeTask,
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

function docxText(buffer: Buffer) {
  const docx = parseDocxPackage(buffer);
  const documentXml = docx.getText("word/document.xml") || "";
  assert(documentXml.includes("<w:document"), "downloaded file should be a readable docx");
  assert(docx.getText("[Content_Types].xml"), "docx should include [Content_Types].xml");
  assert(docx.getText("word/styles.xml"), "docx should include styles.xml");
  return documentXml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

async function readGeneratedDocx(result: Awaited<ReturnType<typeof executeRuntimeTool>>) {
  assert("adapterId" in result && result.adapterId === "word-adapter", "expected word-adapter result");
  assert(!("validationFailed" in result), "adapter validation should pass");
  const generated = result.result.generatedFiles[0];
  assert(generated, "expected a generated docx file");
  assert(generated.fileName.endsWith(".docx"), "generated file should end with .docx");
  assert(generated.mimeType === DOCX_MIME, "generated file should have docx mime type");
  assert(generated.sizeBytes > 0, "generated docx should be non-empty");
  const resultCard = "resultCard" in result ? result.resultCard : null;
  assert(resultCard?.taskType === "word", "taskCard should be Word");
  assert(resultCard.status === "completed", "taskCard should be completed");
  assert(resultCard.downloadUrl === generated.url, "taskCard downloadUrl should match generated file URL");
  const filePath = localPathFromMockUrl(generated.url);
  const buffer = await readFile(filePath);
  await rm(filePath, { force: true });
  return { generated, resultCard, text: docxText(buffer), buffer };
}

function assertCleanBody(text: string) {
  for (const term of forbiddenTerms) assert(!text.includes(term), `docx body should not include ${term}`);
}

async function runCase(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

function parseSseEvents(text: string) {
  const events: Array<{ event: string; data: Record<string, unknown> }> = [];
  for (const block of text.split(/\n\n+/)) {
    const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
    const rawData = block.match(/^data:\s*(.+)$/m)?.[1]?.trim();
    if (!event || !rawData) continue;
    events.push({ event, data: JSON.parse(rawData) as Record<string, unknown> });
  }
  return events;
}

async function runApiE2eIfConfigured() {
  if (!cookie) {
    console.log("SKIP real API E2E: AGENT_E2E_COOKIE is not set.");
    return;
  }

  const formData = new FormData();
  formData.set("mode", "agent");
  formData.set("stream", "true");
  formData.set("messages", JSON.stringify([{ role: "user", content: "帮我生成一份 Word，主题是 AI 教育培训方案" }]));
  formData.set("tools", JSON.stringify({ webSearch: false, contentMode: "write" }));

  const response = await fetch(`${baseUrl}/api/ai/chat?stream=1&debugAgent=1`, {
    method: "POST",
    headers: {
      cookie,
      accept: "text/event-stream"
    },
    body: formData
  });
  assert(response.ok, `real API E2E failed with HTTP ${response.status}`);
  const events = parseSseEvents(await response.text());
  const final = events.find((event) => event.event === "final");
  const error = events.find((event) => event.event === "error");
  assert(!error, `real API E2E returned error event`);
  const assistantMessage = final?.data.assistantMessage as { taskCard?: { taskType?: string; downloadUrl?: string | null; status?: string } } | undefined;
  assert(assistantMessage?.taskCard?.taskType === "word", "real API E2E should return Word taskCard");
  assert(assistantMessage.taskCard.status === "completed", "real API E2E Word taskCard should complete synchronously");
  assert(Boolean(assistantMessage.taskCard.downloadUrl), "real API E2E Word taskCard should include downloadUrl");
}

const checks: Check[] = [
  {
    name: "Word advice stays chat-only",
    run() {
      const runtimePlan = plan("Word 怎么排版？");
      assert(runtimePlan.decision.targetTool === "none", "Word advice should not target a tool");
      assert(runtimePlan.decision.nextAction === "answer_chat", "Word advice should answer chat");
    }
  },
  {
    name: "explicit Word request generates downloadable clean docx",
    async run() {
      const input = "帮我生成一份 Word，主题是 AI 教育培训方案";
      const runtimePlan = plan(input);
      assert(runtimePlan.decision.targetTool === "word", "explicit Word request should target word");
      const result = await executeRuntimeTool(runtimePlan.decision, context({ userText: input }));
      const { text } = await readGeneratedDocx(result);
      assert(text.includes("AI 教育培训方案"), "docx should include requested topic");
      assert(text.includes("项目背景") && text.includes("实施路径"), "docx should look like a formal plan");
      assertCleanBody(text);
    }
  },
  {
    name: "uploaded txt facts enter Word body",
    async run() {
      const input = "根据这个文件整理成 Word 文档";
      const runtimePlan = plan(input, { files: [makeTxtFile()] });
      assert(runtimePlan.decision.targetTool === "word", `file to Word should target word, got ${runtimePlan.decision.targetTool}`);
      const result = await executeRuntimeTool(runtimePlan.decision, context({ userText: input, files: [makeTxtFile()] }));
      const { text } = await readGeneratedDocx(result);
      for (const expected of ["张三", "90", "李四", "85", "AI 教育测试数据"]) {
        assert(text.includes(expected), `docx should include uploaded fact ${expected}`);
      }
      assertCleanBody(text);
    }
  },
  {
    name: "file summary stays file-analysis",
    run() {
      const runtimePlan = plan("根据这个文件总结一下", { files: [makeTxtFile()] });
      assert(runtimePlan.decision.targetTool === "file-analysis", `file summary should target file-analysis, got ${runtimePlan.decision.targetTool}`);
      assert(runtimePlan.decision.nextAction === "run_legacy_tool", "file summary should run file-analysis adapter");
    }
  },
  {
    name: "Excel wording routes to Excel unless Word context is explicit",
    run() {
      const runtimePlan = plan("根据这个文件整理成 Excel 文档", { files: [makeTxtFile()] });
      assert(runtimePlan.decision.targetTool === "excel", `Excel wording should target excel, got ${runtimePlan.decision.targetTool}`);
    }
  },
  {
    name: "same conversation continues Word task memory",
    async run() {
      const conversationId = "word-real-chat-resume";
      const firstInput = "帮我生成一份 Word，主题是 AI 教育培训方案";
      const first = await executeRuntimeTool(plan(firstInput).decision, context({ userText: firstInput, conversationId }));
      await readGeneratedDocx(first);

      const resumeInput = "继续刚才的 Word，补充使用建议";
      const activeTask: AgentActiveTask = { id: "word-task-1", kind: "word", title: "AI 教育培训方案", status: "completed", source: "conversation" };
      const runtimePlan = plan(resumeInput, { activeTask, tools: { webSearch: false, contentMode: "write" } });
      const resumeDecision = runtimePlan.decision.targetTool === "word" ? runtimePlan.decision : wordDecision();
      const resumed = await executeRuntimeTool(resumeDecision, context({ userText: resumeInput, conversationId, activeTask }));
      const { resultCard, text } = await readGeneratedDocx(resumed);
      assert(resultCard.wordTaskMemory?.resumeInstruction === resumeInput, "resumeInstruction should be recorded in task memory");
      assert(text.includes("使用建议") || text.includes("后续任务"), "resumed docx should include added suggestions");
      assertCleanBody(text);
    }
  },
  {
    name: "new conversation does not inherit Word task memory",
    async run() {
      const result = await executeRuntimeTool(wordDecision(), context({ userText: "继续刚才的 Word", conversationId: "word-real-chat-new" }));
      assert("validationFailed" in result && result.validationFailed, "new conversation resume should ask clarification");
      assert(result.missingInputs.includes("active_word_task"), "missingInputs should include active_word_task");
    }
  },
  {
    name: "conversation extracted file text can generate Word",
    async run() {
      const conversationId = "word-real-chat-file-memory";
      const input = "根据这个文件整理成 Word 文档";
      const activeTask: AgentActiveTask = { id: "file-analysis-1", kind: "file-analysis", title: "sample.txt", status: "completed", source: "conversation" };
      const result = await executeRuntimeTool(
        wordDecision(),
        context({
          userText: input,
          conversationId,
          activeTask,
          conversationFiles: [makeConversationFile(conversationId)]
        })
      );
      const { text } = await readGeneratedDocx(result);
      assert(text.includes("张三") && text.includes("李四") && text.includes("AI 教育测试数据"), "conversation file text should enter docx");
      assertCleanBody(text);
    }
  },
  {
    name: "optional real API E2E Word generation",
    run: runApiE2eIfConfigured
  }
];

async function main() {
  let failed = 0;
  for (const check of checks) {
    try {
      await runCase(check.name, check.run);
    } catch {
      failed += 1;
    }
  }

  if (failed > 0) {
    console.error(`Agent Word real chat checks failed: ${failed}/${checks.length} cases failed.`);
    process.exit(1);
  }

  console.log(`Agent Word real chat checks passed. ${checks.length}/${checks.length} PASS.`);
}

void main();
