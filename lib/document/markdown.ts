export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; rows: string[][] }
  | { type: "code"; text: string };

export function normalizeMarkdown(markdown: string) {
  const cleaned = markdown
    .replace(/^\s*```markdown\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, "    ")
    .split("\n")
    .filter((line) => !/^\s*(?:[-*_]\s*)?(?:由\s*)?(?:Nexus\s*AI|NexusAI)(?:\s*智能文档模块)?(?:\s*自动)?(?:\s*生成)?\s*$/i.test(line))
    .filter((line) => !/(?:Nexus\s*AI|NexusAI).*智能文档模块生成|智能文档模块生成.*(?:Nexus\s*AI|NexusAI)|generated\s+by\s+Nexus/i.test(line))
    .join("\n")
    .trim();

  if (!cleaned) return "# 文档\n\n暂无正文内容。";
  return cleaned;
}

export function stripInlineMarkdown(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => stripInlineMarkdown(cell.replace(/\\\|/g, "|")));
}

function listItemsFromLine(line: string, ordered: boolean) {
  if (!ordered) {
    const match = line.match(/^[-*+]\s+(.+)$/);
    return match ? [stripInlineMarkdown(match[1])] : [];
  }

  const matches = [...line.matchAll(/\d+[.)]\s+([\s\S]*?)(?=\s*\d+[.)]\s+|$)/g)];
  if (matches.length) return matches.map((match) => stripInlineMarkdown(match[1])).filter(Boolean);

  const match = line.match(/^\d+[.)]\s+(.+)$/);
  return match ? [stripInlineMarkdown(match[1])] : [];
}

export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = normalizeMarkdown(markdown).split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "code", text: codeLines.join("\n").trim() || " " });
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: stripInlineMarkdown(heading[2])
      });
      index += 1;
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const rows = [parseTableRow(line)];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", rows });
      continue;
    }

    if (/^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      const ordered = /^\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (index < lines.length) {
        const itemLine = lines[index].trim();
        const pattern = ordered ? /^\d+[.)]\s+(.+)$/ : /^[-*+]\s+(.+)$/;
        if (!pattern.test(itemLine)) break;
        items.push(...listItemsFromLine(itemLine, ordered));
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length) {
      const nextLine = lines[index].trim();
      if (
        !nextLine ||
        nextLine.startsWith("#") ||
        nextLine.startsWith("```") ||
        /^[-*+]\s+/.test(nextLine) ||
        /^\d+[.)]\s+/.test(nextLine) ||
        (nextLine.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1]))
      ) {
        break;
      }
      paragraphLines.push(nextLine);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: stripInlineMarkdown(paragraphLines.join(" ")) });
  }

  return blocks.length ? blocks : [{ type: "paragraph", text: "暂无正文内容。" }];
}
