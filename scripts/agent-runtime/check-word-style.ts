import { parseDocxPackage } from "@/lib/document/docx-package";
import { detectWordAttributes, generateWordDocumentFromRequest } from "@/lib/word-engine";
import type { WordRequest } from "@/lib/word-engine";

type Check = {
  name: string;
  run: () => Promise<void> | void;
};

const forbiddenTerms = [
  "我将围绕",
  "本文将",
  "附件依据",
  "避免空泛套话",
  "生成正文时优先",
  "根据用户要求",
  "作为 AI",
  "以下内容来自",
  "wordTaskMemory",
  "completedSections",
  "pendingSections",
  "currentStage",
  "resumeInstruction",
  "failureReason",
  "mock",
  "placeholder",
  "TODO"
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function docxParts(buffer: Buffer) {
  const docx = parseDocxPackage(buffer);
  const documentXml = docx.getText("word/document.xml") || "";
  assert(documentXml.includes("<w:document"), "word/document.xml should be readable");
  assert(docx.getText("[Content_Types].xml"), "[Content_Types].xml should exist");
  assert(docx.getText("word/styles.xml"), "word/styles.xml should exist");
  const text = documentXml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  return {
    docx,
    documentXml,
    stylesXml: docx.getText("word/styles.xml") || "",
    relsXml: docx.getText("word/_rels/document.xml.rels") || "",
    headerXml: docx.getText("word/header1.xml") || "",
    footerXml: docx.getText("word/footer1.xml") || "",
    text
  };
}

async function generate(request: WordRequest) {
  const result = await generateWordDocumentFromRequest(request);
  return { result, ...docxParts(result.buffer) };
}

function assertClean(text: string) {
  for (const term of forbiddenTerms) assert(!text.includes(term), `docx body should not include ${term}`);
}

const structuredScoreText = ["姓名,成绩", "张三,90", "李四,85", "说明：这是 AI 教育测试数据"].join("\n");

const checks: Check[] = [
  {
    name: "normal file to Word does not generate TOC",
    async run() {
      const request: WordRequest = {
        title: "资料整理 Word 文档",
        instruction: "根据这个文件整理成 Word 文档",
        sourceText: "项目背景：校内阅读活动。成果：形成三条改进建议。",
        outputFileName: "资料整理 Word 文档"
      };
      const attributes = detectWordAttributes(request, { sectionCount: 4, estimatedPageCount: 1 });
      assert(!attributes.needsToc, "normal file organization should not need a TOC");
      const { documentXml } = await generate(request);
      assert(!documentXml.includes("<w:t>目录</w:t>"), "normal file organization should not render a TOC heading");
    }
  },
  {
    name: "formal report with TOC renders static TOC",
    async run() {
      const request: WordRequest = {
        title: "AI 教育应用正式报告",
        instruction: "生成一份正式报告，带目录，主题是 AI 教育应用",
        sourceText: "AI 教育应用覆盖备课、课堂互动、作业反馈、学情分析和教师研修。",
        outputFileName: "AI 教育应用正式报告"
      };
      const attributes = detectWordAttributes(request, { sectionCount: 6, estimatedPageCount: 3 });
      assert(attributes.needsToc, "formal report with TOC should need a TOC");
      const { text } = await generate(request);
      assert(text.includes("目录"), "formal report should render a static TOC");
      assert(text.includes("摘要") || text.includes("背景"), "TOC document should include report sections");
    }
  },
  {
    name: "training plan renders header and footer",
    async run() {
      const { headerXml, footerXml, relsXml } = await generate({
        title: "AI 教育培训方案",
        instruction: "生成一份完整培训方案 Word 文档",
        sourceText: "培训对象为中小学教师，周期四周，目标是完成 AI 备课、课堂活动设计和评价改进。",
        outputFileName: "AI 教育培训方案"
      });
      assert(headerXml.includes("AI 教育培训方案"), "training plan should include title in header");
      assert(footerXml.includes("PAGE"), "training plan should include page number field in footer");
      assert(relsXml.includes("header1.xml"), "document relationships should include header");
      assert(relsXml.includes("footer1.xml"), "document relationships should include footer");
    }
  },
  {
    name: "simple summary keeps page footer without forced header",
    async run() {
      const { headerXml, footerXml, text } = await generate({
        title: "教研活动总结",
        instruction: "生成一份简单总结 Word 文档",
        sourceText: "本次教研包含同课异构、集体备课和课后复盘，形成三条改进建议。",
        outputFileName: "教研活动总结"
      });
      assert(!headerXml, "simple summary should not force a header");
      assert(footerXml.includes("PAGE"), "simple summary should keep base page footer");
      assert(!text.includes("目录"), "simple summary should not force a TOC");
    }
  },
  {
    name: "score data enters a table",
    async run() {
      const { documentXml, text } = await generate({
        title: "学生成绩整理报告",
        instruction: "根据这些姓名和成绩数据生成 Word 文档",
        sourceText: structuredScoreText,
        outputFileName: "学生成绩整理报告"
      });
      assert(documentXml.includes("<w:tbl>"), "structured score data should render a table");
      assert(text.includes("张三") && text.includes("李四") && text.includes("90") && text.includes("85"), "table should include score facts");
      assert(!text.includes("姓名,成绩"), "raw CSV header should not be dumped into prose");
    }
  },
  {
    name: "education theme uses blue",
    async run() {
      const attributes = detectWordAttributes({
        title: "AI 教育培训方案",
        instruction: "生成一份 AI 教育培训方案 Word 文档"
      });
      assert(attributes.theme === "blue", `education theme should be blue, got ${attributes.theme}`);
      const { documentXml, stylesXml } = await generate({
        title: "AI 教育培训方案",
        instruction: "生成一份 AI 教育培训方案 Word 文档",
        outputFileName: "AI 教育培训方案"
      });
      assert(documentXml.includes("2563EB") || stylesXml.includes("2563EB"), "blue theme color should be written to docx XML");
    }
  },
  {
    name: "data and score theme uses green",
    async run() {
      const attributes = detectWordAttributes({
        title: "学生成绩统计报告",
        instruction: "根据成绩数据生成 Word 报告",
        sourceText: structuredScoreText
      });
      assert(attributes.theme === "green", `data theme should be green, got ${attributes.theme}`);
      const { documentXml, stylesXml } = await generate({
        title: "学生成绩统计报告",
        instruction: "根据成绩数据生成 Word 报告",
        sourceText: structuredScoreText,
        outputFileName: "学生成绩统计报告"
      });
      assert(documentXml.includes("16A34A") || stylesXml.includes("16A34A"), "green theme color should be written to docx XML");
    }
  },
  {
    name: "wrong tool title is cleaned for Word",
    async run() {
      const attributes = detectWordAttributes({
        title: "根据这个文件整理成 Excel 文档",
        instruction: "当前实际生成 Word 文档",
        sourceText: "资料主题为校园阅读活动，包含活动目标、参与年级和成果展示。"
      });
      assert(attributes.titleStrategy === "cleaned_generic", "wrong tool title should use cleaned generic strategy");
      const { text } = await generate({
        title: "根据这个文件整理成 Excel 文档",
        instruction: "当前实际生成 Word 文档",
        sourceText: "资料主题为校园阅读活动，包含活动目标、参与年级和成果展示。",
        outputFileName: "根据这个文件整理成 Excel 文档"
      });
      assert(!text.slice(0, 120).includes("Excel"), "Word title should not include Excel");
    }
  },
  {
    name: "docx body stays clean",
    async run() {
      const { text } = await generate({
        title: "内部字段隔离报告",
        instruction: "生成 Word 报告",
        sourceText: "wordTaskMemory completedSections pendingSections currentStage resumeInstruction failureReason mock placeholder TODO 我将围绕 附件依据 作为 AI",
        outputFileName: "内部字段隔离报告"
      });
      assertClean(text);
    }
  },
  {
    name: "generated docx passes base open validation",
    async run() {
      const { result, documentXml, footerXml } = await generate({
        title: "基础打开校验报告",
        instruction: "生成一份基础打开校验报告 Word 文档",
        sourceText: "校验内容包括压缩包结构、主文档 XML、样式文件、页眉页脚和内容类型声明。",
        outputFileName: "基础打开校验报告"
      });
      assert(result.fileName.endsWith(".docx"), "fileName should end with .docx");
      assert(result.sizeBytes > 0, "docx size should be greater than zero");
      assert(documentXml.includes("<w:document"), "document.xml should contain a Word document root");
      assert(footerXml.includes("PAGE"), "footer should include page number field");
    }
  }
];

async function main() {
  let failed = 0;

  for (const check of checks) {
    try {
      await check.run();
      console.log(`PASS ${check.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${check.name}`);
      console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failed > 0) {
    console.error(`Agent Word style checks failed: ${failed}/${checks.length} cases failed.`);
    process.exit(1);
  }

  console.log(`Agent Word style checks passed. ${checks.length}/${checks.length} PASS.`);
}

void main();
