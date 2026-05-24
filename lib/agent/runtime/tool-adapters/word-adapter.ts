import type { ToolAdapter } from "@/lib/agent/runtime/tool-adapters/types";

export const wordAdapter: ToolAdapter = {
  id: "word-adapter",
  targetTool: "word",
  canHandle: (decision) => decision.targetTool === "word",
  validateInputs: (decision) => {
    if (decision.missingInputs.includes("subject")) {
      return { ok: false, missingInputs: ["subject"], message: "请补充 Word 文档的主题、文体和大致篇幅。" };
    }
    return { ok: true };
  },
  execute: async (_decision, context) => ({
    result: await context.runLegacyAgent(),
    runtimeMode: "adapter",
    resultCard: {
      title: "Word 文档",
      description: "已开始创建 Word 文档",
      status: "running"
    }
  }),
  getResultCard: (result) => result.resultCard || null,
  failureToUserMessage: () => "Word 文档生成失败，请补充更明确的主题或稍后重试。"
};
