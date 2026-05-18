import { createHmac } from "node:crypto";

import type { StorageAdapter, StorageObjectResult, UploadBufferInput, UploadFileInput } from "@/lib/storage/types";

type OssConfig = {
  region?: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
};

function getConfig(): OssConfig | null {
  const bucket = process.env.ALI_OSS_BUCKET;
  const accessKeyId = process.env.ALI_OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALI_OSS_ACCESS_KEY_SECRET;
  const endpoint = process.env.ALI_OSS_ENDPOINT;

  if (!bucket || !accessKeyId || !accessKeySecret || !endpoint) {
    return null;
  }

  return {
    region: process.env.ALI_OSS_REGION,
    bucket,
    accessKeyId,
    accessKeySecret,
    endpoint
  };
}

function normalizeEndpoint(endpoint: string) {
  return endpoint.startsWith("http://") || endpoint.startsWith("https://")
    ? endpoint.replace(/\/$/, "")
    : `https://${endpoint.replace(/\/$/, "")}`;
}

function getObjectUrl(config: OssConfig, key: string) {
  const endpoint = normalizeEndpoint(config.endpoint);
  const host = new URL(endpoint).host;
  if (host.startsWith(`${config.bucket}.`)) {
    return `${endpoint}/${encodeURIComponentKey(key)}`;
  }
  return `${new URL(endpoint).protocol}//${config.bucket}.${host}/${encodeURIComponentKey(key)}`;
}

function encodeURIComponentKey(key: string) {
  return key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function sign(config: OssConfig, method: string, contentType: string, date: string, resource: string) {
  const stringToSign = `${method}\n\n${contentType}\n${date}\n${resource}`;
  return createHmac("sha1", config.accessKeySecret).update(stringToSign).digest("base64");
}

async function uploadBuffer(config: OssConfig, input: UploadBufferInput): Promise<StorageObjectResult> {
  const contentType = input.contentType || "application/octet-stream";
  const date = new Date().toUTCString();
  const resource = `/${config.bucket}/${input.key}`;
  const signature = sign(config, "PUT", contentType, date, resource);
  const url = getObjectUrl(config, input.key);
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `OSS ${config.accessKeyId}:${signature}`,
      Date: date,
      "Content-Type": contentType
    },
    body: new Uint8Array(input.buffer)
  });

  if (!response.ok) {
    throw new Error(`OSS upload failed: ${response.status}`);
  }

  return { key: input.key, url, provider: "oss" };
}

function getSignedUrl(config: OssConfig, key: string, expiresInSeconds = 3600) {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const resource = `/${config.bucket}/${key}`;
  const stringToSign = `GET\n\n\n${expires}\n${resource}`;
  const signature = createHmac("sha1", config.accessKeySecret).update(stringToSign).digest("base64");
  const url = new URL(getObjectUrl(config, key));
  url.searchParams.set("OSSAccessKeyId", config.accessKeyId);
  url.searchParams.set("Expires", String(expires));
  url.searchParams.set("Signature", signature);
  return url.toString();
}

export function createOssStorage(): StorageAdapter | null {
  const config = getConfig();
  if (!config) return null;

  return {
    provider: "oss",
    isConfigured: true,
    uploadBuffer: (input) => uploadBuffer(config, input),
    async uploadFile(input: UploadFileInput) {
      return uploadBuffer(config, {
        key: input.key,
        buffer: Buffer.from(await input.file.arrayBuffer()),
        contentType: input.contentType || input.file.type
      });
    },
    async getSignedUrl(key: string, expiresInSeconds?: number) {
      return getSignedUrl(config, key, expiresInSeconds);
    },
    async getPublicOrSignedUrl(key: string) {
      return getSignedUrl(config, key);
    },
    async deleteObject(key: string) {
      const date = new Date().toUTCString();
      const resource = `/${config.bucket}/${key}`;
      const signature = sign(config, "DELETE", "", date, resource);
      const response = await fetch(getObjectUrl(config, key), {
        method: "DELETE",
        headers: {
          Authorization: `OSS ${config.accessKeyId}:${signature}`,
          Date: date
        }
      });
      return response.ok || response.status === 404;
    }
  };
}
