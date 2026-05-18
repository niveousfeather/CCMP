import type { GeneratedAgentFile } from "@/lib/agent/types";
import { runDocumentTask } from "@/lib/document";
import type { DocxTableRevision } from "@/lib/document/docx-paragraphs";
import type { DocumentTemplate } from "@/lib/document";
import type { WordGenerationIntent } from "@/lib/document/plan";

export type WordDocumentResult = {
  file: GeneratedAgentFile;
  files: GeneratedAgentFile[];
  reportFile?: GeneratedAgentFile | null;
  reportMarkdown?: string;
};

export type WordTransformMode = "summarize" | "concise" | "rewrite_formal" | "structured";
export type WordLengthHint = "short" | "medium" | "long" | "1000_words" | "2_pages";

export type WordTaskIntent = {
  requestedFileName?: string;
  documentType?: "报告" | "方案书" | "会议纪要" | "总结" | "说明书" | "汇报材料" | "正式文稿" | "文档";
  transformMode?: WordTransformMode;
  lengthHint?: WordLengthHint;
};

export const wordTaskKeywords = [
  "生成 Word",
  "输出 Word",
  "生成 word",
  "输出 word",
  "发我 Word",
  "发我 word",
  "Word 文件",
  "word 文件",
  "Word 下载",
  "word 下载",
  "Word 链接",
  "word 链接",
  "生成 docx",
  "输出 docx",
  "下载 docx",
  "docx 下载",
  "docx 链接",
  "下载链接",
  "生成文档",
  "生成报告",
  "做一份方案书",
  "生成方案书",
  "生成会议纪要",
  "输出正式文稿",
  "生成总结",
  "生成说明书",
  "生成汇报材料",
  "整理成文档",
  "做一份文档"
];

function mapDocumentTemplate(documentType?: string): DocumentTemplate {
  if (documentType === "report") return "report";
  if (documentType === "proposal") return "proposal";
  if (documentType === "meeting_minutes") return "meeting_minutes";
  if (documentType === "lesson_plan") return "lesson_plan";
  if (documentType === "formal_doc") return "formal_doc";
  return "general";
}

export async function createWordDocument({
  userId,
  title,
  markdown,
  fileName,
  sourceFileNames,
  generationPrompt,
  generationIntent,
  documentType,
  sourceFiles,
  requestedMode,
  reviseComments,
  reviseOriginal
}: {
  userId: string;
  title: string;
  markdown: string;
  fileName?: string;
  sourceFileNames?: string[];
  generationPrompt?: string;
  generationIntent?: WordGenerationIntent;
  documentType?: string;
  sourceFiles?: Array<{ fileName: string; mimeType?: string; buffer: Buffer }>;
  requestedMode?: "create" | "create_from_sources" | "revise_comments" | "revise_original" | "polish";
  reviseComments?: {
    instruction?: string;
    revisedParagraphs?: Array<{
      commentId: string;
      revisedText: string;
    }>;
  };
  reviseOriginal?: {
    instruction?: string;
    revisedParagraphs?: Array<{
      paragraphIndex: number;
      revisedText: string;
    }>;
    tableRevisions?: DocxTableRevision[];
  };
}): Promise<WordDocumentResult> {
  const result = await runDocumentTask({
    userId,
    title,
    markdown,
    generationPrompt,
    generationIntent,
    fileName,
    sourceFileNames,
    sourceFiles,
    requestedMode,
    template: mapDocumentTemplate(documentType),
    reviseComments,
    reviseOriginal
  });

  return {
    file: result.file,
    files: result.files,
    reportFile: result.reportFile,
    reportMarkdown: result.reportMarkdown
  };
}
