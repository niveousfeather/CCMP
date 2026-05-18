import "server-only";

import { assertTripoModel3DConfigured, getTripoModel3DConfig, TripoModel3DConfig } from "@/lib/model3d/config";
import { buildTripoExportPayload, buildTripoTaskPayload, NexusModel3DCreateRequest, NexusModel3DExportRequest, TripoModel3DTaskPayload } from "@/lib/model3d/tasks";

export type TripoTaskStatus = "queued" | "running" | "success" | "failed" | "cancelled" | "unknown" | "banned" | "expired" | string;

export type TripoTaskResponse = {
  code?: number;
  data?: {
    create_time?: number;
    error_code?: number;
    error_msg?: string;
    output?: Record<string, unknown>;
    progress?: number;
    status?: TripoTaskStatus;
    task_id?: string;
    type?: string;
  };
  message?: string;
  suggestion?: string;
  traceId?: string | null;
};

export type TripoUploadResponse = {
  code?: number;
  data?: {
    file_token?: string;
    image_token?: string;
    token?: string;
    url?: string;
  };
  message?: string;
  traceId?: string | null;
};

export class TripoModel3DClient {
  private readonly config: TripoModel3DConfig;

  constructor(config = assertTripoModel3DConfigured()) {
    this.config = config;
  }

  createTask(request: NexusModel3DCreateRequest) {
    const payload = buildTripoTaskPayload(request, this.config.defaultModelVersion);
    return this.postJson<TripoTaskResponse>("/task", payload);
  }

  createExportTask(request: NexusModel3DExportRequest) {
    const payload = buildTripoExportPayload(request);
    return this.postJson<TripoTaskResponse>("/task", payload);
  }

  getTask(taskId: string) {
    return this.getJson<TripoTaskResponse>(`/task/${encodeURIComponent(taskId)}`);
  }

  getWallet() {
    return this.getJson<Record<string, unknown>>("/user/balance");
  }

  async uploadFile(file: File): Promise<TripoUploadResponse> {
    const formData = new FormData();
    formData.append("file", file, file.name);

    return this.requestJson<TripoUploadResponse>("/upload", {
      body: formData,
      method: "POST"
    });
  }

  private async postJson<T>(path: string, payload: TripoModel3DTaskPayload): Promise<T> {
    return this.requestJson<T>(path, {
      body: JSON.stringify(payload),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
  }

  private async getJson<T>(path: string): Promise<T> {
    return this.requestJson<T>(path, { method: "GET" });
  }

  private async requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          ...(init.headers || {})
        },
        signal: controller.signal
      });
      const text = await response.text();
      const json = text ? JSON.parse(text) : {};
      const traceId = response.headers.get("x-tripo-trace-id");
      if (typeof json === "object" && json && traceId) {
        (json as { traceId?: string }).traceId = traceId;
      }

      if (!response.ok) {
        throw new TripoModel3DRequestError(extractTripoErrorMessage(json, response.status), response.status, json, traceId);
      }

      if (isTripoErrorEnvelope(json)) {
        throw new TripoModel3DRequestError(extractTripoErrorMessage(json, response.status), response.status, json, traceId);
      }

      return json as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class TripoModel3DRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: unknown,
    readonly traceId: string | null = null
  ) {
    super(message);
    this.name = "TripoModel3DRequestError";
  }
}

export function createTripoModel3DClient(config = getTripoModel3DConfig()) {
  return new TripoModel3DClient(assertTripoModel3DConfigured(config));
}

function extractTripoErrorMessage(value: unknown, status: number) {
  if (typeof value === "object" && value && "message" in value && typeof value.message === "string") {
    return value.message;
  }

  return `Tripo API request failed with status ${status}.`;
}

function isTripoErrorEnvelope(value: unknown) {
  if (typeof value !== "object" || !value || !("code" in value)) return false;
  const code = (value as { code?: unknown }).code;
  return typeof code === "number" && code !== 0;
}
