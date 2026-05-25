import { detectDeepWritingMode } from "@/lib/agent/runtime/deep-writing-detector";
import {
  createDeepWritingTaskMemory,
  resumeDeepWritingTaskMemory,
  type DeepWritingTaskMemory
} from "@/lib/agent/runtime/deep-writing-memory";
import { runDeepWritingDraft, type SafeDeepWritingEvent } from "@/lib/agent/runtime/deep-writing-runner";
import { composeDeepWritingDraft } from "@/lib/word-engine/compose-deep-writing-draft";
import { planAgentRuntimeTurn, type AgentRuntimeDecision } from "@/lib/agent/runtime";
import { executeRuntimeTool } from "@/lib/agent/runtime/tool-executor";
import type { ToolAdapterContext } from "@/lib/agent/runtime/tool-adapters";
import type { AgentRunResult } from "@/lib/agent/types";

type Check = {
  name: string;
  run: () => Promise<void> | void;
};

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
    confidence: 0.94,
    needsTool: true,
    needsConfirmation: false,
    missingInputs: [],
    activeTaskId: null,
    nextAction: "run_legacy_tool",
    progressStages: ["analyzing_context", "planning_intent", "selecting_skill", "checking_execution_gate", "calling_tool", "completed"],
    ...overrides
  };
}

function context(userText: string, conversationId: string): ToolAdapterContext {
  return {
    request: new Request("http://localhost/api/ai/chat"),
    origin: "http://localhost",
    userId: "deep-writing-stream-test",
    conversationId,
    userText,
    messages: [{ role: "user", content: userText }],
    files: [],
    conversationFiles: [],
    tools: { webSearch: false, contentMode: "write" },
    signal: new AbortController().signal,
    runLegacyAgent: async () => {
      throw new Error("LEGACY_AGENT_SHOULD_NOT_BE_CALLED");
    },
    runImageGeneration: async () => ({ result: baseResult("unused image"), imageGeneration: null }),
    runChatAnswer: async () => baseResult("unused chat")
  };
}

function streamingContext(userText: string, conversationId: string, events: SafeDeepWritingEvent[]): ToolAdapterContext {
  return {
    ...context(userText, conversationId),
    emitDeepWritingEvent: (event) => {
      events.push(event);
    }
  };
}

function makeMemory({
  conversationId = "deep-stream",
  instruction = "深度写一份 AI 教育调研报告",
  sourceSummary = ""
}: {
  conversationId?: string;
  instruction?: string;
  sourceSummary?: string;
} = {}): DeepWritingTaskMemory {
  const detection = detectDeepWritingMode({
    userText: instruction,
    targetTool: "word",
    sourceText: sourceSummary
  });
  assert(detection.enabled, "test setup should trigger deep writing");
  return createDeepWritingTaskMemory({
    conversationId,
    originalInstruction: instruction,
    topic: "AI 教育调研报告",
    detection,
    sourceFileNames: sourceSummary ? ["sample.txt"] : [],
    sourceSummary
  });
}

async function collectEvents(memory: DeepWritingTaskMemory, sourceText = memory.sourceSummary) {
  const events: SafeDeepWritingEvent[] = [];
  const completed = await runDeepWritingDraft({
    memory,
    sourceText,
    conversationSummary: sourceText,
    emit: (event) => {
      events.push(event);
    }
  });
  return { events, completed };
}

function eventTypes(events: SafeDeepWritingEvent[]) {
  return events.map((event) => event.type);
}

function payloadText(events: SafeDeepWritingEvent[]) {
  return JSON.stringify(events);
}

const sourceText = "姓名,成绩\n张三,90\n李四,85\n说明：这是 AI 教育测试数据";
const forbiddenTerms = ["prompt", "provider", "stack", "apiKey", "rawMemory", "deepWritingTaskMemory", "wordTaskMemory"];
const forbiddenBodyTerms = ["mock", "placeholder", "TODO", "chain-of-thought", "作为 AI", "我的推理", "我将思考"];

const checks: Check[] = [
  {
    name: "deep writing event order is stable",
    async run() {
      const events: SafeDeepWritingEvent[] = [];
      const result = await executeRuntimeTool(
        makeDecision(),
        streamingContext("深度写一份 AI 教育调研报告", "deep-adapter-stream", events)
      );
      assert("resultCard" in result && result.resultCard?.mode === "deep_writing", "adapter should return deep writing task card");
      const types = eventTypes(events);
      assert(types[0] === "deep_writing_started", `first event should be started, got ${types[0]}`);
      assert(types[1] === "deep_writing_outline", `second event should be outline, got ${types[1]}`);
      assert(types.includes("deep_writing_polishing"), "polishing event should be emitted");
      assert(types[types.length - 1] === "deep_writing_completed", "completed should be last");
    }
  },
  {
    name: "started is followed by outline",
    async run() {
      const { events } = await collectEvents(makeMemory());
      const outline = events.find((event) => event.type === "deep_writing_outline");
      assert(Array.isArray(outline?.payload.outline), "outline payload should contain outline array");
      assert((outline?.payload.outline as unknown[]).length >= 4, "outline should contain multiple sections");
    }
  },
  {
    name: "section started emits multiple deltas",
    async run() {
      const { events } = await collectEvents(makeMemory());
      const firstStarted = events.find((event) => event.type === "deep_writing_section_started");
      assert(firstStarted?.payload.sectionId, "first section should start");
      const sectionId = firstStarted.payload.sectionId;
      const deltas = events.filter((event) => event.type === "deep_writing_section_delta" && event.payload.sectionId === sectionId);
      assert(deltas.length >= 2, `expected at least 2 deltas for first section, got ${deltas.length}`);
    }
  },
  {
    name: "section deltas append through panel reducer",
    async run() {
      const { events } = await collectEvents(makeMemory());
      const deltas = events.filter((event) => event.type === "deep_writing_section_delta");
      assert(deltas.length >= 2, "expected deltas");
      const combined = deltas.map((event) => String(event.payload.delta || "")).join("");
      assert(combined.length > String(deltas[0].payload.delta || "").length, "combined deltas should append content");
    }
  },
  {
    name: "section completed marks completed",
    async run() {
      const { events, completed } = await collectEvents(makeMemory());
      const completedEvents = events.filter((event) => event.type === "deep_writing_section_completed");
      assert(completedEvents.length === completed.completedSectionIds.length, "completed events should match completed section ids");
      assert(completed.outline.every((section) => section.status === "completed"), "all sections should be completed");
    }
  },
  {
    name: "multiple sections stream in order",
    async run() {
      const { events } = await collectEvents(makeMemory());
      const startedIds = events.filter((event) => event.type === "deep_writing_section_started").map((event) => event.payload.sectionId);
      assert(startedIds.length >= 4, "should stream multiple sections");
      assert(new Set(startedIds).size === startedIds.length, "section starts should not duplicate");
    }
  },
  {
    name: "completed progress is 100",
    async run() {
      const { events, completed } = await collectEvents(makeMemory());
      const last = events[events.length - 1];
      assert(last.type === "deep_writing_completed", "last event should be completed");
      assert(last.payload.progress === 100, "completed progress should be 100");
      assert(completed.currentStage === "completed", "memory should be completed");
    }
  },
  {
    name: "source text facts enter streamed draft",
    async run() {
      const { events } = await collectEvents(makeMemory({ sourceSummary: sourceText }), sourceText);
      const text = payloadText(events);
      for (const term of ["张三", "李四", "90", "85", "AI 教育测试数据"]) {
        assert(text.includes(term), `streamed draft should include ${term}`);
      }
    }
  },
  {
    name: "same conversation resume skips completed sections",
    async run() {
      const memory = makeMemory({ conversationId: "deep-resume-stream" });
      memory.outline[0].status = "completed";
      memory.outline[0].summary = "第一章已经完成。";
      memory.completedSectionIds = [memory.outline[0].id];
      memory.pendingSectionIds = memory.outline.slice(1).map((section) => section.id);
      memory.currentSectionId = memory.pendingSectionIds[0];
      memory.currentStage = "interrupted";
      const resumed = resumeDeepWritingTaskMemory(memory, "继续刚才的深度报告");
      const { events } = await collectEvents(resumed);
      const startedIds = events.filter((event) => event.type === "deep_writing_section_started").map((event) => event.payload.sectionId);
      assert(!startedIds.includes(memory.outline[0].id), "resume should not restream completed section");
      assert(startedIds[0] === memory.outline[1].id, "resume should start from first pending section");
    }
  },
  {
    name: "new conversation resume asks clarification",
    async run() {
      const result = await executeRuntimeTool(makeDecision(), context("继续刚才的深度报告", "deep-new-stream"));
      assert("validationFailed" in result && result.validationFailed, "new conversation resume should ask clarification");
      assert(result.missingInputs.includes("active_deep_writing_task"), "missingInputs should include active_deep_writing_task");
    }
  },
  {
    name: "ordinary Word still generates docx",
    async run() {
      const result = await executeRuntimeTool(makeDecision(), context("帮我生成一份 Word，主题是 AI 教育培训方案", "deep-normal-docx"));
      assert("resultCard" in result && result.resultCard?.taskType === "word", "ordinary Word should return Word card");
      assert(result.resultCard?.mode !== "deep_writing", "ordinary Word should not enter deep writing");
      assert(result.result.generatedFiles.length === 1, "ordinary Word should generate docx");
    }
  },
  {
    name: "file summary stays out of deep writing",
    run() {
      const plan = planAgentRuntimeTurn({
        messages: [{ role: "user", content: "根据这个文件总结一下" }],
        files: [{ name: "sample.txt", type: "text/plain", size: 120 }],
        pendingTask: null,
        activeTask: null,
        cachedConversationSummary: null,
        tools: { webSearch: false, contentMode: null }
      });
      assert(plan.decision.targetTool === "file-analysis", "file summary should use file-analysis");
    }
  },
  {
    name: "payload excludes unsafe fields",
    async run() {
      const { events } = await collectEvents(makeMemory({ sourceSummary: sourceText }), sourceText);
      const text = payloadText(events);
      for (const term of forbiddenTerms) assert(!text.includes(term), `payload should not include ${term}`);
    }
  },
  {
    name: "draft body excludes unsafe words",
    run() {
      const draft = composeDeepWritingDraft({
        memory: makeMemory({ sourceSummary: sourceText }),
        sourceText,
        conversationSummary: sourceText
      });
      const text = JSON.stringify(draft);
      for (const term of forbiddenBodyTerms) assert(!text.includes(term), `draft should not include ${term}`);
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
    console.error(`Agent deep writing stream checks failed: ${failed}/${checks.length} cases failed.`);
    process.exit(1);
  }

  console.log(`Agent deep writing stream checks passed. ${checks.length}/${checks.length} PASS.`);
}

void main();
