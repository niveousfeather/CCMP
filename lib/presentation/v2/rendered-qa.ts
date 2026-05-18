import type { PresentationQaFinding, PresentationQaReport } from "@/lib/presentation/types";

const SLIDE_W = 12192000;
const SLIDE_H = 6858000;
const MIN_EDGE_MARGIN = 240000;
const DEFAULT_TEXT_SIZE = 1800;

export type RenderedPptxEntry = {
  name: string;
  content: string | Buffer;
};

export type RenderedPresentationQaReport = PresentationQaReport & {
  slideCount: number;
};

type RenderedShape = {
  name: string;
  x: number;
  y: number;
  cx: number;
  cy: number;
  text: string;
  fontSize: number;
};

export type RenderedPresentationQaInput = {
  buffer?: Buffer;
  entries?: RenderedPptxEntry[];
  expectedSlides?: number;
  requireV2PresetMarkers?: boolean;
};

function xmlUnescape(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function weightedLength(text: string) {
  let total = 0;
  for (const char of text) {
    total += /^[\x00-\x7F]$/.test(char) ? 0.55 : 1;
  }
  return total;
}

function listZipCentralEntries(buffer: Buffer): RenderedPptxEntry[] {
  const entries: RenderedPptxEntry[] = [];

  for (let offset = 0; offset <= buffer.length - 46; offset += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;

    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;

    if (nameEnd > buffer.length || localHeaderOffset > buffer.length - 30) break;
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8");
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd <= buffer.length && compression === 0 && compressedSize === uncompressedSize) {
      entries.push({ name, content: buffer.subarray(dataStart, dataEnd) });
    } else {
      entries.push({ name, content: "" });
    }

    offset = nameEnd + extraLength + commentLength - 1;
  }

  return entries;
}

function slideNumberFromPath(path: string) {
  return Number(path.match(/ppt\/slides\/slide(\d+)\.xml$/)?.[1] || 0);
}

function textFromShapeXml(xml: string) {
  return Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
    .map((match) => xmlUnescape(match[1] || ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function shapeNameFromXml(xml: string) {
  return xmlUnescape(xml.match(/<p:cNvPr[^>]*\sname="([^"]*)"/)?.[1] || "Shape");
}

function shapeSizeFromXml(xml: string) {
  const transform = xml.match(/<a:xfrm>[\s\S]*?<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"\/>[\s\S]*?<a:ext\s+cx="(-?\d+)"\s+cy="(-?\d+)"\/>[\s\S]*?<\/a:xfrm>/);
  if (!transform) return null;
  return {
    x: Number(transform[1]),
    y: Number(transform[2]),
    cx: Number(transform[3]),
    cy: Number(transform[4])
  };
}

function shapeFontSizeFromXml(xml: string) {
  const sizes = Array.from(xml.matchAll(/\ssz="(\d+)"/g)).map((match) => Number(match[1])).filter((value) => Number.isFinite(value));
  return sizes.length ? Math.max(...sizes) : DEFAULT_TEXT_SIZE;
}

function parseRenderedShapes(slideXml: string) {
  const shapes: RenderedShape[] = [];
  const shapeBlocks = slideXml.match(/<p:(?:sp|pic)\b[\s\S]*?<\/p:(?:sp|pic)>/g) || [];

  for (const shapeXml of shapeBlocks) {
    const size = shapeSizeFromXml(shapeXml);
    if (!size) continue;
    shapes.push({
      name: shapeNameFromXml(shapeXml),
      ...size,
      text: textFromShapeXml(shapeXml),
      fontSize: shapeFontSizeFromXml(shapeXml)
    });
  }

  return shapes;
}

function isNearEdge(shape: RenderedShape) {
  return (
    shape.x < MIN_EDGE_MARGIN ||
    shape.y < MIN_EDGE_MARGIN ||
    shape.x + shape.cx > SLIDE_W - MIN_EDGE_MARGIN ||
    shape.y + shape.cy > SLIDE_H - MIN_EDGE_MARGIN
  );
}

function hasTextOverflowRisk(shape: RenderedShape) {
  if (!shape.text) return false;
  const sizeFactor = Math.max(shape.fontSize / 1000, 1);
  const capacity = Math.max(12, (shape.cx / 52000) * Math.max(shape.cy / 320000, 0.65) * (1.8 / sizeFactor));
  return weightedLength(shape.text) > capacity;
}

function significantContentShape(shape: RenderedShape) {
  return Boolean(shape.text) && shape.cx > 100000 && shape.cy > 100000;
}

function overlapArea(a: RenderedShape, b: RenderedShape) {
  const x = Math.max(0, Math.min(a.x + a.cx, b.x + b.cx) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.cy, b.y + b.cy) - Math.max(a.y, b.y));
  return x * y;
}

function hasOverlapRisk(a: RenderedShape, b: RenderedShape) {
  if (!significantContentShape(a) || !significantContentShape(b)) return false;
  const area = overlapArea(a, b);
  if (!area) return false;
  const smaller = Math.min(a.cx * a.cy, b.cx * b.cy);
  return smaller > 0 && area / smaller > 0.2;
}

export function checkRenderedPresentationPptx(input: RenderedPresentationQaInput): RenderedPresentationQaReport {
  const entries = input.entries || (input.buffer ? listZipCentralEntries(input.buffer) : []);
  const slideEntries = entries
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.name))
    .sort((a, b) => slideNumberFromPath(a.name) - slideNumberFromPath(b.name));
  const findings: PresentationQaFinding[] = [];

  if (typeof input.expectedSlides === "number" && slideEntries.length !== input.expectedSlides) {
    findings.push({
      rule: "slide_count_mismatch",
      severity: "error",
      slideIndex: -1,
      message: `Rendered PPTX contains ${slideEntries.length} slides; expected ${input.expectedSlides}.`
    });
  }

  slideEntries.forEach((entry, index) => {
    const xml = Buffer.isBuffer(entry.content) ? entry.content.toString("utf8") : String(entry.content || "");
    const shapes = parseRenderedShapes(xml);

    if (input.requireV2PresetMarkers && !xml.includes("V2 Preset Rendered")) {
      findings.push({
        rule: "missing_v2_marker",
        severity: "error",
        slideIndex: index,
        message: "Rendered slide is missing the V2 preset marker."
      });
    }

    const edgeShape = shapes.find((shape) => significantContentShape(shape) && isNearEdge(shape));
    if (edgeShape) {
      findings.push({
        rule: "edge_margin_risk",
        severity: "warning",
        slideIndex: index,
        message: `Shape "${edgeShape.name}" is close to the slide edge.`
      });
    }

    const overflowShape = shapes.find(hasTextOverflowRisk);
    if (overflowShape) {
      findings.push({
        rule: "rendered_text_overflow_risk",
        severity: "warning",
        slideIndex: index,
        message: `Text in "${overflowShape.name}" may overflow its rendered box.`
      });
    }

    for (let left = 0; left < shapes.length; left += 1) {
      const overlapped = shapes.slice(left + 1).find((shape) => hasOverlapRisk(shapes[left], shape));
      if (!overlapped) continue;
      findings.push({
        rule: "rendered_shape_overlap_risk",
        severity: "warning",
        slideIndex: index,
        message: `Shapes "${shapes[left].name}" and "${overlapped.name}" may overlap.`
      });
      break;
    }
  });

  return {
    slideCount: slideEntries.length,
    passed: findings.every((finding) => finding.severity !== "error"),
    findings
  };
}
