import { getAgentAsyncTaskTimeoutMs } from "@/lib/agent/async-tasks";
import { getAgentModelConfig } from "@/lib/agent/models";
import { createDocxBuffer } from "@/lib/document/create";
import { parseDocxPackage } from "@/lib/document/docx-package";
import { buildWordDocumentPlanFromIntent, extractWordGenerationIntent } from "@/lib/document/plan";
import { canDeliverWordDocumentPlan, evaluateWordDocumentPlan, repairWordDocumentPlan } from "@/lib/document/quality";
import type { WordDocumentPlan } from "@/lib/document/plan";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const savedEnv = {
  AGENT_TASK_PRIMARY_TIMEOUT_MS: process.env.AGENT_TASK_PRIMARY_TIMEOUT_MS,
  AGENT_TASK_FALLBACK_TIMEOUT_MS: process.env.AGENT_TASK_FALLBACK_TIMEOUT_MS,
  AGENT_WORD_TASK_PRIMARY_TIMEOUT_MS: process.env.AGENT_WORD_TASK_PRIMARY_TIMEOUT_MS,
  AGENT_WORD_TASK_FALLBACK_TIMEOUT_MS: process.env.AGENT_WORD_TASK_FALLBACK_TIMEOUT_MS,
  AGENT_WORD_TASK_REPAIR_TIMEOUT_MS: process.env.AGENT_WORD_TASK_REPAIR_TIMEOUT_MS,
  AGENT_ASYNC_TASK_TIMEOUT_MS: process.env.AGENT_ASYNC_TASK_TIMEOUT_MS,
  AGENT_WORD_ASYNC_TASK_TIMEOUT_MS: process.env.AGENT_WORD_ASYNC_TASK_TIMEOUT_MS
};

function restoreEnv() {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

try {
  process.env.AGENT_TASK_PRIMARY_TIMEOUT_MS = "";
  process.env.AGENT_TASK_FALLBACK_TIMEOUT_MS = "";
  process.env.AGENT_WORD_TASK_PRIMARY_TIMEOUT_MS = "";
  process.env.AGENT_WORD_TASK_FALLBACK_TIMEOUT_MS = "";
  process.env.AGENT_WORD_TASK_REPAIR_TIMEOUT_MS = "";
  process.env.AGENT_ASYNC_TASK_TIMEOUT_MS = "";
  process.env.AGENT_WORD_ASYNC_TASK_TIMEOUT_MS = "";

  const config = getAgentModelConfig();
  assert(config.taskPrimaryTimeoutMs <= 20_000, `Generic task primary timeout should stay short: ${config.taskPrimaryTimeoutMs}`);
  assert(config.taskFallbackTimeoutMs <= 18_000, `Generic task fallback timeout should stay short: ${config.taskFallbackTimeoutMs}`);
  assert(config.wordTaskPrimaryTimeoutMs >= 300_000 && config.wordTaskPrimaryTimeoutMs <= 480_000, `Word primary timeout should stay within 5-8 minutes: ${config.wordTaskPrimaryTimeoutMs}`);
  assert(config.wordTaskFallbackTimeoutMs >= 180_000 && config.wordTaskFallbackTimeoutMs <= 300_000, `Word fallback timeout should stay within 3-5 minutes: ${config.wordTaskFallbackTimeoutMs}`);
  assert(config.wordTaskRepairTimeoutMs >= 180_000 && config.wordTaskRepairTimeoutMs <= 300_000, `Word repair timeout should stay within 3-5 minutes: ${config.wordTaskRepairTimeoutMs}`);
  assert(getAgentAsyncTaskTimeoutMs("word") === 600_000, `Word async task timeout should cap total generation near 10 minutes: ${getAgentAsyncTaskTimeoutMs("word")}`);
  assert(getAgentAsyncTaskTimeoutMs("ppt") === 300_000, `PPT async timeout should keep existing default: ${getAgentAsyncTaskTimeoutMs("ppt")}`);

  const prompt = "生成《社区养老服务满意度》调研报告，范围：上门护理、助餐服务、紧急呼叫，面向民政部门，要求包含问题原因和改进建议";
  const baseIntent = extractWordGenerationIntent(prompt);
  const plan = buildWordDocumentPlanFromIntent(baseIntent, "report");
  const qaIntent = {
    ...baseIntent,
    keywords: [...baseIntent.keywords, "夜间巡护台账"],
    requirements: [...baseIntent.requirements, "夜间巡护台账"]
  };
  const report = evaluateWordDocumentPlan(plan, { intent: qaIntent, prompt });
  assert(report.issues.some((issue) => issue.code === "missing_intent_keyword"), "Expected QA to record the missing optional keyword");
  assert(!report.shouldRepair, `Missing one optional keyword should not hard-fail a grounded report: ${JSON.stringify(report)}`);

  const strictIntent = {
    ...baseIntent,
    mustInclude: [...baseIntent.mustInclude, "夜间巡护台账"],
    requirements: [...baseIntent.requirements, "夜间巡护台账"]
  };
  const strictReport = evaluateWordDocumentPlan(plan, { intent: strictIntent, prompt });
  assert(
    strictReport.issues.some((issue) => issue.code === "missing_intent_keyword" && issue.severity === "high"),
    `Explicit mustInclude gaps should be high severity: ${JSON.stringify(strictReport.issues)}`
  );
  assert(strictReport.shouldRepair, "Explicit mustInclude gaps must trigger repair");
  assert(!canDeliverWordDocumentPlan(strictReport), "Explicit mustInclude gaps must not be deliverable after failed repair");

  const lessonPrompt = "生成一份《三维动画课程》的完整课程教案，包含课程目标、教学安排、单元示例、评价方案和学生提交清单";
  const lessonIntent = extractWordGenerationIntent(lessonPrompt);
  const lessonPlan = buildWordDocumentPlanFromIntent(lessonIntent, "lesson_plan");
  const lessonText = JSON.stringify(lessonPlan);
  for (const required of ["课程目标", "教学安排", "单元示例", "评价方案", "学生提交清单"]) {
    assert(lessonText.includes(required), `Complete course lesson fallback should include ${required}`);
  }
  assert(
    lessonPlan.sections.some((section) => section.blocks.some((block) => block.type === "rubric")),
    "Complete course lesson fallback should include a rubric-style evaluation plan"
  );
  assert(
    lessonPlan.sections.some((section) => section.blocks.some((block) => block.type === "checklist")),
    "Complete course lesson fallback should include a checklist for student submissions"
  );
  const lessonQa = evaluateWordDocumentPlan(lessonPlan, { intent: lessonIntent, prompt: lessonPrompt });
  assert(!lessonQa.shouldRepair, `Complete course lesson fallback should pass QA: ${JSON.stringify(lessonQa.issues)}`);

  const modelPlanWithEnglishTemplateTitle = `WORD_DOCUMENT_PLAN_JSON
${JSON.stringify({
  title: "Lesson Plan",
  documentType: "lesson_plan",
  sections: lessonPlan.sections
})}`;
  const buffer = createDocxBuffer({
    markdown: modelPlanWithEnglishTemplateTitle,
    title: "Lesson Plan",
    template: "lesson_plan",
    prompt: lessonPrompt,
    intent: lessonIntent
  });
  const text = (parseDocxPackage(buffer).getText("word/document.xml") || "").replace(/<[^>]+>/g, "");
  assert(!/Lesson Plan|Proposal|Document|Meeting Minutes|DocTemplate/.test(text), `Rendered Word should not expose template labels: ${text.slice(0, 300)}`);
  assert(text.includes("三维动画课程") && text.includes("教案"), "Rendered Word should use a formal Chinese title grounded in intent");

  const trainingPrompt = "生成一份“公司新员工入职培训方案”，包含培训目标、三天流程、责任分工、考核方式和风险预案";
  const trainingIntent = extractWordGenerationIntent(trainingPrompt);
  const trainingFallbackPlan = buildWordDocumentPlanFromIntent(trainingIntent, "proposal");
  const trainingFallbackText = JSON.stringify(trainingFallbackPlan);
  for (const required of ["培训目标", "三天", "责任", "考核", "风险"]) {
    assert(trainingFallbackText.includes(required), `Training local fallback should include explicit required module: ${required}`);
  }
  const trainingFallbackQa = evaluateWordDocumentPlan(trainingFallbackPlan, { intent: trainingIntent, prompt: trainingPrompt });
  assert(!trainingFallbackQa.shouldRepair, `Training local fallback should pass QA without missing_required_section: ${JSON.stringify(trainingFallbackQa.issues)}`);

  const semanticPlan: WordDocumentPlan = {
    title: "《公司新员工入职培训》实施方案",
    documentType: "training_plan",
    sections: [
      {
        heading: "培训目的",
        level: 1,
        intro: "本模块明确新员工在组织认知、岗位适应和基础流程掌握方面的培训目标。",
        blocks: [{ type: "paragraph", text: "培训完成后，新员工应能理解公司制度、岗位协作方式和入职阶段关键任务。" }]
      },
      {
        heading: "三日安排",
        level: 1,
        intro: "三天流程按认知导入、岗位实践和复盘考核推进。",
        blocks: [
          {
            type: "timeline",
            headers: ["时间", "安排", "产出"],
            rows: [
              ["第一天", "公司制度、组织文化和办公流程说明", "入职学习记录"],
              ["第二天", "岗位流程演示与导师带教", "岗位任务练习"],
              ["第三天", "场景演练、答疑和综合考核", "考核结果与改进清单"]
            ]
          }
        ]
      },
      {
        heading: "职责矩阵",
        level: 1,
        intro: "职责矩阵明确培训组织、带教、考核和反馈的责任边界。",
        blocks: [
          {
            type: "responsibility_matrix",
            headers: ["事项", "负责人", "协作方", "交付物"],
            rows: [
              ["课程组织", "人力资源部", "用人部门", "培训日程与签到记录"],
              ["岗位带教", "直属导师", "业务骨干", "岗位练习反馈"],
              ["考核确认", "部门负责人", "HRBP", "考核表与改进建议"]
            ]
          }
        ]
      },
      {
        heading: "考核评价",
        level: 1,
        intro: "考核评价结合制度理解、岗位任务完成度和沟通协作表现。",
        blocks: [
          {
            type: "rubric",
            headers: ["评价项目", "比例", "标准"],
            rows: [
              ["制度理解", "30%", "能说明入职制度和关键流程要求"],
              ["岗位实践", "50%", "能按导师要求完成基础岗位任务"],
              ["协作反馈", "20%", "能主动沟通问题并形成改进记录"]
            ]
          }
        ]
      },
      {
        heading: "风险控制",
        level: 1,
        intro: "风险控制聚焦时间冲突、导师缺位、考核流于形式和新员工理解偏差。",
        blocks: [{ type: "checklist", items: ["提前确认导师与课程时间", "每日收集疑问并闭环答复", "考核不通过时安排补训"] }]
      }
    ]
  };
  const semanticQa = evaluateWordDocumentPlan(semanticPlan, { intent: trainingIntent, prompt: trainingPrompt });
  assert(
    !semanticQa.issues.some((issue) => issue.code === "missing_required_section"),
    `Semantic section equivalents should not be rejected as missing required sections: ${JSON.stringify(semanticQa.issues)}`
  );

  const sparseTrainingPlan: WordDocumentPlan = {
    title: "《公司新员工入职培训》实施方案",
    documentType: "training_plan",
    sections: [
      {
        heading: "培训目标",
        level: 1,
        intro: "本方案用于支持公司新员工完成入职适应。",
        blocks: [{ type: "paragraph", text: "培训目标围绕制度理解、岗位熟悉和协作融入展开。" }]
      }
    ]
  };
  const repairedTraining = repairWordDocumentPlan(sparseTrainingPlan, { intent: trainingIntent, prompt: trainingPrompt, preserveExistingPlan: true });
  const repairedText = JSON.stringify(repairedTraining);
  for (const required of ["培训目标", "三天", "责任", "考核", "风险"]) {
    assert(repairedText.includes(required), `Targeted repair/local fallback should add required module content: ${required}`);
  }
  const repairedQa = evaluateWordDocumentPlan(repairedTraining, { intent: trainingIntent, prompt: trainingPrompt });
  assert(!repairedQa.issues.some((issue) => issue.code === "missing_required_section"), `Targeted repair should satisfy required sections: ${JSON.stringify(repairedQa.issues)}`);

  const placeholderQa = evaluateWordDocumentPlan({
    title: "《公司新员工入职培训》实施方案",
    documentType: "training_plan",
    sections: [
      {
        heading: "培训目标",
        level: 1,
        intro: "相关内容围绕相关要求展开。",
        blocks: [
          {
            type: "table",
            headers: ["事项", "负责人", "说明"],
            rows: [["相关内容", "相关负责人", "按实际填写"]]
          }
        ]
      }
    ]
  }, { intent: trainingIntent, prompt: trainingPrompt });
  assert(placeholderQa.issues.some((issue) => issue.code === "placeholder_content"), `QA should reject placeholder-heavy Word content: ${JSON.stringify(placeholderQa.issues)}`);

  console.log(JSON.stringify({ ok: true }, null, 2));
} finally {
  restoreEnv();
}
