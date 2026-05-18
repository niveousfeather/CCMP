import {
  buildRevisedParagraph,
  clearDocxCommentsPackageEntries,
  mapDocxComments,
  replaceParagraphByIndex
} from "./docx-comments";
import { parseDocxPackage } from "./docx-package";
import { planDocumentTask } from "./planner";
import { sanitizeDocumentFileName, uploadDocumentBuffer, uploadDocumentReport } from "./storage";
import type { DocumentTaskInput, DocumentTaskResult } from "./types";

export type DocumentCommentRevisionTarget = {
  commentId: string;
  commentText: string;
  paragraphIndex: number;
  paragraphText: string;
};

function getDocxSourceFile(input: DocumentTaskInput) {
  return input.sourceFiles?.find(
    (file) =>
      /\.docx$/i.test(file.fileName) ||
      /wordprocessingml\.document/i.test(file.mimeType || "")
  );
}

function getRevisedFileName(input: DocumentTaskInput, sourceFileName: string) {
  if (input.fileName) return input.fileName;
  const baseName = sanitizeDocumentFileName(sourceFileName.replace(/\.docx$/i, ""));
  return `${baseName}-修订版`;
}

export function extractDocxCommentRevisionTargets(input: DocumentTaskInput): DocumentCommentRevisionTarget[] {
  const sourceFile = getDocxSourceFile(input);
  if (!sourceFile) throw new Error("DOCUMENT_REVISE_SOURCE_DOCX_REQUIRED");

  const docx = parseDocxPackage(sourceFile.buffer);
  const documentXml = docx.getText("word/document.xml");
  if (!documentXml) throw new Error("DOCUMENT_XML_NOT_FOUND");

  const mapping = mapDocxComments(documentXml, docx.getText("word/comments.xml"));
  const commentById = new Map(mapping.comments.map((comment) => [comment.id, comment]));

  return mapping.anchors.map((anchor) => ({
    commentId: anchor.commentId,
    commentText: commentById.get(anchor.commentId)?.text || "",
    paragraphIndex: anchor.paragraphIndex,
    paragraphText: anchor.paragraphText
  }));
}

function buildRevisionReport(targets: DocumentCommentRevisionTarget[], revisedCount: number) {
  const lines = [
    "# Word 批注修订报告",
    "",
    `- 识别批注：${targets.length} 条`,
    `- 已应用修订：${revisedCount} 条`,
    "- 修订方式：段落级最小替换，保留原段落属性与首个文本样式",
    "- 批注处理：已清理批注锚点与 comments 相关包文件"
  ];
  return lines.join("\n");
}

export async function reviseDocumentComments(input: DocumentTaskInput): Promise<DocumentTaskResult> {
  const sourceFile = getDocxSourceFile(input);
  if (!sourceFile) throw new Error("DOCUMENT_REVISE_SOURCE_DOCX_REQUIRED");

  const docx = parseDocxPackage(sourceFile.buffer);
  const documentXml = docx.getText("word/document.xml");
  if (!documentXml) throw new Error("DOCUMENT_XML_NOT_FOUND");

  const mapping = mapDocxComments(documentXml, docx.getText("word/comments.xml"));
  const commentById = new Map(mapping.comments.map((comment) => [comment.id, comment]));
  if (!mapping.anchors.length) throw new Error("DOCUMENT_NO_COMMENTS_FOUND");

  const revisedByCommentId = new Map(
    (input.reviseComments?.revisedParagraphs || [])
      .filter((item) => item.commentId && item.revisedText?.trim())
      .map((item) => [item.commentId, item.revisedText.trim()])
  );
  const anchorsByParagraph = new Map<number, typeof mapping.anchors[number]>();
  for (const anchor of mapping.anchors) {
    if (!anchorsByParagraph.has(anchor.paragraphIndex)) {
      anchorsByParagraph.set(anchor.paragraphIndex, anchor);
    }
  }

  let nextDocumentXml = documentXml;
  let revisedCount = 0;
  const sortedAnchors = [...anchorsByParagraph.values()].sort((left, right) => left.paragraphIndex - right.paragraphIndex);
  for (const anchor of sortedAnchors) {
    const revisedText = revisedByCommentId.get(anchor.commentId) || anchor.paragraphText;
    if (revisedText !== anchor.paragraphText) revisedCount += 1;
    nextDocumentXml = replaceParagraphByIndex(
      nextDocumentXml,
      anchor.paragraphIndex,
      buildRevisedParagraph(anchor.paragraphXml, revisedText)
    );
  }

  const cleaned = clearDocxCommentsPackageEntries({
    documentXml: nextDocumentXml,
    relsXml: docx.getText("word/_rels/document.xml.rels"),
    contentTypesXml: docx.getText("[Content_Types].xml")
  });

  docx.setText("word/document.xml", cleaned.documentXml);
  if (cleaned.relsXml) docx.setText("word/_rels/document.xml.rels", cleaned.relsXml);
  if (cleaned.contentTypesXml) docx.setText("[Content_Types].xml", cleaned.contentTypesXml);
  docx.remove("word/comments.xml");
  docx.remove("word/commentsExtended.xml");
  docx.remove("word/people.xml");

  const plan = planDocumentTask({
    ...input,
    requestedMode: "revise_comments",
    sourceFileNames: [sourceFile.fileName]
  });
  const file = await uploadDocumentBuffer({
    userId: input.userId,
    buffer: docx.toBuffer(),
    fileName: getRevisedFileName(input, sourceFile.fileName)
  });
  const reportMarkdown = buildRevisionReport(
    mapping.anchors.map((anchor) => ({
      commentId: anchor.commentId,
      commentText: commentById.get(anchor.commentId)?.text || "",
      paragraphIndex: anchor.paragraphIndex,
      paragraphText: anchor.paragraphText
    })),
    revisedCount
  );
  const reportFile = await uploadDocumentReport({
    userId: input.userId,
    markdown: reportMarkdown,
    fileName: getRevisedFileName(input, sourceFile.fileName)
  });

  return {
    file,
    files: [file, reportFile],
    plan,
    reportFile,
    reportMarkdown
  };
}
