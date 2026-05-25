import { rm, readFile } from "node:fs/promises";
import path from "node:path";

import { parseDocxPackage } from "@/lib/document/docx-package";
import { planAgentRuntimeTurn, type AgentRuntimeDecision } from "@/lib/agent/runtime";
import { executeRuntimeTool } from "@/lib/agent/runtime/tool-executor";
import type { SafeDeepWritingEvent } from "@/lib/agent/runtime/deep-writing-runner";
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

function makeConversationFile(conversationId: string, text = sampleText): ConversationFileReference {
  return {
    attachmentId: `${conversationId}-sample`,
    fileName: "sample.txt",
    mimeType: "text/plain",
    sizeBytes: text.length,
    objectKey: null,
    providerFileId: null,
    extractedText: text,
    textPreview: text.slice(0, 200),
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
  activeTask = null,
  events
}: {
  userText: string;
  conversationId?: string;
  files?: File[];
  conversationFiles?: ConversationFileReference[];
  messages?: ToolAdapterContext["messages"];
  activeTask?: AgentActiveTask | null;
  events?: SafeDeepWritingEvent[];
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

function assertDeepWriting(result: Awaited<ReturnType<typeof executeRuntimeTool>>, events: SafeDeepWritingEvent[]) {
  assert("resultCard" in result && result.resultCard?.taskType === "word", "deep writing should return a Word taskCard");
  assert(result.resultCard?.mode === "deep_writing", "write-from-scratch should use deep writing mode");
  assert(result.resultCard?.panelAutoOpen === true, "deep writing panel should auto open");
  assert(events.some((event) => event.type === "deep_writing_started"), "deep writing should emit started event");
  assert(events.some((event) => event.type === "deep_writing_outline"), "deep writing should emit outline event");
  assert(events.some((event) => event.type === "deep_writing_section_delta"), "deep writing should emit section delta event");
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

  async function submitRealChat(message: string, files: File[] = [], contentMode: "write" | null = "write") {
    const formData = new FormData();
    formData.set("mode", "agent");
    formData.set("stream", "true");
    formData.set("messages", JSON.stringify([{ role: "user", content: message }]));
    formData.set("tools", JSON.stringify({ webSearch: false, contentMode }));
    for (const file of files) formData.append("files", file, file.name);

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
    const error = events.find((event) => event.event === "error");
    assert(!error, `real API E2E returned error event`);
    const final = events.find((event) => event.event === "final");
    assert(final, "real API E2E should return a final event");
    return final.data.assistantMessage as {
      taskCard?: { taskType?: string; downloadUrl?: string | null; status?: string };
      attachments?: Array<{ fileName?: string; url?: string | null }>;
    } | undefined;
  }

  async function downloadRealDocx(downloadUrl: string | null | undefined) {
    assert(downloadUrl, "real API E2E Word taskCard should include downloadUrl");
    assert(!downloadUrl.includes("/api/ai/chat/tasks/"), "real API E2E must not expose task polling URL as download URL");
    const response = await fetch(new URL(downloadUrl, baseUrl), { headers: { cookie } });
    assert(response.ok, `real API E2E download failed with HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    assert(buffer.length > 0, "real API E2E downloaded docx should be non-empty");
    return docxText(buffer);
  }

  const advice = await submitRealChat("Word 怎么排版？", [], null);
  assert(advice?.taskCard?.taskType !== "word", "real API E2E Word advice should not generate a Word taskCard");

  const generated = await submitRealChat("帮我生成一份 Word，主题是 AI 教育培训方案");
  assert(generated?.taskCard?.taskType === "word", "real API E2E should return Word taskCard");
  assert(generated.taskCard.status === "completed", "real API E2E Word taskCard should complete through word-engine adapter");
  const generatedText = await downloadRealDocx(generated.taskCard.downloadUrl);
  assert(generatedText.includes("AI 教育培训方案"), "real API E2E docx should include requested topic");
  assertCleanBody(generatedText);

  const uploaded = await submitRealChat("根据这个文件整理成 Word 文档", [makeTxtFile()]);
  assert(uploaded?.taskCard?.taskType === "word", "real API E2E uploaded txt should generate Word taskCard");
  assert(uploaded.taskCard.status === "completed", "real API E2E uploaded txt Word taskCard should complete");
  const uploadedText = await downloadRealDocx(uploaded.taskCard.downloadUrl);
  for (const expected of ["张三", "90", "李四", "85", "AI 教育测试数据"]) {
    assert(uploadedText.includes(expected), `real API E2E uploaded docx should include ${expected}`);
  }
  assertCleanBody(uploadedText);

  const summary = await submitRealChat("根据这个文件总结一下", [makeTxtFile()], null);
  assert(summary?.taskCard?.taskType !== "word", "real API E2E file summary should not generate Word taskCard");
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
    name: "explicit Word write request enters deep writing",
    async run() {
      const input = "帮我生成一份 Word，主题是 AI 教育培训方案";
      const runtimePlan = plan(input);
      assert(runtimePlan.decision.targetTool === "word", "explicit Word request should target word");
      const events: SafeDeepWritingEvent[] = [];
      const result = await executeRuntimeTool(runtimePlan.decision, context({ userText: input, events }));
      assertDeepWriting(result, events);
      assert(result.result.generatedFiles.length === 1, "deep writing should generate final docx after draft");
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
    name: "same conversation continues exported Word task memory",
    async run() {
      const conversationId = "word-real-chat-resume";
      const firstInput = "把以上内容整理成 Word";
      const firstSource = "AI 教育培训方案已有正文：培训对象为中小学教师，周期四周，目标是完成 AI 备课、课堂活动设计和评价改进。";
      const first = await executeRuntimeTool(
        plan(firstInput).decision,
        context({ userText: firstInput, conversationId, conversationFiles: [makeConversationFile(conversationId, firstSource)] })
      );
      await readGeneratedDocx(first);

      const resumeInput = "继续刚才的 Word，补充使用建议";
      const activeTask: AgentActiveTask = { id: "word-task-1", kind: "word", title: "AI 教育培训方案", status: "completed", source: "conversation" };
      const runtimePlan = plan(resumeInput, { activeTask, tools: { webSearch: false, contentMode: null } });
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
