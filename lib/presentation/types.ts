export type PresentationSlideType =
  | "cover"
  | "agenda"
  | "section"
  | "content"
  | "two_column"
  | "imageText"
  | "cards"
  | "timeline"
  | "comparison"
  | "data"
  | "table"
  | "closing";

export type PresentationThemeId = "executive_dark" | "clean_education" | "modern_product" | "research_report";
export type PresentationStyle = "academic" | "teaching" | "business" | "general";
export type PresentationLayoutPreset =
  | "academic_cover"
  | "teaching_cover"
  | "section_divider"
  | "agenda_list"
  | "image_explanation"
  | "knowledge_cards"
  | "process_steps"
  | "comparison_matrix"
  | "data_insight"
  | "lesson_exercise"
  | "summary_closing";

export type PresentationMetric = {
  label: string;
  value: string;
  detail?: string;
};

export type PresentationVisualAsset = {
  buffer: Buffer;
  mimeType: "image/png" | "image/jpeg";
  extension: "png" | "jpg";
  source: "web_search" | "generated";
  alt?: string;
  sourceUrl?: string;
};

export type PresentationSlide = {
  type: PresentationSlideType;
  title: string;
  subtitle?: string;
  bullets?: string[];
  table?: string[][];
  metrics?: PresentationMetric[];
  visualBrief?: string;
  imageQuery?: string;
  visualAsset?: PresentationVisualAsset;
  layoutPreset?: PresentationLayoutPreset;
  speakerNotes?: string;
};

export type PresentationDeck = {
  title: string;
  subtitle?: string;
  theme?: PresentationThemeId | string;
  style?: PresentationStyle;
  designSpec?: PresentationDesignSpec;
  qa?: PresentationQaReport;
  slides: PresentationSlide[];
};

export type PresentationDesignSpec = {
  themeId: "academic_blue" | "teaching_light" | "business_modern" | "general_clean";
  style: PresentationStyle;
  background: string;
  surface: string;
  primary: string;
  accent: string;
  body: string;
  muted: string;
  headingFont: string;
  bodyFont: string;
  motif: "paper" | "classroom" | "consulting" | "clean";
};

export type PresentationQaFinding = {
  rule:
    | "missing_visual"
    | "low_content_density"
    | "text_overflow_risk"
    | "too_many_bullets"
    | "missing_preset"
    | "slide_count_mismatch"
    | "missing_v2_marker"
    | "edge_margin_risk"
    | "rendered_text_overflow_risk"
    | "rendered_shape_overlap_risk";
  severity: "warning" | "error";
  slideIndex: number;
  message: string;
};

export type PresentationQaReport = {
  passed: boolean;
  findings: PresentationQaFinding[];
};

export type PresentationProviderInput = {
  deck: PresentationDeck;
};

export type PresentationProviderOutput = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

export type PresentationProvider = {
  name: "local" | "remote";
  generate(input: PresentationProviderInput): Promise<PresentationProviderOutput>;
};
