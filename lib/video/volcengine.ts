import { createHash, createHmac } from "node:crypto";

import { createRetryableGenerationErrorFromStatus } from "@/lib/generation/retry";
import { getVideoModelCapability } from "@/lib/video/config";

const DEFAULT_ENDPOINT = "https://visual.volcengineapi.com";
const DEFAULT_REGION = "cn-north-1";
const SERVICE = "cv";
const VERSION = "2022-08-31";
const SUBMIT_ACTION = "CVSync2AsyncSubmitTask";
const QUERY_ACTION = "CVSync2AsyncGetResult";

type VolcConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  region: string;
};

type VolcRequestOptions = {
  action: string;
  body: Record<string, unknown>;
};

export type SubmitVideoTaskInput = {
  model: string;
  prompt: string;
  resolution: string;
  duration?: string;
  ratio?: string;
  imageUrl?: string | null;
};

export type VideoTaskProviderResult = {
  taskId?: string;
  status: "pending" | "succeeded" | "failed";
  videoUrl?: string | null;
  coverUrl?: string | null;
  errorMessage?: string | null;
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
    `content-type:application/json`,
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

async function requestVolc<T>({ action, body }: VolcRequestOptions): Promise<T> {
  const config = getVolcConfig();
  const endpoint = new URL(config.endpoint);
  endpoint.searchParams.set("Action", action);
  endpoint.searchParams.set("Version", VERSION);
  const query = Array.from(endpoint.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  endpoint.search = query;

  const bodyText = JSON.stringify(body);
  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: buildSignedHeaders(config, bodyText, getAmzDate(), query),
    body: bodyText
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || data?.ResponseMetadata?.Error) {
    const error = data?.ResponseMetadata?.Error;
    const requestId = data?.ResponseMetadata?.RequestId || "-";
    const message = error?.Message || `VOLCENGINE_${action}_FAILED`;
    console.error(
      `[video:volc] action=${action} status=${response.status} requestId=${requestId} code=${error?.Code || "-"} message=${message}`
    );
    const retryableError = createRetryableGenerationErrorFromStatus({
      code: typeof error?.Code === "string" ? error.Code : `HTTP_${response.status}`,
      message,
      provider: "volcengine-video",
      retryAfter: response.headers.get("retry-after"),
      status: response.status
    });
    if (retryableError) throw retryableError;
    throw new Error(message);
  }

  return data as T;
}

function getDurationSeconds(duration?: string) {
  const parsed = Number.parseInt(duration || "5s", 10);
  return Number.isFinite(parsed) ? parsed : 5;
}

function normalizeStatus(value: unknown): VideoTaskProviderResult["status"] {
  const status = String(value || "").toLowerCase();
  if (["done", "success", "succeeded", "completed"].includes(status)) return "succeeded";
  if (["failed", "fail", "error"].includes(status)) return "failed";
  return "pending";
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

function getResultPayload(data: unknown) {
  const record = (data || {}) as Record<string, unknown>;
  return (record.Result || record.result || record.data || record.Data || record.ResponseMetadata || record) as Record<string, unknown>;
}

export async function submitVolcVideoTask(input: SubmitVideoTaskInput) {
  const capability = getVideoModelCapability(input.model);
  if (!capability) throw new Error("UNSUPPORTED_VIDEO_MODEL");
  if (!capability.supportedResolutions.includes(input.resolution as "720P")) throw new Error("UNSUPPORTED_VIDEO_RESOLUTION");

  const body: Record<string, unknown> = {
    req_key: input.imageUrl ? capability.imageReqKey : capability.textReqKey,
    prompt: input.prompt,
    seed: -1,
    aspect_ratio: input.ratio || "16:9",
    duration: getDurationSeconds(input.duration),
    resolution: "720p"
  };

  if (input.imageUrl) {
    body.image_urls = [input.imageUrl];
  }

  const data = await requestVolc<Record<string, unknown>>({ action: SUBMIT_ACTION, body });
  const payload = getResultPayload(data);
  const taskId =
    findStringDeep(payload, ["task_id", "taskId", "id"]) ||
    findStringDeep(data, ["task_id", "taskId", "id"]);

  if (!taskId) {
    console.error("[video:volc] submit_missing_task_id");
    throw new Error("VIDEO_TASK_ID_MISSING");
  }

  const requestId = ((data.ResponseMetadata || {}) as Record<string, unknown>).RequestId || "-";
  console.info(`[video:volc] submit_success requestId=${requestId} taskId=${taskId.slice(0, 8)}...`);
  return taskId;
}

export async function queryVolcVideoTask(taskId: string, reqKey = "jimeng_t2v_v30"): Promise<VideoTaskProviderResult> {
  const data = await requestVolc<Record<string, unknown>>({
    action: QUERY_ACTION,
    body: { task_id: taskId, req_key: reqKey }
  });
  const payload = getResultPayload(data);
  const status = normalizeStatus(
    payload.status || payload.Status || payload.task_status || payload.taskStatus || payload.state || payload.State
  );
  const videoUrl = findStringDeep(payload, ["video_url", "videoUrl", "url", "result_url", "resultUrl"]);
  const coverUrl = findStringDeep(payload, ["cover_url", "coverUrl", "cover_image_url", "coverImageUrl", "image_url"]);
  const errorMessage = findStringDeep(payload, ["message", "error_msg", "errorMessage", "reason"]);
  const requestId = ((data.ResponseMetadata || {}) as Record<string, unknown>).RequestId || "-";
  console.info(`[video:volc] query_result requestId=${requestId} taskId=${taskId.slice(0, 8)}... status=${status} hasVideo=${Boolean(videoUrl)}`);

  return { taskId, status, videoUrl, coverUrl, errorMessage };
}
