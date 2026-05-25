import { detectDeepWritingMode } from "@/lib/agent/runtime/deep-writing-detector";
import {
  createDeepWritingTaskMemory,
  resumeDeepWritingTaskMemory,
  type DeepWritingTaskMemory
} from "@/lib/agent/runtime/deep-writing-memory";
import {
  createNotConfiguredSearchProvider,
  type DeepWritingSearchProvider,
  type DeepWritingSearchResult
} from "@/lib/agent/runtime/deep-writing-search-provider";
import { runDeepWritingDraft, type SafeDeepWritingEvent } from "@/lib/agent/runtime/deep-writing-runner";
import { composeDeepWritingDraft } from "@/lib/word-engine/compose-deep-writing-draft";
import { reduceDeepWritingPanelEvent, createInitialDeepWritingClientState } from "@/components/chat/deep-writing-panel-state";
import { executeRuntimeTool } from "@/lib/agent/runtime/tool-executor";
import type { AgentRuntimeDecision } from "@/lib/agent/runtime";
import type { ToolAdapterContext } from "@/lib/agent/runtime/tool-adapters";
import type { AgentRunResult } from "@/lib/agent/types";

type Check = {
  name: string;
  run: () => Promise<void> | void;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeMemory({
  conversationId = "deep-source",
  instruction = "深度写一份 AI 教育调研报告",
  sourceSummary = ""
}: {
  conversationId?: string;
  instruction?: string;
  sourceSummary?: string;
} = {}): DeepWritingTaskMemory {
  const detection = detectDeepWritingMode({ userText: instruction, targetTool: "word", sourceText: sourceSummary });
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

function fakeProvider(results: DeepWritingSearchResult[], calls: string[] = []): DeepWritingSearchProvider {
  return {
    async search(input) {
      calls.push(input.topic);
      return results;
    }
  };
}

function internalResult(overrides: Partial<DeepWritingSearchResult> = {}): DeepWritingSearchResult {
  return {
    id: "internal-1",
    title: "AI 教育发展资料",
    url: "https://example.com/ai-education",
    sourceType: "internal_search",
    snippet: "AI 教育正在影响教师培训与课堂反馈。",
    summary: "资料显示，AI 教育应用覆盖备课、课堂互动、作业反馈和教师培训。",
    relevance: "high",
    adopted: true,
    ...overrides
  };
}

async function collect(memory: DeepWritingTaskMemory, options: { sourceText?: string; conversationSummary?: string; provider?: DeepWritingSearchProvider } = {}) {
  const events: SafeDeepWritingEvent[] = [];
  const completed = await runDeepWritingDraft({
    memory,
    sourceText: options.sourceText,
    conversationSummary: options.conversationSummary,
    searchProvider: options.provider,
    emit: (event) => {
      events.push(event);
    }
  });
  return { events, completed };
}

function payloadText(value: unknown) {
  return JSON.stringify(value);
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

function makeDecision(): AgentRuntimeDecision {
  return {
    intent: "word",
    targetTool: "word",
    confidence: 0.92,
    needsTool: true,
    needsConfirmation: false,
    missingInputs: [],
    activeTaskId: null,
    nextAction: "run_legacy_tool",
    progressStages: ["analyzing_context", "planning_intent", "selecting_skill", "checking_execution_gate", "calling_tool", "completed"]
  };
}

function context(userText: string, conversationId: string): ToolAdapterContext {
  return {
    request: new Request("http://localhost/api/ai/chat"),
    origin: "http://localhost",
    userId: "deep-source-test",
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
    runImageGeneration: async () => ({ result: baseResult("unused"), imageGeneration: null }),
    runChatAnswer: async () => baseResult("unused")
  };
}

const sourceText = "姓名,成绩\n张三,90\n李四,85\n说明：这是 AI 教育测试数据";
const forbiddenPayloadTerms = ["prompt", "provider", "stack", "apiKey", "rawHtml", "internalJSON", "rawMemory"];

const checks: Check[] = [
  {
    name: "deep writing creates searchPlan keywords",
    run() {
      const memory = makeMemory();
      assert(memory.searchPlan.keywords.length > 0, "searchPlan should include keywords");
    }
  },
  {
    name: "source_plan appears before outline",
    async run() {
      const { events } = await collect(makeMemory());
      const sourcePlanIndex = events.findIndex((event) => event.type === "deep_writing_source_plan");
      const outlineIndex = events.findIndex((event) => event.type === "deep_writing_outline");
      assert(sourcePlanIndex >= 0, "source_plan should be emitted");
      assert(outlineIndex > sourcePlanIndex, "outline should appear after source_plan");
    }
  },
  {
    name: "sourceText becomes uploaded_file source",
    async run() {
      const { completed } = await collect(makeMemory({ sourceSummary: sourceText }), { sourceText });
      assert(completed.adoptedSources.some((source) => source.sourceType === "uploaded_file"), "uploaded_file source should be adopted");
    }
  },
  {
    name: "conversationSummary becomes conversation source",
    async run() {
      const { completed } = await collect(makeMemory(), { conversationSummary: "对话总结包含 AI 教育培训目标和课堂反馈。" });
      assert(completed.adoptedSources.some((source) => source.sourceType === "conversation"), "conversation source should be adopted");
    }
  },
  {
    name: "available provider returns internal_search sources",
    async run() {
      const { completed } = await collect(makeMemory(), { provider: fakeProvider([internalResult()]) });
      assert(completed.adoptedSources.some((source) => source.sourceType === "internal_search"), "internal_search source should be adopted");
    }
  },
  {
    name: "unavailable provider skips without blocking writing",
    async run() {
      const { events, completed } = await collect(makeMemory(), { provider: createNotConfiguredSearchProvider() });
      assert(completed.searchPlan.status === "skipped", "search status should be skipped");
      assert(completed.currentStage === "completed", "writing should continue to completion");
      assert(events.some((event) => event.type === "deep_writing_source"), "source fallback event should be emitted");
    }
  },
  {
    name: "adoptedSources are written into memory",
    async run() {
      const { completed } = await collect(makeMemory({ sourceSummary: sourceText }), {
        sourceText,
        provider: fakeProvider([internalResult()])
      });
      assert(completed.adoptedSources.length >= 2, "memory should contain adopted sources");
    }
  },
  {
    name: "duplicate sources are deduped",
    async run() {
      const duplicate = internalResult({ id: "dup", title: "重复资料", url: "https://example.com/dup", summary: "同一资料摘要。" });
      const { completed } = await collect(makeMemory(), { provider: fakeProvider([duplicate, duplicate]) });
      const matching = completed.adoptedSources.filter((source) => source.title === "重复资料");
      assert(matching.length === 1, "duplicate source should be deduped");
    }
  },
  {
    name: "empty title or summary sources are not adopted",
    async run() {
      const { completed } = await collect(makeMemory(), {
        provider: fakeProvider([
          internalResult({ id: "bad-title", title: "", summary: "有效摘要但无标题。" }),
          internalResult({ id: "bad-summary", title: "无摘要资料", summary: "" })
        ])
      });
      assert(!completed.adoptedSources.some((source) => source.title === "无摘要资料"), "empty summary should not be adopted");
      assert(!completed.adoptedSources.some((source) => !source.title), "empty title should not be adopted");
    }
  },
  {
    name: "adoptedSources enter draft text",
    async run() {
      const { completed } = await collect(makeMemory(), { provider: fakeProvider([internalResult()]) });
      const draft = composeDeepWritingDraft({ memory: completed, adoptedSources: completed.adoptedSources });
      assert(payloadText(draft).includes("作业反馈"), "draft should include adopted source summary");
    }
  },
  {
    name: "resume with completed search does not search again",
    async run() {
      const calls: string[] = [];
      const first = await collect(makeMemory({ conversationId: "resume-source" }), { provider: fakeProvider([internalResult()], calls) });
      const resumed = resumeDeepWritingTaskMemory(first.completed, "继续刚才的深度报告");
      await collect(resumed, { provider: fakeProvider([internalResult({ id: "new" })], calls) });
      assert(calls.length === 1, `provider should be called once, got ${calls.length}`);
    }
  },
  {
    name: "new conversation does not inherit adoptedSources",
    async run() {
      const first = await collect(makeMemory({ conversationId: "source-a" }), { provider: fakeProvider([internalResult()]) });
      const second = makeMemory({ conversationId: "source-b" });
      assert(first.completed.conversationId !== second.conversationId, "conversations should differ");
      assert(second.adoptedSources.length === 0, "new memory should not inherit sources");
    }
  },
  {
    name: "source payload excludes unsafe fields",
    async run() {
      const { events } = await collect(makeMemory(), {
        provider: fakeProvider([
          internalResult({
            rawHtml: "<html>hidden</html>",
            prompt: "hidden",
            provider: "hidden",
            stack: "hidden",
            apiKey: "hidden",
            internalJSON: { hidden: true }
          } as Partial<DeepWritingSearchResult>)
        ])
      });
      const text = payloadText(events);
      for (const term of forbiddenPayloadTerms) assert(!text.includes(term), `payload should not include ${term}`);
    }
  },
  {
    name: "panel sources expose only safe fields",
    async run() {
      const { events } = await collect(makeMemory(), { provider: fakeProvider([internalResult()]) });
      let state = createInitialDeepWritingClientState();
      for (const event of events) state = reduceDeepWritingPanelEvent(state, { type: event.type, payload: event.payload });
      const source = state.panelState?.sources[0];
      assert(source?.title && source.summary, "panel should show title and summary");
      assert(!payloadText(state).includes("rawHtml"), "panel state should not include raw html");
    }
  },
  {
    name: "ordinary Word does not collect deep writing sources",
    async run() {
      const result = await executeRuntimeTool(makeDecision(), context("帮我生成一份 Word，主题是 AI 教育培训方案", "ordinary-source"));
      assert("resultCard" in result && result.resultCard?.mode !== "deep_writing", "ordinary Word should not enter deep writing");
    }
  },
  {
    name: "file summary does not trigger deep writing source collection",
    run() {
      const detection = detectDeepWritingMode({ userText: "根据这个文件总结一下", targetTool: "file-analysis", sourceText });
      assert(!detection.enabled, "file summary should not trigger deep writing");
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
    console.error(`Agent deep writing source checks failed: ${failed}/${checks.length} cases failed.`);
    process.exit(1);
  }

  console.log(`Agent deep writing source checks passed. ${checks.length}/${checks.length} PASS.`);
}

void main();
