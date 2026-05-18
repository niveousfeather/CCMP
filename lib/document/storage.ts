import { randomUUID } from "node:crypto";

import type { GeneratedAgentFile } from "@/lib/agent/types";
import * as storage from "@/lib/storage";
import { createMockStorage } from "@/lib/storage/local";

import { DOCX_MIME } from "./types";

export const MARKDOWN_MIME = "text/markdown; charset=utf-8";

function getDatePath() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

export function sanitizeDocumentFileName(value: string) {
  const name = value
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\.docx$/i, "")
    .replace(/\s+/g, "-")
    .slice(0, 36);
  return name || `nexusai-document-${Date.now()}`;
}

export async function uploadDocumentBuffer({
  userId,
  buffer,
  fileName
}: {
  userId: string;
  buffer: Buffer;
  fileName: string;
}): Promise<GeneratedAgentFile> {
  const outputFileName = `${sanitizeDocumentFileName(fileName)}.docx`;
  const key = `users/${userId}/exports/${getDatePath()}/${randomUUID()}.docx`;
  let result: storage.StorageObjectResult;

  try {
    result = await storage.uploadBuffer({ key, buffer, contentType: DOCX_MIME });
  } catch (error) {
    console.error(
      `[document] OSS upload failed, trying local fallback: ${error instanceof Error ? error.message : "unknown"}`
    );
    try {
      result = await createMockStorage().uploadBuffer({ key, buffer, contentType: DOCX_MIME });
    } catch (fallbackError) {
      console.error(
        `[document] local fallback failed: ${fallbackError instanceof Error ? fallbackError.message : "unknown"}`
      );
      throw new Error("DOCUMENT_STORAGE_FAILED");
    }
  }

  return {
    fileName: outputFileName,
    mimeType: DOCX_MIME,
    sizeBytes: buffer.length,
    objectKey: result.provider === "mock" ? null : result.key,
    url: result.url
  };
}

export async function uploadDocumentReport({
  userId,
  markdown,
  fileName
}: {
  userId: string;
  markdown: string;
  fileName: string;
}): Promise<GeneratedAgentFile> {
  const buffer = Buffer.from(markdown, "utf8");
  const outputFileName = `${sanitizeDocumentFileName(fileName)}-修改报告.md`;
  const key = `users/${userId}/exports/${getDatePath()}/${randomUUID()}.md`;
  let result: storage.StorageObjectResult;

  try {
    result = await storage.uploadBuffer({ key, buffer, contentType: MARKDOWN_MIME });
  } catch (error) {
    console.error(
      `[document] report OSS upload failed, trying local fallback: ${error instanceof Error ? error.message : "unknown"}`
    );
    try {
      result = await createMockStorage().uploadBuffer({ key, buffer, contentType: MARKDOWN_MIME });
    } catch (fallbackError) {
      console.error(
        `[document] report local fallback failed: ${fallbackError instanceof Error ? fallbackError.message : "unknown"}`
      );
      throw new Error("DOCUMENT_REPORT_STORAGE_FAILED");
    }
  }

  return {
    fileName: outputFileName,
    mimeType: MARKDOWN_MIME,
    sizeBytes: buffer.length,
    objectKey: result.provider === "mock" ? null : result.key,
    url: result.url
  };
}
