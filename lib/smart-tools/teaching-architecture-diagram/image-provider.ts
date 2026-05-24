import "server-only";

import { generateSubrouterImage2, getImage2Config, hasImage2ApiKeys } from "@/lib/image/subrouter";
import { TeachingArchitectureImageError, isTimeoutMessage, summarizeImageError } from "@/lib/smart-tools/teaching-architecture-diagram/image-errors";
import { IMAGE_GENERATION_TIMEOUT_MS, type TeachingArchitectureVisualPlan } from "@/lib/smart-tools/teaching-architecture-diagram/types";

const XHEAI_DEFAULT_BASE_URL = "https://api.xheai.cc";
const TEACHING_ARCHITECTURE_DEFAULT_PROVIDER = "xheai";
const TEACHING_ARCHITECTURE_DEFAULT_MODEL = "gpt-image-2-all";
const TEACHING_ARCHITECTURE_IMAGE_ASPECT_RATIO: TeachingArchitectureVisualPlan["aspectRatio"] = "16:9";
const TEACHING_ARCHITECTURE_IMAGE_SIZE: TeachingArchitectureVisualPlan["size"] = "1792x1024";
const TEACHING_ARCHITECTURE_IMAGE_QUALITY = "1k";
const XHEAI_TASK_POLL_INTERVAL_MS = 3_000;

export type TeachingArchitectureImageProviderResult = {
  provider: string;
  model: string;
  width: number;
  height: number;
  image: {
    b64_json?: string;
    url?: string;
  };
  attempts: Array<{
    provider?: string;
    status?: number;
    elapsedMs: number;
    error?: string;
  }>;
};

type TeachingArchitectureImageProviderInput = {
  taskId: string;
  prompt: string;
  aspectRatio?: TeachingArchitectureVisualPlan["aspectRatio"];
  size?: TeachingArchitectureVisualPlan["size"];
  orientation?: TeachingArchitectureVisualPlan["orientation"];
  sourceImage?: File | null;
  signal: AbortSignal;
  onProviderRequestStart?: () => void;
  fetchImpl?: typeof fetch;
};

export function getTeachingArchitectureImageProviderConfig() {
  const sharedConfig = getImage2Config();
  return {
    provider: (process.env.TEACHING_ARCHITECTURE_IMAGE_PROVIDER || TEACHING_ARCHITECTURE_DEFAULT_PROVIDER).trim(),
    model: (process.env.TEACHING_ARCHITECTURE_IMAGE_MODEL || TEACHING_ARCHITECTURE_DEFAULT_MODEL).trim(),
    baseUrl: (process.env.TEACHING_ARCHITECTURE_IMAGE_BASE_URL || process.env.XHEAI_BASE_URL || XHEAI_DEFAULT_BASE_URL).trim(),
    timeoutMs: clampInt(
      process.env.TEACHING_ARCHITECTURE_IMAGE_TIMEOUT_MS || process.env.IMAGE2_REQUEST_TIMEOUT_MS,
      IMAGE_GENERATION_TIMEOUT_MS,
      10_000,
      900_000
    ),
    subrouterModel: (process.env.TEACHING_ARCHITECTURE_IMAGE_MODEL || process.env.IMAGE2_MODEL || sharedConfig.model || "gpt-image-2").trim()
  };
}

export async function generateTeachingArchitectureImageWithProvider(input: TeachingArchitectureImageProviderInput): Promise<TeachingArchitectureImageProviderResult> {
  const config = getTeachingArchitectureImageProviderConfig();
  if (config.provider !== "xheai" && config.provider !== "image2" && config.provider !== "subrouter") {
    throw new TeachingArchitectureImageError("IMAGE_PROVIDER_NOT_CONFIGURED", "图片生成服务未配置，请检查环境变量。", {
      retryable: false
    });
  }

  if (input.sourceImage && hasImage2ApiKeys()) {
    return generateTeachingArchitectureImage2(input, config);
  }

  if (config.provider === "xheai") {
    if (!process.env.XHEAI_API_KEY) {
      throw new TeachingArchitectureImageError("IMAGE_PROVIDER_NOT_CONFIGURED", "图片生成服务未配置，请检查环境变量。", {
        retryable: false
      });
    }
    const startedAt = Date.now();
    try {
      return await generateXheaiGptImage2(input, config);
    } catch (error) {
      if (!shouldFallbackFromXheai(error) || !hasImage2ApiKeys()) throw error;
      const xheaiAttempt = buildProviderAttemptFromError("xheai", error, Date.now() - startedAt);
      console.warn(
        `[teaching-architecture-diagram:image] xheai timed out, switching to image2 fallback. status=${xheaiAttempt.status || "-"} error=${xheaiAttempt.error || "-"}`
      );
      const fallback = await generateTeachingArchitectureImage2(input, config);
      return {
        ...fallback,
        attempts: [xheaiAttempt, ...fallback.attempts]
      };
    }
  }

  if (!hasImage2ApiKeys()) {
    throw new TeachingArchitectureImageError("IMAGE_PROVIDER_NOT_CONFIGURED", "图片生成服务未配置，请检查环境变量。", {
      retryable: false
    });
  }

  return generateTeachingArchitectureImage2(input, config);
}

async function generateTeachingArchitectureImage2(
  input: TeachingArchitectureImageProviderInput,
  config: ReturnType<typeof getTeachingArchitectureImageProviderConfig>
): Promise<TeachingArchitectureImageProviderResult> {
  try {
    const result = await generateSubrouterImage2(
      {
        generationId: input.taskId,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio || TEACHING_ARCHITECTURE_IMAGE_ASPECT_RATIO,
        size: input.size || TEACHING_ARCHITECTURE_IMAGE_SIZE,
        imageSize: TEACHING_ARCHITECTURE_IMAGE_QUALITY,
        count: 1,
        image: input.sourceImage || null,
        signal: input.signal,
        onProviderRequestStart: input.onProviderRequestStart
      },
      input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}
    );
    const image = result.images[0];
    if (!image?.b64_json && !image?.url) {
      throw new TeachingArchitectureImageError("IMAGE_PROVIDER_BAD_RESPONSE", "图片生成服务未返回有效图片。", {
        retryable: true
      });
    }

    return {
      provider: config.provider === "image2" ? "image2" : result.provider,
      model: result.model,
      ...parseImageSize(input.size || TEACHING_ARCHITECTURE_IMAGE_SIZE),
      image: {
        b64_json: image.b64_json || undefined,
        url: image.url || undefined
      },
      attempts: result.attempts.map((attempt) => ({
        provider: "subrouter",
        status: attempt.status,
        elapsedMs: attempt.elapsedMs,
        error: attempt.error
      }))
    };
  } catch (error) {
    const summary = summarizeImageError(error);
    const message = error instanceof Error ? error.message : String(error);
    if (summary.code === "IMAGE_PROVIDER_NOT_CONFIGURED") {
      throw new TeachingArchitectureImageError("IMAGE_PROVIDER_NOT_CONFIGURED", "图片生成服务未配置，请检查环境变量。", {
        retryable: false,
        cause: error
      });
    }
    if (summary.code === "IMAGE_PROVIDER_TIMEOUT" || isTimeoutMessage(message)) {
      throw new TeachingArchitectureImageError("IMAGE_PROVIDER_TIMEOUT", "模型生成超时，请稍后重试或减少材料数量。", {
        retryable: true,
        cause: error
      });
    }
    if (error instanceof TeachingArchitectureImageError) {
      throw error;
    }
    throw new TeachingArchitectureImageError("IMAGE_PROVIDER_FAILED", "图片生成服务调用失败，请稍后重试。", {
      retryable: true,
      cause: error
    });
  }
}

function shouldFallbackFromXheai(error: unknown) {
  const summary = summarizeImageError(error);
  const message = error instanceof Error ? error.message : String(error);
  return summary.code === "IMAGE_PROVIDER_TIMEOUT" || isTimeoutMessage(message);
}

function buildProviderAttemptFromError(provider: string, error: unknown, elapsedMs: number) {
  const summary = summarizeImageError(error);
  const status = error instanceof TeachingArchitectureImageError ? error.status : undefined;
  return {
    provider,
    status,
    elapsedMs,
    error: summary.message.slice(0, 240)
  };
}

async function generateXheaiGptImage2(
  input: TeachingArchitectureImageProviderInput,
  config: ReturnType<typeof getTeachingArchitectureImageProviderConfig>
): Promise<TeachingArchitectureImageProviderResult> {
  const fetcher = input.fetchImpl || fetch;
  const startedAt = Date.now();
  const endpoint = joinUrl(config.baseUrl.replace(/\/v1\/?$/, ""), "/v1/images/generations");

  try {
    input.onProviderRequestStart?.();
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.XHEAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        prompt: input.prompt,
        aspect_ratio: input.aspectRatio || TEACHING_ARCHITECTURE_IMAGE_ASPECT_RATIO,
        image_size: TEACHING_ARCHITECTURE_IMAGE_QUALITY,
        size: input.size || TEACHING_ARCHITECTURE_IMAGE_SIZE,
        response_format: "url",
        n: 1,
        metadata: {
          provider: "xheai",
          orientation: input.orientation || "landscape",
          resolution: TEACHING_ARCHITECTURE_IMAGE_QUALITY.toUpperCase()
        }
      }),
      signal: input.signal
    });
    const elapsedMs = Date.now() - startedAt;
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new TeachingArchitectureImageError(
        isRetryableStatus(response.status) ? "IMAGE_PROVIDER_TIMEOUT" : "IMAGE_PROVIDER_FAILED",
        isRetryableStatus(response.status) ? "模型生成超时，请稍后重试或减少材料数量。" : getProviderErrorMessage(data, response.status),
        {
          retryable: isRetryableStatus(response.status),
          status: response.status
        }
      );
    }

    const directImage = normalizeXheaiImages(data)[0];
    if (directImage) {
      return buildXheaiResult(config.model, directImage, input.size || TEACHING_ARCHITECTURE_IMAGE_SIZE, elapsedMs, response.status);
    }

    const taskId = getXheaiImageTaskId(data);
    if (taskId) {
      const polledImage = await pollXheaiImageTask({
        taskId,
        model: config.model,
        baseUrl: config.baseUrl,
        signal: input.signal,
        fetcher,
        startedAt,
        timeoutMs: config.timeoutMs
      });
      return buildXheaiResult(config.model, polledImage, input.size || TEACHING_ARCHITECTURE_IMAGE_SIZE, Date.now() - startedAt, response.status);
    }

    throw new TeachingArchitectureImageError("IMAGE_PROVIDER_BAD_RESPONSE", "图片生成服务未返回有效图片。", {
      retryable: true,
      status: response.status
    });
  } catch (error) {
    if (error instanceof TeachingArchitectureImageError) throw error;
    if (error instanceof Error && isTimeoutMessage(error.message)) {
      throw new TeachingArchitectureImageError("IMAGE_PROVIDER_TIMEOUT", "模型生成超时，请稍后重试或减少材料数量。", {
        retryable: true,
        cause: error
      });
    }
    throw error;
  }
}

async function pollXheaiImageTask(input: {
  taskId: string;
  model: string;
  baseUrl: string;
  signal: AbortSignal;
  fetcher: typeof fetch;
  startedAt: number;
  timeoutMs: number;
}) {
  const endpoint = joinUrl(input.baseUrl.replace(/\/v1\/?$/, ""), `/v1/images/generations/${encodeURIComponent(input.taskId)}`);
  while (Date.now() - input.startedAt < input.timeoutMs) {
    if (input.signal.aborted) throw new DOMException("Image task aborted during provider polling", "AbortError");
    await sleep(XHEAI_TASK_POLL_INTERVAL_MS);

    const response = await input.fetcher(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${process.env.XHEAI_API_KEY}` },
      signal: input.signal
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new TeachingArchitectureImageError(
        isRetryableStatus(response.status) ? "IMAGE_PROVIDER_TIMEOUT" : "IMAGE_PROVIDER_FAILED",
        isRetryableStatus(response.status) ? "模型生成超时，请稍后重试或减少材料数量。" : getProviderErrorMessage(data, response.status),
        {
          retryable: isRetryableStatus(response.status),
          status: response.status
        }
      );
    }

    const image = normalizeXheaiImages(data)[0];
    if (image) return image;
    if (getXheaiTaskStatus(data) === "failed") {
      throw new TeachingArchitectureImageError("IMAGE_PROVIDER_FAILED", getProviderErrorMessage(data, response.status), {
        retryable: true,
        status: response.status
      });
    }
  }

  throw new TeachingArchitectureImageError("IMAGE_PROVIDER_TIMEOUT", "模型生成超时，请稍后重试或减少材料数量。", {
    retryable: true
  });
}

function buildXheaiResult(
  model: string,
  image: {
    b64_json?: string;
    url?: string;
  },
  size: TeachingArchitectureVisualPlan["size"],
  elapsedMs: number,
  status?: number
): TeachingArchitectureImageProviderResult {
  const dimensions = parseImageSize(size);
  return {
    provider: "xheai",
    model,
    width: dimensions.width,
    height: dimensions.height,
    image,
    attempts: [
      {
        status,
        elapsedMs
      }
    ]
  };
}

function normalizeXheaiImages(data: unknown): Array<{ b64_json?: string; url?: string }> {
  const payload = data as Record<string, unknown> | null;
  const result = payload?.result as Record<string, unknown> | undefined;
  const directItems = Array.isArray(payload?.data) ? (payload.data as Array<Record<string, unknown>>) : [];
  const resultItems = Array.isArray(result?.data) ? (result.data as Array<Record<string, unknown>>) : [];
  const imageItems = Array.isArray(payload?.images) ? (payload.images as Array<Record<string, unknown>>) : [];
  const items = directItems.length ? directItems : resultItems.length ? resultItems : imageItems;

  return items
    .map((item) => {
      const url =
        typeof item.url === "string"
          ? item.url
          : typeof item.image_url === "string"
            ? item.image_url
            : typeof item.output_url === "string"
              ? item.output_url
              : undefined;
      const b64Json =
        typeof item.b64_json === "string"
          ? item.b64_json
          : typeof item.base64 === "string"
            ? item.base64
            : typeof item.base64_json === "string"
              ? item.base64_json
              : undefined;
      if (!url && !b64Json) return null;
      return { url, b64_json: b64Json };
    })
    .filter(Boolean) as Array<{ b64_json?: string; url?: string }>;
}

function getXheaiImageTaskId(data: unknown) {
  const payload = data as Record<string, unknown> | null;
  const id = typeof payload?.id === "string" ? payload.id : null;
  const status = typeof payload?.status === "string" ? payload.status : "";
  const object = typeof payload?.object === "string" ? payload.object : "";
  if (!id) return null;
  if (object.includes("generation.task") || ["queued", "in_progress", "pending", "processing"].includes(status)) return id;
  return null;
}

function getXheaiTaskStatus(data: unknown) {
  const payload = data as Record<string, unknown> | null;
  return typeof payload?.status === "string" ? payload.status : "";
}

function getProviderErrorMessage(data: unknown, status: number) {
  const payload = data as Record<string, unknown> | null;
  const error = payload?.error as Record<string, unknown> | string | undefined;
  if (typeof error === "string") return error;
  const message =
    (typeof error?.message === "string" && error.message) ||
    (typeof payload?.message === "string" && payload.message) ||
    (typeof payload?.error_msg === "string" && payload.error_msg) ||
    "";
  return message || `HTTP_${status}`;
}

function isRetryableStatus(status: number) {
  return [408, 409, 425, 429, 500, 502, 503, 504, 524].includes(status);
}

function joinUrl(baseUrl: string, targetPath: string) {
  return `${baseUrl.replace(/\/$/, "")}/${targetPath.replace(/^\//, "")}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseImageSize(size: TeachingArchitectureVisualPlan["size"]) {
  const [width, height] = size.split("x").map((value) => Number.parseInt(value, 10));
  return {
    width: Number.isFinite(width) ? width : 1792,
    height: Number.isFinite(height) ? height : 1024
  };
}

function clampInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}
