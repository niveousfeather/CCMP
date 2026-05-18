import type { AgentTask, AgentToolSelection } from "@/lib/agent/types";
import { isFunctionalArtifactTask } from "@/lib/agent/task-intents";

export function isFunctionalAgentTask(text: string, tools?: AgentToolSelection) {
  if (tools?.contentMode) return true;
  return isFunctionalArtifactTask(text);
}

export function shouldUseFastChatRoute({
  hasFiles,
  task,
  text,
  tools
}: {
  hasFiles: boolean;
  task: AgentTask;
  text: string;
  tools?: AgentToolSelection;
}) {
  if (hasFiles || task.hasFiles || task.requiresFile) return false;
  if (isFunctionalAgentTask(text, tools)) return false;
  if (task.type !== "general_chat") return false;
  if (task.outputFormat !== "text") return false;
  return true;
}
