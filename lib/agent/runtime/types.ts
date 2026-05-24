import type { AgentChatMessage, AgentTask, AgentToolSelection } from "@/lib/agent/types";

export type AgentRuntimeIntent =
  | "general_chat"
  | "file_analysis"
  | "word"
  | "excel"
  | "ppt_simple"
  | "academic_ppt"
  | "image"
  | "teaching_diagram"
  | "knowledge_graph";

export type AgentRuntimeTargetTool =
  | "none"
  | "file-analysis"
  | "word"
  | "excel"
  | "ppt-simple"
  | "academic-ppt"
  | "image"
  | "teaching-diagram"
  | "knowledge-graph";

export type AgentRuntimeFileSummary = {
  count: number;
  names: string[];
  kinds: string[];
};

export type AgentRuntimeAttachmentSummary = {
  name: string;
  kind: string;
  sizeBytes?: number;
  summary: string;
};

export type AgentRuntimeActiveTaskSummary = {
  id: string;
  kind: string;
  title?: string;
  status?: string;
};

export type AgentRuntimeTokenBudgetHint = {
  mode: "minimal" | "standard" | "file_summary" | "tool_execution";
  maxRecentMessages: number;
  maxAttachmentChars: number;
  reason: string;
};

export type AgentRuntimeContextPack = {
  latestUserMessage: string;
  recentSummary: string;
  attachmentSummaries: AgentRuntimeAttachmentSummary[];
  activeTask: AgentRuntimeActiveTaskSummary | null;
  sessionPreferences: string[];
  selectedSkills: string[];
  tokenBudgetHint: AgentRuntimeTokenBudgetHint;
};

export type AgentConversationMemory = {
  conversationSummary: string;
  currentUploadedFiles: AgentRuntimeFileSummary;
  currentTaskStatus: "idle" | "clarifying" | "queued" | "executing";
  userPreferences: string[];
};

export type AgentSkillId =
  | "file-analysis"
  | "word"
  | "excel"
  | "ppt-simple"
  | "academic-ppt"
  | "image"
  | "teaching-diagram"
  | "knowledge-graph";

export type AgentSkillMatch = {
  skillId: AgentSkillId | null;
  confidence: number;
  reasons: string[];
};

export type AgentSkillSelection = {
  selected: AgentSkillMatch;
  candidates: AgentSkillMatch[];
};

export type AgentExecutionGate = {
  needsTool: boolean;
  needsConfirmation: boolean;
  missingInputs: string[];
  allowed: boolean;
  reasons: string[];
};

export type AgentRuntimeStage =
  | "analyzing_context"
  | "planning_intent"
  | "selecting_skill"
  | "checking_execution_gate"
  | "calling_model"
  | "calling_tool"
  | "completed";

export type AgentRuntimeNextAction = "answer_chat" | "ask_clarification" | "run_legacy_tool";

export type AgentRuntimeDecision = {
  intent: AgentRuntimeIntent;
  targetTool: AgentRuntimeTargetTool;
  confidence: number;
  needsTool: boolean;
  needsConfirmation: boolean;
  missingInputs: string[];
  activeTaskId: string | null;
  nextAction: AgentRuntimeNextAction;
  progressStages: AgentRuntimeStage[];
  clarificationQuestion?: string;
};

export type AgentRuntimeTrace = {
  version: "agent-runtime-v2.phase5";
  memory: AgentConversationMemory;
  contextPack: AgentRuntimeContextPack;
  skillSelection: AgentSkillSelection;
  gate: AgentExecutionGate;
  legacyTask: AgentTask;
};

export type AgentRuntimePlan = {
  decision: AgentRuntimeDecision;
  trace: AgentRuntimeTrace;
};

export type AgentRuntimeInput = {
  messages: AgentChatMessage[];
  files?: Array<{ name: string; type?: string; size?: number }>;
  pendingTask?: AgentTask | null;
  activeTask?: AgentRuntimeActiveTaskSummary | null;
  cachedConversationSummary?: string | null;
  tools?: AgentToolSelection;
};
