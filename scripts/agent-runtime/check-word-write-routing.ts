import { detectDeepWritingMode } from "@/lib/agent/runtime/deep-writing-detector";
import { classifyWordWriteMode } from "@/lib/agent/runtime/word-write-mode-classifier";
import { planAgentRuntimeTurn, type AgentRuntimeDecision } from "@/lib/agent/runtime";
import { executeRuntimeTool } from "@/lib/agent/runtime/tool-executor";
import type { SafeDeepWritingEvent } from "@/lib/agent/runtime/deep-writing-runner";
import type { ToolAdapterContext } from "@/lib/agent/runtime/tool-adapters";
import type { AgentRunResult } from "@/lib/agent/types";

type Check = {
  name: string;
  run: () => Promise<void> | void;
};

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DEEP_LESSON_PROMPT = "帮我写一个三维动画课程的教案，细致一点，授课内容也要完整";
const SIMPLE_NOTICE_PROMPT = "帮我写一个门店开业通知 Word";
const EXPORT_BODY = [
  "门店开业筹备工作已经进入最后阶段，运营团队围绕人员培训、货品陈列、会员邀约、现场秩序、应急处理和开业宣传进行了统一安排。",
  "开业当天需要重点保障顾客接待、收银动线、商品补货、活动说明、投诉响应和数据记录。店长负责现场统筹，各岗位按照排班表执行。",
  "为确保活动顺利进行，所有员工需提前熟悉活动规则、价格政策、会员权益和常见问题答复。现场物料应在开业前一日完成检查。",
  "宣传团队负责线上社群通知和线下海报检查，运营团队负责现场流程复盘。开业后两日内提交销售数据、客流情况和改进建议。",
  "本通知作为门店开业执行依据，请相关同事按时完成准备事项，并在发现风险时及时向店长和区域负责人反馈。"
].join("\n\n");

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

function makeDecision(overrides: Partial<AgentRuntimeDecision> = {}): AgentRuntimeDecision {
  return {
    intent: "word",
    targetTool: "word",
    confidence: 0.96,
    needsTool: true,
    needsConfirmation: false,
    missingInputs: [],
    activeTaskId: null,
    nextAction: "run_legacy_tool",
    progressStages: ["analyzing_context", "planning_intent", "selecting_skill", "checking_execution_gate", "calling_tool", "completed"],
    ...overrides
  };
}

function classify(userText: string, sourceText = "", fileCount = 0) {
  const deepWritingDetection = detectDeepWritingMode({
    userText,
    targetTool: "word",
    sourceText,
    fileCount
  });
  return classifyWordWriteMode({
    userText,
    contentMode: "write",
    sourceText,
    fileCount,
    sourceFileNames: fileCount ? ["sample.txt"] : [],
    deepWritingDetection
  });
}

function context(input: {
  userText: string;
  conversationId: string;
  sourceText?: string;
  contentMode?: "write" | null;
  emitDeepWritingEvent?: (event: SafeDeepWritingEvent) => void;
  chatAnswerContent?: string;
}): ToolAdapterContext {
  const sourceText = input.sourceText || "";
  return {
    request: new Request("http://localhost/api/ai/chat"),
    origin: "http://localhost",
    userId: "word-write-routing-test",
    conversationId: input.conversationId,
    userText: input.userText,
    messages: [{ role: "user", content: input.userText }],
    files: [],
    conversationFiles: sourceText
      ? [
          {
            attachmentId: "attachment-1",
            fileName: "sample.txt",
            mimeType: "text/plain",
            sizeBytes: sourceText.length,
            objectKey: null,
            providerFileId: null,
            extractedText: sourceText,
            textPreview: sourceText.slice(0, 400),
            parseStatus: "parsed",
            sourceMessageId: "message-1",
            conversationId: input.conversationId
          }
        ]
      : [],
    tools: { webSearch: false, contentMode: input.contentMode ?? "write" },
    signal: new AbortController().signal,
    allowDeterministicWriting: true,
    emitDeepWritingEvent: input.emitDeepWritingEvent,
    runLegacyAgent: async () => {
      throw new Error("LEGACY_AGENT_SHOULD_NOT_BE_CALLED");
    },
    runImageGeneration: async () => ({ result: baseResult("unused image"), imageGeneration: null }),
    runChatAnswer: async () => baseResult(input.chatAnswerContent || "这是 Word 排版建议回答。")
  };
}

async function runWordAdapter(input: {
  userText: string;
  conversationId: string;
  sourceText?: string;
  events?: SafeDeepWritingEvent[];
  chatAnswerContent?: string;
}) {
  return executeRuntimeTool(
    makeDecision(),
    context({
      userText: input.userText,
      conversationId: input.conversationId,
      sourceText: input.sourceText,
      emitDeepWritingEvent: input.events
        ? (event) => {
            input.events?.push(event);
          }
        : undefined,
      chatAnswerContent: input.chatAnswerContent
    })
  );
}

function eventTypes(events: SafeDeepWritingEvent[]) {
  return events.map((event) => event.type);
}

function assertDeepWritingResult(result: Awaited<ReturnType<typeof executeRuntimeTool>>, events: SafeDeepWritingEvent[]) {
  assert("resultCard" in result && result.resultCard?.mode === "deep_writing", "taskCard metadata.mode should be deep_writing");
  assert(result.resultCard.panelAvailable === true, "deep writing taskCard should expose process panel");
  assert(result.resultCard.panelAutoOpen === true, "deep writing panel should auto open");
  assert(eventTypes(events).includes("deep_writing_started"), "deep writing should emit started event");
  assert(eventTypes(events).includes("deep_writing_outline"), "deep writing should emit outline event");
  assert(eventTypes(events).includes("deep_writing_section_delta"), "deep writing should emit section delta event");
}

function assertNoUnsafePayload(events: SafeDeepWritingEvent[]) {
  const serialized = JSON.stringify(events);
  for (const term of ["prompt", "provider", "stack", "apiKey", "rawMemory", "deepWritingTaskMemory", "wordTaskMemory"]) {
    assert(!serialized.includes(term), `payload should not include ${term}`);
  }
}

const checks: Check[] = [
  {
    name: "contentMode write does not imply immediate docx",
    run() {
      const decision = classify(DEEP_LESSON_PROMPT);
      assert(!decision.shouldGenerateImmediateDocx, "write mode alone must not allow immediate docx");
    }
  },
  {
    name: "lesson prompt classifies compose_deep",
    run() {
      const decision = classify("帮我写一个三维动画课程的教案");
      assert(decision.mode === "compose_deep", `expected compose_deep, got ${decision.mode}`);
      assert(decision.documentKind === "lesson_plan", `expected lesson_plan, got ${decision.documentKind}`);
    }
  },
  {
    name: "detailed complete lesson classifies compose_deep",
    run() {
      const decision = classify(DEEP_LESSON_PROMPT);
      assert(decision.mode === "compose_deep", `expected compose_deep, got ${decision.mode}`);
    }
  },
  {
    name: "64 class hours and 2000 chars classifies compose_deep",
    run() {
      const decision = classify("帮我写一个三维动画课程的教案，64 个课时，2000 字");
      assert(decision.mode === "compose_deep", `expected compose_deep, got ${decision.mode}`);
    }
  },
  {
    name: "course teaching design classifies compose_deep",
    run() {
      const decision = classify("生成一份课程教学设计 Word");
      assert(decision.mode === "compose_deep", `expected compose_deep, got ${decision.mode}`);
      assert(decision.documentKind === "lesson_plan", `expected lesson_plan, got ${decision.documentKind}`);
    }
  },
  {
    name: "compose_deep does not return normal immediate card",
    async run() {
      const events: SafeDeepWritingEvent[] = [];
      const result = await runWordAdapter({ userText: DEEP_LESSON_PROMPT, conversationId: "write-routing-deep-no-fast", events });
      assertDeepWritingResult(result, events);
      assert(!("resultCard" in result) || result.resultCard?.mode === "deep_writing", "compose_deep must not return normal Word card");
    }
  },
  {
    name: "compose_deep emits started",
    async run() {
      const events: SafeDeepWritingEvent[] = [];
      await runWordAdapter({ userText: DEEP_LESSON_PROMPT, conversationId: "write-routing-started", events });
      assert(eventTypes(events).includes("deep_writing_started"), "expected deep_writing_started");
    }
  },
  {
    name: "compose_deep emits outline",
    async run() {
      const events: SafeDeepWritingEvent[] = [];
      await runWordAdapter({ userText: DEEP_LESSON_PROMPT, conversationId: "write-routing-outline", events });
      assert(eventTypes(events).includes("deep_writing_outline"), "expected deep_writing_outline");
    }
  },
  {
    name: "compose_deep emits section delta",
    async run() {
      const events: SafeDeepWritingEvent[] = [];
      await runWordAdapter({ userText: DEEP_LESSON_PROMPT, conversationId: "write-routing-delta", events });
      assert(eventTypes(events).includes("deep_writing_section_delta"), "expected deep_writing_section_delta");
    }
  },
  {
    name: "compose_deep taskCard metadata is deep writing",
    async run() {
      const events: SafeDeepWritingEvent[] = [];
      const result = await runWordAdapter({ userText: DEEP_LESSON_PROMPT, conversationId: "write-routing-card", events });
      assert("resultCard" in result && result.resultCard?.mode === "deep_writing", "expected deep writing taskCard");
    }
  },
  {
    name: "simple notice classifies compose_simple",
    run() {
      const decision = classify(SIMPLE_NOTICE_PROMPT);
      assert(decision.mode === "compose_simple", `expected compose_simple, got ${decision.mode}`);
      assert(decision.requiresContentGeneration, "compose_simple should require content generation");
    }
  },
  {
    name: "compose_simple does not use deterministic immediate docx",
    async run() {
      const events: SafeDeepWritingEvent[] = [];
      const result = await runWordAdapter({ userText: SIMPLE_NOTICE_PROMPT, conversationId: "write-routing-simple", events });
      assertDeepWritingResult(result, events);
    }
  },
  {
    name: "compose_simple uses light deep writing",
    async run() {
      const events: SafeDeepWritingEvent[] = [];
      const result = await runWordAdapter({ userText: SIMPLE_NOTICE_PROMPT, conversationId: "write-routing-simple-light", events });
      assert("resultCard" in result && result.resultCard?.mode === "deep_writing", "simple writing should use deep writing taskCard");
      const outline = events.find((event) => event.type === "deep_writing_outline");
      assert(Array.isArray(outline?.payload.outline), "light deep writing should emit outline");
      assert((outline?.payload.outline as unknown[]).length <= 4, "light deep writing should keep a short outline");
    }
  },
  {
    name: "source text export classifies export_existing",
    run() {
      const decision = classify("把以上内容整理成 Word", EXPORT_BODY, 1);
      assert(decision.mode === "export_existing", `expected export_existing, got ${decision.mode}`);
      assert(decision.shouldGenerateImmediateDocx, "export_existing should allow immediate docx");
    }
  },
  {
    name: "export_existing allows immediate docx",
    async run() {
      const result = await runWordAdapter({
        userText: "把以上内容整理成 Word",
        conversationId: "write-routing-export",
        sourceText: EXPORT_BODY
      });
      assert("resultCard" in result && result.resultCard?.taskType === "word", "export_existing should return Word taskCard");
      assert(result.resultCard?.mode !== "deep_writing", "export_existing should use normal Word card");
      assert(result.resultCard?.status === "completed", "export_existing can complete immediately");
      assert(typeof result.resultCard?.downloadUrl === "string", "export_existing should expose downloadUrl");
      assert(result.result.generatedFiles[0]?.mimeType === DOCX_MIME, "export_existing should generate docx");
    }
  },
  {
    name: "word advice classifies answer_only",
    async run() {
      const decision = classify("Word 怎么排版？");
      assert(decision.mode === "answer_only", `expected answer_only, got ${decision.mode}`);
      const result = await runWordAdapter({
        userText: "Word 怎么排版？",
        conversationId: "write-routing-answer",
        chatAnswerContent: "Word 排版可以先设置标题层级、页边距和段落间距。"
      });
      assert(!("resultCard" in result) || !result.resultCard, "answer_only should not return taskCard");
      assert(result.result.generatedFiles.length === 0, "answer_only should not generate file");
    }
  },
  {
    name: "deep writing detector enabled is not overridden by fast path",
    async run() {
      const detection = detectDeepWritingMode({ userText: "深度写一份正式报告 Word", targetTool: "word" });
      assert(detection.enabled, "test setup should trigger deep writing");
      const events: SafeDeepWritingEvent[] = [];
      const result = await runWordAdapter({
        userText: "深度写一份正式报告 Word",
        conversationId: "write-routing-detector",
        events
      });
      assertDeepWritingResult(result, events);
    }
  },
  {
    name: "file summary stays file-analysis",
    run() {
      const plan = planAgentRuntimeTurn({
        messages: [{ role: "user", content: "根据这个文件总结一下" }],
        files: [{ name: "sample.txt", type: "text/plain", size: 120 }],
        pendingTask: null,
        activeTask: null,
        cachedConversationSummary: null,
        tools: { webSearch: false, contentMode: null }
      });
      assert(plan.decision.targetTool === "file-analysis", "file summary should remain file-analysis");
    }
  },
  {
    name: "deep writing payload excludes unsafe internals",
    async run() {
      const events: SafeDeepWritingEvent[] = [];
      await runWordAdapter({ userText: DEEP_LESSON_PROMPT, conversationId: "write-routing-safe-payload", events });
      assertNoUnsafePayload(events);
    }
  },
  {
    name: "word qa logs stay quiet by default",
    async run() {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      };
      try {
        await runWordAdapter({
          userText: "把以上内容整理成 Word",
          conversationId: "write-routing-qa-quiet",
          sourceText: EXPORT_BODY
        });
      } finally {
        console.log = originalLog;
      }
      assert(!logs.some((line) => line.includes("[word:qa]")), "word qa logs should be quiet by default");
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
    console.error(`Agent Word write routing checks failed: ${failed}/${checks.length} cases failed.`);
    process.exit(1);
  }

  console.log(`Agent Word write routing checks passed. ${checks.length}/${checks.length} PASS.`);
}

void main();
