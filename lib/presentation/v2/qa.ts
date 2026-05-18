import type { PresentationDeck, PresentationQaFinding, PresentationQaReport } from "@/lib/presentation/types";
import { PRESENTATION_V2_PRESETS } from "@/lib/presentation/v2/presets";
import type { DeckVisualPlan, VisualBlock } from "@/lib/presentation/v2/visual-plan";

export type SlideQualityDimensionScores = {
  contentDensity: number;
  factuality: number;
  structure: number;
  visualBrief: number;
  speakerNotes: number;
  layoutFit: number;
};

export type SlideQualityIssueCode =
  | "low_content_density"
  | "missing_facts"
  | "missing_structure"
  | "missing_visual_brief"
  | "missing_image_query"
  | "missing_speaker_notes"
  | "layout_mismatch"
  | "generic_title"
  | "too_many_empty_fields";

export type SlideQualityIssue = {
  code: SlideQualityIssueCode;
  message: string;
  severity: "low" | "medium" | "high";
};

export type SlideQualityScore = {
  slideIndex: number;
  score: number;
  dimensions: SlideQualityDimensionScores;
  issues: SlideQualityIssue[];
  shouldRewrite: boolean;
  shouldRelayout: boolean;
};

export type DeckQualityReport = {
  totalScore: number;
  slideScores: SlideQualityScore[];
  lowQualitySlides: number[];
  shouldRepair: boolean;
  summary: string[];
};

export type RenderedVisualQualityIssueCode =
  | "too_text_heavy"
  | "missing_visual_block"
  | "missing_title"
  | "missing_page_number"
  | "missing_caption"
  | "too_many_empty_blocks"
  | "layout_too_plain"
  | "low_visual_coverage";

export type RenderedVisualSlideMetrics = {
  slideIndex: number;
  visualCoverageRatio: number;
  mainBlockCoverageRatio: number;
  textBoxCount: number;
  visualBlockCount: number;
};

export type RenderedVisualQualityReport = {
  score: number;
  issues: {
    slideIndex: number;
    code: RenderedVisualQualityIssueCode;
    message: string;
    severity: "low" | "medium" | "high";
  }[];
  slideMetrics: RenderedVisualSlideMetrics[];
  summary: string[];
};

const QUALITY_REWRITE_THRESHOLD = 70;
const GENERIC_TITLE_RE = /^(overview|things|stuff|summary|intro|introduction|content|contents|key points?|main points?|steps?|todo|notes?|概述|总览|简介|内容|重点|要点|总结|步骤|事项|说明)$/i;
const GENERIC_TEXT_RE = /^(important points?|key points?|main points?|overview|things|stuff|todo|notes?|内容|重点|要点|事项|说明)$/i;
const FACT_SIGNAL_RE =
  /(\d+(?:\.\d+)?\s*(?:%|倍|项|个|步|层|轮|次|年|分钟|页|x)?)|上传|资料|来源|研究|实验|案例|课堂|学生|方法|步骤|流程|数据|指标|结果|结论|证据|文献|实践|评价|对比|线性|关键帧|动画|曲线|keyframe|tween|interpolation|easing|graph|research|classroom|case|data|metric|evidence|method|workflow|comparison/i;
const VISUAL_SIGNAL_RE = /visual|image|diagram|chart|timeline|flow|map|photo|illustration|图|配图|示意|流程|图表|时间线|照片|插图|视觉/i;
const EXERCISE_SIGNAL_RE = /练习|作业|课堂活动|提问|问题|测验|任务|活动|exercise|quiz|homework|practice|question|activity/i;
const COMPARISON_SIGNAL_RE = /对比|比较|差异|优劣|before|after|versus|compare|comparison/i;
const PROCESS_SIGNAL_RE = /流程|步骤|阶段|路径|过程|step|process|workflow|phase/i;
const DATA_SIGNAL_RE = /数据|实验|结果|指标|统计|accuracy|metric|result|chart|data|evidence/i;

function weightedLength(text: string) {
  let total = 0;
  for (const char of text) {
    total += /^[\x00-\x7F]$/.test(char) ? 0.55 : 1;
  }
  return total;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function cleanText(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function textArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item)).filter(Boolean);
}

function objectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

function tableRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map((cell) => cleanText(cell)).filter(Boolean))
    .filter((row) => row.length > 0);
}

function collectContentText(slide: any) {
  const metrics = objectArray(slide?.metrics).flatMap((metric) => [metric.label, metric.value, metric.detail].map(cleanText));
  const table = tableRows(slide?.table).flat();
  return [slide?.title, slide?.subtitle, ...textArray(slide?.bullets), ...metrics, ...table].map(cleanText).filter(Boolean);
}

function collectAllText(slide: any) {
  return [...collectContentText(slide), slide?.visualBrief, slide?.imageQuery, slide?.speakerNotes].map(cleanText).filter(Boolean);
}

function hasMeaningfulText(value: unknown, minLength = 12) {
  const text = cleanText(value);
  return weightedLength(text) >= minLength && !GENERIC_TEXT_RE.test(text);
}

function hasGenericTitle(slide: any) {
  const title = cleanText(slide?.title);
  if (!title) return false;
  return GENERIC_TITLE_RE.test(title) || (weightedLength(title) <= 6 && !FACT_SIGNAL_RE.test(title));
}

function structuredItemCount(slide: any) {
  return textArray(slide?.bullets).length + objectArray(slide?.metrics).length + tableRows(slide?.table).length;
}

function contentWeightedLength(slide: any) {
  return collectContentText(slide).reduce((total, item) => total + weightedLength(item), 0);
}

function slideText(slide: any) {
  return collectAllText(slide).join(" ");
}

function addIssue(issues: SlideQualityIssue[], code: SlideQualityIssueCode, message: string, severity: SlideQualityIssue["severity"]) {
  if (issues.some((issue) => issue.code === code)) return;
  issues.push({ code, message, severity });
}

function roleForSlide(slide: any) {
  const preset = typeof slide?.layoutPreset === "string" ? PRESENTATION_V2_PRESETS[slide.layoutPreset as keyof typeof PRESENTATION_V2_PRESETS] : null;
  if (preset) return preset.role;
  if (slide?.type === "cover") return "cover";
  if (slide?.type === "agenda") return "navigation";
  if (slide?.type === "section") return "section";
  if (slide?.type === "closing") return "closing";
  return "content";
}

function scoreContentDensity(slide: any, issues: SlideQualityIssue[]) {
  const role = roleForSlide(slide);
  const bullets = textArray(slide?.bullets);
  const metrics = objectArray(slide?.metrics);
  const table = tableRows(slide?.table);
  const totalLength = contentWeightedLength(slide);
  const structured = bullets.length + metrics.length + table.length;

  let score = 0;
  if (hasMeaningfulText(slide?.title, 8)) score += 18;
  if (hasMeaningfulText(slide?.subtitle, 18)) score += 10;
  score += Math.min(38, bullets.reduce((total, item) => total + Math.min(10, Math.max(4, weightedLength(item) / 6)), 0));
  score += Math.min(24, metrics.length * 10 + table.length * 8);
  if (totalLength >= 180) score += 16;
  else if (totalLength >= 110) score += 10;
  else if (totalLength >= 65) score += 6;

  if (role === "cover" || role === "section") score += hasMeaningfulText(slide?.subtitle, 12) ? 18 : 8;
  if (role === "closing" && bullets.length >= 2) score += 16;

  if (structured <= 1 && role !== "cover" && role !== "section") score -= 25;
  if (collectContentText(slide).some((item) => GENERIC_TEXT_RE.test(item))) score -= 15;

  const finalScore = clampScore(score);
  if (finalScore < 55) {
    addIssue(issues, "low_content_density", "Slide has too little concrete content for a generated PPT.", finalScore < 40 ? "high" : "medium");
  }
  if (structured === 0 && role !== "cover" && role !== "section") {
    addIssue(issues, "too_many_empty_fields", "Slide has no bullets, metrics, or table content.", "high");
  }
  return finalScore;
}

function scoreFactuality(slide: any, issues: SlideQualityIssue[]) {
  const text = slideText(slide);
  const contentParts = collectContentText(slide);
  const signalMatches = text.match(new RegExp(FACT_SIGNAL_RE.source, "gi")) || [];
  const longSpecificItems = contentParts.filter((item) => weightedLength(item) >= 34 && !GENERIC_TEXT_RE.test(item)).length;
  const hasMetricOrTable = objectArray(slide?.metrics).length > 0 || tableRows(slide?.table).length > 0;
  const hasNamedEnglishTerm = /\b[A-Z][A-Za-z0-9-]{4,}\b/.test(text);

  let score = 25 + Math.min(35, signalMatches.length * 9) + Math.min(24, longSpecificItems * 8);
  if (hasMetricOrTable) score += 14;
  if (hasNamedEnglishTerm) score += 8;
  if (hasGenericTitle(slide) && contentParts.length <= 3) score -= 20;

  const finalScore = clampScore(score);
  if (finalScore < 55) {
    addIssue(issues, "missing_facts", "Slide does not show enough concrete facts, examples, data, or source-backed details.", finalScore < 40 ? "high" : "medium");
  }
  return finalScore;
}

function scoreStructure(slide: any, issues: SlideQualityIssue[]) {
  const bullets = textArray(slide?.bullets);
  const metrics = objectArray(slide?.metrics);
  const table = tableRows(slide?.table);
  const text = slideText(slide);
  const role = roleForSlide(slide);
  const preset = cleanText(slide?.layoutPreset);
  let score = hasMeaningfulText(slide?.title, 8) ? 50 : 15;

  const hasRequiredContent =
    (preset === "agenda_list" && bullets.length >= 3) ||
    (preset === "image_explanation" && bullets.length >= 2) ||
    (preset === "knowledge_cards" && bullets.length >= 3) ||
    (preset === "process_steps" && bullets.length >= 3) ||
    (preset === "comparison_matrix" && (bullets.length >= 4 || table.length >= 2)) ||
    (preset === "data_insight" && (metrics.length >= 2 || table.length >= 2 || (bullets.length >= 3 && DATA_SIGNAL_RE.test(text)))) ||
    (preset === "lesson_exercise" && bullets.length >= 3 && EXERCISE_SIGNAL_RE.test(text)) ||
    (preset === "summary_closing" && bullets.length >= 2) ||
    ((preset === "academic_cover" || preset === "teaching_cover") && hasMeaningfulText(slide?.subtitle, 12)) ||
    (preset === "section_divider" && (hasMeaningfulText(slide?.subtitle, 12) || bullets.length >= 1)) ||
    (!preset && structuredItemCount(slide) >= 3);

  if (hasRequiredContent) score += 42;
  else if (structuredItemCount(slide) >= 3) score += 28;
  else if (role === "cover" || role === "section") score += hasMeaningfulText(slide?.subtitle, 12) ? 32 : 18;
  else score += Math.min(24, structuredItemCount(slide) * 8);

  if (hasGenericTitle(slide)) score -= 12;

  const finalScore = clampScore(score);
  if (finalScore < 70) {
    addIssue(issues, "missing_structure", "Slide is missing the fields expected by its page type or preset.", finalScore < 45 ? "high" : "medium");
  }
  return finalScore;
}

function scoreVisualBrief(slide: any, issues: SlideQualityIssue[]) {
  const hasAsset = Boolean(slide?.visualAsset);
  const hasBrief = hasMeaningfulText(slide?.visualBrief, 18) || (hasMeaningfulText(slide?.visualBrief, 10) && VISUAL_SIGNAL_RE.test(cleanText(slide?.visualBrief)));
  const hasQuery = hasMeaningfulText(slide?.imageQuery, 12);

  let score = 0;
  if (hasAsset) score += 45;
  if (hasBrief) score += 40;
  if (hasQuery) score += 30;
  if (hasBrief && hasQuery) score += 15;

  if (!hasAsset && !hasBrief) addIssue(issues, "missing_visual_brief", "Slide is missing a visual brief or concrete visual direction.", "medium");
  if (!hasAsset && !hasQuery) addIssue(issues, "missing_image_query", "Slide is missing an image query for web search or generated fallback.", "medium");
  return clampScore(score);
}

function scoreSpeakerNotes(slide: any, issues: SlideQualityIssue[]) {
  const notes = cleanText(slide?.speakerNotes);
  let score = 0;
  if (weightedLength(notes) >= 90) score = 95;
  else if (weightedLength(notes) >= 55) score = 78;
  else if (weightedLength(notes) >= 30) score = 58;
  else if (notes) score = 35;

  if (notes && !FACT_SIGNAL_RE.test(notes) && weightedLength(notes) < 80) score = Math.min(score, 52);
  if (score < 55) addIssue(issues, "missing_speaker_notes", "Slide is missing useful speaker notes.", "medium");
  return clampScore(score);
}

function scoreLayoutFit(slide: any, slideIndex: number, issues: SlideQualityIssue[]) {
  const presetId = cleanText(slide?.layoutPreset);
  const preset = presetId ? PRESENTATION_V2_PRESETS[presetId as keyof typeof PRESENTATION_V2_PRESETS] : null;
  const type = cleanText(slide?.type);
  const text = slideText(slide);
  const bullets = textArray(slide?.bullets);
  const metrics = objectArray(slide?.metrics);
  const table = tableRows(slide?.table);
  let mismatch = false;

  if (!preset) mismatch = true;
  if ((presetId === "academic_cover" || presetId === "teaching_cover") && type !== "cover" && slideIndex !== 0) mismatch = true;
  if (presetId === "agenda_list" && type !== "agenda" && bullets.length < 3) mismatch = true;
  if (presetId === "section_divider" && type !== "section" && !hasMeaningfulText(slide?.subtitle, 12)) mismatch = true;
  if (presetId === "process_steps" && type !== "timeline" && !PROCESS_SIGNAL_RE.test(text)) mismatch = true;
  if (presetId === "comparison_matrix" && type !== "comparison" && table.length < 2 && !COMPARISON_SIGNAL_RE.test(text)) mismatch = true;
  if (presetId === "data_insight" && type !== "data" && metrics.length < 1 && !DATA_SIGNAL_RE.test(text)) mismatch = true;
  if (presetId === "lesson_exercise" && !EXERCISE_SIGNAL_RE.test(text)) mismatch = true;
  if (presetId === "image_explanation" && !slide?.visualAsset && !slide?.visualBrief && !slide?.imageQuery) mismatch = true;

  let score = preset ? 88 : 62;
  if (mismatch) score -= 38;
  if (preset?.maxBullets && bullets.length > preset.maxBullets) score -= 8;
  if (structuredItemCount(slide) === 0 && preset?.role === "content") score -= 18;

  const finalScore = clampScore(score);
  if (mismatch) addIssue(issues, "layout_mismatch", "Slide content does not fit the selected V2 layout preset.", finalScore < 45 ? "high" : "medium");
  return finalScore;
}

export function evaluateSlideQuality(slide: any, slideIndex: number): SlideQualityScore {
  const issues: SlideQualityIssue[] = [];

  if (!hasMeaningfulText(slide?.title, 6)) {
    addIssue(issues, "missing_structure", "Slide is missing a meaningful title.", "high");
  } else if (hasGenericTitle(slide)) {
    addIssue(issues, "generic_title", "Slide title is too generic for a polished generated PPT.", "low");
  }

  const dimensions: SlideQualityDimensionScores = {
    contentDensity: scoreContentDensity(slide, issues),
    factuality: scoreFactuality(slide, issues),
    structure: scoreStructure(slide, issues),
    visualBrief: scoreVisualBrief(slide, issues),
    speakerNotes: scoreSpeakerNotes(slide, issues),
    layoutFit: scoreLayoutFit(slide, slideIndex, issues)
  };

  const missingFields = [
    !hasMeaningfulText(slide?.title, 6),
    structuredItemCount(slide) === 0,
    !slide?.visualAsset && !hasMeaningfulText(slide?.visualBrief, 10),
    !slide?.visualAsset && !hasMeaningfulText(slide?.imageQuery, 10),
    !hasMeaningfulText(slide?.speakerNotes, 25)
  ].filter(Boolean).length;

  if (missingFields >= 3) {
    addIssue(issues, "too_many_empty_fields", "Slide has too many empty planning fields for reliable rendering.", missingFields >= 4 ? "high" : "medium");
  }

  const score = clampScore(
    dimensions.contentDensity * 0.25 +
      dimensions.factuality * 0.2 +
      dimensions.structure * 0.18 +
      dimensions.visualBrief * 0.15 +
      dimensions.speakerNotes * 0.12 +
      dimensions.layoutFit * 0.1
  );
  const shouldRelayout = issues.some((issue) => issue.code === "layout_mismatch");

  return {
    slideIndex,
    score,
    dimensions,
    issues,
    shouldRewrite: score < QUALITY_REWRITE_THRESHOLD || issues.some((issue) => issue.severity === "high"),
    shouldRelayout
  };
}

export function evaluateDeckQuality(deck: any): DeckQualityReport {
  const slides: unknown[] = Array.isArray(deck?.slides) ? deck.slides : [];
  const slideScores: SlideQualityScore[] = slides.map((slide: unknown, index: number) => evaluateSlideQuality(slide, index));
  const totalScore = slideScores.length
    ? clampScore(slideScores.reduce((total: number, item: SlideQualityScore) => total + item.score, 0) / slideScores.length)
    : 0;
  const lowQualitySlides = slideScores
    .filter((item: SlideQualityScore) => item.score < QUALITY_REWRITE_THRESHOLD || item.shouldRewrite || item.shouldRelayout)
    .map((item: SlideQualityScore) => item.slideIndex);
  const issueCounts: Record<string, number> = slideScores.reduce((counts: Record<string, number>, item: SlideQualityScore) => {
    for (const issue of item.issues) counts[issue.code] = (counts[issue.code] || 0) + 1;
    return counts;
  }, {});
  const summary = [
    `Evaluated ${slideScores.length} slide${slideScores.length === 1 ? "" : "s"}; average quality score ${totalScore}.`,
    lowQualitySlides.length
      ? `Low-quality slides: ${lowQualitySlides.map((index: number) => index + 1).join(", ")}.`
      : "No low-quality slides detected.",
    ...Object.entries(issueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([code, count]) => `${code}: ${count}`)
  ];

  return {
    totalScore,
    slideScores,
    lowQualitySlides,
    shouldRepair: lowQualitySlides.length > 0,
    summary
  };
}

const VISUAL_BLOCK_KINDS = new Set([
  "text_card",
  "callout_card",
  "figure_panel",
  "image_panel",
  "comparison_table",
  "process_diagram",
  "timeline",
  "bar_chart",
  "metric_card",
  "takeaway"
]);

const MAIN_VISUAL_PLAN_KINDS = new Set(["figure_panel", "image_panel", "comparison_table", "process_diagram", "timeline", "bar_chart"]);
const TEXT_BLOCK_KINDS = new Set(["title", "subtitle", "text_card", "callout_card", "quote", "takeaway", "caption"]);
const PLAN_W = 1152;
const PLAN_H = 648;
const PLAN_USABLE_AREA = (PLAN_W - 104) * (PLAN_H - 118);

function blockHasContent(block: VisualBlock) {
  return Boolean(
    cleanText(block.title) ||
      cleanText(block.body) ||
      cleanText(block.caption) ||
      cleanText(block.imageQuery) ||
      cleanText(block.imageUrl) ||
      (Array.isArray(block.bullets) && block.bullets.some((item) => cleanText(item))) ||
      block.data
  );
}

export function evaluateVisualPlanQuality(plan: DeckVisualPlan): RenderedVisualQualityReport {
  const issues: RenderedVisualQualityReport["issues"] = [];
  const slides = Array.isArray(plan?.slides) ? plan.slides : [];
  const slideMetrics: RenderedVisualSlideMetrics[] = [];
  let total = 0;

  for (const slide of slides) {
    const blocks = Array.isArray(slide.blocks) ? slide.blocks : [];
    const hasTitle = blocks.some((block) => block.kind === "title" && cleanText(block.title || block.body));
    const visualBlocks = blocks.filter((block) => VISUAL_BLOCK_KINDS.has(block.kind));
    const mainVisualBlocks = blocks.filter((block) => MAIN_VISUAL_PLAN_KINDS.has(block.kind));
    const hasCaption = blocks.some((block) => block.kind === "caption" && cleanText(block.caption || block.body)) || visualBlocks.some((block) => cleanText(block.caption));
    const hasPageNumber = blocks.some((block) => block.role === "page_number" || (block.kind === "caption" && /^\d{1,2}$/.test(cleanText(block.caption))));
    const emptyBlocks = blocks.filter((block) => !blockHasContent(block));
    const textOnlyBlocks = blocks.filter((block) => TEXT_BLOCK_KINDS.has(block.kind));
    const textHeavy = blocks.length > 0 && textOnlyBlocks.length / blocks.length > 0.72 && visualBlocks.length < 2;
    const coveredArea = blocks.reduce((totalArea, block) => totalArea + Math.max(0, block.w) * Math.max(0, block.h), 0);
    const mainVisualArea = mainVisualBlocks.reduce((maxArea, block) => Math.max(maxArea, Math.max(0, block.w) * Math.max(0, block.h)), 0);
    const visualCoverageRatio = Math.min(1, coveredArea / PLAN_USABLE_AREA);
    const mainBlockCoverageRatio = Math.min(1, mainVisualArea / PLAN_USABLE_AREA);
    const textBoxCount = textOnlyBlocks.length;
    const visualBlockCount = visualBlocks.length;

    slideMetrics.push({
      slideIndex: slide.slideIndex,
      visualCoverageRatio: Number(visualCoverageRatio.toFixed(3)),
      mainBlockCoverageRatio: Number(mainBlockCoverageRatio.toFixed(3)),
      textBoxCount,
      visualBlockCount
    });

    let slideScore = 100;
    if (!hasTitle) {
      slideScore -= 24;
      issues.push({ slideIndex: slide.slideIndex, code: "missing_title", message: "Slide visual plan is missing a title block.", severity: "high" });
    }
    if (!visualBlocks.length) {
      slideScore -= 32;
      issues.push({ slideIndex: slide.slideIndex, code: "missing_visual_block", message: "Slide has no card, figure, chart, process, table, or takeaway block.", severity: "high" });
    }
    if (!hasCaption) {
      slideScore -= 12;
      issues.push({ slideIndex: slide.slideIndex, code: "missing_caption", message: "Slide is missing a caption or figure note.", severity: "medium" });
    }
    if (!hasPageNumber) {
      slideScore -= 10;
      issues.push({ slideIndex: slide.slideIndex, code: "missing_page_number", message: "Slide is missing a page number/footer block.", severity: "medium" });
    }
    if (emptyBlocks.length > 1) {
      slideScore -= 14;
      issues.push({ slideIndex: slide.slideIndex, code: "too_many_empty_blocks", message: "Slide contains multiple empty visual blocks.", severity: "medium" });
    }
    if (textHeavy) {
      slideScore -= 20;
      issues.push({ slideIndex: slide.slideIndex, code: "too_text_heavy", message: "Slide visual plan is too text-heavy.", severity: "medium" });
    }
    if (visualBlocks.length <= 1 && blocks.every((block) => ["title", "subtitle", "text_card", "caption"].includes(block.kind))) {
      slideScore -= 22;
      issues.push({ slideIndex: slide.slideIndex, code: "layout_too_plain", message: "Slide layout is too close to a plain bullet list.", severity: "high" });
    }
    if (mainBlockCoverageRatio < 0.3 || visualCoverageRatio < 0.65 || (mainVisualBlocks.length === 0 && visualBlocks.length > 0)) {
      slideScore -= mainBlockCoverageRatio < 0.22 || visualCoverageRatio < 0.55 ? 24 : 14;
      issues.push({
        slideIndex: slide.slideIndex,
        code: "low_visual_coverage",
        message: "Slide visual plan does not fill enough of the usable page area with a main visual structure.",
        severity: mainBlockCoverageRatio < 0.22 || visualCoverageRatio < 0.55 ? "high" : "medium"
      });
    }

    total += clampScore(slideScore);
  }

  const score = slides.length ? clampScore(total / slides.length) : 0;
  const issueCounts = issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.code] = (counts[issue.code] || 0) + 1;
    return counts;
  }, {});

  return {
    score,
    issues,
    slideMetrics,
    summary: [
      `Evaluated ${slides.length} visual slide${slides.length === 1 ? "" : "s"}; average visual score ${score}.`,
      issues.length ? `Visual issues: ${Object.entries(issueCounts).map(([code, count]) => `${code}=${count}`).join(", ")}.` : "No visual plan issues detected."
    ]
  };
}

function hasDenseContent(slide: PresentationDeck["slides"][number]) {
  if (slide.type === "cover" || slide.type === "section" || slide.type === "closing") return true;
  if ((slide.bullets || []).length >= 3) return true;
  if ((slide.metrics || []).length >= 2) return true;
  if ((slide.table || []).length >= 3) return true;
  return false;
}

export function checkPresentationPlanV2(deck: PresentationDeck): PresentationQaReport {
  const findings: PresentationQaFinding[] = [];

  deck.slides.forEach((slide, index) => {
    if (!slide.layoutPreset) {
      findings.push({
        rule: "missing_preset",
        severity: "error",
        slideIndex: index,
        message: "Slide is missing a V2 layout preset."
      });
      return;
    }

    const preset = PRESENTATION_V2_PRESETS[slide.layoutPreset];
    if (!preset) {
      findings.push({
        rule: "missing_preset",
        severity: "error",
        slideIndex: index,
        message: `Unknown layout preset: ${slide.layoutPreset}`
      });
      return;
    }

    const bullets = slide.bullets || [];
    if (bullets.length > preset.maxBullets && preset.maxBullets > 0) {
      findings.push({
        rule: "too_many_bullets",
        severity: "warning",
        slideIndex: index,
        message: `Slide has ${bullets.length} bullets; preset ${preset.id} expects at most ${preset.maxBullets}.`
      });
    }

    const longest = Math.max(weightedLength(slide.title || ""), ...bullets.map((item) => weightedLength(item)));
    if (longest > 92) {
      findings.push({
        rule: "text_overflow_risk",
        severity: "warning",
        slideIndex: index,
        message: "Slide contains long text that may need compression or a different preset."
      });
    }

    if (preset.needsVisual && !slide.visualAsset && !slide.visualBrief && !slide.imageQuery) {
      findings.push({
        rule: "missing_visual",
        severity: "warning",
        slideIndex: index,
        message: `Preset ${preset.id} benefits from a visual query or generated image.`
      });
    }

    if (!hasDenseContent(slide)) {
      findings.push({
        rule: "low_content_density",
        severity: "warning",
        slideIndex: index,
        message: "Slide has too little teaching/report content for a generated PPT."
      });
    }
  });

  return {
    passed: findings.every((finding) => finding.severity !== "error"),
    findings
  };
}
