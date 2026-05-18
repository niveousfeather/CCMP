import { extractAgentTask, getAgentDecision, getToolDegradation, shouldRunWebContext } from "../lib/agent/router";
import { shouldShowLocalFileGenerationCard } from "../lib/agent/reliability";

type Case = {
  name: string;
  actual: unknown;
  expected: unknown;
};

const cases: Case[] = [
  {
    name: "simple chat never triggers web search when web tool is off",
    actual: shouldRunWebContext("你好，我今天有点无聊", { webSearch: false, contentMode: null }),
    expected: false
  },
  {
    name: "latest-information question still does not search when web tool is off",
    actual: shouldRunWebContext("重庆今天温度是多少", { webSearch: false, contentMode: null }),
    expected: false
  },
  {
    name: "latest-information question searches only when web tool is on",
    actual: shouldRunWebContext("重庆今天温度是多少", { webSearch: true, contentMode: null }),
    expected: true
  },
  {
    name: "generic writing mode does not imply web search",
    actual: shouldRunWebContext("帮我写作", { webSearch: false, contentMode: "write" }),
    expected: false
  },
  {
    name: "mentioning Word without an output action does not show local file generation",
    actual: shouldShowLocalFileGenerationCard("word 这个格式是什么？", { webSearch: false, contentMode: null }),
    expected: null
  },
  {
    name: "explicit Word generation shows local Word generation",
    actual: shouldShowLocalFileGenerationCard("帮我生成 Word 文档", { webSearch: false, contentMode: null }),
    expected: "write"
  },
  {
    name: "selected writing tool shows local Word generation even with short prompt",
    actual: shouldShowLocalFileGenerationCard("写一份", { webSearch: false, contentMode: "write" }),
    expected: "write"
  },
  {
    name: "image upload summary stays in file analysis instead of Word generation",
    actual: extractAgentTask("总结一下这张图片", true, { tools: { webSearch: false, contentMode: null } }).type,
    expected: "analyze_file"
  },
  {
    name: "incomplete conversion without source asks for clarification",
    actual: extractAgentTask("帮我把这个转化为 Word", false, { tools: { webSearch: false, contentMode: null } }).type,
    expected: "clarify"
  },
  {
    name: "selected writing tool with vague prompt asks for clarification",
    actual: extractAgentTask("帮我写作", false, { tools: { webSearch: false, contentMode: "write" } }).type,
    expected: "clarify"
  },
  {
    name: "selected ppt tool with vague prompt asks for clarification",
    actual: extractAgentTask("做个 PPT", false, { tools: { webSearch: false, contentMode: "ppt" } }).type,
    expected: "clarify"
  },
  {
    name: "agent decision exposes search-then-answer only when web gate passes",
    actual: getAgentDecision(
      extractAgentTask("重庆今天温度是多少", false, { tools: { webSearch: true, contentMode: null } }),
      "重庆今天温度是多少",
      { webSearch: true, contentMode: null }
    ).action,
    expected: "search_then_answer"
  },
  {
    name: "image parsing failure can degrade for casual image summary",
    actual: getToolDegradation(
      extractAgentTask("总结一下这张图片", true, { tools: { webSearch: false, contentMode: null } }),
      "image"
    ).canContinue,
    expected: true
  },
  {
    name: "file parsing failure cannot degrade for required conversion",
    actual: getToolDegradation(
      extractAgentTask("把这个文件转换成 Word", true, { tools: { webSearch: false, contentMode: null } }),
      "document"
    ).canContinue,
    expected: false
  }
];

let failed = 0;

for (const item of cases) {
  if (item.actual !== item.expected) {
    failed += 1;
    console.error(`[FAIL] ${item.name}: expected=${String(item.expected)} actual=${String(item.actual)}`);
  } else {
    console.log(`[PASS] ${item.name}`);
  }
}

if (failed > 0) {
  process.exitCode = 1;
}
