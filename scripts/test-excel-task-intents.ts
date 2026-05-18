import { extractAgentTask } from "../lib/agent/router";
import { shouldUseFastChatRoute } from "../lib/agent/task-router";

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function main() {
  const createTask = extractAgentTask("帮我做一个销售统计 Excel，包含汇总和利润率", false);
  assert(createTask.type === "create_spreadsheet", `Expected create_spreadsheet, got ${createTask.type}`);
  assert(createTask.outputFormat === "xlsx", `Expected xlsx output, got ${createTask.outputFormat}`);

  const modifyTask = extractAgentTask("给这个 Excel 加一列利润率并新增汇总 Sheet", true);
  assert(modifyTask.type === "create_spreadsheet", `Expected spreadsheet modification task, got ${modifyTask.type}`);
  assert(modifyTask.requiresFile === true, "Expected spreadsheet modification to require file");

  const chatTask = extractAgentTask("你好，今天状态怎么样？", false);
  assert(chatTask.type === "general_chat", `Expected general chat, got ${chatTask.type}`);
  assert(shouldUseFastChatRoute({ hasFiles: false, task: chatTask, text: "你好，今天状态怎么样？" }), "Expected ordinary chat to stay on fast route");

  const analysisTask = extractAgentTask("帮我分析这个表里销售额为什么下降", true);
  assert(analysisTask.type !== "create_spreadsheet", "Analysis-only file question should not force Excel generation");

  console.log(JSON.stringify({ ok: true, createType: createTask.type, createFormat: createTask.outputFormat, chatType: chatTask.type }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
