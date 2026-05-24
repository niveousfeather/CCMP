import { Network, Presentation, type LucideIcon } from "lucide-react";

export type SmartToolStatus = "规划中" | "即将上线" | "Beta";

export type SmartToolDefinition = {
  id: "academic-ppt" | "teaching-architecture-diagram";
  name: string;
  href: string;
  summary: string;
  status: SmartToolStatus;
  icon: LucideIcon;
  accent: string;
};

export const smartTools: SmartToolDefinition[] = [
  {
    id: "academic-ppt",
    name: "学术PPT",
    href: "/smart-tools/academic-ppt",
    summary: "上传论文、资料或已有 PPT，生成结构清晰、视觉更好的学术演示文稿。",
    status: "规划中",
    icon: Presentation,
    accent: "from-blue-100 to-white text-blue-700"
  },
  {
    id: "teaching-architecture-diagram",
    name: "教学架构图",
    href: "/smart-tools/teaching-architecture-diagram",
    summary: "上传教改资料，生成可编辑文字的教学架构 SVG 图。",
    status: "Beta",
    icon: Network,
    accent: "from-blue-100 via-white to-red-50 text-blue-700"
  }
];
