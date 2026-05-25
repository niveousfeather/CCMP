import { parseMarkdown, type MarkdownBlock } from "./markdown";
import { buildWordDocumentPlan, extractWordGenerationIntent, parseWordDocumentPlanJson, type WordBlock, type WordGenerationIntent, type WordSection } from "./plan";
import { canDeliverWordDocumentPlan, evaluateWordDocumentPlan, repairWordDocumentPlan } from "./quality";
import { getDocumentTemplateTheme } from "./templates";
import type { DocumentTemplate } from "./types";
import { makeZip } from "./zip";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const TABLE_WIDTH_DXA = 9026;

type WordDocumentRenderOptions = {
  needsToc?: boolean;
  needsHeaderFooter?: boolean;
  theme?: "blue" | "green" | "orange" | "purple" | "gray";
};

const THEME_COLORS: Record<NonNullable<WordDocumentRenderOptions["theme"]>, { accent: string; light: string; border: string; muted: string }> = {
  blue: { accent: "2563EB", light: "DBEAFE", border: "93C5FD", muted: "1D4ED8" },
  green: { accent: "16A34A", light: "DCFCE7", border: "86EFAC", muted: "15803D" },
  orange: { accent: "EA580C", light: "FFEDD5", border: "FDBA74", muted: "C2410C" },
  purple: { accent: "7C3AED", light: "EDE9FE", border: "C4B5FD", muted: "6D28D9" },
  gray: { accent: "475569", light: "F1F5F9", border: "CBD5E1", muted: "334155" }
};

function resolveTheme(options?: WordDocumentRenderOptions) {
  return THEME_COLORS[options?.theme || "blue"] || THEME_COLORS.blue;
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textRun(text: string, options: { bold?: boolean; italic?: boolean; color?: string; size?: number } = {}) {
  return `<w:r><w:rPr>${options.bold ? "<w:b/>" : ""}${options.italic ? "<w:i/>" : ""}${
    options.color ? `<w:color w:val="${options.color}"/>` : ""
  }${options.size ? `<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>` : ""}</w:rPr><w:t xml:space="preserve">${xmlEscape(
    text || " "
  )}</w:t></w:r>`;
}

function paragraphXml({
  text,
  style,
  before = 80,
  after = 120,
  bold = false,
  italic = false,
  align,
  color,
  size,
  firstLineIndent = false
}: {
  text: string;
  style?: string;
  before?: number;
  after?: number;
  bold?: boolean;
  italic?: boolean;
  align?: "center" | "left" | "right";
  color?: string;
  size?: number;
  firstLineIndent?: boolean;
}) {
  return `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${
    align ? `<w:jc w:val="${align}"/>` : ""
  }${firstLineIndent ? '<w:ind w:firstLine="420"/>' : ""}<w:spacing w:before="${before}" w:after="${after}" w:line="360" w:lineRule="auto"/></w:pPr>${textRun(
    text,
    { bold, italic, color, size }
  )}</w:p>`;
}

type RenderContext = {
  nextNumberedNumId: number;
  orderedNumIds: number[];
  theme: ReturnType<typeof resolveTheme>;
};

const BULLET_NUM_ID = 1;
const FIRST_ORDERED_NUM_ID = 2;

function listItemXml(text: string, numId: number) {
  return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr><w:spacing w:before="40" w:after="80" w:line="340" w:lineRule="auto"/></w:pPr>${textRun(text)}</w:p>`;
}

function calloutXml(block: Extract<WordBlock, { type: "callout" }>) {
  return `<w:p><w:pPr><w:spacing w:before="120" w:after="140" w:line="340" w:lineRule="auto"/><w:ind w:left="260" w:right="260"/><w:shd w:val="clear" w:fill="F8FAFC"/><w:pBdr><w:left w:val="single" w:sz="16" w:space="6" w:color="93C5FD"/></w:pBdr></w:pPr>${textRun(
    block.title ? `${block.title}：${block.text}` : block.text,
    { color: "334155" }
  )}</w:p>`;
}

function weightedColumnWidths(rows: string[][], totalWidth = TABLE_WIDTH_DXA) {
  const columnCount = Math.max(...rows.map((row) => row.length), 1);
  const weights = Array.from({ length: columnCount }, (_, cellIndex) => {
    const values = rows.map((row) => row[cellIndex] || "");
    const header = values[0] || "";
    const averageLength = values.reduce((total, value) => total + String(value).length, 0) / Math.max(values.length, 1);
    const headerWeight = /说明|内容|活动|意图|标准|要求|建议|措施|分析|情况|动作|任务|交付|验收|执行/.test(header) ? 1.35 : 1;
    return Math.max(0.8, Math.min(2.4, 0.8 + averageLength / 42)) * headerWeight;
  });
  const weightTotal = weights.reduce((total, weight) => total + weight, 0) || 1;
  const minWidth = Math.max(900, Math.floor(totalWidth * 0.11));
  let widths = weights.map((weight) => Math.max(minWidth, Math.floor((totalWidth * weight) / weightTotal)));
  let diff = totalWidth - widths.reduce((total, width) => total + width, 0);
  for (let index = widths.length - 1; diff !== 0 && widths.length > 0; index = (index - 1 + widths.length) % widths.length) {
    const delta = diff > 0 ? 1 : -1;
    if (delta > 0 || widths[index] > minWidth) {
      widths[index] += delta;
      diff -= delta;
    } else if (widths.every((width) => width <= minWidth)) {
      break;
    }
  }
  return widths;
}

function tableXml(rows: string[][], theme = THEME_COLORS.blue) {
  const columnCount = Math.max(...rows.map((row) => row.length), 1);
  const columnWidths = weightedColumnWidths(rows);
  const grid = columnWidths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
  const body = rows
    .map((row, rowIndex) => {
      const cells = Array.from({ length: columnCount }, (_, cellIndex) => row[cellIndex] || "")
        .map(
          (cell, cellIndex) =>
            `<w:tc><w:tcPr><w:tcW w:w="${columnWidths[cellIndex]}" w:type="dxa"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar>${
              rowIndex === 0 ? `<w:shd w:val="clear" w:fill="${theme.light}"/>` : ""
            }</w:tcPr>${paragraphXml({
              text: cell,
              before: 0,
              after: 0,
              bold: rowIndex === 0,
              color: rowIndex === 0 ? theme.muted : undefined
            })}</w:tc>`
        )
        .join("");
      return `<w:tr>${cells}</w:tr>`;
    })
    .join("");

  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${TABLE_WIDTH_DXA}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="8" w:space="0" w:color="${theme.border}"/><w:left w:val="single" w:sz="8" w:space="0" w:color="${theme.border}"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="${theme.border}"/><w:right w:val="single" w:sz="8" w:space="0" w:color="${theme.border}"/><w:insideH w:val="single" w:sz="6" w:space="0" w:color="${theme.light}"/><w:insideV w:val="single" w:sz="6" w:space="0" w:color="${theme.light}"/></w:tblBorders><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

function blockToXml(block: MarkdownBlock) {
  if (block.type === "heading") {
    return paragraphXml({
      text: block.text,
      style: `Heading${block.level}`,
      before: block.level === 1 ? 260 : 190,
      after: block.level === 1 ? 170 : 125,
      bold: true,
      align: block.level === 1 ? "center" : undefined
    });
  }
  if (block.type === "list") return block.items.map((item) => listItemXml(item, block.ordered ? FIRST_ORDERED_NUM_ID : BULLET_NUM_ID)).join("");
  if (block.type === "table") return tableXml(block.rows);
  if (block.type === "code") {
    return block.text
      .split("\n")
      .map((line) => paragraphXml({ text: line || " ", style: "CodeBlock", before: 0, after: 0 }))
      .join("");
  }
  return paragraphXml({ text: block.text });
}

function allocateNumberedListNumId(context: RenderContext) {
  const numId = context.nextNumberedNumId;
  context.nextNumberedNumId += 1;
  context.orderedNumIds.push(numId);
  return numId;
}

function wordBlockToXml(block: WordBlock, context: RenderContext) {
  if (block.type === "paragraph") return paragraphXml({ text: block.text, before: 60, after: 130, firstLineIndent: true });
  if (block.type === "bullet_list") return block.items.map((item) => listItemXml(item, BULLET_NUM_ID)).join("");
  if (block.type === "checklist") return block.items.map((item) => listItemXml(item, BULLET_NUM_ID)).join("");
  if (block.type === "numbered_list") {
    const numId = allocateNumberedListNumId(context);
    return block.items.map((item) => listItemXml(item, numId)).join("");
  }
  if (block.type === "table") return tableXml([block.headers, ...block.rows], context.theme);
  if (block.type === "rubric" || block.type === "timeline" || block.type === "responsibility_matrix") return tableXml([block.headers, ...block.rows], context.theme);
  if (block.type === "callout") return calloutXml(block);
  return "";
}

function sectionToXml(section: WordSection, context: RenderContext) {
  return [
    paragraphXml({
      text: section.heading,
      style: `Heading${section.level}`,
      before: section.level === 1 ? 260 : 190,
      after: section.level === 1 ? 150 : 110,
      bold: true,
      color: section.level === 1 ? context.theme.accent : undefined
    }),
    section.intro ? paragraphXml({ text: section.intro, before: 40, after: 130, firstLineIndent: true }) : "",
    ...section.blocks.map((block) => wordBlockToXml(block, context))
  ].filter(Boolean).join("\n");
}

function inferSubtitle(blocks: MarkdownBlock[]) {
  const firstParagraph = blocks.find((block) => block.type === "paragraph");
  if (!firstParagraph || firstParagraph.text.length < 24) return "文档内容";
  return firstParagraph.text.slice(0, 64);
}

function infoBandXml(label: string, accent: string) {
  return [
    `<w:p><w:pPr><w:spacing w:before="60" w:after="180"/><w:pBdr><w:bottom w:val="single" w:sz="18" w:space="6" w:color="${accent}"/></w:pBdr></w:pPr>${textRun(
      label,
      { bold: true, color: accent, size: 22 }
    )}</w:p>`
  ].join("\n");
}

function coverXml(title: string, subtitle: string | undefined, template: DocumentTemplate, blocks: MarkdownBlock[]) {
  const theme = getDocumentTemplateTheme(template);
  const resolvedSubtitle = subtitle || inferSubtitle(blocks);

  return [
    paragraphXml({ text: title, style: "Title", align: "center", before: 220, after: resolvedSubtitle ? 100 : 180, bold: true, size: 40 }),
    resolvedSubtitle ? paragraphXml({ text: resolvedSubtitle, align: "center", before: 20, after: 180, color: theme.muted, size: 20 }) : "",
    paragraphXml({ text: new Date().toISOString().slice(0, 10), align: "center", before: 20, after: 220, color: "94A3B8", size: 18 })
  ].filter(Boolean).join("\n");
}

function shouldAddSectionOverview(plan: { sections: WordSection[] }, template: DocumentTemplate) {
  if (template === "lesson_plan" || template === "meeting_minutes") return false;
  const levelOneCount = plan.sections.filter((section) => section.level === 1).length;
  const contentLength = plan.sections.reduce(
    (total, section) => total + section.heading.length + (section.intro?.length || 0) + section.blocks.length * 40,
    0
  );
  return levelOneCount >= 5 || contentLength >= 1800;
}

function sectionOverviewXml(sections: WordSection[]) {
  const items = sections
    .filter((section) => section.level === 1)
    .slice(0, 18)
    .map((section, index) => `${index + 1}. ${section.heading}：${section.intro ? section.intro.slice(0, 90) : "详见正文对应章节。"}`);
  if (!items.length) return "";
  return [
    paragraphXml({ text: "章节概览", style: "Heading1", before: 260, after: 150, bold: true }),
    paragraphXml({ text: "以下概览用于快速把握文档结构，详细内容以各章节正文和表格为准。", before: 40, after: 130, firstLineIndent: true }),
    ...items.map((item) => paragraphXml({ text: item, before: 20, after: 70 }))
  ].join("\n");
}

function staticTocXml(sections: WordSection[], theme: ReturnType<typeof resolveTheme>) {
  const items = sections
    .filter((section) => section.level === 1)
    .slice(0, 18)
    .map((section, index) => `${index + 1}. ${section.heading}`);
  if (!items.length) return "";
  return [
    paragraphXml({ text: "目录", style: "Heading1", before: 260, after: 150, bold: true, color: theme.accent }),
    ...items.map((item) => paragraphXml({ text: item, before: 20, after: 70 }))
  ].join("\n");
}

function headerXml(title: string, theme: ReturnType<typeof resolveTheme>) {
  const shortTitle = title.slice(0, 42);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="${W_NS}">
  <w:p>
    <w:pPr><w:spacing w:before="0" w:after="80"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="${theme.border}"/></w:pBdr></w:pPr>
    ${textRun(shortTitle, { bold: true, color: theme.muted, size: 18 })}
  </w:p>
</w:hdr>`;
}

function footerXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="${W_NS}">
  <w:p>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>
    <w:r><w:rPr><w:color w:val="64748B"/><w:sz w:val="18"/></w:rPr><w:t>第 </w:t></w:r>
    <w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText xml:space="preserve">PAGE</w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="separate"/></w:r>
    <w:r><w:rPr><w:color w:val="64748B"/><w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>
    <w:r><w:rPr><w:color w:val="64748B"/><w:sz w:val="18"/></w:rPr><w:t> 页</w:t></w:r>
  </w:p>
</w:ftr>`;
}

function uniqueIntentSource(...parts: Array<string | undefined>) {
  const seen = new Set<string>();
  return parts
    .map((part) => String(part || "").trim())
    .filter((part) => {
      const key = part.replace(/\s+/g, "").toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n");
}

function logWordQa(stage: string, report: ReturnType<typeof evaluateWordDocumentPlan>) {
  const issueCodes = report.issues.map((issue) => `${issue.code}:${issue.severity}`).join("|") || "none";
  console.info(`[word:qa] stage=${stage} score=${report.score} shouldRepair=${report.shouldRepair} issues=${issueCodes}`);
  console.info(`[word:qa] stage=${stage} matchedKeywords=${report.keywordCoverage.matchedKeywords.join("、") || "-"}`);
  console.info(`[word:qa] stage=${stage} missingKeywords=${report.keywordCoverage.missingKeywords.join("、") || "-"}`);
}

function buildRenderedDocument({
  markdown,
  title,
  template,
  prompt,
  intent,
  renderOptions
}: {
  markdown: string;
  title: string;
  template: DocumentTemplate;
  prompt?: string;
  intent?: WordGenerationIntent;
  renderOptions?: WordDocumentRenderOptions;
}) {
  const blocks = parseMarkdown(markdown);
  const hasModelPlan = Boolean(parseWordDocumentPlanJson(markdown));
  const resolvedIntent = intent || (prompt ? extractWordGenerationIntent(uniqueIntentSource(prompt, hasModelPlan ? undefined : title, hasModelPlan ? undefined : markdown)) : undefined);
  const initialPlan = buildWordDocumentPlan({ markdown, title, template, prompt, intent: resolvedIntent });
  const report = evaluateWordDocumentPlan(initialPlan, { intent: resolvedIntent, prompt });
  logWordQa("initial", report);
  const plan = report.shouldRepair ? repairWordDocumentPlan(initialPlan, { intent: resolvedIntent, prompt, preserveExistingPlan: hasModelPlan }) : initialPlan;
  const finalReport = evaluateWordDocumentPlan(plan, { intent: resolvedIntent, prompt });
  logWordQa(report.shouldRepair ? "repair" : "final", finalReport);
  if (finalReport.shouldRepair && !canDeliverWordDocumentPlan(finalReport)) {
    throw new Error(`WORD_CONTENT_QA_FAILED:${finalReport.issues.map((issue) => issue.code).join(",")}`);
  }
  const theme = resolveTheme(renderOptions);
  const context: RenderContext = { nextNumberedNumId: FIRST_ORDERED_NUM_ID, orderedNumIds: [], theme };
  const overview =
    renderOptions && "needsToc" in renderOptions
      ? renderOptions.needsToc
        ? staticTocXml(plan.sections, theme)
        : ""
      : shouldAddSectionOverview(plan, template)
        ? sectionOverviewXml(plan.sections)
        : "";
  const body = plan.sections.map((section) => sectionToXml(section, context)).join("\n");
  const coverBlocks = hasModelPlan ? [{ type: "paragraph" as const, text: plan.subtitle || plan.title }] : blocks;
  const cover = coverXml(plan.title, plan.subtitle, template, coverBlocks);

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}">
  <w:body>
    ${cover}
    ${overview}
    ${body}
    <w:sectPr>
      ${renderOptions?.needsHeaderFooter ? '<w:headerReference w:type="default" r:id="rIdHeader1"/>' : ""}
      <w:footerReference w:type="default" r:id="rIdFooter1"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1360" w:right="1360" w:bottom="1360" w:left="1360" w:header="708" w:footer="708" w:gutter="0"/>
      <w:cols w:space="708"/>
      <w:docGrid w:linePitch="312"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  return { documentXml, numberingXml: numberingXml(context.orderedNumIds), theme };
}

export function markdownToDocumentXml({
  markdown,
  title,
  template,
  prompt,
  intent,
  renderOptions
}: {
  markdown: string;
  title: string;
  template: DocumentTemplate;
  prompt?: string;
  intent?: WordGenerationIntent;
  renderOptions?: WordDocumentRenderOptions;
}) {
  return buildRenderedDocument({ markdown, title, template, prompt, intent, renderOptions }).documentXml;
}

function stylesXml(renderOptions?: WordDocumentRenderOptions) {
  const theme = resolveTheme(renderOptions);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W_NS}">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="111827"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:before="260" w:after="180"/></w:pPr><w:rPr><w:b/><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display" w:eastAsia="Microsoft YaHei"/><w:sz w:val="42"/><w:color w:val="0F172A"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="200"/></w:pPr><w:rPr><w:b/><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display" w:eastAsia="Microsoft YaHei"/><w:sz w:val="32"/><w:color w:val="${theme.accent}"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="210" w:after="130"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="${theme.muted}"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="170" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="334155"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="0"/><w:shd w:val="clear" w:fill="F8FAFC"/><w:ind w:left="240" w:right="240"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Microsoft YaHei"/><w:sz w:val="19"/></w:rPr></w:style>
  <w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="8" w:color="${theme.border}"/><w:left w:val="single" w:sz="8" w:color="${theme.border}"/><w:bottom w:val="single" w:sz="8" w:color="${theme.border}"/><w:right w:val="single" w:sz="8" w:color="${theme.border}"/><w:insideH w:val="single" w:sz="6" w:color="${theme.light}"/><w:insideV w:val="single" w:sz="6" w:color="${theme.light}"/></w:tblBorders></w:tblPr></w:style>
</w:styles>`;
}

function numberingXml(orderedNumIds: number[] = [FIRST_ORDERED_NUM_ID]) {
  const orderedNums = orderedNumIds.length ? orderedNumIds : [FIRST_ORDERED_NUM_ID];
  const numDefinitions = orderedNums
    .map(
      (numId) =>
        `<w:num w:numId="${numId}"><w:abstractNumId w:val="2"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`
    )
    .join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${W_NS}">
  <w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
  ${numDefinitions}
</w:numbering>`;
}

export function createDocxBuffer({
  markdown,
  title,
  template,
  prompt,
  intent,
  renderOptions
}: {
  markdown: string;
  title: string;
  template: DocumentTemplate;
  prompt?: string;
  intent?: WordGenerationIntent;
  renderOptions?: WordDocumentRenderOptions;
}) {
  const rendered = buildRenderedDocument({ markdown, title, template, prompt, intent, renderOptions });
  const headerContentType = renderOptions?.needsHeaderFooter
    ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
    : "";
  const headerRelationship = renderOptions?.needsHeaderFooter
    ? '<Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
    : "";
  const entries = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>${headerContentType}<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`
    },
    {
      name: "docProps/core.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>User</dc:creator><cp:lastModifiedBy>User</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified></cp:coreProperties>`
    },
    {
      name: "docProps/app.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Word</Application></Properties>`
    },
    {
      name: "word/_rels/document.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${headerRelationship}<Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`
    },
    { name: "word/styles.xml", content: stylesXml(renderOptions) },
    { name: "word/numbering.xml", content: rendered.numberingXml },
    { name: "word/footer1.xml", content: footerXml() },
    { name: "word/document.xml", content: rendered.documentXml }
  ];
  if (renderOptions?.needsHeaderFooter) {
    entries.splice(entries.length - 1, 0, { name: "word/header1.xml", content: headerXml(title, rendered.theme) });
  }
  return makeZip(entries);
}
