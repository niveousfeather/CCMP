import type {
  AcademicPptLogsResponse,
  AcademicPptPreviewResponse,
  AcademicPptRecentTasksResponse,
  AcademicPptSettings,
  AcademicPptTaskSnapshot,
  CancelAcademicPptTaskResponse,
  CreateAcademicPptTaskResponse,
  ResumeAcademicPptTaskResponse
} from "@/lib/smart-tools/academic-ppt/types";

export class AcademicPptApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AcademicPptApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseAcademicPptResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { message?: string; code?: string };
  if (!response.ok) {
    throw new AcademicPptApiError(data.message || "学术 PPT 任务接口暂不可用。", response.status, data.code);
  }
  return data;
}

export async function createAcademicPptTask(
  payload: { file: File; settings: AcademicPptSettings },
  options?: { signal?: AbortSignal }
) {
  const formData = new FormData();
  formData.set("file", payload.file);
  formData.set("settings", JSON.stringify(payload.settings));
  const response = await fetch("/api/smart-tools/academic-ppt/tasks", {
    method: "POST",
    body: formData,
    signal: options?.signal
  });
  return parseAcademicPptResponse<CreateAcademicPptTaskResponse>(response);
}

export async function getAcademicPptTask(taskId: string, options?: { signal?: AbortSignal }) {
  const response = await fetch(`/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}`, {
    signal: options?.signal
  });
  return parseAcademicPptResponse<AcademicPptTaskSnapshot>(response);
}

export async function getAcademicPptTaskLogs(
  taskId: string,
  options?: { cursor?: string; limit?: number; signal?: AbortSignal }
) {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.cursor) params.set("cursor", options.cursor);
  const query = params.toString();
  const response = await fetch(`/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/logs${query ? `?${query}` : ""}`, {
    signal: options?.signal
  });
  return parseAcademicPptResponse<AcademicPptLogsResponse>(response);
}

export async function cancelAcademicPptTask(taskId: string, options?: { signal?: AbortSignal }) {
  const response = await fetch(`/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
    signal: options?.signal
  });
  return parseAcademicPptResponse<CancelAcademicPptTaskResponse & { task?: AcademicPptTaskSnapshot }>(response);
}

export async function resumeAcademicPptTask(taskId: string, options?: { signal?: AbortSignal }) {
  const response = await fetch(`/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/resume`, {
    method: "POST",
    signal: options?.signal
  });
  return parseAcademicPptResponse<ResumeAcademicPptTaskResponse>(response);
}

export async function getAcademicPptTaskPreview(taskId: string, options?: { signal?: AbortSignal }) {
  const response = await fetch(`/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/preview`, {
    signal: options?.signal
  });
  return parseAcademicPptResponse<AcademicPptPreviewResponse>(response);
}

export async function getAcademicPptRecentTasks(options?: { limit?: number; signal?: AbortSignal }) {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  const response = await fetch(`/api/smart-tools/academic-ppt/tasks${query ? `?${query}` : ""}`, {
    signal: options?.signal
  });
  return parseAcademicPptResponse<AcademicPptRecentTasksResponse>(response);
}
