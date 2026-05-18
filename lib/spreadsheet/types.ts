import type { GeneratedAgentFile } from "@/lib/agent/types";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type SpreadsheetCellPreview = {
  address: string;
  value: string | number | boolean | null;
  formula?: string;
};

export type SpreadsheetSheetInspection = {
  name: string;
  range: string;
  rowCount: number;
  columnCount: number;
  headerCandidates: string[];
  previewRows: Array<Record<string, string | number | boolean | null>>;
  formulas: SpreadsheetCellPreview[];
  merges: string[];
};

export type WorkbookInspection = {
  sheetNames: string[];
  sheets: SpreadsheetSheetInspection[];
};

export type SpreadsheetGenerationOptions = {
  request: string;
  title?: string;
  fileName?: string;
};

export type SpreadsheetModificationOptions = {
  request: string;
  fileName: string;
  buffer: Buffer;
};

export type SpreadsheetTaskResult = {
  file: GeneratedAgentFile;
  inspection?: WorkbookInspection;
  changes: string[];
};
