import { runAgent } from "@/lib/agent/router";
import { createDocxBuffer } from "@/lib/document/create";
import { parseDocxPackage } from "@/lib/document/docx-package";
import { buildWordDocumentPlan, extractWordGenerationIntent, type WordDocumentPlan } from "@/lib/document/plan";
import { evaluateWordDocumentPlan } from "@/lib/document/quality";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function docxXml(buffer: Buffer) {
  return parseDocxPackage(buffer).getText("word/document.xml") || "";
}

function normalizeXmlText(xml: string) {
  return xml.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
}

function resolveMockStorageUrl(url: string) {
  assert(url.startsWith("/mock-storage/"), `Expected mock storage URL, got ${url}`);
  return resolve(process.cwd(), "public", url.replace(/^\//, ""));
}

function assertIncludesAll(text: string, values: string[], label: string) {
  for (const value of values) {
    assert(text.includes(value), `${label}: expected ${value}`);
  }
}

function assertNoTemplateSmell(text: string, label: string) {
  const smells = [
    "结构清晰、便于继续修改和交付",
    "补充具体数据、案例或附件内容后",
    "如需更强格式",
    "待补充",
    "文档主题",
    "交付重点",
    "本部分用于补充",
    "这个部分用于",
    "请根据班级基础和课程目标进一步补充",
    "用户指定",
    "上述范围",
    "上述分析范围",
    "相关要求",
    "核心内容",
    "关键概念",
    "关键任务",
    "流程衔接",
    "反馈处理",
    "责任明确",
    "动作可查",
    "周期复盘"
  ];
  for (const smell of smells) {
    assert(!text.includes(smell), `${label}: template smell "${smell}" should not appear`);
  }
}

function assertNoRepeatedShortPhrase(text: string, label: string, protectedTerms: string[] = []) {
  const phrases = text.match(/[\u4e00-\u9fa5]{4,12}/g) || [];
  const counts = new Map<string, number>();
  for (const phrase of phrases) {
    counts.set(phrase, (counts.get(phrase) || 0) + 1);
  }
  const repeated = [...counts.entries()].filter(
    ([phrase, count]) =>
      count >= 6 &&
      !["课程名称", "教学过程", "评价标准"].includes(phrase) &&
      !protectedTerms.some((term) => term.includes(phrase) || phrase.includes(term))
  );
  assert(repeated.length === 0, `${label}: repeated phrases ${JSON.stringify(repeated.slice(0, 5))}`);
}

function assertPlanSectionsHaveBody(prompt: string, template: "lesson_plan" | "report" | "proposal") {
  const intent = extractWordGenerationIntent(prompt);
  const plan = buildWordDocumentPlan({ markdown: prompt, title: prompt, template, intent, prompt });
  assert(plan.title.length <= 40, `Title should be clean and short, got ${plan.title}`);
  assert(!plan.title.includes("给我") && !plan.title.includes("生成") && !plan.title.includes("要求"), `Title should not include task words: ${plan.title}`);
  assert(plan.title !== prompt, "Title should not equal full prompt");
  for (const section of plan.sections.filter((item) => item.level === 1)) {
    assert(section.intro || section.blocks.some((block) => block.type === "paragraph" || block.type === "table"), `Section ${section.heading} should have body`);
  }
  const report = evaluateWordDocumentPlan(plan, { intent, prompt });
  assert(!report.shouldRepair, `Plan should pass content QA: ${JSON.stringify(report.issues)}`);
  return { intent, plan };
}

function sectionText(plan: ReturnType<typeof buildWordDocumentPlan>, headingPart: string) {
  const section = plan.sections.find((item) => item.heading.includes(headingPart));
  assert(section, `Expected section containing ${headingPart}`);
  return JSON.stringify(section);
}

function assertTermsInSection(plan: ReturnType<typeof buildWordDocumentPlan>, headingPart: string, terms: string[], label: string) {
  const text = sectionText(plan, headingPart);
  assertIncludesAll(text, terms, `${label} ${headingPart}`);
}

function assertWeakModelPlanFailsQa() {
  const prompt = "请生成《三维动画教学课程》教案，第一章节：动画规律，2课时，授课对象为高职数字媒体专业学生，要求覆盖关键帧、缓入缓出、挤压拉伸";
  const intent = extractWordGenerationIntent(prompt);
  const weakPlan: WordDocumentPlan = {
    title: "三维动画教学课程 第一章节 动画规律教案",
    documentType: "lesson_plan",
    sections: [
      {
        heading: "课程基本信息",
        level: 1,
        intro: "本部分用于说明课程基本信息。",
        blocks: [
          {
            type: "table",
            headers: ["项目", "内容"],
            rows: [
              ["课程名称", "三维动画教学课程"],
              ["章节主题", "第一章节 动画规律"],
              ["课时", "2课时"],
              ["关键词", "关键帧、运动规律、缓入缓出、挤压拉伸"]
            ]
          }
        ]
      },
      { heading: "教学目标", level: 1, intro: "理解关键概念，掌握核心内容，完成相关要求。", blocks: [] },
      { heading: "教学过程", level: 1, intro: "按导入、讲解、练习和评价推进课堂。", blocks: [{ type: "table", headers: ["环节", "活动"], rows: [["导入", "提出问题"], ["练习", "完成任务"]] }] },
      { heading: "教学评价", level: 1, intro: "围绕课堂表现和成果质量进行评价。", blocks: [] }
    ]
  };
  const report = evaluateWordDocumentPlan(weakPlan, { intent, prompt });
  assert(report.shouldRepair, `Weak model plan should fail QA: ${JSON.stringify(report.issues)}`);
  assert(
    report.issues.some((issue) => issue.code === "template_text" || issue.code === "weak_intent_grounding"),
    `Weak model plan should fail for template or grounding issues: ${JSON.stringify(report.issues)}`
  );
}

async function assertAgentFallbackCreatesGroundedDocx(prompt: string, expected: string[]) {
  process.env.ALLOW_LOCAL_STORAGE_FALLBACK = "true";
  process.env.CLAUDECODER_API_KEY = "";
  process.env.MOONSHOT_API_KEY = "";
  process.env.AGENT_KIMI_API_KEY = "";
  process.env.ALI_OSS_BUCKET = "";
  process.env.ALI_OSS_ACCESS_KEY_ID = "";
  process.env.ALI_OSS_ACCESS_KEY_SECRET = "";
  process.env.ALI_OSS_ENDPOINT = "";

  const result = await runAgent({
    userId: "word-content-quality",
    messages: [{ role: "user", content: prompt }],
    files: [],
    signal: new AbortController().signal
  });
  assert(result.generatedFiles[0]?.fileName.endsWith(".docx"), "Expected fallback to generate docx");
  assert(result.fallbackUsed, "Expected missing provider keys to use local fallback");
  const outputPath = resolveMockStorageUrl(result.generatedFiles[0].url || "");
  assert(existsSync(outputPath), `Expected generated docx at ${outputPath}`);
  const text = normalizeXmlText(docxXml(readFileSync(outputPath)));
  assertIncludesAll(text, expected, "Agent fallback docx");
  assertNoTemplateSmell(text, "Agent fallback docx");
  assertNoRepeatedShortPhrase(text, "Agent fallback docx", expected);
}

async function main() {
  assertWeakModelPlanFailsQa();

  const cases = [
    {
      template: "lesson_plan" as const,
      prompt: "请生成《三维动画教学课程》教案，第一章节：动画规律，2课时，授课对象为高职数字媒体专业学生，要求覆盖关键帧、缓入缓出、挤压拉伸",
      expectedIntent: {
        documentType: "lesson_plan",
        topic: "三维动画教学课程",
        chapter: "第一章节",
        chapterTitle: "动画规律",
        duration: "2课时",
        audience: "高职数字媒体专业学生"
      },
      expectedTerms: ["三维动画教学课程", "第一章节", "动画规律", "2课时", "高职数字媒体专业学生", "关键帧", "运动规律", "动画节奏", "缓入缓出", "挤压拉伸"]
    },
    {
      template: "report" as const,
      prompt: "生成《社区养老服务满意度》调研报告，范围：上门护理、助餐服务、紧急呼叫，面向民政部门，要求包含问题原因和改进建议",
      expectedIntent: {
        documentType: "report",
        topic: "社区养老服务满意度",
        scope: "上门护理、助餐服务、紧急呼叫",
        audience: "民政部门"
      },
      expectedTerms: ["社区养老服务满意度", "上门护理", "助餐服务", "紧急呼叫", "民政部门", "问题原因", "改进建议"]
    },
    {
      template: "proposal" as const,
      prompt: "写一份《校园低碳行动》实施方案，周期3个月，对象为后勤处和学生社团，范围包括节能巡检、旧物回收、低碳宣传，要求列出实施步骤和评价指标",
      expectedIntent: {
        documentType: "proposal",
        topic: "校园低碳行动",
        duration: "3个月",
        audience: "后勤处和学生社团",
        scope: "节能巡检、旧物回收、低碳宣传"
      },
      expectedTerms: ["校园低碳行动", "3个月", "后勤处和学生社团", "节能巡检", "旧物回收", "低碳宣传", "实施步骤", "评价指标"]
    }
  ];

  const oralIntent = extractWordGenerationIntent("帮我生成一个三维动画第一章教学的教案 Word，内容要正式、可直接交付");
  assert(oralIntent.topic === "三维动画", `Oral prompt topic should stay clean, got ${oralIntent.topic}`);
  assert(oralIntent.chapter === "第一章", `Oral prompt chapter should be 第一章, got ${oralIntent.chapter}`);
  assert(!oralIntent.chapterTitle?.includes("教案"), `Oral prompt chapter title should not include task words, got ${oralIntent.chapterTitle}`);
  assert(!oralIntent.chapterTitle?.includes("可直接交付"), `Oral prompt chapter title should not include extra requirements, got ${oralIntent.chapterTitle}`);

  for (const item of cases) {
    const intent = extractWordGenerationIntent(item.prompt);
    for (const [key, value] of Object.entries(item.expectedIntent)) {
      assert((intent as Record<string, unknown>)[key] === value, `${item.prompt}: expected ${key}=${value}, got ${(intent as Record<string, unknown>)[key]}`);
    }
    assertIncludesAll(intent.keywords.join(""), item.expectedTerms.slice(0, 4), "Intent keywords");

    const { plan } = assertPlanSectionsHaveBody(item.prompt, item.template);
    const planText = JSON.stringify(plan);
    assertIncludesAll(planText, item.expectedTerms, "Plan text");
    assertNoTemplateSmell(planText, "Plan text");
    if (item.template === "lesson_plan") {
      assertTermsInSection(plan, "教学目标", ["动画规律", "关键帧", "缓入缓出", "挤压拉伸"], "Lesson plan grounding");
      assertTermsInSection(plan, "教学重点", ["关键帧", "运动规律", "缓入缓出", "挤压拉伸"], "Lesson plan grounding");
      assertTermsInSection(plan, "教学准备", ["三维动画", "关键帧", "缓入缓出", "挤压拉伸"], "Lesson plan grounding");
      assertTermsInSection(plan, "教学过程", ["关键帧", "运动规律", "缓入缓出", "挤压拉伸"], "Lesson plan grounding");
      assertTermsInSection(plan, "教学评价", ["关键帧", "缓入缓出", "挤压拉伸"], "Lesson plan grounding");
      assertTermsInSection(plan, "课后", ["动画规律", "关键帧", "缓入缓出", "挤压拉伸"], "Lesson plan grounding");
    }
    if (item.template === "report") {
      assertTermsInSection(plan, "核心发现", ["上门护理", "助餐服务", "紧急呼叫"], "Report grounding");
      assertTermsInSection(plan, "原因分析", ["上门护理", "助餐服务", "紧急呼叫"], "Report grounding");
      assertTermsInSection(plan, "改进建议", ["上门护理", "助餐服务", "紧急呼叫"], "Report grounding");
    }
    if (item.template === "proposal") {
      assertTermsInSection(plan, "方案目标", ["节能巡检", "旧物回收", "低碳宣传"], "Proposal grounding");
      assertTermsInSection(plan, "实施步骤", ["节能巡检", "旧物回收", "低碳宣传"], "Proposal grounding");
      assertTermsInSection(plan, "评价指标", ["节能巡检", "旧物回收", "低碳宣传"], "Proposal grounding");
    }

    const xmlText = normalizeXmlText(createDocxBuffer({ markdown: item.prompt, title: item.prompt, template: item.template, prompt: item.prompt }).toString("utf8"));
    assertNoTemplateSmell(xmlText, "DOCX raw XML");
  }

  await assertAgentFallbackCreatesGroundedDocx(cases[0].prompt, cases[0].expectedTerms);
  await assertAgentFallbackCreatesGroundedDocx(cases[1].prompt, cases[1].expectedTerms);
  await assertAgentFallbackCreatesGroundedDocx(cases[2].prompt, cases[2].expectedTerms);

  console.log(JSON.stringify({ ok: true, cases: cases.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
