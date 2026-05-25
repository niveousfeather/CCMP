import type { DeepWritingTaskMemory } from "@/lib/agent/runtime/deep-writing-memory";
import { detectWordAttributes } from "./detect-word-attributes";
import { extractDeepWritingTopicProfile } from "./topic-profile";
import type { WordContent, WordDocumentAttributes, WordRequest, WordSection, WordTable } from "./types";

const fallbackTitle = "深度写作报告";
const sourceHeading = "资料来源与参考摘要";
const forbiddenDocxTerms =
  /deepWritingTaskMemory|wordTaskMemory|taskId|conversationId|currentStage|searchPlan|adoptedSources|section_delta|source_plan|mock|placeholder|TODO|prompt|provider|chain-of-thought|internal JSON/gi;

export { extractDeepWritingTopicProfile };

export function composeDeepWritingDocxContent(memory: DeepWritingTaskMemory): WordContent {
  const title = cleanText(memory.topic || memory.originalInstruction || fallbackTitle, 120);
  const sections = composeSections(memory);
  const sourceSection = composeSourceSection(memory);
  if (sourceSection) sections.push(sourceSection);

  return {
    title,
    subtitle: subtitleFor(memory),
    sections,
    tables: composeTables(memory),
    attributes: attributesFor(memory, title, sections)
  };
}

export function composeDeepWritingDocxRequest(memory: DeepWritingTaskMemory): WordRequest {
  return {
    taskId: memory.taskId,
    conversationId: memory.conversationId,
    title: cleanText(memory.topic || fallbackTitle, 120),
    instruction: cleanText(memory.originalInstruction || memory.topic, 500),
    contentOrigin: "generated_content",
    sourceText: cleanText([memory.sourceSummary, ...memory.adoptedSources.map((source) => source.summary)].join("\n"), 4000),
    sourceFiles: memory.sourceFileNames.map((fileName) => ({ fileName })),
    conversationSummary: cleanText(memory.sourceSummary, 1200),
    outputFileName: cleanFileBase(memory.topic || "deep-writing-report"),
    stylePreset: "formal",
    language: "zh-CN"
  };
}

function composeSections(memory: DeepWritingTaskMemory): WordSection[] {
  const completed = memory.outline.filter((section) => section.status === "completed" && section.draft?.trim());
  const sections = completed.map((section, index) => ({
    heading: cleanText(section.title, 80),
    paragraphs: paragraphsForFinalSection(section.title, section.draft || "", memory, index)
  }));

  if (!sections.length) {
    sections.push({
      heading: "文档概述",
      paragraphs: [cleanText(memory.sourceSummary || memory.originalInstruction || memory.topic, 600)]
    });
  }

  return sections.filter((section) => section.heading && section.paragraphs.length);
}

function paragraphsForFinalSection(title: string, draft: string, memory: DeepWritingTaskMemory, index: number) {
  const normalizedTitle = cleanText(title, 80);
  const draftParagraphs = splitDraft(draft).filter((paragraph) => !hasRepeatedEvidencePattern(paragraph));
  const selected = draftParagraphs.length
    ? draftParagraphs
    : [`${normalizedTitle}部分服务于${memory.topic}的整体表达，作为第 ${index + 1} 个章节保留当前写作阶段已完成的正文。`];
  return selected.map((paragraph) => cleanText(paragraph, 900)).filter(Boolean);
}

function composeSourceSection(memory: DeepWritingTaskMemory): WordSection | null {
  const sources = memory.adoptedSources.filter((source) => source.title && source.summary);
  if (!sources.length && !memory.sourceSummary) return null;

  const paragraphs = [
    memory.sourceSummary ? `已整理的资料摘要：${cleanText(memory.sourceSummary, 700)}` : "",
    ...sources.map((source, index) => {
      const url = source.url ? `链接：${source.url}` : "";
      return `${index + 1}. ${cleanText(source.title, 80)}：${cleanText(source.summary, 500)}${url ? `。${url}` : ""}`;
    })
  ].filter(Boolean);

  return {
    heading: sourceHeading,
    paragraphs
  };
}

function composeTables(memory: DeepWritingTaskMemory): WordTable[] {
  const rows = memory.adoptedSources
    .filter((source) => source.title && source.summary)
    .slice(0, 8)
    .map((source) => [cleanText(source.title, 60), source.sourceType || "资料", cleanText(source.summary, 120)]);

  if (!rows.length) return [];
  return [
    {
      title: "资料采用概览",
      headers: ["资料", "类型", "摘要"],
      rows
    }
  ];
}

function attributesFor(memory: DeepWritingTaskMemory, title: string, sections: WordSection[]): WordDocumentAttributes {
  const base = detectWordAttributes(
    {
      title,
      instruction: memory.originalInstruction,
      sourceText: memory.sourceSummary
    },
    { sectionCount: sections.length }
  );
  const documentKind = mapDocumentKind(memory.documentKind);
  const formal = documentKind === "report" || documentKind === "plan" || documentKind === "training" || documentKind === "lesson_plan";
  return {
    ...base,
    documentKind,
    formality: formal ? "formal" : base.formality,
    needsToc: documentKind !== "summary" && (formal || sections.length >= 5 || base.needsToc),
    needsHeaderFooter: formal || base.needsHeaderFooter,
    needsTables: memory.adoptedSources.length > 0 || base.needsTables
  };
}

function mapDocumentKind(kind: DeepWritingTaskMemory["documentKind"]): WordDocumentAttributes["documentKind"] {
  if (kind === "lesson_plan") return "lesson_plan";
  if (kind === "research") return "report";
  if (kind === "manual") return "training";
  if (kind === "plan" || kind === "report" || kind === "summary") return kind;
  return "general";
}

function subtitleFor(memory: DeepWritingTaskMemory) {
  if (memory.documentKind === "lesson_plan") return "课程教案";
  if (memory.documentKind === "research") return "调研报告";
  if (memory.documentKind === "plan") return "完整方案";
  if (memory.documentKind === "manual") return "培训手册";
  return "深度写作文档";
}

function splitDraft(draft: string) {
  return draft
    .split(/\n{2,}|\r?\n/)
    .map((paragraph) => cleanText(paragraph, 900))
    .filter(Boolean);
}

function hasRepeatedEvidencePattern(value: string) {
  return /当前资料中的关键信息|这些信息会作为|作为本章节/.test(value);
}

function cleanText(value: string, maxLength: number) {
  return String(value || "")
    .replace(forbiddenDocxTerms, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanFileBase(value: string) {
  const cleaned = cleanText(value, 80).replace(/[\\/:*?"<>|]/g, "").trim();
  return cleaned || "deep-writing-report";
}
