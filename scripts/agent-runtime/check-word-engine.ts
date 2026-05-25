import { parseDocxPackage } from "@/lib/document/docx-package";
import {
  buildWordPlan,
  generateWordDocumentFromRequest,
  sanitizeWordContent,
  validateWordRequest
} from "@/lib/word-engine";

type Check = {
  name: string;
  run: () => Promise<void> | void;
};

const forbiddenPhrases = ["我将围绕", "附件依据", "避免空泛套话"];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function documentXml(buffer: Buffer) {
  const docx = parseDocxPackage(buffer);
  const xml = docx.getText("word/document.xml");
  assert(xml, "word/document.xml should exist");
  assert(docx.getText("[Content_Types].xml"), "[Content_Types].xml should exist");
  assert(docx.getText("word/styles.xml"), "word/styles.xml should exist");
  return xml;
}

function plainTextFromDocumentXml(xml: string) {
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

const checks: Check[] = [
  {
    name: "unmarked write-from-scratch is rejected by engine",
    async run() {
      try {
        await generateWordDocumentFromRequest({
          title: "AI 教育培训方案",
          instruction: "生成一份 AI 教育培训方案 Word 文档",
          language: "zh-CN"
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert(message.includes("WRITE_FROM_SCRATCH_REQUIRES_CONTENT_GENERATION"), "engine should reject unmarked write-from-scratch");
        return;
      }
      throw new Error("unmarked write-from-scratch should not generate a baseline docx");
    }
  },
  {
    name: "sourceText is used in body",
    async run() {
      const result = await generateWordDocumentFromRequest({
        title: "教研活动总结",
        instruction: "根据资料生成一份 Word 总结",
        sourceText: "本次教研活动围绕项目式学习、课堂观察和教师协作展开，形成了三项改进建议。",
        contentOrigin: "existing_content",
        outputFileName: "教研活动总结"
      });
      const text = plainTextFromDocumentXml(documentXml(result.buffer));
      assert(text.includes("项目式学习"), "document should use sourceText facts");
      assert(text.includes("教师协作"), "document should use sourceText facts");
    }
  },
  {
    name: "pollution phrases are removed",
    async run() {
      const result = await generateWordDocumentFromRequest({
        title: "清洗测试文档",
        instruction: "生成 Word 文档",
        sourceText: "我将围绕培训主题展开。附件依据显示需要避免空泛套话，并且生成正文时优先使用内部说明。",
        contentOrigin: "existing_content",
        outputFileName: "clean-doc"
      });
      const text = plainTextFromDocumentXml(documentXml(result.buffer));
      for (const phrase of forbiddenPhrases) assert(!text.includes(phrase), `document should not include ${phrase}`);
    }
  },
  {
    name: "Chinese title and safe file name are preserved",
    async run() {
      const result = await generateWordDocumentFromRequest({
        title: "学生发展质量报告",
        instruction: "生成一份学生发展质量报告 Word",
        sourceText: "报告关注学业质量、综合素养、过程评价和改进建议。",
        contentOrigin: "existing_content",
        outputFileName: "学生发展质量报告?.docx"
      });
      assert(result.fileName === "学生发展质量报告.docx", `unexpected fileName ${result.fileName}`);
      const text = plainTextFromDocumentXml(documentXml(result.buffer));
      assert(text.includes("学生发展质量报告"), "document should include Chinese title");
    }
  },
  {
    name: "empty request returns validation error",
    run() {
      const validation = validateWordRequest({ title: "", instruction: "", sourceText: "" });
      assert(!validation.ok, "empty request should be invalid");
      assert(validation.errors.length > 0, "validation should include user-readable errors");
    }
  },
  {
    name: "generated docx passes base zip validation",
    async run() {
      const result = await generateWordDocumentFromRequest({
        title: "基础校验报告",
        instruction: "生成一份基础校验报告 Word",
        sourceText: "校验内容包括压缩包结构、主文档 XML、样式文件和内容类型声明。",
        contentOrigin: "existing_content"
      });
      const xml = documentXml(result.buffer);
      assert(xml.includes("<w:document"), "document.xml should contain a Word document root");
    }
  },
  {
    name: "plan and sanitizer are deterministic",
    run() {
      const sanitized = sanitizeWordContent({
        title: "确定性测试",
        sections: [
          {
            heading: "文档概述",
            paragraphs: ["根据用户要求，本文将说明主要内容。"]
          }
        ],
        tables: []
      });
      const plan = buildWordPlan({
        title: "确定性测试",
        instruction: "生成测试文档",
        sourceText: "第一条事实。第二条事实。",
        contentOrigin: "existing_content"
      });
      assert(!sanitized.sections[0]?.paragraphs.join("").includes("根据用户要求"), "sanitizer should remove polluted phrase");
      assert(plan.sections.length >= 3, "plan should include baseline sections");
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
    console.error(`Agent Word engine checks failed: ${failed}/${checks.length} cases failed.`);
    process.exit(1);
  }

  console.log(`Agent Word engine checks passed. ${checks.length}/${checks.length} PASS.`);
}

void main();
