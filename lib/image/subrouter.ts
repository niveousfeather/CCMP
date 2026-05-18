export type Image2NormalizedImage = {
  url: string | null;
  b64_json: string | null;
  revised_prompt: string | null;
  model: string;
};

export type Image2GenerateInput = {
  generationId: string;
  prompt: string;
  aspectRatio: string;
  size: string;
  imageSize: string;
  count: number;
  image: File | null;
  signal: AbortSignal;
  onProviderRequestStart?: () => void;
};

export type Image2Attempt = {
  keyIndex: number;
  status?: number;
  error?: string;
  elapsedMs: number;
};

export type Image2GenerateResult = {
  provider: "subrouter";
  model: string;
  keyIndex: number;
  images: Image2NormalizedImage[];
  attempts: Image2Attempt[];
};

type Image2KeyConfig = {
  index: number;
  key: string;
};

type Image2KeyState = {
  inFlight: number;
  disabledUntil: number;
};

type Image2KeyLease = {
  keyIndex: number;
  key: string;
  release: () => void;
};

type Image2ProviderErrorOptions = {
  status?: number;
  retryable?: boolean;
};

class Image2ProviderError extends Error {
  readonly status?: number;
  readonly retryable: boolean;

  constructor(message: string, options: Image2ProviderErrorOptions = {}) {
    super(message);
    this.name = "Image2ProviderError";
    this.status = options.status;
    this.retryable = Boolean(options.retryable);
  }
}

const retryableStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504, 524]);
const keyStates = new Map<number, Image2KeyState>();
let roundRobinCursor = 0;

function clampInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function readBool(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  return fallback;
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function getImage2Keys(): Image2KeyConfig[] {
  return [1, 2, 3]
    .map((index) => ({ index, key: process.env[`IMAGE2_API_KEY_${index}`]?.trim() || "" }))
    .filter((item) => item.key);
}

function getKeyState(index: number) {
  const existing = keyStates.get(index);
  if (existing) return existing;
  const state = { inFlight: 0, disabledUntil: 0 };
  keyStates.set(index, state);
  return state;
}

export function resetImage2KeyPoolForTests() {
  keyStates.clear();
  roundRobinCursor = 0;
}

export function getImage2Config() {
  const baseUrl = (process.env.IMAGE2_BASE_URL || "https://subrouter.ai/v1").trim().replace(/\/$/, "");
  const model = (process.env.IMAGE2_MODEL || "gpt-image-2").trim();
  return {
    provider: (process.env.IMAGE2_PROVIDER || "subrouter").trim() || "subrouter",
    baseUrl,
    model,
    keys: getImage2Keys(),
    maxConcurrentPerKey: clampInt(process.env.IMAGE2_MAX_CONCURRENT_PER_KEY, 2, 1, 20),
    requestTimeoutMs: clampInt(process.env.IMAGE2_REQUEST_TIMEOUT_MS, 300_000, 10_000, 900_000),
    retryEnabled: readBool(process.env.IMAGE2_RETRY_ENABLED, true),
    keyCooldownMs: clampInt(process.env.IMAGE2_KEY_COOLDOWN_MS, 60_000, 5_000, 600_000)
  };
}

export function hasImage2ApiKeys() {
  return getImage2Keys().length > 0;
}

export function getImage2KeyPoolSnapshot() {
  const now = Date.now();
  return getImage2Keys().map((item) => {
    const state = getKeyState(item.index);
    return {
      keyIndex: item.index,
      inFlight: state.inFlight,
      disabledUntil: state.disabledUntil > now ? new Date(state.disabledUntil).toISOString() : null
    };
  });
}

function acquireImage2Key(excludedKeyIndexes: Set<number>): Image2KeyLease | null {
  const config = getImage2Config();
  const now = Date.now();
  const candidates = config.keys.filter((item) => {
    const state = getKeyState(item.index);
    return !excludedKeyIndexes.has(item.index) && state.disabledUntil <= now && state.inFlight < config.maxConcurrentPerKey;
  });
  if (!candidates.length) return null;

  const minInFlight = Math.min(...candidates.map((item) => getKeyState(item.index).inFlight));
  const orderedKeys = Array.from({ length: config.keys.length }, (_, offset) => config.keys[(roundRobinCursor + offset) % config.keys.length]);
  const selected =
    orderedKeys.find((item) => candidates.some((candidate) => candidate.index === item.index) && getKeyState(item.index).inFlight === minInFlight) ||
    candidates[0];

  const state = getKeyState(selected.index);
  state.inFlight += 1;
  roundRobinCursor = (config.keys.findIndex((item) => item.index === selected.index) + 1) % Math.max(config.keys.length, 1);

  let released = false;
  return {
    keyIndex: selected.index,
    key: selected.key,
    release: () => {
      if (released) return;
      released = true;
      state.inFlight = Math.max(0, state.inFlight - 1);
    }
  };
}

function disableImage2Key(keyIndex: number, status?: number) {
  const config = getImage2Config();
  const state = getKeyState(keyIndex);
  state.disabledUntil = Date.now() + config.keyCooldownMs;
  console.warn(`[ai:image2] key_event=temporarily_disabled provider=subrouter keyIndex=${keyIndex} status=${status || "-"} cooldownMs=${config.keyCooldownMs}`);
}

function createRequestSignal(parentSignal: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal.reason || new DOMException("Image2 parent task aborted", "AbortError"));
  if (parentSignal.aborted) abortFromParent();
  else parentSignal.addEventListener("abort", abortFromParent, { once: true });

  const timer = setTimeout(() => controller.abort(new DOMException("Image2 request timeout", "AbortError")), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parentSignal.removeEventListener("abort", abortFromParent);
    }
  };
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

function normalizeSubrouterImages(data: unknown, model: string): Image2NormalizedImage[] {
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
    .filter(Boolean) as Image2NormalizedImage[];
}

function appendImage2Fields(formData: FormData, input: Image2GenerateInput, model: string) {
  formData.append("model", model);
  formData.append("prompt", input.prompt);
  formData.append("size", input.size);
  formData.append("image_size", input.imageSize);
  formData.append("aspect_ratio", input.aspectRatio);
  formData.append("response_format", "b64_json");
  formData.append("n", String(input.count));
}

async function callSubrouterImage2Once({
  input,
  key,
  keyIndex,
  fetchImpl
}: {
  input: Image2GenerateInput;
  key: string;
  keyIndex: number;
  fetchImpl: typeof fetch;
}) {
  const config = getImage2Config();
  const endpointPath = input.image ? "/images/edits" : "/images/generations";
  const endpoint = joinUrl(config.baseUrl, endpointPath);
  const timeoutSignal = createRequestSignal(input.signal, config.requestTimeoutMs);
  const startedAt = Date.now();

  try {
    input.onProviderRequestStart?.();
    console.info(
      `[ai:image2] generation_id=${input.generationId} task_event=provider_request_started provider=subrouter endpoint=${endpointPath} model=${config.model} keyIndex=${keyIndex} timeoutMs=${config.requestTimeoutMs}`
    );

    const init: RequestInit = input.image
      ? {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: (() => {
            const formData = new FormData();
            appendImage2Fields(formData, input, config.model);
            formData.append("image", input.image!, input.image!.name);
            return formData;
          })(),
          signal: timeoutSignal.signal
        }
      : {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: config.model,
            prompt: input.prompt,
            size: input.size,
            image_size: input.imageSize,
            aspect_ratio: input.aspectRatio,
            response_format: "b64_json",
            n: input.count,
            metadata: {
              provider: "subrouter",
              orientation: input.aspectRatio,
              resolution: input.imageSize.toUpperCase()
            }
          }),
          signal: timeoutSignal.signal
        };

    const response = await fetchImpl(endpoint, init);
    const data = await response.json().catch(() => null);
    const elapsedMs = Date.now() - startedAt;
    console.info(
      `[ai:image2] generation_id=${input.generationId} task_event=provider_response_received provider=subrouter status=${response.status} model=${config.model} keyIndex=${keyIndex} elapsedMs=${elapsedMs}`
    );

    if (!response.ok) {
      const message = getProviderErrorMessage(data, response.status);
      throw new Image2ProviderError(message, { status: response.status, retryable: retryableStatuses.has(response.status) });
    }

    const images = normalizeSubrouterImages(data, config.model);
    if (!images.length) {
      throw new Image2ProviderError("Subrouter image2 returned no usable images.", { retryable: false });
    }

    return { images, elapsedMs };
  } finally {
    timeoutSignal.cleanup();
  }
}

function summarizeError(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 240);
  return String(error).slice(0, 240);
}

export async function generateSubrouterImage2(input: Image2GenerateInput, options: { fetchImpl?: typeof fetch } = {}): Promise<Image2GenerateResult> {
  const config = getImage2Config();
  if (config.provider !== "subrouter") {
    throw new Error(`IMAGE2_PROVIDER_UNSUPPORTED: ${config.provider}`);
  }
  if (!config.keys.length) {
    throw new Error("IMAGE2_API_KEYS_MISSING");
  }

  const attempts: Image2Attempt[] = [];
  const excludedKeyIndexes = new Set<number>();
  const maxAttempts = config.retryEnabled ? 2 : 1;
  let lastError: unknown = null;

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    const lease = acquireImage2Key(excludedKeyIndexes);
    if (!lease) break;

    try {
      const result = await callSubrouterImage2Once({
        input,
        key: lease.key,
        keyIndex: lease.keyIndex,
        fetchImpl: options.fetchImpl || fetch
      });
      attempts.push({ keyIndex: lease.keyIndex, status: 200, elapsedMs: result.elapsedMs });
      return {
        provider: "subrouter",
        model: config.model,
        keyIndex: lease.keyIndex,
        images: result.images,
        attempts
      };
    } catch (error) {
      lastError = error;
      const status = error instanceof Image2ProviderError ? error.status : undefined;
      const retryable = error instanceof Image2ProviderError ? error.retryable : error instanceof Error && error.name === "AbortError";
      attempts.push({ keyIndex: lease.keyIndex, status, error: summarizeError(error), elapsedMs: 0 });
      console.warn(
        `[ai:image2] generation_id=${input.generationId} task_event=provider_attempt_failed provider=subrouter keyIndex=${lease.keyIndex} status=${status || "-"} retryable=${retryable} error=${summarizeError(error)}`
      );

      if (retryable) {
        disableImage2Key(lease.keyIndex, status);
        excludedKeyIndexes.add(lease.keyIndex);
      } else {
        const nonRetryableError = error instanceof Error ? error : new Error(summarizeError(error));
        (nonRetryableError as Error & { attempts?: Image2Attempt[] }).attempts = attempts;
        throw nonRetryableError;
      }

      if (!config.retryEnabled) break;
    } finally {
      lease.release();
    }
  }

  const error = new Error(`IMAGE2_PROVIDER_FAILED: ${summarizeError(lastError)}`);
  (error as Error & { attempts?: Image2Attempt[] }).attempts = attempts;
  throw error;
}
