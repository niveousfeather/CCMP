import type { WordPlan, WordRequest, WordTaskMemory, WordTaskStage } from "./types";

const INTERNAL_ERROR_TERMS = /api[_-]?key|token|secret|password|authorization|provider|runtime[_-]?trace|stack/i;

function nowIso() {
  return new Date().toISOString();
}

function compact(value?: string, maxLength = 500) {
  return (value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function collectSourceText(request: WordRequest) {
  return [
    request.sourceText || "",
    request.conversationSummary || "",
    ...(request.sourceFiles || []).map((file) => file.text || "")
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function safeFailureReason(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "");
  const cleaned = compact(raw, 240);
  if (!cleaned || INTERNAL_ERROR_TERMS.test(cleaned)) {
    return "Word 文档生成失败，请补充更明确的内容后重试。";
  }
  return cleaned;
}

export class WordTaskMemoryError extends Error {
  wordTaskMemory: WordTaskMemory;

  constructor(message: string, wordTaskMemory: WordTaskMemory) {
    super(message);
    this.name = "WordTaskMemoryError";
    this.wordTaskMemory = wordTaskMemory;
  }
}

export function createWordTaskMemory(request: WordRequest, stage: WordTaskStage = "planning"): WordTaskMemory {
  const timestamp = nowIso();
  const sourceText = collectSourceText(request);
  const resumeInstruction = compact(request.resumeInstruction);

  return {
    taskId: request.taskId,
    conversationId: request.conversationId || request.resumeFromMemory?.conversationId || "current-conversation",
    originalInstruction: compact(request.resumeFromMemory?.originalInstruction || request.instruction),
    title: compact(request.title, 120) || "Word 文档",
    sourceFileNames: (request.sourceFiles || []).map((file) => file.fileName).filter(Boolean),
    sourceSummary: compact(sourceText || request.resumeFromMemory?.sourceSummary || request.instruction, 800),
    plan: request.resumeFromMemory?.plan || null,
    completedSections: [],
    pendingSections: request.resumeFromMemory?.pendingSections || [],
    currentStage: stage,
    resumeInstruction: resumeInstruction || request.resumeFromMemory?.resumeInstruction,
    createdAt: request.resumeFromMemory?.createdAt || timestamp,
    updatedAt: timestamp
  };
}

export function updateWordTaskMemory(
  memory: WordTaskMemory,
  patch: Partial<Omit<WordTaskMemory, "createdAt">> & { currentStage?: WordTaskStage }
): WordTaskMemory {
  return {
    ...memory,
    ...patch,
    updatedAt: nowIso()
  };
}

export function attachPlanToWordTaskMemory(memory: WordTaskMemory, plan: WordPlan): WordTaskMemory {
  return updateWordTaskMemory(memory, {
    currentStage: "generating_content",
    plan,
    pendingSections: plan.sections.map((section) => section.heading),
    completedSections: []
  });
}

export function completeWordTaskMemory(memory: WordTaskMemory, plan: WordPlan): WordTaskMemory {
  return updateWordTaskMemory(memory, {
    currentStage: "completed",
    plan,
    completedSections: plan.sections.map((section) => section.heading),
    pendingSections: []
  });
}

export function failWordTaskMemory(memory: WordTaskMemory, error: unknown): WordTaskMemory {
  return updateWordTaskMemory(memory, {
    currentStage: "failed",
    failureReason: safeFailureReason(error)
  });
}

export function resumeWordRequestFromMemory(memory: WordTaskMemory, resumeInstruction: string): WordRequest {
  return {
    conversationId: memory.conversationId,
    taskId: memory.taskId,
    title: memory.title,
    instruction: resumeInstruction,
    sourceText: memory.sourceSummary,
    outputFileName: memory.title,
    stylePreset: memory.plan?.metadata.stylePreset || "professional",
    language: memory.plan?.metadata.language || "zh-CN",
    resumeFromMemory: memory,
    resumeInstruction
  };
}

export function throwWordTaskMemoryError(error: unknown, memory: WordTaskMemory): never {
  const failedMemory = failWordTaskMemory(memory, error);
  throw new WordTaskMemoryError(failedMemory.failureReason || "Word 文档生成失败。", failedMemory);
}
