export type NexusModel3DTaskStatus = "pending" | "succeeded" | "failed";

export type NexusModel3DTaskResult = {
  consumedCredit: number | null;
  createTime: number | null;
  errorMessage: string | null;
  exportUrl: string | null;
  modelUrl: string | null;
  previewImageUrl: string | null;
  progress: number | null;
  rawStatus: string | null;
  status: NexusModel3DTaskStatus;
  taskId: string | null;
};

export function normalizeTripoTaskResult(value: unknown): NexusModel3DTaskResult {
  const root = asRecord(value);
  const data = asRecord(root?.data) || root;
  const output = asRecord(data?.output) || asRecord(root?.output);
  const rawStatus = getString(data?.status) || getString(root?.status);
  const status = mapTripoStatus(rawStatus);

  return {
    consumedCredit: getNumber(output?.consumed_credit) || getNumber(data?.consumed_credit) || null,
    createTime: getNumber(data?.create_time) || null,
    errorMessage: getString(data?.error_msg) || getString(data?.error) || getString(data?.message) || getString(root?.message) || null,
    exportUrl: pickUrl(output, ["model", "exported_model", "exported_model_url", "file", "file_url", "output", "url"]),
    modelUrl: pickUrl(output, ["model", "base_model", "pbr_model", "model_url", "rendered_model", "result", "url"]),
    previewImageUrl: pickUrl(output, ["rendered_image", "preview", "preview_image", "preview_image_url", "thumbnail", "thumbnail_url"]),
    progress: getNumber(data?.progress) || null,
    rawStatus,
    status,
    taskId: getString(data?.task_id) || getString(root?.task_id) || null
  };
}

function mapTripoStatus(status: string | null): NexusModel3DTaskStatus {
  const normalized = status?.toLowerCase() || "";
  if (["success", "succeeded", "completed", "complete"].includes(normalized)) return "succeeded";
  if (["failed", "failure", "cancelled", "canceled", "expired"].includes(normalized)) return "failed";
  return "pending";
}

function pickUrl(source: Record<string, unknown> | null, keys: string[]) {
  if (!source) return null;
  for (const key of keys) {
    const direct = getString(source[key]);
    if (isUsableUrl(direct)) return direct;

    const nested = asRecord(source[key]);
    const nestedUrl = getString(nested?.url) || getString(nested?.model_url) || getString(nested?.file_url);
    if (isUsableUrl(nestedUrl)) return nestedUrl;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isUsableUrl(value: string | null): value is string {
  return Boolean(value && (/^https?:\/\//.test(value) || value.startsWith("/")));
}
