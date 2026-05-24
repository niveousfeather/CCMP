import type { DiagramSceneNode } from "@/lib/smart-tools/teaching-architecture-diagram/diagram-scene";

export const FONT_FAMILY = "\"Microsoft YaHei\", \"SimHei\", \"Noto Sans CJK SC\", sans-serif";

export type Point = {
  x: number;
  y: number;
};

export type Box = Point & {
  width: number;
  height: number;
};

export function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function wrapChineseText(text: string, maxCharsPerLine: number, maxLines: number) {
  const chars = Array.from((text || "").replace(/\s+/g, ""));
  if (!chars.length) return [];
  const lines: string[] = [];
  for (let index = 0; index < chars.length && lines.length < maxLines; index += maxCharsPerLine) {
    lines.push(chars.slice(index, index + maxCharsPerLine).join(""));
  }
  if (chars.length > maxCharsPerLine * maxLines && lines.length) {
    const last = Array.from(lines[lines.length - 1]);
    lines[lines.length - 1] = `${last.slice(0, Math.max(1, maxCharsPerLine - 1)).join("")}…`;
  }
  return lines;
}

export function svgDocument(input: { width: number; height: number; title: string; content: string }) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}" role="img" aria-label="${escapeXml(input.title)}">`,
    "<defs>",
    `<marker id="arrow-blue" markerWidth="14" markerHeight="14" refX="11" refY="7" orient="auto" markerUnits="strokeWidth"><path d="M 1 1 L 12 7 L 1 13 z" fill="#0B4EA2"/></marker>`,
    `<marker id="arrow-muted" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M 1 1 L 10 6 L 1 11 z" fill="#4B5563"/></marker>`,
    "</defs>",
    input.content,
    "</svg>"
  ].join("\n");
}

export function renderBackground(width: number, height: number, background = "#ffffff") {
  return `<rect width="${width}" height="${height}" fill="${background}"/>`;
}

export function renderTitle(title: string, width: number, y = 84, fontSize = 44) {
  const lines = wrapChineseText(title, width > 1200 ? 24 : 18, 2);
  const startY = lines.length > 1 ? y - 22 : y;
  return lines
    .map(
      (line, index) =>
        `<text x="${width / 2}" y="${startY + index * (fontSize + 8)}" text-anchor="middle" font-family=${quoteAttr(FONT_FAMILY)} font-size="${fontSize}" font-weight="800" fill="#111827">${escapeXml(line)}</text>`
    )
    .join("\n");
}

export function renderCircleNode(input: {
  node: DiagramSceneNode;
  cx: number;
  cy: number;
  r: number;
  fill?: string;
  stroke?: string;
  titleSize?: number;
  tagSize?: number;
  titleChars?: number;
  titleLines?: number;
}) {
  const fill = input.fill || "#ffffff";
  const stroke = input.stroke || "#0B4EA2";
  const titleLines = wrapChineseText(input.node.title, input.titleChars || 6, input.titleLines || 2);
  const tagLines = input.node.tags.slice(0, 2).flatMap((tag) => wrapChineseText(tag, 7, 1));
  const titleSize = input.titleSize || 30;
  const tagSize = input.tagSize || 22;
  const titleBlockHeight = titleLines.length * (titleSize + 6);
  const tagBlockHeight = tagLines.length ? tagLines.length * (tagSize + 8) + 12 : 0;
  const startY = input.cy - (titleBlockHeight + tagBlockHeight) / 2 + titleSize;
  return [
    `<circle cx="${input.cx}" cy="${input.cy}" r="${input.r}" fill="${fill}" stroke="${stroke}" stroke-width="4"/>`,
    ...titleLines.map(
      (line, index) =>
        `<text x="${input.cx}" y="${startY + index * (titleSize + 6)}" text-anchor="middle" font-family=${quoteAttr(FONT_FAMILY)} font-size="${titleSize}" font-weight="800" fill="#111827">${escapeXml(line)}</text>`
    ),
    ...tagLines.map(
      (line, index) =>
        `<text x="${input.cx}" y="${startY + titleBlockHeight + 12 + index * (tagSize + 8)}" text-anchor="middle" font-family=${quoteAttr(FONT_FAMILY)} font-size="${tagSize}" font-weight="500" fill="#111827">${escapeXml(line)}</text>`
    )
  ].join("\n");
}

export function renderRectNode(input: {
  node: DiagramSceneNode;
  box: Box;
  fill?: string;
  stroke?: string;
  titleFill?: string;
  titleColor?: string;
  titleSize?: number;
  tagSize?: number;
  titleChars?: number;
  header?: boolean;
}) {
  const fill = input.fill || "#ffffff";
  const stroke = input.stroke || "#0B4EA2";
  const radius = 18;
  const headerHeight = input.header === false ? 0 : Math.min(90, input.box.height * 0.28);
  const titleSize = input.titleSize || 30;
  const tagSize = input.tagSize || 24;
  const titleLines = wrapChineseText(input.node.title, input.titleChars || 7, 2);
  const tagLines = input.node.tags.slice(0, 2).flatMap((tag) => wrapChineseText(tag, 8, 1));
  const titleY = input.box.y + (headerHeight ? headerHeight / 2 + titleSize / 3 : 46);
  const tagStartY = input.box.y + (headerHeight ? headerHeight + 58 : 104);
  return [
    `<rect x="${input.box.x}" y="${input.box.y}" width="${input.box.width}" height="${input.box.height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="4"/>`,
    headerHeight
      ? `<rect x="${input.box.x + 14}" y="${input.box.y + 14}" width="${input.box.width - 28}" height="${headerHeight - 20}" rx="10" fill="${input.titleFill || "#0B4EA2"}"/>`
      : "",
    ...titleLines.map(
      (line, index) =>
        `<text x="${input.box.x + input.box.width / 2}" y="${titleY + index * (titleSize + 6)}" text-anchor="middle" font-family=${quoteAttr(FONT_FAMILY)} font-size="${titleSize}" font-weight="800" fill="${headerHeight ? input.titleColor || "#ffffff" : "#111827"}">${escapeXml(line)}</text>`
    ),
    ...tagLines.map(
      (line, index) =>
        `<text x="${input.box.x + input.box.width / 2}" y="${tagStartY + index * (tagSize + 26)}" text-anchor="middle" font-family=${quoteAttr(FONT_FAMILY)} font-size="${tagSize}" font-weight="600" fill="#111827">${escapeXml(line)}</text>`
    )
  ]
    .filter(Boolean)
    .join("\n");
}

export function line(from: Point, to: Point, options: { dashed?: boolean; marker?: boolean; width?: number; color?: string } = {}) {
  return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${options.color || "#0B4EA2"}" stroke-width="${options.width || 4}" stroke-linecap="round"${options.dashed ? ' stroke-dasharray="12 14"' : ""}${options.marker ? ' marker-end="url(#arrow-blue)"' : ""}/>`;
}

export function pathLine(d: string, options: { dashed?: boolean; marker?: boolean; width?: number; color?: string } = {}) {
  return `<path d="${d}" fill="none" stroke="${options.color || "#0B4EA2"}" stroke-width="${options.width || 4}" stroke-linecap="round" stroke-linejoin="round"${options.dashed ? ' stroke-dasharray="12 14"' : ""}${options.marker ? ' marker-end="url(#arrow-blue)"' : ""}/>`;
}

export function textLabel(text: string, x: number, y: number, options: { size?: number; fill?: string; weight?: number | string } = {}) {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family=${quoteAttr(FONT_FAMILY)} font-size="${options.size || 24}" font-weight="${options.weight || 700}" fill="${options.fill || "#4B5563"}">${escapeXml(text)}</text>`;
}

function quoteAttr(value: string) {
  return `"${value.replace(/"/g, "&quot;")}"`;
}
