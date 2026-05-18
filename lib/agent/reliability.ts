import type { AgentToolSelection } from "@/lib/agent/types";
import { getExplicitFileGenerationTool } from "@/lib/agent/task-intents";

export type FileGenerationTool = "write" | "ppt" | "excel";

export function inferExplicitFileGenerationTool(text: string): FileGenerationTool | null {
  return getExplicitFileGenerationTool(text);
}

export function shouldShowLocalFileGenerationCard(text: string, tools?: AgentToolSelection): FileGenerationTool | null {
  if (tools?.contentMode === "write" || tools?.contentMode === "ppt") return tools.contentMode;
  return inferExplicitFileGenerationTool(text);
}
