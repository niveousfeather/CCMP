import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as XLSX from "xlsx";

import { runAgent } from "../lib/agent/router";

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

  const createResult = await runAgent({
    userId: "excel-agent-e2e",
    messages: [{ role: "user", content: "帮我生成一个销售统计 Excel，包含利润率和汇总" }],
    files: [],
    signal: new AbortController().signal
  });

  assert(createResult.agentTask?.type === "create_spreadsheet", `Expected create_spreadsheet task, got ${createResult.agentTask?.type}`);
  assert(createResult.generatedFiles[0]?.fileName.endsWith(".xlsx"), "Expected generated xlsx");
  const createdPath = resolveMockStorageUrl(createResult.generatedFiles[0].url || "");
  assert(existsSync(createdPath), "Expected generated xlsx path");

  const sourceBuffer = readFileSync(createdPath);
  const file = new File([new Uint8Array(sourceBuffer)], "created-sales.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const modifyResult = await runAgent({
    userId: "excel-agent-e2e",
    messages: [{ role: "user", content: "给这个 Excel 加一列利润率并新增汇总 Sheet" }],
    files: [file],
    signal: new AbortController().signal
  });

  assert(modifyResult.agentTask?.type === "create_spreadsheet", `Expected modify spreadsheet task, got ${modifyResult.agentTask?.type}`);
  assert(modifyResult.generatedFiles[0]?.fileName.endsWith(".xlsx"), "Expected modified xlsx");
  const modifiedPath = resolveMockStorageUrl(modifyResult.generatedFiles[0].url || "");
  const workbook = XLSX.read(readFileSync(modifiedPath), { type: "buffer", cellFormula: true });
  assert(workbook.SheetNames.some((name) => name.startsWith("Summary")), "Expected summary sheet");
  assert(JSON.stringify(workbook.Sheets[workbook.SheetNames[0]]).includes("Profit Margin"), "Expected profit margin column");

  console.log(JSON.stringify({ ok: true, createFile: createResult.generatedFiles[0].fileName, modifyFile: modifyResult.generatedFiles[0].fileName, sheets: workbook.SheetNames }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
