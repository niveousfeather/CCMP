import { getLatestUserText } from "@/lib/agent/runtime/context-manager";
import { getRuntimeFileKind, inferRuntimePreferences, summarizeConversationLocally } from "@/lib/agent/runtime/conversation-memory";
import type {
  AgentRuntimeActiveTaskSummary,
  AgentRuntimeContextPack,
  AgentRuntimeInput,
  AgentSkillSelection
} from "@/lib/agent/runtime/types";

const LONG_MESSAGE_THRESHOLD = 1800;

function compactText(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function taskKindLabel(kind: string) {
  if (kind === "image") return "上一张图片";
  if (kind === "teaching-diagram") return "上一个教学架构图";
  if (kind === "ppt") return "上一个 PPT";
  if (kind === "word") return "上一个 Word 文档";
  if (kind === "excel") return "上一个 Excel 表格";
  if (kind === "file-analysis") return "上一份文件";
  if (kind === "knowledge-graph") return "上一个知识图谱";
  return "上一个任务";
}

function summarizeAttachment(file: NonNullable<AgentRuntimeInput["files"]>[number]) {
  const kind = getRuntimeFileKind(file);
  const sizeText = typeof file.size === "number" && file.size > 0 ? `, about ${Math.ceil(file.size / 1024)}KB` : "";
  return {
    name: file.name,
    kind,
    sizeBytes: file.size,
    summary: `${kind} attachment: ${file.name}${sizeText}`
  };
}

function selectTokenBudget(input: AgentRuntimeInput, selectedSkills: string[]) {
  const latestUserMessage = getLatestUserText(input);
  const hasFiles = Boolean(input.files?.length);
  const hasLongHistory = input.messages.some((message) => message.content.length > LONG_MESSAGE_THRESHOLD) || input.messages.length > 12;
  const needsTool = selectedSkills.some((skill) => skill !== "normal-chat" && skill !== "none");

  if (needsTool) {
    return {
      mode: "tool_execution" as const,
      maxRecentMessages: 6,
      maxAttachmentChars: 1200,
      reason: "tool_adapter_needs_only_action_context"
    };
  }
  if (hasFiles) {
    return {
      mode: "file_summary" as const,
      maxRecentMessages: 8,
      maxAttachmentChars: 1800,
      reason: "file_question_uses_attachment_summaries"
    };
  }
  if (hasLongHistory || latestUserMessage.length > 1000) {
    return {
      mode: "standard" as const,
      maxRecentMessages: 8,
      maxAttachmentChars: 0,
      reason: "long_conversation_uses_local_summary"
    };
  }
  return {
    mode: "minimal" as const,
    maxRecentMessages: 4,
    maxAttachmentChars: 0,
    reason: "ordinary_chat_minimal_context"
  };
}

function activeTaskSummary(input: AgentRuntimeInput): AgentRuntimeActiveTaskSummary | null {
  if (input.activeTask) return input.activeTask;
  if (!input.pendingTask) return null;
  return {
    id: "pending-conversation-task",
    kind: input.pendingTask.type,
    title: input.pendingTask.requestedFileName || input.pendingTask.documentType || input.pendingTask.outputFormat,
    status: "clarifying"
  };
}

function buildMemoryHints(input: AgentRuntimeInput, activeTask: AgentRuntimeActiveTaskSummary | null, attachmentSummaries: AgentRuntimeContextPack["attachmentSummaries"]) {
  const hints: string[] = [];
  if (activeTask) {
    const title = activeTask.title ? `: ${activeTask.title}` : "";
    hints.push(`Current referenced object is ${taskKindLabel(activeTask.kind)}${title}.`);
  }
  if (attachmentSummaries.length) {
    hints.push(`Current turn uploaded files: ${attachmentSummaries.map((file) => file.name).join(", ")}.`);
  }
  const preferences = inferRuntimePreferences(input);
  if (preferences.includes("plan-first-no-auto-generate")) hints.push("User prefers a plan or advice first; do not auto-generate a file unless they explicitly ask.");
  if (preferences.includes("concise")) hints.push("User prefers a shorter answer.");
  if (preferences.includes("formal-academic-style")) hints.push("User prefers a formal academic style.");
  return hints.slice(0, 6);
}

export function buildAgentRuntimeContextPack(input: AgentRuntimeInput, skillSelection?: AgentSkillSelection): AgentRuntimeContextPack {
  const selectedSkills = skillSelection?.candidates
    .map((candidate) => candidate.skillId || "normal-chat")
    .filter((skill, index, list) => list.indexOf(skill) === index)
    .slice(0, 3) || ["normal-chat"];
  const tokenBudgetHint = selectTokenBudget(input, selectedSkills);
  const recentSummary = summarizeConversationLocally({
    cachedConversationSummary: input.cachedConversationSummary,
    messages: input.messages.slice(-tokenBudgetHint.maxRecentMessages)
  });
  const attachmentSummaries = (input.files || []).map(summarizeAttachment).slice(0, 5);
  const activeTask = activeTaskSummary(input);

  return {
    latestUserMessage: compactText(getLatestUserText(input), 1600),
    recentSummary: compactText(recentSummary, tokenBudgetHint.mode === "minimal" ? 700 : 1400),
    attachmentSummaries,
    activeTask,
    sessionPreferences: inferRuntimePreferences(input).slice(0, 6),
    memoryHints: buildMemoryHints(input, activeTask, attachmentSummaries),
    selectedSkills,
    tokenBudgetHint
  };
}

export function buildRuntimeChatMessagesFromContextPack(contextPack: AgentRuntimeContextPack) {
  const attachmentContext = contextPack.attachmentSummaries.length
    ? contextPack.attachmentSummaries.map((file) => `- ${file.summary}`).join("\n")
    : "No attachment summary in this turn.";
  const activeTask = contextPack.activeTask
    ? `${taskKindLabel(contextPack.activeTask.kind)}${contextPack.activeTask.title ? `: ${contextPack.activeTask.title}` : ""}`
    : "No current task.";
  const memoryHints = contextPack.memoryHints.length ? contextPack.memoryHints.map((hint) => `- ${hint}`).join("\n") : "- No extra memory hints.";

  return [
    {
      role: "system" as const,
      content:
        "你是 NexusAI 主聊天助手。只使用当前会话的压缩上下文回答，不要声称读取了未提供的完整文件。普通咨询直接回答；生成、修改、导出类动作只有在系统决策允许时才执行。不要暴露内部决策 JSON、provider、模型名或思考链。"
    },
    {
      role: "system" as const,
      content: [
        `上下文预算: ${contextPack.tokenBudgetHint.mode} (${contextPack.tokenBudgetHint.reason})`,
        `最近对话摘要:\n${contextPack.recentSummary}`,
        `附件摘要:\n${attachmentContext}`,
        `当前引用对象: ${activeTask}`,
        `当前会话偏好: ${contextPack.sessionPreferences.join(", ") || "none"}`,
        `记忆提示:\n${memoryHints}`
      ].join("\n\n")
    },
    {
      role: "user" as const,
      content: contextPack.latestUserMessage || "请继续。"
    }
  ];
}
