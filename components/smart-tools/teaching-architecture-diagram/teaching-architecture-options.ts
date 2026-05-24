import type { TeachingArchitectureDiagramType } from "@/lib/smart-tools/teaching-architecture-diagram/types";

export const TEACHING_ARCHITECTURE_ACCEPT = ".pdf,.docx,.pptx,.txt,.md";

export const teachingArchitectureFileLabel = "PDF / DOCX / PPTX / TXT / MD";

export const teachingArchitectureDiagramOptions: Array<{
  id: TeachingArchitectureDiagramType;
  label: string;
  description: string;
}> = [
  {
    id: "auto",
    label: "AI Agent 自动选择",
    description: "根据材料内容判断最适合的架构图类型。"
  },
  {
    id: "central_model",
    label: "中心模型型",
    description: "核心主题居中，周围展开资源、路径、评价和成果。"
  },
  {
    id: "three_layer",
    label: "三层架构型",
    description: "目标层、实施层、支撑层自上而下组织。"
  },
  {
    id: "left_center_right_flow",
    label: "左中右流程型",
    description: "从背景问题到实施路径再到成果推广。"
  },
  {
    id: "closed_loop",
    label: "环形闭环型",
    description: "突出诊断、建设、实施、评价、迭代。"
  },
  {
    id: "tree_module",
    label: "树状模块型",
    description: "按资源、模式、技术、评价、成果拆分模块。"
  }
];

export function getTeachingArchitectureDiagramLabel(type: TeachingArchitectureDiagramType) {
  return teachingArchitectureDiagramOptions.find((option) => option.id === type)?.label || "AI Agent 自动选择";
}
