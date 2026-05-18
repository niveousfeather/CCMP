export type StorageProvider = "oss" | "mock";

export type UploadBufferInput = {
  key: string;
  buffer: Buffer;
  contentType?: string;
};

export type UploadFileInput = {
  key: string;
  file: File;
  contentType?: string;
};

export type StorageObjectResult = {
  key: string;
  url: string | null;
  provider: StorageProvider;
};

export type StorageAdapter = {
  provider: StorageProvider;
  isConfigured: boolean;
  uploadBuffer(input: UploadBufferInput): Promise<StorageObjectResult>;
  uploadFile(input: UploadFileInput): Promise<StorageObjectResult>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string | null>;
  getPublicOrSignedUrl(key: string): Promise<string | null>;
  deleteObject(key: string): Promise<boolean>;
};
