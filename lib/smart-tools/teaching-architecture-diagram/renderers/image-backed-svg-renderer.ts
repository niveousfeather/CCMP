import "server-only";

import { readFile } from "node:fs/promises";

import {
  buildTeachingArchitectureOverlayLayout,
  type NormalizedTextBox
} from "@/lib/smart-tools/teaching-architecture-diagram/renderers/image-overlay-layout";
import { fitTextIntoBox } from "@/lib/smart-tools/teaching-architecture-diagram/renderers/text-fit";
import { FONT_FAMILY, escapeXml } from "@/lib/smart-tools/teaching-architecture-diagram/renderers/svg-utils";
import type { TeachingArchitectureVisualPreset } from "@/lib/smart-tools/teaching-architecture-diagram/prompts";
import type { TeachingArchitectureDiagramScene } from "@/lib/smart-tools/teaching-architecture-diagram/types";

export type ImageBackedEditableSvgResult = {
  svg: string;
  width: number;
  height: number;
  editableTextBoxCount: number;
  backgroundImageDataUri: string;
};

export async function renderImageBackedEditableSvg(params: {
  scene: TeachingArchitectureDiagramScene;
  outputPngPath: string;
  visualPreset?: TeachingArchitectureVisualPreset;
}): Promise<ImageBackedEditableSvgResult> {
  const png = await readFile(params.outputPngPath);
  const size = readPngSize(png);
  const backgroundImageDataUri = `data:image/png;base64,${png.toString("base64")}`;
  const scene = {
    ...params.scene,
    width: size.width,
    height: size.height
  };
  const overlays = buildTeachingArchitectureOverlayLayout({
    scene,
    visualPreset: params.visualPreset
  });
  const overlayMarkup = overlays.map((box) => renderOverlayBox(box, size.width, size.height)).join("\n");
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}" role="img" aria-label="${escapeXml(scene.title)}">`,
    `<image href="${backgroundImageDataUri}" x="0" y="0" width="${size.width}" height="${size.height}" preserveAspectRatio="none"/>`,
    `<g data-layer="editable-text-overlays">`,
    overlayMarkup,
    "</g>",
    "</svg>"
  ].join("\n");

  return {
    svg,
    width: size.width,
    height: size.height,
    editableTextBoxCount: overlays.length,
    backgroundImageDataUri
  };
}

export function readPngSize(buffer: Buffer) {
  if (
    buffer.length < 24 ||
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47 ||
    buffer[4] !== 0x0d ||
    buffer[5] !== 0x0a ||
    buffer[6] !== 0x1a ||
    buffer[7] !== 0x0a
  ) {
    throw new Error("output.png 不是有效 PNG 文件。");
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

export function renderImageBackedSvgFromDataUri(params: {
  scene: TeachingArchitectureDiagramScene;
  backgroundImageDataUri: string;
  visualPreset?: TeachingArchitectureVisualPreset;
}) {
  const overlays = buildTeachingArchitectureOverlayLayout({
    scene: params.scene,
    visualPreset: params.visualPreset
  });
  return {
    overlays,
    width: params.scene.width,
    height: params.scene.height
  };
}

function renderOverlayBox(box: NormalizedTextBox, svgWidth: number, svgHeight: number) {
  const abs = toAbsoluteBox(box, svgWidth, svgHeight);
  const role = box.role || "module";
  const fitted = fitTextIntoBox({
    text: box.text,
    boxWidth: abs.width - 10,
    boxHeight: abs.height - 8,
    role
  });
  const textAnchor = box.align === "start" ? "start" : box.align === "end" ? "end" : "middle";
  const textX = box.align === "start" ? abs.x + 6 : box.align === "end" ? abs.x + abs.width - 6 : abs.x + abs.width / 2;
  const blockHeight = fitted.lines.length * fitted.lineHeight;
  const startY =
    box.valign === "top"
      ? abs.y + 6 + fitted.fontSize
      : box.valign === "bottom"
        ? abs.y + abs.height - blockHeight + fitted.fontSize - 6
        : abs.y + (abs.height - blockHeight) / 2 + fitted.fontSize * 0.82;
  const cover = box.cover === false ? "" : renderCoverRect(abs, box);
  const tspans = fitted.lines
    .map((line, index) => `<tspan x="${round(textX)}" y="${round(startY + index * fitted.lineHeight)}">${escapeXml(line)}</tspan>`)
    .join("");

  return [
    `<g data-editable="true" data-editable-path="${escapeXml(box.editablePath)}" data-editable-kind="${escapeXml(box.edit.targetType)}">`,
    cover,
    `<text x="${round(textX)}" y="${round(startY)}" text-anchor="${textAnchor}" font-family="${escapeXml(FONT_FAMILY)}" font-size="${fitted.fontSize}" font-weight="${box.fontWeight || 800}" fill="${box.textFill || "#0f172a"}" pointer-events="none">${tspans}</text>`,
    `</g>`
  ]
    .filter(Boolean)
    .join("\n");
}

function renderCoverRect(abs: { x: number; y: number; width: number; height: number }, box: NormalizedTextBox) {
  return `<rect x="${round(abs.x)}" y="${round(abs.y)}" width="${round(abs.width)}" height="${round(abs.height)}" rx="${box.radius ?? 8}" fill="${box.coverFill || "#ffffff"}" opacity="${box.coverOpacity ?? 0.92}" pointer-events="all"/>`;
}

function toAbsoluteBox(box: NormalizedTextBox, svgWidth: number, svgHeight: number) {
  return {
    x: box.x * svgWidth,
    y: box.y * svgHeight,
    width: box.width * svgWidth,
    height: box.height * svgHeight
  };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
