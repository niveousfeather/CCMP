import type { ToolAdapter } from "@/lib/agent/runtime/tool-adapters/types";

export const excelAdapter: ToolAdapter = {
  id: "excel-adapter",
  targetTool: "excel",
  canHandle: (decision) => decision.targetTool === "excel",
  validateInputs: (decision) => {
    if (decision.missingInputs.includes("data_source")) {
      return { ok: false, missingInputs: ["data_source"], message: "请提供要导出的数据、表格内容，或上传源文件。" };
    }
    return { ok: true };
  },
  execute: async (_decision, context) => ({
    result: await context.runLegacyAgent(),
    runtimeMode: "adapter",
    resultCard: {
      title: "Excel 表格",
      description: "已开始处理 Excel 任务",
      status: "running"
    }
  }),
  getResultCard: (result) => result.resultCard || null,
  failureToUserMessage: () => "Excel 任务失败，请确认数据来源和操作要求后重试。"
};
