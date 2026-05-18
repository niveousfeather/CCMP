import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { enqueueModel3DGenerationTask } from "@/lib/model3d/execution";
import { createModel3DHistoryRecord } from "@/lib/model3d/history";
import { buildTripoExportPayload, buildTripoTaskPayload } from "@/lib/model3d/tasks";
import { getTripoModel3DConfig } from "@/lib/model3d/config";
import { checkAndConsumeQuota } from "@/lib/quota";
import type { NexusModel3DCreateRequest, NexusModel3DExportRequest } from "@/lib/model3d/tasks";

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeCreateRequest(value: unknown): NexusModel3DCreateRequest | null {
  if (!isRecord(value) || typeof value.feature !== "string") return null;
  return value as NexusModel3DCreateRequest;
}

function normalizeExportRequest(value: unknown): NexusModel3DExportRequest | null {
  if (!isRecord(value)) return null;
  if (typeof value.sourceTaskId !== "string" || !value.sourceTaskId.trim()) return null;
  if (typeof value.fileName !== "string" || !value.fileName.trim()) return null;
  if (typeof value.format !== "string" || typeof value.resolution !== "string") return null;
  return value as NexusModel3DExportRequest;
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("INVALID_JSON", "3D 任务请求格式不正确。", 400);
  }

  const feature = isRecord(body) && typeof body.feature === "string" ? body.feature : "";
  const isExportTask = feature === "export-model";
  const exportRequest = isExportTask ? normalizeExportRequest(body) : null;
  const createRequest = isExportTask ? null : normalizeCreateRequest(body);
  if (isExportTask && !exportRequest) return jsonError("INVALID_EXPORT_REQUEST", "3D 导出任务缺少 sourceTaskId、fileName、format 或 resolution。", 400);
  if (!isExportTask && !createRequest) return jsonError("INVALID_MODEL3D_REQUEST", "3D 任务缺少 feature 参数。", 400);

  const localTaskId =
    (isRecord(body) && typeof body.clientRequestId === "string" && body.clientRequestId.trim()) ||
    `model3d-local-${Date.now()}`;

  if (!isExportTask) {
    const quotaResult = await checkAndConsumeQuota(user!.id, "model3d", `${feature}:${localTaskId}`);
    if (!quotaResult.ok) {
      return NextResponse.json(quotaResult, { status: 429 });
    }
  }

  const config = getTripoModel3DConfig();
  const debugPayload = isExportTask
    ? buildTripoExportPayload(exportRequest!)
    : buildTripoTaskPayload(createRequest!, config.defaultModelVersion);
  const queuedRequest = isExportTask ? { kind: "export" as const, request: exportRequest! } : { kind: "create" as const, request: createRequest! };
  console.info(`[model3d] queued_task localTaskId=${localTaskId} feature=${feature || "unknown"} tripo_type=${debugPayload.type}`);

  await createModel3DHistoryRecord({
    userId: user!.id,
    clientTaskId: localTaskId,
    feature: feature || "generate-model",
    inputImages: extractInputImages(body),
    localTaskId,
    mode: isRecord(body) && typeof body.mode === "string" ? body.mode : "text-to-3d",
    model: isRecord(body) && typeof body.model === "string" ? body.model : "nexus-3d-preview",
    prompt: getTaskPrompt(body, isExportTask ? "Nexus 3D 模型导出" : ""),
    providerMeta: queuedRequest,
    quality: isRecord(body) && typeof body.quality === "string" ? body.quality : "standard",
    request: isRecord(body) ? body : {},
    status: "queued",
    title: isExportTask && exportRequest ? exportRequest.fileName : undefined
  });
  setTimeout(() => enqueueModel3DGenerationTask(localTaskId), 0);

  return NextResponse.json(
    {
      provider: "tripo",
      queued: true,
      taskId: localTaskId,
      task: {
        status: "queued",
        task_id: localTaskId,
        type: debugPayload.type
      }
    },
    { status: 202 }
  );
}

function extractInputImages(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.imageRefs)) return [];
  const images: Array<{ label?: string; name: string; objectKey?: string | null; url: string }> = [];
  for (const image of value.imageRefs) {
    if (!isRecord(image)) continue;
    const url = typeof image.storageUrl === "string" ? image.storageUrl : typeof image.url === "string" ? image.url : "";
    if (!url) continue;
    images.push({
      label: typeof image.label === "string" ? image.label : undefined,
      name: typeof image.fileType === "string" ? image.fileType : "参考图",
      objectKey: typeof image.objectKey === "string" ? image.objectKey : null,
      url
    });
  }
  return images;
}

function getTaskPrompt(value: unknown, fallback: string) {
  if (isRecord(value) && typeof value.prompt === "string" && value.prompt.trim()) return value.prompt;
  return fallback;
}
