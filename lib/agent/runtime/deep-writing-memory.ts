import { randomUUID } from "node:crypto";

import type { DeepWritingDetection, DeepWritingDocumentKind } from "@/lib/agent/runtime/deep-writing-detector";

export type DeepWritingSectionStatus = "pending" | "writing" | "completed";
export type DeepWritingSearchStatus = "pending" | "skipped" | "completed";
export type DeepWritingTaskStage =
  | "planning"
  | "collecting_sources"
  | "building_outline"
  | "writing_sections"
  | "polishing"
  | "rendering_docx"
  | "completed"
  | "interrupted"
  | "failed";

export type DeepWritingTaskMemory = {
  taskId: string;
  conversationId: string;
  originalInstruction: string;
  topic: string;
  documentKind: DeepWritingDocumentKind;
  sourceFileNames: string[];
  sourceSummary: string;
  searchPlan: {
    keywords: string[];
    questions: string[];
    status: DeepWritingSearchStatus;
  };
  outline: Array<{
    id: string;
    title: string;
    status: DeepWritingSectionStatus;
    summary?: string;
    draft?: string;
  }>;
  currentSectionId?: string;
  completedSectionIds: string[];
  pendingSectionIds: string[];
  adoptedSources: Array<{
    title: string;
    url?: string;
    summary: string;
    usedInSections: string[];
  }>;
  currentStage: DeepWritingTaskStage;
  failureReason?: string;
  resumeInstruction?: string;
  createdAt: string;
  updatedAt: string;
};

export type DeepWritingEventType =
  | "deep_writing_started"
  | "deep_writing_plan"
  | "deep_writing_source_plan"
  | "deep_writing_outline"
  | "deep_writing_section_started"
  | "deep_writing_section_delta"
  | "deep_writing_section_completed"
  | "deep_writing_polishing"
  | "deep_writing_docx_generating"
  | "deep_writing_completed"
  | "deep_writing_interrupted"
  | "deep_writing_failed";

export type DeepWritingPanelState = {
  isOpen: boolean;
  taskId: string;
  title: string;
  currentStage: DeepWritingTaskStage;
  progress: number;
  outline: Array<{
    id: string;
    title: string;
    status: DeepWritingSectionStatus;
    preview?: string;
  }>;
  currentSection?: {
    id: string;
    title: string;
    draft: string;
  };
  sources: Array<{
    title: string;
    summary: string;
    url?: string;
    adopted: boolean;
  }>;
  canResume: boolean;
  downloadUrl?: string;
};

export type DeepWritingTaskMemoryInput = {
  taskId?: string;
  conversationId: string;
  originalInstruction: string;
  topic: string;
  detection: DeepWritingDetection;
  sourceFileNames: string[];
  sourceSummary: string;
};

const unsafePayloadKeys = new Set([
  "prompt",
  "chainOfThought",
  "chain-of-thought",
  "provider",
  "stack",
  "apiKey",
  "api_key",
  "authorization",
  "internalJson",
  "internalJSON",
  "wordTaskMemory",
  "deepWritingTaskMemory",
  "modelReasoning"
]);

function nowIso() {
  return new Date().toISOString();
}

function compact(value?: string, maxLength = 800) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function topicKeywords(topic: string) {
  return compact(topic, 120)
    .split(/[，。；、\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 6);
}

function outlineFor(kind: DeepWritingDocumentKind) {
  const titlesByKind: Record<DeepWritingDocumentKind, string[]> = {
    research: ["研究背景", "资料来源与方法", "核心发现", "趋势分析", "建议与结论"],
    report: ["摘要", "背景", "资料分析", "主要发现", "建议", "结论"],
    plan: ["项目背景", "目标定位", "实施路径", "时间安排", "风险与应对", "预期成果"],
    manual: ["使用对象", "核心内容", "操作流程", "注意事项", "评估与反馈"],
    summary: ["总体概述", "关键要点", "分类整理", "后续建议"],
    general: ["文档概述", "背景与目标", "主要内容", "使用建议"]
  };
  return titlesByKind[kind].map((title, index) => ({
    id: `section-${index + 1}`,
    title,
    status: "pending" as const,
    summary: ""
  }));
}

function sourceQuestions(kind: DeepWritingDocumentKind, topic: string) {
  const base = [`${topic}的背景是什么？`, `${topic}有哪些关键信息和证据？`, `${topic}可以形成哪些建议？`];
  if (kind === "research") return [...base, `${topic}有哪些趋势和争议？`];
  if (kind === "plan") return [...base, `${topic}如何落地执行？`];
  if (kind === "manual") return [...base, `${topic}的操作步骤是什么？`];
  return base;
}

export function createDeepWritingTaskMemory(input: DeepWritingTaskMemoryInput): DeepWritingTaskMemory {
  const timestamp = nowIso();
  const topic = compact(input.topic || input.originalInstruction, 160) || "深度写作文档";
  const outline = outlineFor(input.detection.suggestedDocumentKind);
  return {
    taskId: input.taskId || randomUUID(),
    conversationId: input.conversationId,
    originalInstruction: compact(input.originalInstruction, 600),
    topic,
    documentKind: input.detection.suggestedDocumentKind,
    sourceFileNames: input.sourceFileNames.filter(Boolean).slice(0, 20),
    sourceSummary: compact(input.sourceSummary, 1200),
    searchPlan: {
      keywords: topicKeywords(topic),
      questions: sourceQuestions(input.detection.suggestedDocumentKind, topic),
      status: /搜集资料|检索资料|调研|研究|行业分析|白皮书/.test(input.originalInstruction) ? "pending" : "skipped"
    },
    outline,
    completedSectionIds: [],
    pendingSectionIds: outline.map((item) => item.id),
    adoptedSources: input.sourceSummary
      ? [
          {
            title: input.sourceFileNames[0] || "当前对话资料",
            summary: compact(input.sourceSummary, 300),
            usedInSections: []
          }
        ]
      : [],
    currentStage: "building_outline",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function isDeepWritingResumeRequest(text: string) {
  return /继续刚才的深度报告|继续刚才的深度写作|继续那个调研文档|继续.*深度|继续.*调研文档/i.test(text);
}

export function resumeDeepWritingTaskMemory(memory: DeepWritingTaskMemory, resumeInstruction: string): DeepWritingTaskMemory {
  const stage: DeepWritingTaskStage =
    memory.currentStage === "failed" || memory.currentStage === "interrupted" || memory.currentStage === "writing_sections"
      ? "writing_sections"
      : memory.currentStage === "completed"
        ? "writing_sections"
        : memory.currentStage;
  return {
    ...memory,
    currentStage: stage,
    resumeInstruction: compact(resumeInstruction, 400),
    updatedAt: nowIso()
  };
}

export function sanitizeDeepWritingEventPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (unsafePayloadKeys.has(key)) continue;
    if (Array.isArray(value)) {
      result[key] = value.map((item) => (typeof item === "object" && item ? sanitizeDeepWritingEventPayload(item as Record<string, unknown>) : item));
      continue;
    }
    if (typeof value === "object" && value) {
      result[key] = sanitizeDeepWritingEventPayload(value as Record<string, unknown>);
      continue;
    }
    result[key] = value;
  }
  return result;
}

export function createDeepWritingEvent(type: DeepWritingEventType, payload: Record<string, unknown>) {
  return {
    type,
    payload: sanitizeDeepWritingEventPayload(payload)
  };
}

export function createDeepWritingPanelState(memory: DeepWritingTaskMemory, downloadUrl?: string): DeepWritingPanelState {
  const completed = memory.completedSectionIds.length;
  const total = Math.max(memory.outline.length, 1);
  const current = memory.outline.find((item) => item.id === memory.currentSectionId);
  return {
    isOpen: true,
    taskId: memory.taskId,
    title: memory.topic,
    currentStage: memory.currentStage,
    progress: Math.min(100, Math.round((completed / total) * 100)),
    outline: memory.outline.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      preview: item.summary || item.draft?.slice(0, 120)
    })),
    currentSection: current
      ? {
          id: current.id,
          title: current.title,
          draft: current.draft || ""
        }
      : undefined,
    sources: memory.adoptedSources.map((item) => ({
      title: item.title,
      summary: item.summary,
      url: item.url,
      adopted: item.usedInSections.length > 0
    })),
    canResume: memory.currentStage !== "completed",
    downloadUrl
  };
}
