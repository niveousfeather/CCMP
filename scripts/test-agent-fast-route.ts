import { extractAgentTask } from "@/lib/agent/router";
import { shouldUseFastChatRoute } from "@/lib/agent/task-router";

const fastTask = extractAgentTask("你好", false, { tools: { webSearch: false, contentMode: null } });
if (!shouldUseFastChatRoute({ text: "你好", hasFiles: false, tools: { webSearch: false, contentMode: null }, task: fastTask })) {
  throw new Error("Expected simple greeting to use fast chat route.");
}

const wordTask = extractAgentTask("帮我生成一份项目总结 Word", false, { tools: { webSearch: false, contentMode: null } });
if (shouldUseFastChatRoute({ text: "帮我生成一份项目总结 Word", hasFiles: false, tools: { webSearch: false, contentMode: null }, task: wordTask })) {
  throw new Error("Expected Word generation to avoid fast chat route.");
}

const pptTask = extractAgentTask("生成一份课程介绍 PPT", false, { tools: { webSearch: false, contentMode: null } });
if (shouldUseFastChatRoute({ text: "生成一份课程介绍 PPT", hasFiles: false, tools: { webSearch: false, contentMode: null }, task: pptTask })) {
  throw new Error("Expected PPT generation to avoid fast chat route.");
}
if (pptTask.type !== "create_presentation") {
  throw new Error(`Expected explicit PPT generation to be create_presentation, got ${pptTask.type}.`);
}

const makePptText = "帮我做一个关于【三维动画】的【10页】商务汇报PPT，给领导看";
const makePptTask = extractAgentTask(makePptText, false, { tools: { webSearch: false, contentMode: null } });
if (makePptTask.type !== "create_presentation" || makePptTask.outputFormat !== "pptx") {
  throw new Error(`Expected 做一个 PPT request to be create_presentation/pptx, got ${makePptTask.type}/${makePptTask.outputFormat}.`);
}
if (shouldUseFastChatRoute({ text: makePptText, hasFiles: false, tools: { webSearch: false, contentMode: null }, task: makePptTask })) {
  throw new Error("Expected 做一个 PPT request to avoid fast chat route.");
}

const lessonPlanText = "帮我生成一个三维动画教学的教案，主要讲第一章节，动画规律";
const lessonPlanTask = extractAgentTask(lessonPlanText, false, { tools: { webSearch: false, contentMode: null } });
if (lessonPlanTask.type !== "create_document" || lessonPlanTask.outputFormat !== "docx" || lessonPlanTask.documentType !== "lesson_plan") {
  throw new Error(`Expected 教案 generation to be create_document/docx/lesson_plan, got ${lessonPlanTask.type}/${lessonPlanTask.outputFormat}/${lessonPlanTask.documentType}.`);
}
if (shouldUseFastChatRoute({ text: lessonPlanText, hasFiles: false, tools: { webSearch: false, contentMode: null }, task: lessonPlanTask })) {
  throw new Error("Expected 教案 generation to avoid fast chat route.");
}

const webTask = extractAgentTask("联网查一下今天的行业新闻", false, { tools: { webSearch: true, contentMode: null } });
if (!shouldUseFastChatRoute({ text: "联网查一下今天的行业新闻", hasFiles: false, tools: { webSearch: true, contentMode: null }, task: webTask })) {
  throw new Error("Expected web-search chat to stay on the fast GPT-5.4 route.");
}

const fileTask = extractAgentTask("分析这个文件", true, { tools: { webSearch: false, contentMode: null } });
if (shouldUseFastChatRoute({ text: "分析这个文件", hasFiles: true, tools: { webSearch: false, contentMode: null }, task: fileTask })) {
  throw new Error("Expected file request to avoid fast chat route.");
}

console.log(JSON.stringify({ ok: true }, null, 2));
