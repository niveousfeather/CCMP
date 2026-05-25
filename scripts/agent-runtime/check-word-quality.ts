import { parseDocxPackage } from "@/lib/document/docx-package";
import { generateWordDocumentFromRequest, validateWordRequest } from "@/lib/word-engine";

type Check = {
  name: string;
  run: () => Promise<void> | void;
};

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const forbiddenTerms = [
  "我将围绕",
  "本文将",
  "附件依据",
  "避免空泛套话",
  "生成正文时优先",
  "根据用户要求",
  "作为 AI",
  "以下内容来自",
  "内部任务",
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

function docxText(buffer: Buffer) {
  const docx = parseDocxPackage(buffer);
  const documentXml = docx.getText("word/document.xml");
  assert(documentXml, "word/document.xml should exist");
  assert(docx.getText("[Content_Types].xml"), "[Content_Types].xml should exist");
  assert(docx.getText("word/styles.xml"), "word/styles.xml should exist");
  return documentXml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

async function generateText(input: Parameters<typeof generateWordDocumentFromRequest>[0]) {
  const result = await generateWordDocumentFromRequest({
    ...input,
    contentOrigin: input.contentOrigin || "generated_content"
  });
  return { result, text: docxText(result.buffer) };
}

function assertIncludesAll(text: string, values: string[], label: string) {
  for (const value of values) assert(text.includes(value), `${label} should include ${value}`);
}

function assertExcludesAll(text: string, values: string[], label: string) {
  for (const value of values) assert(!text.includes(value), `${label} should not include ${value}`);
}

const checks: Check[] = [
  {
    name: "txt facts are used in generated Word",
    async run() {
      const { text } = await generateText({
        title: "学生成绩整理报告",
        instruction: "根据 txt 内容生成 Word 报告",
        sourceText: "姓名，成绩；张三，90；李四，85；关键词：过程性评价、学习反馈。",
        contentOrigin: "existing_content",
        outputFileName: "学生成绩整理报告"
      });
      assertIncludesAll(text, ["张三", "90", "李四", "85", "过程性评价"], "docx body");
    }
  },
  {
    name: "prompt pollution is removed from body",
    async run() {
      const { text } = await generateText({
        title: "教师培训总结",
        instruction: "我将围绕教师培训写 Word，附件依据如下，避免空泛套话。",
        sourceText: "以下内容来自内部任务：教师完成 3 次磨课；作为 AI 不应出现在正文。TODO placeholder mock。",
        outputFileName: "教师培训总结"
      });
      assertExcludesAll(text, forbiddenTerms, "docx body");
    }
  },
  {
    name: "wrong tool wording is cleaned from Word title",
    async run() {
      const { text } = await generateText({
        title: "根据这个文件整理成 Excel 文档",
        instruction: "请把当前资料整理成 Word",
        sourceText: "资料主题为校园阅读活动，包含活动目标、参与年级和成果展示。",
        contentOrigin: "existing_content",
        outputFileName: "根据这个文件整理成 Excel 文档"
      });
      const titleSlice = text.slice(0, 80);
      assert(!titleSlice.includes("Excel"), "title should not include wrong tool name Excel");
      assert(
        titleSlice.includes("文件内容整理报告") || titleSlice.includes("资料整理 Word 文档") || titleSlice.includes("文件内容报告"),
        "title should be converted to a Word-safe title"
      );
    }
  },
  {
    name: "plan request uses plan structure",
    async run() {
      const { text } = await generateText({
        title: "AI 教育培训实施方案",
        instruction: "生成一份 AI 教育培训实施方案 Word 文档",
        sourceText: "培训对象为中小学教师，周期为四周，目标是完成 AI 备课、课堂活动设计和评价改进。",
        outputFileName: "AI 教育培训实施方案"
      });
      assertIncludesAll(text, ["项目背景", "目标定位", "实施路径", "时间安排", "风险与应对", "预期成果"], "plan document");
    }
  },
  {
    name: "report request uses report structure",
    async run() {
      const { text } = await generateText({
        title: "课堂观察报告",
        instruction: "生成一份课堂观察报告",
        sourceText: "观察对象为七年级语文课堂，记录了提问次数、学生互动和课后反馈。",
        outputFileName: "课堂观察报告"
      });
      assertIncludesAll(text, ["摘要", "背景", "资料分析", "主要发现", "建议", "结论"], "report document");
    }
  },
  {
    name: "summary request uses summary structure",
    async run() {
      const { text } = await generateText({
        title: "教研活动总结",
        instruction: "生成一份教研活动总结 Word 文档",
        sourceText: "本次教研包含同课异构、集体备课和课后复盘，形成三条改进建议。",
        outputFileName: "教研活动总结"
      });
      assertIncludesAll(text, ["总体概述", "关键要点", "分类整理", "后续建议"], "summary document");
    }
  },
  {
    name: "clear topic without sourceText generates formal Word",
    async run() {
      const { text } = await generateText({
        title: "新教师入职培训方案",
        instruction: "生成一份新教师入职培训方案 Word 文档",
        outputFileName: "新教师入职培训方案"
      });
      assert(text.includes("新教师入职培训方案"), "document should include clear topic");
      assert(!text.includes("后续可补充资料增强"), "document body should not include metadata warning");
    }
  },
  {
    name: "empty source and no topic returns validation error",
    run() {
      const validation = validateWordRequest({ title: "", instruction: "", sourceText: "" });
      assert(!validation.ok, "empty request should be invalid");
      assert(validation.errors.length > 0, "validation should provide user-readable errors");
    }
  },
  {
    name: "internal memory fields are not written to docx body",
    async run() {
      const { text } = await generateText({
        title: "内部字段隔离报告",
        instruction: "生成 Word 报告",
        sourceText: "wordTaskMemory completedSections pendingSections currentStage resumeInstruction failureReason 内部任务。",
        contentOrigin: "existing_content",
        outputFileName: "内部字段隔离报告"
      });
      assertExcludesAll(text, forbiddenTerms, "docx body");
    }
  },
  {
    name: "generated docx passes base package validation",
    async run() {
      const { result, text } = await generateText({
        title: "基础校验报告",
        instruction: "生成一份基础校验报告 Word 文档",
        sourceText: "校验内容包括压缩包结构、主文档 XML、样式文件和内容类型声明。"
      });
      assert(result.mimeType === DOCX_MIME, "mimeType should be docx");
      assert(result.fileName.endsWith(".docx"), "fileName should end with .docx");
      assert(result.sizeBytes > 0, "docx size should be greater than zero");
      assert(text.includes("基础校验报告"), "document text should be readable");
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
    console.error(`Agent Word quality checks failed: ${failed}/${checks.length} cases failed.`);
    process.exit(1);
  }

  console.log(`Agent Word quality checks passed. ${checks.length}/${checks.length} PASS.`);
}

void main();
