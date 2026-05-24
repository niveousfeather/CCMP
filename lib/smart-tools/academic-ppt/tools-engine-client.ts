import "server-only";

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  appendAcademicPptLog,
  ensureAcademicPptPptxDownloadable,
  getAcademicPptOutputDir,
  getAcademicPptTaskDir,
  readAcademicPptTaskRecord,
  updateAcademicPptTaskRecord,
  writeAcademicPptPreviewManifest
} from "@/lib/smart-tools/academic-ppt/server-task-store";
import { renderAcademicPptNativePreview } from "@/lib/smart-tools/academic-ppt/preview-renderer";
import { normalizeAcademicPptSettings } from "@/lib/smart-tools/academic-ppt/task-api";
import type {
  AcademicPptPreviewManifest,
  AcademicPptSelectedTemplateVariant,
  AcademicPptTemplateRoleMapping,
  AcademicPptTaskStep
} from "@/lib/smart-tools/academic-ppt/types";

const POST_TIMEOUT_MS = 25_000;
const STATUS_TIMEOUT_MS = 8_000;
const POLL_INTERVAL_MS = 3_000;
const STALE_HEARTBEAT_MS = 10 * 60 * 1000;
const MAX_RUNTIME_MS = 60 * 60 * 1000;

type ToolsEngineStatus = {
  taskId: string;
  status: "accepted" | "running" | "success" | "failed" | "cancelled" | string;
  progress?: number;
  currentStep?: string;
  message?: string;
  outputFileName?: string;
  outputFileSize?: number;
  slideCount?: number;
  error?: string;
  heartbeatAt?: string;
  generationMode?: "paper-ppt-agent" | "paper-ppt-agent-rule-fallback";
  visualPipelineStatus?: "not_started" | "success" | "degraded" | "failed";
  fallbackReason?: string;
  modelBridgeStatus?: "not_started" | "started" | "success" | "fallback_success" | "failed";
  modelBridgePrimaryModel?: string;
  modelBridgePrimaryStatus?: "not_started" | "started" | "success" | "failed" | "timeout" | "skipped";
  modelBridgeFallbackModel?: string;
  modelBridgeFallbackStatus?: "not_started" | "started" | "success" | "failed" | "timeout" | "skipped";
  modelBridgeErrorSummary?: string;
  searchStatus?: "disabled" | "enabled" | "success" | "degraded" | "failed" | "skipped";
  researchStatus?: "skipped" | "success" | "degraded" | "failed";
  researchSourcesCount?: number;
  researchFallbackReason?: string;
  previewAvailable?: boolean;
  previewType?: "image" | "svg" | "pdf" | "outline";
  previewSlideCount?: number;
  previewManifestPath?: string;
  previewFallbackReason?: string;
  previewUpdatedAt?: string;
  selectedVariants?: AcademicPptSelectedTemplateVariant[];
  roleMapping?: AcademicPptTemplateRoleMapping[];
};

type ToolsEngineLog = {
  seq?: number;
  level?: "info" | "warn" | "error";
  message?: string;
};

class ToolsEngineTaskFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolsEngineTaskFailedError";
  }
}

function sanitizeEngineMessage(value: unknown, fallback = "Generation service is unavailable. Please try again later.") {
  const raw = typeof value === "string" ? value : value instanceof Error ? value.message : fallback;
  const withoutHtml = /<\/?[a-z][\s\S]*>|<!doctype/i.test(raw)
    ? raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "provider returned HTML error body"
    : raw;
  return withoutHtml
    .replace(/[A-Za-z]:[\\/][^\s"'<>]+/g, "[local-path]")
    .replace(/\/(?:Users|home|var|tmp|mnt|opt|srv)\/[^\s"'<>]+/g, "[local-path]")
    .replace(/[A-Z0-9_]*(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*/gi, "[sensitive-config]")
    .replace(/\bAuthorization\b/gi, "[auth-header]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "[bearer-token]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`tools_engine_timeout:${ms}`)), ms);
  return { signal: controller.signal, dispose: () => clearTimeout(timer) };
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeOrigin(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    return trimTrailingSlash(new URL(trimmed).origin);
  } catch {
    return undefined;
  }
}

async function describeFinalPptxForManifest(taskId: string, pptxPath: string) {
  const buffer = await readFile(pptxPath);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const relativePath = path.relative(getAcademicPptTaskDir(taskId), pptxPath).replace(/\\/g, "/");
  return {
    finalPptxPath: relativePath.startsWith("..") ? path.basename(pptxPath) : relativePath,
    finalPptxSha256: sha256
  };
}

export function getAcademicPptToolsEngineBaseUrl() {
  const engineUrl = process.env.AI_TOOLS_ENGINE_URL?.trim();
  if (engineUrl) return `${trimTrailingSlash(engineUrl)}/tools/academic-ppt`;
  const legacyUrl = process.env.ACADEMIC_PPT_AGENT_URL?.trim();
  if (legacyUrl) return trimTrailingSlash(legacyUrl);
  return undefined;
}

export function resolveAcademicPptModelBridgeEndpoint(requestOrigin?: string | null) {
  const publicAppUrl = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (publicAppUrl) {
    return {
      url: `${publicAppUrl}/api/internal/academic-ppt/model`,
      source: "NEXT_PUBLIC_APP_URL" as const
    };
  }

  const origin = normalizeOrigin(requestOrigin);
  if (origin) {
    return {
      url: `${origin}/api/internal/academic-ppt/model`,
      source: "request-origin" as const
    };
  }

  const envAppUrl = normalizeOrigin(process.env.NEXUSAI_BASE_URL);
  if (envAppUrl) {
    return {
      url: `${envAppUrl}/api/internal/academic-ppt/model`,
      source: "env" as const
    };
  }

  return {
    url: "http://127.0.0.1:3000/api/internal/academic-ppt/model",
    source: "default" as const
  };
}

async function fetchJson<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const timeout = withTimeout(timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: timeout.signal });
    const bodyText = await response.text();
    const data = bodyText ? JSON.parse(bodyText) : undefined;
    if (!response.ok) {
      const message = data?.detail || data?.message || bodyText || `HTTP ${response.status}`;
      throw new Error(sanitizeEngineMessage(message));
    }
    return data as T;
  } finally {
    timeout.dispose();
  }
}

function mapEngineStep(step: string | undefined): AcademicPptTaskStep {
  const value = (step || "").toLowerCase();
  if (value.includes("parsing")) return "parsing_source";
  if (value.includes("research")) return "research_enhancement";
  if (value.includes("strategy")) return "planning_outline";
  if (value.includes("generation")) return "generating_slides";
  if (value.includes("postprocess")) return "repairing_slides";
  if (value.includes("export")) return "exporting_pptx";
  if (value.includes("complete")) return "completed";
  if (value.includes("cancel")) return "cancelled";
  if (value.includes("fail") || value.includes("error")) return "failed";
  return "generating_slides";
}

function toProgress(value: unknown, fallback: number) {
  const progress = Number(value);
  if (!Number.isFinite(progress)) return fallback;
  return Math.min(Math.max(Math.round(progress), 5), 99);
}

function preferMeaningful<T extends string>(current: T | undefined, incoming: T | undefined, emptyValues: T[] = []): T | undefined {
  if (current && !emptyValues.includes(current)) return current;
  return incoming || current;
}

function preferIncomingMeaningful<T extends string>(current: T | undefined, incoming: T | undefined, emptyValues: T[] = []): T | undefined {
  if (incoming && !emptyValues.includes(incoming)) return incoming;
  return current;
}

async function syncEngineLogs(taskId: string, baseUrl: string, seenSeq: Set<number>) {
  let payload: { logs?: ToolsEngineLog[] };
  try {
    payload = await fetchJson<{ logs?: ToolsEngineLog[] }>(
      `${baseUrl}/tasks/${encodeURIComponent(taskId)}/logs`,
      { method: "GET" },
      STATUS_TIMEOUT_MS
    );
  } catch {
    return;
  }
  for (const log of payload.logs || []) {
    const seq = Number(log.seq || 0);
    if (seq && seenSeq.has(seq)) continue;
    if (seq) seenSeq.add(seq);
    const level = log.level === "warn" || log.level === "error" ? log.level : "info";
    const message = sanitizeEngineMessage(log.message || "");
    if (message) await appendAcademicPptLog(taskId, level, message);
  }
}

async function markStructuredPreviewUnavailable(taskId: string, slideCount: number | undefined, pptxPath: string) {
  const finalPptx = await describeFinalPptxForManifest(taskId, pptxPath);
  const manifest: AcademicPptPreviewManifest = {
    available: false,
    type: "outline",
    source: "structured_placeholder",
    slideCount: slideCount || 0,
    previewCount: 0,
    slides: [],
    fallbackReason: "Image preview is unavailable. Structured preview is shown instead.",
    finalPptxPath: finalPptx.finalPptxPath,
    finalPptxSha256: finalPptx.finalPptxSha256,
    previewOutdated: false,
    generatedAt: new Date().toISOString()
  };
  const manifestPath = await writeAcademicPptPreviewManifest(taskId, manifest);
  await updateAcademicPptTaskRecord(taskId, {
    previewAvailable: false,
    previewType: "outline",
    previewSlideCount: manifest.slideCount,
    previewFallbackReason: manifest.fallbackReason,
    previewManifestPath: manifestPath,
    previewUpdatedAt: manifest.generatedAt,
    outputStorageProvider: "local",
    previewManifestUrl: `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/preview`,
    previewStoragePrefix: `academic-ppt/tasks/${taskId}/previews`,
    previewAssetsReady: true
  });
}

async function tryRenderNativePreview(taskId: string, pptxPath: string, expectedSlideCount: number | undefined) {
  try {
    const preview = await renderAcademicPptNativePreview({
      taskId,
      pptxPath,
      expectedSlideCount: expectedSlideCount || 0,
      onLog: async (level, message) => appendAcademicPptLog(taskId, level, message)
    });
    if (preview.manifest.available && preview.manifest.source === "native_preview") {
      return preview;
    }
  } catch (error) {
    await appendAcademicPptLog(taskId, "warn", `PPTX preview unavailable: ${sanitizeEngineMessage(error)}`);
  }
  return undefined;
}

async function completeFromEngineStatus(taskId: string, status: ToolsEngineStatus) {
  if (!status.outputFileName) {
    throw new Error("Generation service did not return a PPTX output.");
  }
  const current = await readAcademicPptTaskRecord(taskId);
  const isBasicFallback =
    status.generationMode === "paper-ppt-agent-rule-fallback" ||
    /basic parsed-text deck|basic deck|rule fallback|generated from parsed text/i.test(status.fallbackReason || "");
  const isVisualDegraded =
    status.visualPipelineStatus === "degraded" ||
    /visual composition quality gate|svg executor output|strategy design spec|research manuscript|visual pipeline/i.test(
      status.fallbackReason || ""
    );
  const fallbackReason = isBasicFallback
    ? status.fallbackReason || "Model bridge unavailable; generated basic parsed-text deck."
    : status.fallbackReason;
  const modelBridgeStatus = isBasicFallback
    ? status.modelBridgeStatus || "failed"
    : preferIncomingMeaningful(current.modelBridgeStatus, status.modelBridgeStatus, ["not_started"]);
  const primaryStatus = preferIncomingMeaningful(current.modelBridgePrimaryStatus, status.modelBridgePrimaryStatus, ["not_started"]);
  const fallbackStatus = preferIncomingMeaningful(current.modelBridgeFallbackStatus, status.modelBridgeFallbackStatus, ["not_started"]);
  const outputFilePath = path.join(getAcademicPptOutputDir(taskId), status.outputFileName);
  await ensureAcademicPptPptxDownloadable(outputFilePath);
  const outputStat = await stat(outputFilePath);
  const nativePreviewResult = await tryRenderNativePreview(taskId, outputFilePath, status.slideCount);
  const finalPreviewAvailable = Boolean(nativePreviewResult?.manifest.available);
  const finalPreviewType = nativePreviewResult?.manifest.type;
  const finalPreviewSlideCount = nativePreviewResult?.manifest.slideCount;
  const finalPreviewManifestPath = nativePreviewResult?.manifestPath;
  const finalPreviewFallbackReason = nativePreviewResult?.manifest.fallbackReason;
  const finalPreviewUpdatedAt = nativePreviewResult?.manifest.generatedAt;
  if (isBasicFallback) {
    await updateAcademicPptTaskRecord(taskId, {
      status: "failed",
      progress: 100,
      currentStep: "failed",
      currentStage: "failed",
      failedStage: "generating_slides",
      errorSummary: fallbackReason || "Visual pipeline degraded; full paper-ppt-agent result was not produced.",
      modelSource: "local-fallback",
      generatorSource: "tools-engine",
      modelName: "Generation service",
      fallbackReason,
      generationMode: status.generationMode || "paper-ppt-agent-rule-fallback",
      visualPipelineStatus: status.visualPipelineStatus || "degraded",
      modelBridgeStatus,
      modelBridgePrimaryModel: status.modelBridgePrimaryModel || current.modelBridgePrimaryModel,
      modelBridgePrimaryStatus: primaryStatus,
      modelBridgeFallbackModel: status.modelBridgeFallbackModel || current.modelBridgeFallbackModel,
      modelBridgeFallbackStatus: fallbackStatus,
      modelBridgeErrorSummary: status.modelBridgeErrorSummary || current.modelBridgeErrorSummary || fallbackReason,
      searchStatus: status.searchStatus,
      researchStatus: status.researchStatus,
      researchSourcesCount: status.researchSourcesCount,
      researchFallbackReason: status.researchFallbackReason,
      outputFilePath,
      outputFileSize: outputStat.size,
      slideCount: status.slideCount || undefined,
      resumeFromStep: current.resumeFromStep || "generating_slides",
      resumable: true,
      lastCompletedStep: current.lastCompletedStep || "upload_received",
      lastSuccessfulStage: current.lastSuccessfulStage || current.lastCompletedStep || "upload_received",
      error: fallbackReason || "Visual pipeline degraded; full paper-ppt-agent result was not produced.",
      failedAt: new Date().toISOString()
    });
    await appendAcademicPptLog(
      taskId,
      "error",
      "?????? paper-ppt-agent ?????????????/??????????????"
    );
    throw new ToolsEngineTaskFailedError(fallbackReason || "Visual pipeline degraded.");
  }
  if (isVisualDegraded) {
    await appendAcademicPptLog(
      taskId,
      "warn",
      `Visual pipeline completed with warnings; keeping validated final PPTX. ${fallbackReason || "Visual pipeline quality checks did not fully pass."}`
    );
  }
  await updateAcademicPptTaskRecord(taskId, {
    status: "success",
    progress: 100,
    currentStep: "completed",
    currentStage: "completed",
    failedStage: undefined,
    errorSummary: undefined,
    errorDetails: undefined,
    error: undefined,
    modelSource: "paper-ppt-agent",
    generatorSource: "tools-engine",
    modelName: "Generation service",
    fallbackReason,
    generationMode: status.generationMode || "paper-ppt-agent",
    visualPipelineStatus: status.visualPipelineStatus || "success",
    modelBridgeStatus,
    modelBridgePrimaryModel: status.modelBridgePrimaryModel || current.modelBridgePrimaryModel,
    modelBridgePrimaryStatus: primaryStatus,
    modelBridgeFallbackModel: status.modelBridgeFallbackModel || current.modelBridgeFallbackModel,
    modelBridgeFallbackStatus: fallbackStatus,
    modelBridgeErrorSummary: status.modelBridgeErrorSummary || current.modelBridgeErrorSummary,
    searchStatus: status.searchStatus,
    researchStatus: status.researchStatus,
    researchSourcesCount: status.researchSourcesCount,
    researchFallbackReason: status.researchFallbackReason,
    previewAvailable: finalPreviewAvailable ? true : undefined,
    previewType: finalPreviewType,
    previewSlideCount: finalPreviewSlideCount,
    previewManifestPath: finalPreviewManifestPath,
    previewFallbackReason: finalPreviewFallbackReason,
    previewUpdatedAt: finalPreviewUpdatedAt,
    selectedVariants: status.selectedVariants,
    roleMapping: status.roleMapping,
    outputFilePath,
    outputFileSize: outputStat.size,
    outputStorageProvider: "local",
    pptxUrl: `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/download`,
    previewManifestUrl: `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/preview`,
    previewStoragePrefix: `academic-ppt/tasks/${taskId}/previews`,
    previewAssetsReady: Boolean(finalPreviewManifestPath),
    slideCount: status.slideCount || undefined,
    lastCompletedStep: "completed",
    lastSuccessfulStage: "completed",
    resumeFromStep: undefined,
    resumable: false,
    completedAt: new Date().toISOString()
  });
  if (!finalPreviewAvailable) {
    await markStructuredPreviewUnavailable(taskId, status.slideCount, outputFilePath);
  }
  await appendAcademicPptLog(taskId, "info", `PPTX generated. File size: ${Math.round(outputStat.size / 1024)} KB.`);
}

async function cancelEngineTask(baseUrl: string, taskId: string) {
  try {
    await fetchJson<ToolsEngineStatus>(
      `${baseUrl}/tasks/${encodeURIComponent(taskId)}/cancel`,
      { method: "POST" },
      STATUS_TIMEOUT_MS
    );
  } catch {
    // Cancellation is best-effort. The local task record is already marked.
  }
}

export async function requestAcademicPptToolsEngineCancellation(taskId: string) {
  const baseUrl = getAcademicPptToolsEngineBaseUrl();
  if (!baseUrl) return;
  await cancelEngineTask(baseUrl, taskId);
}

export async function runAcademicPptToolsEngineTask(taskId: string, options?: { resume?: boolean; requestOrigin?: string | null }) {
  const baseUrl = getAcademicPptToolsEngineBaseUrl();
  if (!baseUrl) return false;

  const record = await readAcademicPptTaskRecord(taskId);
  const settings = record.settings ? normalizeAcademicPptSettings(record.settings) : undefined;
  if (!settings) throw new Error("Task generation settings are missing.");
  const modelBridge = resolveAcademicPptModelBridgeEndpoint(options?.requestOrigin);

  await appendAcademicPptLog(taskId, "info", `Model bridge URL resolved from ${modelBridge.source}.`);
  await appendAcademicPptLog(taskId, "info", "Connecting generation service.");
  await updateAcademicPptTaskRecord(taskId, {
      status: "running",
      currentStep: "generating_slides",
      currentStage: "generating_slides",
      progress: Math.max(record.progress || 8, 8),
      failedStage: undefined,
      errorSummary: undefined,
      errorDetails: undefined,
      error: undefined,
    modelSource: "paper-ppt-agent",
    generatorSource: "tools-engine",
    modelName: "Generation service",
    generationMode: "paper-ppt-agent",
    visualPipelineStatus: "not_started",
    modelBridgeStatus: "not_started",
    modelBridgePrimaryModel: "subrouter:gpt-5.4",
    modelBridgePrimaryStatus: "not_started",
    modelBridgeFallbackModel: "moonshot:kimi-k2.5",
    modelBridgeFallbackStatus: "not_started",
    modelBridgeErrorSummary: undefined,
    modelBridgeUrlSource: modelBridge.source,
    deepResearchEnabled: settings.enableDeepResearch,
    externalResearchEnabled: settings.enableExternalResearch,
    webSearchEnabled: settings.webSearchEnabled ?? settings.enableExternalResearch,
    searchEnabled: settings.webSearchEnabled ?? settings.enableExternalResearch,
    searchProvider: "nexus-searxng",
    searchStatus: (settings.webSearchEnabled ?? settings.enableExternalResearch) ? "enabled" : "disabled",
    researchStatus:
      settings.enableDeepResearch || settings.enableExternalResearch || (settings.webSearchEnabled ?? false)
        ? "skipped"
        : "skipped",
    timeoutAt: new Date(Date.now() + MAX_RUNTIME_MS).toISOString()
  });

  await fetchJson<ToolsEngineStatus>(
    `${baseUrl}/tasks`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId,
        taskDir: getAcademicPptTaskDir(taskId),
        inputFilePath: record.inputFilePath,
        settings,
        slideCount: settings.targetSlides,
        templateId: record.templateId,
        language: settings.outputLanguage,
        deepResearchEnabled: settings.enableDeepResearch,
        externalResearchEnabled: settings.enableExternalResearch,
        webSearchEnabled: settings.webSearchEnabled ?? settings.enableExternalResearch,
        visualQaEnabled: settings.enableVisualQa,
        iconDecorationEnabled: settings.enableIconDecoration,
        searchProvider: "nexus-searxng",
        generatorPreference: "paper-ppt-agent",
        resume: Boolean(options?.resume || record.resumeFromStep),
        resumeFromStep: record.resumeFromStep || null,
        modelBridgeUrl: modelBridge.url
      })
    },
    POST_TIMEOUT_MS
  );
  await appendAcademicPptLog(taskId, "info", "Generation service accepted the task.");

  const startedAt = Date.now();
  const seenLogSeq = new Set<number>();
  let lastHeartbeat = Date.now();
  let lastStatus: ToolsEngineStatus | undefined;

  while (Date.now() - startedAt < MAX_RUNTIME_MS) {
    const current = await readAcademicPptTaskRecord(taskId);
    if (current.status === "cancelled" || current.cancelRequested) {
      await cancelEngineTask(baseUrl, taskId);
      return true;
    }

    try {
      const status = await fetchJson<ToolsEngineStatus>(
        `${baseUrl}/tasks/${encodeURIComponent(taskId)}`,
        { method: "GET" },
        STATUS_TIMEOUT_MS
      );
      lastStatus = status;
      await syncEngineLogs(taskId, baseUrl, seenLogSeq);
      if (status.heartbeatAt && !Number.isNaN(Date.parse(status.heartbeatAt))) {
        lastHeartbeat = Date.parse(status.heartbeatAt);
      } else {
        lastHeartbeat = Date.now();
      }

      if (status.status === "success") {
        await completeFromEngineStatus(taskId, status);
        return true;
      }
      if (status.status === "failed") {
        throw new ToolsEngineTaskFailedError(sanitizeEngineMessage(status.error || status.message || "Generation service failed."));
      }
      if (status.status === "cancelled") {
        await updateAcademicPptTaskRecord(taskId, {
        status: "cancelled",
        currentStep: "cancelled",
        currentStage: "cancelled",
        progress: 100,
          cancelRequested: true,
          resumable: false,
          cancelledAt: new Date().toISOString()
        });
        await appendAcademicPptLog(taskId, "warn", "Generation task cancelled.");
        return true;
      }

      await updateAcademicPptTaskRecord(taskId, {
        status: "running",
        currentStep: mapEngineStep(status.currentStep),
        currentStage: mapEngineStep(status.currentStep),
        progress: toProgress(status.progress, current.progress || 10),
        lastCompletedStep: current.lastCompletedStep || "upload_received",
        resumeFromStep: mapEngineStep(status.currentStep),
        resumable: true,
        generationMode: status.generationMode || current.generationMode,
        visualPipelineStatus: status.visualPipelineStatus || current.visualPipelineStatus,
        modelBridgeStatus: status.modelBridgeStatus || current.modelBridgeStatus,
        modelBridgePrimaryModel: status.modelBridgePrimaryModel || current.modelBridgePrimaryModel,
        modelBridgePrimaryStatus: status.modelBridgePrimaryStatus || current.modelBridgePrimaryStatus,
        modelBridgeFallbackModel: status.modelBridgeFallbackModel || current.modelBridgeFallbackModel,
        modelBridgeFallbackStatus: status.modelBridgeFallbackStatus || current.modelBridgeFallbackStatus,
        modelBridgeErrorSummary: status.modelBridgeErrorSummary || current.modelBridgeErrorSummary,
        searchStatus: status.searchStatus || current.searchStatus,
        researchStatus: status.researchStatus || current.researchStatus,
        researchSourcesCount: status.researchSourcesCount ?? current.researchSourcesCount,
        researchFallbackReason: status.researchFallbackReason || current.researchFallbackReason,
        previewAvailable: status.previewAvailable ?? current.previewAvailable,
        previewType: status.previewType || current.previewType,
        previewSlideCount: status.previewSlideCount ?? current.previewSlideCount,
        previewManifestPath: status.previewManifestPath || current.previewManifestPath,
        previewFallbackReason: status.previewFallbackReason || current.previewFallbackReason,
        previewUpdatedAt: status.previewUpdatedAt || current.previewUpdatedAt,
        selectedVariants: status.selectedVariants || current.selectedVariants,
        roleMapping: status.roleMapping || current.roleMapping,
        timeoutAt: new Date(Date.now() + STALE_HEARTBEAT_MS).toISOString()
      });
    } catch (error) {
      if (error instanceof ToolsEngineTaskFailedError) {
        throw error;
      }
      const message = sanitizeEngineMessage(error);
      await appendAcademicPptLog(taskId, "warn", `Generation service status unavailable: ${message}`);
      if (Date.now() - lastHeartbeat > STALE_HEARTBEAT_MS) {
        throw new Error("Generation service heartbeat is stale. The task can be resumed later.");
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    lastStatus?.message
      ? `Generation exceeded max runtime: ${sanitizeEngineMessage(lastStatus.message)}`
      : "Generation exceeded max runtime."
  );
}
