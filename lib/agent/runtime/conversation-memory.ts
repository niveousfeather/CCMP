import type { AgentConversationMemory, AgentRuntimeFileSummary, AgentRuntimeInput } from "@/lib/agent/runtime/types";

export function getRuntimeFileKind(file: { name: string; type?: string }) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (file.type?.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(extension)) return "image";
  if (file.type?.startsWith("video/") || ["mp4", "mov", "webm", "m4v"].includes(extension)) return "video";
  if (extension === "pdf") return "pdf";
  if (["doc", "docx"].includes(extension)) return "word";
  if (["xls", "xlsx", "csv"].includes(extension)) return "spreadsheet";
  if (["txt", "md"].includes(extension)) return "text";
  return "file";
}

export function summarizeRuntimeFiles(files: AgentRuntimeInput["files"] = []): AgentRuntimeFileSummary {
  const names = files.map((file) => file.name).filter(Boolean).slice(0, 5);
  const kinds = Array.from(new Set(files.map(getRuntimeFileKind)));
  return {
    count: files.length,
    names,
    kinds
  };
}

export function summarizeConversationLocally(input: Pick<AgentRuntimeInput, "messages" | "cachedConversationSummary">) {
  const recentMessages = input.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-8);
  const recent = recentMessages
    .map((message) => `${message.role}: ${message.content.replace(/\s+/g, " ").trim().slice(0, 160)}`)
    .join("\n");
  const cached = input.cachedConversationSummary?.trim();
  if (cached && recentMessages.length > 8) return `${cached}\n${recent}`.slice(0, 1400);
  return recent || cached || "No prior conversation context.";
}

export function inferRuntimePreferences(input: Pick<AgentRuntimeInput, "messages">) {
  const text = input.messages.map((message) => message.content).join("\n").toLowerCase();
  const preferences: string[] = [];
  if (/正式|学术|论文|课题|申报|formal|academic/.test(text)) preferences.push("formal-academic-style");
  if (/中文|chinese/.test(text)) preferences.push("prefer-chinese-output");
  if (/简洁|精简|concise/.test(text)) preferences.push("concise");
  if (/详细|完整|detailed/.test(text)) preferences.push("detailed");
  return preferences;
}

export function buildConversationMemory(input: AgentRuntimeInput): AgentConversationMemory {
  return {
    conversationSummary: summarizeConversationLocally(input),
    currentUploadedFiles: summarizeRuntimeFiles(input.files),
    currentTaskStatus: input.pendingTask ? "clarifying" : "idle",
    userPreferences: inferRuntimePreferences(input)
  };
}
