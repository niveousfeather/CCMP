import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import JSZip from "jszip";
import * as XLSX from "xlsx";

import * as storage from "@/lib/storage";
import { createMockStorage } from "@/lib/storage/local";
import { createFormalStylesXml } from "@/lib/excel-engine/style-presets";
import { EXCEL_MIME_TYPE, type ColumnBlueprint, type ExcelCellValue, type ExcelEngineFileResult, type SheetBlueprint, type WorkbookBlueprint } from "@/lib/excel-engine/types";
import { validateWorkbookBlueprint } from "@/lib/excel-engine/validate-blueprint";

type SheetLayout = {
  index: number;
  columnCount: number;
  rowCount: number;
  headerRow: number;
  summaryStartRow: number | null;
  columnTypes: ColumnBlueprint["type"][];
};

function datePath() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

export function sanitizeExcelFileName(value: string) {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\.xlsx$/i, "")
    .replace(/\s+/g, "_")
    .slice(0, 54);
  return cleaned || `excel_${Date.now()}`;
}

function cleanSheetName(value: string, fallback: string) {
  const cleaned = value.replace(/[\\/?*[\]:]/g, "").trim().slice(0, 31);
  return cleaned || fallback;
}

function valueToCell(value: unknown): ExcelCellValue | { f: string; v: number; t: "n" } {
  if (value && typeof value === "object" && "f" in value && typeof (value as { f?: unknown }).f === "string") {
    return { f: String((value as { f: string }).f), v: 0, t: "n" };
  }
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return value == null ? null : String(value);
}

function formulaForRow(formula: string, rowNumber: number) {
  return formula.replace(/\{row\}/g, String(rowNumber));
}

function buildSheetRows(sheet: SheetBlueprint) {
  const rows: unknown[][] = [];
  rows.push([sheet.title || sheet.name]);
  rows.push(sheet.columns.map((column) => column.header));

  const templateRowCount = sheet.rows.length ? sheet.rows.length : sheet.formulas?.some((formula) => formula.targetColumnKey) ? 5 : 0;
  for (let rowIndex = 0; rowIndex < templateRowCount; rowIndex += 1) {
    const sourceRow = sheet.rows[rowIndex] || {};
    const excelRowNumber = rows.length + 1;
    rows.push(
      sheet.columns.map((column) => {
        const rowFormula = sheet.formulas?.find((formula) => formula.targetColumnKey === column.key);
        if (rowFormula) return { f: formulaForRow(rowFormula.formula, excelRowNumber), v: 0, t: "n" };
        return valueToCell(sourceRow[column.key] ?? null);
      })
    );
  }

  const summaryStartRow = sheet.summaryRows?.length ? rows.length : null;
  for (const summaryRow of sheet.summaryRows || []) {
    const excelRowNumber = rows.length + 1;
    rows.push(
      sheet.columns.map((column) => {
        const rowFormula = sheet.formulas?.find((formula) => formula.targetColumnKey === column.key);
        if (rowFormula) return { f: formulaForRow(rowFormula.formula, excelRowNumber), v: 0, t: "n" };
        return valueToCell(summaryRow[column.key] ?? null);
      })
    );
  }

  return { rows, summaryStartRow };
}

function applyCellFormulas(sheet: XLSX.WorkSheet, rows: unknown[][], blueprint: SheetBlueprint) {
  for (let row = 0; row < rows.length; row += 1) {
    for (let col = 0; col < (rows[row]?.length || 0); col += 1) {
      const value = rows[row][col] as { f?: string; v?: number; t?: string } | unknown;
      if (value && typeof value === "object" && "f" in value && typeof value.f === "string") {
        const formulaCell = value as { f: string; v?: unknown };
        sheet[XLSX.utils.encode_cell({ r: row, c: col })] = { t: "n", f: formulaCell.f, v: typeof formulaCell.v === "number" ? formulaCell.v : 0 };
      }
    }
  }

  for (const formula of blueprint.formulas || []) {
    if (!formula.cell) continue;
    sheet[formula.cell] = { t: "n", f: formula.formula, v: 0 };
  }
}

function addWorksheet(workbook: XLSX.WorkBook, sheet: SheetBlueprint, index: number): SheetLayout {
  const { rows, summaryStartRow } = buildSheetRows(sheet);
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  applyCellFormulas(worksheet, rows, sheet);
  const columnCount = Math.max(sheet.columns.length, 1);
  worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: columnCount - 1 } }];
  worksheet["!cols"] = sheet.columns.map((column) => ({
    wch: sheet.columnWidths?.[column.key] || column.width || Math.max(12, Math.min(28, column.header.length * 2 + 8))
  }));
  if (sheet.autoFilter !== false) {
    worksheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 1, c: 0 },
        e: { r: Math.max(1, rows.length - 1), c: columnCount - 1 }
      })
    };
  }
  XLSX.utils.book_append_sheet(workbook, worksheet, cleanSheetName(sheet.name, `Sheet${index + 1}`));
  return {
    index,
    columnCount,
    rowCount: rows.length,
    headerRow: 2,
    summaryStartRow: summaryStartRow == null ? null : summaryStartRow + 1,
    columnTypes: sheet.columns.map((column) => column.type)
  };
}

function setCellStyle(xml: string, address: string, styleId: number) {
  const pattern = new RegExp(`(<c\\s+[^>]*r="${address}"[^>]*)(>)`);
  return xml.replace(pattern, (match, start: string, end: string) => {
    const withStyle = /\ss="\d+"/.test(start) ? start.replace(/\ss="\d+"/, ` s="${styleId}"`) : `${start} s="${styleId}"`;
    return `${withStyle}${end}`;
  });
}

function addFrozenPane(xml: string) {
  const views = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A3" sqref="A3"/></sheetView></sheetViews>';
  if (/<sheetViews>[\s\S]*?<\/sheetViews>/.test(xml)) return xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, views);
  return xml.replace(/<sheetFormatPr/, `${views}<sheetFormatPr`);
}

async function applyFormalWorkbookStyles(buffer: Buffer, layouts: SheetLayout[]) {
  const zip = await JSZip.loadAsync(buffer);
  zip.file("xl/styles.xml", createFormalStylesXml());
  for (const layout of layouts) {
    const pathName = `xl/worksheets/sheet${layout.index + 1}.xml`;
    const file = zip.file(pathName);
    if (!file) continue;
    let xml = await file.async("string");
    xml = addFrozenPane(xml);
    for (let col = 0; col < layout.columnCount; col += 1) {
      xml = setCellStyle(xml, XLSX.utils.encode_cell({ r: 0, c: col }), 1);
      xml = setCellStyle(xml, XLSX.utils.encode_cell({ r: 1, c: col }), 2);
    }
    for (let row = 2; row < layout.rowCount; row += 1) {
      const isSummary = layout.summaryStartRow != null && row + 1 >= layout.summaryStartRow;
      for (let col = 0; col < layout.columnCount; col += 1) {
        const type = layout.columnTypes[col];
        const styleId = isSummary ? 5 : type === "currency" || type === "number" || type === "formula" ? 6 : type === "percent" ? 7 : row % 2 === 0 ? 3 : 4;
        xml = setCellStyle(xml, XLSX.utils.encode_cell({ r: row, c: col }), styleId);
      }
    }
    zip.file(pathName, xml);
  }
  return Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}

async function persistBuffer({
  buffer,
  fileName,
  outputDir,
  userId
}: {
  buffer: Buffer;
  fileName: string;
  outputDir?: string;
  userId?: string;
}): Promise<Pick<ExcelEngineFileResult, "filePath" | "objectKey" | "downloadUrl">> {
  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
    const filePath = path.join(outputDir, fileName);
    await writeFile(filePath, buffer);
    return { filePath, objectKey: null, downloadUrl: null };
  }

  const key = `users/${userId || "anonymous"}/excel/${datePath()}/${randomUUID()}.xlsx`;
  try {
    const uploaded = await storage.uploadBuffer({ key, buffer, contentType: EXCEL_MIME_TYPE });
    return { objectKey: uploaded.provider === "mock" ? null : uploaded.key, downloadUrl: uploaded.url, filePath: undefined };
  } catch {
    const uploaded = await createMockStorage().uploadBuffer({ key, buffer, contentType: EXCEL_MIME_TYPE });
    return { objectKey: null, downloadUrl: uploaded.url, filePath: undefined };
  }
}

export async function generateXlsxFile({
  blueprint,
  outputDir,
  userId
}: {
  blueprint: WorkbookBlueprint;
  outputDir?: string;
  userId?: string;
}): Promise<ExcelEngineFileResult> {
  validateWorkbookBlueprint(blueprint);
  const workbook = XLSX.utils.book_new();
  const layouts = blueprint.sheets.map((sheet, index) => addWorksheet(workbook, sheet, index));
  const rawBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer", compression: true, cellStyles: true }) as Buffer;
  const buffer = await applyFormalWorkbookStyles(rawBuffer, layouts);
  const fileName = `${sanitizeExcelFileName(blueprint.fileName || blueprint.title)}.xlsx`;
  const persisted = await persistBuffer({ buffer, fileName, outputDir, userId });
  return {
    fileName,
    mimeType: EXCEL_MIME_TYPE,
    sizeBytes: buffer.length,
    buffer,
    ...persisted,
    metadata: {
      sheetNames: workbook.SheetNames,
      stylePreset: blueprint.defaultStylePreset,
      template: blueprint.template
    }
  };
}
