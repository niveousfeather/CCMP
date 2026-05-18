import { rm } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const baseUrl = (process.env.ACADEMIC_PPT_TEST_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
const pollIntervalMs = Number(process.env.ACADEMIC_PPT_E2E_POLL_MS || 2000);
const timeoutMs = Number(process.env.ACADEMIC_PPT_E2E_TIMEOUT_MS || 12 * 60 * 1000);
const keepTasks = process.env.ACADEMIC_PPT_E2E_KEEP_TASKS === "1";
const taskIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TaskStatus = "queued" | "pending" | "running" | "success" | "failed" | "cancelled";

type TaskSnapshot = {
  taskId: string;
  status: TaskStatus;
  progress?: number;
  resumable?: boolean;
  slideCount?: number;
  outputFileSize?: number;
  downloadUrl?: string;
  previewAvailable?: boolean;
  previewType?: "image" | "pdf" | "outline";
  previewFallbackReason?: string;
  error?: string;
};

type LogsResponse = {
  taskId: string;
  logs: Array<{ time: string; level: "info" | "warn" | "error"; message: string }>;
};

type PreviewResponse = {
  taskId: string;
  available: boolean;
  type: "image" | "pdf" | "outline";
  slideCount: number;
  slides: Array<{ index: number; imageUrl?: string }>;
  fallbackReason?: string;
};

type CreatedTask = {
  taskId: string;
  sampleName: string;
};

const samples = [
  {
    name: "academic-ppt-e2e-source-a.txt",
    type: "text/plain",
    content:
      "Title: Robust Local Evaluation for Academic PPT\n\nAbstract: This test source describes a queue, checkpoint, repair, preview, and download workflow for a research presentation. The method checks task scheduling, cancellation, logs, and generated slides. Results should summarize reliability risks and deployment readiness."
  },
  {
    name: "academic-ppt-e2e-source-b.md",
    type: "text/markdown",
    content:
      "# Queue Stability Study\n\n## Background\nLong academic PPT generation jobs need durable task records and bounded concurrency.\n\n## Method\nWe verify queued tasks, cancellation, logs, and preview fallback.\n\n## Conclusion\nA local repository check improves deployment confidence."
  },
  {
    name: "academic-ppt-e2e-source-c.tex",
    type: "application/x-tex",
    content:
      "\\title{Academic PPT Queue Validation}\\begin{abstract}This document validates local production queue behavior for academic slides.\\end{abstract}\\section{Method}We create multiple tasks and ensure bounded execution.\\section{Result}The workflow should produce a downloadable PPTX or a resumable failure."
  }
];

const settings = {
  templateStyle: "blue_tech",
  aspectRatio: "16:9",
  outputLanguage: "zh",
  targetSlides: 6,
  detailLevel: "concise",
  informationDensity: "low",
  enableVisualQa: true,
  enableIconDecoration: true,
  visualQaEnabled: true,
  deepResearchEnabled: false,
  iconSearchEnabled: true,
  extraRequirements: "本地端到端稳定性验证，请保持每页内容简洁。"
};

function maxConcurrentTasks() {
  const raw = Number(process.env.ACADEMIC_PPT_MAX_CONCURRENT_TASKS || 1);
  if (!Number.isFinite(raw)) return 1;
  return Math.min(Math.max(Math.floor(raw), 1), 2);
}

function taskDir(taskId: string) {
  if (!taskIdPattern.test(taskId)) throw new Error(`unsafe task id: ${taskId}`);
  return path.join(process.cwd(), "data", "academic-ppt", "tasks", taskId);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) {
    throw new Error(`${init?.method || "GET"} ${url} failed: ${response.status} ${body.message || ""}`.trim());
  }
  return body;
}

async function createTask(sample: (typeof samples)[number]) {
  const form = new FormData();
  form.set("file", new Blob([sample.content], { type: sample.type }), sample.name);
  form.set("settings", JSON.stringify(settings));

  const startedAt = Date.now();
  const created = await readJson<{ taskId: string; status: TaskStatus }>(`${baseUrl}/api/smart-tools/academic-ppt/tasks`, {
    method: "POST",
    body: form
  });
  const durationMs = Date.now() - startedAt;
  if (!taskIdPattern.test(created.taskId)) throw new Error(`create returned invalid taskId: ${created.taskId}`);
  if (created.status !== "queued") throw new Error(`create returned ${created.status}, expected queued`);
  if (durationMs > 15_000) throw new Error(`create took ${durationMs}ms; POST /tasks should return quickly`);
  return { taskId: created.taskId, sampleName: sample.name, durationMs };
}

async function getTask(taskId: string) {
  return readJson<TaskSnapshot>(`${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}`);
}

async function getLogs(taskId: string) {
  return readJson<LogsResponse>(`${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/logs?limit=100`);
}

async function cancelTask(taskId: string) {
  return readJson<{ taskId: string; status: TaskStatus; task?: TaskSnapshot }>(
    `${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/cancel`,
    { method: "POST" }
  );
}

async function resumeTask(taskId: string) {
  return readJson<{ taskId: string; status: TaskStatus; task?: TaskSnapshot }>(
    `${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/resume`,
    { method: "POST" }
  );
}

async function getPreview(taskId: string) {
  return readJson<PreviewResponse>(`${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/preview`);
}

async function verifyDownload(taskId: string) {
  const response = await fetch(`${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/download`);
  if (!response.ok) throw new Error(`download failed for ${taskId}: ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("presentationml.presentation")) {
    throw new Error(`download content-type was ${contentType || "<empty>"}`);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength <= 0) throw new Error("download returned empty PPTX");
  return bytes.byteLength;
}

function assertNoSensitiveLogs(logs: LogsResponse) {
  const sensitivePattern = /(API_KEY|Authorization|Bearer\s+[A-Za-z0-9._-]+|Base URL|[A-Za-z]:\\|\/(?:Users|home|var|tmp|mnt)\/|process\.env|SECRET|TOKEN|PASSWORD)/i;
  const leaked = logs.logs.find((log) => sensitivePattern.test(log.message));
  if (leaked) throw new Error(`sensitive log content detected: ${leaked.message.slice(0, 120)}`);
  if (logs.logs.length > 100) throw new Error(`logs endpoint returned ${logs.logs.length} entries, expected <= 100`);
}

function countActive(snapshots: TaskSnapshot[]) {
  return snapshots.filter((snapshot) => snapshot.status === "pending" || snapshot.status === "running").length;
}

async function cleanupCreatedTasks(tasks: CreatedTask[]) {
  if (keepTasks) {
    console.log(`kept ${tasks.length} e2e task directories because ACADEMIC_PPT_E2E_KEEP_TASKS=1`);
    return;
  }

  for (const task of tasks) {
    try {
      const snapshot = await getTask(task.taskId).catch(() => undefined);
      if (snapshot && snapshot.status !== "success" && snapshot.status !== "failed" && snapshot.status !== "cancelled") {
        await cancelTask(task.taskId).catch(() => undefined);
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const next = await getTask(task.taskId).catch(() => undefined);
          if (!next || next.status === "cancelled" || next.status === "failed" || next.status === "success") break;
          await delay(1000);
        }
      }
      await rm(taskDir(task.taskId), { recursive: true, force: true });
    } catch (error) {
      console.warn(`cleanup skipped for ${task.taskId}: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }
}

async function main() {
  const created: CreatedTask[] = [];
  const maxConcurrent = maxConcurrentTasks();
  console.log(`academic-ppt e2e target=${baseUrl} maxConcurrent=${maxConcurrent}`);

  try {
    await readJson<{ tasks: unknown[] }>(`${baseUrl}/api/smart-tools/academic-ppt/tasks?limit=1`);

    const creationResults = [];
    for (const sample of samples) {
      const result = await createTask(sample);
      created.push({ taskId: result.taskId, sampleName: sample.name });
      creationResults.push(result);
    }
    console.log(
      `created tasks: ${creationResults.map((task) => `${task.taskId}:${task.durationMs}ms`).join(", ")}`
    );

    let snapshots = await Promise.all(created.map((task) => getTask(task.taskId)));
    if (countActive(snapshots) > maxConcurrent) {
      throw new Error(`active tasks ${countActive(snapshots)} exceeded max concurrency ${maxConcurrent}`);
    }

    const queuedCandidates = snapshots.filter((snapshot) => snapshot.status === "queued");
    if (queuedCandidates.length === 0) {
      throw new Error(`expected at least one queued task, got ${snapshots.map((item) => item.status).join(", ")}`);
    }

    const cancelTargets = queuedCandidates.slice(0, Math.max(1, queuedCandidates.length - 1));
    for (const target of cancelTargets) {
      const cancelled = await cancelTask(target.taskId);
      const status = cancelled.task?.status || cancelled.status;
      if (status !== "cancelled") throw new Error(`queued cancel returned ${status} for ${target.taskId}`);
    }
    console.log(`cancelled queued tasks: ${cancelTargets.map((task) => task.taskId).join(", ")}`);

    let resumedTaskId: string | undefined;
    let successfulTask: TaskSnapshot | undefined;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      snapshots = await Promise.all(created.map((task) => getTask(task.taskId)));
      const activeCount = countActive(snapshots);
      if (activeCount > maxConcurrent) {
        throw new Error(`active tasks ${activeCount} exceeded max concurrency ${maxConcurrent}`);
      }

      successfulTask = snapshots.find((snapshot) => snapshot.status === "success" && (snapshot.slideCount || 0) > 0);
      if (successfulTask) break;

      const resumableFailure = snapshots.find(
        (snapshot) => snapshot.status === "failed" && snapshot.resumable && snapshot.taskId !== resumedTaskId
      );
      if (resumableFailure) {
        const resumed = await resumeTask(resumableFailure.taskId);
        if (resumed.status !== "queued") throw new Error(`resume returned ${resumed.status}, expected queued`);
        resumedTaskId = resumableFailure.taskId;
        console.log(`resumed failed task: ${resumableFailure.taskId}`);
      }

      await delay(pollIntervalMs);
    }

    if (!successfulTask) {
      throw new Error(`no task reached success within ${timeoutMs}ms`);
    }

    if (!successfulTask.slideCount || successfulTask.slideCount <= 0) throw new Error("success task has no slides");
    const downloadBytes = await verifyDownload(successfulTask.taskId);
    const preview = await getPreview(successfulTask.taskId);
    if (!preview.type) throw new Error("preview response missing type");
    if (!preview.available && preview.type !== "outline" && !preview.fallbackReason) {
      throw new Error("preview is unavailable without a clear fallback");
    }
    const logs = await getLogs(successfulTask.taskId);
    assertNoSensitiveLogs(logs);

    console.log(
      [
        "academic-ppt e2e passed",
        `successTask=${successfulTask.taskId}`,
        `slides=${successfulTask.slideCount}`,
        `downloadBytes=${downloadBytes}`,
        `preview=${preview.available ? preview.type : `fallback:${preview.type}`}`,
        `logs=${logs.logs.length}`
      ].join(" ")
    );
  } finally {
    await cleanupCreatedTasks(created);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "academic-ppt e2e failed");
  process.exit(1);
});
