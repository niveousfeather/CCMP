import { parseDocxPackage } from "./docx-package";
import { applyParagraphRevisions, extractEditableParagraphs, type DocxEditableParagraph } from "./docx-paragraphs";
import { planDocumentTask } from "./planner";
import { sanitizeDocumentFileName, uploadDocumentBuffer, uploadDocumentReport } from "./storage";
import type { DocumentTaskInput, DocumentTaskResult } from "./types";

export type OriginalDocumentRevisionTarget = {
  paragraphIndex: number;
  text: string;
};

function getDocxSourceFile(input: DocumentTaskInput) {
  return input.sourceFiles?.find(
    (file) => /\.docx$/i.test(file.fileName) || /wordprocessingml\.document/i.test(file.mimeType || "")
  );
}

function getEditedFileName(input: DocumentTaskInput, sourceFileName: string) {
  if (input.fileName) return input.fileName;
  const baseName = sanitizeDocumentFileName(sourceFileName.replace(/\.docx$/i, ""));
  return `${baseName}-修改版`;
}

function toTargets(paragraphs: DocxEditableParagraph[]): OriginalDocumentRevisionTarget[] {
  return paragraphs.map((paragraph) => ({
    paragraphIndex: paragraph.paragraphIndex,
    text: paragraph.text
  }));
}

export function extractOriginalDocumentRevisionTargets(input: DocumentTaskInput): OriginalDocumentRevisionTarget[] {
  const sourceFile = getDocxSourceFile(input);
  if (!sourceFile) throw new Error("DOCUMENT_REVISE_SOURCE_DOCX_REQUIRED");

  const docx = parseDocxPackage(sourceFile.buffer);
  const documentXml = docx.getText("word/document.xml");
  if (!documentXml) throw new Error("DOCUMENT_XML_NOT_FOUND");

  return toTargets(extractEditableParagraphs(documentXml));
}

function buildRevisionReport(targets: OriginalDocumentRevisionTarget[], revisedCount: number, tableCount: number) {
  return [
    "# Word 原格式修改报告",
    "",
    `- 可编辑段落：${targets.length} 段`,
    `- 已应用修改：${revisedCount} 段`,
    `- 已插入表格：${tableCount} 个`,
    tableCount > 0
      ? "- 修改方式：段落级最小替换；按用户要求将安全正文段落替换为真实 Word 表格"
      : "- 修改方式：段落级最小替换，保留原段落属性与首个文本样式",
    "- 保留内容：未修改媒体文件、页眉页脚、目录域、图片、复杂对象和包内关系"
  ].join("\n");
}

export async function reviseOriginalDocument(input: DocumentTaskInput): Promise<DocumentTaskResult> {
  const sourceFile = getDocxSourceFile(input);
  if (!sourceFile) throw new Error("DOCUMENT_REVISE_SOURCE_DOCX_REQUIRED");

  const docx = parseDocxPackage(sourceFile.buffer);
  const documentXml = docx.getText("word/document.xml");
  if (!documentXml) throw new Error("DOCUMENT_XML_NOT_FOUND");

  const paragraphs = extractEditableParagraphs(documentXml);
  if (!paragraphs.length) throw new Error("DOCUMENT_NO_EDITABLE_PARAGRAPHS");

  const revisions = input.reviseOriginal?.revisedParagraphs || [];
  const tableRevisions = input.reviseOriginal?.tableRevisions || [];
  const applied = applyParagraphRevisions(documentXml, paragraphs, revisions, tableRevisions);
  docx.setText("word/document.xml", applied.documentXml);

  const plan = planDocumentTask({
    ...input,
    requestedMode: "revise_original",
    sourceFileNames: [sourceFile.fileName]
  });
  const file = await uploadDocumentBuffer({
    userId: input.userId,
    buffer: docx.toBuffer(),
    fileName: getEditedFileName(input, sourceFile.fileName)
  });
  const reportMarkdown = buildRevisionReport(toTargets(paragraphs), applied.revisedCount, applied.tableCount);
  const reportFile = await uploadDocumentReport({
    userId: input.userId,
    markdown: reportMarkdown,
    fileName: getEditedFileName(input, sourceFile.fileName)
  });

  return {
    file,
    files: [file, reportFile],
    plan,
    reportFile,
    reportMarkdown
  };
}
