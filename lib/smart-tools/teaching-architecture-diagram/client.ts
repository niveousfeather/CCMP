import type {
  TeachingArchitectureCreateTaskResponse,
  TeachingArchitectureDiagramType,
  TeachingArchitectureImageRevisionResponse,
  TeachingArchitectureSceneEdit,
  TeachingArchitectureSceneResponse,
  TeachingArchitectureSourceType,
  TeachingArchitectureTaskListResponse,
  TeachingArchitectureTaskResponse
} from "@/lib/smart-tools/teaching-architecture-diagram/types";

export class TeachingArchitectureApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "TeachingArchitectureApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseTeachingArchitectureResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { message?: string; code?: string };
  if (!response.ok) {
    throw new TeachingArchitectureApiError(data.message || "教学架构图任务接口暂不可用。", response.status, data.code);
  }
  return data;
}

export async function createTeachingArchitectureTask(
  payload: {
    sourceType: TeachingArchitectureSourceType;
    textPrompt?: string;
    file?: File;
    diagramType: TeachingArchitectureDiagramType;
  },
  options?: { signal?: AbortSignal }
) {
  const formData = new FormData();
  formData.set("sourceType", payload.sourceType);
  formData.set("diagramType", payload.diagramType);
  if (payload.sourceType === "text") {
    formData.set("textPrompt", payload.textPrompt || "");
  } else if (payload.file) {
    formData.set("file", payload.file);
  }

  const response = await fetch("/api/smart-tools/teaching-architecture-diagram", {
    method: "POST",
    body: formData,
    signal: options?.signal
  });

  return parseTeachingArchitectureResponse<TeachingArchitectureCreateTaskResponse>(response);
}

export async function getTeachingArchitectureTasks(options?: { limit?: number; signal?: AbortSignal }) {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  const response = await fetch(`/api/smart-tools/teaching-architecture-diagram/tasks${query ? `?${query}` : ""}`, {
    signal: options?.signal
  });
  return parseTeachingArchitectureResponse<TeachingArchitectureTaskListResponse>(response);
}

export async function getTeachingArchitectureTask(taskId: string, options?: { signal?: AbortSignal }) {
  const response = await fetch(`/api/smart-tools/teaching-architecture-diagram/tasks/${encodeURIComponent(taskId)}`, {
    signal: options?.signal
  });
  return parseTeachingArchitectureResponse<TeachingArchitectureTaskResponse>(response);
}

export async function deleteTeachingArchitectureTask(taskId: string, options?: { signal?: AbortSignal }) {
  const response = await fetch(`/api/smart-tools/teaching-architecture-diagram/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
    signal: options?.signal
  });
  return parseTeachingArchitectureResponse<{ ok: boolean }>(response);
}

export async function retryTeachingArchitectureTask(taskId: string, options?: { signal?: AbortSignal }) {
  const response = await fetch(`/api/smart-tools/teaching-architecture-diagram/tasks/${encodeURIComponent(taskId)}/retry`, {
    method: "POST",
    signal: options?.signal
  });
  return parseTeachingArchitectureResponse<TeachingArchitectureTaskResponse>(response);
}

export async function getTeachingArchitectureScene(taskId: string, options?: { signal?: AbortSignal }) {
  const response = await fetch(`/api/smart-tools/teaching-architecture-diagram/tasks/${encodeURIComponent(taskId)}/scene`, {
    signal: options?.signal
  });
  return parseTeachingArchitectureResponse<TeachingArchitectureSceneResponse>(response);
}

export async function saveTeachingArchitectureSceneEdits(
  taskId: string,
  edits: TeachingArchitectureSceneEdit[],
  options?: { signal?: AbortSignal }
) {
  const response = await fetch(`/api/smart-tools/teaching-architecture-diagram/tasks/${encodeURIComponent(taskId)}/scene`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ edits }),
    signal: options?.signal
  });
  return parseTeachingArchitectureResponse<TeachingArchitectureSceneResponse>(response);
}

export async function reviseTeachingArchitectureTaskImage(
  taskId: string,
  instruction: string,
  options?: { signal?: AbortSignal }
) {
  const response = await fetch(`/api/smart-tools/teaching-architecture-diagram/tasks/${encodeURIComponent(taskId)}/image-revision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ instruction }),
    signal: options?.signal
  });
  return parseTeachingArchitectureResponse<TeachingArchitectureImageRevisionResponse>(response);
}
