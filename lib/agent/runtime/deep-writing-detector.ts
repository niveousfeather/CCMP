import type { AgentRuntimeTargetTool } from "@/lib/agent/runtime/types";

export type DeepWritingDocumentKind = "lesson_plan" | "report" | "plan" | "research" | "manual" | "summary" | "general";

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
  "教案",
  "教学设计",
  "课程设计",
  "课程方案",
  "授课计划",
  "授课内容完整",
  "细致一点",
  "详细一点",
  "完整一点",
  "娣卞害",
  "璋冪爺",
  "鎶ュ憡",
  "瀹屾暣鏂规",
  "澶氳祫鏂",
  "闀挎枃",
  "鍩硅",
  "鎵嬪唽",
  "鐧界毊涔",
  "琛屼笟鍒嗘瀽"
];

const complexityTerms = [
  "正式报告",
  "完整方案",
  "调研报告",
  "培训手册",
  "高级一点",
  "详细一点",
  "细致一点",
  "深入一点",
  "完整一点",
  "授课内容完整",
  "长文",
  "白皮书",
  "行业分析",
  "教案",
  "教学设计",
  "课程设计",
  "课程方案",
  "授课计划",
  "课时",
  "学时",
  "分章节",
  "姝ｅ紡鎶",
  "瀹屾暣鏂规",
  "璋冪爺鎶",
  "鍩硅",
  "鎵嬪唽",
  "璇︾粏",
  "闀挎枃",
  "鐧界毊涔",
  "琛層笟鍒嗘瀽"
];

const simpleAdviceTerms = [
  "Word 怎么排版",
  "word 怎么排版",
  "标题怎么设置",
  "目录怎么做",
  "页眉页脚怎么设置",
  "文档结构怎么改",
  "怎么排版",
  "怎么设置标题",
  "排版建议",
  "鎬庝箞鎺掔増",
  "鐩綍鎬庝箞鍋",
  "椤电湁椤佃剼"
];

const fileAnalysisOnlyTerms = ["总结一下", "分析这个文档", "提取重点", "讲了什么", "对比这两个文件", "鎬荤粨", "鍒嗘瀽", "鎻愬彇"];
const wordOutputTerms = ["word", "docx", "文档", "报告", "方案", "手册", "教案", "教学设计", "课程设计", "鏂囨", "鎶ュ憡", "鏂规", "鎵嬪唽"];

function normalize(value?: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function compact(value?: string) {
  return normalize(value).replace(/\s+/g, "");
}

function includesAny(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  const compactLower = compact(text).toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()) || compactLower.includes(compact(term).toLowerCase()));
}

function kindFromText(text: string): DeepWritingDocumentKind {
  if (includesAny(text, ["教案", "教学设计", "课程设计", "授课计划", "课时", "学时", "教学过程", "实训任务", "lesson plan"])) {
    return "lesson_plan";
  }
  if (includesAny(text, ["璋冪爺", "鐮旂┒", "琛屼笟鍒嗘瀽", "鐧界毊涔"])) return "research";
  if (includesAny(text, ["鍩硅", "鎵嬪唽"])) return "manual";
  if (includesAny(text, ["鏂规", "璁″垝", "瀹炴柦", "椤圭洰"])) return "plan";
  if (includesAny(text, ["鎶ュ憡", "鍒嗘瀽"])) return "report";
  if (includesAny(text, ["鎬荤粨", "澶嶇洏"])) return "summary";
  if (includesAny(text, ["调研", "研究", "行业分析", "白皮书", "research"])) return "research";
  if (includesAny(text, ["培训手册", "手册", "manual"])) return "manual";
  if (includesAny(text, ["方案", "计划", "实施", "项目", "plan"])) return "plan";
  if (includesAny(text, ["报告", "分析", "report"])) return "report";
  if (includesAny(text, ["总结", "复盘", "summary"])) return "summary";
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
  return /\d{3,}\s*字/.test(text) || /[一二三四五六七八九两]\s*千\s*字/.test(text);
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
