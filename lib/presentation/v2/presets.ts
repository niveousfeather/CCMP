import type { PresentationDesignSpec, PresentationLayoutPreset, PresentationSlide, PresentationStyle } from "@/lib/presentation/types";

export type PresentationPresetDefinition = {
  id: PresentationLayoutPreset;
  label: string;
  role: "cover" | "navigation" | "section" | "content" | "exercise" | "closing";
  needsVisual: boolean;
  maxBullets: number;
};

export const PRESENTATION_V2_DESIGN_SPECS: Record<PresentationStyle, PresentationDesignSpec> = {
  academic: {
    themeId: "academic_blue",
    style: "academic",
    background: "FFFFFF",
    surface: "F8FAFC",
    primary: "1A365D",
    accent: "2B6CB0",
    body: "243447",
    muted: "64748B",
    headingFont: "Georgia",
    bodyFont: "Aptos",
    motif: "paper"
  },
  teaching: {
    themeId: "teaching_light",
    style: "teaching",
    background: "F7FBFF",
    surface: "FFFFFF",
    primary: "2563EB",
    accent: "10B981",
    body: "334155",
    muted: "64748B",
    headingFont: "Microsoft YaHei",
    bodyFont: "Microsoft YaHei",
    motif: "classroom"
  },
  business: {
    themeId: "business_modern",
    style: "business",
    background: "F8FAFC",
    surface: "FFFFFF",
    primary: "4F46E5",
    accent: "F97316",
    body: "374151",
    muted: "6B7280",
    headingFont: "Aptos Display",
    bodyFont: "Aptos",
    motif: "consulting"
  },
  general: {
    themeId: "general_clean",
    style: "general",
    background: "FFFFFF",
    surface: "F8FAFC",
    primary: "334155",
    accent: "0EA5E9",
    body: "334155",
    muted: "64748B",
    headingFont: "Aptos Display",
    bodyFont: "Aptos",
    motif: "clean"
  }
};

export const PRESENTATION_V2_PRESETS: Record<PresentationLayoutPreset, PresentationPresetDefinition> = {
  academic_cover: {
    id: "academic_cover",
    label: "Academic cover",
    role: "cover",
    needsVisual: true,
    maxBullets: 0
  },
  teaching_cover: {
    id: "teaching_cover",
    label: "Teaching cover",
    role: "cover",
    needsVisual: true,
    maxBullets: 0
  },
  section_divider: {
    id: "section_divider",
    label: "Section divider",
    role: "section",
    needsVisual: true,
    maxBullets: 2
  },
  agenda_list: {
    id: "agenda_list",
    label: "Agenda list",
    role: "navigation",
    needsVisual: false,
    maxBullets: 6
  },
  image_explanation: {
    id: "image_explanation",
    label: "Image explanation",
    role: "content",
    needsVisual: true,
    maxBullets: 4
  },
  knowledge_cards: {
    id: "knowledge_cards",
    label: "Knowledge cards",
    role: "content",
    needsVisual: false,
    maxBullets: 6
  },
  process_steps: {
    id: "process_steps",
    label: "Process steps",
    role: "content",
    needsVisual: false,
    maxBullets: 5
  },
  comparison_matrix: {
    id: "comparison_matrix",
    label: "Comparison matrix",
    role: "content",
    needsVisual: false,
    maxBullets: 6
  },
  data_insight: {
    id: "data_insight",
    label: "Data insight",
    role: "content",
    needsVisual: false,
    maxBullets: 4
  },
  lesson_exercise: {
    id: "lesson_exercise",
    label: "Lesson exercise",
    role: "exercise",
    needsVisual: false,
    maxBullets: 5
  },
  summary_closing: {
    id: "summary_closing",
    label: "Summary closing",
    role: "closing",
    needsVisual: false,
    maxBullets: 4
  }
};

function textOf(slide: PresentationSlide) {
  return `${slide.title} ${slide.subtitle || ""} ${(slide.bullets || []).join(" ")}`.toLowerCase();
}

export function mapPresetToLegacySlideType(preset: PresentationLayoutPreset, slide: PresentationSlide): PresentationSlide["type"] {
  if (preset === "academic_cover" || preset === "teaching_cover") return "cover";
  if (preset === "agenda_list") return "agenda";
  if (preset === "section_divider") return "section";
  if (preset === "knowledge_cards" || preset === "lesson_exercise") return "cards";
  if (preset === "process_steps") return "timeline";
  if (preset === "comparison_matrix") return "comparison";
  if (preset === "data_insight") return slide.metrics?.length ? "data" : "cards";
  if (preset === "summary_closing") return "closing";
  return "imageText";
}

export function selectSlidePreset(slide: PresentationSlide, index: number, style: PresentationStyle): PresentationLayoutPreset {
  const text = textOf(slide);
  if (index === 0 || slide.type === "cover") return style === "teaching" ? "teaching_cover" : "academic_cover";
  if (slide.type === "agenda") return "agenda_list";
  if (slide.type === "section") return "section_divider";
  if (slide.type === "closing") return "summary_closing";
  if (slide.type === "timeline") return "process_steps";
  if (/练习|作业|课堂活动|随堂|测验|exercise|quiz|homework|practice/.test(text)) return "lesson_exercise";
  if (slide.metrics?.length || /数据|实验|结果|指标|accuracy|metric|result|chart/.test(text)) return "data_insight";
  if (slide.type === "comparison" || /对比|比较|优劣|before|after|versus|compare/.test(text)) return "comparison_matrix";
  if (/流程|步骤|阶段|路径|过程|step|process|workflow|phase/.test(text)) return "process_steps";
  if (slide.visualAsset || slide.visualBrief || slide.imageQuery || slide.type === "imageText" || slide.type === "two_column") return "image_explanation";
  return "knowledge_cards";
}
