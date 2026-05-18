import * as XLSX from "xlsx";

import { inspectWorkbook } from "./inspect";
import type { SpreadsheetModificationOptions } from "./types";

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function cleanHeader(value: unknown) {
  return String(value ?? "").trim();
}

function findHeaderRow(sheet: XLSX.WorkSheet) {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  let best = { row: range.s.r, count: 0 };
  for (let row = range.s.r; row <= Math.min(range.e.r, range.s.r + 5); row += 1) {
    let count = 0;
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const value = cleanHeader(sheet[XLSX.utils.encode_cell({ r: row, c: col })]?.v);
      if (value) count += 1;
    }
    if (count > best.count) best = { row, count };
  }
  return best.row;
}

function sheetToRows(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
}

function setSheetRows(workbook: XLSX.WorkBook, sheetName: string, rows: unknown[][]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  for (let row = 0; row < rows.length; row += 1) {
    for (let col = 0; col < (rows[row]?.length || 0); col += 1) {
      const value = rows[row][col] as { f?: string } | unknown;
      if (value && typeof value === "object" && "f" in value && typeof value.f === "string") {
        sheet[XLSX.utils.encode_cell({ r: row, c: col })] = { t: "n", f: value.f, v: 0 };
      }
    }
  }
  const headerRow = Math.min(1, rows.length - 1);
  const width = Math.max(...rows.map((row) => row.length), 1);
  sheet["!cols"] = Array.from({ length: width }, (_, index) => ({ wch: index === 0 ? 20 : 16 }));
  if (rows.length > headerRow + 1) {
    sheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: headerRow, c: 0 },
        e: { r: rows.length - 1, c: width - 1 }
      })
    };
  }
  workbook.Sheets[sheetName] = sheet;
}

function findColumn(headers: string[], patterns: RegExp[]) {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(normalizeText(header))));
}

function addProfitMarginColumn(workbook: XLSX.WorkBook, sheetName: string, changes: string[]) {
  const sheet = workbook.Sheets[sheetName];
  const rows = sheetToRows(sheet);
  const headerRow = findHeaderRow(sheet);
  const headers = (rows[headerRow] || []).map(cleanHeader);
  const existing = findColumn(headers, [/profitmargin|margin|利润率|毛利率/]);
  if (existing >= 0) return;

  const salesCol = findColumn(headers, [/salesamount|revenue|sales|amount|销售额|收入|金额/]);
  const profitCol = findColumn(headers, [/profit|grossprofit|利润|毛利/]);
  const costCol = findColumn(headers, [/cost|成本/]);
  const newCol = headers.length;
  rows[headerRow][newCol] = "Profit Margin";
  for (let row = headerRow + 1; row < rows.length; row += 1) {
    if (!rows[row] || rows[row].every((value) => value === null || value === "")) continue;
    const excelRow = row + 1;
    const salesRef = XLSX.utils.encode_cell({ r: row, c: salesCol >= 0 ? salesCol : Math.max(0, headers.length - 1) });
    if (profitCol >= 0) {
      const profitRef = XLSX.utils.encode_cell({ r: row, c: profitCol });
      rows[row][newCol] = { f: `IFERROR(${profitRef}/${salesRef},0)` };
    } else if (costCol >= 0 && salesCol >= 0) {
      const costRef = XLSX.utils.encode_cell({ r: row, c: costCol });
      rows[row][newCol] = { f: `IFERROR((${salesRef}-${costRef})/${salesRef},0)` };
    } else {
      rows[row][newCol] = { f: `IFERROR(0/${salesRef},0)` };
    }
    rows[row][newCol + 1] = rows[row][newCol + 1] ?? null;
    void excelRow;
  }
  setSheetRows(workbook, sheetName, rows as unknown[][]);
  changes.push("Added Profit Margin column with Excel formulas.");
}

function addSummarySheet(workbook: XLSX.WorkBook, sheetName: string, request: string, changes: string[]) {
  const sheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  const rows = sheetToRows(sheet);
  const headerRow = findHeaderRow(sheet);
  const headers = (rows[headerRow] || []).map(cleanHeader);
  const salesCol = findColumn(headers, [/salesamount|revenue|sales|amount|销售额|收入|金额/]);
  const profitCol = findColumn(headers, [/profit$|grossprofit|利润|毛利/]);
  const summaryNameBase = "Summary";
  let summaryName = summaryNameBase;
  let suffix = 2;
  while (workbook.SheetNames.includes(summaryName)) {
    summaryName = `${summaryNameBase}${suffix}`;
    suffix += 1;
  }

  const startRow = headerRow + 2;
  const endRow = range.e.r + 1;
  const salesFormula = salesCol >= 0 ? `SUM('${sheetName}'!${XLSX.utils.encode_col(salesCol)}${startRow}:${XLSX.utils.encode_col(salesCol)}${endRow})` : "";
  const profitFormula = profitCol >= 0 ? `SUM('${sheetName}'!${XLSX.utils.encode_col(profitCol)}${startRow}:${XLSX.utils.encode_col(profitCol)}${endRow})` : "";
  const summaryRows: unknown[][] = [
    ["Workbook Summary"],
    ["Source Sheet", sheetName],
    ["User Request", request],
    ["Rows", Math.max(0, range.e.r - headerRow)],
    ["Columns", range.e.c + 1],
    ["Total Sales", salesFormula ? { f: salesFormula } : "No sales column detected"],
    ["Total Profit", profitFormula ? { f: profitFormula } : "No profit column detected"],
    ["Generated At", new Date().toISOString()]
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), summaryName);
  changes.push(`Added ${summaryName} sheet.`);
}

function sortByDate(workbook: XLSX.WorkBook, sheetName: string, changes: string[]) {
  const sheet = workbook.Sheets[sheetName];
  const rows = sheetToRows(sheet);
  const headerRow = findHeaderRow(sheet);
  const headers = (rows[headerRow] || []).map(cleanHeader);
  const dateCol = findColumn(headers, [/date|日期|时间/]);
  if (dateCol < 0) return;
  const top = rows.slice(0, headerRow + 1);
  const body = rows.slice(headerRow + 1).filter((row) => row.some((value) => value !== null && value !== ""));
  body.sort((left, right) => String(left[dateCol] || "").localeCompare(String(right[dateCol] || "")));
  setSheetRows(workbook, sheetName, [...top, ...body] as unknown[][]);
  changes.push("Sorted primary sheet by date.");
}

function formatCompletedRows(workbook: XLSX.WorkBook, sheetName: string, changes: string[]) {
  const sheet = workbook.Sheets[sheetName];
  const rows = sheetToRows(sheet);
  const headerRow = findHeaderRow(sheet);
  const headers = (rows[headerRow] || []).map(cleanHeader);
  const statusCol = findColumn(headers, [/status|状态|进度/]);
  if (statusCol < 0) return;
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  for (let row = headerRow + 1; row <= range.e.r; row += 1) {
    const status = normalizeText(String(rows[row]?.[statusCol] || ""));
    if (!/(completed|done|已完成|完成)/.test(status)) continue;
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[address];
      if (cell) {
        cell.s = {
          ...(cell.s || {}),
          fill: { patternType: "solid", fgColor: { rgb: "D9EAD3" } }
        };
      }
    }
  }
  changes.push("Marked completed rows with a green fill where supported by the writer.");
}

export function modifySpreadsheet(options: SpreadsheetModificationOptions) {
  const workbook = XLSX.read(options.buffer, { type: "buffer", cellFormula: true, cellStyles: true });
  if (!workbook.SheetNames.length) throw new Error("SPREADSHEET_EMPTY_WORKBOOK");

  const changes: string[] = [];
  const request = normalizeText(options.request);
  const primarySheetName = workbook.SheetNames[0];

  if (/profitmargin|利润率|毛利率/.test(request)) addProfitMarginColumn(workbook, primarySheetName, changes);
  if (/sum|summary|汇总|求和|统计/.test(request)) addSummarySheet(workbook, primarySheetName, options.request, changes);
  if (/sort|排序|日期/.test(request)) sortByDate(workbook, primarySheetName, changes);
  if (/green|标绿|已完成|completed/.test(request)) formatCompletedRows(workbook, primarySheetName, changes);
  if (!changes.length) {
    addSummarySheet(workbook, primarySheetName, options.request, changes);
    changes.push("Applied default workbook cleanup with a summary sheet.");
  }

  const inspection = inspectWorkbook(workbook);
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer", compression: true, cellStyles: true }) as Buffer;
  if (buffer.length < 1024) throw new Error("SPREADSHEET_WRITE_FAILED");

  return { buffer, inspection, changes };
}
