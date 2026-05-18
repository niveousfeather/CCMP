export type DocxComment = {
  id: string;
  text: string;
};

export type DocxCommentAnchor = {
  commentId: string;
  paragraphIndex: number;
  paragraphXml: string;
  paragraphText: string;
};

export type DocxCommentMapping = {
  comments: DocxComment[];
  anchors: DocxCommentAnchor[];
};

const XML_TAG_PATTERN = /<[^>]+>/g;

function decodeXmlText(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function extractTextFromXml(xml: string) {
  const textParts: string[] = [];
  const textPattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  let match: RegExpExecArray | null;
  while ((match = textPattern.exec(xml))) {
    textParts.push(decodeXmlText(match[1]));
  }
  return textParts.join("").replace(/\s+/g, " ").trim();
}

function extractParagraphs(documentXml: string) {
  const paragraphs: string[] = [];
  const paragraphPattern = /<w:p\b[\s\S]*?<\/w:p>/g;
  let match: RegExpExecArray | null;
  while ((match = paragraphPattern.exec(documentXml))) {
    paragraphs.push(match[0]);
  }
  return paragraphs;
}

function extractComments(commentsXml: string | null): DocxComment[] {
  if (!commentsXml) return [];
  const comments: DocxComment[] = [];
  const commentPattern = /<w:comment\b[^>]*w:id="([^"]+)"[^>]*>([\s\S]*?)<\/w:comment>/g;
  let match: RegExpExecArray | null;
  while ((match = commentPattern.exec(commentsXml))) {
    const text = extractTextFromXml(match[2]) || decodeXmlText(match[2].replace(XML_TAG_PATTERN, " "));
    comments.push({ id: match[1], text: text.replace(/\s+/g, " ").trim() });
  }
  return comments;
}

function findCommentIdInParagraph(paragraphXml: string) {
  return (
    paragraphXml.match(/<w:commentRangeStart\b[^>]*w:id="([^"]+)"/)?.[1] ||
    paragraphXml.match(/<w:commentReference\b[^>]*w:id="([^"]+)"/)?.[1] ||
    paragraphXml.match(/<w:commentRangeEnd\b[^>]*w:id="([^"]+)"/)?.[1] ||
    null
  );
}

export function mapDocxComments(documentXml: string, commentsXml: string | null): DocxCommentMapping {
  const comments = extractComments(commentsXml);
  const paragraphs = extractParagraphs(documentXml);
  const anchors = paragraphs
    .map((paragraphXml, paragraphIndex) => {
      const commentId = findCommentIdInParagraph(paragraphXml);
      if (!commentId) return null;
      return {
        commentId,
        paragraphIndex,
        paragraphXml,
        paragraphText: extractTextFromXml(paragraphXml)
      };
    })
    .filter((anchor): anchor is DocxCommentAnchor => Boolean(anchor));

  return { comments, anchors };
}

function removeCommentMarkers(paragraphXml: string) {
  return paragraphXml
    .replace(/<w:commentRangeStart\b[^>]*\/>/g, "")
    .replace(/<w:commentRangeEnd\b[^>]*\/>/g, "")
    .replace(/<w:r\b[^>]*>\s*<w:rPr>[\s\S]*?<\/w:rPr>\s*<w:commentReference\b[^>]*\/>\s*<\/w:r>/g, "")
    .replace(/<w:r\b[^>]*>\s*<w:commentReference\b[^>]*\/>\s*<\/w:r>/g, "")
    .replace(/<w:commentReference\b[^>]*\/>/g, "");
}

function firstRunProperties(paragraphXml: string) {
  return paragraphXml.match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/)?.[0] || "";
}

function paragraphProperties(paragraphXml: string) {
  return paragraphXml.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/)?.[0] || "";
}

type RunStyleSegment = {
  rPr: string;
  text: string;
};

function extractRunStyleSegments(paragraphXml: string): RunStyleSegment[] {
  const segments: RunStyleSegment[] = [];
  const runPattern = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
  let match: RegExpExecArray | null;
  while ((match = runPattern.exec(paragraphXml))) {
    const runXml = match[0];
    if (/<w:commentReference\b/.test(runXml) || /<w:drawing\b|<w:pict\b|<w:object\b/.test(runXml)) continue;
    const text = extractTextFromXml(runXml);
    if (!text) continue;
    segments.push({
      rPr: runXml.match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/)?.[0] || "",
      text
    });
  }
  return segments;
}

function splitRevisedTextByOriginalRuns(revisedText: string, segments: RunStyleSegment[]) {
  const text = revisedText || " ";
  if (!segments.length) return [{ rPr: firstRunProperties(""), text }];
  const originalLength = segments.reduce((sum, segment) => sum + segment.text.length, 0);
  if (originalLength <= 0 || segments.length === 1) return [{ rPr: segments[0]?.rPr || "", text }];

  const pieces: RunStyleSegment[] = [];
  let cursor = 0;
  segments.forEach((segment, index) => {
    const remaining = text.length - cursor;
    if (remaining <= 0) return;
    const sliceLength =
      index === segments.length - 1
        ? remaining
        : Math.max(0, Math.round((segment.text.length / originalLength) * text.length));
    const piece = text.slice(cursor, cursor + sliceLength);
    if (piece) pieces.push({ rPr: segment.rPr, text: piece });
    cursor += sliceLength;
  });

  if (cursor < text.length) {
    const last = pieces[pieces.length - 1] || segments[segments.length - 1];
    pieces.push({ rPr: last?.rPr || "", text: text.slice(cursor) });
  }

  return pieces.length ? pieces : [{ rPr: segments[0]?.rPr || "", text }];
}

function textRunXml(text: string, rPr: string) {
  return `<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(text || " ")}</w:t></w:r>`;
}

export function buildRevisedParagraph(paragraphXml: string, revisedText: string) {
  const pPr = paragraphProperties(paragraphXml);
  const segments = extractRunStyleSegments(removeCommentMarkers(paragraphXml));
  const styledTextRuns = splitRevisedTextByOriginalRuns(revisedText, segments.length ? segments : [{ rPr: firstRunProperties(paragraphXml), text: "" }])
    .map((segment) => textRunXml(segment.text, segment.rPr))
    .join("");
  return `<w:p>${pPr}${styledTextRuns}</w:p>`;
}

export function replaceParagraphByIndex(documentXml: string, paragraphIndex: number, nextParagraphXml: string) {
  let current = -1;
  return documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
    current += 1;
    return current === paragraphIndex ? nextParagraphXml : paragraphXml;
  });
}

export function clearDocxCommentsPackageEntries({
  documentXml,
  relsXml,
  contentTypesXml
}: {
  documentXml: string;
  relsXml: string | null;
  contentTypesXml: string | null;
}) {
  const cleanedDocumentXml = removeCommentMarkers(documentXml);
  const cleanedRelsXml = relsXml
    ? relsXml.replace(/<Relationship\b[^>]*(?:comments|commentsExtended|people)\.xml[^>]*\/>/g, "")
    : null;
  const cleanedContentTypesXml = contentTypesXml
    ? contentTypesXml.replace(/<Override\b[^>]*(?:comments|commentsExtended|people)\.xml[^>]*\/>/g, "")
    : null;

  return {
    documentXml: cleanedDocumentXml,
    relsXml: cleanedRelsXml,
    contentTypesXml: cleanedContentTypesXml
  };
}
