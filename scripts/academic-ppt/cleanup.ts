import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

const root = path.join(process.cwd(), "data", "academic-ppt", "tasks");
const keepDays = Number(process.env.ACADEMIC_PPT_CLEANUP_DAYS || 7);
const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
const dryRun = process.argv.includes("--dry-run");
const lockTtlMs = 45 * 60 * 1000;
const taskIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TaskRecord = {
  taskId: string;
  status: "queued" | "pending" | "running" | "success" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hasActiveLock(lockPath: string) {
  try {
    const lock = JSON.parse(await readFile(lockPath, "utf8")) as { createdAt?: string };
    const createdAt = Date.parse(lock.createdAt || "");
    return !Number.isNaN(createdAt) && Date.now() - createdAt <= lockTtlMs;
  } catch {
    return false;
  }
}

async function removePath(targetPath: string) {
  if (dryRun) {
    console.log(`[dry-run] remove ${targetPath}`);
    return;
  }
  await rm(targetPath, { recursive: true, force: true });
  console.log(`removed ${targetPath}`);
}

async function main() {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!taskIdPattern.test(entry.name)) continue;
    const taskDir = path.join(root, entry.name);
    const lockPath = path.join(taskDir, "task.lock");
    if (await exists(lockPath)) {
      if (await hasActiveLock(lockPath)) continue;
      await removePath(lockPath);
    }

    const recordPath = path.join(taskDir, "task.json");
    let record: TaskRecord;
    try {
      record = JSON.parse(await readFile(recordPath, "utf8")) as TaskRecord;
    } catch {
      continue;
    }

    if (record.status === "queued" || record.status === "running" || record.status === "pending") continue;
    const timestamp = Date.parse(record.updatedAt || record.createdAt);
    if (!Number.isNaN(timestamp) && timestamp > cutoff) continue;

    if (record.status === "failed" || record.status === "cancelled") {
      await removePath(path.join(taskDir, "outputs"));
      await removePath(path.join(taskDir, "previews"));
      continue;
    }

    await removePath(taskDir);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "academic-ppt cleanup failed");
  process.exit(1);
});
