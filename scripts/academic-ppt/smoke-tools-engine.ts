import { rm } from "node:fs/promises";
import path from "node:path";

const DEFAULT_APP_URL = "http://127.0.0.1:3099";
const DEFAULT_ENGINE_URL = "http://127.0.0.1:8010";
const appUrl = (process.env.ACADEMIC_PPT_TEST_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL).replace(/\/$/, "");
const engineUrl = (process.env.AI_TOOLS_ENGINE_URL || DEFAULT_ENGINE_URL).replace(/\/$/, "");
const keepTasks = process.env.ACADEMIC_PPT_SMOKE_KEEP_TASKS === "1";
const timeoutMs = Number(process.env.ACADEMIC_PPT_SMOKE_TIMEOUT_MS || 40 * 60 * 1000);
const pollMs = Number(process.env.ACADEMIC_PPT_SMOKE_POLL_MS || 3000);
const taskIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TaskStatus = "queued" | "pending" | "running" | "success" | "failed" | "cancelled";

type TaskSnapshot = {
  taskId: string;
  status: TaskStatus;
  currentStep?: string;
  error?: string;
  modelSource?: string;
  modelName?: string;
  fallbackReason?: string;
  slideCount?: number;
  outputFileSize?: number;
  downloadUrl?: string;
};

function taskDir(taskId: string) {
  if (!taskIdPattern.test(taskId)) throw new Error(`unsafe task id: ${taskId}`);
  return path.join(process.cwd(), "data", "academic-ppt", "tasks", taskId);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = typeof body?.message === "string" ? body.message : text;
    throw new Error(`${init?.method || "GET"} ${url} failed: ${response.status} ${message}`.trim());
  }
  return body as T;
}

function classifyFailure(snapshot: TaskSnapshot | undefined, error: unknown) {
  const message = snapshot?.error || (error instanceof Error ? error.message : String(error || ""));
  if (/fetch failed|ECONNREFUSED|health/i.test(message)) return `Python service unavailable: ${message}`;
  if (/dependencies are not installed|Missing:/i.test(message)) return `Dependency missing: ${message}`;
  if (/paper-ppt-agent local package was not found|import/i.test(message)) return `paper-ppt-agent import failed: ${message}`;
  if (/model bridge|model call|internal\/academic-ppt\/model/i.test(message)) return `Model bridge failed: ${message}`;
  if (/download/i.test(message)) return `Download failed: ${message}`;
  if (snapshot?.currentStep) return `Generator failed at ${snapshot.currentStep}: ${message}`;
  return `Smoke failed: ${message}`;
}

async function checkHealth() {
  const health = await readJson<{ service?: string; diagnostics?: { academicPpt?: string } }>(`${engineUrl}/health`);
  if (health.service !== "nexusai-tools-engine") {
    throw new Error("Python service unavailable: /health did not return nexusai-tools-engine.");
  }
  console.log(`tools-engine health ok academicPpt=${health.diagnostics?.academicPpt || "unknown"}`);
}

async function createTask() {
  const form = new FormData();
  const content = [
    "# Local Tools Engine Smoke",
    "",
    "## Background",
    "This smoke verifies that NexusAI creates a task, the Python Tools Engine handles generation, and the final PPTX is downloadable.",
    "",
    "## Method",
    "The source contains a concise academic narrative with motivation, method, result, and conclusion.",
    "",
    "## Result",
    "The expected result is a PPTX generated through the configured generation service rather than local fallback."
  ].join("\n");
  form.set("file", new Blob([content], { type: "text/markdown" }), "academic-ppt-tools-engine-smoke.md");
  form.set(
    "settings",
    JSON.stringify({
      templateStyle: "academic_clean",
      aspectRatio: "16:9",
      outputLanguage: "zh",
      targetSlides: 4,
      detailLevel: "concise",
      informationDensity: "low",
      enableVisualQa: false,
      enableIconDecoration: false,
      enableDeepResearch: false,
      enableExternalResearch: false,
      extraRequirements: "Local smoke test. Keep the deck short and formal."
    })
  );
  const created = await readJson<{ taskId: string; status: TaskStatus }>(`${appUrl}/api/smart-tools/academic-ppt/tasks`, {
    method: "POST",
    body: form
  });
  if (!taskIdPattern.test(created.taskId)) throw new Error(`Invalid task id: ${created.taskId}`);
  if (created.status !== "queued") throw new Error(`Create returned ${created.status}, expected queued.`);
  return created.taskId;
}

async function getTask(taskId: string) {
  return readJson<TaskSnapshot>(`${appUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}`);
}

async function getTaskEventually(taskId: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      return await getTask(taskId);
    } catch (error) {
      lastError = error;
      if (!/failed: 404/i.test(error instanceof Error ? error.message : String(error))) throw error;
      await delay(250 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Task snapshot was not visible after creation.");
}

async function cancelTask(taskId: string) {
  await fetch(`${appUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST"
  }).catch(() => undefined);
}

async function verifyDownload(taskId: string) {
  const response = await fetch(`${appUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/download`);
  if (!response.ok) throw new Error(`download failed: ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength <= 0) throw new Error("download failed: empty PPTX");
  return bytes.byteLength;
}

async function cleanup(taskId: string | undefined) {
  if (!taskId || keepTasks) {
    if (taskId) console.log(`kept smoke task ${taskId} because ACADEMIC_PPT_SMOKE_KEEP_TASKS=1`);
    return;
  }
  const snapshot = await getTask(taskId).catch(() => undefined);
  if (snapshot?.status === "queued" || snapshot?.status === "pending" || snapshot?.status === "running") {
    await cancelTask(taskId);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const next = await getTask(taskId).catch(() => undefined);
      if (!next || next.status === "cancelled" || next.status === "failed" || next.status === "success") break;
      await delay(1000);
    }
  }
  await rm(taskDir(taskId), { recursive: true, force: true }).catch(() => undefined);
}

async function main() {
  let taskId: string | undefined;
  let lastSnapshot: TaskSnapshot | undefined;
  try {
    console.log(`academic-ppt tools-engine smoke app=${appUrl} engine=${engineUrl}`);
    await checkHealth();
    taskId = await createTask();
    console.log(`created task ${taskId}`);

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      lastSnapshot = await getTaskEventually(taskId);
      if (lastSnapshot.status === "success") break;
      if (lastSnapshot.status === "failed" || lastSnapshot.status === "cancelled") {
        throw new Error(classifyFailure(lastSnapshot, lastSnapshot.error || lastSnapshot.status));
      }
      await delay(pollMs);
    }

    if (!lastSnapshot || lastSnapshot.status !== "success") {
      throw new Error(classifyFailure(lastSnapshot, `Task did not finish within ${timeoutMs}ms.`));
    }
    if (lastSnapshot.modelSource === "local-fallback") {
      throw new Error("Generator failed: task used local fallback instead of the generation service.");
    }
    if (lastSnapshot.modelSource !== "paper-ppt-agent") {
      throw new Error(`Generator failed: unexpected modelSource=${lastSnapshot.modelSource || "<empty>"}.`);
    }
    if (!lastSnapshot.outputFileSize || lastSnapshot.outputFileSize <= 0) {
      throw new Error("Generator failed: outputFileSize missing.");
    }
    const bytes = await verifyDownload(taskId);
    console.log(
      [
        "academic-ppt tools-engine smoke passed",
        `taskId=${taskId}`,
        `slides=${lastSnapshot.slideCount || "unknown"}`,
        `downloadBytes=${bytes}`,
        `modelSource=${lastSnapshot.modelSource}`
      ].join(" ")
    );
  } catch (error) {
    console.error(classifyFailure(lastSnapshot, error));
    process.exitCode = 1;
  } finally {
    await cleanup(taskId);
  }
}

main();
