import { composeLessonPlanContent } from "./compose-lesson-plan-content";
import { detectWordAttributes } from "./detect-word-attributes";
import type { WordDocumentAttributes, WordPlan, WordRequest, WordSection, WordStylePreset, WordTable } from "./types";

const pollutionPatterns = [
  /作为\s*AI/gi,
  /wordTaskMemory/g,
  /deepWritingTaskMemory/g,
  /completedSections/g,
  /pendingSections/g,
  /currentStage/g,
  /resumeInstruction/g,
  /failureReason/g,
  /mock/gi,
  /placeholder/gi,
  /TODO/gi,
  /prompt/gi,
  /provider/gi,
  /chain-of-thought/gi,
  /internal JSON/gi
];

function cleanText(value?: string, maxLength = 900) {
  let cleaned = String(value || "");
  for (const pattern of pollutionPatterns) cleaned = cleaned.replace(pattern, "");
  return cleaned.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function ensureSentence(value: string) {
  const trimmed = cleanText(value);
  if (!trimmed) return "";
  return /[。！？.!?]$/.test(trimmed) ? trimmed : `${trimmed}。`;
}

function collectSourceText(request: WordRequest) {
  const seen = new Set<string>();
  return [
    request.sourceText || "",
    request.conversationSummary || "",
    ...(request.sourceFiles || []).map((file) => file.text || "")
  ]
    .map((part) => part.trim())
    .filter((part) => {
      const key = part.replace(/\s+/g, "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n")
    .trim();
}

function splitSourceParagraphs(value: string) {
  return String(value || "")
    .split(/\n{2,}|\r?\n|(?<=[。！？!?])\s+/)
    .map((line) => cleanText(line, 500))
    .filter((line) => line && !isDelimitedDataLine(line))
    .slice(0, 18);
}

function isDelimitedDataLine(value: string) {
  const cells = value.split(/[,\t;]/).map((cell) => cell.trim()).filter(Boolean);
  return cells.length >= 2 && cells.length <= 6 && cells.every((cell) => cell.length <= 80);
}

function stripRequestWords(value: string) {
  return cleanText(value, 120)
    .replace(/帮我|请|生成|写一份|写一个|制作|输出|导出|下载|转换|转为|做成|整理成|整理为|根据这个文件|根据这份文件|把以上内容|把下面这段内容/g, " ")
    .replace(/\bWord\b|\bdocx\b|文档|文件/gi, " ")
    .replace(/[，。；、？！：:\s]+/g, " ")
    .trim();
}

function safeTitle(request: WordRequest, attributes: WordDocumentAttributes) {
  if (attributes.titleStrategy === "cleaned_generic") return "文件内容整理报告";
  if (attributes.documentKind === "lesson_plan") {
    const raw = cleanText(request.title || request.instruction, 120);
    const topic =
      raw.match(/([\u4e00-\u9fa5A-Za-z0-9]+(?:动画|课程|教学|实训|语文|数学|英语|信息科技)[\u4e00-\u9fa5A-Za-z0-9]*)/)?.[1] ||
      raw.replace(/帮我|请|生成|写一个|写一份|设计|Word|word|docx|文档|教案|教学设计|课程设计|课时|学时|\d+\s*个?\s*课时|\d+\s*字/g, " ").replace(/[，。；、？！：:\s]+/g, " ").trim();
    const cleaned = topic.replace(/的$/, "").trim();
    if (cleaned.length >= 2) return `${cleaned.includes("教案") ? cleaned : `${cleaned}教案`}`.slice(0, 42);
    return "课程教学设计教案";
  }
  const cleaned = stripRequestWords(request.title || request.instruction);
  if (cleaned.length >= 2) return cleaned.slice(0, 42);
  if (attributes.documentKind === "plan" || attributes.documentKind === "training") return "实施方案";
  if (attributes.documentKind === "report") return "资料整理报告";
  if (attributes.documentKind === "summary") return "工作总结";
  return "正式文档";
}

function section(heading: string, paragraphs: string[]): WordSection {
  return {
    heading,
    paragraphs: paragraphs.map(ensureSentence).filter(Boolean)
  };
}

function parseDelimitedRows(source: string): WordTable | null {
  const rows = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[^,\t;]+[,\t;][^,\t;]+/.test(line))
    .map((line) => line.split(/[,\t;]/).map((cell) => cleanText(cell, 80)).filter(Boolean))
    .filter((row) => row.length >= 2);
  if (rows.length < 2) return null;
  const [headers, ...bodyRows] = rows;
  if (!headers?.length || !bodyRows.length) return null;
  const columnCount = headers.length;
  if (columnCount < 2 || columnCount > 6) return null;
  if (headers.some((cell) => cell.length > 24)) return null;
  if (bodyRows.filter((row) => row.length === columnCount && row.every((cell) => cell.length <= 80)).length < 1) return null;
  return {
    title: /成绩|分数/.test(headers.join("")) ? "成绩数据整理" : "结构化数据整理",
    headers: headers.slice(0, 6),
    rows: bodyRows.map((row) => row.slice(0, headers.length)).slice(0, 16)
  };
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
  return [`${title}需要明确背景、主要信息、重点事实和使用建议。`, "可结合实际资料继续补充数据、案例和时间安排。"];
}

function buildExistingContentSections(title: string, lines: string[]): WordSection[] {
  const primary = lines.slice(0, 4);
  const secondary = lines.slice(4, 10);
  const remaining = lines.slice(10, 16);
  const sections: WordSection[] = [
    section("原文整理", primary.length ? primary : [`${title}已根据现有材料整理为正式 Word 文档。`])
  ];
  if (secondary.length) {
    sections.push(section("关键信息归纳", secondary));
  } else {
    sections.push(section("关键信息归纳", ["当前材料已保留主要事实、执行要求和使用场景，便于后续审阅。"]));
  }
  if (remaining.length) {
    sections.push(section("补充材料", remaining));
  }
  sections.push(section("后续使用建议", ["建议在正式发布前核对名称、时间、责任人、附件和格式要求，并根据使用对象补充签发信息。"]));
  return sections;
}

function planSections(title: string, lines: string[], training = false): WordSection[] {
  const pathIntro = training
    ? "实施路径围绕培训准备、课程执行、过程反馈和持续完善四个环节推进，培训内容同步嵌入各阶段任务。"
    : "实施路径按照准备、执行、反馈和完善四个环节推进。";
  return [
    section("项目背景", [`${title}以当前材料为基础，先明确问题背景、适用对象和推进条件。`, lines[0] || `${title}已具备形成实施安排的基础信息。`]),
    section("目标定位", ["目标是把材料中的关键信息转化为可执行任务。", lines[1] || "目标应覆盖对象、过程、成果和评价四个方面。"]),
    section("实施路径", [pathIntro, ...(lines.slice(0, 4).length ? lines.slice(0, 4) : ["需要结合实际资源和责任分工细化执行步骤。"])]),
    section("时间安排", ["建议先完成资料确认，再进入分工执行、阶段检查和结果验收。"]),
    section("风险与应对", ["重点关注资源不足、进度延迟、协同不畅和反馈滞后等风险，并预留调整机制。"]),
    section("预期成果", [`预期形成与${title}相关的阶段成果、执行记录和后续改进依据。`])
  ];
}

function reportSections(title: string, lines: string[]): WordSection[] {
  return [
    section("摘要", [`${title}围绕资料背景、关键事实、主要发现和建议进行正式归纳。`, lines[0] || "当前资料已具备形成初步判断的基础。"]),
    section("背景", [lines[1] || `${title}的背景部分用于说明资料来源、对象和分析目的。`]),
    section("资料分析", lines.slice(0, 5).length ? lines.slice(0, 5) : [`围绕${title}的核心资料进行分类分析。`]),
    section("主要发现", [`从现有资料看，需要重点关注事实依据、变化趋势和执行结果。`, lines[2] || "后续可继续补充数据和案例。"]),
    section("建议", ["建议把关键事实转化为明确行动，并结合责任分工、时间节点和评价标准持续跟进。"]),
    section("结论", [`${title}应以资料事实为依据，形成可复核、可执行、可持续完善的结论。`])
  ];
}

function summarySections(title: string, lines: string[]): WordSection[] {
  return [
    section("总体概述", [`${title}对阶段性内容进行归纳，突出已经完成的事项、形成的结果和需要继续推进的问题。`, lines[0] || "当前材料可支持形成阶段总结。"]),
    section("关键要点", lines.slice(0, 5).length ? lines.slice(0, 5) : [`围绕${title}梳理关键成果、关键问题和关键经验。`]),
    section("分类整理", [`可从目标、过程、结果和问题四个维度整理${title}的主要内容。`, lines[1] || "分类整理应保留具体事实，减少笼统表述。"]),
    section("后续建议", ["后续应继续补充数据、案例和执行反馈，并把改进事项落实到责任人和时间节点。"])
  ];
}

function generalSections(title: string, lines: string[]): WordSection[] {
  return [
    section("文档概述", [`${title}围绕当前主题整理为正式文档，便于后续提交、讨论或继续完善。`, lines[0] || `${title}需要先明确目标、对象和使用场景。`]),
    section("背景与目标", [lines[1] || "背景与目标部分用于说明为什么需要形成该文档，以及希望达成的结果。"]),
    section("主要内容", lines.slice(0, 5).length ? lines.slice(0, 5) : [`围绕${title}归纳主要事项、执行要点和结果要求。`]),
    section("使用建议", ["建议在正式使用前确认适用对象、责任分工、时间安排和验收标准。"])
  ];
}

function buildGeneratedSections(attributes: WordDocumentAttributes, title: string, lines: string[]) {
  if (attributes.documentKind === "training") return planSections(title, lines, true);
  if (attributes.documentKind === "plan") return planSections(title, lines);
  if (attributes.documentKind === "report") return reportSections(title, lines);
  if (attributes.documentKind === "summary") return summarySections(title, lines);
  return generalSections(title, lines);
}

function buildTables(attributes: WordDocumentAttributes, source: string): WordTable[] {
  if (!attributes.needsTables) return [];
  const structured = parseDelimitedRows(source);
  return structured ? [structured] : [];
}

function subtitleFor(request: WordRequest, attributes: WordDocumentAttributes) {
  if (request.contentOrigin === "existing_content") return "基于已有内容整理";
  if (attributes.documentKind === "plan" || attributes.documentKind === "training") return "正式方案结构";
  if (request.conversationSummary) return "基于当前对话内容整理";
  return undefined;
}

export function composeWordPlan(request: WordRequest): WordPlan {
  const stylePreset: WordStylePreset = request.stylePreset || "professional";
  const preliminaryAttributes = detectWordAttributes(request);
  if (preliminaryAttributes.documentKind === "lesson_plan") {
    const content = composeLessonPlanContent(request, preliminaryAttributes);
    return {
      title: content.title,
      subtitle: content.subtitle,
      sections: content.sections,
      tables: content.tables,
      metadata: {
        language: request.language || "zh-CN",
        stylePreset,
        sourceCount: splitSourceParagraphs(collectSourceText(request)).length,
        attributes: content.attributes
      }
    };
  }

  const title = safeTitle(request, preliminaryAttributes);
  const source = collectSourceText(request);
  const sourceLines = splitSourceParagraphs(source);
  const lines = sourceLines.length ? sourceLines : fallbackSource(title, preliminaryAttributes);
  const sections =
    request.contentOrigin === "existing_content" && sourceLines.length
      ? buildExistingContentSections(title, sourceLines)
      : buildGeneratedSections(preliminaryAttributes, title, lines);
  const attributes = detectWordAttributes(request, {
    sectionCount: sections.length,
    estimatedPageCount: Math.max(1, Math.ceil(sections.reduce((total, item) => total + item.paragraphs.join("").length, 0) / 1200))
  });

  return {
    title,
    subtitle: subtitleFor(request, attributes),
    sections,
    tables: buildTables(attributes, source),
    metadata: {
      language: request.language || "zh-CN",
      stylePreset,
      sourceCount: sourceLines.length,
      attributes
    }
  };
}
