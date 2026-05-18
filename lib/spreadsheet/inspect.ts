import * as XLSX from "xlsx";

import type { SpreadsheetCellPreview, SpreadsheetSheetInspection, WorkbookInspection } from "./types";

function cleanText(value: unknown, maxLength = 120) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function decodeRange(sheet: XLSX.WorkSheet) {
  const range = sheet["!ref"] || "A1:A1";
  const decoded = XLSX.utils.decode_range(range);
  return { range, decoded };
}

function cellValue(cell: XLSX.CellObject | undefined) {
  if (!cell) return null;
  if (cell.f) return `=${cell.f}`;
  if (cell.v === undefined || cell.v === null) return null;
  if (typeof cell.v === "string" || typeof cell.v === "number" || typeof cell.v === "boolean") return cell.v;
  return cleanText(cell.v);
}

function inspectFormulas(sheet: XLSX.WorkSheet, maxItems = 20): SpreadsheetCellPreview[] {
  const formulas: SpreadsheetCellPreview[] = [];
  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;
    const cell = sheet[address] as XLSX.CellObject | undefined;
    if (!cell?.f) continue;
    formulas.push({
      address,
      value: cell.v === undefined ? null : (cell.v as string | number | boolean | null),
      formula: cell.f
    });
    if (formulas.length >= maxItems) break;
  }
  return formulas;
}

function headerCandidates(sheet: XLSX.WorkSheet, decoded: XLSX.Range) {
  const rowsToCheck = Math.min(decoded.e.r, decoded.s.r + 4);
  let bestHeaders: string[] = [];
  for (let row = decoded.s.r; row <= rowsToCheck; row += 1) {
    const headers: string[] = [];
    for (let col = decoded.s.c; col <= decoded.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const value = cleanText(sheet[address]?.v);
      if (value) headers.push(value);
    }
    if (headers.length > bestHeaders.length) bestHeaders = headers;
  }
  return bestHeaders.slice(0, 24);
}

function previewRows(sheet: XLSX.WorkSheet, decoded: XLSX.Range, headers: string[]) {
  const preview: Array<Record<string, string | number | boolean | null>> = [];
  const startRow = Math.min(decoded.e.r, decoded.s.r + 1);
  const endRow = Math.min(decoded.e.r, startRow + 5);
  const width = Math.min(decoded.e.c - decoded.s.c + 1, 12);
  for (let row = startRow; row <= endRow; row += 1) {
    const item: Record<string, string | number | boolean | null> = {};
    for (let offset = 0; offset < width; offset += 1) {
      const col = decoded.s.c + offset;
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      item[headers[offset] || XLSX.utils.encode_col(col)] = cellValue(sheet[address] as XLSX.CellObject | undefined);
    }
    if (Object.values(item).some((value) => value !== null && value !== "")) preview.push(item);
  }
  return preview;
}

export function inspectWorkbook(workbook: XLSX.WorkBook): WorkbookInspection {
  const sheets: SpreadsheetSheetInspection[] = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const { range, decoded } = decodeRange(sheet);
    const headers = headerCandidates(sheet, decoded);
    return {
      name,
      range,
      rowCount: decoded.e.r - decoded.s.r + 1,
      columnCount: decoded.e.c - decoded.s.c + 1,
      headerCandidates: headers,
      previewRows: previewRows(sheet, decoded, headers),
      formulas: inspectFormulas(sheet),
      merges: (sheet["!merges"] || []).map((merge) => XLSX.utils.encode_range(merge))
    };
  });

  return {
    sheetNames: workbook.SheetNames,
    sheets
  };
}

export function inspectWorkbookBuffer(buffer: Buffer): WorkbookInspection {
  const workbook = XLSX.read(buffer, { type: "buffer", cellFormula: true, cellStyles: true });
  return inspectWorkbook(workbook);
}
