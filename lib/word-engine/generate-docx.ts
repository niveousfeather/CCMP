import { createDocxBuffer } from "@/lib/document/create";
import { serializeWordDocumentPlan, type WordDocumentPlan } from "@/lib/document/plan";
import { DOCX_MIME, type DocumentTemplate } from "@/lib/document/types";
import { composeLessonDocumentPlan } from "./compose-lesson-plan-content";
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

function templateFromAttributes(attributes?: WordDocumentAttributes, stylePreset?: string): DocumentTemplate {
  if (attributes?.documentKind === "lesson_plan") return "lesson_plan";
  return stylePreset === "formal" ? "formal_doc" : "general";
}

function contentToDocumentPlan(content: WordContent): WordDocumentPlan {
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

  for (const table of content.tables) {
    if (!table.headers.length) continue;
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
    documentType: documentTypeFromAttributes(content.attributes),
    sections
  };
}

function debugWordQaEnabled() {
  return process.env.DEBUG_AGENT === "1" || process.env.NEXT_PUBLIC_DEBUG_AGENT === "1";
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
  const isLessonPlan = content.attributes?.documentKind === "lesson_plan";
  const documentPlan = isLessonPlan ? composeLessonDocumentPlan(request) : contentToDocumentPlan(content);
  const markdown = serializeWordDocumentPlan(documentPlan);
  const buffer = createDocxBufferWithoutQaNoise({
    markdown,
    title: documentPlan.title || content.title,
    template: templateFromAttributes(content.attributes, request.stylePreset),
    prompt: isLessonPlan ? request.instruction || request.title : undefined,
    intent: undefined,
    renderOptions: content.attributes
  });
  const fileName = `${safeBaseFileName(request.outputFileName || content.title)}.docx`;

  return {
    fileName,
    buffer,
    mimeType: DOCX_MIME,
    sizeBytes: buffer.length,
    warnings,
    wordTaskMemory
  };
}
