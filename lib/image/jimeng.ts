import { createHash, createHmac } from "node:crypto";

const DEFAULT_ENDPOINT = "https://visual.volcengineapi.com";
const DEFAULT_REGION = "cn-north-1";
const SERVICE = "cv";
const VERSION = "2022-08-31";
const ACTION = "CVProcess";
const JIMENG_IMAGE_21_REQ_KEY = "jimeng_high_aes_general_v21_L";

type VolcConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  region: string;
};

export type JimengImageResult = {
  images: Array<{
    url: string | null;
    b64_json: string | null;
    revised_prompt: string | null;
    model: string;
  }>;
  requestId?: string;
};

function getVolcConfig(): VolcConfig {
  const accessKeyId = process.env.VOLCENGINE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.VOLCENGINE_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("MISSING_VOLCENGINE_CREDENTIALS");
  }

  return {
    accessKeyId,
    secretAccessKey,
    endpoint: process.env.VOLCENGINE_VISUAL_ENDPOINT || DEFAULT_ENDPOINT,
    region: process.env.VOLCENGINE_REGION || DEFAULT_REGION
  };
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function getAmzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function getShortDate(amzDate: string) {
  return amzDate.slice(0, 8);
}

function buildSignedHeaders(config: VolcConfig, bodyText: string, amzDate: string, query: string) {
  const url = new URL(config.endpoint);
  const payloadHash = sha256Hex(bodyText);
  const canonicalHeaders = [
    "content-type:application/json",
    `host:${url.host}`,
    `x-content-sha256:${payloadHash}`,
    `x-date:${amzDate}`
  ].join("\n");
  const signedHeaders = "content-type;host;x-content-sha256;x-date";
  const canonicalRequest = ["POST", "/", query, canonicalHeaders, "", signedHeaders, payloadHash].join("\n");
  const credentialScope = `${getShortDate(amzDate)}/${config.region}/${SERVICE}/request`;
  const stringToSign = ["HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(config.secretAccessKey, getShortDate(amzDate)), config.region), SERVICE), "request");
  const signature = hmacHex(signingKey, stringToSign);

  return {
    Authorization: `HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "Content-Type": "application/json",
    "X-Content-Sha256": payloadHash,
    "X-Date": amzDate
  };
}

function getDimensionsForRatio(aspectRatio: string, resolution: string) {
  const normalizedResolution = ["1K", "2K", "4K"].includes(resolution) ? resolution : "1K";
  const map: Record<string, Record<string, { width: number; height: number }>> = {
    "1K": {
      "1:1": { width: 1024, height: 1024 },
      "16:9": { width: 1792, height: 1024 },
      "9:16": { width: 1024, height: 1792 },
      "4:3": { width: 1536, height: 1024 },
      "3:4": { width: 1024, height: 1536 }
    },
    "2K": {
      "1:1": { width: 2048, height: 2048 },
      "16:9": { width: 2560, height: 1440 },
      "9:16": { width: 1440, height: 2560 },
      "4:3": { width: 2048, height: 1536 },
      "3:4": { width: 1536, height: 2048 }
    },
    "4K": {
      "1:1": { width: 4096, height: 4096 },
      "16:9": { width: 3840, height: 2160 },
      "9:16": { width: 2160, height: 3840 },
      "4:3": { width: 4096, height: 3072 },
      "3:4": { width: 3072, height: 4096 }
    }
  };
  return map[normalizedResolution][aspectRatio] || map[normalizedResolution]["1:1"];
}

function getRequestId(data: unknown) {
  const record = (data || {}) as Record<string, unknown>;
  const metadata = (record.ResponseMetadata || record.responseMetadata || {}) as Record<string, unknown>;
  return String(metadata.RequestId || metadata.requestId || record.requestId || record.request_id || "");
}

function findStringDeep(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findStringDeep(item, keys);
        if (found) return found;
      }
    } else if (child && typeof child === "object") {
      const found = findStringDeep(child, keys);
      if (found) return found;
    }
  }
  return null;
}

function collectImageUrls(value: unknown, output: string[] = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (typeof item === "string" && /^https?:\/\//.test(item)) output.push(item);
      else collectImageUrls(item, output);
    });
    return output;
  }
  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if (typeof child === "string" && /^https?:\/\//.test(child) && /url|uri|image/i.test(key)) output.push(child);
    else collectImageUrls(child, output);
  }
  return output;
}

function collectBase64Images(value: unknown, output: string[] = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (typeof item === "string" && item.length > 1000 && !/^https?:\/\//.test(item)) output.push(item.replace(/^data:image\/\w+;base64,/, ""));
      else collectBase64Images(item, output);
    });
    return output;
  }
  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if (typeof child === "string" && /base64|binary_data/i.test(key)) output.push(child.replace(/^data:image\/\w+;base64,/, ""));
    else collectBase64Images(child, output);
  }
  return output;
}

export async function generateJimengImage21(input: {
  generationId: string;
  prompt: string;
  aspectRatio: string;
  resolution: string;
  count: number;
  signal: AbortSignal;
  onProviderRequestStart?: () => void;
}): Promise<JimengImageResult> {
  const config = getVolcConfig();
  const endpoint = new URL(config.endpoint);
  endpoint.searchParams.set("Action", ACTION);
  endpoint.searchParams.set("Version", VERSION);
  const query = Array.from(endpoint.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  endpoint.search = query;

  const dimensions = getDimensionsForRatio(input.aspectRatio, input.resolution);
  const body = {
    req_key: JIMENG_IMAGE_21_REQ_KEY,
    prompt: input.prompt,
    width: dimensions.width,
    height: dimensions.height,
    seed: -1,
    scale: 2.5,
    ddim_steps: 25,
    use_pre_llm: true,
    return_url: true,
    logo_info: { add_logo: false }
  };
  const bodyText = JSON.stringify(body);

  console.info(
    `[ai:image] generation_id=${input.generationId} task_event=provider_request_started provider=volc-jimeng action=${ACTION} reqKey=${JIMENG_IMAGE_21_REQ_KEY} size=${dimensions.width}x${dimensions.height}`
  );
  input.onProviderRequestStart?.();

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: buildSignedHeaders(config, bodyText, getAmzDate(), query),
    body: bodyText,
    signal: input.signal
  });
  const data = await response.json().catch(() => null);
  const requestId = getRequestId(data);
  const error = ((data as Record<string, unknown> | null)?.ResponseMetadata as Record<string, unknown> | undefined)?.Error as
    | Record<string, unknown>
    | undefined;

  console.info(
    `[ai:image] generation_id=${input.generationId} task_event=provider_response_received provider=volc-jimeng status=${response.status} requestId=${requestId || "-"}`
  );

  if (!response.ok || error) {
    console.error(
      `[ai:image] generation_id=${input.generationId} provider=volc-jimeng requestId=${requestId || "-"} code=${String(error?.Code || "-")} message=${String(error?.Message || "unknown")}`
    );
    throw new Error(String(error?.Message || "JIMENG_IMAGE_FAILED"));
  }

  const revisedPrompt = findStringDeep(data, ["revised_prompt", "final_prompt", "llm_result", "rephraser_result"]);
  const urls = collectImageUrls(data);
  const base64Images = collectBase64Images(data);
  const images = [
    ...urls.map((url) => ({ url, b64_json: null, revised_prompt: revisedPrompt, model: "jimeng-image-2.1" })),
    ...base64Images.map((b64) => ({ url: null, b64_json: b64, revised_prompt: revisedPrompt, model: "jimeng-image-2.1" }))
  ].slice(0, Math.max(1, input.count));

  return { images, requestId };
}
