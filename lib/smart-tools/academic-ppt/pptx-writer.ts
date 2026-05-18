import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { writeFile } from "node:fs/promises";

import { createAcademicPptRenderPlan, type AcademicPptRenderSlidePlan } from "@/lib/smart-tools/academic-ppt/layout-planner";
import { px, type AcademicPptBox, type AcademicPptTheme } from "@/lib/smart-tools/academic-ppt/ppt-theme";
import type {
  AcademicPptIconDecoration,
  AcademicPptOutline,
  AcademicPptResearchBrief,
  AcademicPptSettings,
  AcademicPptSlide
} from "@/lib/smart-tools/academic-ppt/types";
import { defaultAcademicPptSettings, normalizeAcademicPptSettings } from "@/lib/smart-tools/academic-ppt/task-api";
import { estimateAcademicPptTextUnits, truncateAcademicPptText } from "@/lib/smart-tools/academic-ppt/text-layout";

type ZipEntry = {
  name: string;
  content: Buffer;
};

type Shape = string;

const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_BLANK_LAYOUT = 7;

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimeDate(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = Math.max(date.getFullYear() - 1980, 0);
  const dosDate = (year << 9) | (month << 5) | day;
  return { time, date: dosDate };
}

function zip(entries: ZipEntry[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const { time, date } = dosTimeDate();

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const content = entry.content;
    const crc = crc32(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function listZipEntries(buffer: Buffer) {
  const entries: string[] = [];
  for (let offset = 0; offset <= buffer.length - 46; offset += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) break;
    entries.push(buffer.subarray(nameStart, nameEnd).toString("utf8"));
    offset = nameEnd + extraLength + commentLength - 1;
  }
  return entries;
}

function readZipEntry(buffer: Buffer, entryName: string): Buffer | null {
  for (let offset = 0; offset <= buffer.length - 30; offset += 1) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) continue;
    const flags = buffer.readUInt16LE(offset + 6);
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) break;
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8");
    const contentStart = nameEnd + extraLength;
    const contentEnd = contentStart + compressedSize;
    if (contentEnd > buffer.length) break;
    if (name !== entryName) {
      offset = contentEnd - 1;
      continue;
    }
    if ((flags & 0x08) !== 0) return null;
    const content = buffer.subarray(contentStart, contentEnd);
    if (compression === 0) return Buffer.from(content);
    if (compression === 8) {
      const inflated = inflateRawSync(content);
      return inflated.length === uncompressedSize ? inflated : inflated;
    }
    return null;
  }
  return null;
}

function officeSkeletonPath() {
  const workspacePath = resolve(process.cwd(), "lib", "presentation", "providers", "pptx-office-skeleton.pptx");
  try {
    const modulePath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "presentation", "providers", "pptx-office-skeleton.pptx");
    return existsSync(modulePath) ? modulePath : workspacePath;
  } catch {
    return workspacePath;
  }
}

const OFFICE_SKELETON_STATIC_ENTRIES = [
  "_rels/.rels",
  "docProps/thumbnail.jpeg",
  "ppt/presProps.xml",
  "ppt/viewProps.xml",
  "ppt/tableStyles.xml",
  "ppt/slideMasters/slideMaster1.xml",
  "ppt/slideMasters/_rels/slideMaster1.xml.rels",
  "ppt/notesMasters/notesMaster1.xml",
  "ppt/notesMasters/_rels/notesMaster1.xml.rels",
  "ppt/theme/theme1.xml",
  "ppt/theme/theme2.xml",
  ...Array.from({ length: 11 }, (_, index) => `ppt/slideLayouts/slideLayout${index + 1}.xml`),
  ...Array.from({ length: 11 }, (_, index) => `ppt/slideLayouts/_rels/slideLayout${index + 1}.xml.rels`)
];

let cachedOfficeSkeletonEntries: ZipEntry[] | null | undefined;

function loadOfficeSkeletonEntries() {
  if (cachedOfficeSkeletonEntries !== undefined) return cachedOfficeSkeletonEntries;
  const skeletonPath = officeSkeletonPath();
  if (!existsSync(skeletonPath)) {
    cachedOfficeSkeletonEntries = null;
    return cachedOfficeSkeletonEntries;
  }

  try {
    const skeleton = readFileSync(skeletonPath);
    const availableEntries = new Set(listZipEntries(skeleton));
    const entries = OFFICE_SKELETON_STATIC_ENTRIES.flatMap((name) => {
      if (!availableEntries.has(name)) return [];
      const content = readZipEntry(skeleton, name);
      return content ? [{ name, content }] : [];
    });
    cachedOfficeSkeletonEntries = entries.length >= 25 ? entries : null;
  } catch {
    cachedOfficeSkeletonEntries = null;
  }
  return cachedOfficeSkeletonEntries;
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cleanHex(value: string) {
  return value.replace("#", "").toUpperCase();
}

function shapeText({
  id,
  name,
  box,
  text,
  size,
  color,
  bold,
  align = "l",
  valign = "top",
  fill,
  margin = 0.08
}: {
  id: number;
  name: string;
  box: AcademicPptBox;
  text: string;
  size: number;
  color: string;
  bold?: boolean;
  align?: "l" | "ctr" | "r";
  valign?: "top" | "mid" | "bottom";
  fill?: string;
  margin?: number;
}) {
  const anchor = valign === "mid" ? ' anchor="ctr"' : valign === "bottom" ? ' anchor="b"' : "";
  const fillXml = fill ? `<a:solidFill><a:srgbClr val="${cleanHex(fill)}"/></a:solidFill>` : "<a:noFill/>";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${px(box.x)}" y="${px(box.y)}"/><a:ext cx="${px(box.w)}" cy="${px(box.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fillXml}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square"${anchor} lIns="${px(margin * 96)}" rIns="${px(margin * 96)}" tIns="${px(margin * 96)}" bIns="${px(margin * 96)}"/><a:lstStyle/><a:p><a:pPr algn="${align}"/><a:r><a:rPr lang="zh-CN" sz="${Math.round(size * 100)}"${bold ? ' b="1"' : ""}><a:solidFill><a:srgbClr val="${cleanHex(color)}"/></a:solidFill></a:rPr><a:t>${xmlEscape(text)}</a:t></a:r></a:p></p:txBody></p:sp>`;
}

function fitText(value: string | undefined, maxUnits: number) {
  return truncateAcademicPptText(value, maxUnits);
}

function fittedFontSize(text: string | undefined, baseSize: number, box: AcademicPptBox, minSize = 10) {
  const units = estimateAcademicPptTextUnits(text);
  const capacity = Math.max(24, (box.w / 11) * Math.max(1, box.h / 30));
  if (units <= capacity) return baseSize;
  return Math.max(minSize, Math.round(baseSize * Math.max(0.72, capacity / units)));
}

function withUniqueShapeIds(slideXml: string) {
  let nextId = 1;
  return slideXml.replace(/<p:cNvPr id="\d+"/g, () => `<p:cNvPr id="${nextId++}"`);
}

function rect({
  id,
  name,
  box,
  fill,
  stroke,
  radius = false,
  opacity
}: {
  id: number;
  name: string;
  box: AcademicPptBox;
  fill: string;
  stroke?: string;
  radius?: boolean;
  opacity?: number;
}) {
  const fillOpacity = opacity === undefined ? "" : `<a:alpha val="${Math.round(opacity * 100000)}"/>`;
  const line = stroke
    ? `<a:ln w="${px(1.3)}"><a:solidFill><a:srgbClr val="${cleanHex(stroke)}"/></a:solidFill></a:ln>`
    : "<a:ln><a:noFill/></a:ln>";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${px(box.x)}" y="${px(box.y)}"/><a:ext cx="${px(box.w)}" cy="${px(box.h)}"/></a:xfrm><a:prstGeom prst="${radius ? "roundRect" : "rect"}"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${cleanHex(fill)}">${fillOpacity}</a:srgbClr></a:solidFill>${line}</p:spPr></p:sp>`;
}

function ellipse({
  id,
  name,
  box,
  fill,
  stroke,
  opacity
}: {
  id: number;
  name: string;
  box: AcademicPptBox;
  fill: string;
  stroke?: string;
  opacity?: number;
}) {
  const fillOpacity = opacity === undefined ? "" : `<a:alpha val="${Math.round(opacity * 100000)}"/>`;
  const line = stroke
    ? `<a:ln w="${px(1.2)}"><a:solidFill><a:srgbClr val="${cleanHex(stroke)}"/></a:solidFill></a:ln>`
    : "<a:ln><a:noFill/></a:ln>";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${px(box.x)}" y="${px(box.y)}"/><a:ext cx="${px(box.w)}" cy="${px(box.h)}"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${cleanHex(fill)}">${fillOpacity}</a:srgbClr></a:solidFill>${line}</p:spPr></p:sp>`;
}

function line({ id, x1, y1, x2, y2, color, width = 2 }: { id: number; x1: number; y1: number; x2: number; y2: number; color: string; width?: number }) {
  return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="Line ${id}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="${px(Math.min(x1, x2))}" y="${px(Math.min(y1, y2))}"/><a:ext cx="${px(Math.abs(x2 - x1) || 1)}" cy="${px(Math.abs(y2 - y1) || 1)}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="${px(width)}"><a:solidFill><a:srgbClr val="${cleanHex(color)}"/></a:solidFill></a:ln></p:spPr></p:cxnSp>`;
}

function iconColor(decoration: AcademicPptIconDecoration, theme: AcademicPptTheme) {
  if (decoration.tone === "accent") return theme.colors.accent;
  if (decoration.tone === "secondary") return theme.colors.secondaryAccent;
  return theme.colors.primary;
}

function renderIconGlyph({
  id,
  decoration,
  box,
  theme
}: {
  id: number;
  decoration: AcademicPptIconDecoration;
  box: AcademicPptBox;
  theme: AcademicPptTheme;
}) {
  const color = iconColor(decoration, theme);
  const shapes: Shape[] = [];
  const pad = Math.max(5, box.w * 0.16);
  shapes.push(ellipse({ id, name: `IconBg-${decoration.kind}`, box, fill: color, opacity: 0.12 }));

  if (decoration.kind === "arrow") {
    shapes.push(line({ id: id + 1, x1: box.x + pad, y1: box.y + box.h / 2, x2: box.x + box.w - pad, y2: box.y + box.h / 2, color, width: 3 }));
    shapes.push(line({ id: id + 2, x1: box.x + box.w - pad - 10, y1: box.y + box.h / 2 - 9, x2: box.x + box.w - pad, y2: box.y + box.h / 2, color, width: 3 }));
    shapes.push(line({ id: id + 3, x1: box.x + box.w - pad - 10, y1: box.y + box.h / 2 + 9, x2: box.x + box.w - pad, y2: box.y + box.h / 2, color, width: 3 }));
  } else if (decoration.kind === "chart") {
    [0, 1, 2].forEach((index) =>
      shapes.push(rect({ id: id + 1 + index, name: `IconBar${index}`, box: { x: box.x + pad + index * 12, y: box.y + box.h - pad - 11 - index * 7, w: 8, h: 11 + index * 7 }, fill: color, radius: true }))
    );
  } else if (decoration.kind === "check") {
    shapes.push(line({ id: id + 1, x1: box.x + pad, y1: box.y + box.h / 2, x2: box.x + box.w / 2 - 3, y2: box.y + box.h - pad, color, width: 4 }));
    shapes.push(line({ id: id + 2, x1: box.x + box.w / 2 - 3, y1: box.y + box.h - pad, x2: box.x + box.w - pad, y2: box.y + pad + 4, color, width: 4 }));
  } else if (decoration.kind === "clock") {
    shapes.push(ellipse({ id: id + 1, name: "IconClock", box: { x: box.x + pad, y: box.y + pad, w: box.w - pad * 2, h: box.h - pad * 2 }, fill: "FFFFFF", stroke: color }));
    shapes.push(line({ id: id + 2, x1: box.x + box.w / 2, y1: box.y + box.h / 2, x2: box.x + box.w / 2, y2: box.y + pad + 8, color, width: 2.5 }));
    shapes.push(line({ id: id + 3, x1: box.x + box.w / 2, y1: box.y + box.h / 2, x2: box.x + box.w - pad - 7, y2: box.y + box.h / 2, color, width: 2.5 }));
  } else if (decoration.kind === "compare") {
    shapes.push(rect({ id: id + 1, name: "IconCompareA", box: { x: box.x + pad, y: box.y + pad + 2, w: 14, h: box.h - pad * 2 - 4 }, fill: color, radius: true, opacity: 0.78 }));
    shapes.push(rect({ id: id + 2, name: "IconCompareB", box: { x: box.x + box.w - pad - 14, y: box.y + pad + 2, w: 14, h: box.h - pad * 2 - 4 }, fill: color, radius: true, opacity: 0.42 }));
  } else if (decoration.kind === "formula") {
    shapes.push(shapeText({ id: id + 1, name: "IconFormula", box: { x: box.x + 5, y: box.y + 10, w: box.w - 10, h: box.h - 20 }, text: "fx", size: 16, color, bold: true, align: "ctr", valign: "mid" }));
  } else if (decoration.kind === "table") {
    const x = box.x + pad;
    const y = box.y + pad;
    const w = box.w - pad * 2;
    const h = box.h - pad * 2;
    shapes.push(rect({ id: id + 1, name: "IconTable", box: { x, y, w, h }, fill: "FFFFFF", stroke: color, radius: true }));
    shapes.push(line({ id: id + 2, x1: x, y1: y + h / 2, x2: x + w, y2: y + h / 2, color, width: 1.5 }));
    shapes.push(line({ id: id + 3, x1: x + w / 2, y1: y, x2: x + w / 2, y2: y + h, color, width: 1.5 }));
  } else if (decoration.kind === "module" || decoration.kind === "database") {
    shapes.push(rect({ id: id + 1, name: "IconModule", box: { x: box.x + pad, y: box.y + pad + 2, w: box.w - pad * 2, h: box.h - pad * 2 - 4 }, fill: "FFFFFF", stroke: color, radius: true }));
    shapes.push(rect({ id: id + 2, name: "IconModuleCore", box: { x: box.x + box.w / 2 - 7, y: box.y + box.h / 2 - 7, w: 14, h: 14 }, fill: color, radius: true }));
  } else if (decoration.kind === "flask") {
    shapes.push(shapeText({ id: id + 1, name: "IconFlask", box: { x: box.x + 5, y: box.y + 9, w: box.w - 10, h: box.h - 18 }, text: "EX", size: 13, color, bold: true, align: "ctr", valign: "mid" }));
    shapes.push(line({ id: id + 2, x1: box.x + pad, y1: box.y + box.h - pad, x2: box.x + box.w - pad, y2: box.y + box.h - pad, color, width: 3 }));
  } else if (decoration.kind === "gear") {
    shapes.push(ellipse({ id: id + 1, name: "IconGearOuter", box: { x: box.x + pad, y: box.y + pad, w: box.w - pad * 2, h: box.h - pad * 2 }, fill: "FFFFFF", stroke: color }));
    shapes.push(ellipse({ id: id + 2, name: "IconGearInner", box: { x: box.x + box.w / 2 - 6, y: box.y + box.h / 2 - 6, w: 12, h: 12 }, fill: color }));
  } else {
    shapes.push(shapeText({ id: id + 1, name: "IconStar", box: { x: box.x + 5, y: box.y + 8, w: box.w - 10, h: box.h - 16 }, text: decoration.kind === "node" ? "N" : "*", size: 18, color, bold: true, align: "ctr", valign: "mid" }));
  }

  return shapes;
}

function iconDecorations(plan: AcademicPptRenderSlidePlan, theme: AcademicPptTheme): Shape[] {
  const decorations = (plan.iconDecorations || []).slice(0, 3);
  if (!decorations.length) return [];
  const shapes: Shape[] = [];
  decorations.forEach((decoration, index) => {
    const size = index === 0 && decoration.kind !== "arrow" ? 42 : 34;
    const box =
      index === 0
        ? { x: 1120, y: plan.layout === "cover" ? 92 : 34, w: size, h: size }
        : index === 1
          ? { x: plan.regions.visual.x + plan.regions.visual.w - 58, y: plan.regions.visual.y + 18, w: size, h: size }
          : { x: 1110 - index * 48, y: 610, w: size, h: size };
    shapes.push(...renderIconGlyph({ id: 900 + index * 10, decoration, box, theme }));
  });
  return shapes;
}

function footer(plan: AcademicPptRenderSlidePlan, total: number, theme: AcademicPptTheme): Shape[] {
  return [
    line({ id: 800, x1: theme.regions.footer.x, y1: 660, x2: theme.regions.footer.x + theme.regions.footer.w, y2: 660, color: theme.colors.border, width: 1 }),
    shapeText({
      id: 801,
      name: "FooterBrand",
      box: { x: 60, y: 666, w: 420, h: 24 },
      text: "NexusAI Academic PPT",
      size: theme.fontSizes.footer,
      color: theme.colors.muted
    }),
    shapeText({
      id: 802,
      name: "FooterPage",
      box: { x: 1050, y: 666, w: 170, h: 24 },
      text: `${plan.slideIndex} / ${total}`,
      size: theme.fontSizes.footer,
      color: theme.colors.muted,
      align: "r"
    })
  ];
}

function header(plan: AcademicPptRenderSlidePlan, theme: AcademicPptTheme): Shape[] {
  if (plan.layout === "cover" || plan.layout === "section" || plan.layout === "ending") return [];
  const shapes: Shape[] = [];
  if (theme.template.headerMode === "bar") {
    shapes.push(rect({ id: 10, name: "HeaderBar", box: { x: 0, y: 0, w: 1280, h: 70 }, fill: theme.colors.primary }));
    shapes.push(rect({ id: 11, name: "HeaderAccent", box: { x: 0, y: 0, w: 9, h: 70 }, fill: theme.colors.secondaryAccent }));
    shapes.push(shapeText({ id: 12, name: "HeaderTitle", box: { x: 54, y: 15, w: 980, h: 45 }, text: plan.title, size: 24, color: theme.colors.white, bold: true }));
  } else if (theme.template.headerMode === "google") {
    const colors = ["4285F4", "EA4335", "FBBC04", "34A853"];
    colors.forEach((color, index) => shapes.push(rect({ id: 10 + index, name: `GoogleBar${index}`, box: { x: index * 320, y: 0, w: 320, h: 7 }, fill: color })));
    shapes.push(shapeText({ id: 16, name: "HeaderTitle", box: { x: 60, y: 46, w: 900, h: 46 }, text: plan.title, size: theme.fontSizes.pageTitle, color: theme.colors.text, bold: true }));
    shapes.push(line({ id: 17, x1: 60, y1: 104, x2: 430, y2: 104, color: theme.colors.primary, width: 4 }));
  } else if (theme.template.headerMode === "diagonal") {
    shapes.push(rect({ id: 10, name: "TopAccent", box: { x: 0, y: 0, w: 1280, h: 86 }, fill: theme.colors.primary }));
    shapes.push(rect({ id: 11, name: "GoldAccent", box: { x: 60, y: 82, w: 240, h: 4 }, fill: theme.colors.secondaryAccent }));
    shapes.push(shapeText({ id: 12, name: "HeaderTitle", box: { x: 60, y: 22, w: 900, h: 42 }, text: plan.title, size: 24, color: theme.colors.white, bold: true }));
  } else if (theme.template.headerMode === "gradient") {
    shapes.push(rect({ id: 10, name: "TopTechRule", box: { x: 0, y: 0, w: 1280, h: 9 }, fill: theme.colors.primary }));
    shapes.push(rect({ id: 11, name: "TechHeaderBand", box: { x: 60, y: 38, w: 450, h: 54 }, fill: theme.colors.surface, stroke: theme.colors.border, radius: true }));
    shapes.push(rect({ id: 12, name: "TechHeaderAccent", box: { x: 60, y: 38, w: 8, h: 54 }, fill: theme.colors.accent, radius: true }));
    shapes.push(shapeText({ id: 13, name: "HeaderTitle", box: { x: 82, y: 50, w: 900, h: 34 }, text: plan.title, size: theme.fontSizes.pageTitle, color: theme.colors.text, bold: true }));
  } else {
    shapes.push(rect({ id: 10, name: "TopRule", box: { x: 0, y: 0, w: 1280, h: 5 }, fill: theme.colors.primary }));
    shapes.push(shapeText({ id: 11, name: "HeaderTitle", box: { x: 60, y: 42, w: 980, h: 48 }, text: plan.title, size: theme.fontSizes.pageTitle, color: theme.colors.text, bold: true }));
  }
  return shapes;
}

function bullets(plan: AcademicPptRenderSlidePlan, theme: AcademicPptTheme, box = plan.regions.body): Shape[] {
  const shapes: Shape[] = [];
  const items = plan.bullets.length ? plan.bullets : ["Source-supported point to refine during review."];
  const maxItems = Math.min(items.length, plan.density === "high" ? 5 : 4);
  const rowH = Math.min(86, Math.max(52, (box.h - theme.spacing.cardGap * (maxItems - 1)) / maxItems));
  items.slice(0, maxItems).forEach((item, index) => {
    const y = box.y + index * (rowH + theme.spacing.cardGap);
    shapes.push(rect({ id: 100 + index * 3, name: `BulletCard${index}`, box: { x: box.x, y, w: box.w, h: rowH }, fill: theme.colors.surface, stroke: theme.colors.border, radius: true }));
    shapes.push(rect({ id: 101 + index * 3, name: `BulletAccent${index}`, box: { x: box.x, y, w: 7, h: rowH }, fill: index === 0 ? theme.colors.accent : theme.colors.primary, radius: true }));
    const textBox = { x: box.x + 20, y: y + 8, w: box.w - 32, h: rowH - 14 };
    shapes.push(shapeText({ id: 102 + index * 3, name: `BulletText${index}`, box: textBox, text: fitText(item, Math.round(textBox.w / 4.4)), size: fittedFontSize(item, theme.fontSizes.body, textBox, 11), color: theme.colors.text }));
  });
  return shapes;
}

function visualPlaceholder(plan: AcademicPptRenderSlidePlan, theme: AcademicPptTheme): Shape[] {
  const box = plan.regions.visual;
  const shapes: Shape[] = [
    rect({ id: 300, name: "VisualPanel", box, fill: theme.colors.surface, stroke: theme.colors.border, radius: true }),
    shapeText({
      id: 301,
      name: "VisualType",
      box: { x: box.x + 20, y: box.y + 18, w: box.w - 40, h: 26 },
      text: visualTypeLabel(plan.visualType),
      size: 12,
      color: theme.colors.primary,
      bold: true
    })
  ];
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const hint = plan.visualHint || plan.templateIntent;

  if (plan.visualType === "kpi") {
    const cardW = (box.w - 58) / 2;
    [0, 1, 2, 3].forEach((_, index) => {
      const x = box.x + 20 + (index % 2) * (cardW + 18);
      const y = box.y + 68 + Math.floor(index / 2) * 118;
      shapes.push(rect({ id: 310 + index * 2, name: `KpiCard${index}`, box: { x, y, w: cardW, h: 94 }, fill: theme.colors.white, stroke: index === 0 ? theme.colors.accent : theme.colors.border, radius: true }));
      const kpiText = index === 0 ? fitText(plan.emphasis, 34) : fitText(plan.bullets[index] || `Metric ${index + 1}`, 28);
      shapes.push(shapeText({ id: 311 + index * 2, name: `KpiText${index}`, box: { x: x + 12, y: y + 16, w: cardW - 24, h: 58 }, text: kpiText, size: index === 0 ? 17 : 12, color: index === 0 ? theme.colors.primary : theme.colors.muted, bold: index === 0 }));
    });
  } else if (plan.visualType === "flow" || plan.visualType === "process" || plan.visualType === "timeline") {
    const steps = Math.min(Math.max(plan.bullets.length, 3), 5);
    for (let index = 0; index < steps; index += 1) {
      const x = box.x + 24 + index * ((box.w - 48) / steps);
      shapes.push(rect({ id: 330 + index * 3, name: `Step${index}`, box: { x, y: cy - 34, w: 58, h: 58 }, fill: index === 0 ? theme.colors.primary : theme.colors.white, stroke: theme.colors.primary, radius: true }));
      shapes.push(shapeText({ id: 331 + index * 3, name: `StepNo${index}`, box: { x, y: cy - 20, w: 58, h: 28 }, text: String(index + 1), size: 18, color: index === 0 ? theme.colors.white : theme.colors.primary, bold: true, align: "ctr", valign: "mid" }));
      if (index < steps - 1) shapes.push(line({ id: 332 + index * 3, x1: x + 62, y1: cy - 5, x2: x + (box.w - 48) / steps - 12, y2: cy - 5, color: theme.colors.accent, width: 3 }));
    }
  } else if (plan.visualType === "comparison" || plan.visualType === "swot" || plan.visualType === "matrix") {
    const cols = 2;
    const rows = plan.visualType === "swot" || plan.visualType === "matrix" ? 2 : 1;
    const cellW = (box.w - 56) / cols;
    const cellH = (box.h - 110) / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col;
        shapes.push(rect({ id: 350 + index, name: `Matrix${index}`, box: { x: box.x + 20 + col * (cellW + 16), y: box.y + 70 + row * (cellH + 16), w: cellW, h: cellH }, fill: index % 2 === 0 ? theme.colors.white : theme.colors.surface, stroke: theme.colors.border, radius: true }));
      }
    }
  } else if (plan.visualType === "table") {
    const tableBox = { x: box.x + 26, y: box.y + 90, w: box.w - 52, h: Math.min(230, box.h - 170) };
    shapes.push(rect({ id: 368, name: "TableBg", box: tableBox, fill: theme.colors.white, stroke: theme.colors.border, radius: true }));
    [0, 1, 2, 3].forEach((row) => shapes.push(line({ id: 370 + row, x1: tableBox.x, y1: tableBox.y + row * (tableBox.h / 4), x2: tableBox.x + tableBox.w, y2: tableBox.y + row * (tableBox.h / 4), color: theme.colors.border, width: row === 0 ? 3 : 1 })));
    [1, 2].forEach((col) => shapes.push(line({ id: 380 + col, x1: tableBox.x + col * (tableBox.w / 3), y1: tableBox.y, x2: tableBox.x + col * (tableBox.w / 3), y2: tableBox.y + tableBox.h, color: theme.colors.border, width: 1 })));
  } else if (plan.visualType === "formula") {
    shapes.push(rect({ id: 390, name: "FormulaCard", box: { x: box.x + 34, y: cy - 54, w: box.w - 68, h: 108 }, fill: theme.colors.white, stroke: theme.colors.primary, radius: true }));
    shapes.push(shapeText({ id: 391, name: "FormulaText", box: { x: box.x + 50, y: cy - 20, w: box.w - 100, h: 40 }, text: "f(x) = model + evidence", size: 19, color: theme.colors.primary, bold: true, align: "ctr" }));
  } else if (plan.visualType === "architecture") {
    [0, 1, 2].forEach((index) => {
      shapes.push(rect({ id: 400 + index, name: `Module${index}`, box: { x: box.x + 42 + index * ((box.w - 120) / 3), y: cy - 52, w: 92, h: 84 }, fill: theme.colors.white, stroke: theme.colors.primary, radius: true }));
    });
  } else {
    shapes.push(rect({ id: 410, name: "ChartArea", box: { x: box.x + 42, y: box.y + 104, w: box.w - 84, h: 180 }, fill: theme.colors.white, stroke: theme.colors.border, radius: true }));
    [0, 1, 2, 3].forEach((index) => {
      shapes.push(rect({ id: 420 + index, name: `Bar${index}`, box: { x: box.x + 78 + index * 58, y: box.y + 234 - index * 22, w: 34, h: 48 + index * 22 }, fill: index === 0 ? theme.colors.primary : theme.colors.accent, radius: true }));
    });
  }

  shapes.push(shapeText({ id: 500, name: "VisualHint", box: { x: box.x + 24, y: box.y + box.h - 64, w: box.w - 48, h: 40 }, text: fitText(hint, 72), size: 10.5, color: theme.colors.muted, align: "ctr" }));
  return shapes;
}

function visualTypeLabel(visualType: string) {
  const labels: Record<string, string> = {
    architecture: "ARCHITECTURE",
    chart: "CHART",
    comparison: "COMPARISON",
    flow: "FLOW",
    formula: "FORMULA",
    kpi: "KEY FINDINGS",
    matrix: "MATRIX",
    process: "PROCESS",
    swot: "SWOT",
    table: "TABLE",
    timeline: "TIMELINE"
  };
  return labels[visualType] || "VISUAL";
}

function coverSlide(plan: AcademicPptRenderSlidePlan, theme: AcademicPptTheme): Shape[] {
  const shapes: Shape[] = [rect({ id: 1, name: "Background", box: { x: 0, y: 0, w: 1280, h: 720 }, fill: theme.colors.background })];
  if (theme.template.coverMode === "tech") {
    shapes.push(rect({ id: 2, name: "HeroBlue", box: { x: 0, y: 0, w: 1280, h: 320 }, fill: theme.colors.primary }));
    shapes.push(rect({ id: 3, name: "Wave", box: { x: 0, y: 292, w: 1280, h: 58 }, fill: theme.colors.accent, opacity: 0.32 }));
    shapes.push(rect({ id: 4, name: "TechBottomRule", box: { x: 0, y: 348, w: 1280, h: 6 }, fill: theme.colors.secondaryAccent, opacity: 0.82 }));
  } else if (theme.template.coverMode === "consulting") {
    shapes.push(rect({ id: 2, name: "LeftRule", box: { x: 0, y: 0, w: 10, h: 720 }, fill: theme.colors.primary }));
    shapes.push(rect({ id: 3, name: "Geo", box: { x: 930, y: 90, w: 210, h: 210 }, fill: theme.colors.surface, opacity: 0.8 }));
  } else if (theme.template.coverMode === "google") {
    ["4285F4", "EA4335", "FBBC04", "34A853"].forEach((color, index) => shapes.push(rect({ id: 2 + index, name: `GoogleRail${index}`, box: { x: 0, y: index * 180, w: 10, h: 180 }, fill: color })));
  } else if (theme.template.coverMode === "university") {
    shapes.push(rect({ id: 2, name: "BlueBlock", box: { x: 0, y: 470, w: 760, h: 250 }, fill: theme.colors.primary }));
    shapes.push(rect({ id: 3, name: "GoldLine", box: { x: 72, y: 590, w: 360, h: 5 }, fill: theme.colors.secondaryAccent }));
  } else {
    shapes.push(rect({ id: 2, name: "TopBar", box: { x: 0, y: 0, w: 1280, h: 74 }, fill: theme.colors.primary }));
    shapes.push(rect({ id: 3, name: "RedRail", box: { x: 0, y: 0, w: 10, h: 74 }, fill: theme.colors.secondaryAccent }));
  }
  const titleColor = theme.template.coverMode === "tech" ? theme.colors.white : theme.colors.text;
  const subtitleColor = theme.template.coverMode === "tech" ? theme.colors.white : theme.colors.muted;
  const titleBox = theme.template.coverMode === "tech" ? { x: 92, y: 112, w: 850, h: 136 } : { x: 92, y: 170, w: 830, h: 150 };
  const subtitleBox = theme.template.coverMode === "tech" ? { x: 96, y: 252, w: 780, h: 44 } : { x: 96, y: 330, w: 780, h: 54 };
  shapes.push(shapeText({ id: 20, name: "CoverTitle", box: titleBox, text: fitText(plan.title, 72), size: fittedFontSize(plan.title, theme.fontSizes.coverTitle, titleBox, 28), color: titleColor, bold: true }));
  shapes.push(shapeText({ id: 21, name: "CoverSubtitle", box: subtitleBox, text: fitText(plan.subtitle || "Generated from uploaded academic material", 92), size: 17, color: subtitleColor }));
  shapes.push(line({ id: 22, x1: 96, y1: theme.template.coverMode === "tech" ? 374 : 408, x2: 530, y2: theme.template.coverMode === "tech" ? 374 : 408, color: theme.colors.accent, width: 4 }));
  shapes.push(rect({ id: 23, name: "CoverInfo", box: { x: 96, y: 470, w: 500, h: 96 }, fill: theme.colors.surface, stroke: theme.colors.border, radius: true }));
  shapes.push(shapeText({ id: 24, name: "CoverBullets", box: { x: 116, y: 492, w: 460, h: 54 }, text: fitText(plan.bullets.join(" / "), 82), size: 13, color: theme.colors.text }));
  shapes.push(...visualPlaceholder({ ...plan, visualType: "architecture", regions: { ...plan.regions, visual: { x: 860, y: theme.template.coverMode === "tech" ? 382 : 190, w: 300, h: 250 } } }, theme));
  return shapes;
}

function agendaSlide(plan: AcademicPptRenderSlidePlan, theme: AcademicPptTheme): Shape[] {
  const shapes = [rect({ id: 1, name: "Background", box: { x: 0, y: 0, w: 1280, h: 720 }, fill: theme.colors.background }), ...header(plan, theme)];
  const items = plan.bullets.slice(0, 8);
  const cols = items.length <= 4 ? 1 : 2;
  const cardW = cols === 1 ? 840 : 500;
  const startX = cols === 1 ? 220 : 80;
  const rowGap = items.length <= 4 ? 108 : 96;
  items.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = startX + col * 560;
    const y = 150 + row * rowGap;
    shapes.push(rect({ id: 100 + index * 3, name: `AgendaCard${index}`, box: { x, y, w: cardW, h: 76 }, fill: theme.colors.surface, stroke: theme.colors.border, radius: true }));
    shapes.push(shapeText({ id: 101 + index * 3, name: `AgendaNo${index}`, box: { x: x + 18, y: y + 16, w: 56, h: 42 }, text: String(index + 1).padStart(2, "0"), size: 22, color: theme.colors.primary, bold: true }));
    shapes.push(shapeText({ id: 102 + index * 3, name: `AgendaText${index}`, box: { x: x + 86, y: y + 18, w: cardW - 116, h: 40 }, text: fitText(item, cols === 1 ? 80 : 46), size: 16, color: theme.colors.text, bold: true }));
  });
  return shapes;
}

function sectionSlide(plan: AcademicPptRenderSlidePlan, theme: AcademicPptTheme): Shape[] {
  const shapes: Shape[] = [rect({ id: 1, name: "Background", box: { x: 0, y: 0, w: 1280, h: 720 }, fill: theme.colors.primary })];
  shapes.push(rect({ id: 2, name: "SectionAccent", box: { x: 86, y: 196, w: 9, h: 196 }, fill: theme.colors.secondaryAccent }));
  shapes.push(shapeText({ id: 3, name: "SectionNo", box: { x: 92, y: 110, w: 220, h: 74 }, text: String(plan.slideIndex).padStart(2, "0"), size: 40, color: theme.colors.white, bold: true }));
  shapes.push(shapeText({ id: 4, name: "SectionTitle", box: { x: 116, y: 210, w: 900, h: 110 }, text: plan.title, size: theme.fontSizes.sectionTitle, color: theme.colors.white, bold: true }));
  shapes.push(shapeText({ id: 5, name: "SectionSubtitle", box: { x: 118, y: 342, w: 820, h: 58 }, text: plan.emphasis || plan.subtitle || plan.bullets[0] || "", size: 16, color: theme.colors.surface }));
  shapes.push(rect({ id: 6, name: "Decor", box: { x: 930, y: 104, w: 220, h: 220 }, fill: theme.colors.accent, opacity: 0.22 }));
  return shapes;
}

function compareSlide(plan: AcademicPptRenderSlidePlan, theme: AcademicPptTheme): Shape[] {
  const shapes = [rect({ id: 1, name: "Background", box: { x: 0, y: 0, w: 1280, h: 720 }, fill: theme.colors.background }), ...header(plan, theme)];
  const normalizedItems = plan.bullets.slice(0, 6);
  const split = Math.ceil(normalizedItems.length / 2);
  const groups = [normalizedItems.slice(0, split), normalizedItems.slice(split)];
  groups.forEach((items, groupIndex) => {
    const box = groupIndex === 0 ? plan.regions.body : plan.regions.visual;
    shapes.push(rect({ id: 120 + groupIndex, name: `ComparePanel${groupIndex}`, box, fill: groupIndex === 0 ? theme.colors.surface : theme.colors.white, stroke: theme.colors.border, radius: true }));
    shapes.push(shapeText({ id: 122 + groupIndex, name: `CompareTitle${groupIndex}`, box: { x: box.x + 22, y: box.y + 18, w: box.w - 44, h: 30 }, text: groupIndex === 0 ? "Dimension A" : "Dimension B", size: 15, color: groupIndex === 0 ? theme.colors.primary : theme.colors.accent, bold: true }));
    shapes.push(...bullets({ ...plan, bullets: items.length ? items : ["Comparison point"], regions: { ...plan.regions, body: { x: box.x + 22, y: box.y + 70, w: box.w - 44, h: box.h - 96 } } }, theme, { x: box.x + 22, y: box.y + 70, w: box.w - 44, h: box.h - 96 }));
  });
  return shapes;
}

function contentSlide(plan: AcademicPptRenderSlidePlan, theme: AcademicPptTheme): Shape[] {
  const shapes = [rect({ id: 1, name: "Background", box: { x: 0, y: 0, w: 1280, h: 720 }, fill: theme.colors.background }), ...header(plan, theme)];
  if (plan.emphasis && plan.layout !== "content") {
    shapes.push(rect({ id: 42, name: "KeyMessage", box: theme.regions.keyMessage, fill: theme.colors.surface, stroke: theme.colors.border, radius: true }));
    shapes.push(shapeText({ id: 43, name: "KeyMessageText", box: { x: theme.regions.keyMessage.x + 16, y: theme.regions.keyMessage.y + 10, w: theme.regions.keyMessage.w - 32, h: 28 }, text: plan.emphasis, size: 13, color: theme.colors.primary, bold: true }));
  }
  if (plan.layout === "compare" || plan.layout === "two_column") return compareSlide(plan, theme);
  if (plan.layout === "timeline" || plan.layout === "flow") {
    shapes.push(...visualPlaceholder(plan, theme));
    shapes.push(...bullets(plan, theme, { x: plan.regions.body.x, y: plan.regions.body.y, w: plan.regions.body.w, h: plan.regions.body.h }));
  } else {
    shapes.push(...bullets(plan, theme));
    if (plan.visualType !== "none") shapes.push(...visualPlaceholder(plan, theme));
  }
  return shapes;
}

function summarySlide(plan: AcademicPptRenderSlidePlan, theme: AcademicPptTheme): Shape[] {
  const shapes = [rect({ id: 1, name: "Background", box: { x: 0, y: 0, w: 1280, h: 720 }, fill: theme.colors.background }), ...header(plan, theme)];
  const items = plan.bullets.slice(0, 5);
  const cols = items.length <= 2 ? items.length || 1 : 3;
  const cardW = (1160 - 20 * (cols - 1)) / cols;
  items.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = 60 + col * (cardW + 20);
    const y = 172 + row * 168;
    shapes.push(rect({ id: 170 + index * 2, name: `Takeaway${index}`, box: { x, y, w: cardW, h: 128 }, fill: index === 0 ? theme.colors.primary : theme.colors.surface, stroke: theme.colors.border, radius: true }));
    shapes.push(shapeText({ id: 171 + index * 2, name: `TakeawayText${index}`, box: { x: x + 18, y: y + 22, w: cardW - 36, h: 78 }, text: fitText(item, 64), size: 15, color: index === 0 ? theme.colors.white : theme.colors.text, bold: index === 0 }));
  });
  return shapes;
}

function renderSlide(plan: AcademicPptRenderSlidePlan, total: number, theme: AcademicPptTheme) {
  let shapes: Shape[];
  if (plan.layout === "cover") shapes = coverSlide(plan, theme);
  else if (plan.layout === "agenda") shapes = agendaSlide(plan, theme);
  else if (plan.layout === "section") shapes = sectionSlide(plan, theme);
  else if (plan.layout === "summary" || plan.layout === "ending") shapes = summarySlide(plan, theme);
  else shapes = contentSlide(plan, theme);
  shapes.push(...iconDecorations(plan, theme));
  shapes.push(...footer(plan, total, theme));

  return withUniqueShapeIds(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
}

function createAgendaSlide(outline: AcademicPptOutline): AcademicPptSlide {
  const agendaItems = outline.slides
    .filter((slide, index) => index > 0 && slide.layout !== "cover")
    .slice(0, 8)
    .map((slide) => slide.title);
  return {
    title: outline.language === "en" ? "Agenda" : "Agenda",
    subtitle: outline.title,
    layout: "agenda",
    visualType: "process",
    templateIntent: "Show numbered sections using the selected template agenda structure.",
    bullets: agendaItems.length ? agendaItems : ["Research background", "Method and evaluation", "Conclusion"]
  };
}

function shortReferenceText(value: string | undefined, maxLength: number) {
  const cleaned = (value || "").replace(/\s+/g, " ").trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 3)}...` : cleaned;
}

function createResearchReferenceSlide(outline: AcademicPptOutline, researchBrief?: AcademicPptResearchBrief): AcademicPptSlide | undefined {
  const sources = researchBrief?.sources?.filter((source) => source.title || source.snippet).slice(0, 5) || [];
  if (!sources.length) return undefined;
  const language = outline.language === "en" ? "en" : "zh";
  return {
    title: language === "en" ? "Reference Notes" : "资料依据",
    subtitle: language === "en" ? "Supplementary context used cautiously" : "用于背景补充的资料摘要",
    layout: "table",
    visualType: "table",
    templateIntent: "Show compact evidence notes without exposing long URLs or service details.",
    visualHint:
      language === "en"
        ? "Render a compact source table with short title and usage note."
        : "使用简洁表格呈现资料标题和用途说明。",
    bullets: sources.map((source) => `${shortReferenceText(source.title, 54)}: ${shortReferenceText(source.snippet, 110)}`),
    speakerNotes: researchBrief?.summary,
    emphasis:
      language === "en"
        ? "Uploaded source remains the primary basis; supplementary notes only support framing."
        : "上传资料仍是主要依据，补充资料只用于背景说明。"
  };
}

function appendResearchReferenceSlide(slides: AcademicPptSlide[], outline: AcademicPptOutline, researchBrief?: AcademicPptResearchBrief) {
  const researchSlide = createResearchReferenceSlide(outline, researchBrief);
  if (!researchSlide || slides.some((slide) => /资料依据|reference notes|sources/i.test(slide.title))) return slides;
  return [...slides, researchSlide];
}

function normalizePptxSlides(outline: AcademicPptOutline, researchBrief?: AcademicPptResearchBrief) {
  const slides = appendResearchReferenceSlide(outline.slides.slice(0, 60), outline, researchBrief);
  if (slides.length <= 2) return slides;
  const hasAgenda = slides.slice(0, 3).some((slide) => slide.layout === "agenda" || /agenda|contents|toc|目录/i.test(slide.title));
  if (hasAgenda) return slides;
  return [slides[0], createAgendaSlide(outline), ...slides.slice(1)];
}

function officeDefaultTextStyleXml() {
  const levels = Array.from({ length: 9 }, (_, index) => {
    const level = index + 1;
    const margin = index * 457200;
    return `<a:lvl${level}pPr marL="${margin}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${level}pPr>`;
  }).join("");

  return `<p:defaultTextStyle><a:defPPr><a:defRPr lang="zh-CN"/></a:defPPr>${levels}</p:defaultTextStyle>`;
}

function presentationXml(slideCount: number) {
  const slideIds = Array.from({ length: slideCount }, (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join("");
  const notesMasterRelId = `rId${slideCount + 2}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="${notesMasterRelId}"/></p:notesMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>${officeDefaultTextStyleXml()}</p:presentation>`;
}

function presentationRels(slideCount: number) {
  const slideRels = Array.from(
    { length: slideCount },
    (_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`
  ).join("");
  const baseId = slideCount + 2;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slideRels}<Relationship Id="rId${baseId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/><Relationship Id="rId${baseId + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/><Relationship Id="rId${baseId + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/><Relationship Id="rId${baseId + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/><Relationship Id="rId${baseId + 4}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>`;
}

function contentTypes(slideCount: number) {
  const slideOverrides = Array.from(
    { length: slideCount },
    (_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join("");
  const notesOverrides = Array.from(
    { length: slideCount },
    (_, index) => `<Override PartName="/ppt/notesSlides/notesSlide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`
  ).join("");
  const layoutOverrides = Array.from(
    { length: 11 },
    (_, index) => `<Override PartName="/ppt/slideLayouts/slideLayout${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${layoutOverrides}${slideOverrides}${notesOverrides}</Types>`;
}

function slideRelsXml(index: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout${OFFICE_BLANK_LAYOUT}.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${index}.xml"/></Relationships>`;
}

function notesSlideXml(plan: AcademicPptRenderSlidePlan, index: number) {
  const notes = fitText([plan.title, plan.subtitle, plan.emphasis, ...plan.bullets].filter(Boolean).join(" / "), 360);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="685800"/><a:ext cx="5943600" cy="1371600"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="1200"/><a:t>${xmlEscape(notes)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}

function notesSlideRelsXml(index: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${index}.xml"/></Relationships>`;
}

function appXml(slides: AcademicPptRenderSlidePlan[]) {
  const titles = slides.map((slide) => `<vt:lpstr>${xmlEscape(slide.title)}</vt:lpstr>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft PowerPoint</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>${slides.length}</Slides><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Slides</vt:lpstr></vt:variant><vt:variant><vt:i4>${slides.length}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="${slides.length}" baseType="lpstr">${titles}</vt:vector></TitlesOfParts></Properties>`;
}

export async function writeAcademicPptxFromOutline({
  outputPath,
  outline,
  settings = defaultAcademicPptSettings,
  researchBrief
}: {
  outputPath: string;
  outline: AcademicPptOutline;
  settings?: AcademicPptSettings;
  researchBrief?: AcademicPptResearchBrief;
}) {
  const normalizedOutline = { ...outline, slides: normalizePptxSlides(outline, researchBrief) };
  const normalizedSettings = normalizeAcademicPptSettings(settings);
  const plan = createAcademicPptRenderPlan(normalizedOutline, normalizedSettings);
  const slides = plan.slides;
  const officeSkeletonEntries = loadOfficeSkeletonEntries();

  const entries: ZipEntry[] = [
    ...(officeSkeletonEntries || []),
    {
      name: "[Content_Types].xml",
      content: Buffer.from(contentTypes(slides.length))
    },
    ...(officeSkeletonEntries
      ? []
      : [
          {
            name: "_rels/.rels",
            content: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`)
          }
        ]),
    {
      name: "docProps/core.xml",
      content: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(outline.title)}</dc:title><dc:creator>NexusAI Academic PPT</dc:creator><cp:lastModifiedBy>NexusAI Academic PPT</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified></cp:coreProperties>`)
    },
    {
      name: "docProps/app.xml",
      content: Buffer.from(appXml(slides))
    },
    {
      name: "ppt/presentation.xml",
      content: Buffer.from(presentationXml(slides.length))
    },
    {
      name: "ppt/_rels/presentation.xml.rels",
      content: Buffer.from(presentationRels(slides.length))
    },
    ...slides.map((slide, index) => ({
      name: `ppt/slides/slide${index + 1}.xml`,
      content: Buffer.from(renderSlide(slide, slides.length, plan.theme))
    })),
    ...slides.map((slide, index) => ({
      name: `ppt/slides/_rels/slide${index + 1}.xml.rels`,
      content: Buffer.from(slideRelsXml(index + 1))
    })),
    ...slides.map((slide, index) => ({
      name: `ppt/notesSlides/notesSlide${index + 1}.xml`,
      content: Buffer.from(notesSlideXml(slide, index + 1))
    })),
    ...slides.map((_, index) => ({
      name: `ppt/notesSlides/_rels/notesSlide${index + 1}.xml.rels`,
      content: Buffer.from(notesSlideRelsXml(index + 1))
    }))
  ];

  await writeFile(outputPath, zip(entries));
  return { slideCount: slides.length };
}

export async function writeMinimalAcademicPptx({
  outputPath,
  sourceFileName
}: {
  outputPath: string;
  sourceFileName: string;
}) {
  await writeAcademicPptxFromOutline({
    outputPath,
    outline: {
      title: "Academic PPT Generation",
      subtitle: `Source file: ${sourceFileName}`,
      language: "en",
      slides: [
        {
          title: "Academic PPT Generation",
          subtitle: `Source file: ${sourceFileName}`,
          layout: "cover",
          visualType: "none",
          bullets: ["Uploaded source accepted.", "The academic-ppt isolated task chain is active."]
        },
        {
          title: "Processing Flow",
          layout: "flow",
          visualType: "process",
          bullets: ["Upload file", "Create queued task", "Parse source", "Plan outline", "Export PPTX"]
        },
        {
          title: "Generation Boundary",
          layout: "summary",
          visualType: "kpi",
          bullets: ["Model calls use NexusAI server-side capability.", "No provider settings are exposed in the UI.", "The main PPT generation chain remains untouched."]
        }
      ]
    }
  });
}
