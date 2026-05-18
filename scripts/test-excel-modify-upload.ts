import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as XLSX from "xlsx";

import { runSpreadsheetTask } from "../lib/agent/skills/create-spreadsheet";

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function createSourceWorkbook() {
  const workbook = XLSX.utils.book_new();
  const rows = [
    ["Sales Data"],
    ["Date", "Product", "Sales Amount", "Cost", "Status"],
    ["2026-05-03", "A", 1000, 700, "Completed"],
    ["2026-05-01", "B", 1500, 900, "In Progress"],
    ["2026-05-02", "C", 800, 500, "Completed"]
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sales");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Owner"], ["Finance"]]), "Meta");
  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer", compression: true }) as Buffer;
}

function resolveMockStorageUrl(url: string) {
  assert(url.startsWith("/mock-storage/"), `Expected mock storage URL, got ${url}`);
  return resolve(process.cwd(), "public", url.replace(/^\//, ""));
}

async function main() {
  process.env.ALLOW_LOCAL_STORAGE_FALLBACK = "true";
  process.env.ALI_OSS_BUCKET = "";
  process.env.ALI_OSS_ACCESS_KEY_ID = "";
  process.env.ALI_OSS_ACCESS_KEY_SECRET = "";
  process.env.ALI_OSS_ENDPOINT = "";

  const source = createSourceWorkbook();
  const file = new File([new Uint8Array(source)], "sales-source.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const result = await runSpreadsheetTask({
    userId: "excel-modify-test",
    request: "给这个 Excel 新增一列利润率，把销售额求和，并新增一个汇总 Sheet",
    file,
    requestedFileName: "modified_sales_test"
  });

  assert(result.file.fileName.endsWith(".xlsx"), "Expected modified xlsx file");
  assert(result.changes.some((change) => change.includes("Profit Margin")), "Expected profit margin change");
  assert(result.changes.some((change) => change.includes("Summary")), "Expected summary sheet change");

  const outputPath = resolveMockStorageUrl(result.file.url || "");
  assert(existsSync(outputPath), `Expected modified workbook at ${outputPath}`);

  const workbook = XLSX.read(readFileSync(outputPath), { type: "buffer", cellFormula: true });
  assert(workbook.SheetNames.includes("Sales"), "Expected original Sales sheet to remain");
  assert(workbook.SheetNames.includes("Meta"), "Expected original Meta sheet to remain");
  assert(workbook.SheetNames.some((name) => name.startsWith("Summary")), "Expected summary sheet");

  const salesRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Sales"], { header: 1, defval: null });
  assert(JSON.stringify(salesRows).includes("Profit Margin"), "Expected new Profit Margin column");
  assert(Object.values(workbook.Sheets["Sales"]).some((cell: any) => cell?.f?.includes("IFERROR")), "Expected profit margin formulas");

  console.log(JSON.stringify({ ok: true, fileName: result.file.fileName, sheets: workbook.SheetNames, changes: result.changes }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
