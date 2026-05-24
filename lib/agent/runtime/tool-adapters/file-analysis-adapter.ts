import type { ToolAdapter } from "@/lib/agent/runtime/tool-adapters/types";

export const fileAnalysisAdapter: ToolAdapter = {
  id: "file-analysis-adapter",
  targetTool: "file-analysis",
  canHandle: (decision) => decision.targetTool === "file-analysis",
  validateInputs: (_decision, context) => {
    if (!context.files.length) {
      return { ok: false, missingInputs: ["file"], message: "请先上传需要分析的文件。" };
    }
    return { ok: true };
  },
  execute: async (_decision, context) => ({
    result: await context.runLegacyAgent(),
    runtimeMode: "adapter",
    resultCard: {
      title: "文件分析",
      description: "正在解析上传文件并整理回答",
      status: "running"
    }
  }),
  getResultCard: (result) => result.resultCard || null,
  failureToUserMessage: () => "文件分析失败，请确认文件格式受支持后重试。"
};
