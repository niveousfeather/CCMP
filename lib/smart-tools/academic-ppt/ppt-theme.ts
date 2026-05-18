import type { AcademicPptSettings } from "@/lib/smart-tools/academic-ppt/types";
import { getAcademicPptTemplateForSettings, type AcademicPptTemplate } from "@/lib/smart-tools/academic-ppt/template-registry";
import { normalizeAcademicPptSettings } from "@/lib/smart-tools/academic-ppt/task-api";

export type AcademicPptBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type AcademicPptTheme = {
  id: string;
  template: AcademicPptTemplate;
  canvas: { width: number; height: number };
  safe: AcademicPptBox;
  regions: {
    header: AcademicPptBox;
    keyMessage: AcademicPptBox;
    content: AcademicPptBox;
    footer: AcademicPptBox;
  };
  colors: {
    primary: string;
    accent: string;
    secondaryAccent: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
    border: string;
    white: string;
  };
  fonts: {
    title: string;
    body: string;
    mono: string;
  };
  fontSizes: {
    coverTitle: number;
    sectionTitle: number;
    pageTitle: number;
    subtitle: number;
    body: number;
    caption: number;
    footer: number;
    data: number;
  };
  spacing: {
    cardGap: number;
    cardPadding: number;
    radius: number;
  };
};

const EMU_PER_PX = 9525;

export function px(value: number) {
  return Math.round(value * EMU_PER_PX);
}

export function createAcademicPptTheme(settings: AcademicPptSettings): AcademicPptTheme {
  const normalizedSettings = normalizeAcademicPptSettings(settings);
  const template = getAcademicPptTemplateForSettings(normalizedSettings);
  const dense = normalizedSettings.informationDensity === "high";
  const low = normalizedSettings.informationDensity === "low";
  const body = dense ? 16 : low ? 20 : 18;

  return {
    id: template.id,
    template,
    canvas: { width: 1280, height: 720 },
    safe: { x: 60, y: 50, w: 1160, h: 620 },
    regions: {
      header: { x: 60, y: 36, w: 1160, h: 74 },
      keyMessage: { x: 60, y: 112, w: 1160, h: 48 },
      content: { x: 60, y: 150, w: 1160, h: 492 },
      footer: { x: 60, y: 662, w: 1160, h: 34 }
    },
    colors: {
      primary: template.primaryColor,
      accent: template.accentColor,
      secondaryAccent: template.secondaryAccentColor,
      background: template.backgroundColor,
      surface: template.surfaceColor,
      text: template.textColor,
      muted: template.mutedTextColor,
      border: template.borderColor,
      white: "FFFFFF"
    },
    fonts: {
      title: "Microsoft YaHei",
      body: "Microsoft YaHei",
      mono: "Consolas"
    },
    fontSizes: {
      coverTitle: template.id === "tech_blue_business" ? 42 : 38,
      sectionTitle: 38,
      pageTitle: template.id === "google_style" ? 30 : 28,
      subtitle: 16,
      body,
      caption: 12,
      footer: 10,
      data: 34
    },
    spacing: {
      cardGap: dense ? 16 : 20,
      cardPadding: dense ? 14 : 18,
      radius: template.id === "mckinsey" ? 4 : 10
    }
  };
}

export function withAlpha(hex: string, fallback = "F8FAFC") {
  return hex || fallback;
}
