import type {
  AcademicPptIconDecoration,
  AcademicPptExtendedSlideLayout,
  AcademicPptOutline,
  AcademicPptSettings,
  AcademicPptSlide,
  AcademicPptVisualType
} from "@/lib/smart-tools/academic-ppt/types";
import { createAcademicPptTheme, type AcademicPptBox, type AcademicPptTheme } from "@/lib/smart-tools/academic-ppt/ppt-theme";
import { isAcademicPptLayoutSupported, isAcademicPptVisualTypeSupported } from "@/lib/smart-tools/academic-ppt/template-registry";
import { planAcademicPptIconDecorations } from "@/lib/smart-tools/academic-ppt/icon-decoration";
import { normalizeAcademicPptSettings } from "@/lib/smart-tools/academic-ppt/task-api";
import {
  estimateAcademicPptTextDensity,
  getAcademicPptTextLimits,
  normalizeAcademicPptBullets,
  truncateAcademicPptText
} from "@/lib/smart-tools/academic-ppt/text-layout";

export type AcademicPptRenderSlidePlan = {
  slideIndex: number;
  layout: AcademicPptExtendedSlideLayout;
  visualType: AcademicPptVisualType;
  templateIntent: string;
  title: string;
  subtitle?: string;
  bullets: string[];
  emphasis?: string;
  visualHint?: string;
  iconDecorations?: AcademicPptIconDecoration[];
  regions: {
    header: AcademicPptBox;
    body: AcademicPptBox;
    visual: AcademicPptBox;
    footer: AcademicPptBox;
  };
  density: "low" | "normal" | "high";
};

export type AcademicPptRenderPlan = {
  templateId: string;
  theme: AcademicPptTheme;
  slides: AcademicPptRenderSlidePlan[];
};

const layoutVisualDefaults: Record<AcademicPptExtendedSlideLayout, AcademicPptVisualType> = {
  cover: "none",
  agenda: "process",
  section: "none",
  content: "none",
  two_column: "comparison",
  compare: "comparison",
  method: "flow",
  experiment: "table",
  result: "kpi",
  timeline: "timeline",
  table: "table",
  formula: "formula",
  chart: "chart",
  architecture: "architecture",
  flow: "flow",
  summary: "kpi",
  ending: "none"
};

const layoutFallbacks: Partial<Record<AcademicPptExtendedSlideLayout, AcademicPptExtendedSlideLayout>> = {
  table: "content",
  formula: "content",
  chart: "result",
  architecture: "method",
  flow: "method",
  two_column: "content",
  ending: "summary"
};

function normalizeLayout(layout: AcademicPptExtendedSlideLayout, theme: AcademicPptTheme): AcademicPptExtendedSlideLayout {
  if (isAcademicPptLayoutSupported(theme.template, layout)) return layout;
  return layoutFallbacks[layout] || "content";
}

function inferLayout(slide: AcademicPptSlide, index: number, total: number): AcademicPptExtendedSlideLayout {
  if (index === 0) return "cover";
  if (index === total - 1 && (slide.layout === "summary" || slide.layout === "ending")) return slide.layout;
  const text = [slide.title, slide.subtitle, slide.emphasis, slide.visualHint, ...(slide.bullets || [])]
    .join(" ")
    .toLowerCase();
  if (/formula|equation|loss|objective|公式|方程|损失函数|目标函数/.test(text)) return "formula";
  if (/architecture|system|module|pipeline|架构|系统|模块|组件/.test(text)) return "architecture";
  if (/method|approach|framework|algorithm|process|flow|方法|框架|算法|流程/.test(text)) return "method";
  if (/experiment|evaluation|dataset|benchmark|setup|实验|评估|数据集|设置|指标/.test(text)) return "experiment";
  if (/result|finding|analysis|accuracy|performance|metric|结果|发现|分析|性能|提升|下降/.test(text)) return "result";
  if (/compare|versus|baseline|ablation|pros|cons|对比|基线|消融|优劣/.test(text)) return "compare";
  if (/timeline|roadmap|stage|phase|plan|时间|阶段|路线|计划/.test(text)) return "timeline";
  return slide.layout || "content";
}

function normalizeVisualType(
  slide: AcademicPptSlide,
  layout: AcademicPptExtendedSlideLayout,
  theme: AcademicPptTheme
): AcademicPptVisualType {
  const requested = slide.visualType || layoutVisualDefaults[layout] || "none";
  const mismatchFixed =
    (layout === "method" && requested === "none") ||
    (layout === "architecture" && requested !== "architecture") ||
    (layout === "experiment" && requested !== "table") ||
    (layout === "result" && requested === "none") ||
    (layout === "formula" && requested !== "formula") ||
    (layout === "compare" && requested !== "comparison") ||
    (layout === "timeline" && requested !== "timeline")
      ? layoutVisualDefaults[layout]
      : requested;
  if (isAcademicPptVisualTypeSupported(theme.template, mismatchFixed)) return mismatchFixed;
  return layoutVisualDefaults[layout] || "none";
}

function regionsForLayout(layout: AcademicPptExtendedSlideLayout, theme: AcademicPptTheme) {
  const content = theme.regions.content;
  const gap = theme.spacing.cardGap;
  if (layout === "cover" || layout === "section" || layout === "ending") {
    return {
      header: theme.regions.header,
      body: { x: 100, y: 160, w: 720, h: 360 },
      visual: { x: 850, y: 140, w: 330, h: 410 },
      footer: theme.regions.footer
    };
  }
  if (layout === "agenda") {
    return {
      header: theme.regions.header,
      body: { x: content.x, y: content.y + 20, w: content.w, h: content.h - 20 },
      visual: { x: content.x + content.w - 300, y: content.y + 40, w: 260, h: content.h - 80 },
      footer: theme.regions.footer
    };
  }
  if (layout === "compare" || layout === "two_column") {
    return {
      header: theme.regions.header,
      body: { x: content.x, y: content.y + 12, w: (content.w - gap) / 2, h: content.h - 20 },
      visual: { x: content.x + (content.w + gap) / 2, y: content.y + 12, w: (content.w - gap) / 2, h: content.h - 20 },
      footer: theme.regions.footer
    };
  }
  if (layout === "timeline" || layout === "flow") {
    return {
      header: theme.regions.header,
      body: { x: content.x, y: content.y + 74, w: content.w, h: content.h - 96 },
      visual: { x: content.x, y: content.y + 16, w: content.w, h: 58 },
      footer: theme.regions.footer
    };
  }
  return {
    header: theme.regions.header,
    body: { x: content.x, y: content.y + 8, w: Math.round(content.w * 0.58), h: content.h - 16 },
    visual: { x: content.x + Math.round(content.w * 0.62), y: content.y + 8, w: Math.round(content.w * 0.38), h: content.h - 16 },
    footer: theme.regions.footer
  };
}

function templateIntentFor(slide: AcademicPptSlide, layout: AcademicPptExtendedSlideLayout, visualType: AcademicPptVisualType) {
  if (slide.templateIntent) return slide.templateIntent;
  if (layout === "cover") return "Open with title, research context, source, and presentation framing.";
  if (layout === "agenda") return "Show the talk structure with numbered sections.";
  if (layout === "section") return "Create a chapter transition and reset audience attention.";
  if (layout === "method" || layout === "flow" || visualType === "flow") return "Explain process or methodology as steps.";
  if (layout === "architecture" || visualType === "architecture") return "Represent system or method modules and relationships.";
  if (layout === "experiment" || visualType === "table") return "Summarize setup, variables, datasets, and metrics.";
  if (layout === "result" || visualType === "chart" || visualType === "kpi") return "Lead with evidence and key findings.";
  if (layout === "compare" || visualType === "comparison") return "Contrast dimensions, baselines, or alternatives.";
  if (layout === "summary" || layout === "ending") return "Close with takeaways and next steps.";
  return "Present source-supported academic content with a clear visual anchor.";
}

export function createAcademicPptRenderPlan(outline: AcademicPptOutline, settings: AcademicPptSettings): AcademicPptRenderPlan {
  const normalizedSettings = normalizeAcademicPptSettings(settings);
  const theme = createAcademicPptTheme(normalizedSettings);
  const limits = getAcademicPptTextLimits(normalizedSettings.informationDensity);
  let lastLayout: AcademicPptExtendedSlideLayout | undefined;
  let sameLayoutCount = 0;
  const slides = outline.slides.slice(0, 60).map<AcademicPptRenderSlidePlan>((slide, index) => {
    const rawLayout = inferLayout(slide, index, outline.slides.length);
    let layout = normalizeLayout(rawLayout, theme);
    if (layout === lastLayout) sameLayoutCount += 1;
    else sameLayoutCount = 1;
    if (sameLayoutCount >= 3 && layout === "content" && index > 1 && index < outline.slides.length - 1) {
      layout = index % 2 === 0 ? "two_column" : "chart";
      sameLayoutCount = 1;
    }
    lastLayout = layout;
    const visualType = normalizeVisualType(slide, layout, theme);
    const density = estimateAcademicPptTextDensity(slide);
    const bullets = normalizeAcademicPptBullets(slide.bullets, {
      density: layout === "cover" || layout === "section" ? "low" : normalizedSettings.informationDensity
    });
    const plannedSlide = {
      ...slide,
      layout,
      visualType,
      bullets
    };
    return {
      slideIndex: index + 1,
      layout,
      visualType,
      templateIntent: templateIntentFor(slide, layout, visualType),
      title: truncateAcademicPptText(slide.title, limits.title) || `Slide ${index + 1}`,
      subtitle: slide.subtitle ? truncateAcademicPptText(slide.subtitle, limits.subtitle) : undefined,
      bullets,
      emphasis: slide.emphasis ? truncateAcademicPptText(slide.emphasis, limits.emphasis) : bullets[0],
      visualHint: slide.visualHint ? truncateAcademicPptText(slide.visualHint, limits.visualHint) : undefined,
      iconDecorations: normalizedSettings.enableIconDecoration
        ? planAcademicPptIconDecorations({ slide: plannedSlide, slideIndex: index + 1, templateId: theme.id })
        : undefined,
      regions: regionsForLayout(layout, theme),
      density
    };
  });

  return {
    templateId: theme.id,
    theme,
    slides
  };
}
