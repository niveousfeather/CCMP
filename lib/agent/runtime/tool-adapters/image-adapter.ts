import type { ToolAdapter } from "@/lib/agent/runtime/tool-adapters/types";

function isImageEditRequest(text: string) {
  return /修改|编辑|改成|改为|换成|标题|刚才|上一张|那张|edit|revise|change/i.test(text);
}

export const imageAdapter: ToolAdapter = {
  id: "image-adapter",
  targetTool: "image",
  canHandle: (decision) => decision.targetTool === "image",
  validateInputs: (_decision, context) => {
    if (isImageEditRequest(context.userText)) {
      const hasImageFile = context.files.some((file) => file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name));
      if (!hasImageFile && context.activeTask?.kind !== "image" && context.activeTask?.kind !== "teaching-diagram") {
        return { ok: false, missingInputs: ["image_to_edit"], message: "请说明要修改哪张图，或上传需要编辑的图片。" };
      }
    }
    return { ok: true };
  },
  execute: async (_decision, context) => {
    const imageRun = await context.runImageGeneration();
    return {
      result: imageRun.result,
      runtimeMode: "adapter",
      imageGeneration: imageRun.imageGeneration,
      resultCard: {
        title: "图片任务",
        description: "已开始处理图片生成或修改任务",
        status: "running",
        taskType: "image",
        retryable: true
      }
    };
  },
  getResultCard: (result) => result.resultCard || null,
  failureToUserMessage: () => "图片任务创建失败，请补充图片描述或上传要修改的图片后重试。"
};
