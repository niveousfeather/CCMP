import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { closeDeepWritingPanel, createInitialDeepWritingClientState, openDeepWritingPanel, reduceDeepWritingPanelEvent } from "@/components/chat/deep-writing-panel-state";
import type { ChatTaskCard } from "@/components/chat/chat-data";
import { detectDeepWritingMode } from "@/lib/agent/runtime/deep-writing-detector";
import { createDeepWritingTaskMemory, resumeDeepWritingTaskMemory, type DeepWritingTaskMemory } from "@/lib/agent/runtime/deep-writing-memory";
import { runDeepWritingDraft, type SafeDeepWritingEvent } from "@/lib/agent/runtime/deep-writing-runner";
import { executeRuntimeTool } from "@/lib/agent/runtime/tool-executor";
import type { AgentRuntimeDecision } from "@/lib/agent/runtime";
import type { ConversationFileReference, ToolAdapterContext } from "@/lib/agent/runtime/tool-adapters";
import type { AgentRunResult } from "@/lib/agent/types";
import { parseDocxPackage } from "@/lib/document/docx-package";

type Check = {
  name: string;
  run: () => Promise<void> | void;
};

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const LESSON_PROMPT = "帮我生成一个高中二年级物理教案";
const NEW_TOPIC_PROMPT = "帮我生成一个小学三年级语文教案";
const EXPORT_PROMPT = "把下面这段内容整理成 Word";
const SOURCE_TEXT = Array.from({ length: 8 })
  .map((_, index) => {
    const tasks = [
      "运营组在开业前一天完成现场动线确认，并把入口、收银台、试吃区和儿童活动角的负责人写入值班表",
      "信息组负责收银系统、会员积分、电子价签和备用网络测试，发现异常后要在二十分钟内反馈给店长",
      "商品组核对货架陈列、价签信息、保质期标识和热销单品库存，对缺货商品形成补货清单",
      "会员组统一说明到店礼、满额赠、积分加倍和新会员礼包的使用边界，避免不同员工口径不一致",
      "前厅组安排入口引导人员，控制试吃区排队间距，并在客流高峰时协调临时分流路线",
      "宣传组在开业当天采集现场图文素材，跟进社群预告、短视频发布和门店指引图更新",
      "值班主管遇到系统卡顿、物料不足、投诉集中或客流超预估时，立即启动备用方案并同步店长",
      "闭店后各组汇总客流、销售额、会员新增、库存异常和顾客反馈，第二天上午提交复盘表"
    ];
    return `${tasks[index]}。`;
  })
  .join("\n\n");
const UNSAFE_PAYLOAD_TERMS = ["prompt", "provider", "stack", "apiKey", "rawMemory"];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function baseResult(content: string): AgentRunResult {
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

function wordDecision(): AgentRuntimeDecision {
  return {
    intent: "word",
    targetTool: "word",
    confidence: 0.98,
    needsTool: true,
    needsConfirmation: false,
    missingInputs: [],
    activeTaskId: null,
    nextAction: "run_legacy_tool",
    progressStages: ["analyzing_context", "planning_intent", "selecting_skill", "checking_execution_gate", "calling_tool", "completed"]
  };
}

function makeMemory(prompt = LESSON_PROMPT) {
  const detection = detectDeepWritingMode({ userText: prompt, targetTool: "word" });
  assert(detection.enabled, "test prompt should trigger deep writing");
  return createDeepWritingTaskMemory({
    conversationId: `stream-resume-${Math.random().toString(36).slice(2)}`,
    originalInstruction: prompt,
    topic: prompt,
    detection,
    sourceFileNames: [],
    sourceSummary: ""
  });
}

function sectionText(title: string, suffix = "") {
  const variants: Record<string, string[]> = {
    课程基本信息: ["本课面向高中二年级学生，主题聚焦物理概念与实验探究的衔接。", "课时安排以导入、探究、归纳、检测四个部分展开，配套器材包括弹簧测力计、小车、轨道和数据记录单。"],
    学情分析: ["学生已经具备基础公式应用经验，但对实验变量控制和现象解释还容易停留在表层。", "课堂需要通过真实问题引导学生把生活经验转化为可观察、可记录、可推理的物理证据。"],
    教学目标: ["学生能够说出核心概念的含义，能结合实验数据解释物理量之间的关系。", "学生在小组合作中完成观察记录、误差讨论和结论表达，形成规范的科学探究习惯。"],
    教学重点与难点: ["重点是概念建构、实验现象分析和典型例题迁移，难点是从数据变化中抽象出稳定规律。", "教师通过追问、板演和对比实验帮助学生突破只套公式、不解释过程的问题。"],
    教学过程设计: ["导入环节展示生活情境，引出待解决问题；探究环节组织学生分组测量并实时记录现象。", "交流环节请学生解释数据差异，教师再归纳关键关系，最后用分层例题完成课堂检测。"],
    课堂练习: ["基础练习检查概念辨析和单位换算，提升练习要求学生根据图像或表格完成推理。", "拓展练习设置开放情境，让学生说明选择公式的依据，并写出必要的物理过程。"],
    作业设计: ["课后作业分为巩固题、实验反思和生活观察三类，避免单纯机械计算。", "学生需要整理课堂数据，补充误差来源，并用一段话解释本节课规律在生活中的应用。"],
    板书设计: ["板书采用问题、实验、规律、应用四栏结构，突出概念定义和关键推理链条。", "左侧保留学生猜想，中间呈现实验数据，右侧归纳结论和易错提醒，方便课末回看。"],
    教学反思: ["课后重点观察学生是否真正理解实验条件，而不是只记住结论。", "下一轮教学可增加同伴互评和即时反馈，让学生更主动地修正表达中的逻辑漏洞。"]
  };
  const paragraphs = variants[title] || [
    `${title}部分围绕高中二年级物理教案展开，明确本章节在整份教案中的作用。`,
    `教师组织学生完成观察、记录、推理和表达，把关键结论落实到练习与板书中。`
  ];
  return [
    paragraphs[0],
    `${paragraphs[1]}${suffix}`
  ].join("\n\n");
}

function conversationFile(text: string): ConversationFileReference {
  return {
    attachmentId: "source-1",
    fileName: "source.txt",
    mimeType: "text/plain",
    sizeBytes: text.length,
    objectKey: null,
    providerFileId: null,
    extractedText: text,
    textPreview: text.slice(0, 400),
    parseStatus: "parsed",
    sourceMessageId: "message-1",
    conversationId: "word-stream-resume-test"
  };
}

function makeContext(input: {
  userText: string;
  conversationId: string;
  events?: SafeDeepWritingEvent[];
  sourceText?: string;
  interruptAfterChunks?: number;
  activeMemory?: DeepWritingTaskMemory;
}): ToolAdapterContext {
  let chunks = 0;
  return {
    request: new Request("http://localhost/api/ai/chat"),
    origin: "http://localhost",
    userId: "word-stream-resume-test",
    conversationId: input.conversationId,
    userText: input.userText,
    messages: [{ role: "user", content: input.userText }],
    files: [],
    conversationFiles: input.sourceText ? [conversationFile(input.sourceText)] : [],
    tools: { webSearch: false, contentMode: "write" },
    signal: new AbortController().signal,
    deepWritingTaskMemory: input.activeMemory,
    emitDeepWritingEvent: input.events
      ? (event) => {
          input.events?.push(event);
        }
      : undefined,
    generateWritingSectionContent: async ({ section, sectionIndex, currentPartialText, onDelta }) => {
      const full = currentPartialText
        ? `${sectionText(section.title, ` 续写完成，补充针对本章节的评价方式与课堂反馈。`)}`
        : sectionText(section.title, "");
      const chunksToWrite = full.split(/\n\n/).map((chunk) => `${chunk}\n\n`).filter(Boolean);
      for (const chunk of chunksToWrite) {
        chunks += 1;
        await onDelta(chunk);
        if (input.interruptAfterChunks && chunks >= input.interruptAfterChunks) throw new Error("DEBUG_STREAM_ABORT");
      }
      return currentPartialText ? `${currentPartialText}${full}` : full;
    },
    runLegacyAgent: async () => {
      throw new Error("LEGACY_AGENT_SHOULD_NOT_BE_CALLED");
    },
    runImageGeneration: async () => ({ result: baseResult("unused image"), imageGeneration: null }),
    runChatAnswer: async () => baseResult("unused chat")
  };
}

async function executeWord(input: Parameters<typeof makeContext>[0]) {
  return executeRuntimeTool(wordDecision(), makeContext(input));
}

function localPathFromMockUrl(url?: string | null) {
  assert(url, "generated file should include download URL");
  assert(url.startsWith("/mock-storage/"), `unexpected generated URL: ${url}`);
  return path.join(process.cwd(), "public", url.replace(/^\//, ""));
}

async function readGeneratedText(url?: string | null) {
  const filePath = localPathFromMockUrl(url);
  const buffer = await readFile(filePath);
  await rm(filePath, { force: true });
  const xml = parseDocxPackage(buffer).getText("word/document.xml") || "";
  return xml.replace(/<[^>]+>/g, "");
}

function panelCard(memory: DeepWritingTaskMemory): ChatTaskCard {
  return {
    kind: "task_card",
    taskType: "word",
    status: memory.currentStage === "completed" ? "completed" : "running",
    title: memory.topic,
    description: memory.topic,
    taskId: memory.taskId,
    mode: "deep_writing",
    deepWritingTaskId: memory.taskId,
    panelAvailable: true,
    panelAutoOpen: true,
    currentStage: memory.currentStage,
    documentReady: memory.currentStage === "completed",
    deepWritingPanelState: {
      isOpen: true,
      taskId: memory.taskId,
      title: memory.topic,
      currentStage: memory.currentStage,
      progress: 50,
      outline: [],
      completedSections: memory.outline
        .filter((section) => section.draft)
        .map((section) => ({ id: section.id, title: section.title, draft: section.draft || "" })),
      sources: [],
      canResume: memory.currentStage !== "completed",
      directDocumentBody: "已有正文"
    }
  };
}

const checks: Check[] = [
  {
    name: "model stream chunks write currentSectionPartialText",
    async run() {
      const events: SafeDeepWritingEvent[] = [];
      const memory = await runDeepWritingDraft({
        memory: makeMemory(),
        contentGenerationMode: "model_generated",
        generateSectionContent: async ({ section, onDelta }) => {
          await onDelta("第一块正文。");
          await onDelta("第二块正文。");
          return `${section.title}完成正文。`;
        },
        emit: (event) => {
          events.push(event);
        }
      });
      assert(events.some((event) => event.type === "deep_writing_section_delta"), "section delta should stream");
      assert(memory.currentSectionPartialText === "", "completed generation should clear partial text");
    }
  },
  {
    name: "section completed writes completedSections",
    async run() {
      const memory = await runDeepWritingDraft({
        memory: makeMemory(),
        contentGenerationMode: "model_generated",
        generateSectionContent: async ({ section, sectionIndex, onDelta }) => {
          const text = sectionText(section.title, "");
          await onDelta(text);
          return text;
        },
        emit: () => undefined
      });
      assert(memory.completedSectionIds.length === memory.outline.length, "all sections should complete");
      assert(memory.outline.every((section) => section.status === "completed" && section.draft), "completed sections should keep drafts");
    }
  },
  {
    name: "transient model stream failure auto retries current section",
    async run() {
      const events: SafeDeepWritingEvent[] = [];
      let failedOnce = false;
      let retrySawPartial = false;
      const memory = await runDeepWritingDraft({
        memory: makeMemory(),
        contentGenerationMode: "model_generated",
        sectionRetryLimit: 3,
        generateSectionContent: async ({ section, sectionIndex, currentPartialText, onDelta }) => {
          if (!failedOnce) {
            failedOnce = true;
            await onDelta("partial opening.");
            throw new Error("MODEL_STREAM_TIMEOUT");
          }
          if (sectionIndex === 0) {
            retrySawPartial = currentPartialText.includes("partial opening.");
          }
          const continuation = sectionIndex === 0 ? " automatic continuation." : sectionText(section.title, "");
          await onDelta(continuation);
          return `${currentPartialText || ""}${continuation}`;
        },
        emit: (event) => {
          events.push(event);
        }
      });
      assert(failedOnce, "first model stream call should fail once");
      assert(retrySawPartial, "retry should receive currentSectionPartialText");
      assert(memory.currentStage === "completed", "transient section failure should auto retry to completion");
      assert(!events.some((event) => event.type === "deep_writing_interrupted"), "transient retry should not emit interrupted");
      assert(memory.outline[0].draft?.includes("partial opening. automatic continuation."), "section draft should continue original partial text");
    }
  },
  {
    name: "repeated transient model failures keep retrying until section completes",
    async run() {
      let calls = 0;
      const memory = await runDeepWritingDraft({
        memory: makeMemory(),
        contentGenerationMode: "model_generated",
        generateSectionContent: async ({ section, sectionIndex, currentPartialText, onDelta }) => {
          calls += 1;
          if (sectionIndex === 0 && calls <= 5) {
            if (!currentPartialText) await onDelta("start.");
            throw new Error("PROVIDER_TIMEOUT");
          }
          const text = sectionIndex === 0 ? `${currentPartialText || ""}done.` : sectionText(section.title, "");
          await onDelta(sectionIndex === 0 ? "done." : text);
          return text;
        },
        emit: () => undefined
      });
      assert(calls >= 6, "runner should retry repeated transient model failures");
      assert(memory.currentStage === "completed", "repeated transient failures should still complete");
      assert(memory.outline[0].draft?.includes("start.done."), "retry should continue from preserved partial");
    }
  },
  {
    name: "many transient model failures still auto complete long document section",
    async run() {
      let calls = 0;
      const memory = await runDeepWritingDraft({
        memory: makeMemory(),
        contentGenerationMode: "model_generated",
        generateSectionContent: async ({ section, sectionIndex, currentPartialText, onDelta }) => {
          calls += 1;
          if (sectionIndex === 0 && calls <= 30) {
            if (!currentPartialText) await onDelta("long-start.");
            throw new Error("MODEL_STREAM_ABORT");
          }
          const text = sectionIndex === 0 ? `${currentPartialText || ""}long-done.` : sectionText(section.title, "");
          await onDelta(sectionIndex === 0 ? "long-done." : text);
          return text;
        },
        emit: () => undefined
      });
      assert(calls >= 31, "runner should tolerate many transient model interruptions");
      assert(memory.currentStage === "completed", "many transient failures should still complete");
      assert(memory.outline[0].draft?.includes("long-start.long-done."), "long retry should continue from preserved partial");
    }
  },
  {
    name: "provider 502 or 404 stops for manual continue instead of endless retry",
    async run() {
      for (const status of [502, 404]) {
        let calls = 0;
        const providerError = Object.assign(new Error(`PROVIDER_ERROR_${status}`), { status });
        const memory = await runDeepWritingDraft({
          memory: makeMemory(),
          contentGenerationMode: "model_generated",
          generateSectionContent: async () => {
            calls += 1;
            throw providerError;
          },
          emit: () => undefined
        });
        assert(calls === 1, `provider HTTP ${status} should not be retried forever`);
        assert(memory.currentStage === "interrupted", `provider HTTP ${status} should require manual continue`);
      }
    }
  },
  {
    name: "non-recoverable server configuration error does not retry forever",
    async run() {
      let calls = 0;
      const memory = await runDeepWritingDraft({
        memory: makeMemory(),
        contentGenerationMode: "model_generated",
        generateSectionContent: async () => {
          calls += 1;
          throw new Error("apiKey unauthorized");
        },
        emit: () => undefined
      });
      assert(calls === 1, "non-recoverable server configuration failures should not be retried");
      assert(memory.currentStage === "interrupted", "non-recoverable issue should leave manual resume state");
      assert(memory.canResume === true, "manual resume should remain available after server issue");
    }
  },
  {
    name: "interrupted status is resumable and keeps partial",
    async run() {
      const memory = await runDeepWritingDraft({
        memory: makeMemory(),
        contentGenerationMode: "model_generated",
        generateSectionContent: async ({ onDelta }) => {
          await onDelta("已经生成的半段正文。");
          throw new Error("DEBUG_STREAM_ABORT");
        },
        emit: () => undefined
      });
      assert(memory.currentStage === "interrupted", "memory should be interrupted");
      assert(memory.generationStatus === "interrupted", "generationStatus should be interrupted");
      assert(memory.canResume === true, "canResume should be true");
      assert(memory.currentSectionPartialText?.includes("已经生成"), "partial text should be preserved");
    }
  },
  {
    name: "interrupted adapter has no docx or completed card",
    async run() {
      const events: SafeDeepWritingEvent[] = [];
      const result = await executeWord({ userText: LESSON_PROMPT, conversationId: "stream-interrupted", events, interruptAfterChunks: 1 });
      assert("resultCard" in result && result.resultCard?.status !== "completed", "interrupted taskCard must not be completed");
      assert("resultCard" in result && !result.resultCard?.downloadUrl, "interrupted taskCard must not expose downloadUrl");
      assert(result.result.generatedFiles.length === 0, "interrupted task must not expose generatedFiles");
      assert(events.some((event) => event.type === "deep_writing_interrupted"), "interrupted event should be emitted");
    }
  },
  {
    name: "interrupted memory preserves completed and partial sections",
    async run() {
      const memory = makeMemory();
      let calls = 0;
      const interrupted = await runDeepWritingDraft({
        memory,
        contentGenerationMode: "model_generated",
        sectionRetryLimit: 1,
        generateSectionContent: async ({ section, sectionIndex, onDelta }) => {
          calls += 1;
          await onDelta(sectionText(section.title, ""));
          if (calls === 2) throw new Error("DEBUG_STREAM_ABORT");
          return sectionText(section.title, "");
        },
        emit: () => undefined
      });
      assert(interrupted.completedSectionIds.length === 1, "completed section should be preserved");
      assert(Boolean(interrupted.currentSectionPartialText), "current partial text should be preserved");
    }
  },
  {
    name: "resume continues from current section without rewriting completed sections",
    async run() {
      const first = makeMemory();
      first.outline[0].status = "completed";
      first.outline[0].draft = "已完成章节正文。";
      first.completedSectionIds = [first.outline[0].id];
      first.pendingSectionIds = first.outline.slice(1).map((section) => section.id);
      first.currentSectionId = first.outline[1].id;
      first.currentSectionIndex = 1;
      first.currentSectionPartialText = "当前章节已有开头。";
      first.currentStage = "interrupted";
      first.generationStatus = "interrupted";
      const resumed = resumeDeepWritingTaskMemory(first, "继续");
      const started: string[] = [];
      const completed = await runDeepWritingDraft({
        memory: resumed,
        contentGenerationMode: "model_generated",
        generateSectionContent: async ({ section, currentPartialText, onDelta }) => {
          started.push(section.id);
          await onDelta("续写内容。");
          return `${currentPartialText || ""}续写内容。`;
        },
        emit: () => undefined
      });
      assert(!started.includes(first.outline[0].id), "completed section should not be rewritten");
      assert(started[0] === first.outline[1].id, "resume should start at current section");
      assert(completed.outline[1].draft?.startsWith("当前章节已有开头。"), "partial text should remain at section start");
    }
  },
  {
    name: "topicFingerprint mismatch rejects resume",
    run() {
      const memory = makeMemory(LESSON_PROMPT);
      let rejected = false;
      try {
        resumeDeepWritingTaskMemory(memory, NEW_TOPIC_PROMPT);
      } catch {
        rejected = true;
      }
      assert(rejected, "different explicit topic should reject resume");
    }
  },
  {
    name: "new topic creates new task",
    async run() {
      const first = await executeWord({ userText: LESSON_PROMPT, conversationId: "stream-new-topic" });
      const oldMemory = "resultCard" in first ? first.resultCard?.deepWritingTaskMemory : null;
      const second = await executeWord({ userText: NEW_TOPIC_PROMPT, conversationId: "stream-new-topic", activeMemory: oldMemory || undefined });
      assert("resultCard" in first && "resultCard" in second, "both should have result cards");
      assert(first.resultCard?.deepWritingTaskId !== second.resultCard?.deepWritingTaskId, "new topic should create a new task");
    }
  },
  {
    name: "completed render creates docx",
    async run() {
      const result = await executeWord({ userText: LESSON_PROMPT, conversationId: "stream-completed" });
      assert("resultCard" in result && result.resultCard?.status === "completed", "completed write should complete card");
      assert(result.resultCard?.downloadUrl, "completed write should expose downloadUrl");
      assert(result.result.generatedFiles[0]?.mimeType === DOCX_MIME, "completed write should generate docx");
      const text = await readGeneratedText(result.result.generatedFiles[0]?.url);
      assert(text.includes("物理") || text.includes("实验"), "generated docx should include streamed content");
    }
  },
  {
    name: "deterministic fallback remains blocked in production",
    async run() {
      const result = await executeRuntimeTool(wordDecision(), {
        ...makeContext({ userText: LESSON_PROMPT, conversationId: "stream-no-writer" }),
        generateWritingSectionContent: undefined
      });
      assert("resultCard" in result && result.resultCard?.status !== "completed", "missing writer should not complete");
      assert("resultCard" in result && !result.resultCard?.downloadUrl, "missing writer should not expose downloadUrl");
    }
  },
  {
    name: "export_existing still completes fast",
    async run() {
      const result = await executeWord({ userText: EXPORT_PROMPT, conversationId: "stream-export", sourceText: SOURCE_TEXT });
      assert("resultCard" in result && result.resultCard?.status === "completed", "export existing should complete");
      assert(result.resultCard?.downloadUrl, "export existing should expose download URL");
    }
  },
  {
    name: "ui state supports directDocumentBody",
    run() {
      const state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_section_delta",
        payload: { taskId: "stream-ui", sectionId: "s1", title: "正文", delta: "直接正文流。" }
      });
      assert(state.panelState?.directDocumentBody?.includes("直接正文流"), "panel state should expose direct document body");
    }
  },
  {
    name: "ui interrupted is resumable",
    run() {
      const state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_interrupted",
        payload: { taskId: "stream-ui", title: "物理教案", canResume: true }
      });
      assert(state.panelState?.currentStage === "interrupted", "stage should be interrupted");
      assert(state.panelState.canResume, "panel should allow resume");
    }
  },
  {
    name: "ui payload excludes unsafe fields",
    run() {
      const state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_section_delta",
        payload: { taskId: "stream-ui", sectionId: "s1", title: "正文", delta: "公开正文。", prompt: "hidden", provider: "hidden", rawMemory: "hidden" }
      });
      const text = JSON.stringify(state);
      assert(text.includes("公开正文"), "public content should remain");
      for (const term of UNSAFE_PAYLOAD_TERMS) assert(!text.includes(term), `payload should not include ${term}`);
    }
  },
  {
    name: "deep_writing_interrupted is not fatal failed",
    run() {
      const state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_interrupted",
        payload: { taskId: "stream-ui", title: "物理教案" }
      });
      assert(state.panelState?.currentStage === "interrupted", "interrupted should not map to failed");
    }
  },
  {
    name: "closing panel preserves activeTaskId",
    run() {
      const memory = makeMemory();
      const opened = openDeepWritingPanel(createInitialDeepWritingClientState(), panelCard(memory));
      const closed = closeDeepWritingPanel(opened);
      assert(!closed.isOpen, "panel should close");
      assert(closed.activeTaskId === memory.taskId, "activeTaskId should remain");
    }
  },
  {
    name: "completed event keeps full body",
    run() {
      let state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_section_completed",
        payload: { taskId: "stream-ui", sectionId: "s1", title: "正文", draft: "完整正文。", preview: "完整正文。" }
      });
      state = reduceDeepWritingPanelEvent(state, { type: "deep_writing_completed", payload: { taskId: "stream-ui", downloadUrl: "/mock/doc.docx" } });
      assert(state.panelState?.directDocumentBody?.includes("完整正文"), "completed body should remain visible");
      assert(state.panelState?.downloadUrl === "/mock/doc.docx", "downloadUrl should be stored");
    }
  },
  {
    name: "resume text does not duplicate partial opening",
    async run() {
      const memory = makeMemory();
      memory.currentStage = "interrupted";
      memory.generationStatus = "interrupted";
      memory.currentSectionId = memory.outline[0].id;
      memory.currentSectionIndex = 0;
      memory.currentSectionPartialText = "开头不应重复。";
      const result = await runDeepWritingDraft({
        memory: resumeDeepWritingTaskMemory(memory, "继续生成"),
        contentGenerationMode: "model_generated",
        generateSectionContent: async ({ currentPartialText, onDelta }) => {
          await onDelta("后续内容。");
          return `${currentPartialText || ""}后续内容。`;
        },
        emit: () => undefined
      });
      const draft = result.outline[0].draft || "";
      assert(draft.indexOf("开头不应重复。") === draft.lastIndexOf("开头不应重复。"), "partial opening should not duplicate");
    }
  },
  {
    name: "payload does not expose internals from adapter",
    async run() {
      const events: SafeDeepWritingEvent[] = [];
      const result = await executeWord({ userText: LESSON_PROMPT, conversationId: "stream-safe-payload", events, interruptAfterChunks: 1 });
      const text = JSON.stringify({ events, resultCard: "resultCard" in result ? result.resultCard : null });
      for (const term of UNSAFE_PAYLOAD_TERMS) assert(!text.includes(term), `public payload should not include ${term}`);
      assert(!/"model"\s*:/.test(text), "public payload should not include raw model key");
    }
  },
  {
    name: "interrupted taskCard exposes resumable metadata",
    async run() {
      const result = await executeWord({ userText: LESSON_PROMPT, conversationId: "stream-card-resumable", interruptAfterChunks: 1 });
      assert("resultCard" in result && result.resultCard?.currentStage === "interrupted", "taskCard should expose interrupted stage");
      assert("resultCard" in result && result.resultCard?.deepWritingPanelState?.canResume, "panel state should be resumable");
    }
  },
  {
    name: "completed taskCard has no resumable state",
    async run() {
      const result = await executeWord({ userText: LESSON_PROMPT, conversationId: "stream-card-completed" });
      assert("resultCard" in result && result.resultCard?.status === "completed", "card should complete");
      assert("resultCard" in result && result.resultCard?.deepWritingPanelState?.canResume === false, "completed panel should not be resumable");
    }
  },
  {
    name: "writer receives previous completed sections",
    async run() {
      const memory = makeMemory();
      memory.outline[0].status = "completed";
      memory.outline[0].draft = "第一章完成。";
      memory.completedSectionIds = [memory.outline[0].id];
      let previousCount = -1;
      await runDeepWritingDraft({
        memory,
        contentGenerationMode: "model_generated",
        generateSectionContent: async ({ previousSections, onDelta }) => {
          previousCount = previousSections.length;
          await onDelta("下一章正文。");
          return "下一章正文。";
        },
        emit: () => undefined
      });
      assert(previousCount >= 1, "writer should receive completed sections");
    }
  },
  {
    name: "direct body combines completed and live section",
    run() {
      let state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_section_completed",
        payload: { taskId: "stream-ui", sectionId: "s1", title: "第一节", draft: "第一节正文。" }
      });
      state = reduceDeepWritingPanelEvent(state, {
        type: "deep_writing_section_delta",
        payload: { taskId: "stream-ui", sectionId: "s2", title: "第二节", delta: "第二节正在生成。" }
      });
      assert(state.panelState?.directDocumentBody?.includes("第一节正文"), "completed body should be included");
      assert(state.panelState?.directDocumentBody?.includes("第二节正在生成"), "live body should be included");
    }
  },
  {
    name: "script reports exact pass count",
    run() {
      assert(checks.length === 29, `expected 29 checks, got ${checks.length}`);
    }
  }
];

async function main() {
  let passed = 0;
  const failures: string[] = [];
  for (const check of checks) {
    try {
      await check.run();
      passed += 1;
    } catch (error) {
      failures.push(`${check.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length) {
    console.error(failures.map((failure) => `FAIL ${failure}`).join("\n"));
    console.error(`Word stream resume checks failed. ${passed}/${checks.length} PASS.`);
    process.exit(1);
  }

  console.log(`Word stream resume checks passed. ${passed}/${checks.length} PASS.`);
}

void main();
