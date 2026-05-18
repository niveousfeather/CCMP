import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeErrorLog } from "@/lib/error-log";
import { enqueueGenerationExecution } from "@/lib/generation/concurrency";
import {
  createRetryableGenerationErrorFromStatus,
  getGenerationRetryDelayMs,
  getGenerationRetryNotice,
  isRetryableGenerationError,
  shouldRetryGenerationError
} from "@/lib/generation/retry";
import { checkAndConsumeQuota } from "@/lib/quota";
import * as storage from "@/lib/storage";
import { createMockStorage } from "@/lib/storage/local";
import { getImageModelCapability } from "@/lib/image/config";
import { generateJimengImage21 } from "@/lib/image/jimeng";
import { generateSubrouterImage2, hasImage2ApiKeys } from "@/lib/image/subrouter";

type NormalizedImage = {
  url: string | null;
  b64_json: string | null;
  revised_prompt: string | null;
  model: string;
};

type StoredImage = {
  index: number;
  key: string | null;
  url: string;
  storageWarning: string | null;
};

type ImageProviderCall = {
  generationId: string;
  apiKey: string;
  model: string;
  prompt: string;
  aspectRatio: string;
  size: string;
  imageSize: string;
  count: number;
  image: File | null;
  signal: AbortSignal;
  onProviderRequestStart?: () => void;
};

type BufferedImageFile = {
  name: string;
  type: string;
  size: number;
  buffer: Buffer;
} | null;

const IMAGE_TASK_TIMEOUT_MS = 300_000;
const XHEAI_IMAGE_POLL_INTERVAL_MS = 3_000;
const XHEAI_IMAGE_POLL_TIMEOUT_MS = 180_000;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const allowedModels = new Set(["gpt-image-2", "gpt-image-2-all", "gemini-3-pro-image-preview", "jimeng-image-2.1"]);
const allowedExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function getXheaiRootUrl() {
  return (process.env.XHEAI_BASE_URL || "https://api.xheai.cc").replace(/\/v1\/?$/, "");
}

function joinOpenAiUrl(path: string) {
  return joinUrl(getXheaiRootUrl(), `/v1/${path.replace(/^\//, "")}`);
}

function getOpenAiImageTaskUrl(taskId: string) {
  return joinOpenAiUrl(`/images/generations/${encodeURIComponent(taskId)}`);
}

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function isAllowedImage(file: File) {
  const extension = getExtension(file.name);
  return allowedExtensions.has(extension) && (!file.type || allowedMimeTypes.has(file.type));
}

function normalizePrompt(prompt: string, style: string) {
  const cleanPrompt = prompt.trim();
  const cleanStyle = style.trim();
  if (!cleanStyle || cleanStyle === "默认" || cleanStyle.toLowerCase() === "default") return cleanPrompt;
  return `${cleanPrompt}\n\n风格要求：${cleanStyle}`;
}

function getDatePath() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function getDataUrl(image: NormalizedImage) {
  return image.b64_json ? `data:image/png;base64,${image.b64_json}` : null;
}

function hasUsableUrl(value: string | null | undefined) {
  return Boolean(value && (/^https?:\/\//.test(value) || value.startsWith("/") || value.startsWith("data:image/")));
}

function isStableInlineOrLocalUrl(url: string | null | undefined) {
  return Boolean(url && (url.startsWith("/mock-storage/") || url.startsWith("data:image/")));
}

function hasJimengImageCredentials() {
  return Boolean(process.env.VOLCENGINE_ACCESS_KEY_ID && process.env.VOLCENGINE_SECRET_ACCESS_KEY);
}

function canUseJimengTextFallback(hasReferenceImage: boolean) {
  return !hasReferenceImage && hasJimengImageCredentials();
}

function getProviderDisplayUrl(image: NormalizedImage) {
  return image.url || getDataUrl(image);
}

async function getDisplayUrlForStoredImage(image: StoredImage) {
  if (isStableInlineOrLocalUrl(image.url)) return image.url;
  if (!image.key) return image.url;

  try {
    return await storage.getPublicOrSignedUrl(image.key);
  } catch (error) {
    console.error(`[ai:image] signed_url_failed key=${image.key} error=${error instanceof Error ? error.message : "unknown"}`);
    return image.url;
  }
}

async function createFailedGeneration({
  userId,
  prompt,
  finalPrompt,
  model,
  style,
  aspectRatio,
  resolution,
  mode,
  failureReason
}: {
  userId: string;
  prompt: string;
  finalPrompt: string;
  model: string;
  style: string;
  aspectRatio: string;
  resolution: string;
  mode: "text-to-image" | "image-to-image";
  failureReason: string;
}) {
  return prisma.imageGeneration.create({
    data: {
      userId,
      prompt,
      finalPrompt,
      model,
      style: style || null,
      aspectRatio,
      resolution,
      mode,
      status: "failed",
      failureReason,
      count: 0
    }
  });
}

async function markGenerationFailed(generationId: string, failureReason: string, status = "failed") {
  await prisma.imageGeneration.update({
    where: { id: generationId },
    data: {
      status,
      failureReason,
      count: 0
    }
  });
}

async function markImageGenerationRetrying(generationId: string, failureReason: string) {
  await prisma.imageGeneration.update({
    where: { id: generationId },
    data: {
      failureReason,
      status: "retrying"
    }
  });
}

async function storeGeneratedImage(image: NormalizedImage, key: string, index: number): Promise<StoredImage | null> {
  const providerUrl = getProviderDisplayUrl(image);

  try {
    const uploadResult = await storage.upload({
      key,
      contentType: "image/png",
      sourceUrl: image.url,
      b64_json: image.b64_json
    });
    const url = uploadResult.url || providerUrl;
    if (hasUsableUrl(url)) return { index, key: uploadResult.key, url: url!, storageWarning: null };
  } catch (error) {
    console.error(`[ai:image] storage_upload_failed index=${index} error=${error instanceof Error ? error.message : "unknown"}`);
  }

  // If OSS failed but the provider gave us a direct image URL, keep the generation successful.
  if (hasUsableUrl(image.url)) {
    return {
      index,
      key: null,
      url: image.url!,
      storageWarning: "OSS 上传失败，已使用模型服务商返回的图片链接。"
    };
  }

  // If the provider returned base64 and the primary adapter failed, persist it to local fallback
  // so history refresh can still recover a stable public URL.
  if (image.b64_json) {
    try {
      const fallback = createMockStorage();
      const uploadResult = await fallback.uploadBuffer({
        key,
        buffer: Buffer.from(image.b64_json, "base64"),
        contentType: "image/png"
      });
      if (uploadResult.url) {
        return {
          index,
          key: uploadResult.key,
          url: uploadResult.url,
          storageWarning: "OSS 上传失败，已使用本地降级存储。"
        };
      }
    } catch (error) {
      console.error(`[ai:image] local_fallback_failed index=${index} error=${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  return null;
}

async function persistImageGeneration({
  generationId,
  userId,
  prompt,
  finalPrompt,
  model,
  style,
  aspectRatio,
  resolution,
  mode,
  images,
  imageFile
}: {
  generationId?: string;
  userId: string;
  prompt: string;
  finalPrompt: string;
  model: string;
  style: string;
  aspectRatio: string;
  resolution: string;
  mode: "text-to-image" | "image-to-image";
  images: NormalizedImage[];
  imageFile: File | null;
}) {
  const datePath = getDatePath();
  const storedImages = (
    await Promise.all(
      images.map((imageItem, index) => {
        const key = `users/${userId}/images/${datePath}/${randomUUID()}.png`;
        return storeGeneratedImage(imageItem, key, index);
      })
    )
  ).filter((item): item is StoredImage => Boolean(item && hasUsableUrl(item.url)));

  if (!storedImages.length) throw new Error("NO_USABLE_IMAGE_ASSET");

  let referenceAsset:
    | {
        objectKey: string | null;
        url: string | null;
        mimeType: string | null;
        sizeBytes: number | null;
      }
    | null = null;

  if (imageFile) {
    const extension = getExtension(imageFile.name) || "png";
    const referenceKey = `users/${userId}/uploads/${datePath}/${randomUUID()}.${extension}`;
    try {
      const uploadResult = await storage.uploadFile({
        key: referenceKey,
        file: imageFile,
        contentType: imageFile.type || "image/png"
      });
      referenceAsset = {
        objectKey: uploadResult.key,
        url: uploadResult.url,
        mimeType: imageFile.type || "image/png",
        sizeBytes: imageFile.size
      };
    } catch {
      console.error("[ai:image] reference_upload_failed");
    }
  }

  const storageWarnings = storedImages.map((item) => item.storageWarning).filter(Boolean);
  const data = {
      prompt,
      finalPrompt,
      model,
      style: style || null,
      aspectRatio,
      resolution,
      mode,
      status: "completed",
      failureReason: storageWarnings[0] || null,
      count: storedImages.length,
      assets: {
        create: [
          ...storedImages.map((item) => ({
            index: item.index,
            sourceType: "generated",
            url: item.url,
            objectKey: item.key,
            mimeType: "image/png"
          })),
          ...(referenceAsset
            ? [
                {
                  index: -1,
                  sourceType: "reference",
                  url: referenceAsset.url,
                  objectKey: referenceAsset.objectKey,
                  mimeType: referenceAsset.mimeType,
                  sizeBytes: referenceAsset.sizeBytes
                }
              ]
            : [])
        ]
      }
    };

  const generation = generationId
    ? await prisma.imageGeneration.update({
        where: { id: generationId },
        data,
        include: { assets: { orderBy: { index: "asc" } } }
      })
    : await prisma.imageGeneration.create({
        data: {
          userId,
          ...data
        },
        include: { assets: { orderBy: { index: "asc" } } }
      });

  return { generation, storedImages };
}

function getSizeForRatio(aspectRatio: string, resolution: string) {
  const normalizedResolution = ["1K", "2K", "4K"].includes(resolution) ? resolution : "1K";
  const map: Record<string, Record<string, string>> = {
    "1K": { "1:1": "1024x1024", "16:9": "1792x1024", "9:16": "1024x1792", "4:3": "1536x1024", "3:4": "1024x1536" },
    "2K": { "1:1": "2048x2048", "16:9": "2560x1440", "9:16": "1440x2560", "4:3": "2048x1536", "3:4": "1536x2048" },
    "4K": { "1:1": "4096x4096", "16:9": "3840x2160", "9:16": "2160x3840", "4:3": "4096x3072", "3:4": "3072x4096" }
  };
  return map[normalizedResolution][aspectRatio] || map[normalizedResolution]["1:1"];
}

function getOrientationForRatio(aspectRatio: string) {
  const [width, height] = aspectRatio.split(":").map(Number);
  if (width > height) return "landscape";
  if (height > width) return "portrait";
  return "square";
}

function normalizeOpenAiImages(data: unknown, model: string): NormalizedImage[] {
  const payload = data as Record<string, unknown> | null;
  const directItems = Array.isArray(payload?.data) ? (payload.data as Array<Record<string, unknown>>) : [];
  const result = payload?.result as Record<string, unknown> | undefined;
  const resultItems = Array.isArray(result?.data) ? (result.data as Array<Record<string, unknown>>) : [];
  const items = directItems.length ? directItems : resultItems;

  return items
    .map((item) => {
      const url =
        typeof item.url === "string"
          ? item.url
          : typeof item.image_url === "string"
            ? item.image_url
            : typeof item.output_url === "string"
              ? item.output_url
              : null;
      const b64Json =
        typeof item.b64_json === "string"
          ? item.b64_json
          : typeof item.base64 === "string"
            ? item.base64
            : typeof item.base64_json === "string"
              ? item.base64_json
              : null;
      const revisedPrompt = typeof item.revised_prompt === "string" ? item.revised_prompt : null;
      if (!url && !b64Json) return null;
      return { url, b64_json: b64Json, revised_prompt: revisedPrompt, model };
    })
    .filter(Boolean) as NormalizedImage[];
}

function getOpenAiImageTaskId(data: unknown) {
  const payload = data as Record<string, unknown> | null;
  const id = typeof payload?.id === "string" ? payload.id : null;
  const object = typeof payload?.object === "string" ? payload.object : "";
  const status = typeof payload?.status === "string" ? payload.status : "";
  if (!id) return null;
  if (object.includes("generation.task") || ["queued", "in_progress", "pending", "processing"].includes(status)) return id;
  return null;
}

function getOpenAiTaskError(data: unknown) {
  const payload = data as Record<string, unknown> | null;
  const error = payload?.error as Record<string, unknown> | undefined;
  const message = typeof error?.message === "string" ? error.message : typeof payload?.message === "string" ? payload.message : "";
  const code = typeof error?.code === "string" ? error.code : typeof payload?.code === "string" ? payload.code : "";
  return [code, message].filter(Boolean).join(": ") || "图片任务执行失败。";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollOpenAiImageTask(call: ImageProviderCall, taskId: string): Promise<NormalizedImage[] | null> {
  const startedAt = Date.now();
  let lastStatus = "queued";

  while (Date.now() - startedAt < XHEAI_IMAGE_POLL_TIMEOUT_MS) {
    if (call.signal.aborted) throw new DOMException("Image task aborted during provider polling", "AbortError");
    await sleep(XHEAI_IMAGE_POLL_INTERVAL_MS);

    const response = await fetch(getOpenAiImageTaskUrl(taskId), {
      method: "GET",
      headers: { Authorization: `Bearer ${call.apiKey}` },
      signal: call.signal
    });
    const data = await response.json().catch(() => null);
    lastStatus = typeof (data as { status?: unknown } | null)?.status === "string" ? String((data as { status: string }).status) : String(response.status);
    console.info(
      `[ai:image] generation_id=${call.generationId} task_event=provider_task_polled provider=xheai status=${response.status} taskStatus=${lastStatus} taskId=${taskId}`
    );

    if (!response.ok) {
      console.error(`[ai:image] generation_id=${call.generationId} task_event=provider_task_query_failed provider=xheai status=${response.status} taskId=${taskId}`);
      const retryableError = createRetryableGenerationErrorFromStatus({
        code: `HTTP_${response.status}`,
        message: getOpenAiTaskError(data),
        provider: "xheai",
        retryAfter: response.headers.get("retry-after"),
        status: response.status
      });
      if (retryableError) throw retryableError;
      return null;
    }

    const images = normalizeOpenAiImages(data, call.model);
    if (images.length) return images;

    if (lastStatus === "failed") {
      console.error(
        `[ai:image] generation_id=${call.generationId} task_event=provider_task_failed provider=xheai taskId=${taskId} error=${getOpenAiTaskError(data)}`
      );
      return null;
    }
  }

  console.error(`[ai:image] generation_id=${call.generationId} task_event=provider_task_timeout provider=xheai taskId=${taskId} lastStatus=${lastStatus}`);
  return null;
}

function normalizeGeminiImages(data: unknown, model: string): NormalizedImage[] {
  const candidates = Array.isArray((data as { candidates?: unknown[] } | null)?.candidates)
    ? (data as { candidates: Array<Record<string, unknown>> }).candidates
    : [];
  const images: NormalizedImage[] = [];

  for (const candidate of candidates) {
    const content = candidate.content as { parts?: Array<Record<string, unknown>> } | undefined;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    for (const part of parts) {
      const inlineData = (part.inlineData as { data?: unknown } | undefined) || (part.inline_data as { data?: unknown } | undefined);
      const fileData = ((part.fileData || part.file_data) as Record<string, unknown> | undefined) || {};
      const b64Json = typeof inlineData?.data === "string" ? inlineData.data : null;
      const url =
        typeof fileData.fileUri === "string"
          ? fileData.fileUri
          : typeof fileData.file_uri === "string"
            ? fileData.file_uri
            : null;
      if (url || b64Json) images.push({ url, b64_json: b64Json, revised_prompt: null, model });
    }
  }

  return images;
}

function getGeminiError(data: unknown) {
  const payload = data as Record<string, unknown> | null;
  const error = payload?.error as Record<string, unknown> | undefined;
  const code = typeof error?.code === "string" || typeof error?.code === "number" ? String(error.code) : "";
  const message = typeof error?.message === "string" ? error.message : "";
  return [code, message].filter(Boolean).join(": ");
}

async function fileToBase64(file: File) {
  return Buffer.from(await file.arrayBuffer()).toString("base64");
}

function appendOpenAiImageFields(formData: FormData, call: ImageProviderCall, useImageSize: boolean) {
  formData.append("model", call.model);
  formData.append("prompt", call.prompt);
  formData.append("aspect_ratio", call.aspectRatio);
  formData.append(useImageSize ? "image_size" : "size", useImageSize ? call.imageSize : call.size);
  formData.append("response_format", "url");
  formData.append("n", String(call.count));
}

function ensureProviderSignalActive(call: ImageProviderCall, provider: string) {
  if (!call.signal.aborted) return;
  console.error(`[ai:image] generation_id=${call.generationId} task_event=provider_request_skipped provider=${provider} model=${call.model} reason=signal_aborted`);
  throw new DOMException("Image task aborted before provider request started", "AbortError");
}

async function callOpenAiImage(call: ImageProviderCall, useImageSize = false) {
  const endpoint = call.image ? joinOpenAiUrl("/images/edits") : joinOpenAiUrl("/images/generations");
  const mode = call.image ? "image-to-image" : "text-to-image";
  const variant = useImageSize ? "image_size" : "size";
  ensureProviderSignalActive(call, "xheai");
  console.info(`[ai:image] generation_id=${call.generationId} task_event=provider_request_started provider=xheai endpoint=${call.image ? "/v1/images/edits" : "/v1/images/generations"} model=${call.model} mode=${mode} variant=${variant}`);
  call.onProviderRequestStart?.();

  if (call.image) {
    const formData = new FormData();
    appendOpenAiImageFields(formData, call, useImageSize);
    formData.append("image", call.image, call.image.name);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${call.apiKey}` },
        body: formData,
        signal: call.signal
      });
      console.info(`[ai:image] generation_id=${call.generationId} task_event=provider_response_received provider=xheai status=${response.status} model=${call.model} variant=${variant}`);
      if (!response.ok) {
        const retryableError = createRetryableGenerationErrorFromStatus({
          code: `HTTP_${response.status}`,
          message: await readProviderErrorMessage(response),
          provider: "xheai",
          retryAfter: response.headers.get("retry-after"),
          status: response.status
        });
        if (retryableError) throw retryableError;
      }
      return response;
    } catch (error) {
      console.error(`[ai:image] generation_id=${call.generationId} task_event=provider_request_failed provider=xheai model=${call.model} variant=${variant} error=${error instanceof Error ? error.name : "unknown"}`);
      throw error;
    }
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${call.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: call.model,
        prompt: call.prompt,
        aspect_ratio: call.aspectRatio,
        [useImageSize ? "image_size" : "size"]: useImageSize ? call.imageSize : call.size,
        response_format: "url",
        metadata: {
          resolution: call.imageSize.toUpperCase(),
          orientation: getOrientationForRatio(call.aspectRatio)
        },
        n: call.count
      }),
      signal: call.signal
    });
    console.info(`[ai:image] generation_id=${call.generationId} task_event=provider_response_received provider=xheai status=${response.status} model=${call.model} variant=${variant}`);
    if (!response.ok) {
      const retryableError = createRetryableGenerationErrorFromStatus({
        code: `HTTP_${response.status}`,
        message: await readProviderErrorMessage(response),
        provider: "xheai",
        retryAfter: response.headers.get("retry-after"),
        status: response.status
      });
      if (retryableError) throw retryableError;
    }
    return response;
  } catch (error) {
    console.error(`[ai:image] generation_id=${call.generationId} task_event=provider_request_failed provider=xheai model=${call.model} variant=${variant} error=${error instanceof Error ? error.name : "unknown"}`);
    throw error;
  }
}

async function callGeminiNative(call: ImageProviderCall) {
  const parts: Array<Record<string, unknown>> = [
    { text: `${call.prompt}\n\n输出比例：${call.aspectRatio}。目标尺寸：${call.size}。分辨率：${call.imageSize.toUpperCase()}。请返回生成图片。` }
  ];
  if (call.image) {
    parts.push({ inlineData: { mimeType: call.image.type || "image/png", data: await fileToBase64(call.image) } });
  }

  const endpoint = joinUrl(getXheaiRootUrl(), `/v1beta/models/${call.model}:generateContent`);
  ensureProviderSignalActive(call, "xheai-gemini");
  console.info(`[ai:image] generation_id=${call.generationId} task_event=provider_request_started provider=xheai-gemini endpoint=/v1beta/models/${call.model}:generateContent model=${call.model}`);
  call.onProviderRequestStart?.();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${call.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
      signal: call.signal
    });
    console.info(`[ai:image] generation_id=${call.generationId} task_event=provider_response_received provider=xheai-gemini status=${response.status} model=${call.model}`);
    if (!response.ok) {
      const retryableError = createRetryableGenerationErrorFromStatus({
        code: `HTTP_${response.status}`,
        message: await readProviderErrorMessage(response),
        provider: "xheai-gemini",
        retryAfter: response.headers.get("retry-after"),
        status: response.status
      });
      if (retryableError) throw retryableError;
    }
    return response;
  } catch (error) {
    console.error(`[ai:image] generation_id=${call.generationId} task_event=provider_request_failed provider=xheai-gemini model=${call.model} error=${error instanceof Error ? error.name : "unknown"}`);
    throw error;
  }
}

async function readProviderErrorMessage(response: Response) {
  const clone = response.clone();
  const data = await clone.json().catch(() => null);
  if (data && typeof data === "object") {
    const error = (data as Record<string, unknown>).error as Record<string, unknown> | undefined;
    const message = error?.message || (data as Record<string, unknown>).message || (data as Record<string, unknown>).error_msg;
    if (typeof message === "string") return message;
  }
  return `HTTP_${response.status}`;
}

async function requestImages(call: ImageProviderCall) {
  const capability = getImageModelCapability(call.model);
  if (!capability) {
    console.error(`[ai:image] generation_id=${call.generationId} model=${call.model} code=INVALID_MODEL`);
    return null;
  }

  const requestJimengFallback = async () => {
    if (call.image) return null;
    if (!hasJimengImageCredentials()) return null;
    console.warn(`[ai:image] generation_id=${call.generationId} task_event=fallback_started from=subrouter to=volc-jimeng model=${call.model}`);
    const result = await generateJimengImage21({
      generationId: call.generationId,
      prompt: call.prompt,
      aspectRatio: call.aspectRatio,
      resolution: call.imageSize.toUpperCase(),
      count: call.count,
      signal: call.signal,
      onProviderRequestStart: call.onProviderRequestStart
    });
    return result.images;
  };

  if (capability.provider === "jimeng") {
    if (call.image) {
      console.error(`[ai:image] generation_id=${call.generationId} model=${call.model} code=UNSUPPORTED_IMAGE_UPLOAD`);
      return null;
    }
    const result = await generateJimengImage21({
      generationId: call.generationId,
      prompt: call.prompt,
      aspectRatio: call.aspectRatio,
      resolution: call.imageSize.toUpperCase(),
      count: call.count,
      signal: call.signal,
      onProviderRequestStart: call.onProviderRequestStart
    });
    return result.images;
  }

  if (capability.provider === "subrouter") {
    try {
      const result = await generateSubrouterImage2({
        generationId: call.generationId,
        prompt: call.prompt,
        aspectRatio: call.aspectRatio,
        size: call.size,
        imageSize: call.imageSize,
        count: call.count,
        image: call.image,
        signal: call.signal,
        onProviderRequestStart: call.onProviderRequestStart
      });
      return result.images.map((image) => ({ ...image, model: call.model }));
    } catch (error) {
      console.error(
        `[ai:image] generation_id=${call.generationId} task_event=primary_failed provider=subrouter model=${call.model} error=${error instanceof Error ? error.message : "unknown"}`
      );
      const fallbackImages = await requestJimengFallback();
      if (fallbackImages?.length) return fallbackImages;
      throw error;
    }
  }

  const providerCall = { ...call, model: capability.providerModel };
  if (capability.apiMode === "gemini_native") {
    const geminiResponse = await callGeminiNative(providerCall);
    const geminiData = await geminiResponse.json().catch(() => null);
    const geminiImages = geminiResponse.ok ? normalizeGeminiImages(geminiData, call.model) : [];
    if (geminiImages.length) return geminiImages;
    console.error(
      `[ai:image] generation_id=${call.generationId} model=${call.model} status=${geminiResponse.status} code=BAD_GEMINI_RESPONSE error=${getGeminiError(geminiData) || "-"}`
    );
    return null;
  }

  const openAiResponse = await callOpenAiImage(providerCall);
  const openAiData = await openAiResponse.json().catch(() => null);
  const openAiImages = openAiResponse.ok ? normalizeOpenAiImages(openAiData, call.model) : [];
  if (openAiImages.length) return openAiImages;
  const openAiTaskId = openAiResponse.ok ? getOpenAiImageTaskId(openAiData) : null;
  if (openAiTaskId) return pollOpenAiImageTask({ ...providerCall, model: call.model }, openAiTaskId);

  const imageSizeResponse = await callOpenAiImage(providerCall, true);
  const imageSizeData = await imageSizeResponse.json().catch(() => null);
  const imageSizeImages = imageSizeResponse.ok ? normalizeOpenAiImages(imageSizeData, call.model) : [];
  if (imageSizeImages.length) return imageSizeImages;
  const imageSizeTaskId = imageSizeResponse.ok ? getOpenAiImageTaskId(imageSizeData) : null;
  if (imageSizeTaskId) return pollOpenAiImageTask({ ...providerCall, model: call.model }, imageSizeTaskId);
  console.error(`[ai:image] generation_id=${call.generationId} model=${call.model} status=${imageSizeResponse.status} code=BAD_PROVIDER_RESPONSE`);
  return null;
}

function bufferedImageToFile(imageFile: BufferedImageFile) {
  if (!imageFile) return null;
  const blob = new Blob([new Uint8Array(imageFile.buffer)], { type: imageFile.type || "image/png" });
  return new File([blob], imageFile.name, { type: imageFile.type || "image/png" });
}

async function runImageGenerationTask({
  generationId,
  userId,
  model,
  prompt,
  finalPrompt,
  style,
  aspectRatio,
  resolution,
  count,
  mode,
  attempt = 0,
  imageFile
}: {
  attempt?: number;
  generationId: string;
  userId: string;
  model: string;
  prompt: string;
  finalPrompt: string;
  style: string;
  aspectRatio: string;
  resolution: string;
  count: number;
  mode: "text-to-image" | "image-to-image";
  imageFile: BufferedImageFile;
}) {
  const capability = getImageModelCapability(model);
  if (!capability) {
    await writeErrorLog({
      userId,
      route: "/api/ai/image",
      method: "POST",
      status: 400,
      code: "INVALID_MODEL",
      provider: "image",
      message: `Unsupported image model: ${model}`,
      detail: { generationId, model }
    });
    await markGenerationFailed(generationId, "当前图片模型不可用。");
    return;
  }

  const hasSubrouterOrFallback = hasImage2ApiKeys() || canUseJimengTextFallback(Boolean(imageFile));
  const apiKey = capability.provider === "xheai" ? process.env.XHEAI_API_KEY : capability.provider === "subrouter" ? (hasSubrouterOrFallback ? "image2-key-pool-or-fallback" : "") : "volcengine";
  if ((capability.provider === "xheai" && !process.env.XHEAI_API_KEY) || (capability.provider === "subrouter" && !hasSubrouterOrFallback)) {
    await writeErrorLog({
      userId,
      route: "/api/ai/image",
      method: "POST",
      status: 503,
      code: "MISSING_API_KEY",
      provider: capability.provider,
      message: "Image provider API key is not configured.",
      detail: { generationId, model }
    });
    await markGenerationFailed(generationId, "图片服务暂未配置，请联系管理员。");
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TASK_TIMEOUT_MS);
  let providerRequestStarted = false;

  try {
    console.info(`[ai:image] generation_id=${generationId} task_event=task_started model=${model} mode=${mode}`);
    await prisma.imageGeneration.update({ where: { id: generationId }, data: { status: "processing", failureReason: null } });

    const size = getSizeForRatio(aspectRatio, resolution);
    const imageSize = ["1K", "2K", "4K"].includes(resolution) ? resolution.toLowerCase() : "1k";
    const images = await requestImages({
      generationId,
      apiKey: apiKey || "",
      model,
      prompt: finalPrompt,
      aspectRatio,
      size,
      imageSize,
      count,
      image: bufferedImageToFile(imageFile),
      signal: controller.signal,
      onProviderRequestStart: () => {
        providerRequestStarted = true;
      }
    });

    if (!images?.length) {
      await writeErrorLog({
        userId,
        route: "/api/ai/image",
        method: "POST",
        status: 502,
        code: "PROVIDER_EMPTY_RESULT",
        provider: capability.provider,
        message: "Image provider returned no usable images.",
        detail: { generationId, model, providerRequestStarted }
      });
      console.error(
        `[ai:image] generation_id=${generationId} task_event=provider_empty_result model=${model} providerRequestStarted=${providerRequestStarted}`
      );
      await markGenerationFailed(generationId, "第三方接口未返回有效图片。");
      return;
    }

    const effectiveFinalPrompt = images.find((imageItem) => imageItem.revised_prompt)?.revised_prompt || finalPrompt;
    let persisted;
    try {
      persisted = await persistImageGeneration({
        generationId,
        userId,
        prompt,
        finalPrompt: effectiveFinalPrompt,
        model,
        style,
        aspectRatio,
        resolution,
        mode,
        images,
        imageFile: bufferedImageToFile(imageFile)
      });
    } catch (error) {
      await markGenerationFailed(
        generationId,
        error instanceof Error && error.message === "NO_USABLE_IMAGE_ASSET" ? "图片资源保存失败。" : "图片历史保存失败。"
      );
      return;
    }

    await Promise.all(persisted.storedImages.map(getDisplayUrlForStoredImage));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      if (providerRequestStarted) {
        console.error(`[ai:image] generation_id=${generationId} task_event=timeout_marked model=${model} code=PROVIDER_TIMEOUT`);
        await handleImageGenerationRetryableFailure({
          attempt,
          error,
          generationId,
          imageFile,
          params: { aspectRatio, count, finalPrompt, mode, model, prompt, resolution, style, userId }
        });
      } else {
        console.error(`[ai:image] generation_id=${generationId} task_event=execution_failed_before_provider model=${model} code=LOCAL_ABORT`);
        await markGenerationFailed(generationId, "本地任务执行超时，未发出模型请求。").catch(() => console.error("[ai:image] local_abort_mark_failed"));
      }
      return;
    }

    if (isRetryableGenerationError(error)) {
      await handleImageGenerationRetryableFailure({
        attempt,
        error,
        generationId,
        imageFile,
        params: { aspectRatio, count, finalPrompt, mode, model, prompt, resolution, style, userId }
      });
      return;
    }

    console.error(
      `[ai:image] generation_id=${generationId} task_event=${providerRequestStarted ? "provider_request_failed" : "execution_failed_before_provider"} model=${model} code=${providerRequestStarted ? "PROVIDER_ERROR" : "LOCAL_EXECUTION_ERROR"} error=${error instanceof Error ? error.message : "unknown"}`
    );
    await markGenerationFailed(generationId, providerRequestStarted ? "图片生成服务异常。" : "本地任务执行异常，未发出模型请求。").catch(() =>
      console.error("[ai:image] failure_mark_failed")
    );
  } finally {
    clearTimeout(timer);
  }
}

async function handleImageGenerationRetryableFailure({
  attempt,
  error,
  generationId,
  imageFile,
  params
}: {
  attempt: number;
  error: unknown;
  generationId: string;
  imageFile: BufferedImageFile;
  params: {
    aspectRatio: string;
    count: number;
    finalPrompt: string;
    mode: "text-to-image" | "image-to-image";
    model: string;
    prompt: string;
    resolution: string;
    style: string;
    userId: string;
  };
}) {
  if (!shouldRetryGenerationError(error, attempt, "image")) {
    await markGenerationFailed(generationId, "图片生成服务繁忙，多次重试后仍未成功。", "failed").catch(() =>
      console.error("[ai:image] retry_exhausted_mark_failed")
    );
    return;
  }

  const notice = getGenerationRetryNotice("image", attempt);
  await markImageGenerationRetrying(generationId, notice).catch(() => console.error("[ai:image] retry_mark_failed"));
  const delayMs = getGenerationRetryDelayMs("image", attempt, error);
  console.warn(`[ai:image] generation_id=${generationId} task_event=retry_scheduled attempt=${attempt + 1} delayMs=${delayMs}`);
  setTimeout(() => {
    enqueueGenerationExecution("image", generationId, () =>
      runImageGenerationTask({
        ...params,
        attempt: attempt + 1,
        generationId,
        imageFile
      })
    );
  }, delayMs);
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const formData = await request.formData().catch(() => null);
  if (!formData) return jsonError("INVALID_REQUEST", "请求格式不正确。", 400);

  const model = String(formData.get("model") || "gpt-image-2");
  const prompt = String(formData.get("prompt") || "").trim();
  const style = String(formData.get("style") || "");
  const aspectRatio = String(formData.get("aspect_ratio") || "1:1");
  const resolution = String(formData.get("resolution") || "1K").toUpperCase();
  const count = Math.min(Math.max(Number(formData.get("count") || 1), 1), 4);
  const image = formData.get("image");
  const imageFile = image instanceof File ? image : null;
  const mode = imageFile ? "image-to-image" : "text-to-image";
  const finalPrompt = normalizePrompt(prompt, style);
  const capability = getImageModelCapability(model);

  if (!capability) return jsonError("INVALID_MODEL", "当前图片模型不可用。", 400);
  if (imageFile && !capability.supportsImageUpload) return jsonError("UNSUPPORTED_IMAGE_MODE", "当前模型暂不支持参考图，请移除参考图后重试。", 400);
  if (capability.provider === "jimeng" && (!process.env.VOLCENGINE_ACCESS_KEY_ID || !process.env.VOLCENGINE_SECRET_ACCESS_KEY)) {
    return jsonError("MISSING_API_KEY", "即梦图片服务暂未配置，请联系管理员。", 500);
  }
  const hasSubrouterOrFallback = hasImage2ApiKeys() || canUseJimengTextFallback(Boolean(imageFile));
  if (capability.provider === "subrouter" && !hasSubrouterOrFallback) {
    return jsonError("MISSING_API_KEY", "图片服务暂未配置，请联系管理员。", 500);
  }

  if (!allowedModels.has(model)) return jsonError("INVALID_MODEL", "当前图片模型不可用。", 400);
  if (!prompt) return jsonError("INVALID_PROMPT", "请先输入图片提示词。", 400);

  if (imageFile) {
    if (!isAllowedImage(imageFile)) return jsonError("UNSUPPORTED_IMAGE_TYPE", "仅支持 jpg、jpeg、png、webp 图片。", 400);
    if (imageFile.size > MAX_IMAGE_SIZE) return jsonError("IMAGE_TOO_LARGE", "图片过大，请压缩后重试。", 400);
  }

  const apiKey = capability.provider === "xheai" ? process.env.XHEAI_API_KEY : capability.provider === "subrouter" ? (hasSubrouterOrFallback ? "image2-key-pool-or-fallback" : "") : "volcengine";
  if (!apiKey) return jsonError("MISSING_API_KEY", "图片服务暂未配置，请联系管理员。", 500);

  const quotaResult = await checkAndConsumeQuota(user!.id, "image");
  if (!quotaResult.ok) {
    return NextResponse.json(quotaResult, { status: 429 });
  }

  const bufferedImage: BufferedImageFile = imageFile
    ? {
        name: imageFile.name,
        type: imageFile.type || "image/png",
        size: imageFile.size,
        buffer: Buffer.from(await imageFile.arrayBuffer())
      }
    : null;

  const generation = await prisma.imageGeneration.create({
    data: {
      userId: user!.id,
      prompt,
      finalPrompt,
      model,
      style: style || null,
      aspectRatio,
      resolution,
      mode,
      status: "queued",
      failureReason: null,
      count: 0
    }
  });
  console.info(`[ai:image] generation_id=${generation.id} task_event=task_created model=${model} mode=${mode}`);

  setTimeout(() => {
    console.info(`[ai:image] generation_id=${generation.id} task_event=task_dispatched model=${model} mode=${mode}`);
    enqueueGenerationExecution("image", generation.id, () =>
      runImageGenerationTask({
        generationId: generation.id,
        userId: user!.id,
        model,
        prompt,
        finalPrompt,
        style,
        aspectRatio,
        resolution,
        count,
        mode,
        imageFile: bufferedImage
      })
    );
  }, 0);

  return NextResponse.json(
    {
      generation: {
        id: generation.id,
        taskId: generation.id,
        userId: generation.userId,
        type: "image",
        mode: generation.mode,
        title: prompt.replace(/\s+/g, " ").slice(0, 24) || "图片生成",
        prompt: generation.prompt,
        finalPrompt: generation.finalPrompt || finalPrompt,
        failureReason: null,
        status: "生成中",
        model: generation.model,
        style: generation.style || "默认",
        ratio: generation.aspectRatio,
        resolution: generation.resolution,
        count: 0,
        images: [],
        createdAt: generation.createdAt.toISOString(),
        updatedAt: generation.updatedAt.toISOString()
      }
    },
    { status: 202 }
  );
}
