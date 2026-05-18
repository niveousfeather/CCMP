import { createMockStorage } from "@/lib/storage/local";
import { createOssStorage } from "@/lib/storage/oss";
import type { StorageAdapter, StorageObjectResult, UploadBufferInput, UploadFileInput } from "@/lib/storage/types";

export type { StorageAdapter, StorageObjectResult, UploadBufferInput, UploadFileInput };

export function getStorageAdapter(): StorageAdapter {
  const oss = createOssStorage();
  if (oss) return oss;
  return createMockStorage();
}

export async function uploadBuffer(input: UploadBufferInput): Promise<StorageObjectResult> {
  return getStorageAdapter().uploadBuffer(input);
}

export async function uploadFile(input: UploadFileInput): Promise<StorageObjectResult> {
  return getStorageAdapter().uploadFile(input);
}

export async function getSignedUrl(key: string, expiresInSeconds?: number) {
  return getStorageAdapter().getSignedUrl(key, expiresInSeconds);
}

export async function getPublicOrSignedUrl(key: string) {
  return getStorageAdapter().getPublicOrSignedUrl(key);
}

export async function deleteObject(key: string) {
  return getStorageAdapter().deleteObject(key);
}

// Compatibility shim for earlier image-generation code. New code should call uploadBuffer/uploadFile directly.
export async function upload(input: {
  key: string;
  contentType?: string;
  sourceUrl?: string | null;
  b64_json?: string | null;
}): Promise<StorageObjectResult> {
  if (input.b64_json) {
    return uploadBuffer({
      key: input.key,
      buffer: Buffer.from(input.b64_json, "base64"),
      contentType: input.contentType || "image/png"
    });
  }

  if (input.sourceUrl) {
    const response = await fetch(input.sourceUrl);
    if (!response.ok) {
      throw new Error(`Unable to fetch source image: ${response.status}`);
    }
    return uploadBuffer({
      key: input.key,
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: input.contentType || response.headers.get("content-type") || "image/png"
    });
  }

  return { key: input.key, url: null, provider: getStorageAdapter().provider };
}
