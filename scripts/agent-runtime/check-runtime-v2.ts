import { planAgentRuntimeTurn } from "@/lib/agent/runtime";
import type { AgentRuntimeDecision, AgentRuntimeInput, AgentRuntimeTargetTool } from "@/lib/agent/runtime";

type ExpectedDecision = {
  intent?: AgentRuntimeDecision["intent"];
  targetTool?: AgentRuntimeTargetTool;
  nextAction?: AgentRuntimeDecision["nextAction"];
  missingIncludes?: string[];
  forbiddenTargetTools?: AgentRuntimeTargetTool[];
};

type RuntimeCase = {
  name: string;
  input: string;
  runtimeInput: AgentRuntimeInput;
  expected: ExpectedDecision;
};

const cases: RuntimeCase[] = [
  {
    name: "普通聊天不调用工具",
    input: "随便聊聊",
    runtimeInput: input("随便聊聊"),
    expected: { targetTool: "none", nextAction: "answer_chat" }
  },
  {
    name: "PPT 咨询只聊天",
    input: "PPT怎么做？",
    runtimeInput: input("PPT怎么做？"),
    expected: { targetTool: "none", nextAction: "answer_chat", forbiddenTargetTools: ["ppt-simple"] }
  },
  {
    name: "明确生成简单 PPT",
    input: "帮我生成一个10页PPT，主题是AI教育",
    runtimeInput: input("帮我生成一个10页PPT，主题是AI教育"),
    expected: { targetTool: "ppt-simple", nextAction: "run_legacy_tool" }
  },
  {
    name: "学术 PPT 模糊请求先追问",
    input: "生成学术PPT",
    runtimeInput: input("生成学术PPT"),
    expected: { nextAction: "ask_clarification", forbiddenTargetTools: ["ppt-simple", "academic-ppt"] }
  },
  {
    name: "Excel 公式咨询不生成 xlsx",
    input: "这个Excel公式怎么写？",
    runtimeInput: input("这个Excel公式怎么写？"),
    expected: { targetTool: "none", nextAction: "answer_chat", forbiddenTargetTools: ["excel"] }
  },
  {
    name: "Excel 导出调用工具",
    input: "把这些数据导出成Excel：姓名，成绩；张三，90；李四，85",
    runtimeInput: input("把这些数据导出成Excel：姓名，成绩；张三，90；李四，85"),
    expected: { targetTool: "excel", nextAction: "run_legacy_tool" }
  },
  {
    name: "Word 生成调用工具",
    input: "帮我生成一份AI教育培训方案Word文档",
    runtimeInput: input("帮我生成一份AI教育培训方案Word文档"),
    expected: { targetTool: "word", nextAction: "run_legacy_tool" }
  },
  {
    name: "当前对话有文件 activeTask 时继续文件分析",
    input: "这个文件再总结短一点",
    runtimeInput: input("这个文件再总结短一点", { activeTask: { id: "file-task-1", kind: "file-analysis", title: "report.txt", status: "completed" } }),
    expected: { targetTool: "file-analysis", nextAction: "run_legacy_tool" }
  },
  {
    name: "新对话无文件上下文时追问",
    input: "这个文件再总结短一点",
    runtimeInput: input("这个文件再总结短一点"),
    expected: { nextAction: "ask_clarification", missingIncludes: ["file"] }
  },
  {
    name: "当前对话有 image activeTask 时修改图片",
    input: "把刚才那张图标题改成XXX",
    runtimeInput: input("把刚才那张图标题改成XXX", { activeTask: { id: "image-task-1", kind: "image", title: "教学场景图", status: "completed" } }),
    expected: { targetTool: "image", nextAction: "run_legacy_tool" }
  },
  {
    name: "新对话无 image activeTask 时追问",
    input: "把刚才那张图标题改成XXX",
    runtimeInput: input("把刚才那张图标题改成XXX"),
    expected: { nextAction: "ask_clarification", missingIncludes: ["image_to_edit"] }
  },
  {
    name: "当前对话有 PPT activeTask 时先确认重新生成边界",
    input: "继续刚才的PPT，改成正式一点",
    runtimeInput: input("继续刚才的PPT，改成正式一点", { activeTask: { id: "ppt-task-1", kind: "ppt", title: "AI教育", status: "completed" } }),
    expected: { targetTool: "ppt-simple", nextAction: "ask_clarification", missingIncludes: ["ppt_regeneration_confirmation"] }
  },
  {
    name: "当前对话明确重新生成 PPT 新版时调用工具",
    input: "重新生成一个更正式版本",
    runtimeInput: input("重新生成一个更正式版本", { activeTask: { id: "ppt-task-1", kind: "ppt", title: "AI教育", status: "completed" } }),
    expected: { targetTool: "ppt-simple", nextAction: "run_legacy_tool" }
  },
  {
    name: "新对话不继承 PPT activeTask",
    input: "继续刚才的PPT，改成正式一点",
    runtimeInput: input("继续刚才的PPT，改成正式一点"),
    expected: { nextAction: "ask_clarification", missingIncludes: ["active_task"] }
  },
  {
    name: "不要生成先给方案只聊天",
    input: "不要生成，先给我一个AI教育PPT方案",
    runtimeInput: input("不要生成，先给我一个AI教育PPT方案"),
    expected: { targetTool: "none", nextAction: "answer_chat", forbiddenTargetTools: ["ppt-simple"] }
  },
  {
    name: "教学架构图调用工具",
    input: "生成教学架构图，主题是数字赋能课程改革",
    runtimeInput: input("生成教学架构图，主题是数字赋能课程改革"),
    expected: { targetTool: "teaching-diagram", nextAction: "run_legacy_tool" }
  },
  {
    name: "知识图谱调用工具",
    input: "生成知识图谱，主题是人工智能发展史",
    runtimeInput: input("生成知识图谱，主题是人工智能发展史"),
    expected: { targetTool: "knowledge-graph", nextAction: "run_legacy_tool" }
  }
];

function input(content: string, overrides: Partial<AgentRuntimeInput> = {}): AgentRuntimeInput {
  return {
    messages: [{ role: "user", content }],
    ...overrides
  };
}

function decisionSummary(decision: AgentRuntimeDecision) {
  return {
    intent: decision.intent,
    targetTool: decision.targetTool,
    nextAction: decision.nextAction,
    missingInputs: decision.missingInputs
  };
}

function validateDecision(decision: AgentRuntimeDecision, expected: ExpectedDecision) {
  const failures: string[] = [];
  if (expected.intent && decision.intent !== expected.intent) failures.push(`intent expected ${expected.intent}, got ${decision.intent}`);
  if (expected.targetTool && decision.targetTool !== expected.targetTool) failures.push(`targetTool expected ${expected.targetTool}, got ${decision.targetTool}`);
  if (expected.nextAction && decision.nextAction !== expected.nextAction) failures.push(`nextAction expected ${expected.nextAction}, got ${decision.nextAction}`);
  for (const missingInput of expected.missingIncludes || []) {
    if (!decision.missingInputs.includes(missingInput)) {
      failures.push(`missingInputs expected to include ${missingInput}, got [${decision.missingInputs.join(", ")}]`);
    }
  }
  for (const forbiddenTool of expected.forbiddenTargetTools || []) {
    if (decision.targetTool === forbiddenTool) failures.push(`targetTool must not be ${forbiddenTool}`);
  }
  return failures;
}

let failed = 0;

for (const item of cases) {
  const plan = planAgentRuntimeTurn(item.runtimeInput);
  const failures = validateDecision(plan.decision, item.expected);
  if (failures.length === 0) {
    console.log(`PASS ${item.name}`);
    continue;
  }

  failed += 1;
  console.error(`FAIL ${item.name}`);
  console.error(`  input: ${item.input}`);
  console.error(`  actual: ${JSON.stringify(decisionSummary(plan.decision))}`);
  console.error(`  expected: ${JSON.stringify(item.expected)}`);
  for (const failure of failures) console.error(`  - ${failure}`);
}

if (failed > 0) {
  console.error(`Agent Runtime V2 regression failed: ${failed}/${cases.length} cases failed.`);
  process.exit(1);
}

console.log("Agent Runtime V2 regression passed.");
