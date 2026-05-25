import type { AgentContentMode } from "@/lib/agent/types";
import type { DeepWritingDetection } from "@/lib/agent/runtime/deep-writing-detector";

export type WordWriteMode = "export_existing" | "compose_simple" | "compose_deep" | "answer_only";

export type WordWriteDocumentKind = "lesson_plan" | "report" | "plan" | "summary" | "manual" | "notice" | "general";

export type WordWriteModeDecision = {
  mode: WordWriteMode;
  reason: string;
  confidence: "low" | "medium" | "high";
  shouldUseDeepWriting: boolean;
  shouldGenerateImmediateDocx: boolean;
  requiresContentGeneration: boolean;
  documentKind: WordWriteDocumentKind;
};

export type WordWriteModeClassifierInput = {
  userText: string;
  contentMode?: AgentContentMode | null;
  sourceText?: string;
  fileCount?: number;
  sourceFileNames?: string[];
  deepWritingDetection?: DeepWritingDetection;
};

const adviceTerms = [
  "Word 怎么排版",
  "word 怎么排版",
  "标题怎么设置",
  "目录怎么做",
  "页眉页脚怎么设置",
  "文档结构怎么改",
  "怎么排版",
  "怎么设置标题",
  "格式建议",
  "排版建议"
];

const exportTerms = [
  "整理成 Word",
  "整理为 Word",
  "导出成 Word",
  "导出为 Word",
  "转成 Word",
  "转为 Word",
  "生成 Word",
  "生成 docx",
  "转成 docx",
  "把以上内容",
  "把下面这段内容",
  "根据以上内容",
  "根据下面内容",
  "整理成文档"
];

const fromScratchTerms = ["帮我写", "写一个", "写一份", "生成一份", "生成一个", "撰写", "起草", "设计一份"];

const deepTerms = [
  "教案",
  "教学设计",
  "课程设计",
  "课程方案",
  "授课计划",
  "授课内容完整",
  "授课内容也要完整",
  "课时",
  "学时",
  "教学过程",
  "教学目标",
  "教学重点",
  "教学难点",
  "实训任务",
  "考核评价",
  "细致一点",
  "详细一点",
  "完整一点",
  "完整",
  "深度",
  "调研报告",
  "正式报告",
  "完整方案",
  "多文件",
  "多资料",
  "分章节",
  "培训手册",
  "白皮书",
  "长文档",
  "长文"
];

const simpleComposeTerms = ["通知", "简单说明", "简短说明", "简短活动方案", "活动方案", "开业通知", "说明 Word", "通知 Word"];

function normalize(value?: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value?: string) {
  return normalize(value).replace(/\s+/g, "");
}

function includesAny(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  const compactLower = compact(text).toLowerCase();
  return terms.some((term) => {
    const normalizedTerm = term.toLowerCase();
    return lower.includes(normalizedTerm) || compactLower.includes(compact(normalizedTerm));
  });
}

function asksForLength(text: string) {
  return /\d{3,}\s*字/.test(text) || /[二三四五六七八九一两]\s*千\s*字/.test(text);
}

function hasMeaningfulSource(sourceText?: string) {
  return normalize(sourceText).length >= 180;
}

function sourceLooksCompleteComparedToInstruction(userText: string, sourceText?: string) {
  const source = normalize(sourceText);
  const instruction = normalize(userText);
  return source.length >= 300 && source.length > instruction.length * 3;
}

function asksFromScratch(text: string) {
  return includesAny(text, fromScratchTerms);
}

function documentKindFromText(text: string, deepWritingDetection?: DeepWritingDetection): WordWriteDocumentKind {
  if (/教案|教学设计|课程设计|授课计划|课时|学时|教学过程|实训任务/.test(text)) return "lesson_plan";
  if (/培训手册|手册|manual/i.test(text)) return "manual";
  if (/调研|研究|报告|分析|report/i.test(text)) return "report";
  if (/总结|摘要|summary/i.test(text)) return "summary";
  if (/通知|公告|告知/.test(text)) return "notice";
  if (/方案|计划|规划|plan/i.test(text)) return "plan";
  if (deepWritingDetection?.suggestedDocumentKind === "manual") return "manual";
  if (deepWritingDetection?.suggestedDocumentKind === "research" || deepWritingDetection?.suggestedDocumentKind === "report") return "report";
  if (deepWritingDetection?.suggestedDocumentKind === "summary") return "summary";
  if (deepWritingDetection?.suggestedDocumentKind === "plan") return "plan";
  return "general";
}

function decision(input: Omit<WordWriteModeDecision, "shouldUseDeepWriting" | "shouldGenerateImmediateDocx" | "requiresContentGeneration">): WordWriteModeDecision {
  return {
    ...input,
    shouldUseDeepWriting: input.mode === "compose_deep" || input.mode === "compose_simple",
    shouldGenerateImmediateDocx: input.mode === "export_existing",
    requiresContentGeneration: input.mode === "compose_deep" || input.mode === "compose_simple"
  };
}

export function classifyWordWriteMode(input: WordWriteModeClassifierInput): WordWriteModeDecision {
  const text = normalize(input.userText);
  const sourceText = normalize(input.sourceText);
  const fileCount = input.fileCount ?? input.sourceFileNames?.length ?? 0;
  const documentKind = documentKindFromText(text, input.deepWritingDetection);

  if (!text) {
    return decision({
      mode: "answer_only",
      reason: "empty_input",
      confidence: "low",
      documentKind
    });
  }

  if (includesAny(text, adviceTerms) && !asksFromScratch(text)) {
    return decision({
      mode: "answer_only",
      reason: "word_advice_only",
      confidence: "high",
      documentKind
    });
  }

  if (input.deepWritingDetection?.enabled) {
    return decision({
      mode: "compose_deep",
      reason: `deep_writing_detector:${input.deepWritingDetection.reason}`,
      confidence: input.deepWritingDetection.confidence,
      documentKind
    });
  }

  if ((hasMeaningfulSource(sourceText) || fileCount > 0) && includesAny(text, exportTerms) && !asksFromScratch(text)) {
    return decision({
      mode: "export_existing",
      reason: "explicit_export_existing_content",
      confidence: "high",
      documentKind
    });
  }

  if (sourceLooksCompleteComparedToInstruction(text, sourceText) && !asksFromScratch(text)) {
    return decision({
      mode: "export_existing",
      reason: "source_text_dominates_instruction",
      confidence: "medium",
      documentKind
    });
  }

  if (includesAny(text, deepTerms) || asksForLength(text) || fileCount >= 2) {
    return decision({
      mode: "compose_deep",
      reason: "complex_write_from_scratch",
      confidence: "high",
      documentKind
    });
  }

  if (input.contentMode === "write" || asksFromScratch(text) || includesAny(text, simpleComposeTerms)) {
    return decision({
      mode: "compose_simple",
      reason: "simple_write_from_scratch",
      confidence: "medium",
      documentKind
    });
  }

  return decision({
    mode: "answer_only",
    reason: "no_word_generation_needed",
    confidence: "low",
    documentKind
  });
}
