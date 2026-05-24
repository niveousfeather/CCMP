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
  if (/简洁|精简|简短|短一点|短些|concise/.test(text)) preferences.push("concise");
  if (/详细|完整|展开|detailed/.test(text)) preferences.push("detailed");
  if (/不要生成|先给方案|先别生成|先不要生成|只给建议|plan first/.test(text)) preferences.push("plan-first-no-auto-generate");
  return preferences;
}

function describeActiveTask(input: AgentRuntimeInput) {
  if (!input.activeTask) return null;
  const title = input.activeTask.title ? `:${input.activeTask.title}` : "";
  return `${input.activeTask.kind}${title}`;
}

function inferSessionReferences(input: AgentRuntimeInput) {
  const references: string[] = [];
  const activeTask = describeActiveTask(input);
  if (activeTask) references.push(`activeTask=${activeTask}`);
  const files = summarizeRuntimeFiles(input.files);
  if (files.count) references.push(`uploadedFiles=${files.names.join(", ")}`);
  if (input.pendingTask) references.push(`pendingTask=${input.pendingTask.type}`);
  return references.slice(0, 6);
}

export function buildConversationMemory(input: AgentRuntimeInput): AgentConversationMemory {
  return {
    conversationSummary: summarizeConversationLocally(input),
    currentUploadedFiles: summarizeRuntimeFiles(input.files),
    currentActiveTask: input.activeTask || null,
    currentTaskStatus: input.pendingTask ? "clarifying" : "idle",
    userPreferences: inferRuntimePreferences(input),
    sessionReferences: inferSessionReferences(input)
  };
}
