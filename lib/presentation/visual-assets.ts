import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";

import { generateJimengImage21 } from "@/lib/image/jimeng";
import type { PresentationDeck, PresentationSlide, PresentationVisualAsset } from "@/lib/presentation/types";

type SearchCandidate = {
  url: string;
  title?: string;
};

type SearxngImage = {
  img_src?: unknown;
  thumbnail_src?: unknown;
  url?: unknown;
  title?: unknown;
};

type NormalizedGeneratedImage = {
  url: string | null;
  b64_json: string | null;
  model: string;
};

const DEFAULT_SEARXNG_ENDPOINT = "http://127.0.0.1:8080/search";
const DEFAULT_USER_AGENT = "NexusAI-PresentationAssets/1.0";
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/i
];

function withTimeout(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, clear: () => clearTimeout(timer) };
}

function getBoundedInt(value: string | number | undefined, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function getAssetConfig() {
  return {
    searchEnabled: process.env.PRESENTATION_IMAGE_SEARCH_ENABLED !== "false",
    generationEnabled: process.env.PRESENTATION_IMAGE_GENERATION_ENABLED !== "false",
    searxngEndpoint: process.env.PRESENTATION_IMAGE_SEARCH_ENDPOINT || process.env.AGENT_SEARXNG_ENDPOINT || DEFAULT_SEARXNG_ENDPOINT,
    searchTimeoutMs: getBoundedInt(process.env.PRESENTATION_IMAGE_SEARCH_TIMEOUT_MS || process.env.PRESENTATION_IMAGE_TIMEOUT_MS, 8000, 2000, 30_000),
    searchRetries: getBoundedInt(process.env.PRESENTATION_IMAGE_SEARCH_RETRIES, 2, 1, 5),
    searchMaxCandidates: getBoundedInt(process.env.PRESENTATION_IMAGE_SEARCH_MAX_CANDIDATES, 12, 4, 30),
    generationTimeoutMs: getBoundedInt(process.env.PRESENTATION_IMAGE_GENERATION_TIMEOUT_MS, 60_000, 5000, 180_000),
    maxSlides: getBoundedInt(process.env.PRESENTATION_IMAGE_MAX_SLIDES, 3, 0, 8),
    maxBytes: getBoundedInt(process.env.PRESENTATION_IMAGE_MAX_BYTES, 3_000_000, 128_000, 8_000_000),
    userAgent: process.env.PRESENTATION_IMAGE_USER_AGENT || process.env.AGENT_WEB_USER_AGENT || DEFAULT_USER_AGENT,
    generatedModel: process.env.PRESENTATION_IMAGE_GENERATION_MODEL || "jimeng-image-2.1"
  };
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function getXheaiRootUrl() {
  return (process.env.XHEAI_BASE_URL || "https://api.xheai.cc").replace(/\/v1\/?$/, "");
}

function joinOpenAiImageUrl(path: string) {
  return joinUrl(getXheaiRootUrl(), `/v1/${path.replace(/^\//, "")}`);
}

function normalizeOpenAiImages(data: unknown, model: string): NormalizedGeneratedImage[] {
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
      if (!url && !b64Json) return null;
      return { url, b64_json: b64Json, model };
    })
    .filter(Boolean) as NormalizedGeneratedImage[];
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollOpenAiImageTask(taskId: string, model: string, apiKey: string, signal: AbortSignal) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 55_000) {
    if (signal.aborted) throw new DOMException("Presentation image generation aborted during polling", "AbortError");
    await sleep(2500);
    const response = await fetch(joinOpenAiImageUrl(`/images/generations/${encodeURIComponent(taskId)}`), {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`XHEAI_IMAGE_TASK_HTTP_${response.status}`);
    const images = normalizeOpenAiImages(data, model);
    if (images.length) return images;
    const status = typeof (data as { status?: unknown } | null)?.status === "string" ? String((data as { status: string }).status) : "";
    if (status === "failed") throw new Error("XHEAI_IMAGE_TASK_FAILED");
  }
  return [];
}

function isPrivateOrLocalHost(hostname: string) {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function isPrivateAddress(address: string) {
  return (
    /^127\./.test(address) ||
    /^10\./.test(address) ||
    /^192\.168\./.test(address) ||
    /^169\.254\./.test(address) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(address) ||
    address === "0.0.0.0" ||
    address === "::1" ||
    /^fc/i.test(address) ||
    /^fd/i.test(address) ||
    /^fe80:/i.test(address)
  );
}

async function assertPublicHttpUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("UNSUPPORTED_PROTOCOL");
  if (isPrivateOrLocalHost(url.hostname)) throw new Error("PRIVATE_HOST_BLOCKED");

  const records = await lookup(url.hostname, { all: true }).catch(() => []);
  if (records.some((record) => isPrivateAddress(record.address))) throw new Error("PRIVATE_DNS_BLOCKED");
  return url;
}

function isValidHttpEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildVisualQuery(slide: PresentationSlide, deck: PresentationDeck) {
  const explicit = safeString(slide.imageQuery) || safeString(slide.visualBrief);
  const base = explicit || [slide.title, slide.subtitle, slide.bullets?.[0], deck.title].map(safeString).filter(Boolean).join(" ");
  const styleHint =
    deck.style === "academic"
      ? "academic presentation figure research diagram high quality"
      : deck.style === "teaching"
        ? "classroom teaching slide visual clear educational illustration"
        : "presentation photo visual high quality";
  return `${base} ${styleHint}`.trim().slice(0, 180);
}

function shouldResolveVisual(slide: PresentationSlide) {
  return (
    ["cover", "section", "content", "two_column", "imageText"].includes(slide.type) ||
    ["academic_cover", "teaching_cover", "section_divider", "image_explanation"].includes(String(slide.layoutPreset || ""))
  );
}

function normalizeImageResult(value: unknown): SearchCandidate | null {
  const item = (value || {}) as SearxngImage;
  const url = safeString(item.img_src) || safeString(item.thumbnail_src) || safeString(item.url);
  if (!url) return null;
  return { url, title: safeString(item.title) || undefined };
}

async function searchImageCandidates(query: string, signal: AbortSignal): Promise<SearchCandidate[]> {
  const config = getAssetConfig();
  if (!config.searchEnabled || !isValidHttpEndpoint(config.searxngEndpoint)) return [];

  const url = new URL(config.searxngEndpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("categories", "images");
  url.searchParams.set("language", "zh-CN");
  url.searchParams.set("safesearch", "1");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": config.userAgent
    },
    signal,
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`IMAGE_SEARCH_HTTP_${response.status}`);
  const data = (await response.json().catch(() => null)) as { results?: unknown[] } | null;
  return (Array.isArray(data?.results) ? data.results : []).map(normalizeImageResult).filter(Boolean).slice(0, config.searchMaxCandidates) as SearchCandidate[];
}

function getImageExtension(contentType: string, url: URL): PresentationVisualAsset["extension"] | null {
  if (/image\/png/i.test(contentType) || /\.png(?:$|\?)/i.test(url.toString())) return "png";
  if (/image\/jpe?g/i.test(contentType) || /\.jpe?g(?:$|\?)/i.test(url.toString())) return "jpg";
  return null;
}

async function downloadVisualAsset(candidate: SearchCandidate, query: string, signal: AbortSignal): Promise<PresentationVisualAsset | null> {
  const config = getAssetConfig();
  const url = await assertPublicHttpUrl(candidate.url);
  const response = await fetch(url.toString(), {
    headers: {
      Accept: "image/png,image/jpeg;q=0.9,*/*;q=0.2",
      "User-Agent": config.userAgent
    },
    signal,
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`IMAGE_DOWNLOAD_HTTP_${response.status}`);

  const contentType = response.headers.get("content-type") || "";
  const extension = getImageExtension(contentType, url);
  if (!extension) throw new Error(`UNSUPPORTED_IMAGE_TYPE_${contentType || "unknown"}`);

  const contentLength = Number(response.headers.get("content-length") || "0");
  if (contentLength > config.maxBytes) throw new Error("IMAGE_TOO_LARGE");

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > config.maxBytes || bytes.byteLength < 1024) throw new Error("INVALID_IMAGE_SIZE");

  return {
    buffer: Buffer.from(bytes),
    mimeType: extension === "png" ? "image/png" : "image/jpeg",
    extension,
    source: "web_search",
    alt: candidate.title || query,
    sourceUrl: url.toString()
  };
}

async function fetchSearchedVisualAsset(query: string, signal: AbortSignal): Promise<PresentationVisualAsset | null> {
  const config = getAssetConfig();
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= config.searchRetries; attempt += 1) {
    try {
      const candidates = await searchImageCandidates(query, signal);
      for (const candidate of candidates) {
        try {
          const asset = await downloadVisualAsset(candidate, query, signal);
          if (asset) return asset;
        } catch (error) {
          console.info(`[presentation:assets] searched image skipped reason=${error instanceof Error ? error.message : "unknown"}`);
          lastError = error;
        }
      }
    } catch (error) {
      lastError = error;
      console.warn(`[presentation:assets] image search attempt=${attempt} failed error=${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  if (lastError) console.info(`[presentation:assets] image search exhausted query="${query.slice(0, 80)}"`);
  return null;
}

async function requestXheaiImage({
  query,
  style,
  model,
  apiKey,
  signal,
  useImageSize
}: {
  query: string;
  style?: PresentationDeck["style"];
  model: string;
  apiKey: string;
  signal: AbortSignal;
  useImageSize: boolean;
}) {
  const stylePrompt =
    style === "academic"
      ? "Use a clean academic research visual style suitable for a paper talk."
      : style === "teaching"
        ? "Use a clear classroom teaching visual style suitable for courseware."
        : "Use a polished presentation visual style.";
  const body = {
    model,
    prompt: `${query}\n\n${stylePrompt} Create a clean 16:9 presentation visual. No watermark, no text, no logo.`,
    aspect_ratio: "16:9",
    [useImageSize ? "image_size" : "size"]: useImageSize ? "1k" : "1792x1024",
    response_format: "url",
    metadata: { resolution: "1K", orientation: "landscape" },
    n: 1
  };
  const response = await fetch(joinOpenAiImageUrl("/images/generations"), {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`XHEAI_IMAGE_HTTP_${response.status}`);
  const taskId = getOpenAiImageTaskId(data);
  return taskId ? pollOpenAiImageTask(taskId, model, apiKey, signal) : normalizeOpenAiImages(data, model);
}

async function generateVisualAsset(query: string, signal: AbortSignal, style?: PresentationDeck["style"]): Promise<PresentationVisualAsset | null> {
  const config = getAssetConfig();
  if (!config.generationEnabled) return null;

  if (config.generatedModel !== "jimeng-image-2.1") {
    const apiKey = process.env.XHEAI_API_KEY;
    if (!apiKey) return null;

    try {
      let images = await requestXheaiImage({ query, style, model: config.generatedModel, apiKey, signal, useImageSize: false });
      if (!images.length) {
        images = await requestXheaiImage({ query, style, model: config.generatedModel, apiKey, signal, useImageSize: true });
      }
      const image = images[0];
      if (!image) return null;
      if (image.b64_json) {
        return {
          buffer: Buffer.from(image.b64_json, "base64"),
          mimeType: "image/png",
          extension: "png",
          source: "generated",
          alt: query
        };
      }
      if (image.url) {
        return downloadVisualAsset({ url: image.url, title: query }, query, signal).then((asset) =>
          asset ? { ...asset, source: "generated" as const } : null
        );
      }
    } catch (error) {
      console.warn(`[presentation:assets] xheai image generation failed error=${error instanceof Error ? error.message : "unknown"}`);
    }

    return null;
  }

  try {
    const stylePrompt =
      style === "academic"
        ? "Use a clean academic research visual style suitable for a paper talk."
        : style === "teaching"
          ? "Use a clear classroom teaching visual style suitable for courseware."
          : "Use a polished presentation visual style.";
    const result = await generateJimengImage21({
      generationId: `presentation-${randomUUID()}`,
      prompt: `${query}\n\n${stylePrompt} Create a clean 16:9 presentation visual. No watermark, no text, no logo.`,
      aspectRatio: "16:9",
      resolution: "1K",
      count: 1,
      signal
    });
    const image = result.images[0];
    if (!image) return null;
    if (image.b64_json) {
      return {
        buffer: Buffer.from(image.b64_json, "base64"),
        mimeType: "image/png",
        extension: "png",
        source: "generated",
        alt: query
      };
    }
    if (image.url) {
      return downloadVisualAsset({ url: image.url, title: query }, query, signal).then((asset) =>
        asset ? { ...asset, source: "generated" as const } : null
      );
    }
  } catch (error) {
    console.warn(`[presentation:assets] image generation failed error=${error instanceof Error ? error.message : "unknown"}`);
  }

  return null;
}

async function resolveSlideVisualAsset(slide: PresentationSlide, deck: PresentationDeck): Promise<PresentationVisualAsset | null> {
  const query = buildVisualQuery(slide, deck);
  if (!query) return null;

  const config = getAssetConfig();
  const { controller, clear } = withTimeout(config.searchTimeoutMs);
  try {
    const searched = await fetchSearchedVisualAsset(query, controller.signal);
    if (searched) return searched;
  } catch (error) {
    console.warn(`[presentation:assets] image search failed error=${error instanceof Error ? error.message : "unknown"}`);
  } finally {
    clear();
  }

  const generated = withTimeout(config.generationTimeoutMs);
  try {
    return await generateVisualAsset(query, generated.controller.signal, deck.style);
  } finally {
    generated.clear();
  }
}

export async function enrichPresentationDeckVisuals(deck: PresentationDeck): Promise<PresentationDeck> {
  const config = getAssetConfig();
  if (config.maxSlides <= 0) return deck;

  let resolved = 0;
  const slides: PresentationSlide[] = [];
  for (const slide of deck.slides) {
    if (slide.visualAsset || resolved >= config.maxSlides || !shouldResolveVisual(slide)) {
      slides.push(slide);
      continue;
    }

    const asset = await resolveSlideVisualAsset(slide, deck);
    if (asset) {
      resolved += 1;
      console.info(`[presentation:assets] visual resolved slide="${slide.title}" source=${asset.source} bytes=${asset.buffer.length}`);
      slides.push({ ...slide, visualAsset: asset });
    } else {
      slides.push(slide);
    }
  }

  return { ...deck, slides };
}
