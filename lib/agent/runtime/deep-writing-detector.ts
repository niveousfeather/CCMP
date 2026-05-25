import type { AgentRuntimeTargetTool } from "@/lib/agent/runtime/types";

export type DeepWritingDocumentKind = "report" | "plan" | "research" | "manual" | "summary" | "general";

export type DeepWritingDetection = {
  enabled: boolean;
  trigger: "explicit" | "complexity" | "none";
  reason: string;
  confidence: "low" | "medium" | "high";
  suggestedDocumentKind: DeepWritingDocumentKind;
  shouldAutoOpenPanel: boolean;
};

export type DeepWritingDetectionInput = {
  userText: string;
  targetTool?: AgentRuntimeTargetTool;
  sourceText?: string;
  fileCount?: number;
  sourceFileNames?: string[];
};

const explicitDeepWritingPattern =
  /深度写作|深度写|深度思考|深度分析|调研报告|高级报告|完整方案|搜集资料|检索资料|多资料整理|长文档|培训手册|白皮书|行业分析|分章节写|写\s*[3-9]\d{3,}\s*字以上|写\s*[一二三四五六七八九十]+千字以上/i;

const complexityPattern = /正式报告|完整方案|调研报告|培训手册|搜集资料|检索资料|分章节|高级一点|详细一点|深入一点|长文|白皮书|行业分析/i;
const simpleWordPattern = /怎么排版|目录怎么做|页眉页脚怎么设置|怎么写|一页说明|导出\s*docx|转成\s*docx/i;
const fileAnalysisOnlyPattern = /总结一下|分析这个文档|提取.*重点|这个附件.*讲了什么|对比这两个文件/i;
const wordOutputPattern = /word|docx|文档|报告|方案|手册/i;

function normalize(value?: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function kindFromText(text: string): DeepWritingDocumentKind {
  if (/调研|研究|行业分析|白皮书|research/i.test(text)) return "research";
  if (/培训手册|手册|manual/i.test(text)) return "manual";
  if (/方案|计划|实施|项目|plan/i.test(text)) return "plan";
  if (/报告|分析|report/i.test(text)) return "report";
  if (/总结|复盘|summary/i.test(text)) return "summary";
  return "general";
}

function disabled(reason: string, suggestedDocumentKind: DeepWritingDocumentKind = "general"): DeepWritingDetection {
  return {
    enabled: false,
    trigger: "none",
    reason,
    confidence: "low",
    suggestedDocumentKind,
    shouldAutoOpenPanel: false
  };
}

function enabled(
  trigger: DeepWritingDetection["trigger"],
  reason: string,
  confidence: DeepWritingDetection["confidence"],
  suggestedDocumentKind: DeepWritingDocumentKind
): DeepWritingDetection {
  return {
    enabled: true,
    trigger,
    reason,
    confidence,
    suggestedDocumentKind,
    shouldAutoOpenPanel: true
  };
}

export function detectDeepWritingMode(input: DeepWritingDetectionInput): DeepWritingDetection {
  const text = normalize(input.userText);
  const sourceText = normalize(input.sourceText);
  const fileCount = input.fileCount ?? input.sourceFileNames?.length ?? 0;
  const kind = kindFromText(text);
  const targetTool = input.targetTool || "none";
  const asksForWordOutput = targetTool === "word" || wordOutputPattern.test(text);

  if (!text) return disabled("empty_input", kind);
  if (targetTool === "file-analysis" && fileAnalysisOnlyPattern.test(text)) return disabled("file_analysis_only", kind);
  if (simpleWordPattern.test(text) && !complexityPattern.test(text) && !explicitDeepWritingPattern.test(text)) return disabled("simple_word_or_advice", kind);
  if (!asksForWordOutput && !explicitDeepWritingPattern.test(text)) return disabled("not_word_output", kind);

  if (explicitDeepWritingPattern.test(text)) {
    return enabled("explicit", "explicit_deep_writing_phrase", "high", kind);
  }
  if (fileCount >= 2 && /生成|整理|写|导出|word|docx|文档|报告/i.test(text)) {
    return enabled("complexity", "multiple_current_conversation_files", "high", kind === "general" ? "report" : kind);
  }
  if (sourceText.length > 8000) {
    return enabled("complexity", `sourceText_length_${sourceText.length}`, "high", kind === "general" ? "report" : kind);
  }
  if (complexityPattern.test(text)) {
    return enabled("complexity", "complex_document_requirement", "medium", kind);
  }

  return disabled("normal_word_generation", kind);
}
