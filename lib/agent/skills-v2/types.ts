export type AgentSkillV2Id =
  | "file-analysis"
  | "word"
  | "excel"
  | "ppt-simple"
  | "image"
  | "teaching-diagram"
  | "knowledge-graph";

export type AgentSkillV2 = {
  id: AgentSkillV2Id;
  title: string;
  skillFile: string;
  allowedTools: string[];
  forbiddenTools: string[];
};
