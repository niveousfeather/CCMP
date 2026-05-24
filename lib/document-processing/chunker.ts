import type { DocumentChunk } from "@/lib/document-processing/types";

const DEFAULT_CHUNK_SIZE = 1_600;
const MIN_CHUNK_SIZE = 1_200;
const MAX_CHUNK_SIZE = 2_000;

export function chunkDocumentText(
  text: string,
  options?: {
    chunkSize?: number;
  }
): DocumentChunk[] {
  const chunkSize = clampChunkSize(options?.chunkSize || DEFAULT_CHUNK_SIZE);
  const paragraphs = splitParagraphs(text);
  const chunks: DocumentChunk[] = [];
  let current = "";
  let currentStart = 0;
  let cursor = 0;

  for (const paragraph of paragraphs.flatMap((item) => splitLongParagraph(item, chunkSize))) {
    const startOffset = text.indexOf(paragraph, cursor);
    const safeStart = startOffset >= 0 ? startOffset : cursor;
    const nextText = current ? `${current}\n\n${paragraph}` : paragraph;

    if (current && nextText.length > chunkSize) {
      chunks.push(createChunk(chunks.length, current, currentStart, currentStart + current.length));
      current = paragraph;
      currentStart = safeStart;
    } else {
      if (!current) currentStart = safeStart;
      current = nextText;
    }

    cursor = safeStart + paragraph.length;
  }

  if (current) {
    chunks.push(createChunk(chunks.length, current, currentStart, currentStart + current.length));
  }

  return chunks;
}

function splitParagraphs(text: string) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLongParagraph(paragraph: string, chunkSize: number) {
  if (paragraph.length <= chunkSize) return [paragraph];
  const pieces = paragraph
    .split(/(?<=[。！？.!?；;])\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  const result: string[] = [];
  let current = "";

  for (const piece of pieces.length ? pieces : [paragraph]) {
    if (piece.length > chunkSize) {
      if (current) {
        result.push(current);
        current = "";
      }
      for (let index = 0; index < piece.length; index += chunkSize) {
        result.push(piece.slice(index, index + chunkSize));
      }
      continue;
    }
    const nextText = current ? `${current}${piece}` : piece;
    if (current && nextText.length > chunkSize) {
      result.push(current);
      current = piece;
    } else {
      current = nextText;
    }
  }

  if (current) result.push(current);
  return result;
}

function createChunk(index: number, text: string, startOffset: number, endOffset: number): DocumentChunk {
  return {
    index,
    text,
    startOffset,
    endOffset,
    textLength: text.length
  };
}

function clampChunkSize(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_CHUNK_SIZE;
  return Math.min(Math.max(Math.floor(value), MIN_CHUNK_SIZE), MAX_CHUNK_SIZE);
}

