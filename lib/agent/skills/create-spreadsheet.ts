import { createSpreadsheet } from "@/lib/spreadsheet/create";
import { inspectWorkbookBuffer } from "@/lib/spreadsheet/inspect";
import { modifySpreadsheet } from "@/lib/spreadsheet/modify";
import { uploadSpreadsheetBuffer } from "@/lib/spreadsheet/storage";
import type { SpreadsheetTaskResult } from "@/lib/spreadsheet/types";

const spreadsheetExtensions = new Set(["xlsx", "xls", "csv"]);

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function timestampName(prefix: string) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "_");
  return `${prefix}_${stamp}`;
}

export function isSpreadsheetFile(file: File) {
  return spreadsheetExtensions.has(getExtension(file.name));
}

async function fileToBuffer(file: File) {
  return Buffer.from(await file.arrayBuffer());
}

export async function runSpreadsheetTask({
  userId,
  request,
  file,
  requestedFileName
}: {
  userId: string;
  request: string;
  file?: File;
  requestedFileName?: string;
}): Promise<SpreadsheetTaskResult> {
  if (file) {
    const sourceBuffer = await fileToBuffer(file);
    const beforeInspection = inspectWorkbookBuffer(sourceBuffer);
    const modified = modifySpreadsheet({
      request,
      fileName: file.name,
      buffer: sourceBuffer
    });
    const fileName = requestedFileName || timestampName("modified_spreadsheet");
    const uploaded = await uploadSpreadsheetBuffer({ userId, buffer: modified.buffer, fileName });
    return {
      file: uploaded,
      inspection: beforeInspection,
      changes: modified.changes
    };
  }

  const buffer = createSpreadsheet({ request, title: requestedFileName, fileName: requestedFileName });
  const fileName = requestedFileName || timestampName("spreadsheet");
  const uploaded = await uploadSpreadsheetBuffer({ userId, buffer, fileName });
  return {
    file: uploaded,
    inspection: inspectWorkbookBuffer(buffer),
    changes: ["Created a new workbook with formatted data, formulas, and a summary sheet."]
  };
}
