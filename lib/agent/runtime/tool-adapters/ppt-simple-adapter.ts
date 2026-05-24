import type { ToolAdapter } from "@/lib/agent/runtime/tool-adapters/types";

export const pptSimpleAdapter: ToolAdapter = {
  id: "ppt-simple-adapter",
  targetTool: "ppt-simple",
  canHandle: (decision) => decision.targetTool === "ppt-simple",
  validateInputs: (decision, context) => {
    if (/学术PPT|论文PPT|课题PPT|academic ppt|paper ppt/i.test(context.userText)) {
      return {
        ok: false,
        missingInputs: ["academic_ppt_confirmation"],
        message: "你想做的是普通 PPT 还是论文/课题汇报类 Academic PPT？如果是后者，请明确使用 Academic PPT 专项工具。"
      };
    }
    if (decision.missingInputs.includes("subject")) {
      return { ok: false, missingInputs: ["subject"], message: "请补充 PPT 的主题、受众和预计页数。" };
    }
    return { ok: true };
  },
  execute: async (_decision, context) => ({
    result: await context.runLegacyAgent(),
    runtimeMode: "adapter",
    resultCard: {
      title: "简单 PPT",
      description: "已开始生成普通 PPT",
      status: "running"
    }
  }),
  getResultCard: (result) => result.resultCard || null,
  failureToUserMessage: () => "PPT 生成失败，请补充更明确的主题、页数或内容结构后重试。"
};
