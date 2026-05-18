import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  AcademicPptIconDecoration,
  AcademicPptOutline,
  AcademicPptSettings,
  AcademicPptLogLevel,
  AcademicPptNativePreviewSlide,
  AcademicPptPreviewManifest,
  AcademicPptQualityReport,
  AcademicPptRecentTask,
  AcademicPptSlidePreview,
  AcademicPptSourceFileType,
  AcademicPptTaskRequestSnapshot,
  AcademicPptTaskLog,
  AcademicPptTaskRecord,
  AcademicPptTaskStatus,
  AcademicPptTaskStep
} from "@/lib/smart-tools/academic-ppt/types";
import { getAcademicPptTemplateForSettings } from "@/lib/smart-tools/academic-ppt/template-registry";
import { normalizeAcademicPptSettings } from "@/lib/smart-tools/academic-ppt/task-api";
import { planAcademicPptIconDecorations } from "@/lib/smart-tools/academic-ppt/icon-decoration";

const ACADEMIC_PPT_ROOT = path.join(process.cwd(), "data", "academic-ppt");
const MAX_LOGS_PER_TASK = 500;
const MAX_PREVIEW_BULLETS = 5;
const MAX_PREVIEW_SLIDES = 60;
const ACADEMIC_PPT_TASK_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ACADEMIC_PPT_UPLOAD_LIMIT_BYTES = 50 * 1024 * 1024;
export const ACADEMIC_PPT_ALLOWED_EXTENSIONS = new Set([".pdf", ".pptx", ".tex", ".txt", ".md", ".markdown"]);

export function createAcademicPptTaskId() {
  return randomUUID();
}

export function assertAcademicPptTaskId(taskId: string) {
  if (!ACADEMIC_PPT_TASK_ID_PATTERN.test(taskId)) {
    throw new Error("Invalid academic-ppt task id.");
  }
}

function isPathInsideDirectory(targetPath: string, directoryPath: string) {
  const relative = path.relative(path.resolve(directoryPath), path.resolve(targetPath));
  return relative === "" || (relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative));
}

export function sanitizeAcademicPptFileName(fileName: string) {
  const baseName = path.basename(fileName || "source");
  const cleaned = baseName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
  return cleaned || "source";
}

export function getAcademicPptFileExtension(fileName: string) {
  return path.extname(fileName || "").toLowerCase();
}

export function inferAcademicPptSourceFileType(fileName: string): AcademicPptSourceFileType {
  const extension = getAcademicPptFileExtension(fileName);
  if (extension === ".pdf") return "PDF";
  if (extension === ".pptx") return "PPTX";
  if (extension === ".txt") return "Text";
  if (extension === ".md" || extension === ".markdown") return "Markdown";
  return "TeX";
}

export function assertAcademicPptFileAllowed(fileName: string, size: number) {
  const extension = getAcademicPptFileExtension(fileName);
  if (!ACADEMIC_PPT_ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("仅支持 PDF、PPTX、TeX、TXT 或 Markdown 文件。");
  }
  if (size <= 0) {
    throw new Error("上传文件为空。");
  }
  if (size > ACADEMIC_PPT_UPLOAD_LIMIT_BYTES) {
    throw new Error("文件大小超过 50MB 限制。");
  }
}

export function getAcademicPptTaskDir(taskId: string) {
  assertAcademicPptTaskId(taskId);
  return path.join(ACADEMIC_PPT_ROOT, "tasks", taskId);
}

export function getAcademicPptUploadDir(taskId: string) {
  return path.join(getAcademicPptTaskDir(taskId), "uploads");
}

export function getAcademicPptOutputDir(taskId: string) {
  return path.join(getAcademicPptTaskDir(taskId), "outputs");
}

export function getAcademicPptPreviewDir(taskId: string) {
  return path.join(getAcademicPptTaskDir(taskId), "previews");
}

export function getAcademicPptCheckpointDir(taskId: string) {
  return path.join(getAcademicPptTaskDir(taskId), "checkpoints");
}

function getTaskRecordPath(taskId: string) {
  return path.join(getAcademicPptTaskDir(taskId), "task.json");
}

function getTaskLogsPath(taskId: string) {
  return path.join(getAcademicPptTaskDir(taskId), "logs.json");
}

function getTaskQualityReportPath(taskId: string) {
  return path.join(getAcademicPptTaskDir(taskId), "quality-report.json");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeJsonFileAtomic(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await rename(tempPath, filePath);
}

async function readJsonFileWithRetry<T>(filePath: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return JSON.parse(await readFile(filePath, "utf8")) as T;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await delay(35 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("JSON file could not be read.");
}

function getTaskPreviewManifestPath(taskId: string) {
  return path.join(getAcademicPptPreviewDir(taskId), "manifest.json");
}

function getLegacyTaskPreviewManifestPath(taskId: string) {
  return path.join(getAcademicPptPreviewDir(taskId), "preview.json");
}

function isSvgFileName(fileName: string) {
  return fileName.toLowerCase().endsWith(".svg");
}

export async function findAcademicPptSvgFinalFiles(taskId: string) {
  const paperWorkspacesDir = path.join(getAcademicPptCheckpointDir(taskId), "paper-workspaces");
  const workspaces = await readdir(paperWorkspacesDir, { withFileTypes: true }).catch(() => []);
  const candidates: Array<{ directoryPath: string; modifiedAt: number }> = [];

  for (const workspace of workspaces) {
    if (!workspace.isDirectory()) continue;
    const svgFinalDir = path.join(paperWorkspacesDir, workspace.name, "svg_final");
    const files = await readdir(svgFinalDir, { withFileTypes: true }).catch(() => []);
    if (!files.some((file) => file.isFile() && isSvgFileName(file.name))) continue;
    const dirStat = await stat(svgFinalDir).catch(() => undefined);
    candidates.push({ directoryPath: svgFinalDir, modifiedAt: dirStat?.mtimeMs || 0 });
  }

  const latest = candidates.sort((a, b) => b.modifiedAt - a.modifiedAt)[0];
  if (!latest) return [];
  const files = await readdir(latest.directoryPath, { withFileTypes: true }).catch(() => []);
  return files
    .filter((file) => file.isFile() && isSvgFileName(file.name))
    .map((file) => path.join(latest.directoryPath, file.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true }));
}

function previewAssetPath(pageNumber: number, type: string) {
  const extension = type === "svg" ? "svg" : "png";
  return `previews/slide-${String(pageNumber).padStart(3, "0")}.${extension}`;
}

function previewAssetUrl(taskId: string, pageNumber: number) {
  return `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/preview/${pageNumber}`;
}

function normalizePreviewSlide(
  taskId: string,
  slide: Partial<AcademicPptNativePreviewSlide>,
  position: number,
  source: AcademicPptPreviewManifest["source"],
  type: AcademicPptPreviewManifest["type"]
): AcademicPptNativePreviewSlide {
  const legacyIndex = Number(slide.index);
  const explicitPageNumber = Number(slide.pageNumber);
  const pageNumber =
    Number.isInteger(explicitPageNumber) && explicitPageNumber > 0
      ? explicitPageNumber
      : Number.isInteger(legacyIndex) && legacyIndex > 0
        ? legacyIndex
        : position + 1;
  const normalizedIndex =
    Number.isInteger(legacyIndex) && legacyIndex >= 0 && slide.pageNumber
      ? legacyIndex
      : pageNumber - 1;
  const url = slide.publicUrl || slide.url || slide.imageUrl || previewAssetUrl(taskId, pageNumber);
  return {
    index: normalizedIndex,
    pageNumber,
    url,
    imageUrl: url,
    assetPath: slide.assetPath || previewAssetPath(pageNumber, type),
    source: slide.source || source,
    publicUrl: slide.publicUrl,
    storageKey: slide.storageKey,
    storageProvider: slide.storageProvider || "local",
    width: slide.width,
    height: slide.height,
    fileSizeBytes: slide.fileSizeBytes
  };
}

function normalizePreviewManifest(
  taskId: string,
  manifest: Partial<AcademicPptPreviewManifest>,
  fallback: { updatedAt: string; slideCount?: number }
): AcademicPptPreviewManifest {
  const type = manifest.type || "outline";
  const source =
    manifest.source ||
    (manifest.available && type === "svg"
      ? "svg_final"
      : manifest.available && (type === "image" || type === "pdf")
        ? "native_preview"
        : "structured_placeholder");
  const slides = (manifest.slides || []).map((slide, index) => normalizePreviewSlide(taskId, slide, index, source, type));
  const slideCount = manifest.slideCount ?? fallback.slideCount ?? slides.length;
  const previewCount = manifest.previewCount ?? (manifest.available ? slides.length : 0);
  const now = manifest.updatedAt || manifest.generatedAt || fallback.updatedAt;
  return {
    taskId,
    status: manifest.status || (manifest.available ? "ready" : "unavailable"),
    available: Boolean(manifest.available),
    type,
    source,
    slideCount,
    previewCount,
    slides,
    pptxUrl: manifest.pptxUrl || `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/download`,
    previewManifestUrl: manifest.previewManifestUrl || `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/preview`,
    previewStoragePrefix: manifest.previewStoragePrefix || `academic-ppt/tasks/${taskId}/previews`,
    storageProvider: manifest.storageProvider || "local",
    fallbackReason: manifest.fallbackReason,
    diagnostics: manifest.diagnostics,
    createdAt: manifest.createdAt || manifest.generatedAt || fallback.updatedAt,
    updatedAt: now,
    generatedAt: manifest.generatedAt || fallback.updatedAt
  };
}

function buildSvgFinalPreviewManifest(
  taskId: string,
  svgFinalFiles: string[],
  record: AcademicPptTaskRecord
): AcademicPptPreviewManifest {
  const slides: AcademicPptNativePreviewSlide[] = svgFinalFiles.map((_, index) => ({
    index,
    pageNumber: index + 1,
    url: previewAssetUrl(taskId, index + 1),
    imageUrl: previewAssetUrl(taskId, index + 1),
    assetPath: previewAssetPath(index + 1, "svg"),
    source: "svg_final",
    storageProvider: "local"
  }));
  return {
    available: true,
    type: "svg",
    source: "svg_final",
    slideCount: svgFinalFiles.length,
    previewCount: svgFinalFiles.length,
    slides,
    pptxUrl: `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/download`,
    previewManifestUrl: `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/preview`,
    previewStoragePrefix: `academic-ppt/tasks/${taskId}/previews`,
    storageProvider: "local",
    status: "ready",
    taskId,
    createdAt: record.previewUpdatedAt || record.updatedAt,
    updatedAt: record.previewUpdatedAt || record.updatedAt,
    generatedAt: record.previewUpdatedAt || record.updatedAt
  };
}

async function readStoredAcademicPptPreviewManifest(
  taskId: string,
  record: AcademicPptTaskRecord
): Promise<AcademicPptPreviewManifest | undefined> {
  const manifestPath = record.previewManifestPath || getTaskPreviewManifestPath(taskId);
  const resolvedManifest = path.resolve(manifestPath);
  const resolvedTaskDir = path.resolve(getAcademicPptTaskDir(taskId));
  if (!isPathInsideDirectory(resolvedManifest, resolvedTaskDir)) {
    throw new Error("棰勮鍏冩暟鎹矾寰勬棤鏁堛€?");
  }
  const manifestText = await readFile(resolvedManifest, "utf8").catch(async (error) => {
    if (record.previewManifestPath) throw error;
    return readFile(getLegacyTaskPreviewManifestPath(taskId), "utf8").catch(() => undefined);
  });
  if (!manifestText) return undefined;
  const manifest = JSON.parse(manifestText) as Partial<AcademicPptPreviewManifest>;
  return normalizePreviewManifest(taskId, manifest, {
    updatedAt: record.previewUpdatedAt || record.updatedAt,
    slideCount: record.previewSlideCount || record.slideCount || record.slidesPreview?.length || 0
  });
}

export async function ensureAcademicPptStorage() {
  await Promise.all([
    mkdir(path.join(ACADEMIC_PPT_ROOT, "uploads"), { recursive: true }),
    mkdir(path.join(ACADEMIC_PPT_ROOT, "outputs"), { recursive: true }),
    mkdir(path.join(ACADEMIC_PPT_ROOT, "logs"), { recursive: true }),
    mkdir(path.join(ACADEMIC_PPT_ROOT, "tasks"), { recursive: true })
  ]);
}

export async function ensureAcademicPptTaskDirs(taskId: string) {
  await Promise.all([
    mkdir(getAcademicPptTaskDir(taskId), { recursive: true }),
    mkdir(getAcademicPptUploadDir(taskId), { recursive: true }),
    mkdir(getAcademicPptCheckpointDir(taskId), { recursive: true }),
    mkdir(getAcademicPptOutputDir(taskId), { recursive: true }),
    mkdir(getAcademicPptPreviewDir(taskId), { recursive: true })
  ]);
}

export async function listAcademicPptTaskRecords(): Promise<Array<AcademicPptTaskRecord & { settings?: AcademicPptSettings }>> {
  await ensureAcademicPptStorage();
  const taskRoot = path.join(ACADEMIC_PPT_ROOT, "tasks");
  const entries = await readdir(taskRoot, { withFileTypes: true }).catch(() => []);
  const records: Array<AcademicPptTaskRecord & { settings?: AcademicPptSettings }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !ACADEMIC_PPT_TASK_ID_PATTERN.test(entry.name)) continue;
    try {
      records.push(await readAcademicPptTaskRecord(entry.name));
    } catch (error) {
      console.warn(
        `[academic-ppt] skip invalid task ${entry.name}: ${error instanceof Error ? error.message : "unknown"}`
      );
    }
  }

  return records;
}

function toRecentAcademicPptTask(record: AcademicPptTaskRecord): AcademicPptRecentTask {
  return {
    taskId: record.taskId,
    sourceFileName: record.inputFileName,
    status: record.status,
    slideCount: record.slideCount,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    modelSource: record.modelSource,
    generatorSource: record.generatorSource,
    qualityScore: record.qualityScore
  };
}

function buildAcademicPptRequestSnapshot(
  settings: AcademicPptSettings,
  templateId: string
): AcademicPptTaskRequestSnapshot {
  return {
    slideCount: settings.targetSlides,
    templateId,
    language: settings.outputLanguage,
    deepResearchEnabled: settings.enableDeepResearch,
    externalResearchEnabled: settings.enableExternalResearch,
    webSearchEnabled: settings.webSearchEnabled ?? settings.enableExternalResearch,
    visualQaEnabled: settings.enableVisualQa,
    iconDecorationEnabled: settings.enableIconDecoration,
    searchProvider: "nexus-searxng",
    generatorPreference: "paper-ppt-agent"
  };
}

export async function listRecentAcademicPptTasks(limit = 10): Promise<AcademicPptRecentTask[]> {
  const records = await listAcademicPptTaskRecords();

  return records
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt))
    .slice(0, Math.min(Math.max(limit, 1), 10))
    .map(toRecentAcademicPptTask);
}

export async function createAcademicPptTaskRecord({
  taskId,
  inputFileName,
  inputFilePath,
  settings
}: {
  taskId: string;
  inputFileName: string;
  inputFilePath: string;
  settings: AcademicPptSettings;
}) {
  const now = new Date().toISOString();
  await ensureAcademicPptTaskDirs(taskId);
  const normalizedSettings = normalizeAcademicPptSettings(settings);
  const template = getAcademicPptTemplateForSettings(normalizedSettings);
  const record: AcademicPptTaskRecord & { settings: AcademicPptSettings } = {
    taskId,
    status: "queued",
    progress: 5,
    currentStep: "upload_received",
    lastCompletedStep: "upload_received",
    resumable: false,
    retryCount: 0,
    maxRetries: 2,
    timeoutAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    inputFileName,
    inputFilePath,
    templateId: template.id,
    templateName: template.name,
    templateStyle: normalizedSettings.templateStyle,
    sourceFileType: inferAcademicPptSourceFileType(inputFileName),
    visualQaEnabled: normalizedSettings.enableVisualQa,
    iconDecorationEnabled: normalizedSettings.enableIconDecoration,
    researchEnabled: normalizedSettings.enableDeepResearch,
    externalResearchEnabled: normalizedSettings.enableExternalResearch,
    researchStatus: normalizedSettings.enableDeepResearch || normalizedSettings.enableExternalResearch ? "skipped" : "skipped",
    researchSourcesCount: 0,
    modelCriticEnabled: normalizedSettings.enableVisualQa,
    modelCriticStatus: normalizedSettings.enableVisualQa ? "skipped" : "skipped",
    generatorSource: "tools-engine",
    outputStorageProvider: "local",
    previewStoragePrefix: `academic-ppt/tasks/${taskId}/previews`,
    previewAssetsReady: false,
    requestSnapshot: buildAcademicPptRequestSnapshot(normalizedSettings, template.id),
    deepResearchEnabled: normalizedSettings.enableDeepResearch,
    webSearchEnabled: normalizedSettings.webSearchEnabled ?? normalizedSettings.enableExternalResearch,
    searchEnabled: normalizedSettings.webSearchEnabled ?? normalizedSettings.enableExternalResearch,
    searchProvider: "nexus-searxng",
    searchStatus: (normalizedSettings.webSearchEnabled ?? normalizedSettings.enableExternalResearch) ? "enabled" : "disabled",
    modelCriticRounds: 0,
    autoRepairRounds: 0,
    autoRepairApplied: false,
    createdAt: now,
    startedAt: now,
    updatedAt: now,
    settings: normalizedSettings
  };
  await writeJsonFileAtomic(getTaskRecordPath(taskId), record);
  await writeJsonFileAtomic(getTaskLogsPath(taskId), []);
  return record;
}

export async function readAcademicPptTaskRecord(taskId: string) {
  return readJsonFileWithRetry<AcademicPptTaskRecord & { settings?: AcademicPptSettings }>(getTaskRecordPath(taskId));
}

export async function updateAcademicPptTaskRecord(
  taskId: string,
  patch: Partial<
    Pick<
      AcademicPptTaskRecord,
      | "status"
      | "progress"
      | "currentStep"
      | "outputFilePath"
      | "outputStorageProvider"
      | "pptxUrl"
      | "previewManifestUrl"
      | "previewStoragePrefix"
      | "previewAssetsReady"
      | "error"
      | "resumable"
      | "resumeFromStep"
      | "lastCompletedStep"
      | "retryCount"
      | "maxRetries"
      | "timeoutAt"
      | "modelSource"
      | "modelName"
      | "fallbackReason"
      | "generationMode"
      | "visualPipelineStatus"
      | "generatorSource"
      | "requestSnapshot"
      | "modelBridgeStatus"
      | "modelBridgePrimaryModel"
      | "modelBridgePrimaryStatus"
      | "modelBridgeFallbackModel"
      | "modelBridgeFallbackStatus"
      | "modelBridgeErrorSummary"
      | "modelBridgeUrlSource"
      | "slideCount"
      | "outputFileSize"
      | "templateId"
      | "templateName"
      | "templateStyle"
      | "sourceFileType"
      | "extractedTextLength"
      | "outlineTitle"
      | "completedAt"
      | "startedAt"
      | "failedAt"
      | "cancelledAt"
      | "qualityScore"
      | "qualityLevel"
      | "qualityIssuesCount"
      | "repairRounds"
      | "qualityReportPath"
      | "slidesPreview"
      | "previewUpdatedAt"
      | "cancelRequested"
      | "previewAvailable"
      | "previewType"
      | "previewSlideCount"
      | "previewFallbackReason"
      | "previewManifestPath"
      | "visualQaScore"
      | "visualQaLevel"
      | "visualQaIssuesCount"
      | "visualQaEnabled"
      | "visualQaSummary"
      | "visualQaPreviewType"
      | "iconDecorationEnabled"
      | "researchEnabled"
      | "externalResearchEnabled"
      | "deepResearchEnabled"
      | "webSearchEnabled"
      | "searchEnabled"
      | "searchProvider"
      | "searchStatus"
      | "researchStatus"
      | "researchSourcesCount"
      | "researchFallbackReason"
      | "researchBriefUpdatedAt"
      | "modelCriticEnabled"
      | "modelCriticStatus"
      | "modelCriticScore"
      | "modelCriticLevel"
      | "modelCriticIssuesCount"
      | "modelCriticRounds"
      | "modelCriticFallbackReason"
      | "autoRepairFallbackReason"
      | "autoRepairRounds"
      | "autoRepairApplied"
      | "finalQualityScore"
      | "finalVisualQaScore"
    >
  >
) {
  const current = await readAcademicPptTaskRecord(taskId);
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  await writeJsonFileAtomic(getTaskRecordPath(taskId), next);
  return next;
}

export async function appendAcademicPptLog(taskId: string, level: AcademicPptLogLevel, message: string) {
  try {
    const logs = await readAcademicPptLogs(taskId, MAX_LOGS_PER_TASK).catch(() => []);
    const next = [
      ...logs,
      {
        time: new Date().toISOString(),
        level,
        message
      }
    ].slice(-MAX_LOGS_PER_TASK);
    await writeJsonFileAtomic(getTaskLogsPath(taskId), next);
  } catch (error) {
    console.warn(
      `[academic-ppt] log append failed for task ${taskId}: ${error instanceof Error ? error.message : "unknown"}`
    );
  }
}

export async function writeAcademicPptQualityReport(taskId: string, report: AcademicPptQualityReport) {
  const reportPath = getTaskQualityReportPath(taskId);
  await writeJsonFileAtomic(reportPath, report);
  return reportPath;
}

export async function writeAcademicPptPreviewManifest(taskId: string, manifest: AcademicPptPreviewManifest) {
  const previewDir = getAcademicPptPreviewDir(taskId);
  await mkdir(previewDir, { recursive: true });
  const manifestPath = getTaskPreviewManifestPath(taskId);
  const normalizedManifest = normalizePreviewManifest(taskId, manifest, { updatedAt: manifest.generatedAt });
  await writeJsonFileAtomic(manifestPath, normalizedManifest);
  return manifestPath;
}

export async function readAcademicPptPreviewManifest(taskId: string): Promise<AcademicPptPreviewManifest> {
  const record = await readAcademicPptTaskRecord(taskId);
  const storedManifest = await readStoredAcademicPptPreviewManifest(taskId, record);
  if (storedManifest && (storedManifest.available || storedManifest.status === "pending" || !record.previewAvailable)) {
    return storedManifest;
  }
  const svgFinalFiles = await findAcademicPptSvgFinalFiles(taskId);
  if (svgFinalFiles.length) {
    return buildSvgFinalPreviewManifest(taskId, svgFinalFiles, record);
  }
  if (storedManifest) {
    return storedManifest;
  }
  const previewPending = record.status === "queued" || record.status === "pending" || record.status === "running";
  return {
    taskId,
    status: previewPending ? "pending" : "unavailable",
    available: false,
    type: "outline",
    source: "structured_placeholder",
    slideCount: record.slideCount || record.slidesPreview?.length || 0,
    previewCount: 0,
    slides: [],
    pptxUrl: `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/download`,
    previewManifestUrl: `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/preview`,
    previewStoragePrefix: `academic-ppt/tasks/${taskId}/previews`,
    storageProvider: "local",
    fallbackReason: record.previewFallbackReason || "预览尚未生成。",
    generatedAt: record.previewUpdatedAt || record.updatedAt
  };
}
export async function getAcademicPptPreviewImageInfo(taskId: string, slideIndex: number) {
  const manifest = await readAcademicPptPreviewManifest(taskId);
  const slide = manifest.slides.find((item) => item.pageNumber === slideIndex || item.index === slideIndex - 1);
  if (!(slide?.url || slide?.imageUrl || slide?.assetPath) || !manifest.available || (manifest.type !== "image" && manifest.type !== "svg")) {
    return undefined;
  }
  const extension = manifest.type === "svg" ? "svg" : "png";
  const filePath = slide.assetPath
    ? path.join(getAcademicPptTaskDir(taskId), slide.assetPath)
    : path.join(getAcademicPptPreviewDir(taskId), `slide-${String(slideIndex).padStart(3, "0")}.${extension}`);
  const resolvedFile = path.resolve(filePath);
  const resolvedTaskDir = path.resolve(getAcademicPptTaskDir(taskId));
  if (!isPathInsideDirectory(resolvedFile, resolvedTaskDir)) {
    throw new Error("预览图路径无效。");
  }
  if (manifest.type === "svg") {
    const resolvedSvg = await stat(resolvedFile)
      .then(() => resolvedFile)
      .catch(async () => {
        const svgFinalFiles = await findAcademicPptSvgFinalFiles(taskId);
        return svgFinalFiles[slideIndex - 1] ? path.resolve(svgFinalFiles[slideIndex - 1]) : undefined;
      });
    if (!resolvedSvg) return undefined;
    if (!isPathInsideDirectory(resolvedSvg, resolvedTaskDir)) {
      throw new Error("Invalid preview image path.");
    }
    await stat(resolvedSvg);
    return { filePath: resolvedSvg, contentType: "image/svg+xml; charset=utf-8" };
  }
  await stat(resolvedFile);
  return { filePath: resolvedFile, contentType: "image/png" };
}

function truncatePreviewText(value: string | undefined, maxLength: number) {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

export function buildAcademicPptSlidesPreview(outline: AcademicPptOutline, settings?: AcademicPptSettings): AcademicPptSlidePreview[] {
  const normalizedSettings = settings ? normalizeAcademicPptSettings(settings) : undefined;
  const template = normalizedSettings ? getAcademicPptTemplateForSettings(normalizedSettings) : undefined;
  return outline.slides.slice(0, MAX_PREVIEW_SLIDES).map((slide, index) => ({
    id: `generated-${index + 1}`,
    index: index + 1,
    title: truncatePreviewText(slide.title, 96) || `Slide ${index + 1}`,
    subtitle: slide.subtitle ? truncatePreviewText(slide.subtitle, 120) : undefined,
    layout: slide.layout,
    visualType: slide.visualType,
    templateIntent: slide.templateIntent ? truncatePreviewText(slide.templateIntent, 160) : undefined,
    templateId: template?.id,
    bullets: slide.bullets
      .slice(0, MAX_PREVIEW_BULLETS)
      .map((bullet) => truncatePreviewText(bullet, 150))
      .filter(Boolean),
    visualHint: slide.visualHint ? truncatePreviewText(slide.visualHint, 180) : undefined,
    emphasis: slide.emphasis ? truncatePreviewText(slide.emphasis, 140) : undefined,
    iconDecorations:
      normalizedSettings?.enableIconDecoration && template
        ? planAcademicPptIconDecorations({ slide, slideIndex: index + 1, templateId: template.id }).map(
            (decoration): AcademicPptIconDecoration => ({
              kind: decoration.kind,
              label: decoration.label,
              tone: decoration.tone
            })
          )
        : undefined,
    status: "ready"
  }));
}

export function buildAcademicPptPreviewManifestForSnapshot(record: AcademicPptTaskRecord): AcademicPptPreviewManifest | undefined {
  if (!record.previewType) return undefined;
  const slides: AcademicPptNativePreviewSlide[] =
    record.previewAssetsReady && (record.previewType === "image" || record.previewType === "svg") && record.previewAvailable
      ? Array.from({ length: record.previewSlideCount || 0 }, (_, index) => ({
          index,
          pageNumber: index + 1,
          url: previewAssetUrl(record.taskId, index + 1),
          imageUrl: previewAssetUrl(record.taskId, index + 1),
          assetPath: previewAssetPath(index + 1, record.previewType || "image"),
          source:
            record.previewAvailable && record.previewType === "svg"
              ? "svg_final"
              : record.previewAvailable && (record.previewType === "image" || record.previewType === "pdf")
                ? "native_preview"
                : "structured_placeholder",
          storageProvider: "local"
        }))
      : [];
  return {
    available: Boolean(record.previewAssetsReady && record.previewAvailable),
    type: record.previewType,
    source:
      record.previewAvailable && record.previewType === "svg"
        ? "svg_final"
        : record.previewAvailable && (record.previewType === "image" || record.previewType === "pdf")
          ? "native_preview"
          : "structured_placeholder",
    slideCount: record.previewSlideCount || record.slideCount || record.slidesPreview?.length || 0,
    previewCount: slides.length,
    slides,
    taskId: record.taskId,
    status:
      record.previewAssetsReady && record.previewAvailable
        ? "ready"
        : record.status === "queued" || record.status === "pending" || record.status === "running"
          ? "pending"
          : "unavailable",
    pptxUrl: record.pptxUrl || `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(record.taskId)}/download`,
    previewManifestUrl: record.previewManifestUrl || `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(record.taskId)}/preview`,
    previewStoragePrefix: record.previewStoragePrefix || `academic-ppt/tasks/${record.taskId}/previews`,
    storageProvider: record.outputStorageProvider || "local",
    fallbackReason: record.previewFallbackReason,
    createdAt: record.previewUpdatedAt || record.updatedAt,
    updatedAt: record.previewUpdatedAt || record.updatedAt,
    generatedAt: record.previewUpdatedAt || record.updatedAt
  };
}

export async function readAcademicPptLogs(taskId: string, limit = 100) {
  const raw = await readFile(getTaskLogsPath(taskId), "utf8");
  const logs = JSON.parse(raw) as AcademicPptTaskLog[];
  return logs.slice(-Math.min(Math.max(limit, 1), 100));
}

export async function writeAcademicPptUploadedFile(taskId: string, file: File) {
  const safeName = sanitizeAcademicPptFileName(file.name);
  const uploadDir = getAcademicPptUploadDir(taskId);
  await mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, safeName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, bytes);
  return { safeName, filePath, size: bytes.byteLength };
}

export async function getAcademicPptDownloadInfo(taskId: string) {
  const record = await readAcademicPptTaskRecord(taskId);
  if (record.status !== "success") {
    return { status: record.status as AcademicPptTaskStatus, filePath: undefined };
  }
  if (!record.outputFilePath) {
    return { status: record.status as AcademicPptTaskStatus, filePath: undefined };
  }
  const resolvedOutput = path.resolve(record.outputFilePath);
  const resolvedTaskDir = path.resolve(getAcademicPptTaskDir(taskId));
  if (!isPathInsideDirectory(resolvedOutput, resolvedTaskDir)) {
    throw new Error("下载路径无效。");
  }
  await stat(resolvedOutput);
  return { status: record.status as AcademicPptTaskStatus, filePath: resolvedOutput };
}

export function toAcademicPptSnapshot(record: AcademicPptTaskRecord) {
  return {
    taskId: record.taskId,
    status: record.status,
    progress: record.progress,
    currentStep: record.currentStep,
    error: record.error,
    outputStorageProvider: record.outputStorageProvider,
    pptxUrl: record.pptxUrl,
    previewManifestUrl: record.previewManifestUrl,
    previewStoragePrefix: record.previewStoragePrefix,
    previewAssetsReady: record.previewAssetsReady,
    resumable: record.resumable,
    resumeFromStep: record.resumeFromStep,
    lastCompletedStep: record.lastCompletedStep,
    retryCount: record.retryCount,
    maxRetries: record.maxRetries,
    timeoutAt: record.timeoutAt,
    modelSource: record.modelSource,
    modelName: record.modelName,
    fallbackReason: record.fallbackReason,
    generationMode: record.generationMode,
    visualPipelineStatus: record.visualPipelineStatus,
    generatorSource: record.generatorSource,
    requestSnapshot: record.requestSnapshot,
    modelBridgeStatus: record.modelBridgeStatus,
    modelBridgePrimaryModel: record.modelBridgePrimaryModel,
    modelBridgePrimaryStatus: record.modelBridgePrimaryStatus,
    modelBridgeFallbackModel: record.modelBridgeFallbackModel,
    modelBridgeFallbackStatus: record.modelBridgeFallbackStatus,
    modelBridgeErrorSummary: record.modelBridgeErrorSummary,
    modelBridgeUrlSource: record.modelBridgeUrlSource,
    slideCount: record.slideCount,
    outputFileSize: record.outputFileSize,
    templateId: record.templateId,
    templateName: record.templateName,
    templateStyle: record.templateStyle,
    sourceFileType: record.sourceFileType,
    extractedTextLength: record.extractedTextLength,
    outlineTitle: record.outlineTitle,
    completedAt: record.completedAt,
    startedAt: record.startedAt,
    failedAt: record.failedAt,
    cancelledAt: record.cancelledAt,
    qualityScore: record.qualityScore,
    qualityLevel: record.qualityLevel,
    qualityIssuesCount: record.qualityIssuesCount,
    repairRounds: record.repairRounds,
    slidesPreview: record.slidesPreview,
    previewUpdatedAt: record.previewUpdatedAt,
    nativePreview: buildAcademicPptPreviewManifestForSnapshot(record),
    previewAvailable: record.previewAvailable,
    previewType: record.previewType,
    previewSlideCount: record.previewSlideCount,
    previewFallbackReason: record.previewFallbackReason,
    visualQaScore: record.visualQaScore,
    visualQaLevel: record.visualQaLevel,
    visualQaIssuesCount: record.visualQaIssuesCount,
    visualQaEnabled: record.visualQaEnabled,
    visualQaSummary: record.visualQaSummary,
    visualQaPreviewType: record.visualQaPreviewType,
    iconDecorationEnabled: record.iconDecorationEnabled,
    researchEnabled: record.researchEnabled,
    externalResearchEnabled: record.externalResearchEnabled,
    deepResearchEnabled: record.deepResearchEnabled,
    webSearchEnabled: record.webSearchEnabled,
    searchEnabled: record.searchEnabled,
    searchProvider: record.searchProvider,
    searchStatus: record.searchStatus,
    researchStatus: record.researchStatus,
    researchSourcesCount: record.researchSourcesCount,
    researchFallbackReason: record.researchFallbackReason,
    researchBriefUpdatedAt: record.researchBriefUpdatedAt,
    modelCriticEnabled: record.modelCriticEnabled,
    modelCriticStatus: record.modelCriticStatus,
    modelCriticScore: record.modelCriticScore,
    modelCriticLevel: record.modelCriticLevel,
    modelCriticIssuesCount: record.modelCriticIssuesCount,
    modelCriticRounds: record.modelCriticRounds,
    modelCriticFallbackReason: record.modelCriticFallbackReason,
    autoRepairFallbackReason: record.autoRepairFallbackReason,
    autoRepairRounds: record.autoRepairRounds,
    autoRepairApplied: record.autoRepairApplied,
    finalQualityScore: record.finalQualityScore,
    finalVisualQaScore: record.finalVisualQaScore,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    downloadUrl:
      record.status === "success"
        ? record.pptxUrl || `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(record.taskId)}/download`
        : undefined
  };
}

export async function markAcademicPptFailed(taskId: string, message: string) {
  const record = await readAcademicPptTaskRecord(taskId).catch(() => null);
  await updateAcademicPptTaskRecord(taskId, {
    status: "failed",
    progress: 100,
    currentStep: "failed",
    error: message,
    resumable: Boolean(record?.lastCompletedStep),
    failedAt: new Date().toISOString()
  });
  await appendAcademicPptLog(taskId, "error", message);
}

export async function requestAcademicPptTaskCancellation(taskId: string) {
  const record = await readAcademicPptTaskRecord(taskId);
  if (record.status === "success" || record.status === "failed" || record.status === "cancelled") {
    return record;
  }
  const { requestAcademicPptToolsEngineCancellation } = await import("@/lib/smart-tools/academic-ppt/tools-engine-client");
  await requestAcademicPptToolsEngineCancellation(taskId).catch(() => undefined);
  const isQueued = record.status === "queued" || record.status === "pending";
  const next = await updateAcademicPptTaskRecord(taskId, {
    status: "cancelled",
    progress: isQueued ? 100 : record.progress,
    currentStep: "cancelled",
    cancelRequested: true,
    resumable: false,
    error: "用户请求取消任务。",
    cancelledAt: new Date().toISOString()
  });
  await appendAcademicPptLog(taskId, "warn", "用户请求取消任务。");
  return next;
}

export async function assertAcademicPptTaskNotCancelled(taskId: string) {
  const record = await readAcademicPptTaskRecord(taskId);
  if (record.cancelRequested || record.status === "cancelled") {
    throw new Error("任务已取消。");
  }
}

export async function updateAcademicPptStep(
  taskId: string,
  currentStep: AcademicPptTaskStep,
  progress: number,
  message: string,
  lastCompletedStep?: AcademicPptTaskStep
) {
  await assertAcademicPptTaskNotCancelled(taskId);
  await updateAcademicPptTaskRecord(taskId, {
    status: currentStep === "completed" ? "success" : "running",
    currentStep,
    progress,
    ...(lastCompletedStep ? { lastCompletedStep } : {}),
    ...(currentStep === "completed" ? { completedAt: new Date().toISOString(), resumable: false } : {})
  });
  await appendAcademicPptLog(taskId, "info", message);
}
