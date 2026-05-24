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
  if (kind === "image") return "previous image in this conversation";
  if (kind === "teaching-diagram") return "previous teaching diagram in this conversation";
  if (kind === "ppt") return "previous PPT in this conversation";
  if (kind === "word") return "previous Word document in this conversation";
  if (kind === "excel") return "previous Excel sheet in this conversation";
  if (kind === "file-analysis") return "previous file in this conversation";
  if (kind === "knowledge-graph") return "previous knowledge graph in this conversation";
  return "previous task in this conversation";
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

function buildMemoryHints(
  input: AgentRuntimeInput,
  activeTask: AgentRuntimeActiveTaskSummary | null,
  attachmentSummaries: AgentRuntimeContextPack["attachmentSummaries"]
) {
  const hints: string[] = ["Memory is scoped to the current conversationId only."];
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
        "You are NexusAI's main chat assistant. Use only the compressed context from the current conversationId. Do not use cross-conversation memory, user profile memory, or permanent memory. Do not claim to read a full file unless it is provided in this conversation. Answer normal questions directly; generation, editing, and export actions run only when the runtime gate allows them. Never expose internal decision JSON, provider names, model names, API keys, or chain-of-thought."
    },
    {
      role: "system" as const,
      content: [
        "Memory boundary: current conversation only. A new conversation starts with empty memory.",
        `Context budget: ${contextPack.tokenBudgetHint.mode} (${contextPack.tokenBudgetHint.reason})`,
        `Recent conversation summary:\n${contextPack.recentSummary}`,
        `Attachment summaries:\n${attachmentContext}`,
        `Current referenced object: ${activeTask}`,
        `Temporary preferences in this conversation: ${contextPack.sessionPreferences.join(", ") || "none"}`,
        `Memory hints:\n${memoryHints}`
      ].join("\n\n")
    },
    {
      role: "user" as const,
      content: contextPack.latestUserMessage || "Please continue."
    }
  ];
}
