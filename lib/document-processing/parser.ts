import { readFile } from "node:fs/promises";
import path from "node:path";

import { chunkDocumentText } from "@/lib/document-processing/chunker";
import { DocumentParseError, normalizeDocumentParseError } from "@/lib/document-processing/errors";
import { normalizeDocumentText, truncateDocumentText } from "@/lib/document-processing/normalize";
import { parseDocxDocument } from "@/lib/document-processing/parsers/docx";
import { parseMarkdownDocument } from "@/lib/document-processing/parsers/markdown";
import { parsePptxDocument } from "@/lib/document-processing/parsers/pptx";
import { parseTxtDocument } from "@/lib/document-processing/parsers/txt";
import type {
  DocumentParseFileInput,
  DocumentParseInput,
  DocumentParseResult,
  DocumentParseStatus,
  DocumentParseWarning,
  DocumentParserName,
  ParsedFileResult
} from "@/lib/document-processing/types";

const DEFAULT_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const DEFAULT_PARSE_TIMEOUT_MS = 45_000;

type ParserOutput = {
  parser: DocumentParserName;
  text: string;
  pageCount?: number;
  slideCount?: number;
  warnings: DocumentParseWarning[];
};

export async function parseDocuments(input: DocumentParseInput): Promise<DocumentParseResult> {
  const files = await Promise.all(
    input.files.map((file) =>
      parseOneDocument(file, {
        timeoutMs: input.timeoutMs || DEFAULT_PARSE_TIMEOUT_MS,
        maxFileSizeBytes: input.maxFileSizeBytes || DEFAULT_MAX_FILE_SIZE_BYTES
      })
    )
  );

  const successfulFiles = files.filter((file) => file.status === "parsed" && file.normalizedText);
  const fullText = successfulFiles.map((file) => `【${file.fileName}】\n${file.normalizedText}`).join("\n\n");
  const normalizedText = normalizeDocumentText(fullText);
  const effectiveText = truncateDocumentText(normalizedText, input.maxChars);
  const warnings = files.flatMap((file) => file.warnings);

  if (effectiveText.length < normalizedText.length) {
    warnings.push({
      code: "DOCUMENT_TRUNCATED",
      message: `文档内容已截断到 ${effectiveText.length} 字符，原始可用文本 ${normalizedText.length} 字符。`
    });
  }

  return {
    sourceType: "file",
    status: getAggregateStatus(files),
    files,
    fullText,
    normalizedText,
    effectiveText,
    chunks: chunkDocumentText(effectiveText, { chunkSize: input.chunkSize }),
    textLength: normalizedText.length,
    effectiveTextLength: effectiveText.length,
    warnings
  };
}

async function parseOneDocument(
  file: DocumentParseFileInput | File,
  options: {
    timeoutMs: number;
    maxFileSizeBytes: number;
  }
): Promise<ParsedFileResult> {
  const metadata = getInputMetadata(file);
  try {
    if (metadata.size > options.maxFileSizeBytes) {
      throw new DocumentParseError("DOCUMENT_TOO_LARGE", "文档超过解析大小限制。");
    }

    const selectedParser = selectParser(metadata.extension);
    if (!selectedParser) {
      throw new DocumentParseError("DOCUMENT_UNSUPPORTED_TYPE", "不支持的文档类型。");
    }

    const buffer = await readInputBuffer(file);
    if (buffer.byteLength > options.maxFileSizeBytes) {
      throw new DocumentParseError("DOCUMENT_TOO_LARGE", "文档超过解析大小限制。");
    }
    const parsed = await runWithTimeout(() => selectedParser.parse(buffer), options.timeoutMs);
    const normalizedText = normalizeDocumentText(parsed.text);
    if (!normalizedText) {
      throw new DocumentParseError("DOCUMENT_EMPTY_TEXT", "文档未提取到可用文本。");
    }

    const warnings = parsed.warnings.map((warning) => ({ ...warning, fileName: metadata.fileName }));
    return {
      ...metadata,
      parser: parsed.parser,
      status: "parsed",
      textLength: normalizedText.length,
      pageCount: parsed.pageCount,
      slideCount: parsed.slideCount,
      warnings,
      text: parsed.text,
      normalizedText
    };
  } catch (error) {
    const normalizedError = normalizeDocumentParseError(error);
    return {
      ...metadata,
      status: normalizedError.code === "DOCUMENT_UNSUPPORTED_TYPE" ? "unsupported" : normalizedError.code === "DOCUMENT_EMPTY_TEXT" ? "empty" : "failed",
      textLength: 0,
      warnings: [
        {
          code: normalizedError.code,
          message: normalizedError.message,
          fileName: metadata.fileName
        }
      ],
      errorCode: normalizedError.code,
      errorMessage: normalizedError.message
    };
  }
}

function getInputMetadata(file: DocumentParseFileInput | File) {
  const isWebFile = isFile(file);
  const fileName = isWebFile ? file.name : file.fileName;
  const mimeType = (isWebFile ? file.type : file.mimeType) || "application/octet-stream";
  const size = isWebFile ? file.size : file.size || getBufferSize(file.buffer);
  const extension = normalizeExtension((!isWebFile && file.extension) || path.extname(fileName));
  return {
    fileName,
    mimeType,
    size,
    extension
  };
}

async function readInputBuffer(file: DocumentParseFileInput | File) {
  if (isFile(file)) return Buffer.from(await file.arrayBuffer());
  if (file.buffer) return Buffer.from(toUint8Array(file.buffer));
  if (file.file) return Buffer.from(await file.file.arrayBuffer());
  if (file.path) return readFile(file.path);
  throw new DocumentParseError("DOCUMENT_PARSE_FAILED", "文档输入缺少可读取内容。");
}

function selectParser(extension: string):
  | {
      parser: DocumentParserName;
      parse: (buffer: Buffer) => Promise<ParserOutput> | ParserOutput;
    }
  | undefined {
  if (extension === ".txt") return { parser: "txt", parse: parseTxtDocument };
  if (extension === ".md" || extension === ".markdown") return { parser: "markdown", parse: parseMarkdownDocument };
  if (extension === ".docx") return { parser: "docx", parse: parseDocxDocument };
  if (extension === ".pdf") return { parser: "pdf", parse: parsePdfDocumentLazy };
  if (extension === ".pptx") return { parser: "pptx", parse: parsePptxDocument };
  return undefined;
}

async function parsePdfDocumentLazy(buffer: Buffer) {
  const { parsePdfDocument } = await import("@/lib/document-processing/parsers/pdf");
  return parsePdfDocument(buffer);
}

function getAggregateStatus(files: ParsedFileResult[]): DocumentParseStatus {
  if (!files.length) return "failed";
  if (files.every((file) => file.status === "parsed")) return "parsed";
  if (files.some((file) => file.status === "parsed")) return "partial";
  if (files.every((file) => file.status === "empty")) return "empty";
  if (files.every((file) => file.status === "unsupported")) return "unsupported";
  return "failed";
}

function runWithTimeout<T>(fn: () => Promise<T> | T, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    Promise.resolve().then(fn),
    new Promise<T>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new DocumentParseError("DOCUMENT_PARSE_TIMEOUT", "文档解析超时。")), timeoutMs);
    })
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function normalizeExtension(extension: string) {
  const value = extension.trim().toLowerCase();
  return value.startsWith(".") ? value : `.${value}`;
}

function isFile(value: DocumentParseFileInput | File): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function getBufferSize(buffer: DocumentParseFileInput["buffer"]) {
  if (!buffer) return 0;
  if (buffer instanceof ArrayBuffer) return buffer.byteLength;
  return buffer.byteLength;
}

function toUint8Array(buffer: Buffer | Uint8Array | ArrayBuffer) {
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
