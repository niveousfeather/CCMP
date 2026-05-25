import type { WordDocumentAttributes, WordRequest } from "./types";

type AttributeHints = {
  sectionCount?: number;
  estimatedPageCount?: number;
};

function sourceText(request: WordRequest) {
  return [request.title, request.instruction, request.sourceText, request.conversationSummary, ...(request.sourceFiles || []).map((file) => file.text || file.fileName)]
    .filter(Boolean)
    .join("\n");
}

function documentKind(text: string): WordDocumentAttributes["documentKind"] {
  if (/会议纪要|会议记录|minutes/i.test(text)) return "minutes";
  if (/培训|手册|training/i.test(text)) return "training";
  if (/方案|计划|实施|项目|执行|proposal|plan/i.test(text)) return "plan";
  if (/报告|调研|分析|report/i.test(text)) return "report";
  if (/总结|复盘|摘要|summary/i.test(text)) return "summary";
  return "general";
}

function theme(text: string): WordDocumentAttributes["theme"] {
  if (/财务|数据|统计|成绩|分数|Excel|xlsx|表格|金额|销售|指标/i.test(text)) return "green";
  if (/教育|培训|学术|教学|课程|教师|学生|教研|学校/i.test(text)) return "blue";
  if (/方案|项目|执行|计划|实施|路径/i.test(text)) return "orange";
  if (/创意|设计|活动|品牌|海报|策划/i.test(text)) return "purple";
  return "gray";
}

function hasStructuredData(text: string) {
  return (
    /姓名\s*[,，、;；]\s*成绩/i.test(text) ||
    /项目\s*[,，、;；]\s*(建议|措施|说明)/i.test(text) ||
    /风险\s*[,，、;；]\s*(措施|应对)/i.test(text) ||
    /日期\s*[,，、;；]\s*(事项|安排)/i.test(text) ||
    /(^|\n)\s*[^,\n，]+[,，]\s*[^,\n，]+(\n|$)/.test(text)
  );
}

function hasWrongToolTitle(title: string) {
  return /\b(excel|xlsx|csv|ppt|pptx|pdf)\b|表格文件|电子表格|演示文稿/i.test(title);
}

export function detectWordAttributes(request: WordRequest, hints: AttributeHints = {}): WordDocumentAttributes {
  const text = sourceText(request);
  const kind = documentKind(text);
  const sectionCount = hints.sectionCount ?? 0;
  const estimatedPageCount = hints.estimatedPageCount ?? Math.max(1, Math.ceil(text.length / 1200));
  const explicitToc = /目录|toc|table of contents/i.test(text);
  const formal = /正式|完整|长文档|手册|报告|方案|培训|纪要|formal/i.test(text) || kind === "report" || kind === "plan" || kind === "training" || kind === "minutes";

  return {
    documentKind: kind,
    formality: formal ? "formal" : "simple",
    needsToc: explicitToc || /正式报告|长文档|完整方案|培训手册/i.test(text) || sectionCount >= 5 || estimatedPageCount > 2,
    needsHeaderFooter: kind === "report" || kind === "plan" || kind === "training" || kind === "minutes",
    needsTables: /表格|列表|table/i.test(text) || hasStructuredData(text) || ((kind === "plan" || kind === "report") && Boolean(request.sourceText?.trim())),
    theme: theme(text),
    titleStrategy: hasWrongToolTitle(request.title || "") ? "cleaned_generic" : request.title?.trim() ? "from_user" : "from_source"
  };
}
