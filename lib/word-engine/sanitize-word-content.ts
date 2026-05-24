import type { WordContent, WordSection } from "./types";

const pollutedPatterns = [
  /我将围绕/g,
  /本文将/g,
  /附件依据[:：]?/g,
  /避免空泛套话/g,
  /生成正文时优先/g,
  /根据用户要求/g,
  /作为\s*AI/g,
  /以下内容来自[:：]?/g,
  /内部任务[:：]?/g,
  /内部说明/g,
  /不应出现在正文/g,
  /不能进入正文/g,
  /wordTaskMemory/g,
  /completedSections/g,
  /pendingSections/g,
  /currentStage/g,
  /resumeInstruction/g,
  /failureReason/g,
  /mock/gi,
  /placeholder/gi,
  /TODO/gi
];

function cleanText(value: string) {
  let cleaned = value;
  for (const pattern of pollutedPatterns) cleaned = cleaned.replace(pattern, "");
  cleaned = cleaned.replace(/\s+/g, " ").replace(/^[，。；：、\s]+/, "").trim();
  if (/不应出现在正文|不能进入正文|内部说明/.test(cleaned)) return "";
  return cleaned;
}

function sanitizeSection(section: WordSection): WordSection {
  const paragraphs = section.paragraphs.map(cleanText).filter(Boolean);
  return {
    heading: cleanText(section.heading) || "正文",
    paragraphs: paragraphs.length ? paragraphs : ["请补充更完整的材料后继续完善本节内容。"]
  };
}

export function sanitizeWordContent(content: WordContent): WordContent {
  const sections = content.sections.map(sanitizeSection).filter((section) => section.paragraphs.length > 0);
  if (!sections.length) throw new Error("WORD_CONTENT_EMPTY_AFTER_SANITIZE");

  return {
    title: cleanText(content.title) || "Word 文档",
    subtitle: content.subtitle ? cleanText(content.subtitle) : undefined,
    sections,
    tables: content.tables.map((table) => ({
      title: cleanText(table.title) || "信息表",
      headers: table.headers.map(cleanText).filter(Boolean),
      rows: table.rows.map((row) => row.map(cleanText))
    })),
    footerNote: content.footerNote ? cleanText(content.footerNote) : undefined
  };
}
