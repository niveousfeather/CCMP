import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { createDocxBuffer } from "@/lib/document/create";
import { exportWordVisualPreviews } from "./export-word-visual-preview";

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

async function main() {
  const outputRoot = resolve(process.cwd(), "tmp", "word-visual-preview-test");
  mkdirSync(outputRoot, { recursive: true });
  const docxPath = join(outputRoot, "visual-preview-source.docx");
  const markdown = `WORD_DOCUMENT_PLAN_JSON
${JSON.stringify({
  title: "视觉预览验收文档",
  subtitle: "LibreOffice headless 导出路径",
  documentType: "report",
  sections: [
    {
      heading: "一、验收背景",
      level: 1,
      intro: "本文档用于验证 Word 可视化预览脚本在有转换工具和缺少转换工具两种环境下都能稳定工作。",
      blocks: [
        { type: "paragraph", text: "脚本不会参与 Word 主生成链路，只用于将已生成的 DOCX 输出为 PDF 或 PNG，方便人工肉眼检查标题、段距、表格和页码。" }
      ]
    },
    {
      heading: "二、表格检查",
      level: 1,
      intro: "表格页用于检查表头、列宽和单元格内容是否保持清晰。",
      blocks: [
        {
          type: "table",
          headers: ["检查项", "期望", "结论"],
          rows: [
            ["标题层级", "一级标题清楚", "待人工查看"],
            ["表格列宽", "长文本列不拥挤", "待人工查看"],
            ["页码", "页脚显示页码", "待人工查看"]
          ]
        }
      ]
    },
    {
      heading: "三、人工结论",
      level: 1,
      intro: "若本机缺少 LibreOffice 或 Poppler，脚本应生成 manifest 和人工检查清单，而不是让 Word 功能测试失败。",
      blocks: [{ type: "checklist", items: ["打开 DOCX 或预览 PDF", "检查首页", "检查表格页", "确认无平台署名"] }]
    }
  ]
})}`;

  writeFileSync(docxPath, createDocxBuffer({ markdown, prompt: "生成一个 Word 视觉预览验收文档", template: "report", title: "视觉预览验收文档" }));

  const manifest = await exportWordVisualPreviews({
    docxPaths: [docxPath],
    enableConversion: false,
    outputDir: join(outputRoot, "preview")
  });

  assert(existsSync(join(outputRoot, "preview", "manifest.json")), "Preview manifest should be written.");
  assert(existsSync(join(outputRoot, "preview", "manual-review-checklist.md")), "Manual review checklist should be written.");
  assert(manifest.results.length === 1, "Expected one preview result.");
  const result = manifest.results[0];
  assert(result.structuralSummary.tableCount >= 1, "Structural summary should count tables.");
  assert(result.structuralSummary.footerReference, "Preview source should include a footer reference.");
  assert(result.structuralSummary.pageField, "Preview source should include a page field.");
  assert(!result.structuralSummary.platformSignature, "Preview source should not include a platform signature.");

  if (manifest.status === "images") {
    assert(result.imagePaths.length > 0, "Image preview status should include PNG paths.");
    assert(result.imagePaths.every((path) => existsSync(path)), "PNG preview paths should exist.");
  } else if (manifest.status === "pdf_only") {
    assert(Boolean(result.pdfPath && existsSync(result.pdfPath)), "PDF-only status should include a PDF path.");
  } else {
    assert(
      result.diagnostics.some((item) => item.includes("Visual conversion disabled")),
      `Skipped preview should explain missing converter: ${result.diagnostics.join(" | ")}`
    );
  }

  console.log(JSON.stringify({
    ok: true,
    status: manifest.status,
    tools: manifest.tools,
    diagnostics: result.diagnostics,
    outputDir: manifest.outputDir
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
