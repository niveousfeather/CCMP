import type { WordSection, WordTable } from "./types";

export type NormalizedDocumentBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4; text: string; numbering?: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

export type NormalizedDocumentStructureInput = {
  title?: string;
  documentKind?: string;
  sections: Array<Pick<WordSection, "heading" | "paragraphs">>;
  tables?: WordTable[];
};

const lessonHeadings = [
  "课程基本信息",
  "学情分析",
  "教学目标",
  "教学重点与难点",
  "教学过程设计",
  "课堂练习",
  "作业设计",
  "板书设计",
  "教学反思"
];

const qaResiduePattern = /明确文档目标|补充关键事实|形成可执行结论/;
const roleLabelPattern = /^(教师活动|学生活动|设计意图|时间安排|作业内容|评价方式|课堂检测|板书要点)：?\s*(.*)$/;
const chineseBracketHeadingPattern = /^（([一二三四五六七八九十]+)）\s*(.+)$/;
const numericHeadingPattern = /^(\d+)[.、]\s*([^。！？；：:]{2,40}(?:目标|导入|感知|理解|练习|反思|活动|评价|设计|安排|内容|方式|任务|重点|难点))\s*(.*)$/;
const bracketListPattern = /^（(\d+)）\s*(.+)$/;

export function normalizeDocumentStructure(input: NormalizedDocumentStructureInput) {
  const tables = [...(input.tables || [])];
  const usedTables = new Set<number>();
  const blocks: NormalizedDocumentBlock[] = [];

  input.sections.forEach((section, sectionIndex) => {
    const baseHeading = normalizeLevelOneHeading(section.heading, sectionIndex, input.documentKind);
    if (!baseHeading.text || qaResiduePattern.test(baseHeading.text)) return;
    const level = isSourceHeading(baseHeading.text) ? 2 : 1;
    blocks.push({ type: "heading", level, text: baseHeading.text, numbering: baseHeading.numbering });

    tables.forEach((table, tableIndex) => {
      if (usedTables.has(tableIndex)) return;
      if (!tableBelongsToSection(table, baseHeading.text)) return;
      const normalizedTable = normalizeTable(table);
      if (normalizedTable) {
        blocks.push(normalizedTable);
        usedTables.add(tableIndex);
      }
    });

    const body = section.paragraphs.join("\n\n");
    blocks.push(...parseSectionBody(stripRepeatedSectionHeading(body, baseHeading.text)));
  });

  tables.forEach((table, tableIndex) => {
    if (usedTables.has(tableIndex)) return;
    const normalizedTable = normalizeTable(table);
    if (!normalizedTable) return;
    blocks.push({ type: "heading", level: 2, text: cleanText(table.title || "表格") });
    blocks.push(normalizedTable);
  });

  return { title: cleanText(input.title || ""), blocks: compactBlocks(blocks) };
}

export function normalizedBlocksToPlainText(blocks: NormalizedDocumentBlock[]) {
  return blocks
    .map((block) => {
      if (block.type === "heading") return block.text;
      if (block.type === "paragraph") return block.text;
      if (block.type === "list") return block.items.map((item, index) => (block.ordered ? `${index + 1}. ${item}` : `- ${item}`)).join("\n");
      return [block.headers.join(" | "), ...block.rows.map((row) => row.join(" | "))].join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

function normalizeLevelOneHeading(value: string, index: number, documentKind?: string) {
  const cleaned = stripHeadingNumber(cleanText(value, 80));
  const canonical = canonicalLessonHeading(cleaned) || cleaned;
  const shouldNumber = documentKind === "lesson_plan" || Boolean(canonicalLessonHeading(cleaned));
  const numbering = shouldNumber ? `${chineseNumber(index + 1)}、` : undefined;
  const text = shouldNumber && !/^([一二三四五六七八九十]+)、/.test(canonical) ? `${numbering}${canonical}` : canonical;
  return { text, numbering };
}

function parseSectionBody(value: string): NormalizedDocumentBlock[] {
  const prepared = insertStructuralBreaks(value);
  const blocks: NormalizedDocumentBlock[] = [];
  let pendingList: string[] = [];

  const flushList = () => {
    if (!pendingList.length) return;
    blocks.push({ type: "list", ordered: true, items: pendingList });
    pendingList = [];
  };

  for (const rawLine of prepared.split(/\n+/)) {
    const line = cleanText(rawLine, 1200);
    if (!line || qaResiduePattern.test(line)) continue;

    const bracketHeading = chineseBracketHeadingPattern.exec(line);
    if (bracketHeading) {
      flushList();
      const { title, rest } = splitTitleAndRest(bracketHeading[2]);
      blocks.push({ type: "heading", level: 2, text: `（${bracketHeading[1]}）${title}` });
      if (rest) blocks.push(...parseSectionBody(rest));
      continue;
    }

    const numericHeading = numericHeadingPattern.exec(line);
    if (numericHeading) {
      flushList();
      blocks.push({ type: "heading", level: 2, text: `${numericHeading[1]}. ${numericHeading[2].trim()}` });
      if (numericHeading[3]?.trim()) blocks.push(...parseSectionBody(numericHeading[3]));
      continue;
    }

    const role = roleLabelPattern.exec(line);
    if (role) {
      flushList();
      blocks.push({ type: "heading", level: 4, text: `${role[1]}：` });
      if (role[2]) blocks.push(...splitLongParagraph(role[2]).map((text) => ({ type: "paragraph" as const, text })));
      continue;
    }

    const listItem = bracketListPattern.exec(line);
    if (listItem) {
      pendingList.push(listItem[2].trim());
      continue;
    }

    flushList();
    blocks.push(...splitLongParagraph(line).map((text) => ({ type: "paragraph" as const, text })));
  }

  flushList();
  return blocks;
}

function insertStructuralBreaks(value: string) {
  return cleanText(value, 20_000)
    .replace(/\s*(?=（[一二三四五六七八九十]+）)/g, "\n")
    .replace(/\s*(?=（\d+）)/g, "\n")
    .replace(/\s*(?=\d+[.、]\s*[^。！？；：:]{2,40}(?:目标|导入|感知|理解|练习|反思|活动|评价|设计|安排|内容|方式|任务|重点|难点))/g, "\n")
    .replace(/\s*(?=(?:教师活动|学生活动|设计意图|时间安排|作业内容|评价方式|课堂检测|板书要点)：)/g, "\n")
    .replace(/[；;]\s*/g, "；\n");
}

function stripRepeatedSectionHeading(value: string, heading: string) {
  const title = stripHeadingNumber(heading);
  if (!canonicalLessonHeading(title)) return value;
  const pattern = new RegExp(`^\\s*(?:[一二三四五六七八九十]+、|\\d+[.、])?\\s*${escapeRegExp(title)}\\s*[:：]?\\s*`);
  return value.replace(pattern, "");
}

function splitTitleAndRest(value: string) {
  const markers = ["教师活动：", "学生活动：", "设计意图：", "时间安排：", "（1）", "（2）"];
  const hit = markers.map((marker) => value.indexOf(marker)).filter((index) => index > 0).sort((a, b) => a - b)[0];
  if (!hit) return { title: value.trim(), rest: "" };
  return { title: value.slice(0, hit).trim(), rest: value.slice(hit).trim() };
}

function splitLongParagraph(value: string) {
  const text = cleanText(value, 1600);
  if (text.length <= 180) return [text];
  const parts = text.split(/(?<=[。！？；])/).map((item) => item.trim()).filter(Boolean);
  const result: string[] = [];
  let current = "";
  for (const part of parts) {
    if ((current + part).length > 220 && current) {
      result.push(current);
      current = part;
    } else {
      current += part;
    }
  }
  if (current) result.push(current);
  return result.length ? result : [text];
}

function tableBelongsToSection(table: WordTable, heading: string) {
  const title = cleanText(table.title);
  const cleanHeading = stripHeadingNumber(heading);
  if (/基础信息|基本信息/.test(title)) return /基本信息/.test(cleanHeading);
  if (/教学过程/.test(title)) return /教学过程/.test(cleanHeading);
  return title && cleanHeading.includes(title.replace(/表$/, ""));
}

function normalizeTable(table: WordTable): NormalizedDocumentBlock | null {
  const headers = table.headers.map((header) => cleanText(header, 80)).filter(Boolean);
  const rows = table.rows
    .map((row) => headers.map((_, index) => cleanText(row[index] || "", 500)))
    .filter((row) => row.some(Boolean));
  if (!headers.length || !rows.length) return null;
  return { type: "table", headers, rows };
}

function compactBlocks(blocks: NormalizedDocumentBlock[]) {
  const result: NormalizedDocumentBlock[] = [];
  const seenHeadingKeys = new Set<string>();
  for (const block of blocks) {
    if (block.type === "heading") {
      const key = `${block.level}:${stripHeadingNumber(block.text)}`;
      if (seenHeadingKeys.has(key) && block.level === 1) continue;
      seenHeadingKeys.add(key);
    }
    if (block.type === "paragraph" && result.at(-1)?.type === "paragraph" && (result.at(-1) as { text: string }).text === block.text) continue;
    result.push(block);
  }
  return result;
}

function canonicalLessonHeading(value: string) {
  const clean = stripHeadingNumber(value);
  return lessonHeadings.find((heading) => clean.includes(heading) || heading.includes(clean));
}

export function stripHeadingNumber(value: string) {
  return cleanText(value).replace(/^(?:[一二三四五六七八九十]+、|\d+[.)、]\s*)/, "").trim();
}

function isSourceHeading(value: string) {
  return /资料来源|参考摘要|来源/.test(value);
}

function chineseNumber(value: number) {
  const numerals = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  if (value <= 10) return numerals[value];
  if (value < 20) return `十${numerals[value - 10]}`;
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${numerals[tens]}十${ones ? numerals[ones] : ""}`;
}

function cleanText(value: string, maxLength = 1200) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
