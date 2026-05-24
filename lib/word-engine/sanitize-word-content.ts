import type { WordContent, WordSection } from "./types";

const pollutedPhrases = [
  "我将围绕",
  "本文将",
  "附件依据",
  "避免空泛套话",
  "生成正文时优先",
  "根据用户要求",
  "作为 AI",
  "作为AI",
  "以下内容来自",
  "wordTaskMemory",
  "completedSections",
  "pendingSections",
  "currentStage",
  "resumeInstruction",
  "failureReason"
];

function cleanText(value: string) {
  let cleaned = value;
  for (const phrase of pollutedPhrases) cleaned = cleaned.split(phrase).join("");
  return cleaned.replace(/\s+/g, " ").replace(/^[，。；：、\s]+/, "").trim();
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
