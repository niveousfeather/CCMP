import { createDocxBuffer } from "@/lib/document/create";
import { parseDocxPackage } from "@/lib/document/docx-package";
import { buildWordDocumentPlan, extractWordGenerationIntent, serializeWordDocumentPlan, type WordBlock, type WordDocumentPlan } from "@/lib/document/plan";
import { evaluateWordDocumentPlan } from "@/lib/document/quality";
import type { DocumentTemplate } from "@/lib/document/types";

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function planText(plan: WordDocumentPlan) {
  return JSON.stringify(plan);
}

function sectionText(plan: WordDocumentPlan, headingPart: string) {
  const section = plan.sections.find((item) => item.heading.includes(headingPart));
  assert(section, `Expected section containing ${headingPart}. Got ${plan.sections.map((item) => item.heading).join(", ")}`);
  return JSON.stringify(section);
}

function blockTypes(plan: WordDocumentPlan) {
  return new Set(plan.sections.flatMap((section) => section.blocks.map((block) => block.type)));
}

function assertIncludesAll(text: string, values: string[], label: string) {
  for (const value of values) {
    assert(text.includes(value), `${label}: expected ${value}`);
  }
}

function assertNoTemplateSmells(text: string, label: string) {
  const smells = ["待补充", "本部分用于", "相关要求", "关键任务", "上述范围", "核心内容", "可直接交付", "请根据班级基础"];
  for (const smell of smells) {
    assert(!text.includes(smell), `${label}: template smell ${smell}`);
  }
}

function assertProfessionalPlan({
  prompt,
  template,
  expectedType,
  headings,
  terms,
  sectionChecks,
  requiredBlockTypes = []
}: {
  prompt: string;
  template: DocumentTemplate;
  expectedType: string;
  headings: string[];
  terms: string[];
  sectionChecks: Array<{ heading: string; terms: string[] }>;
  requiredBlockTypes?: Array<WordBlock["type"]>;
}) {
  const intent = extractWordGenerationIntent(prompt);
  assert(intent.documentType === expectedType, `Expected ${expectedType} intent, got ${intent.documentType}`);
  assert(intent.topic && intent.topic.length >= 2, `Expected clean topic, got ${intent.topic}`);
  assert(intent.mustInclude?.length >= 1 || intent.keywords.length >= 3, `Expected mustInclude/keywords for ${prompt}`);
  assert(!intent.topic.includes("生成") && !intent.topic.includes("写一份") && !intent.topic.includes("Word"), `Topic should be clean: ${intent.topic}`);

  const plan = buildWordDocumentPlan({ markdown: prompt, title: prompt, template, intent, prompt });
  assert(plan.documentType === expectedType, `Expected ${expectedType} plan, got ${plan.documentType}`);
  assert(plan.title !== prompt, "Title should not equal full prompt");
  assert(plan.title.length <= 44, `Title should be concise, got ${plan.title}`);
  for (const heading of headings) {
    assert(plan.sections.some((section) => section.heading.includes(heading)), `Expected ${expectedType} section ${heading}`);
  }
  const text = planText(plan);
  assertIncludesAll(text, terms, `${expectedType} plan text`);
  assertNoTemplateSmells(text, `${expectedType} plan text`);
  for (const check of sectionChecks) {
    assertIncludesAll(sectionText(plan, check.heading), check.terms, `${expectedType} ${check.heading}`);
  }
  const types = blockTypes(plan);
  for (const type of requiredBlockTypes) {
    assert(types.has(type), `Expected ${expectedType} to include block ${type}, got ${[...types].join(", ")}`);
  }
  const report = evaluateWordDocumentPlan(plan, { intent, prompt });
  assert(!report.shouldRepair, `${expectedType} should pass QA: ${JSON.stringify(report.issues)}`);
  const xml = parseDocxPackage(createDocxBuffer({ markdown: prompt, title: prompt, template, prompt, intent })).getText("word/document.xml") || "";
  assert(xml.includes("<w:document"), `${expectedType} DOCX should open as a Word package`);
  assert(!xml.includes("NexusAI"), `${expectedType} DOCX should not contain platform signature`);
  return plan;
}

function assertStructuredModelBlocksRender() {
  const plan: WordDocumentPlan = {
    title: "校园低碳行动实施方案",
    documentType: "proposal",
    sections: [
      {
        heading: "执行安排",
        level: 1,
        intro: "围绕校园低碳行动，将节能巡检、旧物回收和低碳宣传拆成可跟踪的执行任务。",
        blocks: [
          { type: "timeline", headers: ["阶段", "时间", "重点"], rows: [["启动", "第1周", "完成基线统计和任务分解"]] },
          { type: "responsibility_matrix", headers: ["事项", "牵头", "协作", "交付物"], rows: [["节能巡检", "后勤处", "学生社团", "巡检台账"]] },
          { type: "checklist", items: ["确认巡检区域", "发布回收安排", "完成宣传素材审核"] },
          { type: "rubric", headers: ["指标", "优秀", "合格"], rows: [["节能巡检", "问题闭环率90%以上", "问题闭环率70%以上"]] }
        ]
      }
    ]
  };
  const encoded = serializeWordDocumentPlan(plan);
  const parsed = buildWordDocumentPlan({ markdown: encoded, title: "不应使用", template: "proposal", prompt: "写一份校园低碳行动实施方案" });
  const types = blockTypes(parsed);
  for (const type of ["timeline", "responsibility_matrix", "checklist", "rubric"] as const) {
    assert(types.has(type), `Model plan should preserve ${type}`);
  }
  const xml = parseDocxPackage(createDocxBuffer({ markdown: encoded, title: "不应使用", template: "proposal", prompt: "写一份校园低碳行动实施方案" })).getText("word/document.xml") || "";
  assertIncludesAll(xml, ["第1周", "后勤处", "确认巡检区域", "问题闭环率90%以上"], "Rendered structured blocks");
}

function main() {
  assertProfessionalPlan({
    expectedType: "lesson_plan",
    template: "lesson_plan",
    prompt: "给我一份三维动画教学课程，第一章节动画规律的教案，2课时，授课对象为高职数字媒体专业学生，要求覆盖关键帧、运动规律、缓入缓出、挤压拉伸",
    headings: ["基本信息", "设计思路", "教学目标", "重点", "教学准备", "教学过程", "评价", "作业", "反思"],
    terms: ["三维动画", "第一章节", "动画规律", "2课时", "高职数字媒体专业学生", "关键帧", "运动规律", "缓入缓出", "挤压拉伸"],
    requiredBlockTypes: ["table", "bullet_list"],
    sectionChecks: [{ heading: "教学过程", terms: ["教师活动", "学生活动", "设计意图", "关键帧"] }]
  });

  assertProfessionalPlan({
    expectedType: "report",
    template: "report",
    prompt: "生成《社区养老服务满意度》调研报告，范围：上门护理、助餐服务、紧急呼叫，面向民政部门，要求包含问题原因和改进建议",
    headings: ["背景", "现状", "核心问题", "事实", "原因", "建议", "风险", "结论"],
    terms: ["社区养老服务满意度", "上门护理", "助餐服务", "紧急呼叫", "民政部门", "问题原因", "改进建议"],
    requiredBlockTypes: ["table", "bullet_list"],
    sectionChecks: [
      { heading: "核心问题", terms: ["上门护理", "助餐服务", "紧急呼叫"] },
      { heading: "建议", terms: ["上门护理", "助餐服务", "紧急呼叫"] }
    ]
  });

  assertProfessionalPlan({
    expectedType: "proposal",
    template: "proposal",
    prompt: "写一份《校园低碳行动》实施方案，周期3个月，对象为后勤处和学生社团，范围包括节能巡检、旧物回收、低碳宣传，要求列出实施步骤和评价指标",
    headings: ["目标", "适用范围", "执行步骤", "时间安排", "资源配置", "责任分工", "风险", "验收标准"],
    terms: ["校园低碳行动", "3个月", "后勤处和学生社团", "节能巡检", "旧物回收", "低碳宣传", "实施步骤", "评价指标"],
    requiredBlockTypes: ["numbered_list", "timeline", "responsibility_matrix", "rubric"],
    sectionChecks: [
      { heading: "执行步骤", terms: ["节能巡检", "旧物回收", "低碳宣传"] },
      { heading: "责任分工", terms: ["后勤处", "学生社团"] }
    ]
  });

  assertProfessionalPlan({
    expectedType: "work_summary",
    template: "general",
    prompt: "写一份《2026年第一季度客户成功团队工作总结》，面向管理层，范围包括续费跟进、客户培训、工单响应，要求包含成果数据、问题不足、改进措施和下季度计划",
    headings: ["工作概况", "重点完成事项", "成果", "问题", "改进措施", "下一步计划"],
    terms: ["2026年第一季度客户成功团队", "管理层", "续费跟进", "客户培训", "工单响应", "成果数据", "问题不足", "下季度计划"],
    requiredBlockTypes: ["table", "bullet_list"],
    sectionChecks: [
      { heading: "成果", terms: ["续费跟进", "客户培训", "工单响应"] },
      { heading: "下一步计划", terms: ["下季度计划", "改进"] }
    ]
  });

  assertProfessionalPlan({
    expectedType: "meeting_minutes",
    template: "meeting_minutes",
    prompt: "整理一份《产品例会》会议纪要，会议时间2026年5月10日，参会对象为产品部、研发部和运营部，议题包括新版首页上线、数据看板权限、用户反馈闭环，要求列出决议事项、待办任务、责任人与截止时间",
    headings: ["会议基本信息", "议题", "讨论要点", "决议事项", "待办任务", "责任人与截止时间"],
    terms: ["产品例会", "2026年5月10日", "产品部", "研发部", "运营部", "新版首页上线", "数据看板权限", "用户反馈闭环", "责任人", "截止时间"],
    requiredBlockTypes: ["table", "checklist"],
    sectionChecks: [
      { heading: "讨论要点", terms: ["新版首页上线", "数据看板权限", "用户反馈闭环"] },
      { heading: "待办任务", terms: ["责任人", "截止时间"] }
    ]
  });

  assertStructuredModelBlocksRender();

  console.log(JSON.stringify({ ok: true, cases: 5 }, null, 2));
}

main();
