import { writeErrorLog } from "@/lib/error-log";
import { enqueueGenerationExecution } from "@/lib/generation/concurrency";
import {
  getGenerationRetryDelayMs,
  getGenerationRetryNotice,
  isRetryableGenerationError,
  shouldRetryGenerationError
} from "@/lib/generation/retry";
import { prisma } from "@/lib/db";
import { createTripoModel3DClient, TripoModel3DRequestError } from "@/lib/model3d/tripo";
import type { NexusModel3DCreateRequest, NexusModel3DExportRequest } from "@/lib/model3d/tasks";

type Model3DQueuedRequest =
  | {
      kind: "create";
      request: NexusModel3DCreateRequest;
    }
  | {
      kind: "export";
      request: NexusModel3DExportRequest;
    };

export function enqueueModel3DGenerationTask(taskId: string) {
  enqueueGenerationExecution("model3d", taskId, () => runModel3DQueuedTask(taskId));
}

export async function runModel3DQueuedTask(taskId: string, attempt = 0) {
  const generation = await prisma.model3DGeneration.findUnique({ where: { taskId } });
  if (!generation || generation.providerTaskId || generation.status === "succeeded" || generation.status === "failed") return;

  try {
    await prisma.model3DGeneration.update({
      where: { id: generation.id },
      data: { errorMessage: null, status: "processing" }
    });
    const queuedRequest = parseQueuedRequest(generation.providerMeta);
    const client = createTripoModel3DClient();
    const taskResponse = queuedRequest.kind === "export" ? await client.createExportTask(queuedRequest.request) : await client.createTask(queuedRequest.request);
    const providerTaskId = extractTaskId(taskResponse);
    if (!providerTaskId) {
      throw new Error("MODEL3D_TASK_ID_MISSING");
    }
    await prisma.model3DGeneration.update({
      where: { id: generation.id },
      data: {
        providerMeta: safeJson({ queuedRequest, submitResponse: taskResponse.data || taskResponse }),
        providerTaskId,
        status: "pending"
      }
    });
    console.info(`[model3d:queue] submit_success localTaskId=${taskId} providerTaskId=${providerTaskId}`);
  } catch (error) {
    if (shouldRetryGenerationError(error, attempt, "model3d")) {
      const notice = getGenerationRetryNotice("model3d", attempt);
      const delayMs = getGenerationRetryDelayMs("model3d", attempt, error);
      await prisma.model3DGeneration.update({
        where: { id: generation.id },
        data: {
          errorMessage: notice,
          status: "retrying"
        }
      });
      console.warn(`[model3d:queue] retry_scheduled taskId=${taskId} attempt=${attempt + 1} delayMs=${delayMs}`);
      setTimeout(() => {
        enqueueGenerationExecution("model3d", taskId, () => runModel3DQueuedTask(taskId, attempt + 1));
      }, delayMs);
      return;
    }

    const message = error instanceof Error ? error.message : "3D 任务创建失败。";
    await prisma.model3DGeneration.update({
      where: { id: generation.id },
      data: {
        errorMessage: isRetryableGenerationError(error) ? "3D 生成服务繁忙，多次重试后仍未成功。" : message,
        status: "failed"
      }
    });
    await writeErrorLog({
      userId: generation.userId,
      route: "/api/model3d",
      method: "POST",
      status: error instanceof TripoModel3DRequestError ? error.status : 500,
      code: "MODEL3D_QUEUED_TASK_FAILED",
      provider: "tripo",
      traceId: error instanceof TripoModel3DRequestError ? error.traceId : undefined,
      message,
      detail: error instanceof TripoModel3DRequestError ? error.responseBody : { taskId, attempt }
    });
  }
}

function parseQueuedRequest(value: string | null): Model3DQueuedRequest {
  if (!value) throw new Error("MODEL3D_QUEUE_PAYLOAD_MISSING");
  const parsed = JSON.parse(value) as Model3DQueuedRequest;
  if (parsed?.kind === "export" || parsed?.kind === "create") return parsed;
  throw new Error("MODEL3D_QUEUE_PAYLOAD_INVALID");
}

function extractTaskId(value: unknown) {
  if (!isRecord(value)) return null;
  const data = isRecord(value.data) ? value.data : null;
  const taskId = data?.task_id || data?.taskId || value.task_id || value.taskId;
  return typeof taskId === "string" && taskId.trim() ? taskId.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}
