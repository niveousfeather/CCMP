import type {
  AcademicPptExtendedSlideLayout,
  AcademicPptOutline,
  AcademicPptQualityReport,
  AcademicPptSettings,
  AcademicPptSlide,
  AcademicPptVisualType
} from "@/lib/smart-tools/academic-ppt/types";
import { getAcademicPptTemplateForSettings, isAcademicPptLayoutSupported, isAcademicPptVisualTypeSupported } from "@/lib/smart-tools/academic-ppt/template-registry";
import {
  getAcademicPptTextLimits,
  normalizeAcademicPptBullets,
  normalizeAcademicPptText,
  splitAcademicPptBullet,
  truncateAcademicPptText
} from "@/lib/smart-tools/academic-ppt/text-layout";

const MAX_SPEAKER_NOTES_CHARS = 500;
const MAX_SLIDES = 60;

type RepairInput = {
  outline: AcademicPptOutline;
  report: AcademicPptQualityReport;
  settings: AcademicPptSettings;
  sourceText: string;
  sourceTitle?: string;
};

type RepairResult = {
  outline: AcademicPptOutline;
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

function normalizeText(value: string | undefined) {
  return normalizeAcademicPptText(value);
}

function truncateText(value: string | undefined, maxLength: number) {
  return truncateAcademicPptText(value, maxLength);
}

function extractFallbackBullets(sourceText: string, language: AcademicPptOutline["language"], count = 3) {
  const sentences = sourceText
    .split(/(?<=[。！？.!?])\s+|\n+/)
    .map(normalizeText)
    .filter((item) => item.length > 18)
    .slice(0, count)
    .map((item) => truncateText(item, 118));
  if (sentences.length) return sentences;
  return language === "en"
    ? ["Summarize the source-supported claim.", "Add evidence from the uploaded material.", "Keep this slide concise for presentation."]
    : ["围绕上传资料提炼本页核心观点。", "补充来自原文的方法、证据或结论。", "保持信息密度适中，便于汇报展示。"];
}

function inferLayout(slide: AcademicPptSlide, index: number, total: number): AcademicPptExtendedSlideLayout {
  const text = [slide.title, slide.subtitle, slide.emphasis, slide.visualHint, ...slide.bullets].map(normalizeText).join(" ").toLowerCase();
  if (index === 0) return "cover";
  if (index === total - 1 && /总结|结论|展望|summary|conclusion|future/.test(text)) return "summary";
  if (/method|approach|framework|算法|方法|框架|模型/.test(text)) return "method";
  if (/architecture|system|module|架构|模块/.test(text)) return "architecture";
  if (/experiment|evaluation|dataset|benchmark|实验|评估|数据集|设置/.test(text)) return "experiment";
  if (/result|finding|analysis|accuracy|performance|结果|发现|分析|指标|提升/.test(text)) return "result";
  if (/compare|versus|baseline|ablation|对比|消融|基线/.test(text)) return "compare";
  if (/timeline|stage|roadmap|阶段|时间线/.test(text)) return "timeline";
  if (/formula|equation|loss|公式|方程|损失函数/.test(text)) return "formula";
  return slide.layout || "content";
}

function normalizeVisualType(slide: AcademicPptSlide, layout: AcademicPptExtendedSlideLayout): AcademicPptVisualType {
  const requested = slide.visualType || layoutVisualDefaults[layout] || "none";
  if (requested === "none" && layoutVisualDefaults[layout] !== "none") return layoutVisualDefaults[layout];
  return requested;
}

function templateIntentFor(layout: AcademicPptExtendedSlideLayout, visualType: AcademicPptVisualType) {
  if (layout === "cover") return "Use a formal academic cover with title, subtitle, source context, and presentation framing.";
  if (layout === "agenda") return "Show the talk structure with numbered sections.";
  if (layout === "section") return "Use a chapter transition page with strong title hierarchy.";
  if (layout === "method" || visualType === "flow") return "Show method logic as connected steps.";
  if (layout === "architecture" || visualType === "architecture") return "Show modules and relationships as an architecture diagram.";
  if (layout === "experiment" || visualType === "table") return "Summarize setup, variables, datasets, and metrics in a compact table.";
  if (layout === "result" || visualType === "kpi" || visualType === "chart") return "Lead with key finding, KPI cards, or chart placeholder.";
  if (layout === "compare" || visualType === "comparison") return "Contrast baselines, variants, or arguments in two columns.";
  if (layout === "timeline" || visualType === "timeline") return "Show stages as a horizontal timeline.";
  if (layout === "formula" || visualType === "formula") return "Place the formula in a focused equation card with short explanations.";
  if (layout === "summary" || layout === "ending") return "Close with 3-5 takeaways and future work.";
  return "Use a clear template content page with concise bullets and a supporting visual area.";
}

function visualHintFor(slide: AcademicPptSlide, layout: AcademicPptExtendedSlideLayout, visualType: AcademicPptVisualType, language: AcademicPptOutline["language"]) {
  if (normalizeText(slide.visualHint)) return truncateText(slide.visualHint, 180);
  if (visualType === "none") return undefined;
  if (language === "en") {
    if (visualType === "chart") return "Use a simple chart placeholder to compare key findings or metrics.";
    if (visualType === "table") return "Use a compact table for setup, dataset, metric, or condition comparison.";
    if (visualType === "formula") return "Use an equation card with variable descriptions.";
    if (visualType === "architecture") return "Use module blocks connected by arrows.";
    if (visualType === "flow" || visualType === "process") return "Use 3-5 connected process steps.";
    if (visualType === "timeline") return "Use a horizontal timeline of stages.";
    if (visualType === "comparison") return "Use two-column comparison cards.";
    if (visualType === "kpi") return "Use KPI cards for key results and supporting evidence.";
  }
  if (visualType === "chart") return "使用简洁图表占位呈现关键发现或指标对比。";
  if (visualType === "table") return "使用紧凑表格呈现实验设置、数据集、指标或条件对比。";
  if (visualType === "formula") return "使用公式卡片呈现方程、变量和推导关系。";
  if (visualType === "architecture") return "使用模块框和连接线呈现系统或方法架构。";
  if (visualType === "flow" || visualType === "process") return "使用 3-5 个连接步骤呈现方法流程。";
  if (visualType === "timeline") return "使用横向时间线呈现阶段变化。";
  if (visualType === "comparison") return "使用左右两栏卡片进行对比。";
  if (visualType === "kpi") return "使用关键指标卡片突出结果和证据。";
  return layout === "content" ? undefined : "使用结构化视觉占位辅助说明本页内容。";
}

function createFallbackSlide(
  outline: AcademicPptOutline,
  title: string,
  layout: AcademicPptExtendedSlideLayout,
  sourceText: string,
  bullets?: string[]
): AcademicPptSlide {
  const visualType = layoutVisualDefaults[layout] || "none";
  const finalBullets = bullets?.length ? bullets.slice(0, 4) : extractFallbackBullets(sourceText, outline.language, 3);
  return {
    title,
    layout,
    visualType,
    templateIntent: templateIntentFor(layout, visualType),
    bullets: finalBullets.map((item) => truncateText(item, 118)),
    visualHint: visualHintFor({ title, layout, bullets: finalBullets }, layout, visualType, outline.language),
    emphasis: finalBullets[0]
  };
}

function createCover(outline: AcademicPptOutline, sourceTitle?: string): AcademicPptSlide {
  return {
    title: outline.title || sourceTitle || (outline.language === "en" ? "Academic Presentation" : "学术研究汇报"),
    subtitle: outline.subtitle || (outline.language === "en" ? "Generated from uploaded research material" : "基于上传资料生成"),
    layout: "cover",
    visualType: "none",
    templateIntent: "Use a formal academic cover with title, subtitle, source context, and presentation framing.",
    bullets:
      outline.language === "en"
        ? ["Clarify the research question and contribution.", "Use source material as primary evidence."]
        : ["明确研究问题、方法框架与主要贡献。", "内容以上传资料为主要依据。"]
  };
}

function createAgenda(outline: AcademicPptOutline): AcademicPptSlide {
  const items = outline.slides
    .filter((slide) => slide.layout !== "cover" && slide.layout !== "agenda")
    .slice(0, 8)
    .map((slide) => slide.title)
    .filter(Boolean);
  return {
    title: outline.language === "en" ? "Agenda" : "汇报目录",
    subtitle: outline.title,
    layout: "agenda",
    visualType: "process",
    templateIntent: "Show the talk structure with numbered sections.",
    bullets: items.length
      ? items
      : outline.language === "en"
        ? ["Research background", "Method and experiment", "Results and conclusion"]
        : ["研究背景", "方法与实验", "结果与总结"]
  };
}

function createSummary(outline: AcademicPptOutline, sourceText: string): AcademicPptSlide {
  return {
    title: outline.language === "en" ? "Summary and Future Work" : "总结与后续工作",
    layout: "summary",
    visualType: "kpi",
    templateIntent: "Close with 3-5 takeaways and future work.",
    bullets:
      outline.language === "en"
        ? ["Summarize the research contribution.", "Clarify limitations and future work.", "Prepare discussion questions for the audience."]
        : ["总结研究贡献与核心结论。", "说明局限性与后续工作方向。", "准备面向听众的讨论问题。"],
    visualHint: outline.language === "en" ? "Use takeaway cards for conclusion and next steps." : "使用 takeaway 卡片突出结论与后续工作。",
    emphasis: extractFallbackBullets(sourceText, outline.language, 1)[0]
  };
}

function hasSlide(outline: AcademicPptOutline, layout: string, titlePattern: RegExp) {
  return outline.slides.some((slide) => slide.layout === layout || titlePattern.test(slide.title));
}

function normalizeSlide(slide: AcademicPptSlide, outline: AcademicPptOutline, settings: AcademicPptSettings, index: number, total: number, sourceText: string, changes: string[]) {
  const template = getAcademicPptTemplateForSettings(settings);
  const limits = getAcademicPptTextLimits(settings.informationDensity);
  const title = truncateText(normalizeText(slide.title) || (outline.language === "en" ? `Research Content ${index + 1}` : `研究内容 ${index + 1}`), limits.title);
  if (!normalizeText(slide.title)) changes.push(`补齐第 ${index + 1} 页标题`);

  const inferredLayout = inferLayout(slide, index, total);
  const layout = isAcademicPptLayoutSupported(template, inferredLayout) ? inferredLayout : "content";
  if (layout !== slide.layout) changes.push(`调整第 ${index + 1} 页版式为 ${layout}`);

  let visualType = normalizeVisualType(slide, layout);
  if (!isAcademicPptVisualTypeSupported(template, visualType)) {
    visualType = layoutVisualDefaults[layout] || "none";
    changes.push(`调整第 ${index + 1} 页视觉类型为 ${visualType}`);
  }

  const rawBullets = Array.isArray(slide.bullets) ? slide.bullets : [];
  const splitBullets = rawBullets.flatMap((bullet) => splitAcademicPptBullet(bullet, limits.bullet)).filter(Boolean);
  if (splitBullets.length !== rawBullets.length) changes.push(`拆分或压缩第 ${index + 1} 页过长 bullet`);
  const bullets = normalizeAcademicPptBullets(splitBullets.length ? splitBullets : extractFallbackBullets(sourceText, outline.language, 3), {
    density: settings.informationDensity,
    minCount: layout === "cover" || layout === "section" ? 1 : 2
  });
  if (!rawBullets.length && layout !== "cover") changes.push(`补齐第 ${index + 1} 页正文要点`);

  const repairedSlide = {
    ...slide,
    title,
    subtitle: slide.subtitle ? truncateText(slide.subtitle, limits.subtitle) : undefined,
    layout,
    visualType,
    templateIntent: truncateText(slide.templateIntent || templateIntentFor(layout, visualType), 180),
    bullets,
    speakerNotes: slide.speakerNotes ? truncateText(slide.speakerNotes, MAX_SPEAKER_NOTES_CHARS) : undefined,
    visualHint: visualHintFor(slide, layout, visualType, outline.language),
    emphasis: truncateText(slide.emphasis || bullets[0], limits.emphasis)
  } satisfies AcademicPptSlide;

  if ((settings.enableIconDecoration || settings.iconSearchEnabled) && repairedSlide.visualType === "none" && layoutVisualDefaults[layout] !== "none") {
    repairedSlide.visualType = layoutVisualDefaults[layout];
    repairedSlide.visualHint = repairedSlide.visualHint || visualHintFor(repairedSlide, layout, repairedSlide.visualType, outline.language);
    changes.push(`补充第 ${index + 1} 页视觉类型以匹配图标装饰`);
  }

  return repairedSlide;
}

function splitDenseSlides(slides: AcademicPptSlide[], outline: AcademicPptOutline, settings: AcademicPptSettings, changes: string[]) {
  const limits = getAcademicPptTextLimits(settings.informationDensity);
  const next: AcademicPptSlide[] = [];
  slides.forEach((slide, index) => {
    const textLength = normalizeText(slide.title).length + normalizeText(slide.subtitle).length + normalizeText(slide.emphasis).length + slide.bullets.reduce((sum, bullet) => sum + bullet.length, 0);
    if (textLength <= 620 || slide.bullets.length <= Math.max(3, limits.bullets)) {
      next.push(slide);
      return;
    }
    const firstBullets = slide.bullets.slice(0, Math.max(2, Math.ceil(slide.bullets.length / 2)));
    const restBullets = slide.bullets.slice(firstBullets.length);
    next.push({ ...slide, bullets: firstBullets, emphasis: firstBullets[0] });
    if (restBullets.length) {
      changes.push(`拆分第 ${index + 1} 页高密度内容`);
      next.push({
        ...slide,
        title: outline.language === "en" ? `${truncateText(slide.title, 52)} Continued` : `${truncateText(slide.title, 48)}（续）`,
        layout: slide.layout === "cover" || slide.layout === "agenda" ? "content" : slide.layout,
        bullets: restBullets.slice(0, limits.bullets),
        emphasis: restBullets[0]
      });
    }
  });
  return next;
}

function dedupeTitles(slides: AcademicPptSlide[], changes: string[]) {
  const titleCounts = new Map<string, number>();
  return slides.map((slide) => {
    const key = normalizeText(slide.title).toLowerCase();
    const count = titleCounts.get(key) || 0;
    titleCounts.set(key, count + 1);
    if (count === 0) return slide;
    changes.push(`修复重复标题：${slide.title}`);
    return { ...slide, title: `${slide.title} ${count + 1}` };
  });
}

function ensureAcademicStructure(outline: AcademicPptOutline, sourceText: string, changes: string[]) {
  const slides = [...outline.slides];
  const text = slides.flatMap((slide) => [slide.title, slide.layout, slide.visualType || "", ...slide.bullets]).join(" ").toLowerCase();
  const inserts: AcademicPptSlide[] = [];
  if (!/研究背景|背景|动机|background|motivation/i.test(text)) {
    inserts.push(createFallbackSlide(outline, outline.language === "en" ? "Research Background" : "研究背景", "section", sourceText));
  }
  if (!/方法|框架|模型|算法|method|approach|framework|architecture/i.test(text)) {
    inserts.push(createFallbackSlide(outline, outline.language === "en" ? "Method Framework" : "方法框架", "method", sourceText));
  }
  if (!/实验|评估|数据集|experiment|evaluation|dataset/i.test(text)) {
    inserts.push(createFallbackSlide(outline, outline.language === "en" ? "Experiment and Evaluation" : "实验与评估", "experiment", sourceText));
  }
  if (!/结果|分析|发现|result|finding|analysis/i.test(text)) {
    inserts.push(createFallbackSlide(outline, outline.language === "en" ? "Results and Analysis" : "结果分析", "result", sourceText));
  }
  if (inserts.length) {
    changes.push(`补充 ${inserts.length} 个学术结构页面`);
    const firstSummaryIndex = slides.findIndex((slide) => slide.layout === "summary" || /总结|结论|summary|conclusion/i.test(slide.title));
    if (firstSummaryIndex >= 0) slides.splice(firstSummaryIndex, 0, ...inserts);
    else slides.push(...inserts);
  }
  return slides;
}

function normalizeSlideCount(slides: AcademicPptSlide[], outline: AcademicPptOutline, settings: AcademicPptSettings, sourceText: string, changes: string[]) {
  const sourceLength = normalizeText(sourceText).length;
  const requestedTarget = Math.min(Math.max(Math.round(settings.targetSlides || 12), 4), 40);
  const sourceAwareCap = sourceLength < 900 ? 8 : sourceLength < 1800 ? 12 : requestedTarget;
  const target = Math.min(requestedTarget, sourceAwareCap);
  if (slides.length < Math.max(4, Math.floor(target * 0.75))) {
    const seen = new Set(slides.map((slide) => normalizeText(slide.title).toLowerCase()));
    const supplementTitles: Array<[string, AcademicPptExtendedSlideLayout]> =
      outline.language === "en"
        ? [
            ["Research Background", "section"],
            ["Problem Definition", "content"],
            ["Method Design", "method"],
            ["Experiment Setup", "experiment"],
            ["Results Analysis", "result"],
            ["Baseline Comparison", "compare"],
            ["Future Work", "summary"]
          ]
        : [
            ["研究背景", "section"],
            ["问题定义", "content"],
            ["方法设计", "method"],
            ["实验设置", "experiment"],
            ["结果分析", "result"],
            ["对比与消融", "compare"],
            ["未来工作", "summary"]
          ];
    const additions = supplementTitles
      .map(([title, layout]) => createFallbackSlide(outline, title, layout, sourceText))
      .filter((slide) => !seen.has(normalizeText(slide.title).toLowerCase()))
      .slice(0, Math.max(target - slides.length, 0));
    if (additions.length) {
      changes.push(`补充 ${additions.length} 页以接近目标页数`);
      return [...slides, ...additions];
    }
  }
  if (slides.length > Math.ceil(target * 1.35)) {
    changes.push(`裁剪过多页面至 ${target} 页附近`);
    const first = slides[0];
    const last = slides[slides.length - 1];
    const middle = slides.slice(1, -1).slice(0, Math.max(target - 2, 0));
    return [first, ...middle, last].filter(Boolean);
  }
  return slides;
}

export function repairAcademicPptOutline({ outline, settings, sourceText, sourceTitle }: RepairInput): RepairResult {
  const changes: string[] = [];
  const next: AcademicPptOutline = {
    title: normalizeText(outline.title) || sourceTitle || (outline.language === "en" ? "Academic Presentation" : "学术研究汇报"),
    subtitle: outline.subtitle ? truncateText(outline.subtitle, 140) : undefined,
    language: outline.language === "en" ? "en" : "zh",
    slides: [...outline.slides]
  };

  if (!normalizeText(outline.title)) changes.push("补齐大纲总标题");
  next.slides = next.slides.map((slide, index) => normalizeSlide(slide, next, settings, index, outline.slides.length, sourceText, changes));
  next.slides = splitDenseSlides(next.slides, next, settings, changes);
  next.slides = dedupeTitles(next.slides, changes);

  if (!hasSlide(next, "cover", /封面|标题|cover|title/i)) {
    next.slides.unshift(createCover(next, sourceTitle));
    changes.push("补充封面页");
  }
  if (!hasSlide(next, "agenda", /目录|议程|agenda|outline/i) && next.slides.length > 2) {
    const insertIndex = next.slides[0]?.layout === "cover" ? 1 : 0;
    next.slides.splice(insertIndex, 0, createAgenda(next));
    changes.push("补充目录页");
  }
  if (!hasSlide(next, "summary", /总结|结论|展望|summary|conclusion|takeaway/i)) {
    next.slides.push(createSummary(next, sourceText));
    changes.push("补充总结页");
  }

  next.slides = ensureAcademicStructure(next, sourceText, changes);
  next.slides = normalizeSlideCount(next.slides, next, settings, sourceText, changes).slice(0, MAX_SLIDES);
  next.slides = next.slides.map((slide, index) => normalizeSlide(slide, next, settings, index, next.slides.length, sourceText, changes));

  const summary = next.slides.find((slide) => slide.layout === "summary" || slide.layout === "ending" || /总结|结论|summary|conclusion/i.test(slide.title));
  if (summary && summary.bullets.length < 3) {
    const supplement = createSummary(next, sourceText).bullets;
    summary.bullets = [...summary.bullets, ...supplement].slice(0, 5);
    summary.emphasis = summary.bullets[0];
    changes.push("补齐总结页 takeaway");
  }

  return { outline: next, changes: Array.from(new Set(changes)) };
}
