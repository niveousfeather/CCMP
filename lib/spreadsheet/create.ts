import * as XLSX from "xlsx";

import type { SpreadsheetGenerationOptions } from "./types";

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function cleanSheetName(value: string) {
  const cleaned = value.replace(/[\\/?*[\]:]/g, "").trim().slice(0, 28);
  return cleaned || "Sheet1";
}

function aoaToSheet(rows: unknown[][]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  for (let row = 0; row < rows.length; row += 1) {
    for (let col = 0; col < (rows[row]?.length || 0); col += 1) {
      const value = rows[row][col] as { f?: string } | unknown;
      if (value && typeof value === "object" && "f" in value && typeof value.f === "string") {
        sheet[XLSX.utils.encode_cell({ r: row, c: col })] = { t: "n", f: value.f, v: 0 };
      }
    }
  }
  sheet["!cols"] = rows[1]?.map((_, index) => ({ wch: index === 0 ? 18 : 16 })) || [];
  if (rows.length > 1 && rows[1]?.length) {
    sheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 1, c: 0 },
        e: { r: Math.max(1, rows.length - 1), c: rows[1].length - 1 }
      })
    };
  }
  return sheet;
}

function salesWorkbookRows() {
  return [
    ["Sales Statistics"],
    ["Date", "Region", "Product", "Customer", "Quantity", "Unit Price", "Sales Amount", "Cost", "Profit", "Profit Margin", "Status"],
    ["2026-05-01", "East", "Product A", "Customer 01", 12, 199, { f: "E3*F3" }, 1680, { f: "G3-H3" }, { f: "IFERROR(I3/G3,0)" }, "Completed"],
    ["2026-05-02", "South", "Product B", "Customer 02", 8, 299, { f: "E4*F4" }, 1780, { f: "G4-H4" }, { f: "IFERROR(I4/G4,0)" }, "In Progress"],
    ["2026-05-03", "North", "Product C", "Customer 03", 15, 129, { f: "E5*F5" }, 1260, { f: "G5-H5" }, { f: "IFERROR(I5/G5,0)" }, "Completed"],
    ["2026-05-04", "West", "Product A", "Customer 04", 10, 199, { f: "E6*F6" }, 1390, { f: "G6-H6" }, { f: "IFERROR(I6/G6,0)" }, "Pending"],
    [],
    ["Summary", "", "", "", "", "", { f: "SUM(G3:G6)" }, { f: "SUM(H3:H6)" }, { f: "SUM(I3:I6)" }, { f: "IFERROR(I8/G8,0)" }, ""]
  ];
}

function projectWorkbookRows() {
  return [
    ["Project Progress Tracker"],
    ["Task", "Owner", "Start Date", "Due Date", "Status", "Progress", "Priority", "Notes"],
    ["Requirements", "Product", "2026-05-01", "2026-05-05", "Completed", 1, "High", "Confirm scope"],
    ["Design", "Design", "2026-05-06", "2026-05-12", "In Progress", 0.55, "High", "Review layout"],
    ["Development", "Engineering", "2026-05-13", "2026-05-24", "Pending", 0, "High", "Implement core flow"],
    ["Testing", "QA", "2026-05-25", "2026-05-30", "Pending", 0, "Medium", "Regression check"],
    [],
    ["Overall Progress", "", "", "", "", { f: "AVERAGE(F3:F6)" }, "", ""]
  ];
}

function budgetWorkbookRows() {
  return [
    ["Budget Plan"],
    ["Category", "Item", "Quantity", "Unit Cost", "Budget", "Actual", "Variance", "Owner"],
    ["Labor", "Planning", 8, 800, { f: "C3*D3" }, 5800, { f: "F3-E3" }, "PM"],
    ["Software", "Tools", 3, 1200, { f: "C4*D4" }, 3600, { f: "F4-E4" }, "Ops"],
    ["Marketing", "Launch", 1, 15000, { f: "C5*D5" }, 12800, { f: "F5-E5" }, "Marketing"],
    ["Contingency", "Reserve", 1, 5000, { f: "C6*D6" }, 0, { f: "F6-E6" }, "Finance"],
    [],
    ["Total", "", "", "", { f: "SUM(E3:E6)" }, { f: "SUM(F3:F6)" }, { f: "SUM(G3:G6)" }, ""]
  ];
}

function customerWorkbookRows() {
  return [
    ["Customer Follow-up Tracker"],
    ["Customer", "Contact", "Stage", "Last Contact", "Next Action", "Owner", "Expected Value", "Status"],
    ["Customer 01", "Li", "Proposal", "2026-05-01", "Send quotation", "Sales A", 50000, "In Progress"],
    ["Customer 02", "Wang", "Negotiation", "2026-05-03", "Schedule meeting", "Sales B", 78000, "Completed"],
    ["Customer 03", "Chen", "Lead", "2026-05-04", "Qualify demand", "Sales A", 32000, "Pending"],
    ["Customer 04", "Zhao", "Contract", "2026-05-06", "Confirm terms", "Sales C", 96000, "In Progress"],
    [],
    ["Pipeline Value", "", "", "", "", "", { f: "SUM(G3:G6)" }, ""]
  ];
}

function selectRows(request: string) {
  const normalized = normalizeText(request);
  if (/project|progress|schedule|杩涘害|椤圭洰/.test(normalized)) return { sheetName: "Project Progress", rows: projectWorkbookRows() };
  if (/budget|cost|expense|棰勭畻|璐圭敤|鎴愭湰/.test(normalized)) return { sheetName: "Budget", rows: budgetWorkbookRows() };
  if (/customer|client|follow|crm|瀹㈡埛|璺熻繘/.test(normalized)) return { sheetName: "Customers", rows: customerWorkbookRows() };
  return { sheetName: "Sales Statistics", rows: salesWorkbookRows() };
}

export function createSpreadsheet(options: SpreadsheetGenerationOptions): Buffer {
  const { sheetName, rows } = selectRows(`${options.title || ""} ${options.request}`);
  const workbook = XLSX.utils.book_new();
  const mainSheet = aoaToSheet(rows);
  XLSX.utils.book_append_sheet(workbook, mainSheet, cleanSheetName(sheetName));

  const summaryRows = [
    ["Workbook Summary"],
    ["Request", options.request],
    ["Primary Sheet", sheetName],
    ["Generated At", new Date().toISOString()],
    ["Notes", "Formulas are kept in Excel so the workbook can recalculate when source data changes."]
  ];
  const summarySheet = aoaToSheet(summaryRows);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer", compression: true }) as Buffer;
}
