import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { getAcademicPptTaskDir } from "@/lib/smart-tools/academic-ppt/server-task-store";

const LOCK_TTL_MS = 45 * 60 * 1000;
const INSTANCE_ID = `${process.pid}-${Math.random().toString(36).slice(2)}`;

type AcademicPptTaskLock = {
  taskId: string;
  createdAt: string;
  pid: number;
  instanceId: string;
};

function getLockPath(taskId: string) {
  return path.join(getAcademicPptTaskDir(taskId), "task.lock");
}

function isStaleLock(lock: AcademicPptTaskLock) {
  const createdAt = Date.parse(lock.createdAt);
  return Number.isNaN(createdAt) || Date.now() - createdAt > LOCK_TTL_MS;
}

export async function acquireAcademicPptTaskLock(taskId: string) {
  const taskDir = getAcademicPptTaskDir(taskId);
  await mkdir(taskDir, { recursive: true });
  const lockPath = getLockPath(taskId);
  const lock: AcademicPptTaskLock = {
    taskId,
    createdAt: new Date().toISOString(),
    pid: process.pid,
    instanceId: INSTANCE_ID
  };

  try {
    const existing = JSON.parse(await readFile(lockPath, "utf8")) as AcademicPptTaskLock;
    if (!isStaleLock(existing)) return false;
    await rm(lockPath, { force: true });
  } catch {
    // Missing or invalid locks can be replaced.
  }

  try {
    await writeFile(lockPath, JSON.stringify(lock, null, 2), { encoding: "utf8", flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

export async function releaseAcademicPptTaskLock(taskId: string) {
  const lockPath = getLockPath(taskId);
  try {
    const existing = JSON.parse(await readFile(lockPath, "utf8")) as AcademicPptTaskLock;
    if (existing.instanceId !== INSTANCE_ID) return;
  } catch {
    return;
  }
  await rm(lockPath, { force: true });
}

export async function hasActiveAcademicPptTaskLock(taskId: string) {
  try {
    const existing = JSON.parse(await readFile(getLockPath(taskId), "utf8")) as AcademicPptTaskLock;
    return !isStaleLock(existing);
  } catch {
    return false;
  }
}
