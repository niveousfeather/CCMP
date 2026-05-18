import type {
  AcademicPptExtendedSlideLayout,
  AcademicPptOutline,
  AcademicPptQualityIssue,
  AcademicPptQualityIssueSeverity,
  AcademicPptQualityReport,
  AcademicPptSettings
} from "@/lib/smart-tools/academic-ppt/types";
import { getAcademicPptTemplateForSettings, isAcademicPptLayoutSupported } from "@/lib/smart-tools/academic-ppt/template-registry";

const MAX_BULLET_CHARS = 150;
const MAX_BULLETS_PER_SLIDE = 5;
const MAX_SPEAKER_NOTES_CHARS = 600;
const MAX_SLIDE_TEXT_CHARS = 620;

const visualLayouts = new Set<AcademicPptExtendedSlideLayout>([
  "architecture",
  "chart",
  "compare",
  "experiment",
  "flow",
  "formula",
  "method",
  "result",
  "table",
  "timeline",
  "two_column"
]);

type CriticInput = {
  outline: AcademicPptOutline;
  settings: AcademicPptSettings;
};

function normalizeText(value: string | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function deckText(outline: AcademicPptOutline) {
  return [
    outline.title,
    outline.subtitle || "",
    ...outline.slides.flatMap((slide) => [
      slide.title,
      slide.subtitle || "",
      slide.layout,
      slide.visualType || "",
      slide.emphasis || "",
      slide.visualHint || "",
      ...slide.bullets
    ])
  ]
    .join(" ")
    .toLowerCase();
}

function hasSlide(outline: AcademicPptOutline, layout: string, titlePattern: RegExp) {
  return outline.slides.some((slide) => slide.layout === layout || titlePattern.test(slide.title));
}

function pushIssue(
  issues: AcademicPptQualityIssue[],
  code: string,
  severity: AcademicPptQualityIssueSeverity,
  message: string,
  slideIndex?: number
) {
  issues.push(slideIndex === undefined ? { code, severity, message } : { code, severity, message, slideIndex });
}

function hasAcademicSignal(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function scoreIssues(issues: AcademicPptQualityIssue[]) {
  const penalty = issues.reduce((sum, issue) => {
    if (issue.severity === "error") return sum + 14;
    if (issue.severity === "warn") return sum + 7;
    return sum + 2;
  }, 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

function levelFromScore(score: number, issues: AcademicPptQualityIssue[]): AcademicPptQualityReport["level"] {
  if (score >= 85 && !issues.some((issue) => issue.severity === "error")) return "good";
  if (score >= 65) return "warning";
  return "poor";
}

function buildSuggestions(issues: AcademicPptQualityIssue[]) {
  const codes = new Set(issues.map((issue) => issue.code));
  const suggestions: string[] = [];
  if (codes.has("missing_cover")) suggestions.push("补充封面页，明确题目、资料来源和汇报场景。");
  if (codes.has("missing_agenda")) suggestions.push("补充目录页，让听众快速理解汇报结构。");
  if (codes.has("missing_summary") || codes.has("summary_missing_takeaways")) suggestions.push("补充总结页，并保留 3-5 条 takeaway。");
  if (codes.has("slide_count_low")) suggestions.push("增加背景、方法、实验、结果或讨论页，使页数接近目标。");
  if (codes.has("slide_count_high")) suggestions.push("合并低信息密度页面，避免汇报过长。");
  if (codes.has("long_bullet") || codes.has("overflow_risk") || codes.has("visual_layout_too_texty")) {
    suggestions.push("压缩长句和高密度页面，必要时拆分为多页。");
  }
  if (codes.has("missing_visual_hint")) suggestions.push("为图表、方法、结果、对比页面补充视觉说明。");
  if (codes.has("layout_content_mismatch")) suggestions.push("按内容重新选择 method、experiment、result、compare 等版式。");
  if (!suggestions.length) suggestions.push("当前大纲可用于生成模板化学术 PPT 初稿。");
  return suggestions;
}

function expectedLayoutFromText(text: string): AcademicPptExtendedSlideLayout | undefined {
  if (/method|approach|framework|architecture|算法|方法|框架|模型/.test(text)) return "method";
  if (/experiment|evaluation|dataset|benchmark|实验|评估|数据集|设置/.test(text)) return "experiment";
  if (/result|finding|analysis|accuracy|performance|结果|发现|分析|指标|提升/.test(text)) return "result";
  if (/compare|versus|baseline|ablation|对比|消融|基线/.test(text)) return "compare";
  if (/timeline|stage|roadmap|阶段|时间线|流程/.test(text)) return "timeline";
  return undefined;
}

export function critiqueAcademicPptOutline({ outline, settings }: CriticInput): AcademicPptQualityReport {
  const issues: AcademicPptQualityIssue[] = [];
  const template = getAcademicPptTemplateForSettings(settings);
  const targetSlides = Math.min(Math.max(Math.round(settings.targetSlides || 12), 4), 40);
  const actualSlides = outline.slides.length;
  const lowerBound = Math.max(4, Math.floor(targetSlides * 0.75));
  const upperBound = Math.ceil(targetSlides * 1.35);

  if (actualSlides < lowerBound) {
    pushIssue(issues, "slide_count_low", "warn", `大纲页数 ${actualSlides} 少于目标页数 ${targetSlides} 的合理范围。`);
  }
  if (actualSlides > upperBound) {
    pushIssue(issues, "slide_count_high", "warn", `大纲页数 ${actualSlides} 超过目标页数 ${targetSlides} 的合理范围。`);
  }

  if (!normalizeText(outline.title)) pushIssue(issues, "empty_outline_title", "error", "PPT 大纲缺少总标题。");
  if (!hasSlide(outline, "cover", /封面|标题|cover|title/i)) pushIssue(issues, "missing_cover", "error", "缺少封面页。");
  if (!hasSlide(outline, "agenda", /目录|议程|agenda|outline/i)) pushIssue(issues, "missing_agenda", "warn", "缺少目录页。");
  if (!hasSlide(outline, "summary", /总结|结论|展望|summary|conclusion|takeaway/i)) {
    pushIssue(issues, "missing_summary", "error", "缺少总结或结论页。");
  }

  const seenTitles = new Map<string, number>();
  let sectionCount = 0;
  let textOnlyCount = 0;
  const layoutHistogram = new Map<string, number>();
  let previousLayout = "";
  let repeatedLayoutCount = 0;

  outline.slides.forEach((slide, index) => {
    const title = normalizeText(slide.title);
    const titleKey = title.toLowerCase();
    const bullets = Array.isArray(slide.bullets) ? slide.bullets.map(normalizeText).filter(Boolean) : [];
    const slideText = [title, slide.subtitle, slide.emphasis, slide.visualHint, ...bullets].map((item) => normalizeText(item)).join(" ");
    const expectedLayout = expectedLayoutFromText(slideText.toLowerCase());

    if (!title) {
      pushIssue(issues, "empty_slide_title", "error", "存在空标题页面。", index);
    } else if (seenTitles.has(titleKey)) {
      pushIssue(issues, "duplicate_title", "warn", `页面标题重复：${title}。`, index);
    } else {
      seenTitles.set(titleKey, index);
    }

    if (!isAcademicPptLayoutSupported(template, slide.layout)) {
      pushIssue(issues, "unsupported_template_layout", "warn", `当前模板不支持 ${slide.layout} 版式，将使用相近内容版式。`, index);
    }
    layoutHistogram.set(slide.layout, (layoutHistogram.get(slide.layout) || 0) + 1);
    if ((slide.visualType || "none") === "none" && slide.layout === "content") textOnlyCount += 1;

    if (slide.layout === "section") sectionCount += 1;
    if (slide.layout === previousLayout) {
      repeatedLayoutCount += 1;
      if (repeatedLayoutCount >= 4 && slide.layout !== "content") {
        pushIssue(issues, "repeated_layout", "warn", "同一种版式连续出现较多，建议穿插图表、对比或章节页。", index);
      }
    } else {
      previousLayout = slide.layout;
      repeatedLayoutCount = 1;
    }

    if (bullets.length === 0 && slide.layout !== "cover") {
      pushIssue(issues, "empty_bullets", "error", "页面缺少正文要点。", index);
    }
    if (bullets.length <= 1 && slide.layout !== "cover" && slide.layout !== "section" && slide.layout !== "ending") {
      pushIssue(issues, "sparse_slide", "info", "页面信息偏少，可能显得过空。", index);
    }
    if (bullets.length > MAX_BULLETS_PER_SLIDE) {
      pushIssue(issues, "too_many_bullets", "warn", `单页 bullet 数量为 ${bullets.length}，信息密度偏高。`, index);
    }
    bullets.forEach((bullet) => {
      if (bullet.length > MAX_BULLET_CHARS) pushIssue(issues, "long_bullet", "warn", "存在过长 bullet，可能导致 PPTX 文字溢出。", index);
    });

    if ((slide.speakerNotes || "").length > MAX_SPEAKER_NOTES_CHARS) {
      pushIssue(issues, "long_speaker_notes", "info", "speakerNotes 偏长，建议压缩为讲稿提示。", index);
    }

    const slideTextLength =
      title.length +
      normalizeText(slide.subtitle).length +
      bullets.reduce((sum, bullet) => sum + bullet.length, 0) +
      normalizeText(slide.emphasis).length;

    if (slideTextLength > MAX_SLIDE_TEXT_CHARS || bullets.length > MAX_BULLETS_PER_SLIDE) {
      pushIssue(issues, "overflow_risk", "warn", "页面文字密度较高，存在版面溢出风险。", index);
    }
    if (slideTextLength > MAX_SLIDE_TEXT_CHARS * 0.8 && ["chart", "table", "formula"].includes(slide.layout)) {
      pushIssue(issues, "visual_layout_too_texty", "warn", "图表、表格或公式页文字偏多，建议压缩文字。", index);
    }
    if (visualLayouts.has(slide.layout) && slide.visualType !== "none" && !normalizeText(slide.visualHint)) {
      pushIssue(issues, "missing_visual_hint", "warn", "视觉型页面缺少 visualHint，图形说明不足。", index);
    }
    if (expectedLayout && slide.layout === "content" && bullets.length >= 2) {
      pushIssue(issues, "layout_content_mismatch", "info", `页面内容更适合 ${expectedLayout} 版式。`, index);
    }
    if ((slide.layout === "result" || slide.visualType === "chart" || slide.visualType === "kpi") && !/结果|发现|提升|下降|对比|指标|result|finding|metric|improve|accuracy|performance/i.test(slideText)) {
      pushIssue(issues, "result_without_result", "warn", "结果页缺少明确结果、指标或发现。", index);
    }
    if ((slide.layout === "chart" || slide.visualType === "chart") && !normalizeText(slide.visualHint)) {
      pushIssue(issues, "chart_without_description", "warn", "图表页缺少图表说明或数据提示。", index);
    }
    if ((slide.layout === "table" || slide.visualType === "table") && !normalizeText(slide.visualHint)) {
      pushIssue(issues, "table_without_description", "warn", "表格页缺少表格用途说明。", index);
    }
    if ((slide.layout === "formula" || slide.visualType === "formula") && !normalizeText(slide.visualHint)) {
      pushIssue(issues, "formula_without_description", "warn", "公式页缺少变量或公式说明。", index);
    }
    if ((settings.enableIconDecoration || settings.iconSearchEnabled) && slide.visualType === "none" && visualLayouts.has(slide.layout)) {
      pushIssue(issues, "icon_decoration_signal_weak", "info", "图标装饰已启用，但页面视觉类型较弱，装饰选择可能不够准确。", index);
    }
  });

  const agendaSlide = outline.slides.find((slide) => slide.layout === "agenda" || /目录|议程|agenda|outline/i.test(slide.title));
  if (agendaSlide && agendaSlide.bullets.length > 8) pushIssue(issues, "agenda_too_long", "warn", "目录页条目偏多，建议控制在 4-8 项。");

  if (sectionCount > Math.max(3, Math.ceil(outline.slides.length * 0.3))) {
    pushIssue(issues, "too_many_sections", "warn", "章节过渡页偏多，可能稀释有效内容。");
  }
  if (textOnlyCount > Math.max(2, Math.ceil(outline.slides.length * 0.35))) {
    pushIssue(issues, "too_many_text_only_slides", "warn", "纯文字内容页比例偏高，建议增加图表、流程、对比或结果卡片。");
  }
  const dominantLayout = Array.from(layoutHistogram.entries()).sort((a, b) => b[1] - a[1])[0];
  if (dominantLayout && dominantLayout[1] > Math.max(4, Math.ceil(outline.slides.length * 0.45))) {
    pushIssue(issues, "layout_variety_low", "warn", `版式 ${dominantLayout[0]} 使用比例偏高，视觉节奏可能单调。`);
  }

  const summarySlide = outline.slides.find((slide) => slide.layout === "summary" || slide.layout === "ending" || /总结|结论|展望|summary|conclusion/i.test(slide.title));
  if (summarySlide && summarySlide.bullets.length < 3) pushIssue(issues, "summary_missing_takeaways", "warn", "总结页 takeaway 少于 3 条。");

  const text = deckText(outline);
  const academicSignals = [
    {
      code: "missing_background",
      message: "缺少研究背景或动机结构。",
      patterns: [/研究背景|背景|动机|问题背景|background|motivation|context/i]
    },
    {
      code: "missing_method",
      message: "缺少方法或框架结构。",
      patterns: [/方法|框架|模型|算法|method|approach|framework|architecture/i]
    },
    {
      code: "missing_experiment",
      message: "缺少实验或评估结构。",
      patterns: [/实验|评估|数据集|设置|experiment|evaluation|dataset|benchmark/i]
    },
    {
      code: "missing_result",
      message: "缺少结果或分析结构。",
      patterns: [/结果|分析|发现|消融|result|finding|analysis|ablation/i]
    },
    {
      code: "missing_conclusion",
      message: "缺少总结或后续研究结构。",
      patterns: [/总结|结论|展望|局限|conclusion|summary|future work|limitation/i]
    }
  ];

  academicSignals.forEach((signal) => {
    if (!hasAcademicSignal(text, signal.patterns)) pushIssue(issues, signal.code, "warn", signal.message);
  });

  const score = scoreIssues(issues);
  return {
    score,
    level: levelFromScore(score, issues),
    issues,
    suggestions: buildSuggestions(issues)
  };
}
