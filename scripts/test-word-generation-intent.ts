import { runAgent } from "@/lib/agent/router";
import { createDocxBuffer } from "@/lib/document/create";
import { parseDocxPackage } from "@/lib/document/docx-package";
import { buildWordDocumentPlan, extractWordGenerationIntent } from "@/lib/document/plan";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function docxText(buffer: Buffer) {
  return parseDocxPackage(buffer).getText("word/document.xml") || "";
}

function resolveMockStorageUrl(url: string) {
  assert(url.startsWith("/mock-storage/"), `Expected mock storage URL, got ${url}`);
  return resolve(process.cwd(), "public", url.replace(/^\//, ""));
}

function assertContainsAll(text: string, expected: string[]) {
  for (const value of expected) {
    assert(text.includes(value), `Expected generated Word content to include ${value}`);
  }
}

async function main() {
  const prompt = "给我一份三维动画教学课程，第一章节动画规律的教案";
  const expectedTerms = ["三维动画", "第一章节", "动画规律", "关键帧", "运动规律", "缓入缓出", "挤压拉伸", "教学过程"];

  const intent = extractWordGenerationIntent(prompt);
  assert(intent.documentType === "lesson_plan", `Expected lesson_plan intent, got ${intent.documentType}`);
  assert(intent.topic === "三维动画教学课程", `Expected topic to preserve requested course, got ${intent.topic}`);
  assert(intent.chapter === "第一章节", `Expected 第一章节, got ${intent.chapter}`);
  assert(intent.scope === "动画规律", `Expected 动画规律, got ${intent.scope}`);
  assertContainsAll(intent.requirements.join("\n"), ["关键帧", "运动规律", "动画节奏", "缓入缓出", "挤压拉伸"]);

  const plan = buildWordDocumentPlan({ markdown: prompt, title: prompt, template: "lesson_plan" });
  const planText = JSON.stringify(plan);
  assertContainsAll(planText, expectedTerms);
  for (const heading of ["课程基本信息", "教学目标", "教学重点与难点", "教学准备", "教学过程", "教学评价", "课后作业", "教学反思"]) {
    assert(plan.sections.some((section) => section.heading.includes(heading)), `Expected lesson section ${heading}`);
  }

  const lessonBuffer = createDocxBuffer({ markdown: prompt, title: prompt, template: "lesson_plan" });
  const lessonXml = docxText(lessonBuffer);
  assertContainsAll(lessonXml, expectedTerms);
  assertContainsAll(lessonXml, ["课程名称", "章节主题", "授课对象", "课程性质", "授课方式"]);
  assertContainsAll(lessonXml, ["教学环节", "时间", "教师活动", "学生活动", "设计意图"]);

  const numberingBuffer = createDocxBuffer({
    title: "编号重置验证",
    template: "report",
    markdown: `# 编号重置验证

## 实施步骤

1. 收集样本。
2. 分析结果。

## 评价标准

1. 内容准确。
2. 表达清晰。
`
  });
  const numberingXml = docxText(numberingBuffer);
  const numIds = [...numberingXml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((match) => match[1]);
  assert(numIds.length === 4, `Expected four numbered paragraphs, got ${numIds.length}`);
  assert(numIds[0] === numIds[1], "First numbered block should share one numId");
  assert(numIds[2] === numIds[3], "Second numbered block should share one numId");
  assert(numIds[0] !== numIds[2], `Each numbered_list block should restart with a fresh numId, got ${numIds.join(",")}`);
  assert(!numberingXml.includes("→"), "DOCX renderer should not inject arrow symbols");

  process.env.ALLOW_LOCAL_STORAGE_FALLBACK = "true";
  process.env.CLAUDECODER_API_KEY = "";
  process.env.MOONSHOT_API_KEY = "";
  process.env.AGENT_KIMI_API_KEY = "";
  process.env.ALI_OSS_BUCKET = "";
  process.env.ALI_OSS_ACCESS_KEY_ID = "";
  process.env.ALI_OSS_ACCESS_KEY_SECRET = "";
  process.env.ALI_OSS_ENDPOINT = "";

  const startedAt = Date.now();
  const result = await runAgent({
    userId: "word-generation-intent",
    messages: [{ role: "user", content: prompt }],
    files: [],
    signal: new AbortController().signal
  });
  const elapsedMs = Date.now() - startedAt;
  assert(result.generatedFiles[0]?.fileName.endsWith(".docx"), "Expected local fallback to generate a docx file");
  assert(result.fallbackUsed, "Expected missing model keys to use local Word fallback");
  assert(elapsedMs < 40_000, `Expected local fallback under 40s, got ${elapsedMs}ms`);

  const outputPath = resolveMockStorageUrl(result.generatedFiles[0].url || "");
  assert(existsSync(outputPath), `Expected generated docx at ${outputPath}`);
  const fallbackXml = docxText(readFileSync(outputPath));
  assertContainsAll(fallbackXml, expectedTerms);

  console.log(JSON.stringify({ ok: true, elapsedMs, fileName: result.generatedFiles[0].fileName }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
