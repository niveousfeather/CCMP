import { getToolAdapter, legacyAgentAdapter, type ToolAdapterContext, type ToolAdapterExecutionResult } from "@/lib/agent/runtime/tool-adapters";
import type { AgentRuntimeDecision } from "@/lib/agent/runtime/types";

export type AgentRuntimeToolExecutionPlan = {
  shouldExecute: boolean;
  targetTool: AgentRuntimeDecision["targetTool"];
  reason: string;
};

export type AgentRuntimeToolExecutorResult =
  | (ToolAdapterExecutionResult & { adapterId: string })
  | {
      result: Awaited<ReturnType<ToolAdapterContext["runChatAnswer"]>>;
      runtimeMode: "adapter";
      validationFailed: true;
      missingInputs: string[];
      adapterId: string;
    };

export function buildToolExecutionPlan(decision: AgentRuntimeDecision): AgentRuntimeToolExecutionPlan {
  if (!decision.needsTool) {
    return { shouldExecute: false, targetTool: "none", reason: "chat_only" };
  }
  if (decision.nextAction !== "run_legacy_tool") {
    return { shouldExecute: false, targetTool: decision.targetTool, reason: decision.nextAction };
  }
  if (decision.needsConfirmation) {
    return { shouldExecute: false, targetTool: decision.targetTool, reason: "needs_confirmation" };
  }
  if (decision.missingInputs.length) {
    return { shouldExecute: false, targetTool: decision.targetTool, reason: "missing_inputs" };
  }
  return { shouldExecute: true, targetTool: decision.targetTool, reason: "gate_allowed" };
}

export async function executeRuntimeTool(decision: AgentRuntimeDecision, context: ToolAdapterContext): Promise<AgentRuntimeToolExecutorResult> {
  const adapter = getToolAdapter(decision.targetTool);
  const selectedAdapter = adapter.canHandle(decision, context) ? adapter : legacyAgentAdapter;
  const validation = await selectedAdapter.validateInputs(decision, context);

  if (!validation.ok) {
    return {
      result: {
        content: validation.message,
        modelUsed: "NexusAI Runtime V2",
        providerUsed: "xheai",
        routeReason: `runtime_v2:${selectedAdapter.id}:validation_failed`,
        fallbackUsed: false,
        extractedDocuments: [],
        generatedFiles: [],
        pendingTask: null,
        defaultsApplied: []
      },
      runtimeMode: "adapter",
      validationFailed: true,
      missingInputs: validation.missingInputs,
      adapterId: selectedAdapter.id
    };
  }

  try {
    return { ...(await selectedAdapter.execute(decision, context)), adapterId: selectedAdapter.id };
  } catch (error) {
    return {
      result: {
        content: selectedAdapter.failureToUserMessage(error),
        modelUsed: "NexusAI Runtime V2",
        providerUsed: "xheai",
        routeReason: `runtime_v2:${selectedAdapter.id}:failed`,
        fallbackUsed: false,
        extractedDocuments: [],
        generatedFiles: [],
        pendingTask: null,
        defaultsApplied: []
      },
      runtimeMode: selectedAdapter === legacyAgentAdapter ? "legacy-fallback" : "adapter",
      adapterId: selectedAdapter.id
    };
  }
}
