import { readFile } from "node:fs/promises";

import { parseDocxPackage } from "@/lib/document/docx-package";
import { generateDocx } from "@/lib/word-engine/generate-docx";
import { normalizeDocumentFileBase, normalizeDocumentTitle } from "@/lib/word-engine/normalize-document-title";
import { normalizeDocumentStructure, type NormalizedDocumentBlock } from "@/lib/word-engine/normalize-document-structure";
import type { WordContent, WordRequest, WordTaskMemory, WordTable } from "@/lib/word-engine/types";

type Check = {
  name: string;
  run: () => Promise<void> | void;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const sampleSections = [
  {
    heading: "课程基本信息",
    paragraphs: ["一、课程基本信息 课题：寓言故事阅读与表达 学科：小学语文 年级：四年级 课时：1课时 教学资源：课文、朗读音频、生字词卡片。"]
  },
  {
    heading: "学情分析",
    paragraphs: ["二、学情分析 四年级学生已经具备初步朗读课文和抓关键词阅读的经验，但概括寓意和联系生活表达还需要支架。"]
  },
  {
    heading: "教学目标",
    paragraphs: [
      "1. 知识与能力目标 （1）能正确、流利、有感情地朗读课文。 （2）能抓住重点语句理解寓意。 2. 过程与方法目标 （1）通过圈画关键词、同伴交流和板书梳理完成阅读理解。 3. 情感态度与价值观目标 （1）联系生活说出自己的启发。"
    ]
  },
  {
    heading: "教学重点与难点",
    paragraphs: ["教学重点：朗读课文，理解生字词和寓言内容。 教学难点：结合重点语句体会寓意，并能迁移表达。"]
  },
  {
    heading: "教学过程设计",
    paragraphs: [
      "（一）激趣导入，揭示学习任务 教师活动：出示寓言插图，引导学生朗读课文题目。 学生活动：观察图片，说出初步理解。 设计意图：激发阅读兴趣，明确学习任务。 时间安排：5分钟。 （二）初读课文，整体感知 教师活动：组织学生朗读课文，提示标出生字词。 学生活动：朗读课文，圈画关键词。 设计意图：整体把握文本内容。 时间安排：10分钟。"
    ]
  },
  { heading: "课堂练习", paragraphs: ["完成生字词认读、重点句朗读和阅读理解小练习，教师即时反馈。"] },
  { heading: "作业设计", paragraphs: ["作业内容：朗读课文给家人听，并写一句从寓言中得到的启发。 评价方式：检查朗读流利度和表达完整度。"] },
  { heading: "板书设计", paragraphs: ["板书要点：课题、生字词、主要情节、寓意、阅读方法。"] },
  { heading: "教学反思", paragraphs: ["关注学生朗读参与度、阅读理解证据和语言积累效果，下一课继续强化表达。"] },
  { heading: "资料来源与参考摘要", paragraphs: ["明确文档目标 补充关键事实 形成可执行结论"] }
];

const processTable: WordTable = {
  title: "教学过程设计表",
  headers: ["教学环节", "教师活动", "学生活动", "设计意图", "时间安排"],
  rows: [
    ["激趣导入", "出示寓言插图并提出朗读任务", "观察图片并朗读课题", "激发阅读兴趣", "5分钟"],
    ["初读课文", "范读并指导标出生字词", "朗读课文并圈画关键词", "整体感知文本", "10分钟"]
  ]
};

const infoTable: WordTable = {
  title: "教案基础信息表",
  headers: ["项目", "内容"],
  rows: [
    ["课程名称", "小学四年级语文"],
    ["授课对象", "小学四年级"],
    ["课时安排", "1课时"],
    ["教材 / 内容", "寓言故事阅读与表达"],
    ["教学资源", "课文、朗读音频、生字词卡片"]
  ]
};

function sampleBlocks() {
  return normalizeDocumentStructure({
    title: "小学四年级语文教案",
    documentKind: "lesson_plan",
    sections: sampleSections,
    tables: [infoTable, processTable]
  }).blocks;
}

function textBlocks(blocks = sampleBlocks()) {
  return blocks.map((block) => (block.type === "heading" ? block.text : block.type === "paragraph" ? block.text : block.type === "list" ? block.items.join(" ") : `${block.headers.join(" ")} ${block.rows.flat().join(" ")}`)).join("\n");
}

function findHeading(blocks: NormalizedDocumentBlock[], text: string) {
  return blocks.find((block) => block.type === "heading" && block.text.includes(text));
}

function isHeadingBlock(block: NormalizedDocumentBlock): block is Extract<NormalizedDocumentBlock, { type: "heading" }> {
  return block.type === "heading";
}

function blocksAfterHeading(blocks: NormalizedDocumentBlock[], text: string) {
  const index = blocks.findIndex((block) => block.type === "heading" && block.text.includes(text));
  assert(index >= 0, `missing heading ${text}`);
  return blocks.slice(index + 1);
}

function generatedDocx() {
  const content: WordContent = {
    title: "小学四年级语文教案",
    subtitle: "课程教案",
    sections: sampleSections,
    tables: [infoTable, processTable],
    attributes: {
      documentKind: "lesson_plan",
      formality: "formal",
      needsToc: true,
      needsHeaderFooter: true,
      needsTables: true,
      theme: "blue",
      titleStrategy: "from_user"
    }
  };
  const request: WordRequest = {
    taskId: "format-preview-test",
    conversationId: "format-preview-test",
    title: "小学四年级语文教案",
    instruction: "帮我生成一个小学四年级语文教案",
    contentOrigin: "generated_content",
    outputFileName: "小学四年级语文教案",
    stylePreset: "formal"
  };
  const memory: WordTaskMemory = {
    taskId: request.taskId,
    conversationId: request.conversationId || "format-preview-test",
    originalInstruction: request.instruction,
    title: request.title,
    sourceFileNames: [],
    sourceSummary: "",
    plan: null,
    completedSections: [],
    pendingSections: [],
    currentStage: "rendering_docx",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  return generateDocx({ content, request, warnings: [], wordTaskMemory: memory });
}

function docxParts() {
  const result = generatedDocx();
  const docx = parseDocxPackage(result.buffer);
  const documentXml = docx.getText("word/document.xml") || "";
  const coreXml = docx.getText("docProps/core.xml") || "";
  const text = documentXml.replace(/<[^>]+>/g, "");
  return { result, documentXml, coreXml, text };
}

const checks: Check[] = [
  { name: "level-one headings are not duplicated", run: () => assert(sampleBlocks().filter((block) => block.type === "heading" && block.text.includes("课程基本信息")).length === 1, "课程基本信息 should appear once as a heading") },
  { name: "course basic info body removes repeated heading", run: () => assert(!blocksAfterHeading(sampleBlocks(), "课程基本信息").slice(0, 3).some((block) => block.type === "paragraph" && /^一、课程基本信息/.test(block.text)), "body should not repeat 一、课程基本信息") },
  { name: "student analysis body removes repeated heading", run: () => assert(!blocksAfterHeading(sampleBlocks(), "学情分析").slice(0, 3).some((block) => block.type === "paragraph" && /^二、学情分析/.test(block.text)), "body should not repeat 二、学情分析") },
  { name: "level-one numbering is structural", run: () => assert(Boolean(findHeading(sampleBlocks(), "一、课程基本信息")) && Boolean(findHeading(sampleBlocks(), "二、学情分析")), "level-one headings should use Chinese numbering") },
  { name: "toc has no duplicate items", run: () => { const levelOne = sampleBlocks().filter(isHeadingBlock).filter((block) => block.level === 1).map((block) => block.text); assert(new Set(levelOne).size === levelOne.length, "level-one headings should be unique"); } },
  { name: "toc only uses high-level headings", run: () => assert(sampleBlocks().filter(isHeadingBlock).filter((block) => block.level <= 2).every((block) => !/教师活动|学生活动|设计意图/.test(block.text)), "role labels should not enter TOC candidates") },
  { name: "qa residue is removed", run: () => assert(!/明确文档目标|补充关键事实|形成可执行结论/.test(textBlocks()), "QA residue should be removed") },
  { name: "numeric goal heading stands alone", run: () => assert(Boolean(findHeading(sampleBlocks(), "1. 知识与能力目标")), "numeric goal heading should be a heading block") },
  { name: "bracket numeric content is list item", run: () => assert(sampleBlocks().some((block) => block.type === "list" && block.items.some((item) => item.includes("能正确、流利"))), "（1） content should become list item") },
  { name: "chinese bracket heading stands alone", run: () => assert(Boolean(findHeading(sampleBlocks(), "（一）激趣导入")), "（一） heading should be standalone") },
  { name: "teacher activity is separated", run: () => assert(sampleBlocks().some((block) => block.type === "heading" && block.text === "教师活动：") || sampleBlocks().some((block) => block.type === "table" && block.headers.includes("教师活动")), "教师活动 should be separated") },
  { name: "student activity is separated", run: () => assert(sampleBlocks().some((block) => block.type === "heading" && block.text === "学生活动：") || sampleBlocks().some((block) => block.type === "table" && block.headers.includes("学生活动")), "学生活动 should be separated") },
  { name: "design intention is separated", run: () => assert(sampleBlocks().some((block) => block.type === "heading" && block.text === "设计意图：") || sampleBlocks().some((block) => block.type === "table" && block.headers.includes("设计意图")), "设计意图 should be separated") },
  { name: "lesson process table has expected headers", run: () => assert(sampleBlocks().some((block) => block.type === "table" && ["教学环节", "教师活动", "学生活动", "设计意图", "时间安排"].every((header) => block.headers.includes(header))), "process table should have expected headers") },
  { name: "table cells are nonempty and wrap-safe", run: () => assert(sampleBlocks().some((block) => block.type === "table" && block.rows.every((row) => row.every((cell) => cell.trim().length > 0 && cell.length < 520))), "table cells should be nonempty and bounded") },
  { name: "paragraphs are reasonably split", run: () => assert(sampleBlocks().filter((block) => block.type === "paragraph").every((block) => block.text.length <= 260), "paragraphs should be reasonably split") },
  { name: "docx metadata title is normalized", run: () => assert(docxParts().coreXml.includes("小学四年级语文教案"), "core title should use normalized title") },
  { name: "docx filename is normalized", run: () => assert(generatedDocx().fileName === "小学四年级语文教案.docx", `unexpected fileName ${generatedDocx().fileName}`) },
  { name: "preview hides user-input source hint", async run() { const source = await readFile("components/chat/DeepWritingPanel.tsx", "utf8"); assert(!source.includes("当前基于用户输入"), "preview should not display user-input source hint"); } },
  { name: "preview hides missing search hint", async run() { const source = await readFile("components/chat/DeepWritingPanel.tsx", "utf8"); assert(!source.includes("未检测到可用的自建搜索"), "preview should not display missing search hint"); } },
  { name: "preview hides source debug area", async run() { const source = await readFile("components/chat/DeepWritingPanel.tsx", "utf8"); assert(!source.includes("资料摘要") && !source.includes("source debug"), "preview should not render source debug"); } },
  { name: "preview renders normalized blocks", async run() { const source = await readFile("components/chat/DeepWritingPanel.tsx", "utf8"); assert(source.includes("normalizedBlocks") && source.includes("DocumentBlocks"), "preview should render normalized blocks"); } },
  { name: "preview text wraps", async run() { const source = await readFile("components/chat/DeepWritingPanel.tsx", "utf8"); assert(source.includes("break-words") && source.includes("whitespace-pre-wrap"), "preview should include wrapping classes"); } },
  { name: "preview panel has resize handle", async run() { const source = await readFile("components/chat/DeepWritingPanel.tsx", "utf8"); assert(source.includes("cursor-col-resize") && source.includes("deepWritingPanelWidth"), "panel should support resizing"); } },
  { name: "download button uses panel downloadUrl", async run() { const source = await readFile("components/chat/DeepWritingPanel.tsx", "utf8"); assert(source.includes("href={panel?.downloadUrl}") && source.includes("download"), "download should use panel downloadUrl"); } },
  { name: "download button disabled before completion", async run() { const source = await readFile("components/chat/DeepWritingPanel.tsx", "utf8"); assert(source.includes("canDownload") && source.includes('aria-disabled="true"'), "download should be disabled before completion"); } },
  { name: "completed download href is valid", async run() { const source = await readFile("components/chat/deep-writing-panel-state.ts", "utf8"); assert(source.includes("downloadUrl: taskCard.downloadUrl") || source.includes("downloadUrl: readString(payload.downloadUrl)"), "completed panel should receive downloadUrl"); } },
  { name: "script reports exact pass count", run: () => assert(checks.length === 28, `expected 28 checks, got ${checks.length}`) }
];

async function main() {
  let passed = 0;
  const failures: string[] = [];
  for (const check of checks) {
    try {
      await check.run();
      passed += 1;
    } catch (error) {
      failures.push(`${check.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length) {
    console.error(failures.map((failure) => `FAIL ${failure}`).join("\n"));
    console.error(`Word format preview checks failed. ${passed}/${checks.length} PASS.`);
    process.exit(1);
  }

  console.log(`Word format preview checks passed. ${passed}/${checks.length} PASS.`);
}

void main();
