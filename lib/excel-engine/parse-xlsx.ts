import * as XLSX from "xlsx";

import { generateXlsxFile } from "@/lib/excel-engine/generate-xlsx";
import type { ColumnBlueprint, ExcelEngineFileResult, ParsedWorkbook, SheetBlueprint, WorkbookBlueprint } from "@/lib/excel-engine/types";

function cleanHeader(value: unknown, index: number) {
  const text = String(value ?? "").trim();
  return text || `列${index + 1}`;
}

function safeKey(value: string, index: number) {
  return value
    .replace(/[^\w\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || `col_${index + 1}`;
}

function inferType(values: unknown[]): ColumnBlueprint["type"] {
  const present = values.filter((value) => value !== null && value !== "");
  if (present.length && present.every((value) => typeof value === "number")) return "number";
  return "string";
}

function toCellValue(value: unknown) {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof Date) return value;
  return String(value);
}

function sheetRows(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
}

function findHeaderRow(rows: unknown[][]) {
  let best = { index: 0, count: 0 };
  rows.slice(0, 6).forEach((row, index) => {
    const count = row.filter((cell) => String(cell ?? "").trim()).length;
    if (count > best.count) best = { index, count };
  });
  return best.index;
}

export function parseXlsxBuffer(buffer: Buffer): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer", cellFormula: true, cellStyles: true });
  return {
    sheetNames: workbook.SheetNames,
    sheets: workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const rows = sheetRows(sheet);
      const headerRow = findHeaderRow(rows);
      const headers = (rows[headerRow] || []).map(cleanHeader);
      const range = sheet["!ref"] || "A1:A1";
      const formulas = Object.entries(sheet)
        .filter(([address, cell]) => !address.startsWith("!") && typeof (cell as { f?: unknown }).f === "string")
        .map(([address, cell]) => ({ address, formula: String((cell as { f: string }).f) }));
      return {
        name,
        range,
        rowCount: rows.length,
        columnCount: headers.length,
        headers,
        rows,
        formulas
      };
    })
  };
}

function sheetToBlueprint(sheet: ParsedWorkbook["sheets"][number], modifyAverage: boolean): SheetBlueprint {
  const headerRow = findHeaderRow(sheet.rows);
  const headers = [...sheet.headers];
  if (modifyAverage && !headers.includes("平均分")) headers.push("平均分");
  const keys = headers.map(safeKey);
  const columns = headers.map((header, index) => ({
    key: keys[index],
    header,
    type: header === "平均分" ? "formula" : inferType(sheet.rows.slice(headerRow + 1).map((row) => row[index])),
    width: Math.max(12, Math.min(24, header.length * 2 + 8))
  })) satisfies ColumnBlueprint[];
  const rows = sheet.rows.slice(headerRow + 1).map((row) =>
    Object.fromEntries(keys.map((key, index) => [key, toCellValue(row[index])]))
  );
  const numericIndexes = columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => column.type === "number")
    .map(({ index }) => index)
    .slice(0, 5);
  const averageColumn = columns.find((column) => column.header === "平均分");
  return {
    name: sheet.name,
    title: sheet.name,
    columns,
    rows,
    formulas:
      averageColumn && numericIndexes.length
        ? [
            {
              targetColumnKey: averageColumn.key,
              formula: `AVERAGE(${XLSX.utils.encode_col(numericIndexes[0])}{row}:${XLSX.utils.encode_col(numericIndexes[numericIndexes.length - 1])}{row})`,
              description: "计算平均分"
            }
          ]
        : [],
    freezeHeader: true,
    autoFilter: true
  };
}

export async function modifyXlsxFile({
  request,
  sourceFileName,
  sourceBuffer,
  outputDir,
  userId
}: {
  request: string;
  sourceFileName: string;
  sourceBuffer: Buffer;
  outputDir?: string;
  userId?: string;
}): Promise<ExcelEngineFileResult> {
  const parsed = parseXlsxBuffer(sourceBuffer);
  if (!parsed.sheets.length) throw new Error("EXCEL_EMPTY_WORKBOOK");
  const modifyAverage = /平均分|average/i.test(request);
  const blueprint: WorkbookBlueprint = {
    title: sourceFileName.replace(/\.xlsx$/i, "") || "Excel 修改版",
    sheets: parsed.sheets.map((sheet, index) => sheetToBlueprint(sheet, index === 0 && modifyAverage)),
    defaultStylePreset: "formal",
    fileName: `${sourceFileName.replace(/\.xlsx$/i, "")}_新版`
  };
  return generateXlsxFile({ blueprint, outputDir, userId });
}
