import type {
  AcademicPptAspectRatio,
  AcademicPptDetailLevel,
  AcademicPptInformationDensity,
  AcademicPptOutputLanguage,
  AcademicPptTemplateStyle
} from "@/lib/smart-tools/academic-ppt/types";

export const templateStyleOptions: Array<{ label: string; value: AcademicPptTemplateStyle }> = [
  { label: "学术简洁", value: "academic_clean" },
  { label: "蓝白科技", value: "blue_tech" },
  { label: "研究报告", value: "research_report" },
  { label: "课程汇报", value: "course_presentation" }
];

export const aspectRatioOptions: Array<{ label: string; value: AcademicPptAspectRatio; disabled?: boolean }> = [
  { label: "16:9", value: "16:9" },
  { label: "4:3（即将支持）", value: "4:3", disabled: true }
];

export const outputLanguageOptions: Array<{ label: string; value: AcademicPptOutputLanguage }> = [
  { label: "中文", value: "zh" },
  { label: "英文", value: "en" }
];

export const detailLevelOptions: Array<{ label: string; value: AcademicPptDetailLevel }> = [
  { label: "简洁", value: "concise" },
  { label: "标准", value: "standard" },
  { label: "详细", value: "detailed" }
];

export const informationDensityOptions: Array<{ label: string; value: AcademicPptInformationDensity }> = [
  { label: "低", value: "low" },
  { label: "正常", value: "normal" },
  { label: "高", value: "high" }
];
