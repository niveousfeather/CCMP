import "server-only";

import type {
  AcademicPptExtendedSlideLayout,
  AcademicPptModelCriticReport,
  AcademicPptOutline,
  AcademicPptSettings,
  AcademicPptSlide,
  AcademicPptVisualType
} from "@/lib/smart-tools/academic-ppt/types";
import {
  getAcademicPptTextLimits,
  normalizeAcademicPptBullets,
  normalizeAcademicPptText,
  splitAcademicPptBullet,
  truncateAcademicPptText
} from "@/lib/smart-tools/academic-ppt/text-layout";

type ModelCriticRepairResult = {
  outline: AcademicPptOutline;
  applied: boolean;
  changes: string[];
};

const layoutVisualDefaults: Record<AcademicPptExtendedSlideLayout, AcademicPptVisualType> = {
  agenda: "process",
  architecture: "architecture",
  chart: "chart",
  compare: "comparison",
  content: "none",
  cover: "none",
  ending: "none",
  experiment: "table",
  flow: "flow",
  formula: "formula",
  method: "flow",
  result: "kpi",
  section: "none",
  summary: "kpi",
  table: "table",
  timeline: "timeline",
  two_column: "comparison"
};

const maxSlides = 60;
const allowedRepairActions = new Set<AcademicPptModelCriticReport["repairActions"][number]["action"]>([
  "shorten_text",
  "split_slide",
  "change_layout",
  "add_visual",
  "remove_visual",
  "rebalance_columns",
  "add_summary",
  "adjust_density"
]);

function cloneOutline(outline: AcademicPptOutline): AcademicPptOutline {
  return {
    title: outline.title,
    subtitle: outline.subtitle,
    language: outline.language === "en" ? "en" : "zh",
    slides: outline.slides.map((slide) => ({
      ...slide,
      bullets: [...(slide.bullets || [])],
      sections: slide.sections?.map((section) => ({ ...section, items: [...section.items] })),
      iconDecorations: slide.iconDecorations ? [...slide.iconDecorations] : undefined
    }))
  };
}

function normalizeTitle(value: string | undefined, settings: AcademicPptSettings) {
  const limits = getAcademicPptTextLimits(settings.informationDensity);
  return truncateAcademicPptText(value, Math.min(limits.title, 62)) || "Academic PPT";
}

function normalizeSlideText(slide: AcademicPptSlide, settings: AcademicPptSettings) {
  const limits = getAcademicPptTextLimits(settings.informationDensity);
  const bullets = normalizeAcademicPptBullets(
    (slide.bullets || []).flatMap((bullet) => splitAcademicPptBullet(bullet, Math.min(limits.bullet, 104))),
    { density: settings.informationDensity, minCount: slide.layout === "cover" || slide.layout === "section" ? 1 : 2 }
  );
  const overflow = (slide.bullets || []).slice(bullets.length).map((bullet) => normalizeAcademicPptText(bullet)).filter(Boolean);
  return {
    ...slide,
    title: normalizeTitle(slide.title, settings),
    subtitle: slide.subtitle ? truncateAcademicPptText(slide.subtitle, limits.subtitle) : undefined,
    bullets,
    speakerNotes: [slide.speakerNotes, ...overflow].map((item) => normalizeAcademicPptText(item)).filter(Boolean).join(" ").slice(0, 600) || undefined,
    visualHint: slide.visualHint ? truncateAcademicPptText(slide.visualHint, limits.visualHint) : undefined,
    emphasis: slide.emphasis ? truncateAcademicPptText(slide.emphasis, limits.emphasis) : bullets[0]
  };
}

function splitSlide(outline: AcademicPptOutline, slideIndex: number, settings: AcademicPptSettings, changes: string[]) {
  const index = slideIndex - 1;
  const slide = outline.slides[index];
  if (!slide || slide.layout === "cover" || slide.layout === "agenda" || slide.bullets.length < 5 || outline.slides.length >= maxSlides) return;
  const firstCount = Math.max(2, Math.ceil(slide.bullets.length / 2));
  const firstBullets = slide.bullets.slice(0, firstCount);
  const restBullets = slide.bullets.slice(firstCount);
  if (restBullets.length < 2) return;
  const title = truncateAcademicPptText(slide.title, 48);
  outline.slides.splice(
    index,
    1,
    normalizeSlideText({ ...slide, bullets: firstBullets, emphasis: firstBullets[0] }, settings),
    normalizeSlideText(
      {
        ...slide,
        title: outline.language === "en" ? `${title} Continued` : `${title} continued`,
        layout: slide.layout === "section" ? "content" : slide.layout,
        bullets: restBullets,
        emphasis: restBullets[0]
      },
      settings
    )
  );
  changes.push(`split_slide:${slideIndex}`);
}

function validateRepairActions(report: AcademicPptModelCriticReport, slideCount: number) {
  return report.repairActions.filter((action) => {
    if (!allowedRepairActions.has(action.action)) return false;
    if (action.slideIndex === undefined) return action.action === "add_summary" || action.action === "adjust_density";
    return Number.isInteger(action.slideIndex) && action.slideIndex > 0 && action.slideIndex <= slideCount;
  });
}

function chooseLayout(slide: AcademicPptSlide): AcademicPptExtendedSlideLayout {
  const text = [slide.title, slide.subtitle, slide.visualHint, slide.emphasis, ...slide.bullets].join(" ").toLowerCase();
  if (/method|approach|framework|flow|process|方法|流程|框架/.test(text)) return "method";
  if (/architecture|system|module|架构|系统|模块/.test(text)) return "architecture";
  if (/experiment|evaluation|dataset|metric|实验|评估|数据|指标/.test(text)) return "experiment";
  if (/result|finding|performance|accuracy|结果|发现|性能/.test(text)) return "result";
  if (/compare|baseline|ablation|versus|对比|消融|基线/.test(text)) return "compare";
  if (/timeline|roadmap|stage|时间|阶段|路线/.test(text)) return "timeline";
  if (/formula|equation|loss|公式|方程/.test(text)) return "formula";
  return slide.layout === "cover" || slide.layout === "agenda" || slide.layout === "summary" ? slide.layout : "content";
}

function addVisual(slide: AcademicPptSlide) {
  const layout = chooseLayout(slide);
  const visualType = layoutVisualDefaults[layout] || "none";
  return {
    ...slide,
    layout: layout === "content" && slide.layout !== "content" ? slide.layout : layout,
    visualType: visualType === "none" ? slide.visualType || "kpi" : visualType,
    visualHint: slide.visualHint || visualHintFor(layout, visualType)
  };
}

function visualHintFor(layout: AcademicPptExtendedSlideLayout, visualType: AcademicPptVisualType) {
  if (visualType === "flow" || layout === "method") return "Show the key logic as 3-5 connected steps.";
  if (visualType === "architecture" || layout === "architecture") return "Show modules as blocks with simple connections.";
  if (visualType === "table" || layout === "experiment") return "Use a compact setup table for datasets, settings, or metrics.";
  if (visualType === "kpi" || layout === "result") return "Use KPI cards or a compact chart placeholder for the key result.";
  if (visualType === "comparison" || layout === "compare") return "Use two balanced comparison columns.";
  if (visualType === "timeline" || layout === "timeline") return "Use a horizontal timeline with clear stages.";
  return "Use a compact supporting visual placeholder.";
}

function rebalanceSlide(slide: AcademicPptSlide, settings: AcademicPptSettings) {
  const limits = getAcademicPptTextLimits(settings.informationDensity);
  const half = Math.max(2, Math.ceil(Math.min(slide.bullets.length, limits.bullets) / 2));
  return normalizeSlideText(
    {
      ...slide,
      layout: slide.layout === "compare" ? "compare" : "two_column",
      visualType: "comparison",
      bullets: slide.bullets.slice(0, Math.max(half * 2, 4)),
      visualHint: slide.visualHint || "Use balanced left and right comparison cards."
    },
    settings
  );
}

function hasBalancedCompare(slide: AcademicPptSlide) {
  if (slide.layout !== "compare" && slide.layout !== "two_column") return true;
  const bulletCount = slide.bullets.length;
  if (bulletCount < 2) return false;
  const left = Math.ceil(bulletCount / 2);
  const right = bulletCount - left;
  return right > 0 && Math.abs(left - right) <= 1;
}

function createSummarySlide(outline: AcademicPptOutline): AcademicPptSlide {
  return {
    title: outline.language === "en" ? "Summary and Next Steps" : "Summary and Next Steps",
    layout: "summary",
    visualType: "kpi",
    templateIntent: "Close with 3-5 takeaway cards and future work.",
    visualHint: "Use takeaway cards for conclusions and future work.",
    bullets:
      outline.language === "en"
        ? ["Summarize the core contribution.", "Clarify current limitations.", "Identify next research steps."]
        : ["Summarize the core contribution.", "Clarify current limitations.", "Identify next research steps."],
    emphasis: "Keep the final message concrete and actionable."
  };
}

function ensureSummaryTakeaways(outline: AcademicPptOutline, settings: AcademicPptSettings, changes: string[]) {
  const summary = outline.slides.find((slide) => slide.layout === "summary" || slide.layout === "ending" || /summary|conclusion|takeaway|总结|结论/i.test(slide.title));
  if (!summary) {
    outline.slides.push(createSummarySlide(outline));
    changes.push("add_summary:new");
    return;
  }
  const fallback = createSummarySlide(outline).bullets;
  summary.bullets = [...summary.bullets, ...fallback].filter(Boolean).slice(0, Math.max(3, getAcademicPptTextLimits(settings.informationDensity).bullets));
  summary.visualType = summary.visualType === "none" ? "kpi" : summary.visualType || "kpi";
  summary.visualHint = summary.visualHint || "Use takeaway cards for the final summary.";
  changes.push("add_summary:takeaways");
}

function slideActionTargets(report: AcademicPptModelCriticReport) {
  const targets = new Map<number, AcademicPptModelCriticReport["repairActions"][number]["action"][]>();
  for (const action of report.repairActions) {
    if (!action.slideIndex) continue;
    const list = targets.get(action.slideIndex) || [];
    list.push(action.action);
    targets.set(action.slideIndex, list);
  }
  return targets;
}

function mergeSparseSlides(outline: AcademicPptOutline, settings: AcademicPptSettings, changes: string[]) {
  const limits = getAcademicPptTextLimits(settings.informationDensity);
  const merged: AcademicPptSlide[] = [];
  for (let index = 0; index < outline.slides.length; index += 1) {
    const slide = outline.slides[index];
    const previous = merged[merged.length - 1];
    const isSparse =
      slide.layout !== "cover" &&
      slide.layout !== "agenda" &&
      slide.layout !== "section" &&
      slide.layout !== "summary" &&
      slide.bullets.length <= 1 &&
      slide.bullets.join("").length < 80;
    const canMerge =
      isSparse &&
      previous &&
      previous.layout !== "cover" &&
      previous.layout !== "agenda" &&
      previous.layout !== "section" &&
      previous.layout !== "summary" &&
      previous.bullets.length + slide.bullets.length <= limits.bullets;
    if (canMerge) {
      previous.bullets = normalizeAcademicPptBullets([...previous.bullets, ...slide.bullets], {
        density: settings.informationDensity,
        minCount: 2
      });
      previous.speakerNotes = [previous.speakerNotes, slide.speakerNotes, slide.title].map((item) => normalizeAcademicPptText(item)).filter(Boolean).join(" ").slice(0, 600) || undefined;
      previous.visualType = previous.visualType === "none" ? slide.visualType || previous.visualType : previous.visualType;
      previous.visualHint = previous.visualHint || slide.visualHint || visualHintFor(previous.layout, previous.visualType || "none");
      changes.push(`mergeSparseSlides:${index + 1}`);
      continue;
    }
    merged.push(slide);
  }
  return merged;
}

function enforcePageLevelLayout(outline: AcademicPptOutline, settings: AcademicPptSettings, changes: string[]) {
  outline.slides = outline.slides.map((slide, index) => {
    let next = { ...slide };
    if ((next.layout === "method" || next.layout === "flow") && (!next.visualType || next.visualType === "none")) {
      next.visualType = "flow";
      next.visualHint = next.visualHint || visualHintFor(next.layout, "flow");
      changes.push(`methodVisual:${index + 1}`);
    }
    if (next.layout === "architecture" && (!next.visualType || next.visualType === "none")) {
      next.visualType = "architecture";
      next.visualHint = next.visualHint || visualHintFor(next.layout, "architecture");
      changes.push(`architectureVisual:${index + 1}`);
    }
    if (next.layout === "result" && (!next.visualType || next.visualType === "none")) {
      next.visualType = "kpi";
      next.visualHint = next.visualHint || visualHintFor(next.layout, "kpi");
      changes.push(`resultVisual:${index + 1}`);
    }
    if ((next.layout === "compare" || next.layout === "two_column") && !hasBalancedCompare(next)) {
      next = rebalanceSlide(next, settings);
      changes.push(`compareBalance:${index + 1}`);
    }
    if ((next.layout === "summary" || next.layout === "ending") && next.bullets.length < 3) {
      const fallback = createSummarySlide(outline).bullets;
      next.bullets = [...next.bullets, ...fallback].slice(0, Math.max(3, getAcademicPptTextLimits(settings.informationDensity).bullets));
      next.visualType = next.visualType === "none" ? "kpi" : next.visualType || "kpi";
      next.visualHint = next.visualHint || visualHintFor("summary", "kpi");
      changes.push(`summaryTakeaways:${index + 1}`);
    }
    return normalizeSlideText(next, settings);
  });
  outline.slides = mergeSparseSlides(outline, settings, changes);
}

export function repairAcademicPptOutlineFromModelCritic({
  outline,
  report,
  settings
}: {
  outline: AcademicPptOutline;
  report: AcademicPptModelCriticReport;
  settings: AcademicPptSettings;
}): ModelCriticRepairResult {
  const validActions = validateRepairActions(report, outline.slides.length);
  if (!report.enabled || report.status === "skipped" || !validActions.length) {
    return { outline, applied: false, changes: [] };
  }

  const next = cloneOutline(outline);
  const changes: string[] = [];
  const targets = slideActionTargets({ ...report, repairActions: validActions });

  for (const [slideIndex, actions] of targets) {
    const index = slideIndex - 1;
    const slide = next.slides[index];
    if (!slide) continue;

    if (actions.includes("split_slide")) {
      splitSlide(next, slideIndex, settings, changes);
      continue;
    }

    let repaired = slide;
    if (actions.includes("change_layout")) {
      const layout = chooseLayout(repaired);
      repaired = { ...repaired, layout, visualType: layoutVisualDefaults[layout] || repaired.visualType || "none" };
      changes.push(`change_layout:${slideIndex}:${layout}`);
    }
    if (actions.includes("add_visual")) {
      repaired = addVisual(repaired);
      changes.push(`add_visual:${slideIndex}:${repaired.visualType || "none"}`);
    }
    if (actions.includes("remove_visual")) {
      repaired = { ...repaired, visualType: "none", visualHint: undefined };
      changes.push(`remove_visual:${slideIndex}`);
    }
    if (actions.includes("rebalance_columns")) {
      repaired = rebalanceSlide(repaired, settings);
      changes.push(`rebalance_columns:${slideIndex}`);
    }
    if (actions.includes("shorten_text") || actions.includes("adjust_density")) {
      repaired = normalizeSlideText(repaired, settings);
      changes.push(`${actions.includes("shorten_text") ? "shorten_text" : "adjust_density"}:${slideIndex}`);
    }
    next.slides[index] = repaired;
  }

  if (validActions.some((action) => action.action === "add_summary")) {
    ensureSummaryTakeaways(next, settings, changes);
  }

  next.title = normalizeTitle(next.title, settings);
  next.subtitle = next.subtitle ? truncateAcademicPptText(next.subtitle, 140) : undefined;
  enforcePageLevelLayout(next, settings, changes);
  next.slides = next.slides.slice(0, maxSlides).map((slide) => normalizeSlideText(slide, settings));

  return {
    outline: next,
    applied: changes.length > 0,
    changes: Array.from(new Set(changes))
  };
}
