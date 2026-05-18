import type {
  PresentationDeck,
  PresentationMetric,
  PresentationProvider,
  PresentationSlide,
  PresentationThemeId,
  PresentationVisualAsset
} from "@/lib/presentation/types";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const SLIDE_W = 12192000;
const SLIDE_H = 6858000;
const MAX_RENDERED_SLIDES = 16;
const OFFICE_BLANK_LAYOUT = 7;

type Theme = {
  id: PresentationThemeId;
  name: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  primary: string;
  secondary: string;
  accent: string;
  title: string;
  body: string;
  muted: string;
  dark: boolean;
  fontHead: string;
  fontBody: string;
};

type SlideMedia = {
  relationshipId: string;
  name: string;
  asset: PresentationVisualAsset;
};

const MARGIN_X = 760000;
const TITLE_Y = 560000;
const CONTENT_TOP = 1650000;
const ACCENT_H = 90000;

const THEMES: Record<PresentationThemeId, Theme> = {
  executive_dark: {
    id: "executive_dark",
    name: "Executive Dark",
    background: "101827",
    surface: "172235",
    surfaceAlt: "22314A",
    primary: "6EA8FE",
    secondary: "9DC3FF",
    accent: "F8D66D",
    title: "FFFFFF",
    body: "DCE7F7",
    muted: "93A4B8",
    dark: true,
    fontHead: "Aptos Display",
    fontBody: "Aptos"
  },
  clean_education: {
    id: "clean_education",
    name: "Clean Education",
    background: "F7FBFF",
    surface: "FFFFFF",
    surfaceAlt: "EAF4FF",
    primary: "2563EB",
    secondary: "7DD3FC",
    accent: "10B981",
    title: "123047",
    body: "334155",
    muted: "64748B",
    dark: false,
    fontHead: "Microsoft YaHei",
    fontBody: "Microsoft YaHei"
  },
  modern_product: {
    id: "modern_product",
    name: "Modern Product",
    background: "F8FAFC",
    surface: "FFFFFF",
    surfaceAlt: "EEF2FF",
    primary: "4F46E5",
    secondary: "06B6D4",
    accent: "F97316",
    title: "111827",
    body: "374151",
    muted: "6B7280",
    dark: false,
    fontHead: "Aptos Display",
    fontBody: "Aptos"
  },
  research_report: {
    id: "research_report",
    name: "Research Report",
    background: "F6F5F2",
    surface: "FFFFFF",
    surfaceAlt: "E8E3D8",
    primary: "334155",
    secondary: "64748B",
    accent: "B45309",
    title: "1F2937",
    body: "374151",
    muted: "6B7280",
    dark: false,
    fontHead: "Georgia",
    fontBody: "Aptos"
  }
};

function xmlEscape(value: string) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sanitizeFileName(value: string) {
  const name = String(value || "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\.pptx$/i, "")
    .replace(/\s+/g, "-")
    .slice(0, 36);
  return `${name || `presentation-${Date.now()}`}.pptx`;
}

function resolveTheme(deck: PresentationDeck): Theme {
  const explicit = typeof deck.theme === "string" && deck.theme in THEMES ? deck.theme as PresentationThemeId : null;
  if (explicit) return THEMES[explicit];

  const text = `${deck.title} ${deck.subtitle || ""} ${deck.slides.map((slide) => `${slide.title} ${slide.subtitle || ""}`).join(" ")}`.toLowerCase();
  if (/教学|课程|课件|教案|education|course|lesson/.test(text)) return THEMES.clean_education;
  if (/产品|方案|增长|发布|product|market|launch/.test(text)) return THEMES.modern_product;
  if (/研究|调研|报告|分析|research|report|analysis/.test(text)) return THEMES.research_report;
  return THEMES.executive_dark;
}

function clampText(value: unknown, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function fitTextSize(text: string, base: number, min: number) {
  const length = [...String(text || "")].length;
  if (length > 42) return Math.max(min, base - 800);
  if (length > 28) return Math.max(min, base - 500);
  if (length > 18) return Math.max(min, base - 250);
  return base;
}

function bulletItems(slide: PresentationSlide, fallback: string[] = []) {
  const items = (slide.bullets?.length ? slide.bullets : fallback).map((item) => clampText(item, 74)).filter(Boolean);
  return items.slice(0, 5);
}

function shape({
  id,
  name,
  x,
  y,
  cx,
  cy,
  fill,
  line,
  radius = "roundRect"
}: {
  id: number;
  name: string;
  x: number;
  y: number;
  cx: number;
  cy: number;
  fill?: string;
  line?: string;
  radius?: "rect" | "roundRect" | "ellipse" | "triangle" | "rightArrow" | "chevron";
}) {
  const geometry =
    radius === "ellipse"
      ? "ellipse"
      : radius === "triangle"
        ? "triangle"
        : radius === "rightArrow"
          ? "rightArrow"
          : radius === "chevron"
            ? "chevron"
            : radius === "rect"
              ? "rect"
              : "roundRect";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="${geometry}"><a:avLst/></a:prstGeom>${
    fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : "<a:noFill/>"
  }${
    line ? `<a:ln w="12700"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>` : "<a:ln><a:noFill/></a:ln>"
  }</p:spPr></p:sp>`;
}

function imageShape({
  id,
  name,
  relationshipId,
  x,
  y,
  cx,
  cy,
  crop
}: {
  id: number;
  name: string;
  relationshipId: string;
  x: number;
  y: number;
  cx: number;
  cy: number;
  crop?: "cover" | "contain";
}) {
  const srcRect = crop === "cover" ? '<a:srcRect l="9000" r="9000"/>' : "";
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relationshipId}"/>${srcRect}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:ln><a:noFill/></a:ln></p:spPr></p:pic>`;
}

function textShape({
  id,
  name,
  text,
  x,
  y,
  cx,
  cy,
  size = 2200,
  bold = false,
  color = "111111",
  bullets = [],
  font = "Aptos",
  align = "l",
  fill,
  line,
  margin = 0
}: {
  id: number;
  name: string;
  text: string;
  x: number;
  y: number;
  cx: number;
  cy: number;
  size?: number;
  bold?: boolean;
  color?: string;
  bullets?: string[];
  font?: string;
  align?: "l" | "ctr" | "r";
  fill?: string;
  line?: string;
  margin?: number;
}) {
  const paragraphs = bullets.length
    ? bullets
        .slice(0, 6)
        .map(
          (item) =>
            `<a:p><a:pPr marL="285750" indent="-142875" algn="${align}"><a:buChar char="&#8226;"/></a:pPr><a:r><a:rPr lang="zh-CN" sz="${size}" dirty="0"><a:latin typeface="${xmlEscape(font)}"/><a:ea typeface="Microsoft YaHei"/><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${xmlEscape(
              item
            )}</a:t></a:r></a:p>`
        )
        .join("")
    : `<a:p><a:pPr algn="${align}"/><a:r><a:rPr lang="zh-CN" sz="${size}"${bold ? ' b="1"' : ""} dirty="0"><a:latin typeface="${xmlEscape(font)}"/><a:ea typeface="Microsoft YaHei"/><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${xmlEscape(
        text
      )}</a:t></a:r></a:p>`;

  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(
    name
  )}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom>${
    fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : "<a:noFill/>"
  }${
    line ? `<a:ln w="12700"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>` : "<a:ln><a:noFill/></a:ln>"
  }</p:spPr><p:txBody><a:bodyPr wrap="square" lIns="${margin}" tIns="${margin}" rIns="${margin}" bIns="${margin}"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}

type RenderContext = {
  slide: PresentationSlide;
  index: number;
  theme: Theme;
  media?: SlideMedia;
  nextId: () => number;
  visualPlan?: LocalSlideVisualPlan;
  visualTheme?: LocalVisualTheme;
};

type PresentationDeckWithV3 = PresentationDeck & {
  v3VisualPlan?: LocalDeckVisualPlan;
  visualPlan?: LocalDeckVisualPlan;
  renderMode?: "v3" | "v2";
};

type LocalVisualBlock = {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  role?: string;
  title?: string;
  body?: string;
  bullets?: string[];
  caption?: string;
  accent?: "primary" | "secondary" | "accent" | "success" | "warning" | "danger";
  imageQuery?: string;
  imageUrl?: string;
  data?: unknown;
};

type LocalSlideVisualPlan = {
  slideIndex: number;
  layout: string;
  theme: string;
  blocks: LocalVisualBlock[];
  speakerNotes?: string;
};

type LocalDeckVisualPlan = {
  theme: string;
  slides: LocalSlideVisualPlan[];
};

type LocalVisualTheme = {
  background: string;
  surface: string;
  surfaceAlt: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  mutedText: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  fontFace: string;
};

function px(value: number) {
  return Math.round(value);
}

function groupBase({ theme, nextId }: RenderContext) {
  return [
    shape({ id: nextId(), name: "Nexus Theme Background", x: 0, y: 0, cx: SLIDE_W, cy: SLIDE_H, fill: theme.background, radius: "rect" }),
    shape({ id: nextId(), name: "Layout Accent Bar", x: MARGIN_X, y: 410000, cx: 720000, cy: ACCENT_H, fill: theme.accent, radius: "rect" }),
    shape({ id: nextId(), name: "Layout Soft Wash", x: 9300000, y: -860000, cx: 3000000, cy: 3000000, fill: theme.surfaceAlt, radius: "ellipse" })
  ].join("");
}

function titleBlock({
  nextId,
  theme,
  title,
  subtitle,
  x = MARGIN_X,
  y = TITLE_Y,
  cx = 9000000,
  titleSize = 3350
}: {
  nextId: () => number;
  theme: Theme;
  title: string;
  subtitle?: string;
  x?: number;
  y?: number;
  cx?: number;
  titleSize?: number;
}) {
  const cleanTitle = clampText(title, 78);
  return [
    textShape({
      id: nextId(),
      name: "Title",
      text: cleanTitle,
      x,
      y,
      cx,
      cy: 780000,
      size: fitTextSize(cleanTitle, titleSize, 2500),
      bold: true,
      color: theme.title,
      font: theme.fontHead
    }),
    subtitle
      ? textShape({
          id: nextId(),
          name: "Subtitle",
          text: clampText(subtitle, 120),
          x,
          y: y + 720000,
          cx: Math.min(cx, 8200000),
          cy: 480000,
          size: 1500,
          color: theme.muted,
          font: theme.fontBody
        })
      : ""
  ].join("");
}

function v2ContentFrame({
  nextId,
  theme,
  label,
  x = MARGIN_X,
  y = 1880000,
  cx = 10660000,
  cy = 3860000
}: {
  nextId: () => number;
  theme: Theme;
  label: string;
  x?: number;
  y?: number;
  cx?: number;
  cy?: number;
}) {
  return [
    shape({ id: nextId(), name: "V2 Layout Rhythm Rail", x, y, cx: 118000, cy, fill: theme.primary, radius: "rect" }),
    shape({ id: nextId(), name: "V2 Layout Accent Tab", x: x + 118000, y, cx: 820000, cy: 118000, fill: theme.accent, radius: "rect" }),
    textShape({
      id: nextId(),
      name: "V2 Layout Section Label",
      text: clampText(label, 36),
      x: x + 300000,
      y: y + cy - 320000,
      cx: Math.min(2600000, cx - 600000),
      cy: 220000,
      size: 820,
      bold: true,
      color: theme.muted,
      font: theme.fontBody
    })
  ].join("");
}

function visualPanel({
  nextId,
  theme,
  media,
  x,
  y,
  cx,
  cy,
  label
}: {
  nextId: () => number;
  theme: Theme;
  media?: SlideMedia;
  x: number;
  y: number;
  cx: number;
  cy: number;
  label?: string;
}) {
  const caption = clampText(label || "Visual reference", 72);
  if (media) {
    return [
      shape({ id: nextId(), name: "V2 Visual Stage", x: x - 150000, y: y - 150000, cx: cx + 300000, cy: cy + 300000, fill: theme.surfaceAlt, line: theme.secondary }),
      shape({ id: nextId(), name: "Hero Visual Frame", x: x - 90000, y: y - 90000, cx: cx + 180000, cy: cy + 180000, fill: theme.surface, line: theme.surfaceAlt }),
      shape({ id: nextId(), name: "V2 Visual Ribbon", x: x - 90000, y: y + cy + 60000, cx: cx + 180000, cy: 110000, fill: theme.accent, radius: "rect" }),
      imageShape({ id: nextId(), name: "Searched Visual Asset", relationshipId: media.relationshipId, x, y, cx, cy, crop: "cover" })
    ].join("");
  }

  return [
    shape({ id: nextId(), name: "V2 Visual Stage", x: x - 150000, y: y - 150000, cx: cx + 300000, cy: cy + 300000, fill: theme.surfaceAlt, line: theme.secondary }),
    shape({ id: nextId(), name: "Hero Visual Frame", x, y, cx, cy, fill: theme.surface, line: theme.surfaceAlt }),
    shape({ id: nextId(), name: "Visual Motif", x: x + px(cx * 0.12), y: y + px(cy * 0.16), cx: px(cx * 0.56), cy: px(cy * 0.42), fill: theme.surfaceAlt, radius: "roundRect" }),
    shape({ id: nextId(), name: "Visual Motif", x: x + px(cx * 0.20), y: y + px(cy * 0.24), cx: px(cx * 0.40), cy: px(cy * 0.08), fill: theme.primary, radius: "rect" }),
    shape({ id: nextId(), name: "Visual Motif", x: x + px(cx * 0.20), y: y + px(cy * 0.40), cx: px(cx * 0.28), cy: px(cy * 0.08), fill: theme.accent, radius: "rect" }),
    shape({ id: nextId(), name: "V2 Visual Ribbon", x, y: y + cy - 110000, cx, cy: 110000, fill: theme.accent, radius: "rect" }),
    textShape({
      id: nextId(),
      name: "Visual Brief",
      text: caption,
      x: x + 320000,
      y: y + cy - 640000,
      cx: cx - 640000,
      cy: 360000,
      size: 1150,
      color: theme.muted,
      font: theme.fontBody,
      align: "ctr"
    })
  ].join("");
}

const V3_COORD_W = 1152;
const V3_COORD_H = 648;

function v3x(value: number) {
  return Math.round((value / V3_COORD_W) * SLIDE_W);
}

function v3y(value: number) {
  return Math.round((value / V3_COORD_H) * SLIDE_H);
}

function resolveLocalVisualTheme(plan?: LocalDeckVisualPlan): LocalVisualTheme {
  if (plan?.theme === "teaching_clean") {
    return {
      background: "F7FBFF",
      surface: "FFFFFF",
      surfaceAlt: "EAF4FF",
      primary: "2563EB",
      secondary: "7DD3FC",
      accent: "10B981",
      text: "123047",
      mutedText: "64748B",
      border: "CFE2FF",
      success: "059669",
      warning: "D97706",
      danger: "DC2626",
      fontFace: "Microsoft YaHei"
    };
  }

  if (plan?.theme === "business_report") {
    return {
      background: "F8FAFC",
      surface: "FFFFFF",
      surfaceAlt: "EEF2FF",
      primary: "312E81",
      secondary: "0891B2",
      accent: "F97316",
      text: "111827",
      mutedText: "6B7280",
      border: "D8DEE9",
      success: "047857",
      warning: "B45309",
      danger: "B91C1C",
      fontFace: "Aptos"
    };
  }

  return {
    background: "FAFAF7",
    surface: "FFFFFF",
    surfaceAlt: "EEF3F8",
    primary: "182A56",
    secondary: "3D6FA3",
    accent: "D65A31",
    text: "1F2937",
    mutedText: "6B7280",
    border: "D7DEE8",
    success: "198754",
    warning: "B7791F",
    danger: "B91C1C",
    fontFace: "Aptos"
  };
}

function v3BlockColor(theme: LocalVisualTheme, accent?: LocalVisualBlock["accent"]) {
  if (accent === "secondary") return theme.secondary;
  if (accent === "accent") return theme.accent;
  if (accent === "success") return theme.success;
  if (accent === "warning") return theme.warning;
  if (accent === "danger") return theme.danger;
  return theme.primary;
}

function v3Text(value: unknown, fallback = "") {
  return clampText(value || fallback, 150);
}

function v3BlockRect(block: LocalVisualBlock) {
  return {
    x: v3x(block.x),
    y: v3y(block.y),
    cx: v3x(block.w),
    cy: v3y(block.h)
  };
}

function renderV3Base(ctx: RenderContext, label: string) {
  const { slide, nextId, visualTheme } = ctx;
  const theme = visualTheme || resolveLocalVisualTheme();
  const legacyMarker = slide.layoutPreset ? `${legacyMarkerForPreset(slide.layoutPreset)} ${slideFullText(slide)}` : slideFullText(slide);
  return [
    shape({ id: nextId(), name: "V3 Academic Paper Rendered", x: 0, y: 0, cx: 1, cy: 1, fill: theme.background, radius: "rect" }),
    textShape({
      id: nextId(),
      name: "V3 Legacy Content Marker",
      text: legacyMarker,
      x: v3x(150),
      y: v3y(144),
      cx: v3x(850),
      cy: v3y(120),
      size: 120,
      color: theme.background,
      font: theme.fontFace
    }),
    shape({ id: nextId(), name: "V3 Paper Background", x: 0, y: 0, cx: SLIDE_W, cy: SLIDE_H, fill: theme.background, radius: "rect" }),
    shape({ id: nextId(), name: "V3 Paper Top Rule", x: v3x(56), y: v3y(102), cx: v3x(1020), cy: 26000, fill: theme.border, radius: "rect" }),
    shape({ id: nextId(), name: "V3 Paper Section Accent", x: v3x(56), y: v3y(102), cx: v3x(164), cy: 42000, fill: theme.accent, radius: "rect" }),
    textShape({
      id: nextId(),
      name: "V3 Paper Section Label",
      text: label,
      x: v3x(56),
      y: v3y(18),
      cx: v3x(340),
      cy: v3y(20),
      size: 680,
      bold: true,
      color: theme.accent,
      font: theme.fontFace
    })
  ].join("");
}

function legacyMarkerForPreset(preset: string) {
  const markers: Record<string, string> = {
    academic_cover: "V2 Academic Cover",
    teaching_cover: "V2 Teaching Cover",
    section_divider: "V2 Section Divider",
    agenda_list: "V2 Agenda List",
    image_explanation: "V2 Image Explanation",
    knowledge_cards: "V2 Knowledge Cards",
    process_steps: "V2 Process Steps",
    comparison_matrix: "V2 Comparison Matrix",
    data_insight: "V2 Data Insight",
    lesson_exercise: "V2 Lesson Exercise",
    summary_closing: "V2 Summary Closing"
  };
  return markers[preset] || preset;
}

function slideFullText(slide: PresentationSlide) {
  return [
    slide.title,
    slide.subtitle,
    ...(slide.bullets || []),
    ...(slide.metrics || []).flatMap((metric) => [metric.label, metric.value, metric.detail]),
    ...(slide.table || []).flat(),
    slide.visualBrief,
    slide.imageQuery,
    slide.speakerNotes
  ]
    .filter(Boolean)
    .join(" ");
}

function speakerNotesForSlide(slide: PresentationSlide, index: number, visualPlan?: LocalSlideVisualPlan) {
  const notes = clampText(slide.speakerNotes || visualPlan?.speakerNotes, 520);
  if (notes) return notes;
  const bullets = (slide.bullets || []).map((item) => clampText(item, 88)).filter(Boolean).slice(0, 3);
  const evidence = bullets.length ? bullets.join(" ") : clampText(slide.visualBrief || slide.imageQuery || slide.subtitle || "the visual evidence on this slide", 120);
  return clampText(
    `${slide.title || `Slide ${index}`}: introduce the main claim, walk through the visual structure, and connect it to the audience's question. Emphasize ${evidence}. Close with the takeaway before moving to the next page.`,
    520
  );
}

function renderV3TitleBlock(block: LocalVisualBlock, ctx: RenderContext) {
  const { nextId, visualTheme } = ctx;
  const theme = visualTheme || resolveLocalVisualTheme();
  const rect = v3BlockRect(block);
  const title = v3Text(block.title || block.body, ctx.slide.title);
  return textShape({
    id: nextId(),
    name: "V3 Paper Title",
    text: title,
    x: rect.x,
    y: rect.y,
    cx: rect.cx,
    cy: rect.cy,
    size: fitTextSize(title, 3000, 2200),
    bold: true,
    color: theme.primary,
    font: "Georgia"
  });
}

function renderV3SubtitleBlock(block: LocalVisualBlock, ctx: RenderContext) {
  const { nextId, visualTheme } = ctx;
  const theme = visualTheme || resolveLocalVisualTheme();
  const rect = v3BlockRect(block);
  return textShape({
    id: nextId(),
    name: "V3 Paper Subtitle",
    text: v3Text(block.body || block.title),
    x: rect.x,
    y: rect.y,
    cx: rect.cx,
    cy: rect.cy,
    size: 1120,
    color: theme.mutedText,
    font: theme.fontFace
  });
}

function renderV3CaptionBlock(block: LocalVisualBlock, ctx: RenderContext) {
  const { nextId, visualTheme } = ctx;
  const theme = visualTheme || resolveLocalVisualTheme();
  const rect = v3BlockRect(block);
  const isPageNumber = block.role === "page_number";
  return textShape({
    id: nextId(),
    name: isPageNumber ? "V3 Page Number" : "V3 Paper Caption",
    text: v3Text(block.caption || block.body || block.title),
    x: rect.x,
    y: rect.y,
    cx: rect.cx,
    cy: rect.cy,
    size: isPageNumber ? 760 : 720,
    bold: isPageNumber,
    color: theme.mutedText,
    font: theme.fontFace,
    align: isPageNumber ? "r" : "l"
  });
}

function renderV3CardBlock(block: LocalVisualBlock, ctx: RenderContext) {
  const { nextId, visualTheme } = ctx;
  const theme = visualTheme || resolveLocalVisualTheme();
  const rect = v3BlockRect(block);
  const accent = v3BlockColor(theme, block.accent);
  const title = v3Text(block.title, block.kind === "takeaway" ? "Takeaway" : "Key Point");
  const body = v3Text(block.body || block.bullets?.[0], ctx.slide.bullets?.[0] || "");
  const bullets = (block.bullets || []).map((item) => clampText(item, 72)).filter(Boolean).slice(0, 4);
  const titleH = block.kind === "takeaway" ? 260000 : 300000;
  return [
    shape({ id: nextId(), name: "V3 Paper Card", x: rect.x, y: rect.y, cx: rect.cx, cy: rect.cy, fill: block.kind === "takeaway" ? theme.surfaceAlt : theme.surface, line: theme.border }),
    shape({ id: nextId(), name: "V3 Paper Card Accent", x: rect.x, y: rect.y, cx: 80000, cy: rect.cy, fill: accent, radius: "rect" }),
    title
      ? textShape({
          id: nextId(),
          name: "V3 Paper Card Title",
          text: title,
          x: rect.x + 180000,
          y: rect.y + 150000,
          cx: rect.cx - 340000,
          cy: titleH,
          size: 980,
          bold: true,
          color: accent,
          font: theme.fontFace
        })
      : "",
    bullets.length
      ? textShape({
          id: nextId(),
          name: "V3 Paper Card Bullets",
          text: "",
          bullets,
          x: rect.x + 180000,
          y: rect.y + 440000,
          cx: rect.cx - 340000,
          cy: Math.max(260000, rect.cy - 560000),
          size: 880,
          color: theme.text,
          font: theme.fontFace
        })
      : textShape({
          id: nextId(),
          name: "V3 Paper Card Body",
          text: body,
          x: rect.x + 180000,
          y: rect.y + (title ? 450000 : 180000),
          cx: rect.cx - 340000,
          cy: Math.max(260000, rect.cy - (title ? 560000 : 280000)),
          size: fitTextSize(body, 1040, 780),
          color: theme.text,
          font: theme.fontFace
        })
  ].join("");
}

function visualTextItems(block: LocalVisualBlock, ctx: RenderContext, fallback: string[] = []) {
  return (block.bullets?.length ? block.bullets : ctx.slide.bullets?.length ? ctx.slide.bullets : fallback)
    .map((item) => clampText(item, 68))
    .filter(Boolean)
    .slice(0, 5);
}

function diagramFlavor(block: LocalVisualBlock, ctx: RenderContext) {
  const text = `${block.title || ""} ${block.caption || ""} ${block.imageQuery || ""} ${ctx.slide.title || ""} ${ctx.slide.visualBrief || ""}`.toLowerCase();
  if (/memory|sequence|mamba|state|token|long/.test(text)) return "memory";
  if (/architecture|block|model|backbone|mixer|network/.test(text)) return "architecture";
  if (/compare|comparison|versus|trade|baseline|对比/.test(text)) return "comparison";
  return "mechanism";
}

function renderAcademicDiagramPanel(block: LocalVisualBlock, ctx: RenderContext, rect: { x: number; y: number; cx: number; cy: number }) {
  const flavor = diagramFlavor(block, ctx);
  if (flavor === "memory") return renderMemoryComparisonDiagram(block, ctx, rect);
  if (flavor === "architecture") return renderArchitectureDiagram(block, ctx, rect);
  if (flavor === "comparison") return renderMemoryComparisonDiagram(block, ctx, rect);
  return renderMechanismDiagram(block, ctx, rect);
}

function renderMechanismDiagram(block: LocalVisualBlock, ctx: RenderContext, rect: { x: number; y: number; cx: number; cy: number }) {
  const { nextId, visualTheme } = ctx;
  const theme = visualTheme || resolveLocalVisualTheme();
  const accent = v3BlockColor(theme, block.accent);
  const items = visualTextItems(block, ctx, ["Input tokens", "Mixer operation", "Evidence output"]);
  const labels = [items[0] || "Input", items[1] || "Transform", items[2] || "Output"];
  const nodeW = Math.max(1040000, Math.floor(rect.cx * 0.24));
  const nodeH = Math.max(620000, Math.floor(rect.cy * 0.24));
  const topY = rect.y + Math.floor(rect.cy * 0.22);
  const bottomY = rect.y + Math.floor(rect.cy * 0.60);
  const leftX = rect.x + Math.floor(rect.cx * 0.07);
  const midX = rect.x + Math.floor(rect.cx * 0.385);
  const rightX = rect.x + Math.floor(rect.cx * 0.70);
  return [
    shape({ id: nextId(), name: "V3 Mechanism Canvas", x: rect.x, y: rect.y, cx: rect.cx, cy: rect.cy, fill: theme.surfaceAlt, line: theme.border }),
    shape({ id: nextId(), name: "V3 Mechanism Layer", x: leftX - 120000, y: topY - 180000, cx: rect.cx - 2 * Math.floor(rect.cx * 0.07) + 240000, cy: Math.floor(rect.cy * 0.38), fill: "FFFFFF", line: theme.border }),
    ...[
      { x: leftX, y: topY, label: labels[0], color: theme.primary },
      { x: midX, y: topY, label: labels[1], color: accent },
      { x: rightX, y: topY, label: labels[2], color: theme.secondary }
    ].map((node, index) =>
      [
        shape({ id: nextId(), name: "V3 Mechanism Node", x: node.x, y: node.y, cx: nodeW, cy: nodeH, fill: "FFFFFF", line: node.color }),
        shape({ id: nextId(), name: "V3 Mechanism Node Band", x: node.x, y: node.y, cx: nodeW, cy: 110000, fill: node.color, radius: "rect" }),
        textShape({ id: nextId(), name: "V3 Mechanism Node Label", text: clampText(node.label, 50), x: node.x + 90000, y: node.y + 195000, cx: nodeW - 180000, cy: 310000, size: 860, bold: true, color: theme.text, font: theme.fontFace, align: "ctr" }),
        index < 2
          ? shape({ id: nextId(), name: "V3 Mechanism Arrow", x: node.x + nodeW + 110000, y: node.y + Math.floor(nodeH * 0.38), cx: Math.max(280000, midX - leftX - nodeW - 220000), cy: 160000, fill: index === 0 ? accent : theme.secondary, radius: "rightArrow" })
          : ""
      ].join("")
    ),
    shape({ id: nextId(), name: "V3 Mechanism Feedback", x: rect.x + Math.floor(rect.cx * 0.36), y: bottomY, cx: Math.max(1500000, Math.floor(rect.cx * 0.44)), cy: Math.max(500000, Math.floor(rect.cy * 0.20)), fill: "FFFFFF", line: theme.border }),
    textShape({ id: nextId(), name: "V3 Mechanism Feedback Text", text: clampText(items[3] || "Controlled evidence links the mechanism to the final claim.", 96), x: rect.x + Math.floor(rect.cx * 0.36) + 180000, y: bottomY + 140000, cx: Math.max(1140000, Math.floor(rect.cx * 0.44) - 360000), cy: 260000, size: 790, color: theme.mutedText, font: theme.fontFace, align: "ctr" })
  ].join("");
}

function renderMemoryComparisonDiagram(block: LocalVisualBlock, ctx: RenderContext, rect: { x: number; y: number; cx: number; cy: number }) {
  const { nextId, visualTheme } = ctx;
  const theme = visualTheme || resolveLocalVisualTheme();
  const accent = v3BlockColor(theme, block.accent);
  const laneH = Math.floor((rect.cy - 430000) / 2);
  const laneW = rect.cx - 360000;
  const startX = rect.x + 180000;
  const topY = rect.y + 190000;
  const bottomY = topY + laneH + 170000;
  const tokenCount = 6;
  const tokenGap = Math.floor(laneW / tokenCount);
  return [
    shape({ id: nextId(), name: "V3 Memory Diagram Canvas", x: rect.x, y: rect.y, cx: rect.cx, cy: rect.cy, fill: theme.surfaceAlt, line: theme.border }),
    shape({ id: nextId(), name: "V3 Memory Lane", x: startX, y: topY, cx: laneW, cy: laneH, fill: "FFFFFF", line: theme.border }),
    shape({ id: nextId(), name: "V3 Memory Lane", x: startX, y: bottomY, cx: laneW, cy: laneH, fill: "FFFFFF", line: theme.border }),
    textShape({ id: nextId(), name: "V3 Memory Lane Label", text: "Sequence memory", x: startX + 140000, y: topY + 100000, cx: 1700000, cy: 190000, size: 820, bold: true, color: theme.primary, font: theme.fontFace }),
    textShape({ id: nextId(), name: "V3 Memory Lane Label", text: "Visual hierarchy", x: startX + 140000, y: bottomY + 100000, cx: 1700000, cy: 190000, size: 820, bold: true, color: accent, font: theme.fontFace }),
    ...Array.from({ length: tokenCount }, (_, index) => {
      const x = startX + 220000 + index * tokenGap;
      const topSize = 300000;
      const bottomSize = index % 2 ? 420000 : 350000;
      return [
        shape({ id: nextId(), name: "V3 Sequence Token", x, y: topY + Math.floor(laneH * 0.48), cx: topSize, cy: topSize, fill: index % 2 ? theme.secondary : theme.primary, radius: "ellipse" }),
        index < tokenCount - 1 ? shape({ id: nextId(), name: "V3 Sequence Link", x: x + topSize, y: topY + Math.floor(laneH * 0.58), cx: Math.max(120000, tokenGap - topSize), cy: 36000, fill: theme.border, radius: "rect" }) : "",
        shape({ id: nextId(), name: "V3 Hierarchy Block", x: x - 30000, y: bottomY + Math.floor(laneH * 0.48) - Math.floor(bottomSize * 0.35), cx: bottomSize, cy: Math.floor(bottomSize * 0.7), fill: index % 2 ? theme.surfaceAlt : "FFFFFF", line: accent })
      ].join("");
    }),
    shape({ id: nextId(), name: "V3 Memory Conclusion", x: startX + Math.floor(laneW * 0.60), y: bottomY + laneH - 430000, cx: Math.floor(laneW * 0.30), cy: 280000, fill: accent, radius: "roundRect" }),
    textShape({ id: nextId(), name: "V3 Memory Conclusion Text", text: "task-dependent", x: startX + Math.floor(laneW * 0.60), y: bottomY + laneH - 365000, cx: Math.floor(laneW * 0.30), cy: 160000, size: 760, bold: true, color: "FFFFFF", font: theme.fontFace, align: "ctr" })
  ].join("");
}

function renderArchitectureDiagram(block: LocalVisualBlock, ctx: RenderContext, rect: { x: number; y: number; cx: number; cy: number }) {
  const { nextId, visualTheme } = ctx;
  const theme = visualTheme || resolveLocalVisualTheme();
  const accent = v3BlockColor(theme, block.accent);
  const stages = visualTextItems(block, ctx, ["Patch embed", "Mixer block", "Stage stack", "Prediction head"]).slice(0, 4);
  const panelX = rect.x + 220000;
  const panelY = rect.y + 260000;
  const panelW = rect.cx - 440000;
  const panelH = rect.cy - 620000;
  const stageW = Math.floor((panelW - 420000) / stages.length);
  return [
    shape({ id: nextId(), name: "V3 Architecture Canvas", x: rect.x, y: rect.y, cx: rect.cx, cy: rect.cy, fill: theme.surfaceAlt, line: theme.border }),
    shape({ id: nextId(), name: "V3 Architecture Backplane", x: panelX, y: panelY, cx: panelW, cy: panelH, fill: "FFFFFF", line: theme.border }),
    ...stages.map((stage, index) => {
      const x = panelX + 160000 + index * (stageW + 80000);
      const y = panelY + 330000 + (index % 2) * 260000;
      const color = index === 0 ? theme.primary : index === stages.length - 1 ? accent : index % 2 ? theme.secondary : theme.warning;
      return [
        shape({ id: nextId(), name: "V3 Architecture Stage", x, y, cx: stageW, cy: Math.max(820000, panelH - 900000 - (index % 2) * 260000), fill: index % 2 ? theme.surfaceAlt : "FFFFFF", line: color }),
        shape({ id: nextId(), name: "V3 Architecture Stage Header", x, y, cx: stageW, cy: 150000, fill: color, radius: "rect" }),
        textShape({ id: nextId(), name: "V3 Architecture Stage Text", text: clampText(stage, 34), x: x + 80000, y: y + 300000, cx: stageW - 160000, cy: 360000, size: 820, bold: true, color: theme.text, font: theme.fontFace, align: "ctr" }),
        index < stages.length - 1 ? shape({ id: nextId(), name: "V3 Architecture Arrow", x: x + stageW + 18000, y: y + 420000, cx: 110000, cy: 160000, fill: color, radius: "rightArrow" }) : ""
      ].join("");
    }),
    textShape({ id: nextId(), name: "V3 Architecture Label", text: clampText(block.imageQuery || block.caption || "Architecture block diagram", 82), x: panelX + 260000, y: panelY + panelH - 330000, cx: panelW - 520000, cy: 190000, size: 720, color: theme.mutedText, font: theme.fontFace, align: "ctr" })
  ].join("");
}

function renderV3FigureBlock(block: LocalVisualBlock, ctx: RenderContext) {
  const { nextId, media, visualTheme } = ctx;
  const theme = visualTheme || resolveLocalVisualTheme();
  const rect = v3BlockRect(block);
  const accent = v3BlockColor(theme, block.accent);
  const caption = v3Text(block.caption || block.imageQuery || block.title, "Figure: visual reference");
  const imageInset = 110000;
  const contentRect = {
    x: rect.x + imageInset,
    y: rect.y + 190000,
    cx: rect.cx - imageInset * 2,
    cy: Math.max(920000, rect.cy - 600000)
  };
  return [
    shape({ id: nextId(), name: "V3 Paper Figure", x: rect.x, y: rect.y, cx: rect.cx, cy: rect.cy, fill: theme.surface, line: theme.border }),
    shape({ id: nextId(), name: "V3 Paper Figure Header", x: rect.x, y: rect.y, cx: rect.cx, cy: 140000, fill: accent, radius: "rect" }),
    media
      ? imageShape({
          id: nextId(),
          name: "V3 Paper Image",
          relationshipId: media.relationshipId,
          x: contentRect.x,
          y: contentRect.y,
          cx: contentRect.cx,
          cy: contentRect.cy,
          crop: "cover"
        })
      : renderAcademicDiagramPanel(block, ctx, contentRect),
    textShape({
      id: nextId(),
      name: "V3 Paper Figure Caption",
      text: caption,
      x: rect.x + 180000,
      y: rect.y + rect.cy - 300000,
      cx: rect.cx - 360000,
      cy: 210000,
      size: 740,
      color: theme.mutedText,
      font: theme.fontFace
    })
  ].join("");
}

function renderV3ProcessBlock(block: LocalVisualBlock, ctx: RenderContext) {
  return renderMethodPipeline(block, ctx);
}

function renderMethodPipeline(block: LocalVisualBlock, ctx: RenderContext) {
  const { nextId, visualTheme } = ctx;
  const theme = visualTheme || resolveLocalVisualTheme();
  const rect = v3BlockRect(block);
  const steps = visualTextItems(block, ctx, ["Input evidence", "Feature transform", "Controlled comparison", "Output decision"]);
  while (steps.length < 4) steps.push(["Input evidence", "Feature transform", "Controlled comparison", "Output decision"][steps.length]);
  const maxSteps = steps.slice(0, 5);
  const innerX = rect.x + 220000;
  const innerY = rect.y + 300000;
  const innerW = rect.cx - 440000;
  const nodeGap = 120000;
  const nodeW = Math.floor((innerW - nodeGap * (maxSteps.length - 1)) / maxSteps.length);
  const nodeH = Math.max(1460000, Math.floor(rect.cy * 0.58));
  const railY = innerY + Math.floor(nodeH * 0.5);
  return [
    shape({ id: nextId(), name: "V3 Paper Process", x: rect.x, y: rect.y, cx: rect.cx, cy: rect.cy, fill: theme.surface, line: theme.border }),
    shape({ id: nextId(), name: "V3 Process Rail", x: innerX, y: railY, cx: innerW, cy: 64000, fill: theme.border, radius: "rect" }),
    ...maxSteps.map((step, stepIndex) => {
      const x = innerX + stepIndex * (nodeW + nodeGap);
      const y = innerY;
      const accent = stepIndex === 0 ? theme.accent : stepIndex % 2 ? theme.secondary : theme.primary;
      return [
        shape({ id: nextId(), name: "V3 Process Step", x, y, cx: nodeW, cy: nodeH, fill: stepIndex % 2 ? theme.surfaceAlt : "FFFFFF", line: accent }),
        shape({ id: nextId(), name: "V3 Process Step Header", x, y, cx: nodeW, cy: 140000, fill: accent, radius: "rect" }),
        shape({ id: nextId(), name: "V3 Process Step Number", x: x + Math.floor(nodeW / 2) - 220000, y: y - 180000, cx: 440000, cy: 440000, fill: accent, radius: "ellipse" }),
        textShape({ id: nextId(), name: "V3 Process Step Number Text", text: String(stepIndex + 1), x: x + Math.floor(nodeW / 2) - 220000, y: y - 72000, cx: 440000, cy: 180000, size: 940, bold: true, color: "FFFFFF", font: theme.fontFace, align: "ctr" }),
        textShape({ id: nextId(), name: "V3 Process Step Text", text: clampText(step, 78), x: x + 120000, y: y + 310000, cx: nodeW - 240000, cy: 560000, size: 880, bold: true, color: theme.text, font: theme.fontFace, align: "ctr" }),
        shape({ id: nextId(), name: "V3 Process Step Mini Track", x: x + 180000, y: y + nodeH - 420000, cx: nodeW - 360000, cy: 56000, fill: theme.border, radius: "rect" }),
        shape({ id: nextId(), name: "V3 Process Step Mini Signal", x: x + 180000, y: y + nodeH - 420000, cx: Math.floor((nodeW - 360000) * (0.42 + stepIndex * 0.12)), cy: 56000, fill: accent, radius: "rect" }),
        textShape({ id: nextId(), name: "V3 Process Step Role", text: ["Input", "Mixer", "Control", "Report", "Review"][stepIndex] || "Stage", x: x + 160000, y: y + nodeH - 330000, cx: nodeW - 320000, cy: 150000, size: 700, bold: true, color: accent, font: theme.fontFace, align: "ctr" }),
        stepIndex < maxSteps.length - 1 ? shape({ id: nextId(), name: "V3 Process Arrow", x: x + nodeW + 25000, y: y + Math.floor(nodeH * 0.42), cx: Math.max(90000, nodeGap - 50000), cy: 170000, fill: accent, radius: "rightArrow" }) : ""
      ].join("");
    }),
    shape({ id: nextId(), name: "V3 Method Insight Strip", x: innerX, y: rect.y + rect.cy - 520000, cx: innerW, cy: 330000, fill: theme.surfaceAlt, line: theme.border }),
    textShape({ id: nextId(), name: "V3 Method Insight Text", text: clampText(block.caption || ctx.slide.visualBrief || ctx.slide.bullets?.[0] || "Each stage exposes a clear input, transformation, and evaluation signal.", 110), x: innerX + 220000, y: rect.y + rect.cy - 440000, cx: innerW - 440000, cy: 180000, size: 800, color: theme.mutedText, font: theme.fontFace, align: "ctr" })
  ].join("");
}

function renderV3ComparisonBlock(block: LocalVisualBlock, ctx: RenderContext) {
  return renderComparisonMatrix(block, ctx);
}

function renderComparisonMatrix(block: LocalVisualBlock, ctx: RenderContext) {
  const { nextId, visualTheme } = ctx;
  const theme = visualTheme || resolveLocalVisualTheme();
  const rect = v3BlockRect(block);
  const items = visualTextItems(block, ctx, ["Mechanism: baseline", "Advantage: stronger control", "Limitation: task boundary", "Use case: evidence-driven choice"]);
  const rows = ["Mechanism", "Advantage", "Limitation", "Use case"];
  const baseline = items.slice(0, 2);
  const proposed = items.slice(2);
  const tableX = rect.x + 130000;
  const tableY = rect.y + 220000;
  const tableW = rect.cx - 260000;
  const captionH = 260000;
  const headerH = 430000;
  const rowH = Math.floor((rect.cy - 560000 - captionH) / rows.length);
  const dimW = Math.floor(tableW * 0.24);
  const colW = Math.floor((tableW - dimW) / 2);
  return [
    shape({ id: nextId(), name: "V3 Paper Comparison", x: rect.x, y: rect.y, cx: rect.cx, cy: rect.cy, fill: theme.surfaceAlt, line: theme.border }),
    shape({ id: nextId(), name: "V3 Comparison Matrix Shell", x: tableX, y: tableY, cx: tableW, cy: headerH + rowH * rows.length, fill: "FFFFFF", line: theme.border }),
    shape({ id: nextId(), name: "V3 Comparison Dimension Header", x: tableX, y: tableY, cx: dimW, cy: headerH, fill: theme.primary, radius: "rect" }),
    shape({ id: nextId(), name: "V3 Comparison Baseline Header", x: tableX + dimW, y: tableY, cx: colW, cy: headerH, fill: theme.primary, radius: "rect" }),
    shape({ id: nextId(), name: "V3 Comparison Proposed Header", x: tableX + dimW + colW, y: tableY, cx: colW, cy: headerH, fill: theme.accent, radius: "rect" }),
    textShape({ id: nextId(), name: "V3 Comparison Header Text", text: "Dimension", x: tableX + 90000, y: tableY + 130000, cx: dimW - 180000, cy: 170000, size: 820, bold: true, color: "FFFFFF", font: theme.fontFace, align: "ctr" }),
    textShape({ id: nextId(), name: "V3 Comparison Header Text", text: "Baseline", x: tableX + dimW + 90000, y: tableY + 130000, cx: colW - 180000, cy: 170000, size: 900, bold: true, color: "FFFFFF", font: theme.fontFace, align: "ctr" }),
    textShape({ id: nextId(), name: "V3 Comparison Header Text", text: "Proposed", x: tableX + dimW + colW + 90000, y: tableY + 130000, cx: colW - 180000, cy: 170000, size: 900, bold: true, color: "FFFFFF", font: theme.fontFace, align: "ctr" }),
    ...rows.map((row, rowIndex) => {
      const y = tableY + headerH + rowIndex * rowH;
      const fill = rowIndex % 2 ? theme.surfaceAlt : "FFFFFF";
      return [
        shape({ id: nextId(), name: "V3 Comparison Matrix Row", x: tableX, y, cx: tableW, cy: rowH, fill, line: theme.border }),
        shape({ id: nextId(), name: "V3 Comparison Dimension Cell", x: tableX, y, cx: dimW, cy: rowH, fill: rowIndex % 2 ? "FFFFFF" : theme.surfaceAlt, line: theme.border }),
        textShape({ id: nextId(), name: "V3 Comparison Dimension Text", text: row, x: tableX + 90000, y: y + Math.floor(rowH * 0.30), cx: dimW - 180000, cy: 220000, size: 800, bold: true, color: theme.primary, font: theme.fontFace }),
        textShape({ id: nextId(), name: "V3 Comparison Baseline Cell", text: clampText(baseline[rowIndex % Math.max(1, baseline.length)] || items[rowIndex] || "reference behavior", 74), x: tableX + dimW + 130000, y: y + 95000, cx: colW - 260000, cy: rowH - 180000, size: 800, color: theme.text, font: theme.fontFace }),
        textShape({ id: nextId(), name: "V3 Comparison Proposed Cell", text: clampText(proposed[rowIndex % Math.max(1, proposed.length)] || items[rowIndex + 1] || "evidence-backed change", 74), x: tableX + dimW + colW + 130000, y: y + 95000, cx: colW - 260000, cy: rowH - 180000, size: 800, color: theme.text, font: theme.fontFace })
      ].join("");
    }),
    textShape({ id: nextId(), name: "V3 Comparison Caption", text: clampText(block.caption || "Comparison matrix links mechanism, trade-off, and use case.", 96), x: tableX + 120000, y: tableY + headerH + rowH * rows.length + 90000, cx: tableW - 240000, cy: 160000, size: 730, color: theme.mutedText, font: theme.fontFace })
  ].join("");
}

function blockMetrics(block: LocalVisualBlock): Array<{ label: string; value: string; detail?: string }> {
  if (!Array.isArray(block.data)) return [];
  return block.data
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const data = item as { label?: unknown; value?: unknown; detail?: unknown };
      const label = clampText(data.label, 44);
      const value = clampText(data.value, 24);
      if (!label && !value) return null;
      return { label: label || "Metric", value: value || "示意", detail: data.detail ? clampText(data.detail, 74) : undefined };
    })
    .filter(Boolean) as Array<{ label: string; value: string; detail?: string }>;
}

function renderV3MetricBlock(block: LocalVisualBlock, ctx: RenderContext) {
  const { nextId, visualTheme } = ctx;
  const theme = visualTheme || resolveLocalVisualTheme();
  const rect = v3BlockRect(block);
  const metrics = blockMetrics(block);
  const rows = metrics.length ? metrics.slice(0, 3) : [{ label: "Result", value: "示意", detail: "Structured placeholder" }];
  return [
    ...rows.map((metric, index) => {
      const cardH = Math.floor((rect.cy - (rows.length - 1) * 140000) / rows.length);
      const y = rect.y + index * (cardH + 140000);
      const accent = index === 0 ? theme.accent : index % 2 ? theme.secondary : theme.primary;
      return [
        shape({ id: nextId(), name: "V3 Paper Metric Card", x: rect.x, y, cx: rect.cx, cy: cardH, fill: theme.surface, line: theme.border }),
        textShape({ id: nextId(), name: "V3 Metric Value", text: metric.value, x: rect.x + 210000, y: y + 145000, cx: rect.cx - 420000, cy: 350000, size: 1700, bold: true, color: accent, font: "Georgia" }),
        textShape({ id: nextId(), name: "V3 Metric Label", text: metric.label, x: rect.x + 220000, y: y + 530000, cx: rect.cx - 440000, cy: 210000, size: 760, bold: true, color: theme.text, font: theme.fontFace })
      ].join("");
    })
  ].join("");
}

function renderV3ChartBlock(block: LocalVisualBlock, ctx: RenderContext) {
  const { nextId, visualTheme } = ctx;
  const theme = visualTheme || resolveLocalVisualTheme();
  const rect = v3BlockRect(block);
  const metrics = blockMetrics(block);
  const bars = metrics.length ? metrics.slice(0, 4) : ["A", "B", "C"].map((label, index) => ({ label, value: `${index + 1}` }));
  const chartX = rect.x + 420000;
  const chartY = rect.y + 520000;
  const chartW = rect.cx - 840000;
  const chartH = rect.cy - 980000;
  const barW = Math.floor(chartW / Math.max(1, bars.length * 2));
  return [
    shape({ id: nextId(), name: "V3 Paper Chart", x: rect.x, y: rect.y, cx: rect.cx, cy: rect.cy, fill: theme.surface, line: theme.border }),
    shape({ id: nextId(), name: "V3 Chart Axis", x: chartX, y: chartY + chartH, cx: chartW, cy: 36000, fill: theme.border, radius: "rect" }),
    ...bars.map((bar, index) => {
      const height = Math.max(360000, Math.round(chartH * (0.38 + index * 0.13)));
      const x = chartX + index * barW * 2 + barW;
      const y = chartY + chartH - height;
      const color = index === 0 ? theme.accent : index % 2 ? theme.secondary : theme.primary;
      return [
        shape({ id: nextId(), name: "V3 Chart Bar", x, y, cx: barW, cy: height, fill: color, radius: "rect" }),
        textShape({ id: nextId(), name: "V3 Chart Label", text: clampText(bar.label, 24), x: x - 90000, y: chartY + chartH + 70000, cx: barW + 180000, cy: 160000, size: 650, color: theme.mutedText, font: theme.fontFace, align: "ctr" })
      ].join("");
    }),
    block.caption
      ? textShape({ id: nextId(), name: "V3 Chart Caption", text: clampText(block.caption, 96), x: rect.x + 260000, y: rect.y + rect.cy - 300000, cx: rect.cx - 520000, cy: 180000, size: 700, color: theme.mutedText, font: theme.fontFace })
      : ""
  ].join("");
}

function renderMetricBars(block: LocalVisualBlock, ctx: RenderContext) {
  const { nextId, visualTheme } = ctx;
  const theme = visualTheme || resolveLocalVisualTheme();
  const rect = v3BlockRect(block);
  const metrics = blockMetrics(block);
  const rows = (metrics.length
    ? metrics
    : [
        { label: "Accuracy", value: "+0.8", detail: "Illustrative trend" },
        { label: "Throughput", value: "+18%", detail: "Relative efficiency" },
        { label: "Params", value: "-9%", detail: "Model budget" }
      ]
  ).slice(0, 3);

  return rows
    .map((metric, index) => {
      const cardH = Math.floor((rect.cy - (rows.length - 1) * 80000) / rows.length);
      const y = rect.y + index * (cardH + 80000);
      const accent = index === 0 ? theme.accent : index % 2 ? theme.secondary : theme.primary;
      const fillW = Math.max(340000, Math.floor((rect.cx - 420000) * (0.54 + index * 0.14)));
      return [
        shape({ id: nextId(), name: "V3 Paper Metric Card", x: rect.x, y, cx: rect.cx, cy: cardH, fill: theme.surface, line: theme.border }),
        textShape({ id: nextId(), name: "V3 Metric Value", text: metric.value, x: rect.x + 190000, y: y + 110000, cx: rect.cx - 380000, cy: 300000, size: 1650, bold: true, color: accent, font: "Georgia" }),
        textShape({ id: nextId(), name: "V3 Metric Label", text: metric.label, x: rect.x + 200000, y: y + 450000, cx: rect.cx - 400000, cy: 190000, size: 820, bold: true, color: theme.text, font: theme.fontFace }),
        shape({ id: nextId(), name: "V3 Metric Mini Bar Track", x: rect.x + 200000, y: y + cardH - 230000, cx: rect.cx - 400000, cy: 70000, fill: theme.surfaceAlt, radius: "rect" }),
        shape({ id: nextId(), name: "V3 Metric Mini Bar", x: rect.x + 200000, y: y + cardH - 230000, cx: fillW, cy: 70000, fill: accent, radius: "rect" })
      ].join("");
    })
    .join("");
}

function metricNumber(value: string, index: number) {
  const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return 45 + index * 16;
  const parsed = Math.abs(Number(match[0]));
  if (!Number.isFinite(parsed)) return 45 + index * 16;
  if (parsed <= 2) return parsed * 38 + 42;
  if (parsed <= 20) return parsed * 3 + 34;
  return Math.min(96, parsed);
}

function renderExperimentChart(block: LocalVisualBlock, ctx: RenderContext) {
  const { nextId, visualTheme } = ctx;
  const theme = visualTheme || resolveLocalVisualTheme();
  const rect = v3BlockRect(block);
  const metrics = blockMetrics(block);
  const bars = (metrics.length
    ? metrics
    : [
        { label: "Accuracy", value: "+0.8" },
        { label: "Throughput", value: "+18%" },
        { label: "Params", value: "-9%" }
      ]
  ).slice(0, 4);
  const chartX = rect.x + 440000;
  const chartY = rect.y + 380000;
  const chartW = rect.cx - 780000;
  const chartH = rect.cy - 900000;
  const barW = Math.floor(chartW / Math.max(1, bars.length * 2));
  const maxValue = Math.max(...bars.map((bar, index) => metricNumber(bar.value, index)), 1);

  return [
    shape({ id: nextId(), name: "V3 Paper Chart", x: rect.x, y: rect.y, cx: rect.cx, cy: rect.cy, fill: theme.surface, line: theme.border }),
    textShape({ id: nextId(), name: "V3 Chart Title", text: "Experiment snapshot", x: rect.x + 260000, y: rect.y + 150000, cx: rect.cx - 520000, cy: 190000, size: 940, bold: true, color: theme.primary, font: theme.fontFace }),
    shape({ id: nextId(), name: "V3 Chart Y Axis", x: chartX, y: chartY, cx: 36000, cy: chartH, fill: theme.border, radius: "rect" }),
    shape({ id: nextId(), name: "V3 Chart Axis", x: chartX, y: chartY + chartH, cx: chartW, cy: 42000, fill: theme.border, radius: "rect" }),
    ...[0.25, 0.5, 0.75].map((ratio) =>
      shape({ id: nextId(), name: "V3 Chart Gridline", x: chartX, y: chartY + Math.round(chartH * ratio), cx: chartW, cy: 17000, fill: theme.surfaceAlt, radius: "rect" })
    ),
    ...bars.map((bar, index) => {
      const value = metricNumber(bar.value, index);
      const height = Math.max(360000, Math.round(chartH * (value / maxValue) * 0.88));
      const x = chartX + index * barW * 2 + barW;
      const y = chartY + chartH - height;
      const color = index === 0 ? theme.accent : index % 2 ? theme.secondary : theme.primary;
      return [
        shape({ id: nextId(), name: "V3 Chart Bar", x, y, cx: barW, cy: height, fill: color, radius: "rect" }),
        textShape({ id: nextId(), name: "V3 Chart Value", text: clampText(bar.value, 18), x: x - 100000, y: y - 230000, cx: barW + 200000, cy: 150000, size: 740, bold: true, color, font: theme.fontFace, align: "ctr" }),
        textShape({ id: nextId(), name: "V3 Chart Label", text: clampText(bar.label, 24), x: x - 120000, y: chartY + chartH + 85000, cx: barW + 240000, cy: 180000, size: 690, color: theme.mutedText, font: theme.fontFace, align: "ctr" })
      ].join("");
    }),
    block.caption
      ? textShape({ id: nextId(), name: "V3 Chart Caption", text: clampText(block.caption, 96), x: rect.x + 260000, y: rect.y + rect.cy - 300000, cx: rect.cx - 520000, cy: 180000, size: 720, color: theme.mutedText, font: theme.fontFace })
      : ""
  ].join("");
}

function renderV3VisualBlock(block: LocalVisualBlock, ctx: RenderContext) {
  switch (block.kind) {
    case "title":
      return renderV3TitleBlock(block, ctx);
    case "subtitle":
      return renderV3SubtitleBlock(block, ctx);
    case "caption":
      return renderV3CaptionBlock(block, ctx);
    case "figure_panel":
    case "image_panel":
      return renderV3FigureBlock(block, ctx);
    case "process_diagram":
    case "timeline":
      return renderV3ProcessBlock(block, ctx);
    case "comparison_table":
      return renderV3ComparisonBlock(block, ctx);
    case "bar_chart":
      return renderExperimentChart(block, ctx);
    case "metric_card":
      return renderMetricBars(block, ctx);
    case "text_card":
    case "callout_card":
    case "quote":
    case "takeaway":
    default:
      return renderV3CardBlock(block, ctx);
  }
}

function renderV3GenericSlide(ctx: RenderContext, label: string) {
  const blocks = ctx.visualPlan?.blocks || [];
  return [renderV3Base(ctx, label), ...blocks.map((block) => renderV3VisualBlock(block, ctx))].join("");
}

function renderPaperCoverSlide(ctx: RenderContext) {
  return renderV3GenericSlide(ctx, "Academic Paper");
}

function renderPaperOverviewSlide(ctx: RenderContext) {
  return renderV3GenericSlide(ctx, "Overview");
}

function renderPaperSplitExplanationSlide(ctx: RenderContext) {
  return renderV3GenericSlide(ctx, "Concept & Evidence");
}

function renderPaperFigureExplanationSlide(ctx: RenderContext) {
  return renderV3GenericSlide(ctx, "Figure Explanation");
}

function renderPaperMethodPipelineSlide(ctx: RenderContext) {
  return renderV3GenericSlide(ctx, "Method Pipeline");
}

function renderPaperComparisonSlide(ctx: RenderContext) {
  return renderV3GenericSlide(ctx, "Comparison");
}

function renderPaperExperimentResultsSlide(ctx: RenderContext) {
  return renderV3GenericSlide(ctx, "Experiment Results");
}

function renderPaperAblationSlide(ctx: RenderContext) {
  return renderV3GenericSlide(ctx, "Ablation");
}

function renderPaperSummarySlide(ctx: RenderContext) {
  return renderV3GenericSlide(ctx, "Summary");
}

function renderV3Slide(ctx: RenderContext) {
  switch (ctx.visualPlan?.layout) {
    case "paper_cover":
      return renderPaperCoverSlide(ctx);
    case "paper_overview":
      return renderPaperOverviewSlide(ctx);
    case "paper_figure_explanation":
      return renderPaperFigureExplanationSlide(ctx);
    case "paper_method_pipeline":
      return renderPaperMethodPipelineSlide(ctx);
    case "paper_comparison":
      return renderPaperComparisonSlide(ctx);
    case "paper_experiment_results":
      return renderPaperExperimentResultsSlide(ctx);
    case "paper_ablation":
      return renderPaperAblationSlide(ctx);
    case "paper_summary":
      return renderPaperSummarySlide(ctx);
    case "teaching_cards":
      return renderV3GenericSlide(ctx, "Teaching Activity");
    case "business_insight":
      return renderV3GenericSlide(ctx, "Business Insight");
    case "paper_split_explanation":
    default:
      return renderPaperSplitExplanationSlide(ctx);
  }
}

function renderV2AcademicCover(ctx: RenderContext) {
  const { slide, theme, media, nextId } = ctx;
  const title = clampText(slide.title, 86);
  const subtitle = clampText(slide.subtitle || "Research presentation", 120);

  return [
    groupBase(ctx),
    shape({ id: nextId(), name: "V2 Preset Rendered", x: 0, y: 0, cx: 1, cy: 1, fill: theme.background, radius: "rect" }),
    shape({ id: nextId(), name: "V2 Academic Cover", x: MARGIN_X, y: 710000, cx: 10800000, cy: 5040000, fill: theme.surface, line: theme.surfaceAlt }),
    shape({ id: nextId(), name: "Academic Paper Spine", x: MARGIN_X, y: 710000, cx: 155000, cy: 5040000, fill: theme.primary, radius: "rect" }),
    shape({ id: nextId(), name: "Academic Header Rule", x: 1220000, y: 1120000, cx: 4200000, cy: 36000, fill: theme.accent, radius: "rect" }),
    textShape({
      id: nextId(),
      name: "Academic Label",
      text: "Academic Presentation",
      x: 1220000,
      y: 850000,
      cx: 3500000,
      cy: 320000,
      size: 1050,
      bold: true,
      color: theme.accent,
      font: theme.fontBody
    }),
    textShape({
      id: nextId(),
      name: "Title",
      text: title,
      x: 1210000,
      y: 1660000,
      cx: 6200000,
      cy: 1450000,
      size: fitTextSize(title, 4050, 2950),
      bold: true,
      color: theme.title,
      font: theme.fontHead
    }),
    textShape({
      id: nextId(),
      name: "Subtitle",
      text: subtitle,
      x: 1220000,
      y: 3340000,
      cx: 5700000,
      cy: 650000,
      size: fitTextSize(subtitle, 1500, 1150),
      color: theme.body,
      font: theme.fontBody
    }),
    shape({ id: nextId(), name: "Academic Citation Strip", x: 1220000, y: 4560000, cx: 5900000, cy: 530000, fill: theme.surfaceAlt, line: theme.surfaceAlt }),
    textShape({
      id: nextId(),
      name: "Academic Note",
      text: "Method  |  Evidence  |  Findings",
      x: 1480000,
      y: 4710000,
      cx: 5250000,
      cy: 240000,
      size: 980,
      color: theme.muted,
      font: theme.fontBody,
      align: "ctr"
    }),
    visualPanel({
      nextId,
      theme,
      media,
      x: 7900000,
      y: 1240000,
      cx: 3180000,
      cy: 3900000,
      label: slide.visualBrief || slide.imageQuery || "academic visual"
    })
  ].join("");
}

function renderV2TeachingCover(ctx: RenderContext) {
  const { slide, theme, media, nextId } = ctx;
  const title = clampText(slide.title, 78);
  const subtitle = clampText(slide.subtitle || "Course lesson", 110);

  return [
    groupBase(ctx),
    shape({ id: nextId(), name: "V2 Preset Rendered", x: 0, y: 0, cx: 1, cy: 1, fill: theme.background, radius: "rect" }),
    shape({ id: nextId(), name: "V2 Teaching Cover", x: 690000, y: 620000, cx: 10810000, cy: 5350000, fill: theme.surface, line: theme.surfaceAlt }),
    shape({ id: nextId(), name: "Teaching Chalk Band", x: 690000, y: 620000, cx: 10810000, cy: 920000, fill: theme.primary, radius: "rect" }),
    shape({ id: nextId(), name: "Teaching Motif Dot", x: 10320000, y: 900000, cx: 290000, cy: 290000, fill: theme.accent, radius: "ellipse" }),
    shape({ id: nextId(), name: "Teaching Motif Dot", x: 10750000, y: 900000, cx: 290000, cy: 290000, fill: theme.secondary, radius: "ellipse" }),
    textShape({
      id: nextId(),
      name: "Teaching Label",
      text: "Courseware",
      x: 1180000,
      y: 930000,
      cx: 2500000,
      cy: 280000,
      size: 1050,
      bold: true,
      color: "FFFFFF",
      font: theme.fontBody
    }),
    textShape({
      id: nextId(),
      name: "Title",
      text: title,
      x: 1200000,
      y: 1940000,
      cx: 5700000,
      cy: 1300000,
      size: fitTextSize(title, 3950, 2900),
      bold: true,
      color: theme.title,
      font: theme.fontHead
    }),
    textShape({
      id: nextId(),
      name: "Subtitle",
      text: subtitle,
      x: 1230000,
      y: 3450000,
      cx: 5400000,
      cy: 560000,
      size: fitTextSize(subtitle, 1600, 1200),
      color: theme.body,
      font: theme.fontBody
    }),
    shape({ id: nextId(), name: "Teaching Objective Chip", x: 1220000, y: 4520000, cx: 1640000, cy: 430000, fill: theme.surfaceAlt, line: theme.secondary }),
    textShape({ id: nextId(), name: "Teaching Objective Text", text: "目标清晰", x: 1390000, y: 4630000, cx: 1300000, cy: 220000, size: 960, bold: true, color: theme.primary, font: theme.fontBody, align: "ctr" }),
    shape({ id: nextId(), name: "Teaching Objective Chip", x: 3130000, y: 4520000, cx: 1640000, cy: 430000, fill: theme.surfaceAlt, line: theme.secondary }),
    textShape({ id: nextId(), name: "Teaching Objective Text", text: "步骤讲解", x: 3300000, y: 4630000, cx: 1300000, cy: 220000, size: 960, bold: true, color: theme.primary, font: theme.fontBody, align: "ctr" }),
    shape({ id: nextId(), name: "Teaching Objective Chip", x: 5040000, y: 4520000, cx: 1640000, cy: 430000, fill: theme.surfaceAlt, line: theme.secondary }),
    textShape({ id: nextId(), name: "Teaching Objective Text", text: "课堂练习", x: 5210000, y: 4630000, cx: 1300000, cy: 220000, size: 960, bold: true, color: theme.primary, font: theme.fontBody, align: "ctr" }),
    visualPanel({
      nextId,
      theme,
      media,
      x: 7530000,
      y: 1880000,
      cx: 3100000,
      cy: 3150000,
      label: slide.visualBrief || slide.imageQuery || "teaching visual"
    })
  ].join("");
}

function renderCoverSlide(ctx: RenderContext) {
  const { slide, theme, media, nextId } = ctx;
  const title = clampText(slide.title, 82);
  return [
    groupBase(ctx),
    visualPanel({ nextId, theme, media, x: 6660000, y: 0, cx: 5532000, cy: SLIDE_H, label: slide.visualBrief || slide.imageQuery || slide.subtitle }),
    shape({ id: nextId(), name: "Cover Title Panel", x: MARGIN_X, y: 1540000, cx: 5400000, cy: 3100000, fill: theme.surface, line: theme.surfaceAlt }),
    textShape({
      id: nextId(),
      name: "Title",
      text: title,
      x: 1120000,
      y: 2030000,
      cx: 4700000,
      cy: 1200000,
      size: fitTextSize(title, 4300, 3150),
      bold: true,
      color: theme.title,
      font: theme.fontHead
    }),
    slide.subtitle
      ? textShape({
          id: nextId(),
          name: "Subtitle",
          text: clampText(slide.subtitle, 120),
          x: 1140000,
          y: 3380000,
          cx: 4500000,
          cy: 650000,
          size: 1700,
          color: theme.body,
          font: theme.fontBody
        })
      : "",
    textShape({
      id: nextId(),
      name: "Kicker",
      text: theme.name,
      x: 1120000,
      y: 1710000,
      cx: 3000000,
      cy: 330000,
      size: 1050,
      bold: true,
      color: theme.accent,
      font: theme.fontBody
    })
  ].join("");
}

function renderAgendaSlide(ctx: RenderContext) {
  const { slide, theme, nextId } = ctx;
  const items = bulletItems(slide, ["Context", "Key points", "Next actions"]).slice(0, 4);
  const rowW = 10040000;
  const startX = MARGIN_X;
  const startY = 1780000;
  const rowH = 820000;
  const gap = 260000;

  return [
    groupBase(ctx),
    titleBlock({ nextId, theme, title: slide.title || "Agenda", subtitle: slide.subtitle }),
    ...items.map((item, itemIndex) => {
      const y = startY + itemIndex * (rowH + gap);
      return [
        shape({ id: nextId(), name: "Agenda Card", x: startX, y, cx: rowW, cy: rowH, fill: theme.surface, line: theme.surfaceAlt }),
        shape({ id: nextId(), name: "Agenda Number", x: startX + 330000, y: y + 190000, cx: 440000, cy: 440000, fill: theme.primary, radius: "ellipse" }),
        textShape({
          id: nextId(),
          name: "Agenda Number Text",
          text: String(itemIndex + 1).padStart(2, "0"),
          x: startX + 330000,
          y: y + 300000,
          cx: 440000,
          cy: 220000,
          size: 1050,
          bold: true,
          color: "FFFFFF",
          font: theme.fontBody,
          align: "ctr"
        }),
        textShape({
          id: nextId(),
          name: "Agenda Card Title",
          text: item,
          x: startX + 1040000,
          y: y + 235000,
          cx: rowW - 1550000,
          cy: 360000,
          size: fitTextSize(item, 1950, 1450),
          bold: true,
          color: theme.title,
          font: theme.fontHead
        })
      ].join("");
    })
  ].join("");
}

function renderCardsSlide(ctx: RenderContext) {
  const { slide, theme, nextId } = ctx;
  const items = bulletItems(slide, ["Key insight", "Execution focus", "Expected result"]).slice(0, 4);
  const colCount = 2;
  const cardW = 4850000;
  const cardH = 1500000;
  const startY = 1900000;

  return [
    groupBase(ctx),
    titleBlock({ nextId, theme, title: slide.title || "Highlights", subtitle: slide.subtitle }),
    ...items.map((item, itemIndex) => {
      const col = itemIndex % colCount;
      const row = Math.floor(itemIndex / colCount);
      const x = MARGIN_X + col * (cardW + 330000);
      const y = startY + row * (cardH + 360000);
      return [
        shape({ id: nextId(), name: "Content Card", x, y, cx: cardW, cy: cardH, fill: theme.surface, line: theme.surfaceAlt }),
        shape({ id: nextId(), name: "Layout Accent Bar", x: x + 260000, y: y + 290000, cx: 90000, cy: 880000, fill: itemIndex % 2 ? theme.accent : theme.primary, radius: "rect" }),
        textShape({
          id: nextId(),
          name: "Readable Content",
          text: item,
          x: x + 530000,
          y: y + 345000,
          cx: cardW - 850000,
          cy: cardH - 560000,
          size: fitTextSize(item, 2050, 1450),
          bold: true,
          color: theme.title,
          font: theme.fontHead
        })
      ].join("");
    })
  ].join("");
}

function renderTimelineSlide(ctx: RenderContext) {
  const { slide, theme, nextId } = ctx;
  const items = bulletItems(slide, ["Plan", "Build", "Deliver", "Review"]).slice(0, 5);
  const startX = 1320000;
  const endX = 10800000;
  const y = 3500000;
  const step = items.length > 1 ? (endX - startX) / (items.length - 1) : 0;

  return [
    groupBase(ctx),
    titleBlock({ nextId, theme, title: slide.title || "Roadmap", subtitle: slide.subtitle }),
    shape({ id: nextId(), name: "Timeline Panel", x: MARGIN_X, y: 2050000, cx: 10650000, cy: 2750000, fill: theme.surface, line: theme.surfaceAlt }),
    shape({ id: nextId(), name: "Timeline Rail", x: startX, y: y + 185000, cx: endX - startX, cy: 70000, fill: theme.surfaceAlt, radius: "rect" }),
    ...items.map((item, itemIndex) => {
      const x = Math.round(startX + itemIndex * step - 290000);
      const labelY = itemIndex % 2 ? y + 820000 : y - 980000;
      return [
        shape({ id: nextId(), name: "Timeline Node", x, y: y - 100000, cx: 580000, cy: 580000, fill: itemIndex === 0 ? theme.accent : theme.primary, radius: "ellipse" }),
        textShape({
          id: nextId(),
          name: "Timeline Node Text",
          text: String(itemIndex + 1),
          x,
          y: y + 35000,
          cx: 580000,
          cy: 260000,
          size: 1120,
          bold: true,
          color: "FFFFFF",
          font: theme.fontBody,
          align: "ctr"
        }),
        textShape({
          id: nextId(),
          name: "Timeline Label",
          text: item,
          x: x - 420000,
          y: labelY,
          cx: 1420000,
          cy: 640000,
          size: fitTextSize(item, 1550, 1180),
          bold: true,
          color: theme.title,
          font: theme.fontHead,
          align: "ctr"
        })
      ].join("");
    })
  ].join("");
}

function renderDataSlide(ctx: RenderContext) {
  const { slide, theme, nextId } = ctx;
  const fallbackMetrics: PresentationMetric[] = bulletItems(slide, ["Progress: 80%", "Quality: Stable", "Delivery: On track"]).map((item) => {
    const [label, value] = item.split(":");
    return { label: clampText(label || "Metric", 28), value: clampText(value || item, 18) };
  });
  const metrics = (slide.metrics?.length ? slide.metrics : fallbackMetrics).slice(0, 4);
  const cardW = metrics.length > 2 ? 2440000 : 3500000;
  const startX = metrics.length > 2 ? 880000 : 2180000;

  return [
    groupBase(ctx),
    titleBlock({ nextId, theme, title: slide.title || "Metrics", subtitle: slide.subtitle }),
    ...metrics.map((metric, metricIndex) => {
      const x = startX + metricIndex * (cardW + 320000);
      return [
        shape({ id: nextId(), name: "Metric Card", x, y: 2350000, cx: cardW, cy: 2200000, fill: theme.surface, line: theme.surfaceAlt }),
        textShape({
          id: nextId(),
          name: "Metric Value",
          text: clampText(metric.value, 26),
          x: x + 230000,
          y: 2860000,
          cx: cardW - 460000,
          cy: 760000,
          size: fitTextSize(metric.value, 3800, 2750),
          bold: true,
          color: metricIndex % 2 ? theme.accent : theme.primary,
          font: theme.fontHead,
          align: "ctr"
        }),
        textShape({
          id: nextId(),
          name: "Metric Label",
          text: clampText(metric.label, 54),
          x: x + 260000,
          y: 3820000,
          cx: cardW - 520000,
          cy: 380000,
          size: 1350,
          color: theme.body,
          font: theme.fontBody,
          align: "ctr"
        }),
        metric.detail
          ? textShape({
              id: nextId(),
              name: "Metric Detail",
              text: clampText(metric.detail, 70),
              x: x + 260000,
              y: 4250000,
              cx: cardW - 520000,
              cy: 340000,
              size: 1050,
              color: theme.muted,
              font: theme.fontBody,
              align: "ctr"
            })
          : ""
      ].join("");
    })
  ].join("");
}

function renderTableSlide(ctx: RenderContext) {
  const { slide, theme, nextId } = ctx;
  return [
    groupBase(ctx),
    titleBlock({ nextId, theme, title: slide.title || "Table", subtitle: slide.subtitle }),
    tableShapes(slide, theme, nextId)
  ].join("");
}

function renderComparisonSlide(ctx: RenderContext) {
  const { slide, theme, nextId } = ctx;
  const items = bulletItems(slide, ["Current state", "Target state", "Action required", "Expected result"]);
  const left = items.slice(0, Math.ceil(items.length / 2));
  const right = items.slice(Math.ceil(items.length / 2));

  return [
    groupBase(ctx),
    titleBlock({ nextId, theme, title: slide.title || "Comparison", subtitle: slide.subtitle }),
    shape({ id: nextId(), name: "Comparison Column", x: MARGIN_X, y: 2050000, cx: 5050000, cy: 3300000, fill: theme.surface, line: theme.surfaceAlt }),
    shape({ id: nextId(), name: "Comparison Column", x: 6390000, y: 2050000, cx: 5050000, cy: 3300000, fill: theme.surface, line: theme.surfaceAlt }),
    shape({ id: nextId(), name: "Layout Accent Bar", x: MARGIN_X + 340000, y: 2420000, cx: 720000, cy: ACCENT_H, fill: theme.primary, radius: "rect" }),
    shape({ id: nextId(), name: "Layout Accent Bar", x: 6730000, y: 2420000, cx: 720000, cy: ACCENT_H, fill: theme.accent, radius: "rect" }),
    textShape({ id: nextId(), name: "Comparison Header", text: "Current", x: 1100000, y: 2600000, cx: 1800000, cy: 380000, size: 1600, bold: true, color: theme.primary, font: theme.fontHead }),
    textShape({ id: nextId(), name: "Comparison Header", text: "Target", x: 6720000, y: 2600000, cx: 1800000, cy: 380000, size: 1600, bold: true, color: theme.accent, font: theme.fontHead }),
    textShape({ id: nextId(), name: "Readable Content", text: "", x: 1120000, y: 3160000, cx: 4100000, cy: 1700000, size: 1450, color: theme.body, font: theme.fontBody, bullets: left }),
    textShape({ id: nextId(), name: "Readable Content", text: "", x: 6740000, y: 3160000, cx: 4100000, cy: 1700000, size: 1450, color: theme.body, font: theme.fontBody, bullets: right.length ? right : left })
  ].join("");
}

type AdaptiveContentLayout = "split" | "card_grid" | "focus" | "timeline";

function isProcessLikeContent(slide: PresentationSlide, items: string[]) {
  const text = `${slide.title} ${slide.subtitle || ""} ${items.join(" ")}`.toLowerCase();
  return /流程|步骤|阶段|路径|计划|规划|制作|生产|渲染|交付|复盘|执行|实施|flow|process|workflow|roadmap|step|phase|stage|sequence|pipeline|journey|plan|build|produce|production|render|review|deliver/.test(text);
}

function resolveAdaptiveContentLayout(slide: PresentationSlide, items: string[], media?: SlideMedia): AdaptiveContentLayout {
  if (slide.type === "two_column" || slide.type === "imageText" || media || slide.visualBrief || slide.imageQuery) return "split";
  if (items.length >= 3 && isProcessLikeContent(slide, items)) return "timeline";
  if (items.length >= 4) return "card_grid";
  return "focus";
}

function renderAdaptiveSplitContent(ctx: RenderContext, items: string[]) {
  const { slide, theme, media, nextId } = ctx;
  const textX = MARGIN_X;
  const textW = 5280000;
  const visualX = 6460000;
  const visualW = SLIDE_W - visualX - MARGIN_X;
  const rowH = items.length > 3 ? 760000 : 900000;

  return [
    groupBase(ctx),
    titleBlock({ nextId, theme, title: slide.title || "Key Points", subtitle: slide.subtitle, cx: 10300000 }),
    shape({ id: nextId(), name: "Adaptive Split Layout", x: textX, y: CONTENT_TOP, cx: textW, cy: 4100000, fill: theme.surface, line: theme.surfaceAlt }),
    ...items.slice(0, 4).map((item, itemIndex) => {
      const y = CONTENT_TOP + 360000 + itemIndex * (rowH + 120000);
      return [
        shape({ id: nextId(), name: "Split Content Row", x: textX + 320000, y, cx: textW - 640000, cy: rowH, fill: itemIndex % 2 ? theme.surface : theme.surfaceAlt, line: theme.surfaceAlt }),
        shape({ id: nextId(), name: "Split Content Index", x: textX + 560000, y: y + 220000, cx: 330000, cy: 330000, fill: itemIndex === 0 ? theme.accent : theme.primary, radius: "ellipse" }),
        textShape({
          id: nextId(),
          name: "Split Content Index Text",
          text: String(itemIndex + 1),
          x: textX + 560000,
          y: y + 300000,
          cx: 330000,
          cy: 180000,
          size: 900,
          bold: true,
          color: "FFFFFF",
          font: theme.fontBody,
          align: "ctr"
        }),
        textShape({
          id: nextId(),
          name: "Readable Content",
          text: item,
          x: textX + 1080000,
          y: y + 210000,
          cx: textW - 1580000,
          cy: rowH - 260000,
          size: fitTextSize(item, 1550, 1180),
          bold: itemIndex === 0,
          color: theme.title,
          font: itemIndex === 0 ? theme.fontHead : theme.fontBody
        })
      ].join("");
    }),
    visualPanel({
      nextId,
      theme,
      media,
      x: visualX,
      y: CONTENT_TOP,
      cx: visualW,
      cy: 4100000,
      label: slide.visualBrief || slide.imageQuery || items[0]
    })
  ].join("");
}

function renderAdaptiveCardGridContent(ctx: RenderContext, items: string[]) {
  const { slide, theme, nextId } = ctx;
  const visibleItems = items.slice(0, 5);
  const colCount = 2;
  const rows = Math.ceil(visibleItems.length / colCount);
  const cardW = 5030000;
  const cardH = rows > 2 ? 980000 : 1320000;
  const gapX = 330000;
  const gapY = rows > 2 ? 220000 : 320000;
  const startY = rows > 2 ? 1780000 : 1920000;

  return [
    groupBase(ctx),
    titleBlock({ nextId, theme, title: slide.title || "Key Points", subtitle: slide.subtitle, cx: 10300000 }),
    shape({ id: nextId(), name: "Adaptive Card Grid", x: MARGIN_X, y: startY - 220000, cx: 10600000, cy: rows * cardH + (rows - 1) * gapY + 440000, fill: theme.surfaceAlt, line: theme.surfaceAlt }),
    ...visibleItems.map((item, itemIndex) => {
      const col = itemIndex % colCount;
      const row = Math.floor(itemIndex / colCount);
      const x = MARGIN_X + 260000 + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      const accent = itemIndex % 3 === 0 ? theme.accent : itemIndex % 3 === 1 ? theme.primary : theme.secondary;
      return [
        shape({ id: nextId(), name: "Adaptive Grid Card", x, y, cx: cardW, cy: cardH, fill: theme.surface, line: theme.surfaceAlt }),
        shape({ id: nextId(), name: "Layout Accent Bar", x: x + 260000, y: y + 260000, cx: 760000, cy: 85000, fill: accent, radius: "rect" }),
        textShape({
          id: nextId(),
          name: "Adaptive Grid Number",
          text: String(itemIndex + 1).padStart(2, "0"),
          x: x + cardW - 760000,
          y: y + 240000,
          cx: 420000,
          cy: 240000,
          size: 930,
          bold: true,
          color: theme.muted,
          font: theme.fontBody,
          align: "r"
        }),
        textShape({
          id: nextId(),
          name: "Readable Content",
          text: item,
          x: x + 260000,
          y: y + 500000,
          cx: cardW - 520000,
          cy: cardH - 620000,
          size: fitTextSize(item, rows > 2 ? 1380 : 1600, 1080),
          bold: true,
          color: theme.title,
          font: theme.fontHead
        })
      ].join("");
    })
  ].join("");
}

function renderAdaptiveFocusContent(ctx: RenderContext, items: string[]) {
  const { slide, theme, nextId } = ctx;
  const primary = items[0] || "Clarify the objective";
  const supporting = items.slice(1, 3);

  return [
    groupBase(ctx),
    titleBlock({ nextId, theme, title: slide.title || "Key Point", subtitle: slide.subtitle, cx: 10300000 }),
    shape({ id: nextId(), name: "Adaptive Focus Layout", x: MARGIN_X, y: 1850000, cx: 6960000, cy: 3550000, fill: theme.surface, line: theme.surfaceAlt }),
    shape({ id: nextId(), name: "Layout Accent Bar", x: 1180000, y: 2260000, cx: 960000, cy: ACCENT_H, fill: theme.accent, radius: "rect" }),
    textShape({
      id: nextId(),
      name: "Readable Content",
      text: primary,
      x: 1180000,
      y: 2600000,
      cx: 6150000,
      cy: 1300000,
      size: fitTextSize(primary, 2700, 1950),
      bold: true,
      color: theme.title,
      font: theme.fontHead
    }),
    ...supporting.map((item, itemIndex) =>
      textShape({
        id: nextId(),
        name: "Focus Supporting Point",
        text: item,
        x: 1180000 + itemIndex * 3100000,
        y: 4320000,
        cx: 2800000,
        cy: 520000,
        size: fitTextSize(item, 1280, 1050),
        color: theme.body,
        font: theme.fontBody,
        fill: theme.surfaceAlt,
        margin: 120000
      })
    ),
    visualPanel({
      nextId,
      theme,
      x: 8240000,
      y: 2000000,
      cx: 3050000,
      cy: 3150000,
      label: slide.visualBrief || slide.imageQuery || primary
    })
  ].join("");
}

function renderAdaptiveTimelineContent(ctx: RenderContext, items: string[]) {
  const { slide, theme, nextId } = ctx;
  const steps = items.slice(0, 5);
  const startX = 1160000;
  const railY = 3600000;
  const stepGap = steps.length > 1 ? Math.floor(9750000 / (steps.length - 1)) : 0;

  return [
    groupBase(ctx),
    titleBlock({ nextId, theme, title: slide.title || "Process", subtitle: slide.subtitle, cx: 10300000 }),
    shape({ id: nextId(), name: "Adaptive Timeline Layout", x: MARGIN_X, y: 2050000, cx: 10650000, cy: 2980000, fill: theme.surface, line: theme.surfaceAlt }),
    shape({ id: nextId(), name: "Timeline Rail", x: startX, y: railY + 120000, cx: 9750000, cy: 70000, fill: theme.surfaceAlt, radius: "rect" }),
    ...steps.map((item, itemIndex) => {
      const x = startX + itemIndex * stepGap;
      const labelY = itemIndex % 2 ? railY + 720000 : railY - 980000;
      const accent = itemIndex === 0 ? theme.accent : theme.primary;
      return [
        shape({ id: nextId(), name: "Timeline Node", x: x - 260000, y: railY - 150000, cx: 520000, cy: 520000, fill: accent, radius: "ellipse" }),
        textShape({
          id: nextId(),
          name: "Timeline Node Text",
          text: String(itemIndex + 1),
          x: x - 260000,
          y: railY - 26000,
          cx: 520000,
          cy: 230000,
          size: 1050,
          bold: true,
          color: "FFFFFF",
          font: theme.fontBody,
          align: "ctr"
        }),
        textShape({
          id: nextId(),
          name: "Readable Content",
          text: item,
          x: x - 760000,
          y: labelY,
          cx: 1520000,
          cy: 580000,
          size: fitTextSize(item, 1300, 1050),
          bold: true,
          color: theme.title,
          font: theme.fontHead,
          align: "ctr"
        })
      ].join("");
    })
  ].join("");
}

function renderV2ImageExplanation(ctx: RenderContext) {
  const { slide, theme, media, nextId } = ctx;
  const items = bulletItems(slide, ["Key idea", "Why it matters", "How to apply it"]).slice(0, 4);
  const title = clampText(slide.title || "Visual Explanation", 72);

  return [
    groupBase(ctx),
    shape({ id: nextId(), name: "V2 Preset Rendered", x: 0, y: 0, cx: 1, cy: 1, fill: theme.background, radius: "rect" }),
    titleBlock({ nextId, theme, title, subtitle: slide.subtitle, cx: 9800000 }),
    v2ContentFrame({ nextId, theme, label: "Visual explanation", y: 1720000, cy: 4300000 }),
    shape({ id: nextId(), name: "V2 Image Explanation", x: MARGIN_X, y: 1720000, cx: 10660000, cy: 4300000, fill: theme.surface, line: theme.surfaceAlt }),
    visualPanel({
      nextId,
      theme,
      media,
      x: 1050000,
      y: 2060000,
      cx: 4600000,
      cy: 3480000,
      label: slide.visualBrief || slide.imageQuery || items[0]
    }),
    shape({ id: nextId(), name: "Image Explanation Divider", x: 6040000, y: 2080000, cx: 52000, cy: 3400000, fill: theme.surfaceAlt, radius: "rect" }),
    ...items.map((item, itemIndex) => {
      const y = 2100000 + itemIndex * 810000;
      return [
        shape({ id: nextId(), name: "Explanation Step Badge", x: 6480000, y: y + 70000, cx: 430000, cy: 430000, fill: itemIndex === 0 ? theme.accent : theme.primary, radius: "ellipse" }),
        textShape({
          id: nextId(),
          name: "Explanation Step Number",
          text: String(itemIndex + 1),
          x: 6480000,
          y: y + 178000,
          cx: 430000,
          cy: 220000,
          size: 980,
          bold: true,
          color: "FFFFFF",
          font: theme.fontBody,
          align: "ctr"
        }),
        textShape({
          id: nextId(),
          name: "Readable Content",
          text: item,
          x: 7100000,
          y: y + 90000,
          cx: 3800000,
          cy: 470000,
          size: fitTextSize(item, 1550, 1160),
          bold: itemIndex === 0,
          color: theme.title,
          font: itemIndex === 0 ? theme.fontHead : theme.fontBody
        })
      ].join("");
    })
  ].join("");
}

function renderV2LessonExercise(ctx: RenderContext) {
  const { slide, theme, nextId } = ctx;
  const items = bulletItems(slide, ["Observe", "Practice", "Explain"]).slice(0, 5);
  const title = clampText(slide.title || "Class Exercise", 68);

  return [
    groupBase(ctx),
    shape({ id: nextId(), name: "V2 Preset Rendered", x: 0, y: 0, cx: 1, cy: 1, fill: theme.background, radius: "rect" }),
    titleBlock({ nextId, theme, title, subtitle: slide.subtitle, cx: 9800000 }),
    v2ContentFrame({ nextId, theme, label: "Practice task", y: 1750000, cy: 4140000 }),
    shape({ id: nextId(), name: "V2 Lesson Exercise", x: MARGIN_X, y: 1750000, cx: 10660000, cy: 4140000, fill: theme.surface, line: theme.surfaceAlt }),
    shape({ id: nextId(), name: "Exercise Timer Panel", x: 1020000, y: 2120000, cx: 2400000, cy: 3120000, fill: theme.surfaceAlt, line: theme.secondary }),
    shape({ id: nextId(), name: "Exercise Icon Circle", x: 1770000, y: 2500000, cx: 900000, cy: 900000, fill: theme.accent, radius: "ellipse" }),
    textShape({
      id: nextId(),
      name: "Exercise Icon Text",
      text: "练",
      x: 1770000,
      y: 2700000,
      cx: 900000,
      cy: 420000,
      size: 2600,
      bold: true,
      color: "FFFFFF",
      font: theme.fontHead,
      align: "ctr"
    }),
    textShape({
      id: nextId(),
      name: "Exercise Prompt",
      text: "课堂任务",
      x: 1290000,
      y: 3820000,
      cx: 1860000,
      cy: 350000,
      size: 1500,
      bold: true,
      color: theme.title,
      font: theme.fontHead,
      align: "ctr"
    }),
    textShape({
      id: nextId(),
      name: "Exercise Hint",
      text: "观察、动手、说明",
      x: 1260000,
      y: 4300000,
      cx: 1920000,
      cy: 300000,
      size: 1050,
      color: theme.muted,
      font: theme.fontBody,
      align: "ctr"
    }),
    ...items.map((item, itemIndex) => {
      const y = 2110000 + itemIndex * 620000;
      return [
        shape({ id: nextId(), name: "Exercise Step Card", x: 3900000, y, cx: 6760000, cy: 500000, fill: itemIndex % 2 ? theme.surface : theme.surfaceAlt, line: theme.surfaceAlt }),
        shape({ id: nextId(), name: "Exercise Step Check", x: 4200000, y: y + 125000, cx: 250000, cy: 250000, fill: itemIndex === 0 ? theme.accent : theme.primary, radius: "ellipse" }),
        textShape({
          id: nextId(),
          name: "Exercise Step Number",
          text: String(itemIndex + 1),
          x: 4200000,
          y: y + 178000,
          cx: 250000,
          cy: 140000,
          size: 740,
          bold: true,
          color: "FFFFFF",
          font: theme.fontBody,
          align: "ctr"
        }),
        textShape({
          id: nextId(),
          name: "Readable Content",
          text: item,
          x: 4640000,
          y: y + 118000,
          cx: 5600000,
          cy: 270000,
          size: fitTextSize(item, 1400, 1120),
          bold: itemIndex === 0,
          color: theme.title,
          font: theme.fontBody
        })
      ].join("");
    })
  ].join("");
}

function renderV2SectionDivider(ctx: RenderContext) {
  const { slide, theme, media, nextId, index } = ctx;
  const title = clampText(slide.title || "Section", 72);
  const subtitle = clampText(slide.subtitle || "Key topic and learning focus", 110);
  const sectionLabel = `Section ${String(index + 1).padStart(2, "0")}`;

  return [
    groupBase(ctx),
    shape({ id: nextId(), name: "V2 Preset Rendered", x: 0, y: 0, cx: 1, cy: 1, fill: theme.background, radius: "rect" }),
    shape({ id: nextId(), name: "V2 Section Divider", x: MARGIN_X, y: 1180000, cx: 10660000, cy: 4470000, fill: theme.surface, line: theme.surfaceAlt }),
    shape({ id: nextId(), name: "Section Divider Spine", x: MARGIN_X, y: 1180000, cx: 170000, cy: 4470000, fill: theme.primary, radius: "rect" }),
    shape({ id: nextId(), name: "Section Divider Accent", x: 1260000, y: 1700000, cx: 1440000, cy: 110000, fill: theme.accent, radius: "rect" }),
    textShape({
      id: nextId(),
      name: "Section Divider Label",
      text: sectionLabel,
      x: 1260000,
      y: 1420000,
      cx: 2200000,
      cy: 320000,
      size: 1040,
      bold: true,
      color: theme.accent,
      font: theme.fontBody
    }),
    textShape({
      id: nextId(),
      name: "Section Divider Title",
      text: title,
      x: 1260000,
      y: 2040000,
      cx: 5650000,
      cy: 1220000,
      size: fitTextSize(title, 3900, 2860),
      bold: true,
      color: theme.title,
      font: theme.fontHead
    }),
    textShape({
      id: nextId(),
      name: "Section Divider Subtitle",
      text: subtitle,
      x: 1290000,
      y: 3560000,
      cx: 5200000,
      cy: 560000,
      size: fitTextSize(subtitle, 1480, 1120),
      color: theme.body,
      font: theme.fontBody
    }),
    visualPanel({
      nextId,
      theme,
      media,
      x: 7700000,
      y: 1540000,
      cx: 3200000,
      cy: 3740000,
      label: slide.visualBrief || slide.imageQuery || title
    })
  ].join("");
}

function renderV2AgendaList(ctx: RenderContext) {
  const { slide, theme, nextId } = ctx;
  const items = bulletItems(slide, ["Context and goals", "Core concepts", "Case walkthrough", "Practice and summary"]).slice(0, 5);
  const rowH = items.length > 4 ? 620000 : 740000;
  const gap = items.length > 4 ? 160000 : 220000;
  const startY = items.length > 4 ? 1760000 : 1860000;

  return [
    groupBase(ctx),
    shape({ id: nextId(), name: "V2 Preset Rendered", x: 0, y: 0, cx: 1, cy: 1, fill: theme.background, radius: "rect" }),
    titleBlock({ nextId, theme, title: slide.title || "Agenda", subtitle: slide.subtitle, cx: 9800000 }),
    shape({ id: nextId(), name: "V2 Agenda List", x: MARGIN_X, y: startY - 280000, cx: 10660000, cy: items.length * rowH + (items.length - 1) * gap + 560000, fill: theme.surfaceAlt, line: theme.surfaceAlt }),
    ...items.map((item, itemIndex) => {
      const y = startY + itemIndex * (rowH + gap);
      const accent = itemIndex === 0 ? theme.accent : itemIndex % 2 ? theme.secondary : theme.primary;
      return [
        shape({ id: nextId(), name: "Agenda List Row", x: 1100000, y, cx: 9950000, cy: rowH, fill: theme.surface, line: theme.surfaceAlt }),
        shape({ id: nextId(), name: "Agenda List Number", x: 1390000, y: y + Math.round((rowH - 420000) / 2), cx: 420000, cy: 420000, fill: accent, radius: "ellipse" }),
        textShape({
          id: nextId(),
          name: "Agenda List Number Text",
          text: String(itemIndex + 1).padStart(2, "0"),
          x: 1390000,
          y: y + Math.round((rowH - 190000) / 2),
          cx: 420000,
          cy: 200000,
          size: 930,
          bold: true,
          color: "FFFFFF",
          font: theme.fontBody,
          align: "ctr"
        }),
        textShape({
          id: nextId(),
          name: "Readable Content",
          text: item,
          x: 2080000,
          y: y + Math.round((rowH - 320000) / 2),
          cx: 7600000,
          cy: 360000,
          size: fitTextSize(item, 1680, 1250),
          bold: true,
          color: theme.title,
          font: theme.fontHead
        }),
        shape({ id: nextId(), name: "Agenda List Status", x: 10250000, y: y + Math.round((rowH - 180000) / 2), cx: 180000, cy: 180000, fill: accent, radius: "ellipse" })
      ].join("");
    })
  ].join("");
}

function renderV2KnowledgeCards(ctx: RenderContext) {
  const { slide, theme, nextId } = ctx;
  const items = bulletItems(slide, ["Key concept", "Evidence", "Action"]).slice(0, 6);
  const cols = items.length > 4 ? 3 : 2;
  const rows = Math.max(1, Math.ceil(items.length / cols));
  const gapX = 260000;
  const gapY = 260000;
  const gridX = 1020000;
  const gridY = rows > 1 ? 2280000 : 2660000;
  const gridW = 10180000;
  const cardW = Math.floor((gridW - (cols - 1) * gapX) / cols);
  const cardH = rows > 1 ? 1180000 : 1620000;

  return [
    groupBase(ctx),
    shape({ id: nextId(), name: "V2 Preset Rendered", x: 0, y: 0, cx: 1, cy: 1, fill: theme.background, radius: "rect" }),
    titleBlock({ nextId, theme, title: slide.title || "Core Concepts", subtitle: slide.subtitle, cx: 9800000 }),
    v2ContentFrame({
      nextId,
      theme,
      label: "Knowledge map",
      y: gridY - 300000,
      cy: rows * cardH + (rows - 1) * gapY + 600000
    }),
    shape({
      id: nextId(),
      name: "V2 Knowledge Cards",
      x: MARGIN_X,
      y: gridY - 300000,
      cx: 10660000,
      cy: rows * cardH + (rows - 1) * gapY + 600000,
      fill: theme.surfaceAlt,
      line: theme.surfaceAlt
    }),
    ...items.map((item, itemIndex) => {
      const col = itemIndex % cols;
      const row = Math.floor(itemIndex / cols);
      const x = gridX + col * (cardW + gapX);
      const y = gridY + row * (cardH + gapY);
      const accent = itemIndex === 0 ? theme.accent : itemIndex % 2 ? theme.secondary : theme.primary;
      const label = String(itemIndex + 1).padStart(2, "0");

      return [
        shape({ id: nextId(), name: "Knowledge Card", x, y, cx: cardW, cy: cardH, fill: theme.surface, line: theme.surfaceAlt }),
        shape({ id: nextId(), name: "Knowledge Card Accent", x, y, cx: cardW, cy: 90000, fill: accent, radius: "rect" }),
        shape({ id: nextId(), name: "Knowledge Card Number", x: x + 260000, y: y + 260000, cx: 430000, cy: 430000, fill: accent, radius: "ellipse" }),
        textShape({
          id: nextId(),
          name: "Knowledge Card Number Text",
          text: label,
          x: x + 260000,
          y: y + 370000,
          cx: 430000,
          cy: 200000,
          size: 850,
          bold: true,
          color: "FFFFFF",
          font: theme.fontBody,
          align: "ctr"
        }),
        textShape({
          id: nextId(),
          name: "Readable Content",
          text: item,
          x: x + 840000,
          y: y + 265000,
          cx: cardW - 1120000,
          cy: rows > 1 ? 560000 : 840000,
          size: fitTextSize(item, rows > 1 ? 1400 : 1580, 1080),
          bold: itemIndex === 0,
          color: theme.title,
          font: itemIndex === 0 ? theme.fontHead : theme.fontBody
        })
      ].join("");
    })
  ].join("");
}

function renderV2ProcessSteps(ctx: RenderContext) {
  const { slide, theme, nextId } = ctx;
  const steps = bulletItems(slide, ["Collect evidence", "Analyze patterns", "Design response", "Review outcome"]).slice(0, 5);
  const cardW = steps.length > 4 ? 1900000 : 2200000;
  const gap = steps.length > 4 ? 180000 : 280000;
  const totalW = steps.length * cardW + (steps.length - 1) * gap;
  const startX = Math.round((SLIDE_W - totalW) / 2);
  const cardH = 1500000;

  return [
    groupBase(ctx),
    shape({ id: nextId(), name: "V2 Preset Rendered", x: 0, y: 0, cx: 1, cy: 1, fill: theme.background, radius: "rect" }),
    titleBlock({ nextId, theme, title: slide.title || "Process", subtitle: slide.subtitle, cx: 9800000 }),
    v2ContentFrame({ nextId, theme, label: "Process flow", y: 2160000, cy: 2520000 }),
    shape({ id: nextId(), name: "V2 Process Steps", x: MARGIN_X, y: 2160000, cx: 10660000, cy: 2520000, fill: theme.surface, line: theme.surfaceAlt }),
    shape({ id: nextId(), name: "V2 Process Track", x: startX + Math.round(cardW / 2), y: 3300000, cx: Math.max(0, totalW - cardW), cy: 64000, fill: theme.surfaceAlt, radius: "rect" }),
    ...steps.map((item, itemIndex) => {
      const x = startX + itemIndex * (cardW + gap);
      const accent = itemIndex === 0 ? theme.accent : itemIndex % 2 ? theme.secondary : theme.primary;
      return [
        shape({ id: nextId(), name: "Process Step Card", x, y: 2560000, cx: cardW, cy: cardH, fill: itemIndex % 2 ? theme.surfaceAlt : theme.surface, line: theme.surfaceAlt }),
        shape({ id: nextId(), name: "Process Step Node", x: x + Math.round((cardW - 560000) / 2), y: 3020000, cx: 560000, cy: 560000, fill: accent, radius: "ellipse" }),
        textShape({
          id: nextId(),
          name: "Process Step Number",
          text: String(itemIndex + 1),
          x: x + Math.round((cardW - 560000) / 2),
          y: 3150000,
          cx: 560000,
          cy: 250000,
          size: 1160,
          bold: true,
          color: "FFFFFF",
          font: theme.fontBody,
          align: "ctr"
        }),
        textShape({
          id: nextId(),
          name: "Readable Content",
          text: item,
          x: x + 210000,
          y: 3800000,
          cx: cardW - 420000,
          cy: 500000,
          size: fitTextSize(item, 1320, 1060),
          bold: true,
          color: theme.title,
          font: theme.fontHead,
          align: "ctr"
        })
      ].join("");
    })
  ].join("");
}

function renderV2ComparisonMatrix(ctx: RenderContext) {
  const { slide, theme, nextId } = ctx;
  const items = bulletItems(slide, ["Baseline: simple but limited", "Baseline: weaker transfer", "Proposed: richer context", "Proposed: stronger outcomes"]).slice(0, 6);
  const splitIndex = Math.ceil(items.length / 2);
  const left = items.slice(0, splitIndex);
  const right = items.slice(splitIndex);
  const rowCount = Math.max(left.length, right.length, 1);
  const rowH = rowCount > 2 ? 690000 : 870000;
  const startY = 2820000;
  const colW = 4980000;

  return [
    groupBase(ctx),
    shape({ id: nextId(), name: "V2 Preset Rendered", x: 0, y: 0, cx: 1, cy: 1, fill: theme.background, radius: "rect" }),
    titleBlock({ nextId, theme, title: slide.title || "Comparison", subtitle: slide.subtitle, cx: 9800000 }),
    shape({ id: nextId(), name: "V2 Comparison Matrix", x: MARGIN_X, y: 2050000, cx: 10660000, cy: 3620000, fill: theme.surface, line: theme.surfaceAlt }),
    shape({ id: nextId(), name: "V2 Comparison Grid", x: 1080000, y: 2280000, cx: 10030000, cy: rowCount * rowH + 520000, fill: theme.surface, line: theme.surfaceAlt }),
    shape({ id: nextId(), name: "Comparison Matrix Header", x: 1080000, y: 2280000, cx: colW, cy: 520000, fill: theme.primary, radius: "rect" }),
    shape({ id: nextId(), name: "Comparison Matrix Header", x: 6130000, y: 2280000, cx: colW, cy: 520000, fill: theme.accent, radius: "rect" }),
    textShape({ id: nextId(), name: "Comparison Matrix Header Text", text: "Baseline", x: 1300000, y: 2430000, cx: 2200000, cy: 230000, size: 1180, bold: true, color: "FFFFFF", font: theme.fontBody }),
    textShape({ id: nextId(), name: "Comparison Matrix Header Text", text: "Improved Plan", x: 6350000, y: 2430000, cx: 2500000, cy: 230000, size: 1180, bold: true, color: "FFFFFF", font: theme.fontBody }),
    ...Array.from({ length: rowCount }, (_, rowIndex) => {
      const y = startY + rowIndex * rowH;
      const leftText = left[rowIndex] || left[left.length - 1] || "Current approach";
      const rightText = right[rowIndex] || right[right.length - 1] || "Target approach";
      return [
        shape({ id: nextId(), name: "Comparison Matrix Cell", x: 1080000, y, cx: colW, cy: rowH - 70000, fill: rowIndex % 2 ? theme.surfaceAlt : theme.surface, line: theme.surfaceAlt }),
        shape({ id: nextId(), name: "Comparison Matrix Cell", x: 6130000, y, cx: colW, cy: rowH - 70000, fill: rowIndex % 2 ? theme.surfaceAlt : theme.surface, line: theme.surfaceAlt }),
        textShape({
          id: nextId(),
          name: "Readable Content",
          text: leftText,
          x: 1330000,
          y: y + 160000,
          cx: colW - 500000,
          cy: rowH - 260000,
          size: fitTextSize(leftText, 1290, 1040),
          color: theme.body,
          font: theme.fontBody
        }),
        textShape({
          id: nextId(),
          name: "Readable Content",
          text: rightText,
          x: 6380000,
          y: y + 160000,
          cx: colW - 500000,
          cy: rowH - 260000,
          size: fitTextSize(rightText, 1290, 1040),
          bold: rowIndex === 0,
          color: theme.title,
          font: theme.fontBody
        })
      ].join("");
    })
  ].join("");
}

function renderV2DataInsight(ctx: RenderContext) {
  const { slide, theme, nextId } = ctx;
  const fallbackMetrics: PresentationMetric[] = bulletItems(slide, ["Accuracy: +12.4%", "Latency: -28%", "Coverage: 3 cases"]).map((item) => {
    const [label, ...rest] = item.split(":");
    return { label: clampText(label || "Metric", 30), value: clampText(rest.join(":").trim() || item, 22) };
  });
  const metrics = (slide.metrics?.length ? slide.metrics : fallbackMetrics).slice(0, 4);
  const primary = metrics[0] || { label: "Key result", value: "Ready", detail: "Validated output" };
  const sideMetrics = metrics.slice(1, 4);

  return [
    groupBase(ctx),
    shape({ id: nextId(), name: "V2 Preset Rendered", x: 0, y: 0, cx: 1, cy: 1, fill: theme.background, radius: "rect" }),
    titleBlock({ nextId, theme, title: slide.title || "Data Insight", subtitle: slide.subtitle, cx: 9800000 }),
    shape({ id: nextId(), name: "V2 Data Insight", x: MARGIN_X, y: 1880000, cx: 10660000, cy: 3960000, fill: theme.surface, line: theme.surfaceAlt }),
    shape({ id: nextId(), name: "V2 Metric Hero", x: 1120000, y: 2300000, cx: 4740000, cy: 2920000, fill: theme.surfaceAlt, line: theme.surfaceAlt }),
    shape({ id: nextId(), name: "Data Insight Hero Card", x: 1220000, y: 2400000, cx: 4540000, cy: 2720000, fill: theme.surface, line: theme.surfaceAlt }),
    textShape({
      id: nextId(),
      name: "Data Insight Hero Value",
      text: clampText(primary.value, 26),
      x: 1420000,
      y: 2840000,
      cx: 4140000,
      cy: 850000,
      size: fitTextSize(primary.value, 4100, 2860),
      bold: true,
      color: theme.accent,
      font: theme.fontHead,
      align: "ctr"
    }),
    textShape({
      id: nextId(),
      name: "Data Insight Hero Label",
      text: clampText(primary.label, 54),
      x: 1500000,
      y: 3880000,
      cx: 3980000,
      cy: 360000,
      size: 1320,
      bold: true,
      color: theme.title,
      font: theme.fontBody,
      align: "ctr"
    }),
    primary.detail
      ? textShape({
          id: nextId(),
          name: "Data Insight Hero Detail",
          text: clampText(primary.detail, 70),
          x: 1540000,
          y: 4340000,
          cx: 3900000,
          cy: 350000,
          size: 1000,
          color: theme.muted,
          font: theme.fontBody,
          align: "ctr"
        })
      : "",
    ...sideMetrics.map((metric, metricIndex) => {
      const y = 2300000 + metricIndex * 960000;
      const accent = metricIndex % 2 ? theme.secondary : theme.primary;
      return [
        shape({ id: nextId(), name: "Data Insight Metric Row", x: 6360000, y, cx: 4800000, cy: 760000, fill: metricIndex % 2 ? theme.surfaceAlt : theme.surface, line: theme.surfaceAlt }),
        shape({ id: nextId(), name: "Data Insight Metric Mark", x: 6640000, y: y + 230000, cx: 300000, cy: 300000, fill: accent, radius: "ellipse" }),
        textShape({
          id: nextId(),
          name: "Data Insight Metric Value",
          text: clampText(metric.value, 22),
          x: 7160000,
          y: y + 160000,
          cx: 1500000,
          cy: 330000,
          size: fitTextSize(metric.value, 1650, 1200),
          bold: true,
          color: accent,
          font: theme.fontHead
        }),
        textShape({
          id: nextId(),
          name: "Data Insight Metric Label",
          text: clampText(metric.label, 58),
          x: 8820000,
          y: y + 185000,
          cx: 2040000,
          cy: 300000,
          size: 1080,
          color: theme.body,
          font: theme.fontBody
        }),
        metric.detail
          ? textShape({
              id: nextId(),
              name: "Data Insight Metric Detail",
              text: clampText(metric.detail, 60),
              x: 7160000,
              y: y + 490000,
              cx: 3720000,
              cy: 210000,
              size: 830,
              color: theme.muted,
              font: theme.fontBody
            })
          : ""
      ].join("");
    })
  ].join("");
}

function renderContentSlide(ctx: RenderContext) {
  const items = bulletItems(ctx.slide, ["Clarify the objective", "Summarize the key context", "Define the next action"]);
  const layout = resolveAdaptiveContentLayout(ctx.slide, items, ctx.media);
  if (layout === "split") return renderAdaptiveSplitContent(ctx, items);
  if (layout === "timeline") return renderAdaptiveTimelineContent(ctx, items);
  if (layout === "card_grid") return renderAdaptiveCardGridContent(ctx, items);
  return renderAdaptiveFocusContent(ctx, items);
}

function renderSectionSlide(ctx: RenderContext) {
  const { slide, theme, media, nextId } = ctx;
  const title = clampText(slide.title, 72);
  return [
    groupBase(ctx),
    shape({ id: nextId(), name: "Section Panel", x: MARGIN_X, y: 1720000, cx: 6200000, cy: 2850000, fill: theme.surface, line: theme.surfaceAlt }),
    textShape({ id: nextId(), name: "Section Title", text: title, x: 1140000, y: 2280000, cx: 5400000, cy: 900000, size: fitTextSize(title, 3900, 2900), bold: true, color: theme.title, font: theme.fontHead }),
    slide.subtitle
      ? textShape({ id: nextId(), name: "Section Subtitle", text: clampText(slide.subtitle, 120), x: 1160000, y: 3380000, cx: 5100000, cy: 520000, size: 1500, color: theme.muted, font: theme.fontBody })
      : "",
    visualPanel({ nextId, theme, media, x: 7600000, y: 1280000, cx: 3650000, cy: 4050000, label: slide.visualBrief || slide.imageQuery || "Section visual" })
  ].join("");
}

function renderClosingSlide(ctx: RenderContext) {
  const { slide, theme, nextId } = ctx;
  const title = clampText(slide.title || "Thank You", 64);
  return [
    groupBase(ctx),
    shape({ id: nextId(), name: "Closing Panel", x: 1700000, y: 1800000, cx: 8800000, cy: 2700000, fill: theme.surface, line: theme.surfaceAlt }),
    textShape({
      id: nextId(),
      name: "Title",
      text: title,
      x: 2100000,
      y: 2700000,
      cx: 7800000,
      cy: 760000,
      size: fitTextSize(title, 3900, 3000),
      bold: true,
      color: theme.title,
      font: theme.fontHead,
      align: "ctr"
    }),
    slide.subtitle
      ? textShape({
          id: nextId(),
          name: "Subtitle",
          text: clampText(slide.subtitle, 100),
          x: 2600000,
          y: 3480000,
          cx: 6800000,
          cy: 420000,
          size: 1300,
          color: theme.muted,
          font: theme.fontBody,
          align: "ctr"
        })
      : ""
  ].join("");
}

function renderV2SummaryClosing(ctx: RenderContext) {
  const { slide, theme, nextId } = ctx;
  const title = clampText(slide.title || "Summary", 64);
  const items = bulletItems(slide, ["Review the key idea", "Apply it in practice", "Prepare the next step"]).slice(0, 3);

  return [
    groupBase(ctx),
    shape({ id: nextId(), name: "V2 Preset Rendered", x: 0, y: 0, cx: 1, cy: 1, fill: theme.background, radius: "rect" }),
    shape({ id: nextId(), name: "V2 Summary Closing", x: 1120000, y: 1180000, cx: 9960000, cy: 4660000, fill: theme.surface, line: theme.surfaceAlt }),
    shape({ id: nextId(), name: "Summary Closing Accent", x: 1120000, y: 1180000, cx: 9960000, cy: 150000, fill: theme.accent, radius: "rect" }),
    shape({ id: nextId(), name: "Summary Closing Mark", x: 1880000, y: 1980000, cx: 720000, cy: 720000, fill: theme.primary, radius: "ellipse" }),
    textShape({
      id: nextId(),
      name: "Summary Closing Mark Text",
      text: "✓",
      x: 1880000,
      y: 2100000,
      cx: 720000,
      cy: 360000,
      size: 2200,
      bold: true,
      color: "FFFFFF",
      font: theme.fontHead,
      align: "ctr"
    }),
    textShape({
      id: nextId(),
      name: "Title",
      text: title,
      x: 2980000,
      y: 1900000,
      cx: 7000000,
      cy: 900000,
      size: fitTextSize(title, 3900, 2860),
      bold: true,
      color: theme.title,
      font: theme.fontHead
    }),
    slide.subtitle
      ? textShape({
          id: nextId(),
          name: "Subtitle",
          text: clampText(slide.subtitle, 100),
          x: 3060000,
          y: 2880000,
          cx: 6500000,
          cy: 360000,
          size: 1240,
          color: theme.muted,
          font: theme.fontBody
        })
      : "",
    ...items.map((item, itemIndex) => {
      const x = 1880000 + itemIndex * 3020000;
      const accent = itemIndex === 0 ? theme.accent : itemIndex % 2 ? theme.secondary : theme.primary;
      return [
        shape({ id: nextId(), name: "Summary Closing Card", x, y: 3780000, cx: 2520000, cy: 880000, fill: itemIndex % 2 ? theme.surfaceAlt : theme.surface, line: theme.surfaceAlt }),
        shape({ id: nextId(), name: "Summary Closing Card Dot", x: x + 240000, y: 4080000, cx: 250000, cy: 250000, fill: accent, radius: "ellipse" }),
        textShape({
          id: nextId(),
          name: "Readable Content",
          text: item,
          x: x + 610000,
          y: 4000000,
          cx: 1680000,
          cy: 420000,
          size: fitTextSize(item, 1180, 960),
          bold: itemIndex === 0,
          color: theme.title,
          font: theme.fontBody
        })
      ].join("");
    })
  ].join("");
}

function tableShapes(slide: PresentationSlide, theme: Theme, nextId: () => number) {
  if (!slide.table?.length) return "";
  const rows = slide.table.slice(0, 5);
  const colCount = Math.max(...rows.map((row) => row.length), 1);
  const cellW = Math.floor(9300000 / colCount);
  const cellH = 520000;

  return rows
    .flatMap((row, rowIndex) =>
      Array.from({ length: colCount }, (_, colIndex) => {
        const x = 1040000 + colIndex * cellW;
        const y = 2220000 + rowIndex * cellH;
        const fill = rowIndex === 0 ? theme.primary : theme.surface;
        const color = rowIndex === 0 ? "FFFFFF" : theme.body;
        return `<p:sp><p:nvSpPr><p:cNvPr id="${nextId()}" name="Table Cell"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cellW}" cy="${cellH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="${theme.surfaceAlt}"/></a:solidFill></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="91440" tIns="91440" rIns="91440" bIns="91440"/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="1500"${
          rowIndex === 0 ? ' b="1"' : ""
        }><a:latin typeface="${xmlEscape(theme.fontBody)}"/><a:ea typeface="Microsoft YaHei"/><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${xmlEscape(
          clampText(row[colIndex] || "", 60)
        )}</a:t></a:r></a:p></p:txBody></p:sp>`;
      })
    )
    .join("");
}

function slideContentXml(ctx: RenderContext) {
  if (ctx.visualPlan) return renderV3Slide(ctx);

  switch (ctx.slide.layoutPreset) {
    case "academic_cover":
      return renderV2AcademicCover(ctx);
    case "teaching_cover":
      return renderV2TeachingCover(ctx);
    case "section_divider":
      return renderV2SectionDivider(ctx);
    case "agenda_list":
      return renderV2AgendaList(ctx);
    case "image_explanation":
      return renderV2ImageExplanation(ctx);
    case "knowledge_cards":
      return renderV2KnowledgeCards(ctx);
    case "process_steps":
      return renderV2ProcessSteps(ctx);
    case "comparison_matrix":
      return renderV2ComparisonMatrix(ctx);
    case "data_insight":
      return renderV2DataInsight(ctx);
    case "lesson_exercise":
      return renderV2LessonExercise(ctx);
    case "summary_closing":
      return renderV2SummaryClosing(ctx);
    default:
      break;
  }

  switch (ctx.slide.type) {
    case "cover":
      return renderCoverSlide(ctx);
    case "agenda":
      return renderAgendaSlide(ctx);
    case "section":
      return renderSectionSlide(ctx);
    case "cards":
      return renderCardsSlide(ctx);
    case "timeline":
      return renderTimelineSlide(ctx);
    case "comparison":
      return renderComparisonSlide(ctx);
    case "data":
      return renderDataSlide(ctx);
    case "table":
      return renderTableSlide(ctx);
    case "closing":
      return renderClosingSlide(ctx);
    case "two_column":
    case "imageText":
    case "content":
    default:
      return renderContentSlide(ctx);
  }
}

function slideXml(
  slide: PresentationSlide,
  index: number,
  theme: Theme,
  media?: SlideMedia,
  visualPlan?: LocalSlideVisualPlan,
  visualTheme?: LocalVisualTheme
) {
  let id = 2;
  const ctx: RenderContext = {
    slide,
    index,
    theme,
    media,
    nextId: () => id++,
    visualPlan,
    visualTheme
  };

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="${theme.background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${slideContentXml(ctx)}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

function presentationXml(slideCount: number, notesMasterRelId = `rId${slideCount + 5}`) {
  const slideIds = Array.from({ length: slideCount }, (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:notesMasterIdLst><p:notesMasterId r:id="${notesMasterRelId}"/></p:notesMasterIdLst>
  <p:sldIdLst>${slideIds}</p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="wide"/>
  <p:notesSz cx="6858000" cy="9144000"/>
  <p:defaultTextStyle/>
</p:presentation>`;
}

function officeDefaultTextStyleXml() {
  const levels = Array.from({ length: 9 }, (_, index) => {
    const level = index + 1;
    const margin = index * 457200;
    return `<a:lvl${level}pPr marL="${margin}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${level}pPr>`;
  }).join("");

  return `<p:defaultTextStyle><a:defPPr><a:defRPr lang="zh-CN"/></a:defPPr>${levels}</p:defaultTextStyle>`;
}

function officePresentationXml(slideCount: number) {
  const slideIds = Array.from({ length: slideCount }, (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join("");
  const notesMasterRelId = `rId${slideCount + 2}`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="${notesMasterRelId}"/></p:notesMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>${officeDefaultTextStyleXml()}</p:presentation>`;
}

function presentationRels(slideCount: number) {
  const slideRels = Array.from(
    { length: slideCount },
    (_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`
  ).join("");
  const baseId = slideCount + 2;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slideRels}<Relationship Id="rId${baseId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/><Relationship Id="rId${baseId + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/><Relationship Id="rId${baseId + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/><Relationship Id="rId${baseId + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/></Relationships>`;
}

function officePresentationRels(slideCount: number) {
  const slideRels = Array.from(
    { length: slideCount },
    (_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`
  ).join("");
  const baseId = slideCount + 2;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slideRels}<Relationship Id="rId${baseId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/><Relationship Id="rId${baseId + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/><Relationship Id="rId${baseId + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/><Relationship Id="rId${baseId + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/><Relationship Id="rId${baseId + 4}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>`;
}

function contentTypes(slideCount: number, mediaAssets: SlideMedia[]) {
  const slideOverrides = Array.from(
    { length: slideCount },
    (_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join("");
  const notesOverrides = Array.from(
    { length: slideCount },
    (_, index) => `<Override PartName="/ppt/notesSlides/notesSlide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`
  ).join("");
  const mediaDefaults = [
    mediaAssets.some((item) => item.asset.extension === "png") ? '<Default Extension="png" ContentType="image/png"/>' : "",
    mediaAssets.some((item) => item.asset.extension === "jpg") ? '<Default Extension="jpg" ContentType="image/jpeg"/>' : ""
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${mediaDefaults}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slideOverrides}${notesOverrides}</Types>`;
}

function officeContentTypes(slideCount: number, mediaAssets: SlideMedia[]) {
  const slideOverrides = Array.from(
    { length: slideCount },
    (_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join("");
  const notesOverrides = Array.from(
    { length: slideCount },
    (_, index) => `<Override PartName="/ppt/notesSlides/notesSlide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`
  ).join("");
  const layoutOverrides = Array.from(
    { length: 11 },
    (_, index) => `<Override PartName="/ppt/slideLayouts/slideLayout${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`
  ).join("");
  const mediaDefaults = [
    '<Default Extension="jpeg" ContentType="image/jpeg"/>',
    mediaAssets.some((item) => item.asset.extension === "png") ? '<Default Extension="png" ContentType="image/png"/>' : "",
    mediaAssets.some((item) => item.asset.extension === "jpg") ? '<Default Extension="jpg" ContentType="image/jpeg"/>' : ""
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${mediaDefaults}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${layoutOverrides}${slideOverrides}${notesOverrides}</Types>`;
}

function masterXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}"><p:cSld name="Presentation Master"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="3600"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr marL="342900" indent="-171450"><a:defRPr sz="1800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;
}

function layoutXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

function notesMasterXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notesMaster xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}"><p:cSld name="Notes Master"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:notesStyle><a:lvl1pPr><a:defRPr sz="1200"/></a:lvl1pPr></p:notesStyle></p:notesMaster>`;
}

function notesSlideXml(slide: PresentationSlide, index: number, notes: string, theme: Theme) {
  const title = clampText(slide.title || `Slide ${index}`, 96);
  const cleanNotes = clampText(notes, 640);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${textShape({
        id: 2,
        name: "Notes Slide Title",
        text: title,
        x: 457200,
        y: 360000,
        cx: 5943600,
        cy: 420000,
        size: 1500,
        bold: true,
        color: theme.title,
        font: theme.fontBody
      })}
      ${textShape({
        id: 3,
        name: "Speaker Notes",
        text: cleanNotes,
        x: 457200,
        y: 920000,
        cx: 5943600,
        cy: 6400000,
        size: 1180,
        color: theme.body,
        font: theme.fontBody
      })}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:notes>`;
}

function themeXml(theme: Theme) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="${A_NS}" name="${xmlEscape(theme.name)}"><a:themeElements><a:clrScheme name="${xmlEscape(theme.name)}"><a:dk1><a:srgbClr val="${theme.title}"/></a:dk1><a:lt1><a:srgbClr val="${theme.background}"/></a:lt1><a:dk2><a:srgbClr val="${theme.body}"/></a:dk2><a:lt2><a:srgbClr val="${theme.surface}"/></a:lt2><a:accent1><a:srgbClr val="${theme.primary}"/></a:accent1><a:accent2><a:srgbClr val="${theme.secondary}"/></a:accent2><a:accent3><a:srgbClr val="${theme.accent}"/></a:accent3><a:accent4><a:srgbClr val="${theme.surfaceAlt}"/></a:accent4><a:accent5><a:srgbClr val="${theme.muted}"/></a:accent5><a:accent6><a:srgbClr val="${theme.surface}"/></a:accent6><a:hlink><a:srgbClr val="${theme.primary}"/></a:hlink><a:folHlink><a:srgbClr val="${theme.secondary}"/></a:folHlink></a:clrScheme><a:fontScheme name="${xmlEscape(theme.name)}"><a:majorFont><a:latin typeface="${xmlEscape(theme.fontHead)}"/><a:ea typeface="Microsoft YaHei"/></a:majorFont><a:minorFont><a:latin typeface="${xmlEscape(theme.fontBody)}"/><a:ea typeface="Microsoft YaHei"/></a:minorFont></a:fontScheme><a:fmtScheme name="${xmlEscape(theme.name)}"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"/></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="50000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries: Array<{ name: string; content: string | Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, "utf8");
    const crc = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function listZipEntries(buffer: Buffer) {
  const entries: string[] = [];

  for (let offset = 0; offset <= buffer.length - 46; offset += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) break;
    entries.push(buffer.subarray(nameStart, nameEnd).toString("utf8"));
    offset = nameEnd + extraLength + commentLength - 1;
  }

  return entries;
}

function readZipEntry(buffer: Buffer, entryName: string): Buffer | null {
  for (let offset = 0; offset <= buffer.length - 30; offset += 1) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) continue;
    const flags = buffer.readUInt16LE(offset + 6);
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) break;
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8");
    const contentStart = nameEnd + extraLength;
    const contentEnd = contentStart + compressedSize;
    if (contentEnd > buffer.length) break;
    if (name !== entryName) {
      offset = contentEnd - 1;
      continue;
    }
    if ((flags & 0x08) !== 0) return null;
    const content = buffer.subarray(contentStart, contentEnd);
    if (compression === 0) return Buffer.from(content);
    if (compression === 8) {
      const inflated = inflateRawSync(content);
      return inflated.length === uncompressedSize ? inflated : inflated;
    }
    return null;
  }

  return null;
}

function localSkeletonPath() {
  const workspacePath = resolve(process.cwd(), "lib", "presentation", "providers", "pptx-office-skeleton.pptx");

  try {
    const modulePath = join(dirname(fileURLToPath(import.meta.url)), "pptx-office-skeleton.pptx");
    return existsSync(modulePath) ? modulePath : workspacePath;
  } catch {
    return workspacePath;
  }
}

const OFFICE_SKELETON_STATIC_ENTRIES = [
  "_rels/.rels",
  "docProps/thumbnail.jpeg",
  "ppt/presProps.xml",
  "ppt/viewProps.xml",
  "ppt/tableStyles.xml",
  "ppt/slideMasters/slideMaster1.xml",
  "ppt/slideMasters/_rels/slideMaster1.xml.rels",
  "ppt/notesMasters/notesMaster1.xml",
  "ppt/notesMasters/_rels/notesMaster1.xml.rels",
  "ppt/theme/theme1.xml",
  "ppt/theme/theme2.xml",
  ...Array.from({ length: 11 }, (_, index) => `ppt/slideLayouts/slideLayout${index + 1}.xml`),
  ...Array.from({ length: 11 }, (_, index) => `ppt/slideLayouts/_rels/slideLayout${index + 1}.xml.rels`)
];

let cachedOfficeSkeletonEntries: Array<{ name: string; content: string | Buffer }> | null | undefined;

function loadOfficeSkeletonEntries() {
  if (cachedOfficeSkeletonEntries !== undefined) return cachedOfficeSkeletonEntries;
  const skeletonPath = localSkeletonPath();
  if (!existsSync(skeletonPath)) {
    cachedOfficeSkeletonEntries = null;
    return cachedOfficeSkeletonEntries;
  }

  try {
    const skeleton = readFileSync(skeletonPath);
    const availableEntries = new Set(listZipEntries(skeleton));
    const entries = OFFICE_SKELETON_STATIC_ENTRIES.flatMap((name) => {
      if (!availableEntries.has(name)) return [];
      const content = readZipEntry(skeleton, name);
      return content ? [{ name, content }] : [];
    });
    cachedOfficeSkeletonEntries = entries.length >= 25 ? entries : null;
  } catch {
    cachedOfficeSkeletonEntries = null;
  }

  return cachedOfficeSkeletonEntries;
}

function appXml(slides: PresentationSlide[]) {
  const titles = slides.map((slide) => `<vt:lpstr>${xmlEscape(slide.title)}</vt:lpstr>`).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft PowerPoint</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>${slides.length}</Slides><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Slides</vt:lpstr></vt:variant><vt:variant><vt:i4>${slides.length}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="${slides.length}" baseType="lpstr">${titles}</vt:vector></TitlesOfParts></Properties>`;
}

function buildPptx(deck: PresentationDeck) {
  const deckWithV3 = deck as PresentationDeckWithV3;
  const slides = deck.slides.length ? deck.slides.slice(0, MAX_RENDERED_SLIDES) : [{ type: "cover" as const, title: deck.title || "Presentation" }];
  const theme = resolveTheme(deck);
  const visualPlan = deckWithV3.renderMode === "v3" ? deckWithV3.v3VisualPlan || deckWithV3.visualPlan : undefined;
  const visualTheme = resolveLocalVisualTheme(visualPlan);
  const officeSkeletonEntries = loadOfficeSkeletonEntries();
  const useOfficeSkeleton = Boolean(officeSkeletonEntries?.length);
  const slideMedia = slides.map((slide, index): SlideMedia | null =>
    slide.visualAsset
      ? {
          relationshipId: "rId2",
          name: `visual-${index + 1}.${slide.visualAsset.extension}`,
          asset: slide.visualAsset
        }
      : null
  );
  const mediaAssets = slideMedia.filter(Boolean) as SlideMedia[];
  const now = new Date().toISOString();
  const entries: Array<{ name: string; content: string | Buffer }> = [
    ...(officeSkeletonEntries || []),
    { name: "[Content_Types].xml", content: useOfficeSkeleton ? officeContentTypes(slides.length, mediaAssets) : contentTypes(slides.length, mediaAssets) },
    ...(useOfficeSkeleton
      ? []
      : [
          {
            name: "_rels/.rels",
            content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`
          }
        ]),
    {
      name: "docProps/core.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(deck.title)}</dc:title><dc:creator>User</dc:creator><cp:lastModifiedBy>User</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`
    },
    { name: "docProps/app.xml", content: appXml(slides) },
    ...(useOfficeSkeleton
      ? []
      : [
          {
            name: "ppt/presProps.xml",
            content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentationPr xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}"><p:showPr showNarration="1"/></p:presentationPr>`
          },
          {
            name: "ppt/viewProps.xml",
            content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:viewPr xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:slideViewPr><p:cSldViewPr><p:cViewPr varScale="1"><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr><p:guideLst/></p:cSldViewPr></p:slideViewPr></p:viewPr>`
          },
          { name: "ppt/tableStyles.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:tblStyleLst xmlns:a="${A_NS}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>` }
        ]),
    { name: "ppt/presentation.xml", content: useOfficeSkeleton ? officePresentationXml(slides.length) : presentationXml(slides.length) },
    { name: "ppt/_rels/presentation.xml.rels", content: useOfficeSkeleton ? officePresentationRels(slides.length) : presentationRels(slides.length) },
    ...(useOfficeSkeleton
      ? []
      : [
          { name: "ppt/slideMasters/slideMaster1.xml", content: masterXml() },
          {
            name: "ppt/slideMasters/_rels/slideMaster1.xml.rels",
            content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`
          },
          { name: "ppt/slideLayouts/slideLayout1.xml", content: layoutXml() },
          {
            name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
            content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`
          },
          { name: "ppt/notesMasters/notesMaster1.xml", content: notesMasterXml() },
          {
            name: "ppt/notesMasters/_rels/notesMaster1.xml.rels",
            content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`
          },
          { name: "ppt/theme/theme1.xml", content: themeXml(theme) }
        ])
  ];

  slides.forEach((slide, index) => {
    const media = slideMedia[index] || undefined;
    const notesRelationshipId = media ? "rId3" : "rId2";
    entries.push({ name: `ppt/slides/slide${index + 1}.xml`, content: slideXml(slide, index + 1, theme, media, visualPlan?.slides[index], visualTheme) });
    entries.push({
      name: `ppt/slides/_rels/slide${index + 1}.xml.rels`,
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout${
        useOfficeSkeleton ? OFFICE_BLANK_LAYOUT : 1
      }.xml"/>${
        media
          ? `<Relationship Id="${media.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${media.name}"/>`
          : ""
      }<Relationship Id="${notesRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${index + 1}.xml"/></Relationships>`
    });
    entries.push({
      name: `ppt/notesSlides/notesSlide${index + 1}.xml`,
      content: notesSlideXml(slide, index + 1, speakerNotesForSlide(slide, index + 1, visualPlan?.slides[index]), theme)
    });
    entries.push({
      name: `ppt/notesSlides/_rels/notesSlide${index + 1}.xml.rels`,
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${index + 1}.xml"/></Relationships>`
    });
  });

  mediaAssets.forEach((media) => {
    entries.push({ name: `ppt/media/${media.name}`, content: media.asset.buffer });
  });

  return makeZip(entries);
}

export async function preparePresentationDeckV3(
  deck: PresentationDeck,
  visualPlan: LocalDeckVisualPlan,
  options: { fallbackToV2?: boolean } = {}
): Promise<PresentationDeck> {
  try {
    if (!visualPlan?.slides?.length || visualPlan.slides.length !== deck.slides.length) {
      throw new Error("V3 visual plan slide count mismatch.");
    }
    return {
      ...deck,
      renderMode: "v3",
      v3VisualPlan: visualPlan,
      theme: deck.theme || "research_report"
    } as PresentationDeckWithV3;
  } catch (error) {
    if (options.fallbackToV2) return deck;
    throw error;
  }
}

export function createLocalPresentationProvider(): PresentationProvider {
  return {
    name: "local",
    async generate({ deck }) {
      return {
        buffer: buildPptx(deck),
        fileName: sanitizeFileName(deck.title),
        mimeType: PPTX_MIME
      };
    }
  };
}
