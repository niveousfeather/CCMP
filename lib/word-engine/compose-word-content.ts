import { detectWordAttributes } from "./detect-word-attributes";
import type { WordDocumentAttributes, WordPlan, WordRequest, WordSection, WordStylePreset, WordTable } from "./types";

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
  cleaned = cleaned.replace(/资料主题为?/g, "");
  cleaned = cleaned.replace(/\s+/g, " ").replace(/^[，。；：、\s]+/, "").trim();
  return cleaned.slice(0, maxLength);
}

function ensureSentence(value: string) {
  const trimmed = cleanText(value);
  if (!trimmed) return "";
  return /[。！？?]$/.test(trimmed) ? trimmed : `${trimmed}。`;
}

function isStructuredLine(line: string) {
  const compact = line.replace(/\s+/g, "");
  if (/^(姓名|项目|风险|日期|事项|指标)[,，;；、]/.test(compact)) return true;
  if (/^[^,;；]+[,;；][^,;；]+/.test(compact)) return true;
  if (!/，/.test(compact)) return false;
  const cells = compact.split("，").filter(Boolean);
  return cells.length >= 2 && cells.every((cell) => cell.length <= 8);
}

function splitSourceText(value: string) {
  return value
    .split(/\r?\n|[。；;]/)
    .map((line) => cleanText(line, 220))
    .filter((line) => line && !isStructuredLine(line))
    .slice(0, 12);
}

function collectSourceText(request: WordRequest) {
  return [
    request.sourceText || "",
    request.conversationSummary || "",
    ...(request.sourceFiles || []).map((file) => file.text || "")
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function collectSourceLines(request: WordRequest) {
  return splitSourceText(collectSourceText(request));
}

function stripWrongToolWords(value: string) {
  return value
    .replace(/\b(xlsx?|excel|csv|pptx?|ppt|pdf)\b/gi, " ")
    .replace(/表格文件|电子表格|演示文稿|幻灯片|PDF/g, " ");
}

function safeTitle(request: WordRequest, attributes: WordDocumentAttributes) {
  if (attributes.titleStrategy === "cleaned_generic") return "文件内容整理报告";
  const raw = cleanText(request.title || request.instruction, 100);
  const cleaned = stripWrongToolWords(raw)
    .replace(/帮我|请|生成|写一份|写一个|制作|输出|导出|下载|转换|转为|做成|整理成|根据这个文件|根据这份文件|这个文件|这份文件/g, " ")
    .replace(/\bWord\b|\bdocx\b|文档|文件/g, " ")
    .replace(/[，。；、？！：:\s]+/g, " ")
    .trim();
  if (cleaned.length >= 2) return cleaned.slice(0, 42);
  if (attributes.documentKind === "plan" || attributes.documentKind === "training") return "实施方案";
  if (attributes.documentKind === "report") return "资料整理报告";
  if (attributes.documentKind === "summary") return "工作总结";
  return "正式文档";
}

function fallbackSource(title: string, attributes: WordDocumentAttributes) {
  if (attributes.documentKind === "plan" || attributes.documentKind === "training") {
    return [
      `${title}需要围绕背景、目标、路径、时间和成果形成可执行安排。`,
      "正式使用前可结合对象、周期、资源和验收标准继续细化。"
    ];
  }
  if (attributes.documentKind === "report") {
    return [
      `${title}需要围绕背景、资料分析、主要发现和改进建议形成正式报告。`,
      "如后续补充数据或附件，可进一步增强结论依据。"
    ];
  }
  if (attributes.documentKind === "summary") {
    return [
      `${title}需要对阶段工作、关键要点和后续行动进行归纳。`,
      "总结内容应突出事实、结果、问题和下一步建议。"
    ];
  }
  return [
    `${title}需要明确背景、主要信息、重点事实和使用建议。`,
    "可结合实际资料继续补充数据、案例和执行安排。"
  ];
}

function sourceLinesOrFallback(request: WordRequest, title: string, attributes: WordDocumentAttributes) {
  const lines = collectSourceLines(request);
  return lines.length ? lines : fallbackSource(title, attributes);
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

function planSections(title: string, lines: string[], training = false): WordSection[] {
  return [
    section("项目背景", [`${title}以当前材料为基础，先明确问题背景、适用对象和推进条件。`, first(lines, 0, `${title}已具备形成实施安排的基础信息。`)]),
    section("目标定位", [`目标是把材料中的关键信息转化为可执行任务。`, first(lines, 1, "目标应覆盖对象、过程、成果和评价四个方面。")]),
    section("实施路径", [`${training ? "培训内容" : "实施路径"}按照准备、执行、反馈和完善四个环节推进。`, ...lines.slice(0, 4)]),
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
    section("结论", [`${title}应以资料事实为依据，形成可复核、可执行、可持续完善的结论。`])
  ];
}

function summarySections(title: string, lines: string[]): WordSection[] {
  return [
    section("总体概述", [`${title}对阶段性内容进行归纳，突出已经完成的事项、形成的结果和需要继续推进的问题。`, first(lines, 0, "当前材料可支持形成阶段总结。")]),
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
    section("使用建议", ["建议在正式使用前确认适用对象、责任分工、时间安排和验收标准。"])
  ];
}

function buildSections(attributes: WordDocumentAttributes, title: string, lines: string[]) {
  if (attributes.documentKind === "training") return planSections(title, lines, true);
  if (attributes.documentKind === "plan") return planSections(title, lines);
  if (attributes.documentKind === "report") return reportSections(title, lines);
  if (attributes.documentKind === "summary") return summarySections(title, lines);
  return generalSections(title, lines);
}

function applyResumeInstructionSections(sections: WordSection[], request: WordRequest) {
  const instruction = `${request.instruction || ""} ${request.resumeInstruction || ""}`;
  if (!/使用建议|后续建议|补充建议|建议/.test(instruction)) return sections;
  if (sections.some((item) => /使用建议|后续建议/.test(item.heading))) return sections;
  return [
    ...sections,
    section("使用建议", [
      "建议结合当前文档目标补充适用对象、执行方式、反馈渠道和后续完善安排。",
      "如需继续扩展，可把建议拆分为责任分工、时间节点和验收标准。"
    ])
  ];
}

function parseDelimitedRows(source: string): WordTable | null {
  const rows = source
    .split(/\r?\n|[；;]/)
    .map((line) => line.trim())
    .filter((line) => /^[^,，]+[,，][^,，]+/.test(line))
    .map((line) => line.split(/[,，]/).map((cell) => cleanText(cell, 80)).filter(Boolean))
    .filter((row) => row.length >= 2);
  if (rows.length < 2) return null;
  const [headers, ...bodyRows] = rows;
  if (!headers?.length || !bodyRows.length) return null;
  return {
    title: /成绩|分数/.test(headers.join("")) ? "成绩数据整理" : "结构化数据整理",
    headers: headers.slice(0, 6),
    rows: bodyRows.map((row) => row.slice(0, headers.length)).slice(0, 16)
  };
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

function buildAttributeTables(attributes: WordDocumentAttributes, source: string, lines: string[]): WordTable[] {
  if (!attributes.needsTables) return [];
  const structured = parseDelimitedRows(source);
  if (structured) return [structured];
  if (attributes.documentKind === "plan" || attributes.documentKind === "training") {
    return [
      buildTable("任务与安排", [
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
  if (attributes.documentKind === "report") {
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

function subtitleFor(attributes: WordDocumentAttributes, hasConversationSummary: boolean) {
  if (attributes.documentKind === "plan" || attributes.documentKind === "training") return "文档概述：正式方案结构";
  if (hasConversationSummary) return "基于当前对话内容整理";
  return undefined;
}

export function composeWordPlan(request: WordRequest): WordPlan {
  const stylePreset: WordStylePreset = request.stylePreset || "professional";
  const preliminaryAttributes = detectWordAttributes(request);
  const title = safeTitle(request, preliminaryAttributes);
  const source = collectSourceText(request);
  const sourceLines = sourceLinesOrFallback(request, title, preliminaryAttributes);
  const sections = applyResumeInstructionSections(buildSections(preliminaryAttributes, title, sourceLines), request);
  const attributes = detectWordAttributes(request, {
    sectionCount: sections.length,
    estimatedPageCount: Math.max(1, Math.ceil(sections.reduce((total, item) => total + item.paragraphs.join("").length, 0) / 1200))
  });
  const sourceCount = collectSourceLines(request).length;

  return {
    title,
    subtitle: subtitleFor(attributes, Boolean(request.conversationSummary)),
    sections,
    tables: buildAttributeTables(attributes, source, sourceLines),
    metadata: {
      language: request.language || "zh-CN",
      stylePreset,
      sourceCount,
      attributes
    }
  };
}
