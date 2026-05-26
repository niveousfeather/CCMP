import { createDocxBuffer } from "@/lib/document/create";
import { serializeWordDocumentPlan, type WordDocumentPlan } from "@/lib/document/plan";
import { DOCX_MIME, type DocumentTemplate } from "@/lib/document/types";
import { composeLessonDocumentPlan } from "./compose-lesson-plan-content";
import { normalizeDocumentFileBase, normalizeDocumentTitle } from "./normalize-document-title";
import { normalizeDocumentStructure } from "./normalize-document-structure";
import { assertTopicConsistencyForGeneratedDocx } from "./validate-topic-consistency";
import type { WordContent, WordDocumentAttributes, WordGenerateResult, WordRequest, WordTaskMemory } from "./types";

function safeBaseFileName(value?: string, fallback = "report") {
  const raw = (value || fallback).replace(/\.docx$/i, "").trim();
  const safe = raw
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .trim();
  return safe || fallback;
}

function documentTypeFromAttributes(attributes?: WordDocumentAttributes): WordDocumentPlan["documentType"] {
  if (!attributes) return "general";
  if (attributes.documentKind === "lesson_plan") return "lesson_plan";
  if (attributes.documentKind === "summary") return "summary";
  if (attributes.documentKind === "report") return "report";
  // The lightweight word-engine composer owns its own section model. Keeping
  // plan-like documents as general here avoids legacy template QA forcing a
  // different, stricter generator contract over the composed content.
  return "general";
}

function documentTypeForContent(content: WordContent, contentOrigin?: WordRequest["contentOrigin"]): WordDocumentPlan["documentType"] {
  if (contentOrigin === "generated_content") return "general";
  return documentTypeFromAttributes(content.attributes);
}

function templateFromAttributes(attributes?: WordDocumentAttributes, stylePreset?: string): DocumentTemplate {
  if (attributes?.documentKind === "lesson_plan") return "lesson_plan";
  return stylePreset === "formal" ? "formal_doc" : "general";
}

function contentToDocumentPlan(content: WordContent, contentOrigin?: WordRequest["contentOrigin"]): WordDocumentPlan {
  const sections: WordDocumentPlan["sections"] = content.sections.map((section, index) => {
    const [intro, ...rest] = section.paragraphs;
    return {
      heading: section.heading,
      level: 1,
      intro,
      blocks: [
        ...rest.map((text) => ({ type: "paragraph" as const, text })),
        ...(index === 1 && rest.length
          ? [
              {
                type: "bullet_list" as const,
                items: rest.slice(0, 4)
              }
            ]
          : [])
      ]
    };
  });

  const appendTableToSection = (sectionPattern: RegExp, table: WordContent["tables"][number]) => {
    const target = sections.find((section) => sectionPattern.test(section.heading));
    if (!target) return false;
    target.blocks.push({
      type: "table",
      headers: table.headers,
      rows: table.rows
    });
    return true;
  };

  for (const table of content.tables) {
    if (!table.headers.length) continue;
    if (/教案基础信息表/.test(table.title) && appendTableToSection(/课程基本信息|基本信息/, table)) continue;
    if (/教学过程设计表/.test(table.title) && appendTableToSection(/教学过程/, table)) continue;
    sections.push({
      heading: table.title,
      level: 1,
      intro: `${table.title}用于归纳文档执行过程中的重点信息。`,
      blocks: [
        {
          type: "table",
          headers: table.headers,
          rows: table.rows
        }
      ]
    });
  }

  return {
    title: content.title,
    subtitle: content.subtitle,
    documentType: documentTypeForContent(content, contentOrigin),
    sections
  };
}

function debugWordQaEnabled() {
  return process.env.DEBUG_AGENT === "1" || process.env.NEXT_PUBLIC_DEBUG_AGENT === "1";
}

function normalizedContentToDocumentPlan(content: WordContent, contentOrigin?: WordRequest["contentOrigin"]): WordDocumentPlan {
  const normalized = normalizeDocumentStructure({
    title: content.title,
    documentKind: content.attributes?.documentKind,
    sections: content.sections,
    tables: content.tables
  });
  const sections: WordDocumentPlan["sections"] = [];
  let current: WordDocumentPlan["sections"][number] | null = null;

  const ensureSection = () => {
    if (current) return current;
    current = { heading: "正文", level: 1, blocks: [] };
    sections.push(current);
    return current;
  };

  for (const block of normalized.blocks) {
    if (block.type === "heading") {
      current = { heading: block.text, level: block.level, blocks: [] };
      sections.push(current);
      continue;
    }
    const target = ensureSection();
    if (block.type === "paragraph") {
      if (!target.intro) target.intro = block.text;
      else target.blocks.push({ type: "paragraph", text: block.text });
      continue;
    }
    if (block.type === "list") {
      target.blocks.push({ type: block.ordered ? "numbered_list" : "bullet_list", items: block.items });
      continue;
    }
    target.blocks.push({ type: "table", headers: block.headers, rows: block.rows });
  }

  return {
    title: content.title,
    subtitle: content.subtitle,
    documentType: documentTypeForContent(content, contentOrigin),
    sections
  };
}

function createDocxBufferWithoutQaNoise(input: Parameters<typeof createDocxBuffer>[0]) {
  if (debugWordQaEnabled()) return createDocxBuffer(input);

  const originalInfo = console.info;
  console.info = (...args: Parameters<typeof console.info>) => {
    if (String(args[0] || "").startsWith("[word:qa]")) return;
    originalInfo(...args);
  };
  try {
    return createDocxBuffer(input);
  } finally {
    console.info = originalInfo;
  }
}

export function generateDocx({
  content,
  request,
  warnings,
  wordTaskMemory
}: {
  content: WordContent;
  request: WordRequest;
  warnings: string[];
  wordTaskMemory: WordTaskMemory;
}): WordGenerateResult {
  assertTopicConsistencyForGeneratedDocx(request, content);
  const normalizedTitle = normalizeDocumentTitle({
    title: content.title || request.title,
    instruction: request.instruction,
    documentKind: content.attributes?.documentKind,
    fallback: content.title || request.title
  });
  const normalizedContent = { ...content, title: normalizedTitle };
  const isLessonPlan = content.attributes?.documentKind === "lesson_plan";
  const shouldUseGeneratedContent = request.contentOrigin === "generated_content";
  const documentPlan = isLessonPlan && !shouldUseGeneratedContent ? composeLessonDocumentPlan(request) : normalizedContentToDocumentPlan(normalizedContent, request.contentOrigin);
  const markdown = serializeWordDocumentPlan(documentPlan);
  const buffer = createDocxBufferWithoutQaNoise({
    markdown,
    title: normalizedTitle,
    template: templateFromAttributes(content.attributes, request.stylePreset),
    prompt: isLessonPlan && !shouldUseGeneratedContent ? request.instruction || request.title : undefined,
    intent: undefined,
    renderOptions: content.attributes
  });
  const fileName = `${safeBaseFileName(normalizeDocumentFileBase({
    title: request.outputFileName || normalizedTitle,
    instruction: request.instruction,
    documentKind: content.attributes?.documentKind,
    fallback: normalizedTitle
  }))}.docx`;

  return {
    fileName,
    buffer,
    mimeType: DOCX_MIME,
    sizeBytes: buffer.length,
    warnings,
    wordTaskMemory
  };
}
