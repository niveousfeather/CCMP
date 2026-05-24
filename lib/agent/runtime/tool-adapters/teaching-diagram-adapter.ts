import type { AgentRunResult } from "@/lib/agent/types";
import type { ToolAdapter } from "@/lib/agent/runtime/tool-adapters/types";

async function createTeachingDiagramTask(
  context: Parameters<ToolAdapter["execute"]>[1]
): Promise<{ result: AgentRunResult; taskId: string; title: string }> {
  const formData = new FormData();
  formData.set("sourceType", "text");
  formData.set("diagramType", "framework");
  formData.set("textPrompt", context.userText);

  const response = await fetch(new URL("/api/smart-tools/teaching-architecture-diagram", context.origin), {
    method: "POST",
    headers: {
      cookie: context.request.headers.get("cookie") || ""
    },
    body: formData,
    signal: context.signal
  });
  const data = (await response.json().catch(() => ({}))) as {
    task?: { taskId?: string; title?: string };
    taskId?: string;
    title?: string;
    code?: string;
    message?: string;
  };
  const taskId = data.task?.taskId || data.taskId || "";
  const title = data.task?.title || data.title || context.userText.slice(0, 24);
  if (!response.ok || !taskId) {
    throw new Error(data.message || data.code || "TEACHING_DIAGRAM_TASK_FAILED");
  }

  return {
    taskId,
    title,
    result: {
      content: `已开始创建教学架构图「${title}」，可在教学架构图工具中查看进度。`,
      modelUsed: "NexusAI Teaching Diagram",
      providerUsed: "xheai",
      routeReason: "runtime_v2:teaching_diagram_adapter",
      fallbackUsed: false,
      extractedDocuments: [],
      generatedFiles: [],
      pendingTask: null,
      defaultsApplied: []
    }
  };
}

export const teachingDiagramAdapter: ToolAdapter = {
  id: "teaching-diagram-adapter",
  targetTool: "teaching-diagram",
  canHandle: (decision) => decision.targetTool === "teaching-diagram",
  validateInputs: (decision) => {
    if (decision.missingInputs.includes("subject")) {
      return { ok: false, missingInputs: ["subject"], message: "请补充教学架构图的主题或材料。" };
    }
    return { ok: true };
  },
  execute: async (_decision, context) => {
    const task = await createTeachingDiagramTask(context);
    return {
      result: task.result,
      runtimeMode: "adapter",
      resultCard: {
        title: task.title || "教学架构图",
        description: "已开始创建教学架构图任务",
        status: "running",
        taskType: "teaching-diagram",
        taskId: task.taskId,
        openUrl: `/smart-tools/teaching-architecture-diagram?taskId=${encodeURIComponent(task.taskId)}`,
        downloadUrl: `/api/smart-tools/teaching-architecture-diagram/tasks/${encodeURIComponent(task.taskId)}/download?format=png`,
        retryable: true
      }
    };
  },
  getResultCard: (result) => result.resultCard || null,
  failureToUserMessage: () => "教学架构图任务创建失败，请稍后重试或补充更明确的主题。"
};
