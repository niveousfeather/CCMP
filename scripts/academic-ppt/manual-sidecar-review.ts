import { access, rm, stat } from "node:fs/promises";
import path from "node:path";

const DEFAULT_APP_URL = "http://127.0.0.1:3099";
const baseUrl = (process.env.ACADEMIC_PPT_TEST_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL).replace(/\/$/, "");
const keepTasks = process.env.ACADEMIC_PPT_SIDEcar_REVIEW_KEEP_TASKS === "1";
const timeoutMs = Number(process.env.ACADEMIC_PPT_SIDECAR_REVIEW_TIMEOUT_MS || 40 * 60 * 1000);
const pollMs = Number(process.env.ACADEMIC_PPT_SIDECAR_REVIEW_POLL_MS || 3000);
const maxAttempts = Number(process.env.ACADEMIC_PPT_SIDECAR_REVIEW_ATTEMPTS || 2);
const scenarioFilter = process.env.ACADEMIC_PPT_SIDECAR_REVIEW_SCENARIO?.trim();
const taskIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const outputRelativePath = "outputs/academic-ppt-result.pptx";

type TaskStatus = "queued" | "pending" | "running" | "success" | "failed" | "cancelled";
type TemplateStyle = "academic_clean" | "blue_tech" | "research_report" | "course_presentation";

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

type Scenario = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  templateStyle: TemplateStyle;
  outputLanguage: "zh" | "en";
  targetSlides: number;
  content: string;
};

const scenarios: Scenario[] = [
  {
    id: "zh-paper-abstract",
    title: "中文论文摘要",
    fileName: "manual-review-zh-paper.md",
    mimeType: "text/markdown",
    templateStyle: "academic_clean",
    outputLanguage: "zh",
    targetSlides: 5,
    content: [
      "# 多源证据约束的学术问答系统",
      "",
      "## 摘要",
      "本文研究在学术问答场景中如何降低大模型幻觉。系统将论文、表格和实验图像统一切分为可追踪证据片段，并在回答生成前进行证据覆盖检查。",
      "",
      "## 方法",
      "方法包括文档解析、证据检索、跨模态对齐、答案生成和一致性校验。每个答案都保留证据编号，避免把未验证内容写成确定结论。",
      "",
      "## 实验",
      "实验使用公开论文问答集合和自建消融任务，指标包括准确率、引用覆盖率、一致性得分和响应延迟。",
      "",
      "## 结果与局限",
      "结果显示证据约束可以提升可信度，但会增加检索成本。局限包括图像证据质量不稳定、长文档索引成本较高，以及复杂公式推理仍需人工校验。"
    ].join("\n")
  },
  {
    id: "zh-tech-proposal",
    title: "中文技术方案",
    fileName: "manual-review-zh-tech.md",
    mimeType: "text/markdown",
    templateStyle: "blue_tech",
    outputLanguage: "zh",
    targetSlides: 5,
    content: [
      "# 本地长任务生成稳定架构方案",
      "",
      "## 背景",
      "学术 PPT 生成是长任务，涉及上传、解析、模型调用、页面生成、导出和下载。单个 HTTP 请求不能承载完整生成过程。",
      "",
      "## 架构",
      "前端只调用 Next.js API。Next.js 负责创建任务、排队、日志、取消、继续和下载。统一工具服务负责真实 PPT 生成，并把结果写回任务目录。",
      "",
      "## 关键机制",
      "任务目录包含 task.json、logs.json、uploads、checkpoints、outputs 和 previews。每个阶段写 checkpoint，任务失败后可从最近完成阶段继续。",
      "",
      "## 风险控制",
      "生成服务不可用时必须明确失败或进入受限兜底模式。前端不展示服务内部实现、密钥、请求编号或本地路径。",
      "",
      "## 验收指标",
      "任务应快速返回 taskId，状态从 queued 到 running 再到 success，最终 PPTX 可下载，且不会落回占位式本地生成器。"
    ].join("\n")
  },
  {
    id: "en-paper-abstract",
    title: "English paper abstract",
    fileName: "manual-review-en-paper.md",
    mimeType: "text/markdown",
    templateStyle: "research_report",
    outputLanguage: "en",
    targetSlides: 5,
    content: [
      "# Template-Aware Generation for Academic Presentations",
      "",
      "## Abstract",
      "This study evaluates whether template-aware planning improves automatically generated academic presentations. The pipeline parses source text, produces a manuscript, creates a design specification, generates slide graphics, and exports a PowerPoint file.",
      "",
      "## Method",
      "We compare a structured generation path with a limited local fallback. The evaluation focuses on slide count, download reliability, visual consistency, text overflow, and whether method and result pages contain meaningful visual structure.",
      "",
      "## Results",
      "The primary generation path produces more recognizable presentation layouts and avoids the wireframe look of earlier fallback output. Native preview may degrade when local conversion tools are unavailable, but PPTX download remains the critical acceptance path.",
      "",
      "## Limitations",
      "The current review is local and small-scale. Future work should add broader document coverage, image-level visual review, and stronger template selection controls."
    ].join("\n")
  }
];

function taskDir(taskId: string) {
  if (!taskIdPattern.test(taskId)) throw new Error(`unsafe task id: ${taskId}`);
  return path.join(process.cwd(), "data", "academic-ppt", "tasks", taskId);
}

function outputPath(taskId: string) {
  return path.join(taskDir(taskId), outputRelativePath);
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
  if (/fetch failed|ECONNREFUSED|health/i.test(message)) return `Service unavailable: ${message}`;
  if (/dependencies are not installed|Missing:/i.test(message)) return `Dependency missing: ${message}`;
  if (/model bridge|model call|internal\/academic-ppt\/model/i.test(message)) return `Model bridge failed: ${message}`;
  if (/download/i.test(message)) return `Download failed: ${message}`;
  if (snapshot?.currentStep) return `Generator failed at ${snapshot.currentStep}: ${message}`;
  return `Manual sidecar review failed: ${message}`;
}

async function createTask(scenario: Scenario) {
  const form = new FormData();
  form.set("file", new Blob([scenario.content], { type: scenario.mimeType }), scenario.fileName);
  form.set(
    "settings",
    JSON.stringify({
      templateStyle: scenario.templateStyle,
      aspectRatio: "16:9",
      outputLanguage: scenario.outputLanguage,
      targetSlides: scenario.targetSlides,
      detailLevel: "concise",
      informationDensity: "low",
      enableVisualQa: false,
      enableIconDecoration: true,
      enableDeepResearch: false,
      enableExternalResearch: false,
      extraRequirements: `Manual generation review: ${scenario.title}. Keep the deck concise and readable.`
    })
  );
  const created = await readJson<{ taskId: string; status: TaskStatus }>(`${baseUrl}/api/smart-tools/academic-ppt/tasks`, {
    method: "POST",
    body: form
  });
  if (!taskIdPattern.test(created.taskId)) throw new Error(`${scenario.id}: invalid task id ${created.taskId}`);
  if (created.status !== "queued") throw new Error(`${scenario.id}: expected queued, got ${created.status}`);
  return created.taskId;
}

async function getTask(taskId: string) {
  return readJson<TaskSnapshot>(`${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}`);
}

async function cancelTask(taskId: string) {
  await fetch(`${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST"
  }).catch(() => undefined);
}

async function verifyDownload(taskId: string) {
  const response = await fetch(`${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/download`);
  if (!response.ok) throw new Error(`download failed: ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength <= 0) throw new Error("download failed: empty PPTX");
  return bytes.byteLength;
}

function isTransientFailure(snapshot: TaskSnapshot) {
  const message = `${snapshot.error || ""} ${snapshot.currentStep || ""}`;
  if (/dependencies are not installed|Missing:|local-fallback/i.test(message)) return false;
  return /PROVIDER_ERROR_5\d\d|timeout|temporar|model bridge|model call|Task failed/i.test(message);
}

async function waitForTerminal(taskId: string) {
  const deadline = Date.now() + timeoutMs;
  let snapshot: TaskSnapshot | undefined;
  let statusReadFailures = 0;
  while (Date.now() < deadline) {
    try {
      snapshot = await getTask(taskId);
      statusReadFailures = 0;
    } catch (error) {
      statusReadFailures += 1;
      if (statusReadFailures >= 5) throw error;
      await delay(pollMs);
      continue;
    }
    if (snapshot.status === "success" || snapshot.status === "failed" || snapshot.status === "cancelled") return snapshot;
    await delay(pollMs);
  }
  throw new Error(classifyFailure(snapshot, `Task did not finish within ${timeoutMs}ms.`));
}

async function cleanup(taskIds: string[]) {
  if (keepTasks) return;
  for (const taskId of taskIds) {
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
}

async function main() {
  const created: string[] = [];
  const rows: Array<Record<string, string | number>> = [];
  let lastSnapshot: TaskSnapshot | undefined;

  try {
    console.log(`academic-ppt manual sidecar review target=${baseUrl}`);
    await readJson<{ tasks: unknown[] }>(`${baseUrl}/api/smart-tools/academic-ppt/tasks?limit=1`);

    const selectedScenarios = scenarioFilter ? scenarios.filter((scenario) => scenario.id === scenarioFilter) : scenarios;
    if (!selectedScenarios.length) throw new Error(`Unknown manual sidecar review scenario: ${scenarioFilter}`);

    for (const scenario of selectedScenarios) {
      let lastFailure: TaskSnapshot | undefined;
      let successfulTaskId = "";
      for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
        const taskId = await createTask(scenario);
        created.push(taskId);
        console.log(`created ${scenario.id} task ${taskId} attempt=${attempt}`);
        lastSnapshot = await waitForTerminal(taskId);
        if (lastSnapshot.status === "success") {
          successfulTaskId = taskId;
          break;
        }
        lastFailure = lastSnapshot;
        if (!isTransientFailure(lastSnapshot) || attempt >= maxAttempts) {
          throw new Error(classifyFailure(lastSnapshot, lastSnapshot.error || lastSnapshot.status));
        }
        console.warn(`${scenario.id}: transient generation failure; retrying once.`);
      }
      if (!lastSnapshot || lastSnapshot.status !== "success") {
        throw new Error(classifyFailure(lastFailure, lastFailure?.error || "task failed"));
      }
      if (!successfulTaskId) throw new Error(`${scenario.id}: success task id was not recorded.`);
      if (lastSnapshot.modelSource === "local-fallback") {
        throw new Error(`${scenario.id}: local-fallback is not allowed for manual sidecar review.`);
      }
      if (lastSnapshot.modelSource !== "paper-ppt-agent") {
        throw new Error(`${scenario.id}: unexpected modelSource=${lastSnapshot.modelSource || "<empty>"}.`);
      }
      if (!lastSnapshot.outputFileSize || lastSnapshot.outputFileSize <= 0) {
        throw new Error(`${scenario.id}: outputFileSize missing.`);
      }
      await access(outputPath(successfulTaskId));
      const fileStat = await stat(outputPath(successfulTaskId));
      const downloadedBytes = await verifyDownload(successfulTaskId);
      const warning = lastSnapshot.outputFileSize < 30 * 1024 ? "warning: small output" : "";

      rows.push({
        scenario: scenario.title,
        taskId: successfulTaskId,
        status: lastSnapshot.status,
        modelSource: lastSnapshot.modelSource,
        generatorSource: lastSnapshot.modelSource,
        slideCount: lastSnapshot.slideCount || "unknown",
        outputFileSize: lastSnapshot.outputFileSize,
        downloadBytes: downloadedBytes,
        outputRelativePath,
        downloadUrl: `${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(successfulTaskId)}/download`,
        fileBytes: fileStat.size,
        warning
      });
    }

    console.table(rows);
    if (keepTasks) {
      console.log("manual sidecar review tasks retained for PPTX inspection.");
    } else {
      console.log("manual sidecar review passed; tasks were cleaned. Set ACADEMIC_PPT_SIDEcar_REVIEW_KEEP_TASKS=1 to keep outputs.");
    }
  } catch (error) {
    console.error(classifyFailure(lastSnapshot, error));
    process.exitCode = 1;
  } finally {
    await cleanup(created);
  }
}

main();
