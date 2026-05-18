import { randomUUID } from "node:crypto";

import type { GeneratedAgentFile } from "@/lib/agent/types";
import { getPresentationProvider } from "@/lib/presentation/provider";
import { createLocalPresentationProvider, preparePresentationDeckV3 } from "@/lib/presentation/providers/local";
import type { PresentationDeck, PresentationMetric, PresentationProviderOutput, PresentationSlide, PresentationSlideType, PresentationThemeId } from "@/lib/presentation/types";
import { preparePresentationDeckV2 } from "@/lib/presentation/v2/pipeline";
import { checkRenderedPresentationPptx } from "@/lib/presentation/v2/rendered-qa";
import { enrichPresentationDeckVisuals } from "@/lib/presentation/visual-assets";
import * as storage from "@/lib/storage";
import { createMockStorage } from "@/lib/storage/local";
import type { ExtractedDocument, WebContextResult } from "@/lib/agent/types";
import { buildRichPresentationDeck } from "@/lib/presentation/v2/content-planner";
import { evaluateDeckQuality, evaluateVisualPlanQuality } from "@/lib/presentation/v2/qa";
import { repairDeckIfNeeded } from "@/lib/presentation/v2/repair";
import { buildVisualPresentationPlan } from "@/lib/presentation/v2/visual-plan";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const MAX_PRESENTATION_SLIDES = 16;

export const presentationTaskKeywords = [
  "生成 PPT",
  "生成PPT",
  "输出 PPT",
  "输出PPT",
  "生成 pptx",
  "输出 pptx",
  "做一份 PPT",
  "做个 PPT",
  "演示文稿",
  "幻灯片",
  "汇报 slides",
  "presentation"
];

const REQUIRED_PPTX_ENTRIES = [
  "[Content_Types].xml",
  "_rels/.rels",
  "docProps/core.xml",
  "docProps/app.xml",
  "ppt/presentation.xml",
  "ppt/_rels/presentation.xml.rels",
  "ppt/slideMasters/slideMaster1.xml",
  "ppt/slideLayouts/slideLayout1.xml",
  "ppt/theme/theme1.xml"
];

const SLIDE_TYPES = new Set<PresentationSlideType>([
  "cover",
  "agenda",
  "section",
  "content",
  "two_column",
  "imageText",
  "cards",
  "timeline",
  "comparison",
  "data",
  "table",
  "closing"
]);

const THEMES = new Set<PresentationThemeId>(["executive_dark", "clean_education", "modern_product", "research_report"]);

function getDatePath() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function sanitizeFileName(value: string) {
  const name = String(value || "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\.pptx$/i, "")
    .replace(/\s+/g, "-")
    .slice(0, 36);
  return `${name || `presentation-${Date.now()}`}.pptx`;
}

function normalizeSlide(slide: Partial<PresentationSlide>, index: number): PresentationSlide {
  const cleanText = (value: unknown, maxLength: number) => {
    const text = String(value || "").trim();
    if (/^(?:由\s*)?(?:Nexus\s*AI|NexusAI)(?:\s*智能文档模块)?(?:\s*自动)?(?:\s*生成)?\s*$/i.test(text)) return "";
    if (/(?:Nexus\s*AI|NexusAI).*智能文档模块生成|智能文档模块生成.*(?:Nexus\s*AI|NexusAI)|generated\s+by\s+Nexus/i.test(text)) return "";
    return text.slice(0, maxLength);
  };

  const normalizeType = (value: unknown): PresentationSlideType => {
    return typeof value === "string" && SLIDE_TYPES.has(value as PresentationSlideType)
      ? (value as PresentationSlideType)
      : index === 0
        ? "cover"
        : "content";
  };

  const normalizeMetrics = (value: unknown): PresentationMetric[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const metrics = value
      .map((metric) => {
        if (!metric || typeof metric !== "object") return null;
        const data = metric as Partial<PresentationMetric>;
        const label = cleanText(data.label, 54);
        const metricValue = cleanText(data.value, 28);
        if (!label || !metricValue) return null;
        return {
          label,
          value: metricValue,
          detail: data.detail ? cleanText(data.detail, 80) || undefined : undefined
        };
      })
      .filter(Boolean)
      .slice(0, 4) as PresentationMetric[];
    return metrics.length ? metrics : undefined;
  };

  return {
    type: normalizeType(slide.type),
    title: cleanText(slide.title || `第 ${index + 1} 页`, 60) || `第 ${index + 1} 页`,
    subtitle: slide.subtitle ? cleanText(slide.subtitle, 90) || undefined : undefined,
    bullets: Array.isArray(slide.bullets) ? slide.bullets.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 6) : undefined,
    table: Array.isArray(slide.table)
      ? slide.table.map((row) => (Array.isArray(row) ? row.map((cell) => cleanText(cell, 60)).slice(0, 5) : [])).slice(0, 5)
      : undefined,
    metrics: normalizeMetrics(slide.metrics),
    visualBrief: slide.visualBrief ? cleanText(slide.visualBrief, 90) || undefined : undefined,
    imageQuery: slide.imageQuery ? cleanText(slide.imageQuery, 90) || undefined : undefined
  };
}

function normalizeTheme(value: unknown): PresentationThemeId | undefined {
  return typeof value === "string" && THEMES.has(value as PresentationThemeId) ? (value as PresentationThemeId) : undefined;
}

function fallbackDeck(title: string, request: string): PresentationDeck {
  return {
    title,
    theme: "executive_dark",
    slides: [
      { type: "cover", title, subtitle: request.slice(0, 90), visualBrief: "topic overview" },
      { type: "agenda", title: "目录", bullets: ["目标与背景", "核心内容", "执行建议"] },
      { type: "cards", title: "目标与背景", bullets: ["明确当前任务的目标", "梳理关键背景信息", "统一团队理解"] },
      { type: "timeline", title: "执行路径", bullets: ["准备资料", "梳理结构", "完成交付"] },
      { type: "closing", title: "谢谢" }
    ]
  };
}

function extractJsonBlock(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) return fenced.trim();
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start >= 0 && end > start) return value.slice(start, end + 1);
  return value;
}

function listZipCentralEntries(buffer: Buffer) {
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

function validatePptxBuffer(buffer: Buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1024) {
    throw new Error("PPTX buffer is empty or too small.");
  }

  if (buffer.subarray(0, 2).toString("utf8") !== "PK") {
    throw new Error("PPTX package does not start with ZIP signature.");
  }

  const entries = listZipCentralEntries(buffer);
  const missing = REQUIRED_PPTX_ENTRIES.filter((entry) => !entries.includes(entry));
  const slideCount = entries.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry)).length;
  const slideRelsCount = entries.filter((entry) => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(entry)).length;

  if (missing.length) {
    throw new Error(`PPTX package is missing required entries: ${missing.join(", ")}`);
  }

  if (slideCount < 1 || slideRelsCount < slideCount) {
    throw new Error(`PPTX package has invalid slide relationships. slides=${slideCount}, rels=${slideRelsCount}`);
  }

  return { entryCount: entries.length, slideCount };
}

export function parsePresentationDeck({ title, request, outline }: { title: string; request: string; outline: string }): PresentationDeck {
  try {
    const data = JSON.parse(extractJsonBlock(outline)) as Partial<PresentationDeck>;
    const slides = Array.isArray(data.slides) ? data.slides.map(normalizeSlide).slice(0, MAX_PRESENTATION_SLIDES) : [];
    if (slides.length) {
      return {
        title: String(data.title || title).slice(0, 60),
        subtitle: data.subtitle ? String(data.subtitle).slice(0, 90) : undefined,
        theme: normalizeTheme(data.theme),
        slides
      };
    }
  } catch {
    // Fall through to a deterministic local deck.
  }

  return fallbackDeck(title, request);
}

async function generatePptxWithFallback(deck: PresentationDeck): Promise<{ generated: PresentationProviderOutput; providerName: string }> {
  const provider = getPresentationProvider();

  try {
    const generated = await provider.generate({ deck });
    if (!generated.buffer?.length) throw new Error("Presentation provider returned an empty buffer.");
    return { generated, providerName: provider.name };
  } catch (error) {
    if (provider.name === "local") throw error;

    console.error(
      `[agent:presentation] remote provider failed, falling back to local provider: ${error instanceof Error ? error.message : "unknown"}`
    );
    const localProvider = createLocalPresentationProvider();
    const generated = await localProvider.generate({ deck });
    return { generated, providerName: "local" };
  }
}

export async function createPresentation({
  userId,
  title,
  request,
  outline,
  extractedDocuments = [],
  webContext = null
}: {
  userId: string;
  title: string;
  request: string;
  outline: string;
  extractedDocuments?: ExtractedDocument[];
  webContext?: WebContextResult | null;
}): Promise<GeneratedAgentFile> {
  const parsedDeck = parsePresentationDeck({ title, request, outline });
  const richDeck = buildRichPresentationDeck({ deck: parsedDeck, request, title, extractedDocuments, webContext });
  const qualityReport = evaluateDeckQuality(richDeck);
  let qualityCheckedDeck = richDeck;

  if (qualityReport.shouldRepair) {
    console.info(
      `[agent:presentation] deck quality repair requested score=${qualityReport.totalScore} slides=${qualityReport.lowQualitySlides
        .map((index) => index + 1)
        .join(",")}`
    );
    try {
      qualityCheckedDeck = await repairDeckIfNeeded(richDeck, qualityReport, { maxRepairPasses: 1, minSlideScore: 70 });
      const repairedReport = evaluateDeckQuality(qualityCheckedDeck);
      console.info(
        `[agent:presentation] deck quality repair finished before=${qualityReport.totalScore} after=${repairedReport.totalScore} remaining=${repairedReport.lowQualitySlides.length}`
      );
    } catch (error) {
      console.error(
        `[agent:presentation] deck quality repair failed, using original deck: ${error instanceof Error ? error.message : "unknown"}`
      );
      qualityCheckedDeck = richDeck;
    }
  }

  let plannedDeck = preparePresentationDeckV2({ deck: qualityCheckedDeck, request, title });
  try {
    const visualPlan = buildVisualPresentationPlan(qualityCheckedDeck, { theme: "academic_paper" });
    const visualQuality = evaluateVisualPlanQuality(visualPlan);
    plannedDeck = await preparePresentationDeckV3(plannedDeck, visualPlan, { fallbackToV2: true });
    console.info(
      `[agent:presentation] v3 visual plan prepared score=${visualQuality.score} issues=${visualQuality.issues.length} slides=${visualPlan.slides.length}`
    );
  } catch (error) {
    console.error(
      `[agent:presentation] v3 visual plan failed, falling back to v2: ${error instanceof Error ? error.message : "unknown"}`
    );
    plannedDeck = preparePresentationDeckV2({ deck: qualityCheckedDeck, request, title });
  }
  const deck = await enrichPresentationDeckVisuals(plannedDeck);
  console.info(
    `[agent:presentation] deck parsed title="${deck.title}" slides=${deck.slides.length} style=${deck.style || "unknown"} qa=${deck.qa?.passed ? "passed" : "warning"}`
  );

  const { generated, providerName } = await generatePptxWithFallback(deck);
  const fileName = sanitizeFileName(generated.fileName || title);
  const validation = validatePptxBuffer(generated.buffer);
  const renderedQa = checkRenderedPresentationPptx({
    buffer: generated.buffer,
    expectedSlides: deck.slides.length,
    requireV2PresetMarkers: (deck as PresentationDeck & { renderMode?: string }).renderMode === "v3" ? false : Boolean(deck.slides.some((slide) => slide.layoutPreset))
  });
  console.info(
    `[agent:presentation] pptx generated provider=${providerName} file="${fileName}" size=${generated.buffer.length} entries=${validation.entryCount} slides=${validation.slideCount} renderedQa=${renderedQa.passed ? "passed" : "warning"} findings=${renderedQa.findings.length}`
  );

  const key = `users/${userId}/exports/${getDatePath()}/${randomUUID()}.pptx`;
  let result: storage.StorageObjectResult;

  try {
    result = await storage.uploadBuffer({ key, buffer: generated.buffer, contentType: PPTX_MIME });
    console.info(`[agent:presentation] upload succeeded storage=${result.provider} key=${result.key}`);
  } catch (error) {
    console.error(
      `[agent:presentation] upload failed, trying local fallback: ${error instanceof Error ? error.message : "unknown"}`
    );
    result = await createMockStorage().uploadBuffer({ key, buffer: generated.buffer, contentType: PPTX_MIME });
    console.info(`[agent:presentation] local fallback upload succeeded key=${result.key}`);
  }

  return {
    fileName,
    mimeType: PPTX_MIME,
    sizeBytes: generated.buffer.length,
    objectKey: result.provider === "mock" ? null : result.key,
    url: result.url
  };
}
