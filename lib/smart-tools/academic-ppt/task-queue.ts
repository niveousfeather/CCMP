import "server-only";

import { stat } from "node:fs/promises";

import {
  appendAcademicPptLog,
  listAcademicPptTaskRecords,
  readAcademicPptTaskRecord,
  updateAcademicPptTaskRecord
} from "@/lib/smart-tools/academic-ppt/server-task-store";
import { reconcileAcademicPptTaskRecovery } from "@/lib/smart-tools/academic-ppt/task-recovery";
import { hasActiveAcademicPptTaskLock } from "@/lib/smart-tools/academic-ppt/task-lock";
import type { AcademicPptTaskRecord } from "@/lib/smart-tools/academic-ppt/types";

const DEFAULT_MAX_CONCURRENT_TASKS = 1;
const MAX_CONCURRENT_TASKS_CAP = 2;
const inProcessRunningTasks = new Set<string>();
const queuedRequestOrigins = new Map<string, string>();
let scheduling = false;

export function getAcademicPptMaxConcurrentTasks() {
  const raw = Number(process.env.ACADEMIC_PPT_MAX_CONCURRENT_TASKS || DEFAULT_MAX_CONCURRENT_TASKS);
  if (!Number.isFinite(raw)) return DEFAULT_MAX_CONCURRENT_TASKS;
  return Math.min(Math.max(Math.floor(raw), 1), MAX_CONCURRENT_TASKS_CAP);
}

async function hasUploadFile(record: AcademicPptTaskRecord) {
  try {
    await stat(record.inputFilePath);
    return true;
  } catch {
    return false;
  }
}

function sortByCreatedAt(a: AcademicPptTaskRecord, b: AcademicPptTaskRecord) {
  return Date.parse(a.createdAt || a.updatedAt) - Date.parse(b.createdAt || b.updatedAt);
}

export async function countRunningAcademicPptTasks() {
  const records = await listAcademicPptTaskRecords();
  const activeTaskIds = new Set(inProcessRunningTasks);

  for (const record of records) {
    if (record.status !== "pending" && record.status !== "running") continue;
    if (await hasActiveAcademicPptTaskLock(record.taskId)) {
      activeTaskIds.add(record.taskId);
      continue;
    }
    await reconcileAcademicPptTaskRecovery(record.taskId).catch(() => undefined);
  }

  return activeTaskIds.size;
}

export async function enqueueAcademicPptTask(taskId: string, options?: { resume?: boolean; requestOrigin?: string | null }) {
  const record = await readAcademicPptTaskRecord(taskId);
  if (options?.requestOrigin) queuedRequestOrigins.set(taskId, options.requestOrigin);
  if (record.status === "success" || record.status === "cancelled") return record;
  if (!(await hasUploadFile(record))) {
    const failed = await updateAcademicPptTaskRecord(taskId, {
      status: "failed",
      currentStep: "failed",
      progress: 100,
      error: "上传文件缺失，无法加入生成队列，请重新上传。",
      resumable: false,
      failedAt: new Date().toISOString()
    });
    await appendAcademicPptLog(taskId, "error", "上传文件缺失，无法加入生成队列，请重新上传。");
    return failed;
  }

  const next = await updateAcademicPptTaskRecord(taskId, {
    status: "queued",
    progress: Math.max(record.progress || 5, 5),
    cancelRequested: false,
    error: undefined,
    resumable: Boolean(options?.resume || record.resumable),
    timeoutAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
  });
  await appendAcademicPptLog(taskId, options?.resume ? "info" : "info", "任务已加入生成队列。");
  return next;
}

async function getQueuedAcademicPptTasks() {
  const records = await listAcademicPptTaskRecords();
  return records
    .filter((record) => record.status === "queued" && !record.cancelRequested)
    .sort(sortByCreatedAt);
}

async function startQueuedTask(record: AcademicPptTaskRecord) {
  if (inProcessRunningTasks.has(record.taskId)) return;
  if (await hasActiveAcademicPptTaskLock(record.taskId)) return;

  if (!(await hasUploadFile(record))) {
    await updateAcademicPptTaskRecord(record.taskId, {
      status: "failed",
      currentStep: "failed",
      progress: 100,
      error: "上传文件缺失，无法启动生成，请重新上传。",
      resumable: false,
      failedAt: new Date().toISOString()
    });
    await appendAcademicPptLog(record.taskId, "error", "上传文件缺失，无法启动生成，请重新上传。");
    return;
  }

  inProcessRunningTasks.add(record.taskId);
  await appendAcademicPptLog(record.taskId, "info", "任务已被调度，准备开始生成。");
  const { runAcademicPptTask } = await import("@/lib/smart-tools/academic-ppt/task-runner");
  const requestOrigin = queuedRequestOrigins.get(record.taskId);
  queuedRequestOrigins.delete(record.taskId);
  void runAcademicPptTask(record.taskId, { resume: Boolean(record.resumeFromStep), requestOrigin });
}

export async function scheduleAcademicPptQueue() {
  if (scheduling) return;
  scheduling = true;
  try {
    const maxConcurrent = getAcademicPptMaxConcurrentTasks();
    const runningCount = await countRunningAcademicPptTasks();
    let availableSlots = Math.max(maxConcurrent - runningCount, 0);
    if (availableSlots <= 0) return;

    const queued = await getQueuedAcademicPptTasks();
    for (const record of queued) {
      if (availableSlots <= 0) break;
      if (record.status === "cancelled" || record.cancelRequested) continue;
      await startQueuedTask(record);
      availableSlots -= 1;
    }
  } finally {
    scheduling = false;
  }
}

export async function onAcademicPptTaskFinished(taskId: string) {
  inProcessRunningTasks.delete(taskId);
  await scheduleAcademicPptQueue();
}
