import type { ToolAdapter } from "@/lib/agent/runtime/tool-adapters/types";

export const legacyAgentAdapter: ToolAdapter = {
  id: "legacy-agent-adapter",
  targetTool: "none",
  canHandle: () => true,
  validateInputs: () => ({ ok: true }),
  execute: async (_decision, context) => ({
    result: await context.runLegacyAgent(),
    runtimeMode: "legacy-fallback"
  }),
  getResultCard: () => null,
  failureToUserMessage: () => "任务处理失败，请稍后重试或补充更明确的要求。"
};
