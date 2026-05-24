import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  getAcademicPptTaskDir,
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

async function describeFinalPptx(taskId: string, pptxPath: string) {
  const buffer = await readFile(pptxPath);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const fileStat = await stat(pptxPath);
  const relativePath = path.relative(getAcademicPptTaskDir(taskId), pptxPath).replace(/\\/g, "/");
  return {
    finalPptxPath: relativePath.startsWith("..") ? path.basename(pptxPath) : relativePath,
    finalPptxSha256: sha256,
    finalPptxFileSize: fileStat.size
  };
}

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
  previewDir: string,
  finalPptx: Awaited<ReturnType<typeof describeFinalPptx>>
): Promise<{ manifest: AcademicPptPreviewManifest; manifestPath: string } | undefined> {
  const manifestPath = path.join(previewDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8").catch(() => "{}")) as Partial<AcademicPptPreviewManifest>;
  if (!manifest.available || !manifest.slides?.length) return undefined;
  if (manifest.source !== "native_preview") return undefined;
  if (manifest.finalPptxSha256 && manifest.finalPptxSha256 !== finalPptx.finalPptxSha256) return undefined;
  if (manifest.finalPptxPath && manifest.finalPptxPath !== finalPptx.finalPptxPath) return undefined;
  return {
    manifest: {
      taskId,
      available: true,
      type: manifest.type || "image",
      source: "native_preview",
      slideCount: manifest.slideCount || manifest.slides.length,
      previewCount: manifest.previewCount || manifest.slides.length,
      slides: manifest.slides,
      status: "ready",
      pptxUrl: manifest.pptxUrl,
      finalPptxPath: manifest.finalPptxPath || finalPptx.finalPptxPath,
      finalPptxSha256: manifest.finalPptxSha256 || finalPptx.finalPptxSha256,
      finalPptxFileSize: manifest.finalPptxFileSize || finalPptx.finalPptxFileSize,
      previewManifestUrl: manifest.previewManifestUrl,
      previewStoragePrefix: manifest.previewStoragePrefix,
      storageProvider: manifest.storageProvider || "local",
      fallbackReason: manifest.fallbackReason,
      previewOutdated: false,
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
  manifest: AcademicPptPreviewManifest,
  finalPptx: Awaited<ReturnType<typeof describeFinalPptx>>
) {
  return (await readExistingAvailableManifest(taskId, previewDir, finalPptx)) || {
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
  diagnostics?: AcademicPptPreviewManifest["diagnostics"],
  finalPptx?: Awaited<ReturnType<typeof describeFinalPptx>>
): AcademicPptPreviewManifest {
  return {
    available: false,
    type: "outline",
    source: "structured_placeholder",
    slideCount: expectedSlideCount,
    previewCount: 0,
    slides: [],
    fallbackReason: reason,
    finalPptxPath: finalPptx?.finalPptxPath,
    finalPptxSha256: finalPptx?.finalPptxSha256,
    finalPptxFileSize: finalPptx?.finalPptxFileSize,
    previewOutdated: false,
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
  const finalPptx = await describeFinalPptx(taskId, pptxPath);

  await onLog?.("info", "正在检测 PPTX 预览工具。");
  const environment = await checkAcademicPptPreviewEnvironment();
  const diagnostics = toAcademicPptPreviewDiagnostics(environment);

  if (environment.libreOffice.status === "missing") {
    const manifest = fallbackManifest(
      ACADEMIC_PPT_PREVIEW_FALLBACK_REASONS.libreOfficeMissing,
      expectedSlideCount,
      diagnostics,
      finalPptx
    );
    await onLog?.("warn", "未检测到 LibreOffice / soffice，已降级结构化预览。");
    return writeFallbackManifestUnlessExistingPreview(taskId, previewDir, manifest, finalPptx);
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
    }, finalPptx);
    await onLog?.("warn", "PPTX 转 PDF 失败，已降级结构化预览。");
    return writeFallbackManifestUnlessExistingPreview(taskId, previewDir, manifest, finalPptx);
  }

  const pdfPath = await findConvertedPdf(previewDir, pptxPath);
  if (!pdfPath) {
    const reason = ACADEMIC_PPT_PREVIEW_FALLBACK_REASONS.pptxToPdfFailed;
    const manifest = fallbackManifest(reason, expectedSlideCount, {
      ...diagnostics,
      nativePreview: "unavailable",
      reason
    }, finalPptx);
    await onLog?.("warn", "PPTX 转 PDF 未产生可用 PDF，已降级结构化预览。");
    return writeFallbackManifestUnlessExistingPreview(taskId, previewDir, manifest, finalPptx);
  }

  if (environment.pdftoppm.status === "missing") {
    const reason = ACADEMIC_PPT_PREVIEW_FALLBACK_REASONS.pdftoppmMissing;
    const manifest = fallbackManifest(reason, expectedSlideCount, {
      ...diagnostics,
      nativePreview: "unavailable",
      reason
    }, finalPptx);
    await onLog?.("warn", "未检测到 pdftoppm，已降级结构化预览。");
    return writeFallbackManifestUnlessExistingPreview(taskId, previewDir, manifest, finalPptx);
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
      finalPptxPath: finalPptx.finalPptxPath,
      finalPptxSha256: finalPptx.finalPptxSha256,
      finalPptxFileSize: finalPptx.finalPptxFileSize,
      previewOutdated: false,
      diagnostics: {
        ...diagnostics,
        nativePreview: "available",
        reason: undefined
      },
      generatedAt: new Date().toISOString()
    };
    await onLog?.("info", `原生 PPTX 预览成功，已生成 ${slides.length} 页图片。`);
    return writeFallbackManifestUnlessExistingPreview(taskId, previewDir, manifest, finalPptx);
  } catch (error) {
    const reason = ACADEMIC_PPT_PREVIEW_FALLBACK_REASONS.pdfToPngFailed;
    const manifest = fallbackManifest(reason, expectedSlideCount, {
      ...diagnostics,
      nativePreview: "unavailable",
      reason
    }, finalPptx);
    await onLog?.("warn", "PDF 转 PNG 失败，已降级结构化预览。");
    return writeFallbackManifestUnlessExistingPreview(taskId, previewDir, manifest, finalPptx);
  }
}
