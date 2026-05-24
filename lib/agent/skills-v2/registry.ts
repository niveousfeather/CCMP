import type { AgentSkillV2 } from "@/lib/agent/skills-v2/types";

export const agentSkillV2Registry = [
  {
    id: "file-analysis",
    title: "File Analysis",
    skillFile: "file-analysis/SKILL.md",
    allowedTools: ["parseDocumentsWithKimi", "parseImagesWithVision", "parseVideosWithKimi", "document-processing"],
    forbiddenTools: ["file generation without explicit user intent"]
  },
  {
    id: "word",
    title: "Word Document",
    skillFile: "word/SKILL.md",
    allowedTools: ["createWordDocument", "lib/document"],
    forbiddenTools: ["Academic PPT", "capability-map"]
  },
  {
    id: "excel",
    title: "Excel Spreadsheet",
    skillFile: "excel/SKILL.md",
    allowedTools: ["runSpreadsheetTask", "lib/spreadsheet"],
    forbiddenTools: ["Word generator", "PPT generator"]
  },
  {
    id: "ppt-simple",
    title: "Simple PPT",
    skillFile: "ppt-simple/SKILL.md",
    allowedTools: ["createPresentation", "lib/presentation"],
    forbiddenTools: ["Academic PPT smart-tool pipeline"]
  },
  {
    id: "image",
    title: "Image Generation",
    skillFile: "image/SKILL.md",
    allowedTools: ["/api/ai/image", "lib/image"],
    forbiddenTools: ["video generation", "3D generation"]
  },
  {
    id: "teaching-diagram",
    title: "Teaching Architecture Diagram",
    skillFile: "teaching-diagram/SKILL.md",
    allowedTools: ["/api/smart-tools/teaching-architecture-diagram"],
    forbiddenTools: ["Academic PPT", "capability-map"]
  },
  {
    id: "knowledge-graph",
    title: "Knowledge Graph",
    skillFile: "knowledge-graph/SKILL.md",
    allowedTools: ["/api/ai/knowledge-graph"],
    forbiddenTools: ["teaching diagram renderer", "Academic PPT"]
  }
] as const satisfies readonly AgentSkillV2[];

export function getAgentSkillV2(id: AgentSkillV2["id"]) {
  return agentSkillV2Registry.find((skill) => skill.id === id) || null;
}
