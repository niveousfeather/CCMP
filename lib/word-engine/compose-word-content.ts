import type { WordPlan, WordRequest, WordSection, WordStylePreset, WordTable } from "./types";

const pollutionPatterns = [
  /我将围绕/g,
  /本文将/g,
  /附件依据[:：]?/g,
  /避免空泛套话/g,
  /生成正文时优先/g,
  /根据用户要求/g,
  /作为\s*AI/g,
  /以下内容来自[:：]?/g,
  /内部任务[:：]?/g,
  /内部说明/g,
  /不应出现在正文/g,
  /不能进入正文/g,
  /wordTaskMemory/g,
  /completedSections/g,
  /pendingSections/g,
  /currentStage/g,
  /resumeInstruction/g,
  /failureReason/g,
  /mock/gi,
  /placeholder/gi,
  /TODO/gi
];

function cleanText(value?: string, maxLength = 600) {
  let cleaned = String(value || "");
  for (const pattern of pollutionPatterns) cleaned = cleaned.replace(pattern, "");
  cleaned = cleaned.replace(/\s+/g, " ").replace(/^[，。；：、\s]+/, "").trim();
  if (/不应出现在正文|不能进入正文|内部说明/.test(cleaned)) return "";
  return cleaned.slice(0, maxLength);
}

function ensureSentence(value: string) {
  const trimmed = cleanText(value);
  if (!trimmed) return "";
  return /[。！？!?]$/.test(trimmed) ? trimmed : `${trimmed}。`;
}

function splitSourceText(value: string) {
  return value
    .split(/\r?\n|[。；;]/)
    .map((line) => cleanText(line, 220))
    .filter(Boolean)
    .slice(0, 10);
}

function collectSourceLines(request: WordRequest) {
  const source = [
    request.sourceText || "",
    request.conversationSummary || "",
    ...(request.sourceFiles || []).map((file) => file.text || "")
  ]
    .filter(Boolean)
    .join("\n");
  return splitSourceText(source);
}

function inferDocumentKind(request: WordRequest) {
  const text = `${request.title} ${request.instruction}`.toLowerCase();
  if (/总结|复盘|summary/.test(text)) return "summary" as const;
  if (/方案|计划|实施|培训|proposal|plan/.test(text)) return "plan" as const;
  if (/报告|分析|调研|资料|文件|整理|校验|检查|report/.test(text)) return "report" as const;
  return "general" as const;
}

function safeTitle(request: WordRequest) {
  const raw = cleanText(request.title || request.instruction, 100)
    .replace(/\b(xlsx?|excel|csv|pptx?|pdf)\b/gi, " ")
    .replace(/表格|电子表格|演示文稿|幻灯片|PDF/g, " ")
    .replace(/帮我|请|生成|写一份|写一个|制作|输出|导出|下载|转换|转为|做成|整理成|根据这个文件|根据这份文件|这个文件|这份文件/g, " ")
    .replace(/\bWord\b|\bdocx\b|文档|文件/g, " ")
    .replace(/[，。；、:：?？!！]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const compact = raw.replace(/整理/g, "").trim();
  if (/excel|xlsx?|csv|表格|电子表格/i.test(request.title || "")) return "文件内容报告";
  if (compact.length >= 2) return compact.slice(0, 42);
  const kind = inferDocumentKind(request);
  if (kind === "plan") return "实施方案";
  if (kind === "report") return "资料报告";
  if (kind === "summary") return "工作总结";
  return "正式文档";
}

function fallbackSource(title: string, kind: ReturnType<typeof inferDocumentKind>) {
  if (kind === "plan") {
    return [
      `${title}需要围绕背景、目标、路径、时间和成果形成可执行安排。`,
      "正式使用前可结合对象、周期、资源和验收标准继续细化。"
    ];
  }
  if (kind === "report") {
    return [`${title}需要围绕背景、资料分析、主要发现和改进建议形成正式报告。`, "如后续补充数据或附件，可进一步增强结论依据。"];
  }
  if (kind === "summary") {
    return [`${title}需要对阶段工作、关键要点和后续行动进行归纳。`, "总结内容应突出事实、结果、问题和下一步建议。"];
  }
  return [`${title}需要明确背景、核心内容、重点信息和使用建议。`, "可结合实际资料继续补充数据、案例和执行安排。"];
}

function sourceLinesOrFallback(request: WordRequest, title: string, kind: ReturnType<typeof inferDocumentKind>) {
  const lines = collectSourceLines(request);
  return lines.length ? lines : fallbackSource(title, kind);
}

function section(heading: string, paragraphs: string[]): WordSection {
  return {
    heading,
    paragraphs: paragraphs.map(ensureSentence).filter(Boolean)
  };
}

function first(lines: string[], index: number, fallback: string) {
  return ensureSentence(lines[index] || fallback);
}

function buildTable(title: string, rows: string[][]): WordTable {
  return {
    title,
    headers: ["项目", "说明"],
    rows: rows
      .map((row) => row.map((cell) => cleanText(cell, 140)))
      .filter((row) => row.every(Boolean))
      .slice(0, 6)
  };
}

function planSections(title: string, lines: string[]): WordSection[] {
  return [
    section("项目背景", [`${title}以当前材料为基础，先明确问题背景、适用对象和推进条件。`, first(lines, 0, `${title}已具备形成实施安排的基础信息。`)]),
    section("目标定位", [`本方案的目标是把材料中的关键信息转化为可执行任务。`, first(lines, 1, "目标应覆盖对象、过程、成果和评价四个方面。")]),
    section("实施路径", [`实施路径按照准备、执行、反馈和完善四个环节推进。`, ...lines.slice(0, 4)]),
    section("时间安排", ["建议先完成资料确认，再进入分工执行、阶段检查和结果验收。"]),
    section("风险与应对", ["重点关注资源不足、进度延迟、协同不畅和反馈滞后等风险，并预留调整机制。"]),
    section("预期成果", [`预期形成与${title}相关的阶段成果、执行记录和后续改进依据。`])
  ];
}

function reportSections(title: string, lines: string[]): WordSection[] {
  return [
    section("摘要", [`${title}围绕资料背景、关键事实、主要发现和建议进行正式归纳。`, first(lines, 0, "当前资料已具备形成初步判断的基础。")]),
    section("背景", [first(lines, 1, `${title}的背景部分用于说明资料来源、对象和分析目的。`)]),
    section("资料分析", lines.slice(0, 5).length ? lines.slice(0, 5) : [`围绕${title}的核心资料进行分类分析。`]),
    section("主要发现", [`从现有资料看，${first(lines, 2, "需要重点关注事实依据、变化趋势和执行结果。")}`]),
    section("建议", ["建议把关键事实转化为明确行动，并结合责任分工、时间节点和评价标准持续跟进。"]),
    section("结论", [`${title}应以资料事实为依据，形成可复核、可执行、可继续完善的结论。`])
  ];
}

function summarySections(title: string, lines: string[]): WordSection[] {
  return [
    section("总体概述", [`${title}对阶段性内容进行归纳，突出已经完成的事项、形成的结果和需要继续推进的问题。`, first(lines, 0, "当前材料可支撑形成阶段总结。")]),
    section("关键要点", lines.slice(0, 5).length ? lines.slice(0, 5) : [`围绕${title}梳理关键成果、关键问题和关键经验。`]),
    section("分类整理", [`可从目标、过程、结果和问题四个维度整理${title}的主要内容。`, first(lines, 1, "分类整理应保留具体事实，减少笼统表述。")]),
    section("后续建议", ["后续应继续补充数据、案例和执行反馈，并把改进事项落实到责任人和时间节点。"])
  ];
}

function generalSections(title: string, lines: string[]): WordSection[] {
  return [
    section("文档概述", [`${title}围绕当前主题整理为正式文档，便于后续提交、讨论或继续完善。`, first(lines, 0, `${title}需要先明确目标、对象和使用场景。`)]),
    section("背景与目标", [first(lines, 1, "背景与目标部分用于说明为什么需要形成该文档，以及希望达成的结果。")]),
    section("主要内容", lines.slice(0, 5).length ? lines.slice(0, 5) : [`围绕${title}归纳主要事项、执行要点和结果要求。`]),
    section("重点信息整理", [`重点信息应保留事实、对象、数据和关键词，避免只保留宽泛判断。`, first(lines, 2, "当前资料可继续补充更多事实依据。")]),
    section("使用建议", ["建议在正式使用前确认适用对象、责任分工、时间安排和验收标准。"]),
    section("结论", [`${title}可以作为当前阶段的正式材料基础，后续可依据更多资料继续细化。`])
  ];
}

function buildSections(kind: ReturnType<typeof inferDocumentKind>, title: string, lines: string[]) {
  if (kind === "plan") return planSections(title, lines);
  if (kind === "report") return reportSections(title, lines);
  if (kind === "summary") return summarySections(title, lines);
  return generalSections(title, lines);
}

function buildTables(kind: ReturnType<typeof inferDocumentKind>, lines: string[]): WordTable[] {
  if (kind === "plan") {
    return [
      buildTable("后续任务", [
        ["资料确认", lines[0] || "确认主题、对象和现有材料"],
        ["执行推进", "按阶段安排落实路径、责任和产出"],
        ["效果评估", "结合结果反馈完善后续行动"]
      ]),
      buildTable("风险与应对", [
        ["进度延迟", "设置阶段检查和调整窗口"],
        ["信息不足", "补充数据、案例和责任说明"],
        ["协同不畅", "明确分工和反馈渠道"]
      ])
    ];
  }
  if (kind === "report") {
    return [
      buildTable("信息分类", [
        ["事实依据", lines[0] || "保留可核验资料"],
        ["分析判断", lines[1] || "形成基于资料的判断"],
        ["改进建议", "转化为后续行动"]
      ])
    ];
  }
  return [
    buildTable("使用建议", [
      ["适用场景", "用于提交、讨论或继续完善"],
      ["补充材料", "可加入数据、案例和时间安排"],
      ["后续任务", "明确责任分工和验收标准"]
    ])
  ];
}

export function composeWordPlan(request: WordRequest): WordPlan {
  const stylePreset: WordStylePreset = request.stylePreset || "professional";
  const kind = inferDocumentKind(request);
  const title = safeTitle(request);
  const sourceLines = sourceLinesOrFallback(request, title, kind);
  const sections = buildSections(kind, title, sourceLines);
  const sourceCount = collectSourceLines(request).length;

  return {
    title,
    subtitle: kind === "plan" ? "文档概述：正式方案结构" : request.conversationSummary ? "基于当前对话内容整理" : undefined,
    sections,
    tables: buildTables(kind, sourceLines),
    metadata: {
      language: request.language || "zh-CN",
      stylePreset,
      sourceCount
    }
  };
}
