import "server-only";

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseDocuments } from "@/lib/document-processing/parser";
import type { DocumentParseResult } from "@/lib/document-processing/types";
import type {
  TeachingArchitectureExtraction,
  TeachingArchitectureExtractionFile,
  TeachingArchitectureTaskFile
} from "@/lib/smart-tools/teaching-architecture-diagram/types";

const MAX_EXTRACTED_TEXT_LENGTH = 60_000;

type ExtractFromTextInput = {
  taskDir: string;
  textPrompt: string;
};

type ExtractFromFilesInput = {
  taskDir: string;
  files: TeachingArchitectureTaskFile[];
};

export async function extractTeachingArchitectureTextFromPrompt(input: ExtractFromTextInput): Promise<TeachingArchitectureExtraction> {
  const rawText = normalizeExtractedText(input.textPrompt);
  await writeFile(path.join(input.taskDir, "raw-input.txt"), `${rawText}\n`, "utf8");

  return {
    sourceType: "text",
    textLength: rawText.length,
    files: [],
    warnings: [],
    extractedText: rawText,
    sourceSummary: summarizeSource(rawText, "文字描述")
  };
}

export async function extractTeachingArchitectureContentFromFiles(input: ExtractFromFilesInput): Promise<TeachingArchitectureExtraction> {
  const parseResult = await parseDocuments({
    files: input.files.map((file) => ({
      fileName: file.originalName,
      mimeType: file.type,
      size: file.size,
      extension: path.extname(file.storedName || file.originalName),
      path: path.join(input.taskDir, "input", file.storedName)
    })),
    maxChars: MAX_EXTRACTED_TEXT_LENGTH,
    chunkSize: 1_600
  });

  const files = toTeachingArchitectureExtractionFiles(input.files, parseResult);
  const warnings = parseResult.warnings.map((warning) =>
    warning.fileName ? `${warning.fileName}：${warning.message}` : warning.message
  );
  const extractedText = parseResult.effectiveText;
  await writeFile(path.join(input.taskDir, "extracted-content.txt"), `${extractedText}\n`, "utf8");

  return {
    sourceType: "file",
    textLength: extractedText.length,
    files,
    warnings,
    extractedText,
    sourceSummary: summarizeSource(extractedText, files[0]?.fileName || "上传文件")
  };
}

export async function writeTeachingArchitectureExtraction(taskDir: string, extraction: TeachingArchitectureExtraction) {
  const serializable = {
    sourceType: extraction.sourceType,
    textLength: extraction.textLength,
    files: extraction.files,
    warnings: extraction.warnings,
    sourceSummary: extraction.sourceSummary
  };
  await writeFile(path.join(taskDir, "extraction.json"), `${JSON.stringify(serializable, null, 2)}\n`, "utf8");
}

export function getExtractionSourceStatus(extraction: TeachingArchitectureExtraction) {
  if (extraction.sourceType === "text") return "extracted" as const;
  if (extraction.files.some((file) => file.extractionStatus === "extracted")) {
    return extraction.files.some((file) => file.extractionStatus !== "extracted") ? "partial" : "extracted";
  }
  if (extraction.files.some((file) => file.extractionStatus === "pending_parser")) return "pending_parser" as const;
  return "failed" as const;
}

export function assertTeachingArchitectureExtractionReady(extraction: TeachingArchitectureExtraction) {
  if (!extraction.extractedText.trim() || extraction.textLength <= 0) {
    const failedFile = extraction.files.find((file) => file.extractionStatus === "failed");
    throw new Error(failedFile?.errorMessage || "文件未提取到可用文本，请检查文档内容。");
  }
}

function toTeachingArchitectureExtractionFiles(
  sourceFiles: TeachingArchitectureTaskFile[],
  parseResult: DocumentParseResult
): TeachingArchitectureExtractionFile[] {
  return parseResult.files.map((file) => {
    const sourceFile = sourceFiles.find((item) => item.originalName === file.fileName);
    return {
      fileName: file.fileName,
      storedName: sourceFile?.storedName,
      mimeType: file.mimeType,
      size: file.size,
      extractionStatus: file.status === "parsed" ? "extracted" : "failed",
      extractedTextLength: file.textLength,
      errorCode: file.errorCode,
      errorMessage: file.errorMessage
    };
  });
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/`n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function summarizeSource(text: string, fallback: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return fallback;
  return compact.length > 72 ? `${compact.slice(0, 72)}...` : compact;
}
