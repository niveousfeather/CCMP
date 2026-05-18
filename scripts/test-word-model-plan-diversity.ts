import { createDocxBuffer } from "@/lib/document/create";
import { parseDocxPackage } from "@/lib/document/docx-package";
import { buildWordDocumentPlan, type WordDocumentPlan } from "@/lib/document/plan";
import { evaluateWordDocumentPlan } from "@/lib/document/quality";

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function docxText(buffer: Buffer) {
  const xml = parseDocxPackage(buffer).getText("word/document.xml") || "";
  return xml.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
}

function sectionText(plan: WordDocumentPlan, headingPart: string) {
  const section = plan.sections.find((item) => item.heading.includes(headingPart));
  assert(section, `Expected section ${headingPart}`);
  return JSON.stringify(section);
}

function textSimilarity(a: string, b: string) {
  const grams = (value: string) => {
    const compact = value.replace(/\s+/g, "");
    const set = new Set<string>();
    for (let index = 0; index <= compact.length - 8; index += 1) {
      set.add(compact.slice(index, index + 8));
    }
    return set;
  };
  const left = grams(a);
  const right = grams(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const item of left) {
    if (right.has(item)) overlap += 1;
  }
  return overlap / Math.min(left.size, right.size);
}

function assertDistinctPlans(left: WordDocumentPlan, right: WordDocumentPlan, label: string) {
  assert(left.title !== right.title, `${label}: titles should differ`);
  const leftProcess = sectionText(left, left.documentType === "lesson_plan" ? "教学过程" : left.documentType === "proposal" ? "实施步骤" : "核心发现");
  const rightProcess = sectionText(right, right.documentType === "lesson_plan" ? "教学过程" : right.documentType === "proposal" ? "实施步骤" : "核心发现");
  const similarity = textSimilarity(leftProcess, rightProcess);
  assert(similarity < 0.46, `${label}: section content too similar (${similarity.toFixed(2)})`);
}

function main() {
  const generatedPlan: WordDocumentPlan = {
    title: "城市夜间经济消费趋势调研报告",
    documentType: "report",
    sections: [
      {
        heading: "调研背景",
        level: 1,
        intro: "本报告聚焦城市夜间经济消费趋势，关注餐饮街区、文旅演出和交通配套三类场景对消费停留时间和复购意愿的影响。",
        blocks: [
          {
            type: "table",
            headers: ["场景", "观察重点"],
            rows: [
              ["餐饮街区", "夜间客流、排队体验、客单价变化"],
              ["文旅演出", "演出散场后的二次消费和周边联动"],
              ["交通配套", "末班车、停车和网约车等待时间"]
            ]
          }
        ]
      },
      {
        heading: "核心发现",
        level: 1,
        intro: "餐饮街区带来稳定人流，文旅演出制造峰值需求，交通配套决定消费者是否愿意延长夜间停留。",
        blocks: [
          { type: "paragraph", text: "餐饮街区的消费转化更依赖排队效率和店铺组合，单一爆款会带来拥堵，但未必提升整体街区体验。" },
          { type: "paragraph", text: "文旅演出能在短时间形成高峰人流，若周边餐饮、零售和公共空间承接不足，散场人群会快速离开。" }
        ]
      },
      {
        heading: "改进建议",
        level: 1,
        intro: "建议围绕分时引导、业态联动和夜间交通保障形成组合动作。",
        blocks: [
          { type: "bullet_list", items: ["为餐饮街区设置错峰优惠和候位提醒。", "把演出结束时段与周边夜游、轻食、文创零售联动。", "延长重点站点接驳服务并公开末班信息。"] }
        ]
      }
    ]
  };
  const encoded = `WORD_DOCUMENT_PLAN_JSON\n${JSON.stringify(generatedPlan)}`;
  const parsed = buildWordDocumentPlan({ markdown: encoded, title: "不应使用这个标题", template: "report", prompt: "生成城市夜间经济消费趋势调研报告" });
  assert(parsed.title === generatedPlan.title, "Renderer should use model-generated WordDocumentPlan title");
  assert(sectionText(parsed, "核心发现").includes("文旅演出"), "Renderer should preserve model-generated section content");
  const report = evaluateWordDocumentPlan(parsed, { prompt: "生成城市夜间经济消费趋势调研报告" });
  assert(!report.shouldRepair, `Model-generated plan should pass QA: ${JSON.stringify(report.issues)}`);
  const xmlText = docxText(createDocxBuffer({ markdown: encoded, title: "不应使用这个标题", template: "report", prompt: "生成城市夜间经济消费趋势调研报告" }));
  assert(xmlText.includes("城市夜间经济消费趋势调研报告"), "DOCX should include generated title");
  assert(xmlText.includes("文旅演出"), "DOCX should include generated content");

  const lessonA = buildWordDocumentPlan({
    markdown: "请生成《三维动画教学课程》教案，第一章节：动画规律，2课时，授课对象为高职数字媒体专业学生，要求覆盖关键帧、缓入缓出、挤压拉伸",
    title: "三维动画教学课程教案",
    template: "lesson_plan",
    prompt: "请生成《三维动画教学课程》教案，第一章节：动画规律，2课时，授课对象为高职数字媒体专业学生，要求覆盖关键帧、缓入缓出、挤压拉伸"
  });
  const lessonB = buildWordDocumentPlan({
    markdown: "生成《初中语文写作课》教案，第二章节：人物描写，1课时，授课对象为七年级学生，要求覆盖外貌描写、动作描写、心理描写",
    title: "初中语文写作课教案",
    template: "lesson_plan",
    prompt: "生成《初中语文写作课》教案，第二章节：人物描写，1课时，授课对象为七年级学生，要求覆盖外貌描写、动作描写、心理描写"
  });
  const reportPlan = buildWordDocumentPlan({
    markdown: "生成《社区养老服务满意度》调研报告，范围：上门护理、助餐服务、紧急呼叫，面向民政部门，要求包含问题原因和改进建议",
    title: "社区养老服务满意度报告",
    template: "report",
    prompt: "生成《社区养老服务满意度》调研报告，范围：上门护理、助餐服务、紧急呼叫，面向民政部门，要求包含问题原因和改进建议"
  });
  const proposalPlan = buildWordDocumentPlan({
    markdown: "写一份《校园低碳行动》实施方案，周期3个月，对象为后勤处和学生社团，范围包括节能巡检、旧物回收、低碳宣传，要求列出实施步骤和评价指标",
    title: "校园低碳行动方案",
    template: "proposal",
    prompt: "写一份《校园低碳行动》实施方案，周期3个月，对象为后勤处和学生社团，范围包括节能巡检、旧物回收、低碳宣传，要求列出实施步骤和评价指标"
  });

  assertDistinctPlans(lessonA, lessonB, "different lesson plans");
  assertDistinctPlans(reportPlan, proposalPlan, "report vs proposal");
  assert(sectionText(lessonB, "教学过程").includes("人物描写"), "Chinese writing lesson process should use its own topic");
  assert(sectionText(lessonB, "教学过程").includes("外貌描写"), "Chinese writing lesson process should use appearance description");
  assert(!sectionText(lessonB, "教学过程").includes("关键帧"), "Chinese writing lesson should not leak animation content");

  console.log(JSON.stringify({ ok: true, generatedTitle: parsed.title, lessonSimilarityGuard: true }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
