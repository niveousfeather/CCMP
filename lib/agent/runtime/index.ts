import { buildConversationMemory } from "@/lib/agent/runtime/conversation-memory";
import { normalizeRuntimeInput } from "@/lib/agent/runtime/context-manager";
import { buildAgentRuntimeContextPack } from "@/lib/agent/runtime/context-pack";
import { planAgentRuntimeIntent } from "@/lib/agent/runtime/intent-planner";
import { serializeAgentRuntimeDecision } from "@/lib/agent/runtime/response-stream";
import type { AgentRuntimeInput, AgentRuntimePlan } from "@/lib/agent/runtime/types";

export function planAgentRuntimeTurn(input: AgentRuntimeInput): AgentRuntimePlan {
  const normalized = normalizeRuntimeInput(input);
  const memory = buildConversationMemory(normalized);
  const planned = planAgentRuntimeIntent(normalized);
  const contextPack = buildAgentRuntimeContextPack(normalized, planned.skillSelection);
  return {
    decision: serializeAgentRuntimeDecision(planned.decision),
    trace: {
      version: "agent-runtime-v2.phase5",
      memory,
      contextPack,
      skillSelection: planned.skillSelection,
      gate: planned.gate,
      legacyTask: planned.legacyTask
    }
  };
}

export type {
  AgentConversationMemory,
  AgentExecutionGate,
  AgentRuntimeDecision,
  AgentRuntimeFileSummary,
  AgentRuntimeContextPack,
  AgentRuntimeInput,
  AgentRuntimeIntent,
  AgentRuntimeNextAction,
  AgentRuntimePlan,
  AgentRuntimeStage,
  AgentRuntimeTargetTool,
  AgentRuntimeTrace,
  AgentSkillId,
  AgentSkillMatch,
  AgentSkillSelection
} from "@/lib/agent/runtime/types";
