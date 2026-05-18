import "server-only";

export const TRIPO_DEFAULT_BASE_URL = "https://api.tripo3d.com/v2/openapi";
export const TRIPO_DEFAULT_MODEL_VERSION = "v2.5-20250123";
export const TRIPO_DEFAULT_TIMEOUT_MS = 300000;

export type TripoModel3DConfig = {
  apiKey: string | null;
  baseUrl: string;
  defaultModelVersion: string;
  timeoutMs: number;
};

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function parseTimeoutMs(value: string | undefined) {
  if (!value) return TRIPO_DEFAULT_TIMEOUT_MS;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : TRIPO_DEFAULT_TIMEOUT_MS;
}

export function getTripoModel3DConfig(): TripoModel3DConfig {
  return {
    apiKey: process.env.TRIPO_API_KEY?.trim() || null,
    baseUrl: normalizeBaseUrl(process.env.TRIPO_BASE_URL?.trim() || TRIPO_DEFAULT_BASE_URL),
    defaultModelVersion: process.env.TRIPO_MODEL_VERSION?.trim() || TRIPO_DEFAULT_MODEL_VERSION,
    timeoutMs: parseTimeoutMs(process.env.TRIPO_TIMEOUT_MS)
  };
}

export function assertTripoModel3DConfigured(config = getTripoModel3DConfig()) {
  if (!config.apiKey) {
    throw new Error("TRIPO_API_KEY is not configured.");
  }

  return config;
}
