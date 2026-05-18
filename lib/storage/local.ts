import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { StorageAdapter, StorageObjectResult, UploadBufferInput, UploadFileInput } from "@/lib/storage/types";

const PUBLIC_PREFIX = "/mock-storage";

// TODO: This fallback is only for local development when OSS is not configured.
// Production should configure Aliyun OSS so generated assets do not depend on local disk.
function getPublicStorageRoot() {
  return path.join(process.cwd(), "public", PUBLIC_PREFIX.replace(/^\//, ""));
}

function normalizeKey(key: string) {
  return key
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function getFilePath(key: string) {
  const root = path.resolve(getPublicStorageRoot());
  const filePath = path.resolve(root, normalizeKey(key));
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid storage key");
  }
  return filePath;
}

function getPublicUrl(key: string) {
  return `${PUBLIC_PREFIX}/${normalizeKey(key).split(path.sep).join("/")}`;
}

async function writeObject(input: UploadBufferInput): Promise<StorageObjectResult> {
  const filePath = getFilePath(input.key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, input.buffer);
  return { key: normalizeKey(input.key), url: getPublicUrl(input.key), provider: "mock" };
}

export function createMockStorage(): StorageAdapter {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_STORAGE_FALLBACK !== "true") {
    throw new Error("OSS storage is required in production. Configure ALI_OSS_* env vars.");
  }

  return {
    provider: "mock",
    isConfigured: false,
    uploadBuffer: writeObject,
    async uploadFile(input: UploadFileInput): Promise<StorageObjectResult> {
      return writeObject({
        key: input.key,
        buffer: Buffer.from(await input.file.arrayBuffer()),
        contentType: input.contentType || input.file.type
      });
    },
    async getSignedUrl(key: string) {
      return getPublicUrl(key);
    },
    async getPublicOrSignedUrl(key: string) {
      return getPublicUrl(key);
    },
    async deleteObject(key: string) {
      await rm(getFilePath(key), { force: true });
      return true;
    }
  };
}
