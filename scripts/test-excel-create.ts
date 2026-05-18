import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as XLSX from "xlsx";

import { runSpreadsheetTask } from "../lib/agent/skills/create-spreadsheet";

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
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

  const result = await runSpreadsheetTask({
    userId: "excel-create-test",
    request: "帮我做一个销售统计 Excel，包含销售额、成本、利润率和汇总",
    requestedFileName: "sales_statistics_test"
  });

  assert(result.file.fileName.endsWith(".xlsx"), "Expected xlsx file name");
  assert(result.file.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Expected xlsx mime type");
  assert(result.file.sizeBytes > 1024, "Expected non-empty workbook");
  assert(result.file.url, "Expected downloadable URL");

  const outputPath = resolveMockStorageUrl(result.file.url || "");
  assert(existsSync(outputPath), `Expected generated workbook at ${outputPath}`);

  const workbook = XLSX.read(readFileSync(outputPath), { type: "buffer", cellFormula: true });
  assert(workbook.SheetNames.includes("Sales Statistics"), "Expected Sales Statistics sheet");
  assert(workbook.SheetNames.includes("Summary"), "Expected Summary sheet");

  const sheet = workbook.Sheets["Sales Statistics"];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  assert(JSON.stringify(rows).includes("Profit Margin"), "Expected Profit Margin header");
  assert(Object.values(sheet).some((cell: any) => cell?.f?.includes("SUM")), "Expected formulas in workbook");

  console.log(JSON.stringify({ ok: true, fileName: result.file.fileName, sheets: workbook.SheetNames }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
