import type { DocumentTemplate } from "@/lib/document/types";

export type DocumentTemplateTheme = {
  id: DocumentTemplate;
  label: string;
  accent: string;
  muted: string;
  coverKind: "standard" | "teaching" | "report" | "formal" | "none";
};

export const DOCUMENT_TEMPLATE_THEMES: Record<DocumentTemplate, DocumentTemplateTheme> = {
  general: {
    id: "general",
    label: "文档",
    accent: "2563EB",
    muted: "64748B",
    coverKind: "standard"
  },
  report: {
    id: "report",
    label: "报告",
    accent: "1D4ED8",
    muted: "475569",
    coverKind: "report"
  },
  proposal: {
    id: "proposal",
    label: "方案",
    accent: "7C3AED",
    muted: "64748B",
    coverKind: "standard"
  },
  meeting_minutes: {
    id: "meeting_minutes",
    label: "会议纪要",
    accent: "0F766E",
    muted: "64748B",
    coverKind: "none"
  },
  lesson_plan: {
    id: "lesson_plan",
    label: "教案",
    accent: "10B981",
    muted: "64748B",
    coverKind: "teaching"
  },
  formal_doc: {
    id: "formal_doc",
    label: "正式文稿",
    accent: "334155",
    muted: "64748B",
    coverKind: "formal"
  }
};

export function getDocumentTemplateTheme(template: DocumentTemplate) {
  return DOCUMENT_TEMPLATE_THEMES[template] || DOCUMENT_TEMPLATE_THEMES.general;
}
