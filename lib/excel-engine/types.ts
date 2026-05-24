export const EXCEL_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type WorkbookStylePreset = "formal";

export type ExcelCellValue = string | number | boolean | Date | null;

export type ExcelColumnType = "string" | "number" | "date" | "currency" | "percent" | "formula";

export type ColumnBlueprint = {
  key: string;
  header: string;
  type: ExcelColumnType;
  width?: number;
  required?: boolean;
};

export type FormulaBlueprint = {
  targetColumnKey?: string;
  cell?: string;
  formula: string;
  description?: string;
};

export type SheetBlueprint = {
  name: string;
  title?: string;
  columns: ColumnBlueprint[];
  rows: Array<Record<string, ExcelCellValue>>;
  formulas?: FormulaBlueprint[];
  summaryRows?: Array<Record<string, ExcelCellValue>>;
  freezeHeader?: boolean;
  autoFilter?: boolean;
  columnWidths?: Record<string, number>;
  notes?: string[];
};

export type WorkbookBlueprint = {
  title: string;
  description?: string;
  sheets: SheetBlueprint[];
  defaultStylePreset: WorkbookStylePreset;
  fileName?: string;
  template?: boolean;
};

export type ExcelEngineFileResult = {
  fileName: string;
  filePath?: string;
  mimeType: typeof EXCEL_MIME_TYPE;
  sizeBytes: number;
  buffer: Buffer;
  objectKey: string | null;
  downloadUrl: string | null;
  metadata: {
    sheetNames: string[];
    stylePreset: WorkbookStylePreset;
    template?: boolean;
  };
};

export type ParsedWorkbookSheet = {
  name: string;
  range: string;
  rowCount: number;
  columnCount: number;
  headers: string[];
  rows: unknown[][];
  formulas: Array<{ address: string; formula: string }>;
};

export type ParsedWorkbook = {
  sheetNames: string[];
  sheets: ParsedWorkbookSheet[];
};

export type ConversationExcelSource = {
  fileName: string;
  mimeType?: string | null;
  extractedText?: string | null;
  textPreview?: string | null;
};
