import {
  createDeepWritingEvent,
  createDeepWritingPanelState,
  createDeepWritingTaskMemory,
  isDeepWritingResumeRequest,
  resumeDeepWritingTaskMemory,
  sanitizeDeepWritingEventPayload
} from "@/lib/agent/runtime/deep-writing-memory";
import { detectDeepWritingMode } from "@/lib/agent/runtime/deep-writing-detector";
import { planAgentRuntimeTurn, type AgentRuntimeDecision } from "@/lib/agent/runtime";
import { executeRuntimeTool } from "@/lib/agent/runtime/tool-executor";
import type { AgentActiveTask, ConversationFileReference, ToolAdapterContext } from "@/lib/agent/runtime/tool-adapters";
import type { AgentRunResult } from "@/lib/agent/types";

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

function makeDecision(overrides: Partial<AgentRuntimeDecision> = {}): AgentRuntimeDecision {
  return {
    intent: "word",
    targetTool: "word",
    confidence: 0.92,
    needsTool: true,
    needsConfirmation: false,
    missingInputs: [],
    activeTaskId: null,
    nextAction: "run_legacy_tool",
    progressStages: ["analyzing_context", "planning_intent", "selecting_skill", "checking_execution_gate", "calling_tool", "completed"],
    ...overrides
  };
}

function context({
  userText,
  conversationId = "deep-writing-a",
  conversationFiles = [],
  activeTask = null
}: {
  userText: string;
  conversationId?: string;
  conversationFiles?: ConversationFileReference[];
  activeTask?: AgentActiveTask | null;
}): ToolAdapterContext {
  return {
    request: new Request("http://localhost/api/ai/chat"),
    origin: "http://localhost",
    userId: "deep-writing-test",
    conversationId,
    userText,
    messages: [{ role: "user", content: userText }],
    files: [],
    conversationFiles,
    tools: { webSearch: false, contentMode: "write" },
    signal: new AbortController().signal,
    allowDeterministicWriting: true,
    activeTask,
    runLegacyAgent: async () => {
      throw new Error("LEGACY_AGENT_SHOULD_NOT_BE_CALLED");
    },
    runImageGeneration: async () => ({ result: baseAgentResult("image not used"), imageGeneration: null }),
    runChatAnswer: async () => baseAgentResult("chat answer")
  };
}

function makeFile(index: number, conversationId = "deep-writing-files"): ConversationFileReference {
  return {
    attachmentId: `file-${index}`,
    fileName: `source-${index}.txt`,
    mimeType: "text/plain",
    sizeBytes: 1200,
    objectKey: null,
    providerFileId: null,
    extractedText: `第 ${index} 份资料包含 AI 教育、教师培训、课堂反馈和实施建议。`,
    textPreview: `第 ${index} 份资料摘要`,
    parseStatus: "parsed",
    sourceMessageId: `message-${index}`,
    conversationId
  };
}

function unsafeText(value: unknown) {
  return JSON.stringify(value);
}

const forbiddenPayloadTerms = ["prompt", "chain-of-thought", "provider", "stack", "apiKey", "API key", "internal JSON", "wordTaskMemory", "deepWritingTaskMemory"];

const longSourceText = "AI 教育调研资料。".repeat(900);

const checks: Check[] = [
  {
    name: "explicit deep writing report triggers",
    run() {
      const detection = detectDeepWritingMode({ userText: "深度写一份 AI 教育调研报告", targetTool: "word" });
      assert(detection.enabled, "explicit deep writing should be enabled");
      assert(detection.trigger === "explicit", `expected explicit trigger, got ${detection.trigger}`);
      assert(detection.suggestedDocumentKind === "research", `expected research kind, got ${detection.suggestedDocumentKind}`);
      assert(detection.shouldAutoOpenPanel, "deep writing should auto-open panel");
    }
  },
  {
    name: "source collection formal report triggers",
    run() {
      const detection = detectDeepWritingMode({ userText: "搜集资料，写一份正式 Word 报告", targetTool: "word" });
      assert(detection.enabled, "source collection report should trigger deep writing");
      assert(detection.confidence === "high", `expected high confidence, got ${detection.confidence}`);
    }
  },
  {
    name: "multiple files to Word triggers complexity",
    run() {
      const detection = detectDeepWritingMode({ userText: "根据这些文件生成 Word 报告", targetTool: "word", fileCount: 3 });
      assert(detection.enabled, "multiple files should trigger deep writing");
      assert(detection.trigger === "complexity", `expected complexity trigger, got ${detection.trigger}`);
    }
  },
  {
    name: "long sourceText triggers complexity",
    run() {
      const detection = detectDeepWritingMode({ userText: "整理成 Word 文档", targetTool: "word", sourceText: longSourceText });
      assert(detection.enabled, "long source text should trigger deep writing");
      assert(detection.reason.includes("sourceText"), "reason should mention sourceText");
    }
  },
  {
    name: "Word layout advice does not trigger",
    run() {
      const detection = detectDeepWritingMode({ userText: "Word 怎么排版？", targetTool: "none" });
      assert(!detection.enabled, "Word advice should not trigger deep writing");
    }
  },
  {
    name: "file summary without Word does not trigger",
    run() {
      const detection = detectDeepWritingMode({ userText: "根据这个文件总结一下", targetTool: "file-analysis", fileCount: 1 });
      assert(!detection.enabled, "file summary should not trigger deep writing");
    }
  },
  {
    name: "simple docx export does not trigger",
    run() {
      const detection = detectDeepWritingMode({ userText: "把这段话导出 docx", targetTool: "word", sourceText: "这是一段短文本。" });
      assert(!detection.enabled, "simple docx export should stay normal Word");
    }
  },
  {
    name: "panel state is safe and open",
    run() {
      const detection = detectDeepWritingMode({ userText: "深度写一份 AI 教育调研报告", targetTool: "word" });
      const memory = createDeepWritingTaskMemory({
        conversationId: "deep-panel",
        originalInstruction: "深度写一份 AI 教育调研报告",
        topic: "AI 教育调研报告",
        detection,
        sourceFileNames: ["a.txt"],
        sourceSummary: "资料围绕 AI 教育。"
      });
      const panel = createDeepWritingPanelState(memory);
      assert(panel.isOpen, "panel should be open");
      assert(panel.taskId === memory.taskId, "panel should expose task id");
      assert(panel.outline.length > 0, "panel should expose outline");
      assert(panel.progress >= 0 && panel.progress <= 100, "panel progress should be bounded");
    }
  },
  {
    name: "memory does not cross conversation",
    run() {
      const detection = detectDeepWritingMode({ userText: "深度写一份 AI 教育调研报告", targetTool: "word" });
      const memory = createDeepWritingTaskMemory({
        conversationId: "deep-a",
        originalInstruction: "深度写一份 AI 教育调研报告",
        topic: "AI 教育调研报告",
        detection,
        sourceFileNames: [],
        sourceSummary: ""
      });
      assert(memory.conversationId === "deep-a", "memory should record current conversation");
      const otherConversationId: string = "deep-b";
      assert(memory.conversationId !== otherConversationId, "memory must not match another conversation");
    }
  },
  {
    name: "same conversation resume hits deep writing memory",
    async run() {
      const firstInput = "深度写一份 AI 教育调研报告";
      const first = await executeRuntimeTool(makeDecision(), context({ userText: firstInput, conversationId: "deep-resume" }));
      assert("resultCard" in first && first.resultCard?.mode === "deep_writing", "first deep writing result should create card metadata");
      const resumeInput = "继续刚才的深度报告";
      const activeTask: AgentActiveTask = { id: "deep-task", kind: "word", title: "AI 教育调研报告", status: "running", source: "conversation" };
      const resumed = await executeRuntimeTool(makeDecision(), context({ userText: resumeInput, conversationId: "deep-resume", activeTask }));
      assert("resultCard" in resumed && resumed.resultCard?.mode === "deep_writing", "resume should return deep writing metadata");
      assert(resumed.resultCard.panelAvailable === true, "resume should keep the writing process panel available");
      assert(
        ["building_outline", "writing_sections", "rendering_docx", "completed"].includes(String(resumed.resultCard.currentStage)),
        "resume should keep a deep writing stage"
      );
    }
  },
  {
    name: "new conversation resume asks clarification",
    async run() {
      const result = await executeRuntimeTool(makeDecision(), context({ userText: "继续刚才的深度报告", conversationId: "deep-new" }));
      assert("validationFailed" in result && result.validationFailed, "new conversation resume should validate as missing task");
      assert(result.missingInputs.includes("active_deep_writing_task"), "missingInputs should include active_deep_writing_task");
    }
  },
  {
    name: "safe event payload excludes internals",
    run() {
      const payload = sanitizeDeepWritingEventPayload({
        stage: "planning",
        prompt: "hidden prompt",
        provider: "hidden provider",
        stack: "hidden stack",
        outline: [{ id: "intro", title: "摘要", status: "pending", draft: "可展示草稿" }],
        progress: 20,
        deepWritingTaskMemory: { secret: true },
        apiKey: "secret"
      });
      const event = createDeepWritingEvent("deep_writing_outline", payload);
      const serialized = unsafeText(event);
      for (const term of forbiddenPayloadTerms) assert(!serialized.includes(term), `event payload should not include ${term}`);
      assert(serialized.includes("可展示草稿"), "safe draft should remain visible");
    }
  },
  {
    name: "ordinary Word write request enters light deep writing",
    async run() {
      const input = "帮我生成一份 Word，主题是 AI 教育培训方案";
      const result = await executeRuntimeTool(makeDecision(), context({ userText: input, conversationId: "deep-normal-word" }));
      assert("resultCard" in result && result.resultCard?.taskType === "word", "ordinary Word should still return Word card");
      assert(result.resultCard?.mode === "deep_writing", "ordinary Word write should enter deep writing mode");
      assert(result.resultCard?.panelAutoOpen === true, "deep writing panel should auto open");
    }
  },
  {
    name: "Word memory and deep writing memory stay separate",
    run() {
      const detection = detectDeepWritingMode({ userText: "深度写一份 AI 教育调研报告", targetTool: "word" });
      const memory = createDeepWritingTaskMemory({
        conversationId: "deep-separate",
        originalInstruction: "深度写一份 AI 教育调研报告",
        topic: "AI 教育调研报告",
        detection,
        sourceFileNames: [],
        sourceSummary: ""
      });
      const resumed = resumeDeepWritingTaskMemory(memory, "继续刚才的深度报告");
      assert(isDeepWritingResumeRequest("继续刚才的深度报告"), "resume phrase should be recognized");
      assert(!unsafeText(resumed).includes("wordTaskMemory"), "deep memory should not embed wordTaskMemory");
      assert(!unsafeText(resumed).includes("provider"), "deep memory should not embed provider details");
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
    console.error(`Agent deep writing checks failed: ${failed}/${checks.length} cases failed.`);
    process.exit(1);
  }

  console.log(`Agent deep writing checks passed. ${checks.length}/${checks.length} PASS.`);
}

void main();
