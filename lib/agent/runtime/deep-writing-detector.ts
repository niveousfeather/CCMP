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

const explicitDeepWritingTerms = [
  "深度写作",
  "深度写",
  "深度思考",
  "深度分析",
  "调研报告",
  "高级报告",
  "完整方案",
  "搜集资料",
  "检索资料",
  "多资料整理",
  "长文档",
  "培训手册",
  "白皮书",
  "行业分析",
  "分章节写",
  "娣卞害",
  "璋冪爺",
  "楂樼骇",
  "瀹屾暣",
  "鎼滈泦",
  "闀挎枃",
  "鐧界毊"
];

const complexityTerms = ["正式报告", "完整方案", "调研报告", "培训手册", "高级一点", "详细一点", "深入一点", "长文", "白皮书", "行业分析"];
const simpleAdviceTerms = ["怎么排版", "目录怎么做", "页眉页脚怎么设置", "一页说明"];
const fileAnalysisOnlyTerms = ["总结一下", "分析这个文档", "提取重点", "讲了什么", "对比这两个文件"];
const wordOutputTerms = ["word", "docx", "文档", "报告", "方案", "手册"];

function normalize(value?: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function includesAny(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function kindFromText(text: string): DeepWritingDocumentKind {
  if (includesAny(text, ["调研", "研究", "行业分析", "白皮书", "research", "璋冪爺", "鐮旂┒"])) return "research";
  if (includesAny(text, ["培训手册", "手册", "manual", "鍩硅鎵嬪唽"])) return "manual";
  if (includesAny(text, ["方案", "计划", "实施", "项目", "plan", "鏂规", "璁″垝"])) return "plan";
  if (includesAny(text, ["报告", "分析", "report", "鎶ュ憡"])) return "report";
  if (includesAny(text, ["总结", "复盘", "summary", "鎬荤粨"])) return "summary";
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

function asksForLongLength(text: string) {
  return /写\s*[3-9]\d{3,}\s*字以上/i.test(text) || /写\s*[一二三四五六七八九十]+千字以上/i.test(text);
}

export function detectDeepWritingMode(input: DeepWritingDetectionInput): DeepWritingDetection {
  const text = normalize(input.userText);
  const sourceText = normalize(input.sourceText);
  const fileCount = input.fileCount ?? input.sourceFileNames?.length ?? 0;
  const kind = kindFromText(text);
  const targetTool = input.targetTool || "none";
  const explicit = includesAny(text, explicitDeepWritingTerms) || asksForLongLength(text);
  const complex = includesAny(text, complexityTerms);
  const asksForWordOutput = targetTool === "word" || includesAny(text, wordOutputTerms);

  if (!text) return disabled("empty_input", kind);
  if (targetTool === "file-analysis" && includesAny(text, fileAnalysisOnlyTerms)) return disabled("file_analysis_only", kind);
  if (includesAny(text, simpleAdviceTerms) && !complex && !explicit) return disabled("simple_word_or_advice", kind);
  if (!asksForWordOutput && !explicit) return disabled("not_word_output", kind);

  if (explicit) return enabled("explicit", "explicit_deep_writing_phrase", "high", kind);
  if (fileCount >= 2 && /生成|整理|写|导出|word|docx|文档|报告/i.test(text)) {
    return enabled("complexity", "multiple_current_conversation_files", "high", kind === "general" ? "report" : kind);
  }
  if (sourceText.length > 8000) {
    return enabled("complexity", `sourceText_length_${sourceText.length}`, "high", kind === "general" ? "report" : kind);
  }
  if (complex) return enabled("complexity", "complex_document_requirement", "medium", kind);

  return disabled("normal_word_generation", kind);
}
