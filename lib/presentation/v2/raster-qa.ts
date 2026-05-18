import { existsSync, readFileSync } from "node:fs";

import type { PresentationPreviewResult } from "@/lib/presentation/v2/preview";

export type RasterPreviewQaRule =
  | "missing_preview_image"
  | "invalid_png"
  | "low_resolution"
  | "aspect_ratio_mismatch"
  | "blank_image_risk";

export type RasterPreviewQaFinding = {
  rule: RasterPreviewQaRule;
  severity: "warning" | "error";
  slideIndex: number;
  message: string;
};

export type RasterPreviewQaReport = {
  status: "passed" | "warning" | "failed" | "skipped";
  checkedSlides: number;
  findings: RasterPreviewQaFinding[];
};

type PngInfo = {
  width: number;
  height: number;
  idatBytes: number;
};

function readUInt32(buffer: Buffer, offset: number) {
  return offset + 4 <= buffer.length ? buffer.readUInt32BE(offset) : 0;
}

function parsePng(buffer: Buffer): PngInfo | null {
  if (buffer.length < 33) return null;
  if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
  if (buffer.subarray(12, 16).toString("ascii") !== "IHDR") return null;

  const width = readUInt32(buffer, 16);
  const height = readUInt32(buffer, 20);
  let offset = 8;
  let idatBytes = 0;

  while (offset + 12 <= buffer.length) {
    const length = readUInt32(buffer, offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") idatBytes += length;
    offset += 12 + length;
    if (type === "IEND") break;
  }

  return width > 0 && height > 0 ? { width, height, idatBytes } : null;
}

function hasAspectRatioRisk(info: PngInfo) {
  const ratio = info.width / info.height;
  return Math.abs(ratio - 16 / 9) > 0.06;
}

function hasBlankRisk(info: PngInfo, fileSize: number) {
  const pixelCount = info.width * info.height;
  return pixelCount >= 400000 && (info.idatBytes < 512 || fileSize / pixelCount < 0.0009);
}

export function checkRasterPreviewImages(preview: PresentationPreviewResult): RasterPreviewQaReport {
  const nativeSlides = preview.slides.filter((slide) => slide.status === "native_image" || slide.status === "html_image");
  const findings: RasterPreviewQaFinding[] = [];

  if (!nativeSlides.length) {
    return {
      status: "skipped",
      checkedSlides: 0,
      findings: []
    };
  }

  nativeSlides.forEach((slide) => {
    if (!slide.imagePath || !existsSync(slide.imagePath)) {
      findings.push({
        rule: "missing_preview_image",
        severity: "warning",
        slideIndex: slide.index,
        message: `Native preview image is missing for slide ${slide.index + 1}.`
      });
      return;
    }

    const buffer = readFileSync(slide.imagePath);
    const png = parsePng(buffer);
    if (!png) {
      findings.push({
        rule: "invalid_png",
        severity: "error",
        slideIndex: slide.index,
        message: `Preview image for slide ${slide.index + 1} is not a valid PNG.`
      });
      return;
    }

    if (png.width < 960 || png.height < 540) {
      findings.push({
        rule: "low_resolution",
        severity: "warning",
        slideIndex: slide.index,
        message: `Preview image is ${png.width}x${png.height}; expected at least 960x540.`
      });
    }

    if (hasAspectRatioRisk(png)) {
      findings.push({
        rule: "aspect_ratio_mismatch",
        severity: "warning",
        slideIndex: slide.index,
        message: `Preview image aspect ratio is ${(png.width / png.height).toFixed(2)}; expected close to 16:9.`
      });
    }

    if (hasBlankRisk(png, buffer.length)) {
      findings.push({
        rule: "blank_image_risk",
        severity: "warning",
        slideIndex: slide.index,
        message: "Preview image is unusually small for its resolution and may be blank."
      });
    }
  });

  const hasError = findings.some((finding) => finding.severity === "error");
  return {
    status: hasError ? "failed" : findings.length ? "warning" : "passed",
    checkedSlides: nativeSlides.length,
    findings
  };
}
