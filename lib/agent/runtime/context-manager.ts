import type { AgentRuntimeInput } from "@/lib/agent/runtime/types";

export function getLatestUserText(input: Pick<AgentRuntimeInput, "messages">) {
  return [...input.messages].reverse().find((message) => message.role === "user")?.content.trim() || "";
}

export function normalizeRuntimeInput(input: AgentRuntimeInput): AgentRuntimeInput {
  return {
    messages: input.messages.slice(-20),
    files: input.files || [],
    pendingTask: input.pendingTask || null,
    activeTask: input.activeTask || null,
    cachedConversationSummary: input.cachedConversationSummary || null,
    tools: input.tools
  };
}
