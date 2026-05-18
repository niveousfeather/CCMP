import type { GenerationKind } from "@/lib/generation/concurrency";

export class RetryableGenerationError extends Error {
  constructor(
    message: string,
    readonly options: {
      code?: string;
      provider?: string;
      retryAfterMs?: number;
      status?: number;
    } = {}
  ) {
    super(message);
    this.name = "RetryableGenerationError";
  }
}

const retryableStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const retryableMessagePattern =
  /(concurr|并发|rate.?limit|too many|429|queue|queued|busy|overload|capacity|throttl|timeout|timed out|try again|temporar|unavailable|502|503|504|网关|超时|繁忙|排队|稍后)/i;

const nonRetryableMessagePattern =
  /(insufficient|balance|quota|billing|api.?key|unauthori[sz]ed|forbidden|invalid|bad request|unsupported|policy|banned|sensitive|余额|额度|密钥|权限|认证|参数|不支持|违规|敏感|欠费)/i;

export function createRetryableGenerationErrorFromStatus({
  code,
  message,
  provider,
  retryAfter,
  status
}: {
  code?: string;
  message?: string;
  provider?: string;
  retryAfter?: string | null;
  status: number;
}) {
  const text = [code, message, status].filter(Boolean).join(": ");
  if (!isRetryableStatusOrMessage(status, text)) return null;
  return new RetryableGenerationError(text || `Provider request retryable status ${status}.`, {
    code,
    provider,
    retryAfterMs: parseRetryAfterMs(retryAfter),
    status
  });
}

export function isRetryableGenerationError(error: unknown) {
  if (error instanceof RetryableGenerationError) return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!message || nonRetryableMessagePattern.test(message)) return false;
  return retryableMessagePattern.test(message);
}

export function shouldRetryGenerationError(error: unknown, attempt: number, kind: GenerationKind) {
  return attempt < getGenerationMaxRetries(kind) && isRetryableGenerationError(error);
}

export function getGenerationRetryDelayMs(kind: GenerationKind, attempt: number, error?: unknown) {
  const retryAfterMs = error instanceof RetryableGenerationError ? error.options.retryAfterMs : undefined;
  if (retryAfterMs && retryAfterMs > 0) return Math.min(retryAfterMs, 180_000);

  const base = getGenerationRetryBaseMs(kind);
  const delay = base * Math.pow(2, attempt);
  const jitter = Math.round(Math.random() * Math.min(2500, base * 0.4));
  return Math.min(delay + jitter, 180_000);
}

export function getGenerationRetryNotice(kind: GenerationKind, attempt: number) {
  const maxAttempts = getGenerationMaxRetries(kind) + 1;
  const nextAttempt = Math.min(attempt + 2, maxAttempts);
  const label = kind === "image" ? "图片生成" : kind === "video" ? "视频生成" : "3D 生成";
  return `${label}服务繁忙，已自动排队重试（第 ${nextAttempt}/${maxAttempts} 次）。`;
}

export function getGenerationMaxRetries(kind: GenerationKind) {
  const specific = process.env[`GENERATION_${kind.toUpperCase()}_MAX_RETRIES`];
  const fallback = process.env.GENERATION_QUEUE_MAX_RETRIES;
  return clampInt(specific || fallback, 3, 0, 8);
}

function getGenerationRetryBaseMs(kind: GenerationKind) {
  const specific = process.env[`GENERATION_${kind.toUpperCase()}_RETRY_BASE_MS`];
  const fallback = process.env.GENERATION_QUEUE_RETRY_BASE_MS;
  const defaultValue = kind === "model3d" ? 20_000 : 12_000;
  return clampInt(specific || fallback, defaultValue, 1000, 120_000);
}

function isRetryableStatusOrMessage(status: number, message: string) {
  if (retryableStatuses.has(status)) return true;
  if (status >= 400 && status < 500) return false;
  if (nonRetryableMessagePattern.test(message)) return false;
  return retryableMessagePattern.test(message);
}

function parseRetryAfterMs(value: string | null | undefined) {
  if (!value) return undefined;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return undefined;
}

function clampInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}
