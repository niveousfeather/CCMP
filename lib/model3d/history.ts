import type { Model3DGeneration } from "@prisma/client";

import type { Model3DOperationRecord, Model3DTask } from "@/components/model3d/model3d-data";
import { prisma } from "@/lib/db";
import type { NexusModel3DTaskResult } from "@/lib/model3d/results";
import * as storage from "@/lib/storage";

const MAX_MODEL_DOWNLOAD_BYTES = 300 * 1024 * 1024;
const MAX_IMAGE_DOWNLOAD_BYTES = 30 * 1024 * 1024;

export type Model3DHistoryInputImage = {
  label?: string;
  name: string;
  objectKey?: string | null;
  url: string;
};

export type CreateModel3DHistoryInput = {
  clientTaskId?: string | null;
  feature: string;
  inputImages?: Model3DHistoryInputImage[];
  localTaskId?: string | null;
  mode?: string;
  model?: string;
  providerMeta?: unknown;
  providerTaskId?: string | null;
  prompt?: string;
  quality?: string;
  rawStatus?: string | null;
  request?: Record<string, unknown>;
  status?: string;
  title?: string;
  userId: string;
};

function getTitle(text: string, fallback = "Nexus 3D Preview") {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 24 ? `${compact.slice(0, 24)}...` : compact || fallback;
}

function getDatePath() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function safeJson(value: unknown) {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function getExtensionFromUrl(url: string, fallback: string) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]{2,8})$/);
    return match?.[1]?.toLowerCase() || fallback;
  } catch {
    return fallback;
  }
}

function getModelContentType(extension: string, fallback?: string | null) {
  if (fallback && fallback !== "application/octet-stream") return fallback;
  if (extension === "glb") return "model/gltf-binary";
  if (extension === "gltf") return "model/gltf+json";
  if (extension === "obj") return "model/obj";
  if (extension === "fbx") return "application/octet-stream";
  if (extension === "stl") return "model/stl";
  return fallback || "application/octet-stream";
}

async function fetchRemoteAsset(url: string, maxBytes: number) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Remote asset fetch failed: ${response.status}`);

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxBytes) throw new Error("Remote asset is too large");

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) throw new Error("Remote asset is too large");

  return {
    buffer,
    contentType: response.headers.get("content-type") || null
  };
}

async function resolveStoredUrl(objectKey: string | null, url: string | null) {
  if (url && (url.startsWith("/mock-storage/") || url.startsWith("data:"))) return url;
  if (!objectKey) return url;
  try {
    return (await storage.getPublicOrSignedUrl(objectKey)) || url;
  } catch (error) {
    console.error(`[model3d:history] signed_url_failed key=${objectKey} error=${error instanceof Error ? error.message : "unknown"}`);
    return url;
  }
}

async function persistRemoteUrl({
  fallbackExtension,
  keyPrefix,
  maxBytes,
  url
}: {
  fallbackExtension: string;
  keyPrefix: string;
  maxBytes: number;
  url: string;
}) {
  const extension = getExtensionFromUrl(url, fallbackExtension);
  const remote = await fetchRemoteAsset(url, maxBytes);
  const contentType = fallbackExtension === "jpg" || fallbackExtension === "png" ? remote.contentType || "image/jpeg" : getModelContentType(extension, remote.contentType);
  const uploadResult = await storage.uploadBuffer({
    key: `${keyPrefix}.${extension}`,
    buffer: remote.buffer,
    contentType
  });
  const resolvedUrl = await storage.getPublicOrSignedUrl(uploadResult.key).catch(() => uploadResult.url);
  return {
    objectKey: uploadResult.key,
    url: resolvedUrl || uploadResult.url || url
  };
}

export async function createModel3DHistoryRecord(input: CreateModel3DHistoryInput) {
  const request = input.request || {};
  const texture = typeof request.texture === "object" && request.texture !== null ? (request.texture as Record<string, unknown>) : {};
  const pbr = typeof request.pbr === "object" && request.pbr !== null ? (request.pbr as Record<string, unknown>) : {};
  const taskId = input.providerTaskId || input.localTaskId || input.clientTaskId || `model3d-${Date.now()}`;
  const prompt = input.prompt?.trim() || "3D 模型任务";

  return prisma.model3DGeneration.upsert({
    where: { taskId },
    update: {
      providerTaskId: input.providerTaskId,
      providerMeta: safeJson(input.providerMeta),
      rawStatus: input.rawStatus || null,
      status: input.status || "pending"
    },
    create: {
      userId: input.userId,
      taskId,
      providerTaskId: input.providerTaskId || null,
      feature: input.feature,
      title: input.title || getTitle(prompt),
      prompt,
      mode: input.mode || "text-to-3d",
      model: input.model || "nexus-3d-preview",
      status: input.status || "pending",
      rawStatus: input.rawStatus || null,
      quality: input.quality || null,
      generationProfile: typeof request.modelProfile === "string" ? request.modelProfile : null,
      textureEnabled: texture.enabled !== false,
      textureQuality: typeof texture.quality === "string" ? texture.quality : null,
      pbrEnabled: pbr.enabled === true,
      generatePartsEnabled: request.generateParts === true,
      inputImageUrl: input.inputImages?.[0]?.url || null,
      inputImagesJson: safeJson(input.inputImages || []),
      providerMeta: safeJson(input.providerMeta),
      operationsJson: safeJson([
        {
          id: `operation-${Date.now()}`,
          kind: input.feature.includes("texture") ? "texture" : "model",
          title: input.feature === "generate-model" ? "模型生成" : input.feature,
          createdAt: new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
          nodeId: "scene-root"
        }
      ])
    }
  });
}

export async function persistModel3DTaskResult(providerTaskId: string, userId: string, result: NexusModel3DTaskResult, providerMeta: unknown) {
  const generation = await prisma.model3DGeneration.findFirst({
    where: { userId, OR: [{ providerTaskId }, { taskId: providerTaskId }] }
  });
  if (!generation) return null;

  let modelAsset: { objectKey: string; url: string } | null = null;
  let previewAsset: { objectKey: string; url: string } | null = null;
  let exportAsset: { objectKey: string; url: string } | null = null;
  const datePath = getDatePath();

  if (result.modelUrl && !generation.modelObjectKey) {
    try {
      modelAsset = await persistRemoteUrl({
        url: result.modelUrl,
        keyPrefix: `users/${userId}/model3d/${datePath}/${generation.id}`,
        fallbackExtension: "glb",
        maxBytes: MAX_MODEL_DOWNLOAD_BYTES
      });
    } catch (error) {
      console.error(`[model3d:history] model_persist_failed generationId=${generation.id} error=${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  if (result.previewImageUrl && !generation.previewImageObjectKey) {
    try {
      previewAsset = await persistRemoteUrl({
        url: result.previewImageUrl,
        keyPrefix: `users/${userId}/model3d-previews/${datePath}/${generation.id}`,
        fallbackExtension: "jpg",
        maxBytes: MAX_IMAGE_DOWNLOAD_BYTES
      });
    } catch (error) {
      console.error(`[model3d:history] preview_persist_failed generationId=${generation.id} error=${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  if (result.exportUrl && !generation.exportObjectKey) {
    try {
      exportAsset = await persistRemoteUrl({
        url: result.exportUrl,
        keyPrefix: `users/${userId}/model3d-exports/${datePath}/${generation.id}`,
        fallbackExtension: "glb",
        maxBytes: MAX_MODEL_DOWNLOAD_BYTES
      });
    } catch (error) {
      console.error(`[model3d:history] export_persist_failed generationId=${generation.id} error=${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  return prisma.model3DGeneration.update({
    where: { id: generation.id },
    data: {
      status: result.status,
      rawStatus: result.rawStatus || null,
      errorMessage: result.errorMessage || null,
      modelUrl: modelAsset?.url || generation.modelUrl || result.modelUrl || null,
      modelObjectKey: modelAsset?.objectKey || generation.modelObjectKey || null,
      previewImageUrl: previewAsset?.url || generation.previewImageUrl || result.previewImageUrl || null,
      previewImageObjectKey: previewAsset?.objectKey || generation.previewImageObjectKey || null,
      exportUrl: exportAsset?.url || generation.exportUrl || result.exportUrl || null,
      exportObjectKey: exportAsset?.objectKey || generation.exportObjectKey || null,
      providerMeta: safeJson(providerMeta)
    }
  });
}

export async function model3DGenerationToTask(generation: Model3DGeneration): Promise<Model3DTask> {
  const inputImages = parseJsonArray<Model3DHistoryInputImage>(generation.inputImagesJson);
  const operations = parseJsonArray<Model3DOperationRecord>(generation.operationsJson);
  const modelUrl = await resolveStoredUrl(generation.modelObjectKey, generation.modelUrl);
  const previewImageUrl = await resolveStoredUrl(generation.previewImageObjectKey, generation.previewImageUrl);
  const exportUrl = await resolveStoredUrl(generation.exportObjectKey, generation.exportUrl);
  const resolvedInputImages = await Promise.all(
    inputImages.map(async (image) => ({
      ...image,
      url: (await resolveStoredUrl(image.objectKey || null, image.url)) || image.url
    }))
  );

  return {
    id: generation.taskId,
    title: generation.title,
    prompt: generation.prompt,
    mode: generation.mode as Model3DTask["mode"],
    status: normalizeModel3DTaskStatus(generation.status),
    model: generation.model,
    generationProfile: (generation.generationProfile || undefined) as Model3DTask["generationProfile"],
    quality: (generation.quality || "standard") as Model3DTask["quality"],
    textureEnabled: generation.textureEnabled,
    textureQuality: (generation.textureQuality || "standard") as Model3DTask["textureQuality"],
    pbrEnabled: generation.pbrEnabled,
    generatePartsEnabled: generation.generatePartsEnabled,
    inputImageUrl: generation.inputImageUrl,
    inputImages: resolvedInputImages,
    exportUrl,
    modelUrl,
    previewModelUrl: `/api/model3d/preview/${encodeURIComponent(generation.taskId)}`,
    operations,
    provider: generation.provider === "local" ? "local" : "tripo",
    providerTaskId: generation.providerTaskId,
    rawStatus: generation.rawStatus,
    previewImageUrl,
    errorMessage: generation.errorMessage,
    createdAt: generation.createdAt.toISOString(),
    updatedAt: generation.updatedAt.toISOString()
  };
}

export function mapModel3DStatus(status: string) {
  if (status === "succeeded") return "已完成";
  if (status === "failed") return "生成失败";
  return "生成中";
}

function normalizeModel3DTaskStatus(status: string): Model3DTask["status"] {
  if (status === "idle" || status === "queued" || status === "pending" || status === "processing" || status === "retrying" || status === "succeeded" || status === "failed") {
    return status;
  }
  return status === "completed" || status === "success" ? "succeeded" : "pending";
}
