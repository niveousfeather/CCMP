import type { DocumentTaskInput, DocumentTaskPlan, DocumentTemplate } from "./types";

function inferTemplate(title: string, markdown: string, explicit?: DocumentTemplate): DocumentTemplate {
  if (explicit) return explicit;
  const text = `${title}\n${markdown}`.toLowerCase();
  if (/会议|纪要|minutes/.test(text)) return "meeting_minutes";
  if (/教学|教案|课程|lesson/.test(text)) return "lesson_plan";
  if (/方案|计划|proposal/.test(text)) return "proposal";
  if (/报告|分析|调研|report/.test(text)) return "report";
  if (/通知|公文|正式|发言稿|formal/.test(text)) return "formal_doc";
  return "general";
}

export function planDocumentTask(input: DocumentTaskInput): DocumentTaskPlan {
  const sourceFileNames = input.sourceFileNames?.filter(Boolean) || [];
  const mode = input.requestedMode || (sourceFileNames.length ? "create_from_sources" : "create");
  const template = inferTemplate(input.title, input.markdown, input.template);
  const report = [
    mode === "revise_comments"
      ? "已根据 Word 批注生成修订版文档。"
      : mode === "revise_original"
        ? "已在原 Word 文档基础上生成保格式修改版。"
      : mode === "polish"
        ? "已对 Word 文档进行格式美化处理。"
        : mode === "create_from_sources"
          ? "已基于上传资料生成新 Word 文档。"
          : "已从零生成新 Word 文档。",
    `已应用 ${template} 文档模板。`,
    "已统一标题层级、正文间距、列表和表格样式。",
    "已通过文档生产模块上传并返回下载文件。"
  ];

  return {
    mode,
    template,
    title: input.title,
    fileName: input.fileName,
    sourceFileNames,
    report
  };
}
