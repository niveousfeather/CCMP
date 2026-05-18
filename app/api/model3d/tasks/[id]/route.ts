import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeErrorLog } from "@/lib/error-log";
import { enqueueModel3DGenerationTask } from "@/lib/model3d/execution";
import { model3DGenerationToTask, persistModel3DTaskResult } from "@/lib/model3d/history";
import { normalizeTripoTaskResult } from "@/lib/model3d/results";
import { createTripoModel3DClient, TripoModel3DRequestError } from "@/lib/model3d/tripo";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { user, response } = await requireUser();
  if (response) return response;

  const params = await context.params;
  const taskId = params.id.trim();
  if (!taskId) return jsonError("INVALID_TASK_ID", "3D 任务 ID 不能为空。", 400);

  try {
    const localGeneration = await prisma.model3DGeneration.findFirst({
      where: { userId: user!.id, OR: [{ taskId }, { providerTaskId: taskId }] }
    });
    if (localGeneration && !localGeneration.providerTaskId) {
      if (isRecoverableQueuedStatus(localGeneration.status)) {
        enqueueModel3DGenerationTask(localGeneration.taskId);
      }
      const task = await model3DGenerationToTask(localGeneration);
      return NextResponse.json({
        normalized: {
          errorMessage: task.errorMessage,
          exportUrl: task.exportUrl,
          modelUrl: task.modelUrl,
          previewImageUrl: task.previewImageUrl,
          previewModelUrl: task.previewModelUrl,
          rawStatus: task.rawStatus || localGeneration.status,
          status: localGeneration.status === "failed" ? "failed" : "pending"
        },
        provider: "tripo",
        queued: true,
        task
      });
    }

    const providerTaskId = localGeneration?.providerTaskId || taskId;
    const client = createTripoModel3DClient();
    const taskResponse = await client.getTask(providerTaskId);
    const normalized = normalizeTripoTaskResult(taskResponse);
    const persisted = await persistModel3DTaskResult(providerTaskId, user!.id, normalized, taskResponse.data || taskResponse);
    const persistedTask = persisted
      ? {
        ...normalized,
        modelUrl: persisted.modelUrl || normalized.modelUrl,
        previewModelUrl: `/api/model3d/preview/${encodeURIComponent(persisted.taskId)}`,
        previewImageUrl: persisted.previewImageUrl || normalized.previewImageUrl,
        exportUrl: persisted.exportUrl || normalized.exportUrl,
        providerTaskId: persisted.providerTaskId || providerTaskId
      }
      : { ...normalized, providerTaskId };
    return NextResponse.json({
      normalized: persistedTask,
      provider: "tripo",
      task: taskResponse.data || taskResponse
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "3D 任务查询失败。";
    if (error instanceof TripoModel3DRequestError) {
      await writeErrorLog({
        userId: user!.id,
        route: "/api/model3d/tasks/[id]",
        method: "GET",
        status: error.status >= 400 && error.status < 500 ? 400 : 502,
        code: "MODEL3D_TASK_QUERY_FAILED",
        provider: "tripo",
        traceId: error.traceId,
        message,
        detail: error.responseBody
      });
      return NextResponse.json({ code: "MODEL3D_TASK_QUERY_FAILED", message, traceId: error.traceId, tripo: error.responseBody }, { status: error.status >= 400 && error.status < 500 ? 400 : 502 });
    }
    const status = message.includes("TRIPO_API_KEY") ? 503 : 500;
    await writeErrorLog({
      userId: user!.id,
      route: "/api/model3d/tasks/[id]",
      method: "GET",
      status,
      code: "MODEL3D_TASK_QUERY_FAILED",
      provider: "tripo",
      message
    });
    return jsonError("MODEL3D_TASK_QUERY_FAILED", message, status);
  }
}

function isRecoverableQueuedStatus(status: string) {
  return status === "queued" || status === "retrying";
}
