import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import JSZip from "jszip";
import * as XLSX from "xlsx";

import {
  buildWorkbookBlueprintFromRequest,
  generateXlsxFile,
  modifyXlsxFile,
  parseXlsxBuffer,
  validateWorkbookBlueprint
} from "@/lib/excel-engine";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function inspectPackage(filePath: string) {
  const buffer = await readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const workbook = XLSX.read(buffer, { type: "buffer", cellFormula: true, cellStyles: true });
  const firstSheetXml = await zip.file("xl/worksheets/sheet1.xml")?.async("string");
  const stylesXml = await zip.file("xl/styles.xml")?.async("string");
  return { buffer, workbook, firstSheetXml: firstSheetXml || "", stylesXml: stylesXml || "" };
}

async function runCase(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function main() {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "agent-excel-engine-"));
  try {
    await runCase("文本数据生成 xlsx 且可读取", async () => {
      const blueprint = buildWorkbookBlueprintFromRequest({
        userText: "把这些数据导出成Excel：姓名，成绩；张三，90；李四，85"
      });
      validateWorkbookBlueprint(blueprint);
      const result = await generateXlsxFile({ blueprint, outputDir: tmpDir });
      assert(result.fileName.endsWith(".xlsx"), "file extension must be .xlsx");
      assert(result.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "unexpected mimeType");
      assert(result.sizeBytes > 0, "generated file is empty");
      assert(result.filePath, "expected generated filePath in tmp mode");

      const { workbook, firstSheetXml, stylesXml } = await inspectPackage(result.filePath);
      assert(workbook.SheetNames.length >= 1, "expected at least one sheet");
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "" });
      assert(JSON.stringify(rows).includes("姓名"), "expected header 姓名");
      assert(JSON.stringify(rows).includes("张三"), "expected row 张三");
      assert(/<b\/>/.test(stylesXml), "expected bold style in styles.xml");
      assert(/fgColor rgb=/.test(stylesXml), "expected fill color style");
      assert(/<border>/.test(stylesXml), "expected border style");
      assert(/<pane[^>]+state="frozen"/.test(firstSheetXml), "expected frozen pane");
      assert(/<autoFilter/.test(firstSheetXml), "expected autoFilter");
    });

    await runCase("多 sheet 与公式存在", async () => {
      const blueprint = buildWorkbookBlueprintFromRequest({
        userText: "生成一个班级成绩Excel，包含学生信息、成绩明细、统计汇总三个sheet"
      });
      const result = await generateXlsxFile({ blueprint, outputDir: tmpDir });
      assert(result.filePath, "expected generated filePath in tmp mode");
      const { workbook } = await inspectPackage(result.filePath);
      assert(workbook.SheetNames.length >= 3, `expected 3 sheets, got ${workbook.SheetNames.length}`);
      assert(Object.values(workbook.Sheets).some((sheet) => Object.values(sheet).some((cell: any) => cell?.f)), "expected formulas");
    });

    await runCase("空白模板包含公式列", async () => {
      const blueprint = buildWorkbookBlueprintFromRequest({
        userText: "帮我做一个学生成绩统计表，包含姓名、学号、语文、数学、英语、总分、平均分"
      });
      const result = await generateXlsxFile({ blueprint, outputDir: tmpDir });
      assert(result.filePath, "expected generated filePath in tmp mode");
      const { workbook } = await inspectPackage(result.filePath);
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "" });
      assert(JSON.stringify(rows).includes("总分"), "expected total score column");
      assert(JSON.stringify(rows).includes("平均分"), "expected average score column");
      assert(Object.values(workbook.Sheets[workbook.SheetNames[0]]).some((cell: any) => cell?.f?.includes("SUM")), "expected SUM formula");
    });

    await runCase("修改已有 xlsx 后能导出新版", async () => {
      const sourceBlueprint = buildWorkbookBlueprintFromRequest({
        userText: "把这些数据导出成Excel：姓名，语文，数学，英语；张三，90，80，70；李四，85，88，91"
      });
      const source = await generateXlsxFile({ blueprint: sourceBlueprint, outputDir: tmpDir });
      assert(source.filePath, "expected source filePath in tmp mode");
      const modified = await modifyXlsxFile({
        request: "把这个Excel增加一列平均分并导出新版",
        sourceFileName: source.fileName,
        sourceBuffer: await readFile(source.filePath),
        outputDir: tmpDir
      });
      assert(modified.fileName.endsWith(".xlsx"), "modified file extension must be .xlsx");
      assert(modified.sizeBytes > 0, "modified file is empty");
      assert(modified.filePath, "expected modified filePath in tmp mode");
      const parsed = parseXlsxBuffer(await readFile(modified.filePath));
      assert(parsed.sheetNames.length >= 1, "modified workbook should be readable");
      assert(parsed.sheets[0]?.headers.includes("平均分"), "modified workbook should include 平均分 column");
    });

    await runCase("文件名安全", async () => {
      const blueprint = buildWorkbookBlueprintFromRequest({
        userText: "把这些数据导出成Excel：姓名，成绩；张三，90",
        requestedFileName: "成绩统计:/?*"
      });
      const result = await generateXlsxFile({ blueprint, outputDir: tmpDir });
      assert(!/[\\/:*?"<>|]/.test(result.fileName), `unsafe fileName: ${result.fileName}`);
    });

    console.log("Agent Runtime V2 Excel Engine checks passed.");
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch(() => {
  process.exit(1);
});
