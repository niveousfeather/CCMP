import "server-only";

import {
  runAcademicPptGenerationPipeline,
  summarizeAcademicPptTaskError
} from "@/lib/smart-tools/academic-ppt/sidecar-client";
import {
  appendAcademicPptLog,
  markAcademicPptFailed,
  readAcademicPptTaskRecord,
  updateAcademicPptTaskRecord
} from "@/lib/smart-tools/academic-ppt/server-task-store";
import { getAcademicPptResumeStep } from "@/lib/smart-tools/academic-ppt/task-recovery";
import { acquireAcademicPptTaskLock, releaseAcademicPptTaskLock } from "@/lib/smart-tools/academic-ppt/task-lock";
import { getAcademicPptToolsEngineBaseUrl, runAcademicPptToolsEngineTask } from "@/lib/smart-tools/academic-ppt/tools-engine-client";

export async function runAcademicPptTask(taskId: string, options?: { resume?: boolean; requestOrigin?: string | null }) {
  let lockAcquired = false;

  try {
    lockAcquired = await acquireAcademicPptTaskLock(taskId);
    if (!lockAcquired) {
      await appendAcademicPptLog(taskId, "warn", "Task is already running; duplicate start skipped.");
      return;
    }

    const record = await readAcademicPptTaskRecord(taskId);
    if (record.status === "cancelled" || record.cancelRequested) {
      await appendAcademicPptLog(taskId, "warn", "Task was cancelled; generation will not start.");
      return;
    }

    await updateAcademicPptTaskRecord(taskId, {
      status: "pending",
      progress: Math.max(record.progress || 5, 5),
      currentStep: record.resumeFromStep || getAcademicPptResumeStep(record.lastCompletedStep),
      startedAt: record.startedAt || new Date().toISOString(),
      timeoutAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    });

    const toolsEngineHandled = await runAcademicPptToolsEngineTask(taskId, {
      resume: Boolean(options?.resume || record.resumeFromStep),
      requestOrigin: options?.requestOrigin
    });
    if (toolsEngineHandled) return;

    await appendAcademicPptLog(
      taskId,
      "warn",
      getAcademicPptToolsEngineBaseUrl()
        ? "Generation service is unavailable; fallback generation will be used with limited quality."
        : "Generation service is not configured; fallback generation will be used with limited quality."
    );
    await runAcademicPptGenerationPipeline(taskId, Boolean(options?.resume || record.resumeFromStep));
  } catch (error) {
    const record = await readAcademicPptTaskRecord(taskId).catch(() => null);
    if (record?.status === "cancelled" || record?.cancelRequested) {
      await appendAcademicPptLog(taskId, "warn", "Task was cancelled; remaining generation steps were stopped.");
      return;
    }

    const message = summarizeAcademicPptTaskError(error);
    await updateAcademicPptTaskRecord(taskId, {
      retryCount: Math.min((record?.retryCount || 0) + 1, record?.maxRetries || 2),
      resumeFromStep: getAcademicPptResumeStep(record?.lastCompletedStep),
      resumable: Boolean(record?.lastCompletedStep)
    }).catch(() => undefined);
    await markAcademicPptFailed(taskId, message);
  } finally {
    if (lockAcquired) {
      await releaseAcademicPptTaskLock(taskId);
    }
    const { onAcademicPptTaskFinished } = await import("@/lib/smart-tools/academic-ppt/task-queue");
    await onAcademicPptTaskFinished(taskId);
  }
}
