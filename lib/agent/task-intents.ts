export type ExplicitFileGenerationTool = "write" | "ppt" | "excel";

export const OUTPUT_INTENT_VERBS = [
  "generate",
  "create",
  "make",
  "build",
  "export",
  "save",
  "download",
  "write",
  "draft",
  "convert",
  "organize",
  "update",
  "modify",
  "add",
  "生成",
  "输出",
  "导出",
  "保存",
  "下载",
  "发我",
  "给我",
  "整理",
  "做成",
  "做一个",
  "做一份",
  "做个",
  "创建",
  "制作",
  "撰写",
  "起草",
  "转换",
  "设计",
  "修改",
  "更新",
  "新增",
  "添加",
  "鐢熸垚",
  "杈撳嚭",
  "瀵煎嚭",
  "淇濆瓨",
  "涓嬭浇",
  "鍙戞垜",
  "缁欐垜",
  "鏁寸悊",
  "鍋氭垚",
  "鍋氫竴涓",
  "鍋氫竴浠",
  "鍋氫釜",
  "杞垚",
  "杞负",
  "璁捐",
  "鍒朵綔",
  "鍒涘缓"
] as const;

export const PRESENTATION_TARGET_TERMS = ["ppt", "pptx", "slides", "presentation", "演示文稿", "幻灯片", "课件", "婕旂ず鏂囩", "骞荤伅鐗", "璇句欢"] as const;

export const SPREADSHEET_TARGET_TERMS = [
  "excel",
  "xlsx",
  "spreadsheet",
  "workbook",
  "worksheet",
  "sheet",
  "table",
  "csv",
  "表格",
  "电子表格",
  "工作簿",
  "工作表",
  "销售统计",
  "预算表",
  "进度表",
  "客户跟进表",
  "公式",
  "汇总"
] as const;

export const WORD_TARGET_TERMS = [
  "word",
  "docx",
  "document",
  "report",
  "proposal",
  "summary",
  "manual",
  "briefing",
  "formal document",
  "word文档",
  "文档",
  "文件",
  "报告",
  "方案书",
  "方案",
  "总结",
  "说明书",
  "汇报材料",
  "正式文稿"
] as const;

export const LESSON_PLAN_TARGET_TERMS = ["教案", "教学设计", "课程设计", "课时设计", "授课教案", "教学方案", "鏁欐", "鏁欏", "璇剧▼", "绋嬫暀瀛", "瀛﹁", "鏁欏璁捐", "鏁欏璁璁", "璇剧▼璁捐", "璇炬椂璁捐", "鏁欏鏂规"] as const;

export const GENERIC_FUNCTION_TARGET_TERMS = [
  ...WORD_TARGET_TERMS,
  ...PRESENTATION_TARGET_TERMS,
  ...SPREADSHEET_TARGET_TERMS,
  "pdf",
  "image",
  "图片",
  "图像",
  "海报",
  "配图"
] as const;

export const HOW_TO_QUESTION_TERMS = [
  "how to",
  "怎么",
  "如何",
  "怎样",
  "怎么写",
  "如何写",
  "怎样写",
  "怎么做",
  "如何做",
  "怎样做",
  "怎么制作",
  "如何制作",
  "怎样制作",
  "怎么设计",
  "如何设计",
  "怎样设计",
  "怎么保存",
  "如何保存",
  "怎样保存",
  "怎么导出",
  "如何导出",
  "怎样导出"
  ,"鎬庝箞"
  ,"濡備綍"
  ,"鎬庢牱"
] as const;

function compactText(text: string) {
  return text.toLowerCase().replace(/\s+/g, "");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeAlternation(values: readonly string[]) {
  return values.map((value) => escapeRegex(value.toLowerCase().replace(/\s+/g, ""))).join("|");
}

function hasOrderedIntent(text: string, verbs: readonly string[], targets: readonly string[], windowSize: number) {
  const normalized = compactText(text);
  const verbPattern = makeAlternation(verbs);
  const targetPattern = makeAlternation(targets);
  return (
    new RegExp(`(?:${verbPattern}).{0,${windowSize}}(?:${targetPattern})`, "i").test(normalized) ||
    new RegExp(`(?:${targetPattern}).{0,${windowSize}}(?:${verbPattern})`, "i").test(normalized)
  );
}

function hasHowToQuestionIntent(text: string) {
  const normalized = compactText(text);
  return HOW_TO_QUESTION_TERMS.some((term) => normalized.includes(term.toLowerCase().replace(/\s+/g, "")));
}

export function hasExplicitPresentationOutputIntent(text: string) {
  if (hasHowToQuestionIntent(text)) return false;
  return hasOrderedIntent(text, OUTPUT_INTENT_VERBS, PRESENTATION_TARGET_TERMS, 48);
}

export function hasExplicitWordOutputIntent(text: string) {
  if (hasHowToQuestionIntent(text)) return false;
  return hasOrderedIntent(text, OUTPUT_INTENT_VERBS, WORD_TARGET_TERMS, 48);
}

export function hasExplicitSpreadsheetOutputIntent(text: string) {
  if (hasHowToQuestionIntent(text)) return false;
  return hasOrderedIntent(text, OUTPUT_INTENT_VERBS, SPREADSHEET_TARGET_TERMS, 64);
}

export function hasExplicitLessonPlanOutputIntent(text: string) {
  if (hasHowToQuestionIntent(text)) return false;
  return hasOrderedIntent(text, OUTPUT_INTENT_VERBS, LESSON_PLAN_TARGET_TERMS, 64);
}

export function isFunctionalArtifactTask(text: string) {
  if (hasHowToQuestionIntent(text)) return false;
  return (
    hasOrderedIntent(text, OUTPUT_INTENT_VERBS, GENERIC_FUNCTION_TARGET_TERMS, 48) ||
    hasExplicitLessonPlanOutputIntent(text)
  );
}

export function getExplicitFileGenerationTool(text: string): ExplicitFileGenerationTool | null {
  if (hasExplicitPresentationOutputIntent(text)) return "ppt";
  if (hasExplicitSpreadsheetOutputIntent(text)) return "excel";
  if (hasExplicitWordOutputIntent(text) || hasExplicitLessonPlanOutputIntent(text)) return "write";
  return null;
}
