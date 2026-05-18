import type { PresentationDeck, PresentationLayoutPreset, PresentationSlide, PresentationSlideType } from "@/lib/presentation/types";
import { selectSlidePreset } from "@/lib/presentation/v2/presets";
import { evaluateDeckQuality, type DeckQualityReport, type SlideQualityScore } from "@/lib/presentation/v2/qa";

export type RepairDeckOptions = {
  maxRepairPasses?: number;
  minSlideScore?: number;
};

const DEFAULT_MIN_SLIDE_SCORE = 70;

function cleanText(value: unknown, maxLength = 160) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function uniqueTexts(values: string[], limit: number) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const text = cleanText(value, 130);
    const key = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    if (!text || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function slideText(slide: PresentationSlide) {
  return [
    slide.title,
    slide.subtitle,
    ...(slide.bullets || []),
    ...(slide.metrics || []).flatMap((metric) => [metric.label, metric.value, metric.detail]),
    ...(slide.table || []).flat()
  ]
    .filter(Boolean)
    .join(" ");
}

function inferSlideType(slide: PresentationSlide): PresentationSlideType {
  const text = slideText(slide).toLowerCase();
  if (slide.type === "cover" || slide.type === "agenda" || slide.type === "section" || slide.type === "closing") return slide.type;
  if (/练习|作业|课堂活动|随堂|测验|exercise|quiz|homework|practice|question|activity/.test(text)) return "cards";
  if (/流程|步骤|阶段|路径|过程|step|process|workflow|phase/.test(text)) return "timeline";
  if (/对比|比较|优劣|before|after|versus|compare/.test(text)) return "comparison";
  if (slide.metrics?.length || /数据|实验|结果|指标|accuracy|metric|result|chart|data/.test(text)) return "data";
  if (slide.visualAsset || slide.visualBrief || slide.imageQuery) return "imageText";
  return "cards";
}

function fallbackBullets(slide: PresentationSlide, deck: PresentationDeck) {
  const title = cleanText(slide.title || deck.title || "本页内容", 48);
  const deckTitle = cleanText(deck.title || title, 48);
  const preset = slide.layoutPreset;

  if (preset === "agenda_list" || slide.type === "agenda") {
    return ["背景与目标", "核心概念与案例", "方法步骤与对比", "练习、总结与下一步"];
  }

  if (preset === "process_steps" || slide.type === "timeline") {
    return [
      `步骤 1：围绕“${deckTitle}”整理资料、案例和需要讲清楚的关键概念。`,
      `步骤 2：把“${title}”拆成可观察、可执行、可复盘的操作环节。`,
      "步骤 3：通过示例或课堂任务验证理解，并记录容易出错的判断点。",
      "步骤 4：用总结页沉淀结论、迁移方法和下一步行动。"
    ];
  }

  if (preset === "comparison_matrix" || slide.type === "comparison") {
    return [
      "方案 A：结构简单，适合快速建立背景，但证据和案例支撑较弱。",
      "方案 B：结合资料、案例和步骤，信息更完整，适合教学或正式汇报。",
      "关键差异：是否能把概念、证据、操作路径和评价标准连成闭环。",
      "选择建议：优先采用有事实依据、有可执行步骤、有复盘问题的表达方式。"
    ];
  }

  if (preset === "data_insight" || slide.type === "data") {
    return [
      `围绕“${title}”提炼可量化或可观察的判断点，避免只给抽象结论。`,
      "把资料来源、课堂表现、案例结果或指标变化放在同一页解释。",
      "用一条主结论连接数据含义和后续行动，让听众知道为什么重要。"
    ];
  }

  if (preset === "lesson_exercise") {
    return [
      `观察：让学生先识别“${title}”中的关键现象或核心概念。`,
      "操作：按步骤完成一次模仿练习，并记录每一步的判断依据。",
      "解释：用自己的话说明结果为什么成立，以及哪里容易出错。",
      "反馈：同伴互评后写下一个可以马上改进的动作。"
    ];
  }

  if (preset === "summary_closing" || slide.type === "closing") {
    return [
      `总结“${deckTitle}”的核心结论和最重要的判断标准。`,
      "回顾本套 PPT 中已经完成的资料整理、案例说明和步骤设计。",
      "给出下一步行动：补充资料、完成练习、或把结论应用到实际任务。"
    ];
  }

  return [
    `说明“${title}”在“${deckTitle}”中的作用，以及它要解决的具体问题。`,
    "结合资料或案例给出一个可理解的场景，避免只停留在抽象描述。",
    "拆出关键步骤、判断标准或常见误区，方便听众跟着页面继续思考。",
    "用一句结论收束本页，并连接到下一页的行动或练习。"
  ];
}

function fallbackMetrics(slide: PresentationSlide) {
  const title = cleanText(slide.title || "质量检查", 34);
  return [
    { label: "信息密度", value: "3点", detail: `${title} 包含事实、案例和结论` },
    { label: "讲解路径", value: "4步", detail: "背景、例子、方法、复盘" },
    { label: "交付标准", value: "1页", detail: "可直接用于课堂或汇报" }
  ];
}

function makeVisualBrief(slide: PresentationSlide, deck: PresentationDeck) {
  const title = cleanText(slide.title || deck.title || "presentation slide", 64);
  const deckTitle = cleanText(deck.title || title, 64);
  const text = slideText(slide).toLowerCase();
  if (/练习|课堂|学生|exercise|practice|classroom/.test(text)) {
    return `${title} classroom activity visual with student worksheet, step markers, and feedback notes for ${deckTitle}`;
  }
  if (/流程|步骤|路径|process|workflow|step/.test(text)) {
    return `${title} process diagram with numbered steps, arrows, checkpoints, and concise labels for ${deckTitle}`;
  }
  if (/对比|比较|compare|comparison|versus/.test(text)) {
    return `${title} comparison matrix visual with two columns, trade-off markers, and highlighted decision criteria`;
  }
  if (/数据|指标|result|metric|data|chart/.test(text)) {
    return `${title} data insight visual with chart cards, source notes, and highlighted takeaway`;
  }
  return `${title} presentation visual for ${deckTitle}, combining concrete example, diagram annotation, and key takeaway`;
}

function makeImageQuery(slide: PresentationSlide, deck: PresentationDeck) {
  const title = cleanText(slide.title || deck.title || "presentation", 64);
  const deckTitle = cleanText(deck.title || title, 64);
  return `${title} ${deckTitle} teaching report diagram visual reference`;
}

function makeSpeakerNotes(slide: PresentationSlide, deck: PresentationDeck) {
  const title = cleanText(slide.title || deck.title || "本页", 64);
  const bullets = (slide.bullets || []).slice(0, 4).join("；");
  const points = bullets || fallbackBullets(slide, deck).slice(0, 3).join("；");
  return cleanText(
    `讲解重点：先说明“${title}”的核心结论，再结合本页资料、案例或步骤解释原因。讲解时突出这些要点：${points}。最后用一个问题或行动把本页内容连接到下一页。`,
    280
  );
}

function inferBetterPreset(slide: PresentationSlide, deck: PresentationDeck, quality: SlideQualityScore): PresentationLayoutPreset {
  if (!quality.shouldRelayout && slide.layoutPreset) return slide.layoutPreset;
  const inferredType = inferSlideType(slide);
  return selectSlidePreset({ ...slide, type: inferredType }, quality.slideIndex, deck.style || "general");
}

export function enrichSlideWithFallbackContent(slide: PresentationSlide, deck: PresentationDeck, quality: SlideQualityScore): PresentationSlide {
  const nextType = inferSlideType(slide);
  const nextPreset = inferBetterPreset({ ...slide, type: nextType }, deck, quality);
  const fallback = fallbackBullets({ ...slide, type: nextType, layoutPreset: nextPreset }, deck);
  const bullets = uniqueTexts([...(slide.bullets || []), ...fallback], nextPreset === "agenda_list" ? 6 : 5);
  const needsMetrics = nextPreset === "data_insight" && (!slide.metrics || slide.metrics.length < 2);

  return {
    ...slide,
    type: nextType,
    layoutPreset: nextPreset,
    title: cleanText(slide.title || `第 ${quality.slideIndex + 1} 页`, 72),
    subtitle:
      slide.subtitle ||
      (nextPreset === "section_divider" || nextPreset === "academic_cover" || nextPreset === "teaching_cover"
        ? cleanText(`${deck.title || slide.title} 的关键背景、目标和讲解线索`, 110)
        : slide.subtitle),
    bullets,
    metrics: needsMetrics ? [...(slide.metrics || []), ...fallbackMetrics(slide)].slice(0, 3) : slide.metrics,
    visualBrief: slide.visualBrief || makeVisualBrief({ ...slide, bullets }, deck),
    imageQuery: slide.imageQuery || makeImageQuery({ ...slide, bullets }, deck),
    speakerNotes: slide.speakerNotes || makeSpeakerNotes({ ...slide, bullets }, deck)
  };
}

export async function repairDeckIfNeeded(deck: any, report: DeckQualityReport, options: RepairDeckOptions = {}): Promise<any> {
  const maxRepairPasses = Math.min(1, Math.max(0, options.maxRepairPasses ?? 1));
  const minSlideScore = options.minSlideScore ?? DEFAULT_MIN_SLIDE_SCORE;
  if (!report.shouldRepair || maxRepairPasses <= 0 || !Array.isArray(deck?.slides)) return deck;

  let repaired: PresentationDeck = {
    ...deck,
    slides: [...deck.slides]
  };

  for (let pass = 0; pass < maxRepairPasses; pass += 1) {
    const currentReport = pass === 0 ? report : evaluateDeckQuality(repaired);
    const repairIndexes = new Set(
      currentReport.slideScores
        .filter((quality) => quality.score < minSlideScore || quality.shouldRewrite || quality.shouldRelayout)
        .map((quality) => quality.slideIndex)
    );

    if (!repairIndexes.size) break;

    repaired = {
      ...repaired,
      slides: repaired.slides.map((slide, index) => {
        if (!repairIndexes.has(index)) return slide;
        const quality = currentReport.slideScores[index];
        if (!quality) return slide;
        return enrichSlideWithFallbackContent(slide, repaired, quality);
      })
    };
  }

  return repaired;
}
