import "server-only";

import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  getAcademicPptPreviewDir,
  writeAcademicPptPreviewManifest
} from "@/lib/smart-tools/academic-ppt/server-task-store";
import {
  ACADEMIC_PPT_PREVIEW_FALLBACK_REASONS,
  checkAcademicPptPreviewEnvironment,
  runAcademicPptPreviewCommand,
  toAcademicPptPreviewDiagnostics
} from "@/lib/smart-tools/academic-ppt/preview-tools";
import type { AcademicPptPreviewManifest } from "@/lib/smart-tools/academic-ppt/types";

type RenderInput = {
  taskId: string;
  pptxPath: string;
  expectedSlideCount: number;
  onLog?: (level: "info" | "warn", message: string) => void | Promise<void>;
};

async function findConvertedPdf(previewDir: string, pptxPath: string) {
  const expectedName = `${path.basename(pptxPath, path.extname(pptxPath))}.pdf`;
  const expectedPath = path.join(previewDir, expectedName);
  try {
    await stat(expectedPath);
    return expectedPath;
  } catch {
    const files = await readdir(previewDir).catch(() => []);
    const pdf = files.find((file) => file.toLowerCase().endsWith(".pdf"));
    return pdf ? path.join(previewDir, pdf) : undefined;
  }
}

async function readExistingAvailableManifest(
  taskId: string,
  previewDir: string
): Promise<{ manifest: AcademicPptPreviewManifest; manifestPath: string } | undefined> {
  const manifestPath = path.join(previewDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8").catch(() => "{}")) as Partial<AcademicPptPreviewManifest>;
  if (!manifest.available || !manifest.slides?.length) return undefined;
  return {
    manifest: {
      taskId,
      available: true,
      type: manifest.type || "svg",
      source: manifest.source || "svg_final",
      slideCount: manifest.slideCount || manifest.slides.length,
      previewCount: manifest.previewCount || manifest.slides.length,
      slides: manifest.slides,
      status: "ready",
      pptxUrl: manifest.pptxUrl,
      previewManifestUrl: manifest.previewManifestUrl,
      previewStoragePrefix: manifest.previewStoragePrefix,
      storageProvider: manifest.storageProvider || "local",
      fallbackReason: manifest.fallbackReason,
      diagnostics: manifest.diagnostics,
      createdAt: manifest.createdAt,
      updatedAt: manifest.updatedAt,
      generatedAt: manifest.generatedAt || new Date().toISOString()
    },
    manifestPath
  };
}

async function writeFallbackManifestUnlessExistingPreview(
  taskId: string,
  previewDir: string,
  manifest: AcademicPptPreviewManifest
) {
  return (await readExistingAvailableManifest(taskId, previewDir)) || {
    manifest,
    manifestPath: await writeAcademicPptPreviewManifest(taskId, manifest)
  };
}

async function collectPreviewImages(taskId: string, previewDir: string, expectedSlideCount: number) {
  const files = (await readdir(previewDir).catch(() => []))
    .filter((file) => /^slide-\d+\.png$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const count = files.length || expectedSlideCount;
  return Promise.all(
    files.slice(0, count).map(async (file, index) => {
      const imagePath = path.join(previewDir, file);
      const fileStat = await stat(imagePath).catch(() => undefined);
      const header = await readFile(imagePath).catch(() => undefined);
      const isPng = header && header.length >= 24 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const pageNumber = index + 1;
      const url = `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/preview/${pageNumber}`;
      return {
        index,
        pageNumber,
        url,
        imageUrl: url,
        assetPath: `previews/slide-${String(pageNumber).padStart(3, "0")}.png`,
        source: "native_preview" as const,
        storageProvider: "local" as const,
        width: isPng ? header.readUInt32BE(16) : undefined,
        height: isPng ? header.readUInt32BE(20) : undefined,
        fileSizeBytes: fileStat?.size
      };
    })
  );
}

function fallbackManifest(
  reason: string,
  expectedSlideCount: number,
  diagnostics?: AcademicPptPreviewManifest["diagnostics"]
): AcademicPptPreviewManifest {
  return {
    available: false,
    type: "outline",
    source: "structured_placeholder",
    slideCount: expectedSlideCount,
    previewCount: 0,
    slides: [],
    fallbackReason: reason,
    diagnostics,
    generatedAt: new Date().toISOString()
  };
}

export async function renderAcademicPptNativePreview({
  taskId,
  pptxPath,
  expectedSlideCount,
  onLog
}: RenderInput): Promise<{ manifest: AcademicPptPreviewManifest; manifestPath: string }> {
  const previewDir = getAcademicPptPreviewDir(taskId);
  await mkdir(previewDir, { recursive: true });

  await onLog?.("info", "正在检测 PPTX 预览工具。");
  const environment = await checkAcademicPptPreviewEnvironment();
  const diagnostics = toAcademicPptPreviewDiagnostics(environment);

  if (environment.libreOffice.status === "missing") {
    const manifest = fallbackManifest(
      ACADEMIC_PPT_PREVIEW_FALLBACK_REASONS.libreOfficeMissing,
      expectedSlideCount,
      diagnostics
    );
    await onLog?.("warn", "未检测到 LibreOffice / soffice，已降级结构化预览。");
    return writeFallbackManifestUnlessExistingPreview(taskId, previewDir, manifest);
  }

  try {
    await onLog?.("info", "正在导出 PDF。");
    await runAcademicPptPreviewCommand(
      environment.libreOffice.command!,
      ["--headless", "--convert-to", "pdf", "--outdir", previewDir, pptxPath],
      90_000
    );
  } catch (error) {
    const reason = ACADEMIC_PPT_PREVIEW_FALLBACK_REASONS.pptxToPdfFailed;
    const manifest = fallbackManifest(reason, expectedSlideCount, {
      ...diagnostics,
      nativePreview: "unavailable",
      reason
    });
    await onLog?.("warn", "PPTX 转 PDF 失败，已降级结构化预览。");
    return writeFallbackManifestUnlessExistingPreview(taskId, previewDir, manifest);
  }

  const pdfPath = await findConvertedPdf(previewDir, pptxPath);
  if (!pdfPath) {
    const reason = ACADEMIC_PPT_PREVIEW_FALLBACK_REASONS.pptxToPdfFailed;
    const manifest = fallbackManifest(reason, expectedSlideCount, {
      ...diagnostics,
      nativePreview: "unavailable",
      reason
    });
    await onLog?.("warn", "PPTX 转 PDF 未产生可用 PDF，已降级结构化预览。");
    return writeFallbackManifestUnlessExistingPreview(taskId, previewDir, manifest);
  }

  if (environment.pdftoppm.status === "missing") {
    const reason = ACADEMIC_PPT_PREVIEW_FALLBACK_REASONS.pdftoppmMissing;
    const manifest = fallbackManifest(reason, expectedSlideCount, {
      ...diagnostics,
      nativePreview: "unavailable",
      reason
    });
    await onLog?.("warn", "未检测到 pdftoppm，已降级结构化预览。");
    return writeFallbackManifestUnlessExistingPreview(taskId, previewDir, manifest);
  }

  try {
    await onLog?.("info", "正在生成页面图片。");
    await runAcademicPptPreviewCommand(environment.pdftoppm.command!, ["-png", "-r", "120", pdfPath, path.join(previewDir, "slide")], 90_000);
    const generated = await readdir(previewDir);
    await Promise.all(
      generated
        .filter((file) => /^slide-\d+\.png$/i.test(file))
        .map(async (file) => {
          const match = file.match(/(\d+)/);
          if (!match) return;
          const normalizedName = `slide-${String(Number(match[1])).padStart(3, "0")}.png`;
          if (file !== normalizedName) {
            const { rename } = await import("node:fs/promises");
            await rename(path.join(previewDir, file), path.join(previewDir, normalizedName)).catch(() => undefined);
          }
        })
    );
    const slides = await collectPreviewImages(taskId, previewDir, expectedSlideCount);
    if (!slides.length) {
      throw new Error("PPTX preview image generation failed");
    }
    const manifest: AcademicPptPreviewManifest = {
      available: true,
      type: "image",
      source: "native_preview",
      slideCount: slides.length,
      previewCount: slides.length,
      slides,
      diagnostics: {
        ...diagnostics,
        nativePreview: "available",
        reason: undefined
      },
      generatedAt: new Date().toISOString()
    };
    await onLog?.("info", `原生 PPTX 预览成功，已生成 ${slides.length} 页图片。`);
    return writeFallbackManifestUnlessExistingPreview(taskId, previewDir, manifest);
  } catch (error) {
    const reason = ACADEMIC_PPT_PREVIEW_FALLBACK_REASONS.pdfToPngFailed;
    const manifest = fallbackManifest(reason, expectedSlideCount, {
      ...diagnostics,
      nativePreview: "unavailable",
      reason
    });
    await onLog?.("warn", "PDF 转 PNG 失败，已降级结构化预览。");
    return { manifest, manifestPath: await writeAcademicPptPreviewManifest(taskId, manifest) };
  }
}
