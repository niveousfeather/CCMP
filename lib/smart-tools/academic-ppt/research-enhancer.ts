import "server-only";

import type {
  AcademicPptResearchBrief,
  AcademicPptResearchSource,
  AcademicPptSettings
} from "@/lib/smart-tools/academic-ppt/types";
import { normalizeAcademicPptSettings } from "@/lib/smart-tools/academic-ppt/task-api";

const MAX_SOURCE_SNIPPET = 220;
const MAX_FINDINGS = 6;
const MAX_QUERIES = 5;

const ENGLISH_STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "analysis",
  "based",
  "between",
  "from",
  "into",
  "method",
  "model",
  "paper",
  "result",
  "study",
  "system",
  "that",
  "their",
  "this",
  "with"
]);

const CHINESE_STOP_WORDS = new Set([
  "研究",
  "方法",
  "结果",
  "系统",
  "基于",
  "本文",
  "进行",
  "通过",
  "可以",
  "需要",
  "当前",
  "任务"
]);

function cleanText(value: string | undefined, maxLength: number) {
  const cleaned = (value || "")
    .replace(/[A-Za-z]:[\\/][^\s"'<>]+/g, "[local-path]")
    .replace(/\/(?:Users|home|var|tmp|mnt)\/[^\s"'<>]+/g, "[local-path]")
    .replace(/[A-Z0-9_]*(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*/gi, "[sensitive-config]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "[bearer-token]")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 3)}...` : cleaned;
}

function splitSentences(sourceText: string) {
  return sourceText
    .replace(/\r/g, "\n")
    .split(/(?<=[。！？!?；;])\s*|\n+/)
    .map((item) => cleanText(item, 260))
    .filter((item) => item.length >= 18)
    .slice(0, 120);
}

function scoreSentence(sentence: string, patterns: RegExp[]) {
  return patterns.reduce((score, pattern) => score + (pattern.test(sentence) ? 1 : 0), 0);
}

function pickByPatterns(sentences: string[], patterns: RegExp[], fallbackStart: number) {
  const ranked = sentences
    .map((sentence, index) => ({ sentence, index, score: scoreSentence(sentence, patterns) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 2)
    .map((item) => item.sentence);
  if (ranked.length) return ranked;
  return sentences.slice(fallbackStart, fallbackStart + 2);
}

export function extractAcademicPptResearchKeywords(sourceText: string, sourceTitle?: string) {
  const text = `${sourceTitle || ""} ${sourceText}`.slice(0, 24_000);
  const counts = new Map<string, number>();

  for (const match of text.matchAll(/[A-Za-z][A-Za-z0-9-]{3,}/g)) {
    const word = match[0].toLowerCase();
    if (ENGLISH_STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  for (const match of text.matchAll(/[\u4e00-\u9fa5]{2,8}/g)) {
    const word = match[0];
    if (CHINESE_STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([word]) => word);
}

function buildQueries(sourceTitle: string | undefined, keywords: string[], language: "zh" | "en") {
  const title = cleanText(sourceTitle, 80);
  const seed = keywords.slice(0, 5);
  const queries = new Set<string>();
  if (title) queries.add(title);
  if (seed.length) queries.add(seed.join(" "));
  if (seed.length >= 2) {
    queries.add(language === "en" ? `${seed.slice(0, 3).join(" ")} academic research` : `${seed.slice(0, 3).join(" ")} 学术研究`);
  }
  return [...queries].slice(0, MAX_QUERIES);
}

function buildLocalBrief({
  sourceText,
  sourceTitle,
  settings
}: {
  sourceText: string;
  sourceTitle?: string;
  settings: AcademicPptSettings;
}) {
  const language = settings.outputLanguage === "en" ? "en" : "zh";
  const sentences = splitSentences(sourceText);
  const keywords = extractAcademicPptResearchKeywords(sourceText, sourceTitle);
  const queries = buildQueries(sourceTitle, keywords, language);
  const background = pickByPatterns(sentences, [/背景|动机|问题|挑战|现有|background|motivation|challenge|problem/i], 0);
  const method = pickByPatterns(sentences, [/方法|框架|流程|系统|模型|算法|method|framework|pipeline|architecture|algorithm/i], 2);
  const experiment = pickByPatterns(sentences, [/实验|评估|数据|指标|设置|experiment|evaluation|dataset|metric|setup/i], 4);
  const result = pickByPatterns(sentences, [/结果|发现|提升|降低|对比|结论|result|finding|improve|reduce|comparison/i], 6);
  const limitation = pickByPatterns(sentences, [/局限|限制|未来|不足|风险|limitation|future|risk|constraint/i], 8);

  const keyFindings = [...background, ...method, ...experiment, ...result]
    .map((item) => cleanText(item, 180))
    .filter(Boolean)
    .slice(0, MAX_FINDINGS);
  const limitations = limitation.map((item) => cleanText(item, 180)).filter(Boolean).slice(0, 4);
  const summaryBase = [...background.slice(0, 1), ...method.slice(0, 1), ...result.slice(0, 1)]
    .filter(Boolean)
    .join(language === "en" ? " " : " ");
  const summary =
    summaryBase ||
    (language === "en"
      ? "The uploaded source was analyzed for research background, methods, evidence, findings, and limitations."
      : "已基于上传资料归纳研究背景、方法路径、证据线索、结果发现与局限。");

  const sourceSnippet = cleanText(sentences.slice(0, 3).join(" "), MAX_SOURCE_SNIPPET);
  const sources: AcademicPptResearchSource[] = [
    {
      title: language === "en" ? "Uploaded source" : "上传资料",
      sourceType: "file",
      snippet:
        sourceSnippet ||
        (language === "en"
          ? "The uploaded source is the primary basis for this presentation."
          : "上传资料是本次演示文稿的主要依据。")
    }
  ];

  return { queries, sources, summary: cleanText(summary, 520), keyFindings, limitations };
}

export async function enhanceAcademicPptResearch({
  sourceText,
  sourceTitle,
  settings
}: {
  sourceText: string;
  sourceTitle?: string;
  settings: AcademicPptSettings;
}): Promise<AcademicPptResearchBrief> {
  const normalizedSettings = normalizeAcademicPptSettings(settings);
  const generatedAt = new Date().toISOString();
  const enabled = normalizedSettings.enableDeepResearch || normalizedSettings.enableExternalResearch;

  if (!enabled) {
    return {
      enabled: false,
      status: "skipped",
      queries: [],
      sources: [],
      summary: normalizedSettings.outputLanguage === "en" ? "Research enhancement was not enabled." : "未启用资料增强。",
      keyFindings: [],
      limitations: [],
      generatedAt
    };
  }

  try {
    const localBrief = buildLocalBrief({ sourceText, sourceTitle, settings: normalizedSettings });
    if (normalizedSettings.enableExternalResearch) {
      return {
        enabled: true,
        status: "degraded",
        ...localBrief,
        generatedAt,
        fallbackReason: "external research service is not configured; generated from uploaded content."
      };
    }

    return {
      enabled: true,
      status: "success",
      ...localBrief,
      generatedAt
    };
  } catch (error) {
    return {
      enabled: true,
      status: "failed",
      queries: [],
      sources: [],
      summary:
        normalizedSettings.outputLanguage === "en"
          ? "Research enhancement failed, so the deck will continue from uploaded content."
          : "资料增强失败，已继续基于上传内容生成。",
      keyFindings: [],
      limitations: [],
      generatedAt,
      fallbackReason: error instanceof Error ? cleanText(error.message, 180) : "research enhancement failed"
    };
  }
}
