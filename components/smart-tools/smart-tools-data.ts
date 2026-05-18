import { Presentation } from "lucide-react";

export type SmartToolStatus = "规划中" | "即将上线" | "Beta";

export type SmartToolDefinition = {
  id: "academic-ppt";
  name: string;
  href: string;
  summary: string;
  status: SmartToolStatus;
  icon: typeof Presentation;
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
  }
];
