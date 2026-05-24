import { excelAdapter } from "@/lib/agent/runtime/tool-adapters/excel-adapter";
import { fileAnalysisAdapter } from "@/lib/agent/runtime/tool-adapters/file-analysis-adapter";
import { imageAdapter } from "@/lib/agent/runtime/tool-adapters/image-adapter";
import { knowledgeGraphAdapter } from "@/lib/agent/runtime/tool-adapters/knowledge-graph-adapter";
import { legacyAgentAdapter } from "@/lib/agent/runtime/tool-adapters/legacy-agent-adapter";
import { pptSimpleAdapter } from "@/lib/agent/runtime/tool-adapters/ppt-simple-adapter";
import { teachingDiagramAdapter } from "@/lib/agent/runtime/tool-adapters/teaching-diagram-adapter";
import type { ToolAdapter } from "@/lib/agent/runtime/tool-adapters/types";
import { wordAdapter } from "@/lib/agent/runtime/tool-adapters/word-adapter";
import type { AgentRuntimeTargetTool } from "@/lib/agent/runtime/types";

export const toolAdapters = [
  fileAnalysisAdapter,
  wordAdapter,
  excelAdapter,
  pptSimpleAdapter,
  imageAdapter,
  teachingDiagramAdapter,
  knowledgeGraphAdapter
] as const satisfies readonly ToolAdapter[];

export function getToolAdapter(targetTool: AgentRuntimeTargetTool) {
  return toolAdapters.find((adapter) => adapter.targetTool === targetTool) || legacyAgentAdapter;
}

export { legacyAgentAdapter };
export type {
  AgentActiveTask,
  AgentActiveTaskKind,
  ConversationFileReference,
  ToolAdapter,
  ToolAdapterContext,
  ToolAdapterExecutionResult,
  ToolAdapterResultCard,
  ToolAdapterValidationResult
} from "@/lib/agent/runtime/tool-adapters/types";
