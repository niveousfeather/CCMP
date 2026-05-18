import { randomUUID } from "node:crypto";

import type { GeneratedAgentFile } from "@/lib/agent/types";
import * as storage from "@/lib/storage";
import { createMockStorage } from "@/lib/storage/local";

import { XLSX_MIME } from "./types";

function getDatePath() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

export function sanitizeSpreadsheetFileName(value: string) {
  const name = value
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\.xlsx$/i, "")
    .replace(/\s+/g, "_")
    .slice(0, 48);
  return name || `spreadsheet_${Date.now()}`;
}

export async function uploadSpreadsheetBuffer({
  userId,
  buffer,
  fileName
}: {
  userId: string;
  buffer: Buffer;
  fileName: string;
}): Promise<GeneratedAgentFile> {
  const outputFileName = `${sanitizeSpreadsheetFileName(fileName)}.xlsx`;
  const key = `users/${userId}/exports/${getDatePath()}/${randomUUID()}.xlsx`;
  let result: storage.StorageObjectResult;

  try {
    result = await storage.uploadBuffer({ key, buffer, contentType: XLSX_MIME });
  } catch (error) {
    console.error(`[spreadsheet] OSS upload failed, trying local fallback: ${error instanceof Error ? error.message : "unknown"}`);
    result = await createMockStorage().uploadBuffer({ key, buffer, contentType: XLSX_MIME });
  }

  return {
    fileName: outputFileName,
    mimeType: XLSX_MIME,
    sizeBytes: buffer.length,
    objectKey: result.provider === "mock" ? null : result.key,
    url: result.url
  };
}
