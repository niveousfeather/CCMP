import type { AgentRuntimeDecision } from "@/lib/agent/runtime/types";

export function serializeAgentRuntimeDecision(decision: AgentRuntimeDecision) {
  return {
    intent: decision.intent,
    targetTool: decision.targetTool,
    confidence: Number(decision.confidence.toFixed(2)),
    needsTool: decision.needsTool,
    needsConfirmation: decision.needsConfirmation,
    missingInputs: decision.missingInputs,
    activeTaskId: decision.activeTaskId,
    nextAction: decision.nextAction,
    progressStages: decision.progressStages,
    clarificationQuestion: decision.clarificationQuestion
  };
}
