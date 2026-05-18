import { buildRevisedParagraph } from "./docx-comments";

export type DocxEditableParagraph = {
  paragraphIndex: number;
  text: string;
  xml: string;
};

export type DocxTableRevision = {
  paragraphIndex: number;
  headers: string[];
  rows: string[][];
};

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

function extractTextFromXml(xml: string) {
  const textParts: string[] = [];
  const textPattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  let match: RegExpExecArray | null;
  while ((match = textPattern.exec(xml))) {
    textParts.push(decodeXmlText(match[1]));
  }
  return textParts.join("").replace(/\s+/g, " ").trim();
}

function isUnsafeParagraph(paragraphXml: string) {
  return (
    /<w:fldChar\b|<w:instrText\b|<w:drawing\b|<w:pict\b|<w:object\b|<w:tbl\b|<w:sdt\b|<w:hyperlink\b|<w:footnoteReference\b|<w:endnoteReference\b/.test(
      paragraphXml
    ) || /TOC|PAGEREF|HYPERLINK|MERGEFIELD/.test(paragraphXml)
  );
}

export function extractEditableParagraphs(documentXml: string): DocxEditableParagraph[] {
  const paragraphs: DocxEditableParagraph[] = [];
  let paragraphIndex = -1;
  documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
    paragraphIndex += 1;
    const text = extractTextFromXml(paragraphXml);
    if (!text || text.length < 2 || isUnsafeParagraph(paragraphXml)) return paragraphXml;
    paragraphs.push({ paragraphIndex, text, xml: paragraphXml });
    return paragraphXml;
  });
  return paragraphs;
}

function cleanCellText(value: unknown, maxLength = 180) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeTableRevision(revision: DocxTableRevision) {
  const headers = (revision.headers || []).map((header) => cleanCellText(header, 60)).filter(Boolean).slice(0, 8);
  if (!headers.length) return null;
  const columnCount = headers.length;
  const rows = (revision.rows || [])
    .filter(Array.isArray)
    .map((row) =>
      Array.from({ length: columnCount }, (_, index) => cleanCellText(row[index], 180))
    )
    .filter((row) => row.some(Boolean))
    .slice(0, 40);
  if (!rows.length) return null;
  return { headers, rows };
}

function textRunXml(text: string, bold = false, color?: string) {
  return `<w:r><w:rPr>${bold ? "<w:b/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}</w:rPr><w:t xml:space="preserve">${xmlEscape(
    text || " "
  )}</w:t></w:r>`;
}

function tableParagraphXml(text: string, bold = false, color?: string) {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="300" w:lineRule="auto"/></w:pPr>${textRunXml(text, bold, color)}</w:p>`;
}

function tableCellXml(text: string, width: number, isHeader: boolean) {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar>${
    isHeader ? '<w:shd w:val="clear" w:fill="EAF2FF"/>' : ""
  }<w:vAlign w:val="center"/></w:tcPr>${tableParagraphXml(text, isHeader, isHeader ? "1D4ED8" : undefined)}</w:tc>`;
}

function buildTableXml(revision: DocxTableRevision) {
  const normalized = normalizeTableRevision(revision);
  if (!normalized) return null;
  const columnCount = normalized.headers.length;
  const width = Math.max(900, Math.floor(9026 / columnCount));
  const grid = Array.from({ length: columnCount }, () => `<w:gridCol w:w="${width}"/>`).join("");
  const rows = [normalized.headers, ...normalized.rows]
    .map((row, rowIndex) => `<w:tr>${row.map((cell) => tableCellXml(cell, width, rowIndex === 0)).join("")}</w:tr>`)
    .join("");

  return `<w:tbl><w:tblPr><w:tblW w:w="9026" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="8" w:space="0" w:color="BFDBFE"/><w:left w:val="single" w:sz="8" w:space="0" w:color="BFDBFE"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="BFDBFE"/><w:right w:val="single" w:sz="8" w:space="0" w:color="BFDBFE"/><w:insideH w:val="single" w:sz="6" w:space="0" w:color="DBEAFE"/><w:insideV w:val="single" w:sz="6" w:space="0" w:color="DBEAFE"/></w:tblBorders><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`;
}

export function applyParagraphRevisions(
  documentXml: string,
  paragraphs: DocxEditableParagraph[],
  revisions: Array<{ paragraphIndex: number; revisedText: string }>,
  tableRevisions: DocxTableRevision[] = []
) {
  const paragraphByIndex = new Map(paragraphs.map((paragraph) => [paragraph.paragraphIndex, paragraph]));
  const replacements = new Map<number, string>();

  for (const revision of revisions) {
    const paragraph = paragraphByIndex.get(revision.paragraphIndex);
    const revisedText = revision.revisedText?.trim();
    if (!paragraph || !revisedText || revisedText === paragraph.text) continue;
    replacements.set(revision.paragraphIndex, buildRevisedParagraph(paragraph.xml, revisedText));
  }

  for (const revision of tableRevisions) {
    if (!paragraphByIndex.has(revision.paragraphIndex)) continue;
    const tableXml = buildTableXml(revision);
    if (!tableXml) continue;
    replacements.set(revision.paragraphIndex, tableXml);
  }

  if (!replacements.size) return { documentXml, revisedCount: 0, tableCount: 0 };

  let current = -1;
  const nextDocumentXml = documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
    current += 1;
    return replacements.get(current) || paragraphXml;
  });

  const tableTargets = new Set(tableRevisions.map((revision) => revision.paragraphIndex));
  return {
    documentXml: nextDocumentXml,
    revisedCount: replacements.size,
    tableCount: [...replacements.keys()].filter((index) => tableTargets.has(index)).length
  };
}
