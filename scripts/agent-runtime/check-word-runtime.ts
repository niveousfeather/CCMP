import { planAgentRuntimeTurn } from "@/lib/agent/runtime";
import type { AgentRuntimeDecision, AgentRuntimeInput, AgentRuntimeTargetTool } from "@/lib/agent/runtime";

type ExpectedDecision = {
  intent?: AgentRuntimeDecision["intent"];
  targetTool?: AgentRuntimeTargetTool;
  nextAction?: AgentRuntimeDecision["nextAction"];
  missingIncludes?: string[];
  forbiddenTargetTools?: AgentRuntimeTargetTool[];
  allowToolExecution?: boolean;
};

type WordRuntimeCase = {
  name: string;
  input: string;
  runtimeInput: AgentRuntimeInput;
  expected: ExpectedDecision;
};

const cases: WordRuntimeCase[] = [
  answerChat("Word layout advice stays chat", "Word 怎么排版？"),
  answerChat("Word TOC advice stays chat", "Word 目录怎么做？"),
  answerChat("Word header footer advice stays chat", "Word 页眉页脚怎么设置？"),
  answerChat("Word formula advice stays chat", "这个 Word 公式怎么写？"),
  answerChat("Word structure advice stays chat", "Word 文档结构怎么设计？"),
  answerChat("Text polishing without file stays chat", "帮我优化这段文字，不要生成文件"),
  answerChat("Plan idea without generation stays chat", "给我一份方案思路，不要生成"),
  answerChat("Formal writing advice stays chat", "这个文档怎么写更正式？"),

  wordCase("Generic Word generation asks topic", "帮我生成一份 Word", {
    targetTool: "word",
    nextAction: "ask_clarification",
    missingIncludes: ["subject"],
    allowToolExecution: false
  }),
  wordCase("Generic docx generation asks topic", "帮我生成一个 docx", {
    targetTool: "word",
    nextAction: "ask_clarification",
    missingIncludes: ["subject"],
    allowToolExecution: false
  }),
  wordCase("Downloadable Word report has subject", "写一份可下载的 Word 报告", {
    targetTool: "word",
    nextAction: "run_legacy_tool",
    allowToolExecution: true
  }),
  wordCase(
    "File to Word uses current file task",
    "根据这个文件整理成 Word",
    {
      targetTool: "word",
      nextAction: "run_legacy_tool",
      allowToolExecution: true
    },
    { activeTask: { id: "file-task-1", kind: "file-analysis", title: "report.txt", status: "completed" } }
  ),
  wordCase(
    "Uploaded material to Word uses current file task",
    "根据上传资料生成 Word 文档",
    {
      targetTool: "word",
      nextAction: "run_legacy_tool",
      allowToolExecution: true
    },
    { activeTask: { id: "file-task-1", kind: "file-analysis", title: "资料.pdf", status: "completed" } }
  ),
  wordCase(
    "Export above content to docx uses current summary",
    "把上面内容导出成 docx",
    {
      targetTool: "word",
      nextAction: "run_legacy_tool",
      allowToolExecution: true
    },
    { cachedConversationSummary: "上文总结了 AI 教育培训的目标、对象和实施步骤。" }
  ),
  wordCase(
    "Export previous summary to Word uses current summary",
    "把刚才的总结生成 Word",
    {
      targetTool: "word",
      nextAction: "run_legacy_tool",
      allowToolExecution: true
    },
    { cachedConversationSummary: "刚才的总结包括课程目标、培训安排和评估方式。" }
  ),
  wordCase("Training plan Word has explicit topic", "生成一份培训方案 Word 文档", {
    targetTool: "word",
    nextAction: "run_legacy_tool",
    allowToolExecution: true
  }),

  fileAnalysis("File summary stays file analysis", "根据这个文件总结一下", { missingIncludes: ["file"], nextAction: "ask_clarification", allowToolExecution: false }),
  fileAnalysis("Analyze document stays file analysis", "帮我分析这个文档", {
    activeTask: { id: "file-task-1", kind: "file-analysis", title: "report.docx", status: "completed" }
  }),
  fileAnalysis("Extract key points stays file analysis", "提取这个文档的重点", {
    activeTask: { id: "file-task-1", kind: "file-analysis", title: "report.pdf", status: "completed" }
  }),
  fileAnalysis("Compare two files stays file analysis", "对比这两个文件", {
    files: [
      { name: "a.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      { name: "b.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
    ]
  }),
  fileAnalysis("Attachment question stays file analysis", "这个附件里讲了什么？", {
    activeTask: { id: "file-task-1", kind: "file-analysis", title: "attachment.txt", status: "completed" }
  }),

  clarify("Vague organize asks clarification", "整理一下", ["topic"]),
  clarify("Vague file organize without file asks clarification", "根据这个文件整理一下", ["file"]),
  clarify("Continue previous document without context asks clarification", "继续刚才的文档", ["active_task"]),
  clarify("Make it formal without object asks clarification", "帮我弄成正式一点", ["topic"]),
  clarify("Vague export without object asks clarification", "导出一下", ["output_format"])
];

function input(content: string, overrides: Partial<AgentRuntimeInput> = {}): AgentRuntimeInput {
  return {
    messages: [{ role: "user", content }],
    ...overrides
  };
}

function answerChat(name: string, content: string): WordRuntimeCase {
  return {
    name,
    input: content,
    runtimeInput: input(content),
    expected: {
      intent: "general_chat",
      targetTool: "none",
      nextAction: "answer_chat",
      forbiddenTargetTools: ["word"],
      allowToolExecution: false
    }
  };
}

function wordCase(name: string, content: string, expected: ExpectedDecision, overrides: Partial<AgentRuntimeInput> = {}): WordRuntimeCase {
  return {
    name,
    input: content,
    runtimeInput: input(content, overrides),
    expected: { intent: "word", ...expected }
  };
}

function fileAnalysis(name: string, content: string, overridesOrExpected: Partial<AgentRuntimeInput> | ExpectedDecision = {}): WordRuntimeCase {
  const isExpected = "targetTool" in overridesOrExpected || "nextAction" in overridesOrExpected || "missingIncludes" in overridesOrExpected;
  const overrides = isExpected ? {} : overridesOrExpected;
  const expected = isExpected ? (overridesOrExpected as ExpectedDecision) : {};
  return {
    name,
    input: content,
    runtimeInput: input(content, overrides as Partial<AgentRuntimeInput>),
    expected: {
      intent: "file_analysis",
      targetTool: "file-analysis",
      nextAction: "run_legacy_tool",
      forbiddenTargetTools: ["word"],
      allowToolExecution: true,
      ...expected
    }
  };
}

function clarify(name: string, content: string, missingIncludes: string[]): WordRuntimeCase {
  return {
    name,
    input: content,
    runtimeInput: input(content),
    expected: {
      nextAction: "ask_clarification",
      missingIncludes,
      allowToolExecution: false
    }
  };
}

function decisionSummary(decision: AgentRuntimeDecision) {
  return {
    intent: decision.intent,
    targetTool: decision.targetTool,
    nextAction: decision.nextAction,
    missingInputs: decision.missingInputs,
    needsTool: decision.needsTool
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
  if (typeof expected.allowToolExecution === "boolean") {
    const allowsExecution = decision.nextAction === "run_legacy_tool";
    if (allowsExecution !== expected.allowToolExecution) {
      failures.push(`tool execution expected ${expected.allowToolExecution}, got ${allowsExecution}`);
    }
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
  console.error(`  expected: ${JSON.stringify(item.expected)}`);
  console.error(`  actual: ${JSON.stringify(decisionSummary(plan.decision))}`);
  for (const failure of failures) console.error(`  - ${failure}`);
}

if (failed > 0) {
  console.error(`Agent Word runtime regression failed: ${failed}/${cases.length} cases failed.`);
  process.exit(1);
}

console.log(`Agent Word runtime regression passed. ${cases.length}/${cases.length} PASS.`);
