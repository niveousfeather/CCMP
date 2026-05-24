import type { AgentRuntimeDecision, AgentRuntimeTargetTool } from "@/lib/agent/runtime/types";
import type { AgentRunResult, AgentToolSelection } from "@/lib/agent/types";

export type AgentActiveTaskKind = "image" | "teaching-diagram" | "ppt" | "word" | "excel" | "file-analysis" | "knowledge-graph";

export type AgentActiveTask = {
  id: string;
  kind: AgentActiveTaskKind;
  title?: string;
  status?: string;
  source: "conversation";
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
  tools?: AgentToolSelection;
  signal: AbortSignal;
  timeoutMs?: number;
  activeTask?: AgentActiveTask | null;
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
