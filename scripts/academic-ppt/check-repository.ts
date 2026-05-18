import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

type TaskStatus = "queued" | "pending" | "running" | "success" | "failed" | "cancelled";

type TaskRecord = {
  taskId?: string;
  status?: TaskStatus;
  inputFileName?: string;
  inputFilePath?: string;
  outputFilePath?: string;
  outputFileSize?: number;
  qualityReportPath?: string;
  previewManifestPath?: string;
  previewAvailable?: boolean;
  previewType?: "image" | "pdf" | "outline";
  previewSlideCount?: number;
  resumable?: boolean;
  lastCompletedStep?: string;
  cancelRequested?: boolean;
  finalQualityScore?: number;
  finalVisualQaScore?: number;
  modelCriticStatus?: "skipped" | "success" | "degraded" | "failed";
  modelCriticRounds?: number;
  autoRepairApplied?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type TaskIssue = {
  taskId: string;
  severity: "warn" | "error";
  message: string;
};

const root = path.join(process.cwd(), "data", "academic-ppt", "tasks");
const taskIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validStatuses = new Set<TaskStatus>(["queued", "pending", "running", "success", "failed", "cancelled"]);
const lockTtlMs = 45 * 60 * 1000;
const maxLogsBytes = 512 * 1024;
const reportOnly = process.argv.includes("--report-only");
const sensitivePattern =
  /(API_KEY|Authorization|Bearer\s+[A-Za-z0-9._-]+|Base URL|process\.env|SECRET|TOKEN|PASSWORD|[A-Za-z]:\\|\/(?:Users|home|var|tmp|mnt)\/|at\s+.+\(.+:\d+:\d+\))/i;

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function isInside(targetPath: string, directoryPath: string) {
  const relative = path.relative(path.resolve(directoryPath), path.resolve(targetPath));
  return relative === "" || (relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function hasCheckpoint(taskDir: string, name: string) {
  return existsSync(path.join(taskDir, "checkpoints", `${name}.json`));
}

function hasAnyResumeCheckpoint(taskDir: string) {
  return ["source-parsed", "outline-draft", "outline-repaired", "pptx-exported", "preview"].some((name) =>
    hasCheckpoint(taskDir, name)
  );
}

function activeLockState(taskDir: string) {
  const lockPath = path.join(taskDir, "task.lock");
  if (!existsSync(lockPath)) return "missing" as const;
  try {
    const lock = readJson<{ createdAt?: string }>(lockPath);
    const createdAt = Date.parse(lock.createdAt || "");
    if (Number.isNaN(createdAt)) return "stale" as const;
    return Date.now() - createdAt > lockTtlMs ? ("stale" as const) : ("active" as const);
  } catch {
    return "stale" as const;
  }
}

function addIssue(issues: TaskIssue[], taskId: string, severity: TaskIssue["severity"], message: string) {
  issues.push({ taskId, severity, message });
}

function checkPathField(
  issues: TaskIssue[],
  taskId: string,
  taskDir: string,
  fieldName: string,
  value: string | undefined,
  options?: { mustExist?: boolean }
) {
  if (!value) return;
  const resolved = path.resolve(value);
  if (!isInside(resolved, taskDir)) {
    addIssue(issues, taskId, "error", `${fieldName} points outside task directory`);
    return;
  }
  if (options?.mustExist && !existsSync(resolved)) {
    addIssue(issues, taskId, "error", `${fieldName} file is missing`);
  }
}

function checkLogs(issues: TaskIssue[], taskId: string, taskDir: string) {
  const logsPath = path.join(taskDir, "logs.json");
  if (!existsSync(logsPath)) {
    addIssue(issues, taskId, "warn", "logs.json is missing");
    return;
  }
  const size = statSync(logsPath).size;
  if (size > maxLogsBytes) addIssue(issues, taskId, "warn", `logs.json is large: ${size} bytes`);
  let logs: Array<{ message?: string }> = [];
  try {
    logs = readJson<Array<{ message?: string }>>(logsPath);
  } catch {
    addIssue(issues, taskId, "error", "logs.json is not valid JSON");
    return;
  }
  const leaked = logs.find((log) => sensitivePattern.test(log.message || ""));
  if (leaked) addIssue(issues, taskId, "error", `logs contain sensitive-looking content: ${(leaked.message || "").slice(0, 120)}`);
}

function checkPreview(issues: TaskIssue[], taskId: string, taskDir: string, record: TaskRecord) {
  const previewDir = path.join(taskDir, "previews");
  const manifestPath = path.join(previewDir, "manifest.json");
  const legacyManifestPath = path.join(previewDir, "preview.json");
  if (record.previewAvailable && !record.previewType) {
    addIssue(issues, taskId, "error", "previewAvailable is true but previewType is missing");
  }
  if (record.previewAvailable && record.previewType === "image") {
    if (!existsSync(manifestPath) && !existsSync(legacyManifestPath)) {
      addIssue(issues, taskId, "error", "image preview is marked available but manifest.json is missing");
    }
    const slideCount = record.previewSlideCount || 0;
    for (let index = 1; index <= slideCount; index += 1) {
      const imagePath = path.join(previewDir, `slide-${String(index).padStart(3, "0")}.png`);
      if (!existsSync(imagePath)) {
        addIssue(issues, taskId, "warn", `preview image ${index} is missing`);
        break;
      }
    }
  }
}

function main() {
  const counts: Record<TaskStatus, number> = {
    queued: 0,
    pending: 0,
    running: 0,
    success: 0,
    failed: 0,
    cancelled: 0
  };
  const issues: TaskIssue[] = [];
  const staleLocks: string[] = [];
  const resumableTasks: string[] = [];
  let total = 0;

  if (!existsSync(root)) {
    console.log("academic-ppt repository check: no task repository found");
    return;
  }

  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const taskId = entry.name;
    if (!taskIdPattern.test(taskId)) {
      addIssue(issues, taskId, "warn", "non-UUID directory inside task repository");
      continue;
    }

    total += 1;
    const taskDir = path.join(root, taskId);
    const recordPath = path.join(taskDir, "task.json");
    if (!existsSync(recordPath)) {
      addIssue(issues, taskId, "error", "task.json is missing");
      continue;
    }

    let record: TaskRecord;
    try {
      record = readJson<TaskRecord>(recordPath);
    } catch {
      addIssue(issues, taskId, "error", "task.json is not valid JSON");
      continue;
    }

    if (record.taskId && record.taskId !== taskId) addIssue(issues, taskId, "error", "taskId does not match directory name");
    if (!record.status || !validStatuses.has(record.status)) {
      addIssue(issues, taskId, "error", `invalid status: ${String(record.status)}`);
      continue;
    }

    counts[record.status] += 1;
    checkPathField(issues, taskId, taskDir, "inputFilePath", record.inputFilePath, { mustExist: true });
    checkPathField(issues, taskId, taskDir, "outputFilePath", record.outputFilePath, { mustExist: record.status === "success" });
    checkPathField(issues, taskId, taskDir, "qualityReportPath", record.qualityReportPath);
    checkPathField(issues, taskId, taskDir, "previewManifestPath", record.previewManifestPath);
    checkLogs(issues, taskId, taskDir);
    checkPreview(issues, taskId, taskDir, record);

    const lockState = activeLockState(taskDir);
    if (lockState === "stale") staleLocks.push(taskId);
    if ((record.status === "running" || record.status === "pending") && lockState !== "active") {
      addIssue(issues, taskId, "warn", `${record.status} task has no active task.lock`);
    }
    if (record.status === "queued" && record.cancelRequested) {
      addIssue(issues, taskId, "warn", "queued task has cancelRequested=true and may need cancellation reconciliation");
    }
    if (record.status === "success") {
      if (!record.outputFileSize || record.outputFileSize <= 0) addIssue(issues, taskId, "error", "success task has no outputFileSize");
      if (!record.outputFilePath) addIssue(issues, taskId, "error", "success task has no outputFilePath");
      if (record.finalQualityScore === undefined) addIssue(issues, taskId, "warn", "success task is missing finalQualityScore");
      if (record.finalVisualQaScore === undefined) addIssue(issues, taskId, "warn", "success task is missing finalVisualQaScore");
      if (!record.modelCriticStatus) addIssue(issues, taskId, "warn", "success task is missing modelCriticStatus");
      if (record.autoRepairApplied && !hasCheckpoint(taskDir, "auto-repair-round-1") && !hasCheckpoint(taskDir, "auto-repair-round-2")) {
        addIssue(issues, taskId, "warn", "autoRepairApplied=true but auto-repair checkpoint is missing");
      }
      if ((record.modelCriticRounds || 0) > 0 && !hasCheckpoint(taskDir, "model-critic-round-1") && !hasCheckpoint(taskDir, "model-critic-round-2")) {
        addIssue(issues, taskId, "warn", "modelCriticRounds>0 but model-critic checkpoint is missing");
      }
    }
    if (record.status === "failed" && record.resumable) {
      resumableTasks.push(taskId);
      if (!hasAnyResumeCheckpoint(taskDir)) {
        addIssue(issues, taskId, "error", "failed resumable task has no usable checkpoint");
      }
    }
    if (record.status === "cancelled" && !record.cancelRequested) {
      addIssue(issues, taskId, "warn", "cancelled task is missing cancelRequested marker");
    }
  }

  console.log("academic-ppt repository check");
  console.log(`tasks=${total}`);
  console.log(
    `status queued=${counts.queued} pending=${counts.pending} running=${counts.running} success=${counts.success} failed=${counts.failed} cancelled=${counts.cancelled}`
  );
  console.log(`staleLocks=${staleLocks.length}${staleLocks.length ? ` ${staleLocks.join(",")}` : ""}`);
  console.log(`resumable=${resumableTasks.length}${resumableTasks.length ? ` ${resumableTasks.join(",")}` : ""}`);

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warn");
  console.log(`issues errors=${errors.length} warnings=${warnings.length}`);
  for (const issue of issues.slice(0, 80)) {
    console.log(`[${issue.severity}] ${issue.taskId}: ${issue.message}`);
  }
  if (issues.length > 80) console.log(`... ${issues.length - 80} more issues omitted`);
  if (staleLocks.length) console.log("cleanup suggestion: review stale locks or run cleanup with --dry-run before fixing.");

  if (errors.length && !reportOnly) process.exit(1);
}

main();
