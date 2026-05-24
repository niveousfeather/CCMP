import { createDocxBuffer } from "@/lib/document/create";
import { serializeWordDocumentPlan, type WordDocumentPlan } from "@/lib/document/plan";
import { DOCX_MIME } from "@/lib/document/types";
import type { WordContent, WordGenerateResult, WordRequest, WordTaskMemory } from "./types";

function safeBaseFileName(value?: string, fallback = "report") {
  const raw = (value || fallback).replace(/\.docx$/i, "").trim();
  const safe = raw
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .trim();
  return safe || fallback;
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
    documentType: "general",
    sections
  };
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
  const markdown = serializeWordDocumentPlan(contentToDocumentPlan(content));
  const buffer = createDocxBuffer({
    markdown,
    title: content.title,
    template: request.stylePreset === "formal" ? "formal_doc" : "general",
    prompt: undefined
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
