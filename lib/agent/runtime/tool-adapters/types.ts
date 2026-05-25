import type { AgentRuntimeDecision, AgentRuntimeTargetTool } from "@/lib/agent/runtime/types";
import type { AgentRunResult, AgentToolSelection } from "@/lib/agent/types";
import type { DeepWritingPanelState, DeepWritingTaskMemory, DeepWritingTaskStage } from "@/lib/agent/runtime/deep-writing-memory";
import type { SafeDeepWritingEvent } from "@/lib/agent/runtime/deep-writing-runner";
import type { WordTaskMemory } from "@/lib/word-engine";

export type AgentActiveTaskKind = "image" | "teaching-diagram" | "ppt" | "word" | "excel" | "file-analysis" | "knowledge-graph";

export type AgentActiveTask = {
  id: string;
  kind: AgentActiveTaskKind;
  title?: string;
  status?: string;
  source: "conversation";
};

export type ConversationFileReference = {
  attachmentId: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  objectKey?: string | null;
  providerFileId?: string | null;
  extractedText?: string | null;
  textPreview?: string | null;
  parseStatus: "parsed" | "partial" | "failed";
  sourceMessageId?: string | null;
  conversationId: string;
};

export type ToolAdapterValidationResult =
  | { ok: true }
  | {
      ok: false;
      missingInputs: string[];
      message: string;
    };

export type ToolAdapterResultCard = {
  title: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  taskType?: AgentActiveTaskKind | "ppt" | "word" | "excel";
  taskId?: string;
  downloadUrl?: string | null;
  openUrl?: string | null;
  retryable?: boolean;
  failureReason?: string | null;
  wordTaskMemory?: WordTaskMemory | null;
  mode?: "deep_writing";
  deepWritingTaskId?: string;
  panelAvailable?: boolean;
  panelAutoOpen?: boolean;
  currentStage?: DeepWritingTaskStage;
  documentReady?: boolean;
  deepWritingTaskMemory?: DeepWritingTaskMemory | null;
  deepWritingPanelState?: DeepWritingPanelState | null;
};

export type ToolAdapterExecutionResult = {
  result: AgentRunResult;
  resultCard?: ToolAdapterResultCard;
  runtimeMode: "adapter" | "legacy-fallback";
  imageGeneration?: unknown | null;
};

export type ToolAdapterContext = {
  request: Request;
  origin: string;
  userId: string;
  conversationId: string;
  userText: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  files: File[];
  conversationFiles?: ConversationFileReference[];
  tools?: AgentToolSelection;
  signal: AbortSignal;
  timeoutMs?: number;
  activeTask?: AgentActiveTask | null;
  wordTaskMemory?: WordTaskMemory | null;
  deepWritingTaskMemory?: DeepWritingTaskMemory | null;
  emitDeepWritingEvent?: (event: SafeDeepWritingEvent) => Promise<void> | void;
  runLegacyAgent: () => Promise<AgentRunResult>;
  runImageGeneration: () => Promise<{ result: AgentRunResult; imageGeneration: unknown | null }>;
  runChatAnswer: () => Promise<AgentRunResult>;
};

export type ToolAdapter = {
  id: string;
  targetTool: AgentRuntimeTargetTool;
  canHandle: (decision: AgentRuntimeDecision, context: ToolAdapterContext) => boolean;
  validateInputs: (decision: AgentRuntimeDecision, context: ToolAdapterContext) => Promise<ToolAdapterValidationResult> | ToolAdapterValidationResult;
  execute: (decision: AgentRuntimeDecision, context: ToolAdapterContext) => Promise<ToolAdapterExecutionResult>;
  getResultCard: (result: ToolAdapterExecutionResult) => ToolAdapterResultCard | null;
  failureToUserMessage: (error: unknown) => string;
};
