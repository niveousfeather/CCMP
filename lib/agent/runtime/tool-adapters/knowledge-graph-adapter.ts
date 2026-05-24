import type { AgentRunResult } from "@/lib/agent/types";
import type { ToolAdapter } from "@/lib/agent/runtime/tool-adapters/types";

function hasKnowledgeTopic(text: string) {
  return text.replace(/生成|创建|知识图谱|概念图谱|关系图谱|主题是|围绕|帮我|给我|knowledge|graph|\s+/gi, "").length >= 4;
}

async function createKnowledgeGraphTask(
  context: Parameters<ToolAdapter["execute"]>[1]
): Promise<{ result: AgentRunResult; taskId: string; title: string }> {
  const response = await fetch(new URL("/api/ai/knowledge-graph", context.origin), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: context.request.headers.get("cookie") || ""
    },
    body: JSON.stringify({
      topic: context.userText,
      messages: context.messages,
      tools: context.tools || null
    }),
    signal: context.signal
  });
  const data = (await response.json().catch(() => ({}))) as {
    taskId?: string;
    title?: string;
    graph?: { title?: string; taskId?: string };
    historyItem?: { id?: string; title?: string; topic?: string };
    code?: string;
    message?: string;
  };
  const taskId = data.taskId || data.graph?.taskId || data.historyItem?.id || "";
  const title = data.title || data.graph?.title || data.historyItem?.title || data.historyItem?.topic || context.userText.slice(0, 24);
  if (!response.ok || !taskId) {
    throw new Error(data.message || data.code || "KNOWLEDGE_GRAPH_TASK_FAILED");
  }

  return {
    taskId,
    title,
    result: {
      content: `已开始生成知识图谱「${title}」。`,
      modelUsed: "NexusAI Knowledge Graph",
      providerUsed: "xheai",
      routeReason: "runtime_v2:knowledge_graph_adapter",
      fallbackUsed: false,
      extractedDocuments: [],
      generatedFiles: [],
      pendingTask: null,
      defaultsApplied: []
    }
  };
}

export const knowledgeGraphAdapter: ToolAdapter = {
  id: "knowledge-graph-adapter",
  targetTool: "knowledge-graph",
  canHandle: (decision) => decision.targetTool === "knowledge-graph",
  validateInputs: (_decision, context) => {
    if (!hasKnowledgeTopic(context.userText)) {
      return { ok: false, missingInputs: ["subject"], message: "请补充知识图谱的主题或来源材料。" };
    }
    return { ok: true };
  },
  execute: async (_decision, context) => {
    const task = await createKnowledgeGraphTask(context);
    return {
      result: task.result,
      runtimeMode: "adapter",
      resultCard: {
        title: task.title || "知识图谱",
        description: "已开始生成知识图谱",
        status: "running",
        taskType: "knowledge-graph",
        taskId: task.taskId,
        openUrl: `/chat?view=graph&taskId=${encodeURIComponent(task.taskId)}`,
        retryable: true
      }
    };
  },
  getResultCard: (result) => result.resultCard || null,
  failureToUserMessage: () => "知识图谱生成失败，请补充更明确的主题或稍后重试。"
};
