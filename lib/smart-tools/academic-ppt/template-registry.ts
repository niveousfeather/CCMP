import type {
  AcademicPptExtendedSlideLayout,
  AcademicPptSettings,
  AcademicPptTemplateStyle,
  AcademicPptVisualType
} from "@/lib/smart-tools/academic-ppt/types";

export type AcademicPptTemplateSource = "paper-ppt-agent" | "pptagent" | "nexus";
export type AcademicPptTemplateCategory = "academic" | "business" | "tech" | "report";

export type AcademicPptTemplate = {
  id: string;
  name: string;
  source: AcademicPptTemplateSource;
  category: AcademicPptTemplateCategory;
  description: string;
  primaryColor: string;
  accentColor: string;
  secondaryAccentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  designTone: string;
  headerMode: "bar" | "minimal" | "diagonal" | "gradient" | "google";
  coverMode: "academic" | "tech" | "consulting" | "google" | "university";
  supportedLayouts: AcademicPptExtendedSlideLayout[];
  supportedVisualTypes: AcademicPptVisualType[];
};

const CORE_LAYOUTS: AcademicPptExtendedSlideLayout[] = [
  "cover",
  "agenda",
  "section",
  "content",
  "two_column",
  "compare",
  "method",
  "experiment",
  "result",
  "timeline",
  "summary",
  "ending"
];

const EXTENDED_LAYOUTS: AcademicPptExtendedSlideLayout[] = [
  ...CORE_LAYOUTS,
  "table",
  "formula",
  "chart",
  "architecture",
  "flow"
];

const CORE_VISUALS: AcademicPptVisualType[] = [
  "none",
  "chart",
  "table",
  "formula",
  "flow",
  "architecture",
  "timeline",
  "comparison",
  "kpi",
  "matrix",
  "process",
  "swot"
];

export const academicPptTemplates: AcademicPptTemplate[] = [
  {
    id: "academic_defense",
    name: "Academic Defense",
    source: "paper-ppt-agent",
    category: "academic",
    description: "Research defense style with a dark blue title bar, red accent rail, key message strip, and rigorous academic hierarchy.",
    primaryColor: "003366",
    accentColor: "0066CC",
    secondaryAccentColor: "CC0000",
    backgroundColor: "FFFFFF",
    surfaceColor: "E8F4FC",
    textColor: "333333",
    mutedTextColor: "666666",
    borderColor: "D0D7E0",
    designTone: "professional rigorous research-oriented",
    headerMode: "bar",
    coverMode: "academic",
    supportedLayouts: EXTENDED_LAYOUTS,
    supportedVisualTypes: CORE_VISUALS
  },
  {
    id: "tech_blue_business",
    name: "Tech Blue Business",
    source: "paper-ppt-agent",
    category: "tech",
    description: "Blue-white technology business style with dashed containers, wave-inspired bookends, and clean data-friendly modules.",
    primaryColor: "0078D7",
    accentColor: "4CA1E7",
    secondaryAccentColor: "E60012",
    backgroundColor: "FFFFFF",
    surfaceColor: "F5F5F7",
    textColor: "333333",
    mutedTextColor: "666666",
    borderColor: "A0C4E3",
    designTone: "technology business clean professional",
    headerMode: "gradient",
    coverMode: "tech",
    supportedLayouts: EXTENDED_LAYOUTS,
    supportedVisualTypes: CORE_VISUALS
  },
  {
    id: "google_style",
    name: "Google Style",
    source: "paper-ppt-agent",
    category: "tech",
    description: "Clean data-driven style with Google color accents, strong whitespace, segmented color bars, and KPI-friendly cards.",
    primaryColor: "4285F4",
    accentColor: "34A853",
    secondaryAccentColor: "EA4335",
    backgroundColor: "FFFFFF",
    surfaceColor: "F8F9FA",
    textColor: "1A237E",
    mutedTextColor: "5F6368",
    borderColor: "E8EAED",
    designTone: "modern clean restrained data-driven",
    headerMode: "google",
    coverMode: "google",
    supportedLayouts: EXTENDED_LAYOUTS,
    supportedVisualTypes: CORE_VISUALS
  },
  {
    id: "mckinsey",
    name: "Structured Report",
    source: "paper-ppt-agent",
    category: "report",
    description: "Consulting-style executive report with restrained whitespace, conclusion-first structure, blue top rule, and data modules.",
    primaryColor: "005587",
    accentColor: "0076A8",
    secondaryAccentColor: "F5A623",
    backgroundColor: "FFFFFF",
    surfaceColor: "ECF0F1",
    textColor: "2C3E50",
    mutedTextColor: "5D6D7E",
    borderColor: "D8DEE2",
    designTone: "structured data-driven minimalist premium",
    headerMode: "minimal",
    coverMode: "consulting",
    supportedLayouts: EXTENDED_LAYOUTS,
    supportedVisualTypes: CORE_VISUALS
  },
  {
    id: "chongqing_university",
    name: "University Academic",
    source: "paper-ppt-agent",
    category: "academic",
    description: "Chinese university academic style inspired by diagonal mountain-city blocks, blue gradients, and gold accent details.",
    primaryColor: "006BB7",
    accentColor: "3A9BD9",
    secondaryAccentColor: "D4A84B",
    backgroundColor: "FAFCFF",
    surfaceColor: "E3F2FD",
    textColor: "1A2E44",
    mutedTextColor: "6B7B8C",
    borderColor: "C9DFF2",
    designTone: "academic university modern layered",
    headerMode: "diagonal",
    coverMode: "university",
    supportedLayouts: EXTENDED_LAYOUTS,
    supportedVisualTypes: CORE_VISUALS
  }
];

const styleTemplateMap: Record<AcademicPptTemplateStyle, string> = {
  academic_clean: "academic_defense",
  blue_tech: "tech_blue_business",
  research_report: "mckinsey",
  course_presentation: "google_style"
};

export function getAcademicPptTemplate(templateId: string | undefined) {
  return academicPptTemplates.find((template) => template.id === templateId) || academicPptTemplates[0];
}

export function getAcademicPptTemplateForSettings(settings: AcademicPptSettings) {
  return getAcademicPptTemplate(styleTemplateMap[settings.templateStyle]);
}

export function getAcademicPptTemplateStyleLabel(style: AcademicPptTemplateStyle) {
  const labels: Record<AcademicPptTemplateStyle, string> = {
    academic_clean: "Academic clean",
    blue_tech: "Blue technology",
    research_report: "Research report",
    course_presentation: "Course presentation"
  };
  return labels[style];
}

export function isAcademicPptLayoutSupported(template: AcademicPptTemplate, layout: AcademicPptExtendedSlideLayout) {
  return template.supportedLayouts.includes(layout);
}

export function isAcademicPptVisualTypeSupported(template: AcademicPptTemplate, visualType: AcademicPptVisualType) {
  return template.supportedVisualTypes.includes(visualType);
}
