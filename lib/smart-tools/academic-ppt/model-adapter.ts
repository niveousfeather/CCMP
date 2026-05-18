import "server-only";

import { getAgentModelConfig } from "@/lib/agent/models";
import { callChatModel } from "@/lib/agent/router";
import type { AgentChatMessage } from "@/lib/agent/types";
import type {
  AcademicPptOutline,
  AcademicPptResearchBrief,
  AcademicPptSettings,
  AcademicPptSlide,
  AcademicPptExtendedSlideLayout
} from "@/lib/smart-tools/academic-ppt/types";

const ACADEMIC_PPT_MODEL_TIMEOUT_MS = 180_000;
const ACADEMIC_PPT_MODEL_PRIMARY_ATTEMPTS = 2;
const ACADEMIC_PPT_MAX_BULLETS = 5;

export type AcademicPptOutlineResult = {
  outline: AcademicPptOutline;
  fallbackUsed: boolean;
  modelUsed: string;
  providerUsed: string;
  modelSource: "nexus-model" | "local-fallback";
  fallbackReason?: string;
};

function withTimeout(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`academic_ppt_model_timeout:${timeoutMs}`)), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timer)
  };
}

function normalizeLanguage(settings: AcademicPptSettings) {
  return settings.outputLanguage === "en" ? "en" : "zh";
}

function styleLabel(style: AcademicPptSettings["templateStyle"]) {
  const labels: Record<AcademicPptSettings["templateStyle"], string> = {
    academic_clean: "academic clean",
    blue_tech: "blue-white technology",
    course_presentation: "course presentation",
    research_report: "research report"
  };
  return labels[style] || "academic clean";
}

function detailLabel(level: AcademicPptSettings["detailLevel"]) {
  const labels: Record<AcademicPptSettings["detailLevel"], string> = {
    concise: "concise",
    standard: "standard",
    detailed: "detailed"
  };
  return labels[level] || "standard";
}

function densityLabel(level: AcademicPptSettings["informationDensity"]) {
  const labels: Record<AcademicPptSettings["informationDensity"], string> = {
    low: "low",
    normal: "normal",
    high: "high"
  };
  return labels[level] || "normal";
}

function compactPromptLine(value: string | undefined, maxLength: number) {
  const cleaned = (value || "").replace(/\s+/g, " ").trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 3)}...` : cleaned;
}

function buildResearchPromptSection(researchBrief?: AcademicPptResearchBrief) {
  if (!researchBrief?.enabled || researchBrief.status === "skipped") return "";
  const sources = researchBrief.sources.slice(0, 5);
  const sourceLines = sources.length
    ? sources
        .map(
          (source, index) =>
            `${index + 1}. ${compactPromptLine(source.title, 80)} (${source.sourceType}): ${compactPromptLine(source.snippet, 180)}`
        )
        .join("\n")
    : "No external or file source entries are available.";
  return `

Research enhancement:
- Status: ${researchBrief.status}.
- Summary: ${compactPromptLine(researchBrief.summary, 700)}
- Key findings:
${researchBrief.keyFindings.slice(0, 6).map((item) => `  - ${compactPromptLine(item, 180)}`).join("\n") || "  - None"}
- Limitations:
${researchBrief.limitations.slice(0, 4).map((item) => `  - ${compactPromptLine(item, 180)}`).join("\n") || "  - None"}
- Sources:
${sourceLines}
- Use this as optional background and structure support. Uploaded source remains primary.
- If source entries exist, you may add one concise "Reference Notes" / "资料依据" slide with 3-5 short items. Do not list long URLs.`;
}

function buildOutlinePrompt({
  sourceText,
  sourceTitle,
  settings,
  researchBrief
}: {
  sourceText: string;
  sourceTitle?: string;
  settings: AcademicPptSettings;
  researchBrief?: AcademicPptResearchBrief;
}) {
  const targetSlides = Math.min(Math.max(Math.round(settings.targetSlides || 12), 4), 40);
  const researchSection = buildResearchPromptSection(researchBrief);
  return `You are generating a structured academic presentation plan for NexusAI.

Return STRICT JSON only. Do not use Markdown fences. Do not add explanations.

Schema:
{
  "title": "presentation title",
  "subtitle": "optional subtitle",
  "language": "zh" | "en",
  "slides": [
    {
      "title": "slide title",
      "subtitle": "optional slide subtitle",
      "layout": "cover" | "agenda" | "section" | "content" | "two_column" | "compare" | "method" | "experiment" | "result" | "timeline" | "table" | "formula" | "chart" | "architecture" | "flow" | "summary" | "ending",
      "visualType": "none" | "chart" | "table" | "formula" | "flow" | "architecture" | "timeline" | "comparison" | "kpi" | "matrix" | "process" | "swot",
      "bullets": ["short bullet", "short bullet"],
      "speakerNotes": "optional concise notes",
      "visualHint": "optional visual direction",
      "templateIntent": "how this slide should use the selected presentation template",
      "emphasis": "optional key takeaway or highlighted conclusion"
    }
  ]
}

Requirements:
- Make the deck suitable for an academic paper or research report presentation.
- Use the uploaded source as the primary evidence. Do not invent exact experiment numbers, datasets, metrics, or citations if they are not in the source.
- Do not invent citations. If research sources are empty, do not create a reference/source slide.
- If research enhancement is provided, distinguish uploaded-source claims from supplementary background. Phrase uncertain additions cautiously.
- Slide count should be close to ${targetSlides}.
- Language: ${normalizeLanguage(settings)}.
- Style: ${styleLabel(settings.templateStyle)}.
- Aspect ratio: ${settings.aspectRatio}.
- Detail level: ${detailLabel(settings.detailLevel)}.
- Information density: ${densityLabel(settings.informationDensity)}.
- Each slide should have a clear title and 2-${ACADEMIC_PPT_MAX_BULLETS} concise bullets.
- Include cover, agenda, research background, problem/motivation, method/approach, experiments or evaluation if present, results/discussion if present, limitations, and conclusion/future work when appropriate.
- If target slides >= 8, include an agenda. If target slides >= 12, split method, experiment, and results into separate slides.
- Use specialized layouts when they fit: method/flow/architecture for methods, experiment/table for evaluation setup, result/chart/kpi for findings, compare/two_column for comparisons, timeline for procedure/history, formula for equations.
- Set visualType to match the slide: chart, table, formula, flow, architecture, timeline, comparison, kpi, matrix, process, swot, or none.
- Set templateIntent to a short rendering instruction such as "show process as 4 connected steps" or "lead with KPI cards and supporting bullets".
- Use "emphasis" for the most important takeaway of a slide.
- The final summary or ending slide must include 3-5 concrete takeaways.
- Extra requirements from user: ${settings.extraRequirements?.trim() || "none"}.
${researchSection}

Source title: ${sourceTitle || "not provided"}

Source text:
${sourceText.slice(0, 36_000)}`;
}

function extractJsonObject(content: string) {
  const trimmed = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  throw new Error("ACADEMIC_PPT_OUTLINE_JSON_NOT_FOUND");
}

function sanitizeBullets(input: unknown) {
  const items = Array.isArray(input) ? input : [];
  return items
    .map((item) => (typeof item === "string" ? item.replace(/\s+/g, " ").trim() : ""))
    .map((item) => (item.length > 160 ? `${item.slice(0, 157)}...` : item))
    .filter(Boolean)
    .slice(0, ACADEMIC_PPT_MAX_BULLETS);
}

function sanitizeLayout(input: unknown, index: number, total: number): AcademicPptExtendedSlideLayout {
  const value = typeof input === "string" ? input : "";
  if (
    value === "cover" ||
    value === "agenda" ||
    value === "section" ||
    value === "content" ||
    value === "two_column" ||
    value === "compare" ||
    value === "timeline" ||
    value === "method" ||
    value === "experiment" ||
    value === "result" ||
    value === "table" ||
    value === "formula" ||
    value === "chart" ||
    value === "architecture" ||
    value === "flow" ||
    value === "summary" ||
    value === "ending"
  ) {
    return value;
  }
  if (index === 0) return "cover";
  if (index === total - 1) return "summary";
  return "content";
}

function sanitizeVisualType(input: unknown, layout: AcademicPptExtendedSlideLayout) {
  const value = typeof input === "string" ? input : "";
  if (
    value === "none" ||
    value === "chart" ||
    value === "table" ||
    value === "formula" ||
    value === "flow" ||
    value === "architecture" ||
    value === "timeline" ||
    value === "comparison" ||
    value === "kpi" ||
    value === "matrix" ||
    value === "process" ||
    value === "swot"
  ) {
    return value;
  }
  if (layout === "method" || layout === "flow") return "flow";
  if (layout === "architecture") return "architecture";
  if (layout === "experiment" || layout === "table") return "table";
  if (layout === "result" || layout === "chart") return "kpi";
  if (layout === "compare" || layout === "two_column") return "comparison";
  if (layout === "timeline") return "timeline";
  if (layout === "formula") return "formula";
  return "none";
}

function normalizeSlideCount(slides: AcademicPptSlide[], settings: AcademicPptSettings, sourceText: string) {
  const target = Math.min(Math.max(Math.round(settings.targetSlides || slides.length || 10), 4), 40);
  if (slides.length > target) {
    const first = slides[0];
    const last = slides[slides.length - 1];
    const middle = slides.slice(1, -1).slice(0, Math.max(target - 2, 0));
    return [first, ...middle, last].filter(Boolean).slice(0, target);
  }
  if (slides.length >= Math.max(3, Math.min(target, 5))) return slides;

  const local = buildLocalAcademicPptOutline({ sourceText, settings }).slides;
  const seen = new Set(slides.map((slide) => slide.title));
  const additions = local.filter((slide) => !seen.has(slide.title)).slice(0, target - slides.length);
  return [...slides, ...additions].slice(0, target);
}

function validateOutline(value: unknown, settings: AcademicPptSettings, sourceText: string): AcademicPptOutline {
  const data = value as Partial<AcademicPptOutline> & { slides?: unknown[] };
  if (!data || typeof data !== "object") throw new Error("ACADEMIC_PPT_OUTLINE_NOT_OBJECT");
  const rawSlides = Array.isArray(data.slides) ? data.slides : [];
  const slides = rawSlides
    .map<AcademicPptSlide | null>((raw, index) => {
      const slide = raw as Partial<AcademicPptSlide>;
      const title = typeof slide.title === "string" ? slide.title.replace(/\s+/g, " ").trim() : "";
      const bullets = sanitizeBullets(slide.bullets);
      if (!title || bullets.length === 0) return null;
      const layout = sanitizeLayout(slide.layout, index, rawSlides.length);
      return {
        title: title.slice(0, 96),
        subtitle: typeof slide.subtitle === "string" ? slide.subtitle.replace(/\s+/g, " ").trim().slice(0, 120) : undefined,
        layout,
        bullets,
        speakerNotes: typeof slide.speakerNotes === "string" ? slide.speakerNotes.replace(/\s+/g, " ").trim().slice(0, 500) : undefined,
        visualHint: typeof slide.visualHint === "string" ? slide.visualHint.replace(/\s+/g, " ").trim().slice(0, 220) : undefined,
        visualType: sanitizeVisualType((slide as { visualType?: unknown }).visualType, layout),
        templateIntent:
          typeof (slide as { templateIntent?: unknown }).templateIntent === "string"
            ? ((slide as { templateIntent: string }).templateIntent || "").replace(/\s+/g, " ").trim().slice(0, 180)
            : undefined,
        emphasis: typeof slide.emphasis === "string" ? slide.emphasis.replace(/\s+/g, " ").trim().slice(0, 160) : undefined
      };
    })
    .filter((slide): slide is AcademicPptSlide => slide !== null);

  if (slides.length === 0) throw new Error("ACADEMIC_PPT_OUTLINE_EMPTY_SLIDES");
  const normalizedSlides = normalizeSlideCount(slides, settings, sourceText);
  if (normalizedSlides.length < 3) throw new Error("ACADEMIC_PPT_OUTLINE_TOO_FEW_SLIDES");

  return {
    title:
      typeof data.title === "string" && data.title.trim()
        ? data.title.replace(/\s+/g, " ").trim().slice(0, 120)
        : normalizeLanguage(settings) === "en"
          ? "Academic Presentation"
          : "学术汇报",
    subtitle: typeof data.subtitle === "string" ? data.subtitle.replace(/\s+/g, " ").trim().slice(0, 160) : undefined,
    language: normalizeLanguage(settings),
    slides: normalizedSlides
  };
}

function parseOutline(content: string, settings: AcademicPptSettings, sourceText: string) {
  return validateOutline(JSON.parse(extractJsonObject(content)), settings, sourceText);
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[。！？.!?])\s+|\n+/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 24)
    .slice(0, 80);
}

export function buildLocalAcademicPptOutline({
  sourceText,
  sourceTitle,
  settings,
  researchBrief
}: {
  sourceText: string;
  sourceTitle?: string;
  settings: AcademicPptSettings;
  researchBrief?: AcademicPptResearchBrief;
}): AcademicPptOutline {
  const language = normalizeLanguage(settings);
  const title = sourceTitle || (language === "en" ? "Academic Research Presentation" : "学术研究汇报");
  const sentences = splitSentences(sourceText);
  const target = Math.min(Math.max(settings.targetSlides || 10, 6), 18);
  const sectionTitles =
    language === "en"
      ? ["Research Background", "Problem Definition", "Method Overview", "Key Analysis", "Evaluation Design", "Results Discussion", "Limitations", "Conclusion"]
      : ["研究背景", "问题定义", "方法概述", "关键分析", "评估设计", "结果讨论", "局限性", "结论展望"];
  const bodyCount = Math.max(target - 2, 4);
  const chunkSize = Math.max(2, Math.ceil(sentences.length / bodyCount));
  const fallbackLayouts: Array<{
    layout: AcademicPptExtendedSlideLayout;
    visualType: "none" | "chart" | "table" | "formula" | "flow" | "architecture" | "timeline" | "comparison" | "kpi" | "matrix" | "process" | "swot";
    templateIntent: string;
    visualHint?: string;
  }> = [
    {
      layout: "section",
      visualType: "none",
      templateIntent: "Create a chapter transition for research background."
    },
    {
      layout: "two_column",
      visualType: "comparison",
      templateIntent: "Separate research problem and source evidence into two columns.",
      visualHint: language === "en" ? "Use two-column cards for problem and evidence." : "使用双栏卡片呈现问题与证据。"
    },
    {
      layout: "method",
      visualType: "flow",
      templateIntent: "Show the method as connected steps.",
      visualHint: language === "en" ? "Use 3-5 connected process steps." : "使用 3-5 个连接步骤呈现方法流程。"
    },
    {
      layout: "architecture",
      visualType: "architecture",
      templateIntent: "Show method modules or system components.",
      visualHint: language === "en" ? "Use module blocks with simple connections." : "使用模块框和连接线呈现系统结构。"
    },
    {
      layout: "experiment",
      visualType: "table",
      templateIntent: "Summarize evaluation setup as a compact table.",
      visualHint: language === "en" ? "Use a table for dataset, metric, and setting." : "使用表格呈现实验设置、数据集和指标。"
    },
    {
      layout: "result",
      visualType: "kpi",
      templateIntent: "Lead with the key finding and supporting evidence.",
      visualHint: language === "en" ? "Use KPI cards or a small chart placeholder." : "使用关键指标卡片或图表占位突出结果。"
    },
    {
      layout: "compare",
      visualType: "comparison",
      templateIntent: "Compare baselines, alternatives, or limitations.",
      visualHint: language === "en" ? "Use two-column comparison cards." : "使用左右对比卡片呈现差异。"
    },
    {
      layout: "timeline",
      visualType: "timeline",
      templateIntent: "Show stages, procedure, or future work as a timeline.",
      visualHint: language === "en" ? "Use a horizontal timeline." : "使用横向时间线呈现阶段。"
    }
  ];
  const slides: AcademicPptSlide[] = [
    {
      title,
      subtitle: language === "en" ? "Generated from the uploaded source" : "基于上传资料生成",
      layout: "cover",
      visualType: "none",
      templateIntent: "Use a formal academic cover with title, subtitle, source context, and date.",
      bullets: [
        language === "en" ? "Summarizes the central research question and contribution." : "概括研究问题、核心方法与主要贡献。",
        language === "en" ? "Use source material as primary evidence." : "内容以上传资料为主要依据。"
      ]
    }
  ];

  for (let index = 0; index < bodyCount; index += 1) {
    const chunk = sentences.slice(index * chunkSize, index * chunkSize + chunkSize);
    const bullets = chunk.length
      ? chunk.slice(0, 4)
      : [
          language === "en" ? "Organize this section with source-supported claims." : "围绕资料中的论点组织本页内容。",
          language === "en" ? "Add examples or evidence during manual review." : "后续可根据原文补充案例、图表或证据。"
        ];
    const layoutPlan = fallbackLayouts[index % fallbackLayouts.length];
    slides.push({
      title: sectionTitles[index % sectionTitles.length],
      layout: layoutPlan.layout,
      visualType: layoutPlan.visualType,
      templateIntent: layoutPlan.templateIntent,
      bullets,
      speakerNotes:
        settings.detailLevel === "detailed"
          ? bullets.map((bullet) => `Speaker note: ${bullet}`).join(" ")
          : settings.detailLevel === "standard"
            ? bullets[0]
            : undefined,
      visualHint: layoutPlan.visualHint || (language === "en" ? "Use a clean academic layout with one supporting diagram area." : "使用简洁学术版式，预留图表或框架示意区域。"),
      emphasis: bullets[0]
    });
  }

  if (researchBrief?.enabled && researchBrief.keyFindings.length && slides.length < target - 1) {
    slides.push({
      title: language === "en" ? "Evidence and Background Notes" : "资料依据与背景补充",
      layout: "content",
      visualType: "table",
      templateIntent: "Show research enhancement findings as cautious source-supported notes.",
      visualHint:
        language === "en"
          ? "Use compact note cards and keep uploaded source as primary evidence."
          : "使用紧凑资料卡片，强调上传资料仍为主要依据。",
      bullets: researchBrief.keyFindings.slice(0, 4),
      speakerNotes: researchBrief.summary,
      emphasis:
        language === "en"
          ? "Supplementary notes support framing, not unverified citation claims."
          : "补充资料用于背景框架，不替代上传资料证据。"
    });
  }

  slides.push({
    title: language === "en" ? "Summary and Next Steps" : "总结与后续工作",
    layout: "summary",
    visualType: "kpi",
    templateIntent: "Close with 3-5 takeaway cards and future work.",
    visualHint: language === "en" ? "Use takeaway cards for conclusion and next steps." : "使用 takeaway 卡片突出结论与后续工作。",
    bullets:
      language === "en"
        ? ["Summarize the research contribution.", "Clarify limitations and future work.", "Prepare discussion questions for the audience."]
        : ["总结研究贡献与核心结论。", "说明局限性与后续工作方向。", "准备面向听众的讨论问题。"],
    emphasis: language === "en" ? "Turn the source into a focused academic talk." : "将资料整理为结构清晰的学术汇报。"
  });

  return {
    title,
    subtitle: language === "en" ? "Academic presentation draft" : "学术演示文稿初稿",
    language,
    slides: slides.slice(0, target)
  };
}

function summarizeModelFailure(error: unknown) {
  if (!(error instanceof Error)) return "unknown model failure";
  return error.message
    .replace(/[A-Z0-9_]*(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*/gi, "[sensitive-config]")
    .replace(/\bAuthorization\b/gi, "[auth-header]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "[bearer-token]")
    .replace(/\s+/g, " ")
    .slice(0, 280);
}

export async function generateAcademicPptOutline({
  sourceText,
  sourceTitle,
  settings,
  researchBrief
}: {
  sourceText: string;
  sourceTitle?: string;
  settings: AcademicPptSettings;
  researchBrief?: AcademicPptResearchBrief;
}): Promise<AcademicPptOutlineResult> {
  const config = getAgentModelConfig();
  const prompt = buildOutlinePrompt({ sourceText, sourceTitle, settings, researchBrief });
  const messages: AgentChatMessage[] = [
    {
      role: "system",
      content: "You generate valid JSON outlines for academic PPTX files. You never reveal provider configuration or API keys."
    },
    { role: "user", content: prompt }
  ];

  const failureReasons: string[] = [];
  for (let attempt = 1; attempt <= ACADEMIC_PPT_MODEL_PRIMARY_ATTEMPTS; attempt += 1) {
    const primaryTimeout = withTimeout(ACADEMIC_PPT_MODEL_TIMEOUT_MS);
    try {
      const content = await callChatModel({
        stage: "academic_ppt_outline",
        provider: config.taskPrimary.provider,
        model: config.taskPrimary.model,
        messages,
        maxTokens: 6000,
        signal: primaryTimeout.signal,
        timeoutMs: ACADEMIC_PPT_MODEL_TIMEOUT_MS
      });
      return {
        outline: parseOutline(content, settings, sourceText),
        fallbackUsed: false,
        modelUsed: config.taskPrimary.model,
        providerUsed: config.taskPrimary.provider,
        modelSource: "nexus-model"
      };
    } catch (primaryError) {
      failureReasons.push(
        `${config.taskPrimary.provider}:${config.taskPrimary.model} attempt ${attempt} ${summarizeModelFailure(primaryError)}`
      );
      console.warn(
        `[academic-ppt:model] primary_failed attempt=${attempt} provider=${config.taskPrimary.provider} model=${config.taskPrimary.model} message=${primaryError instanceof Error ? primaryError.message : "unknown"}`
      );
    } finally {
      primaryTimeout.dispose();
    }
  }

  const fallbackTimeout = withTimeout(ACADEMIC_PPT_MODEL_TIMEOUT_MS);
  try {
    const content = await callChatModel({
      stage: "academic_ppt_outline_fallback",
      provider: config.taskFallback.provider,
      model: config.taskFallback.model,
      messages,
      maxTokens: 6000,
      signal: fallbackTimeout.signal,
      timeoutMs: ACADEMIC_PPT_MODEL_TIMEOUT_MS
    });
    return {
      outline: parseOutline(content, settings, sourceText),
      fallbackUsed: true,
      modelUsed: config.taskFallback.model,
      providerUsed: config.taskFallback.provider,
      modelSource: "nexus-model",
      fallbackReason: failureReasons.join(" | ")
    };
  } catch (fallbackError) {
    failureReasons.push(`${config.taskFallback.provider}:${config.taskFallback.model} ${summarizeModelFailure(fallbackError)}`);
    console.warn(
      `[academic-ppt:model] fallback_failed provider=${config.taskFallback.provider} model=${config.taskFallback.model} message=${fallbackError instanceof Error ? fallbackError.message : "unknown"}`
    );
  } finally {
    fallbackTimeout.dispose();
  }

  return {
    outline: buildLocalAcademicPptOutline({ sourceText, sourceTitle, settings, researchBrief }),
    fallbackUsed: true,
    modelUsed: "local-outline-fallback",
    providerUsed: "local",
    modelSource: "local-fallback",
    fallbackReason: failureReasons.join(" | ") || "remote model unavailable"
  };
}
