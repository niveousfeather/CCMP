import { rm } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const baseUrl = (process.env.ACADEMIC_PPT_TEST_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
const pollIntervalMs = Number(process.env.ACADEMIC_PPT_QUALITY_POLL_MS || 2000);
const timeoutMs = Number(process.env.ACADEMIC_PPT_QUALITY_TIMEOUT_MS || 12 * 60 * 1000);
const keepTasks = process.env.ACADEMIC_PPT_QUALITY_KEEP_TASKS === "1";
const taskIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TaskStatus = "queued" | "pending" | "running" | "success" | "failed" | "cancelled";
type TemplateStyle = "academic_clean" | "blue_tech" | "research_report" | "course_presentation";

type TaskSnapshot = {
  taskId: string;
  status: TaskStatus;
  progress?: number;
  error?: string;
  resumable?: boolean;
  slideCount?: number;
  outputFileSize?: number;
  templateId?: string;
  templateStyle?: TemplateStyle;
  modelSource?: "nexus-model" | "local-fallback";
  qualityScore?: number;
  visualQaScore?: number;
  visualQaIssuesCount?: number;
  previewType?: "image" | "pdf" | "outline";
  previewFallbackReason?: string;
  downloadUrl?: string;
  visualQaEnabled?: boolean;
  iconDecorationEnabled?: boolean;
  researchEnabled?: boolean;
  externalResearchEnabled?: boolean;
  researchStatus?: "skipped" | "success" | "degraded" | "failed";
  researchSourcesCount?: number;
  researchFallbackReason?: string;
  modelCriticStatus?: "skipped" | "success" | "degraded" | "failed";
  modelCriticScore?: number;
  modelCriticRounds?: number;
  autoRepairRounds?: number;
  autoRepairApplied?: boolean;
  finalQualityScore?: number;
  finalVisualQaScore?: number;
};

type PreviewResponse = {
  taskId: string;
  available: boolean;
  type: "image" | "pdf" | "outline";
  slideCount: number;
  fallbackReason?: string;
};

type Scenario = {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  templateStyle: TemplateStyle;
  outputLanguage: "zh" | "en";
  targetSlides: number;
  detailLevel: "concise" | "standard" | "detailed";
  informationDensity: "low" | "normal" | "high";
  enableVisualQa: boolean;
  enableIconDecoration: boolean;
  enableDeepResearch: boolean;
  enableExternalResearch: boolean;
  content: string;
};

const scenarios: Scenario[] = [
  {
    id: "paper-abstract",
    name: "论文摘要型",
    fileName: "academic-ppt-quality-paper.txt",
    mimeType: "text/plain",
    templateStyle: "academic_clean",
    outputLanguage: "zh",
    targetSlides: 8,
    detailLevel: "standard",
    informationDensity: "normal",
    enableVisualQa: true,
    enableIconDecoration: true,
    enableDeepResearch: true,
    enableExternalResearch: false,
    content:
      "题目：多模态检索增强生成在科研问答中的鲁棒性研究。\n摘要：本文研究多模态检索增强生成系统在学术问答场景中的鲁棒性。研究背景是现有模型面对跨表格、图像和长文本证据时容易产生幻觉。方法包括证据检索、跨模态对齐、答案校验和引用一致性检查。实验使用公开论文问答数据集和自建消融任务，评价指标包括准确率、一致性、引用覆盖率和响应延迟。结果显示，加入证据校验后回答一致性提升，错误引用下降。局限性包括数据规模有限和图像证据质量不稳定。未来工作将扩展到实验图表和公式推理。"
  },
  {
    id: "tech-proposal",
    name: "技术方案型",
    fileName: "academic-ppt-quality-tech.md",
    mimeType: "text/markdown",
    templateStyle: "blue_tech",
    outputLanguage: "zh",
    targetSlides: 9,
    detailLevel: "concise",
    informationDensity: "low",
    enableVisualQa: true,
    enableIconDecoration: true,
    enableDeepResearch: false,
    enableExternalResearch: false,
    content:
      "# 面向长任务的学术 PPT 生成架构方案\n\n## 背景\n长时间 PPT 生成需要稳定队列、任务锁、checkpoint 和可恢复执行。\n\n## 方法\n系统包含上传解析、任务仓库、队列调度、模型大纲生成、模板化 writer、预览降级和质量检查。\n\n## 架构\n前端只访问 academic-ppt API，后端使用独立任务目录保存 task.json、logs、outputs 和 previews。\n\n## 结果\n方案可以限制并发，减少 API 超时风险，并支持失败后继续生成。\n\n## 计划\n下一阶段优化模板效果、回归测试和部署前自检。"
  },
  {
    id: "experiment-report",
    name: "实验报告型",
    fileName: "academic-ppt-quality-experiment.txt",
    mimeType: "text/plain",
    templateStyle: "research_report",
    outputLanguage: "en",
    targetSlides: 10,
    detailLevel: "detailed",
    informationDensity: "normal",
    enableVisualQa: true,
    enableIconDecoration: false,
    enableDeepResearch: true,
    enableExternalResearch: true,
    content:
      "Title: Experiment Report on Retrieval Quality. Background: We evaluate a retrieval pipeline for academic presentation generation. Method: The system extracts source text, plans an outline, repairs dense slides, exports PPTX, and runs visual QA. Experiment setup: four scenarios are tested, including abstract, technical proposal, experiment report, and course lecture. Metrics include slide count deviation, quality score, visual QA score, preview fallback, and download success. Results: the template-aware planner improves layout diversity, while text truncation reduces overflow risk. Ablation: disabling visual hints makes method and result slides harder to inspect. Limitation: native preview depends on local conversion tools. Future work: add SVG preview and visual critic."
  },
  {
    id: "course-presentation",
    name: "课程汇报型",
    fileName: "academic-ppt-quality-course.tex",
    mimeType: "application/x-tex",
    templateStyle: "course_presentation",
    outputLanguage: "zh",
    targetSlides: 7,
    detailLevel: "standard",
    informationDensity: "normal",
    enableVisualQa: false,
    enableIconDecoration: true,
    enableDeepResearch: false,
    enableExternalResearch: true,
    content:
      "\\title{人工智能课程汇报：检索增强生成}\\begin{abstract}本课程汇报介绍检索增强生成的基本概念、系统流程、应用场景和风险控制。\\end{abstract}\\section{背景}大模型在知识密集型任务中需要外部证据支持。\\section{方法}典型流程包括查询改写、文档检索、证据排序、答案生成和事实校验。\\section{实验}课堂示例比较无检索和有检索两种模式在准确性与可解释性上的差异。\\section{结果}检索增强能提升引用覆盖率，但也引入检索噪声。\\section{总结}学生需要理解系统边界、评价指标和负责任使用。"
  }
];

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
      detailLevel: scenario.detailLevel,
      informationDensity: scenario.informationDensity,
      enableVisualQa: scenario.enableVisualQa,
      enableIconDecoration: scenario.enableIconDecoration,
      enableDeepResearch: scenario.enableDeepResearch,
      enableExternalResearch: scenario.enableExternalResearch,
      visualQaEnabled: scenario.enableVisualQa,
      deepResearchEnabled: scenario.enableDeepResearch,
      externalResearchEnabled: scenario.enableExternalResearch,
      iconSearchEnabled: scenario.enableIconDecoration,
      extraRequirements: `质量回归样例：${scenario.name}。请优先使用模板化 layout，控制文字溢出。`
    })
  );

  const startedAt = Date.now();
  const created = await readJson<{ taskId: string; status: TaskStatus }>(`${baseUrl}/api/smart-tools/academic-ppt/tasks`, {
    method: "POST",
    body: form
  });
  const durationMs = Date.now() - startedAt;
  if (!taskIdPattern.test(created.taskId)) throw new Error(`${scenario.id}: invalid task id ${created.taskId}`);
  if (created.status !== "queued") throw new Error(`${scenario.id}: create returned ${created.status}, expected queued`);
  if (durationMs > 15_000) throw new Error(`${scenario.id}: create took ${durationMs}ms`);
  return created.taskId;
}

async function getTask(taskId: string) {
  return readJson<TaskSnapshot>(`${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}`);
}

async function getPreview(taskId: string) {
  return readJson<PreviewResponse>(`${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/preview`);
}

async function download(taskId: string) {
  const response = await fetch(`${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/download`);
  if (!response.ok) return { ok: false, bytes: 0 };
  const bytes = await response.arrayBuffer();
  return { ok: bytes.byteLength > 0, bytes: bytes.byteLength };
}

async function cancelTask(taskId: string) {
  await readJson(`${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/cancel`, { method: "POST" }).catch(() => undefined);
}

async function waitForTerminal(taskId: string) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await getTask(taskId);
    if (snapshot.status === "success" || snapshot.status === "failed" || snapshot.status === "cancelled") return snapshot;
    await delay(pollIntervalMs);
  }
  throw new Error(`${taskId}: did not finish within ${timeoutMs}ms`);
}

async function cleanup(taskIds: string[]) {
  if (keepTasks) {
    console.log(`kept ${taskIds.length} quality regression tasks because ACADEMIC_PPT_QUALITY_KEEP_TASKS=1`);
    for (const taskId of taskIds) {
      console.log(
        `retained task ${taskId}: download=${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/download snapshot=${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}`
      );
    }
    return;
  }
  for (const taskId of taskIds) {
    const snapshot = await getTask(taskId).catch(() => undefined);
    if (snapshot && snapshot.status !== "success" && snapshot.status !== "failed" && snapshot.status !== "cancelled") {
      await cancelTask(taskId);
      await delay(1000);
    }
    await rm(taskDir(taskId), { recursive: true, force: true }).catch(() => undefined);
  }
}

async function main() {
  const created: string[] = [];
  const rows: Array<Record<string, string | number | boolean | undefined>> = [];
  console.log(`academic-ppt quality regression target=${baseUrl}`);
  await readJson<{ tasks: unknown[] }>(`${baseUrl}/api/smart-tools/academic-ppt/tasks?limit=1`);

  try {
    for (const scenario of scenarios) {
      const taskId = await createTask(scenario);
      created.push(taskId);
      const snapshot = await waitForTerminal(taskId);
      const preview = snapshot.status === "success" ? await getPreview(taskId) : undefined;
      const downloaded = snapshot.status === "success" ? await download(taskId) : { ok: false, bytes: 0 };
      rows.push({
        scenario: scenario.name,
        taskId,
        status: snapshot.status,
        templateStyle: scenario.templateStyle,
        templateId: snapshot.templateId,
        slideCount: snapshot.slideCount,
        qualityScore: snapshot.qualityScore,
        visualQaScore: snapshot.visualQaScore,
        visualQaIssuesCount: snapshot.visualQaIssuesCount,
        visualQaEnabled: snapshot.visualQaEnabled,
        iconDecorationEnabled: snapshot.iconDecorationEnabled,
        researchEnabled: snapshot.researchEnabled,
        externalResearchEnabled: snapshot.externalResearchEnabled,
        researchStatus: snapshot.researchStatus,
        researchSourcesCount: snapshot.researchSourcesCount,
        researchFallbackReason: snapshot.researchFallbackReason,
        modelCriticStatus: snapshot.modelCriticStatus,
        modelCriticScore: snapshot.modelCriticScore,
        modelCriticRounds: snapshot.modelCriticRounds,
        autoRepairRounds: snapshot.autoRepairRounds,
        autoRepairApplied: snapshot.autoRepairApplied,
        finalQualityScore: snapshot.finalQualityScore,
        finalVisualQaScore: snapshot.finalVisualQaScore,
        previewType: preview?.available ? preview.type : snapshot.previewType || preview?.type,
        outputFileSize: snapshot.outputFileSize || downloaded.bytes,
        downloaded: downloaded.ok,
        fallback: snapshot.modelSource === "local-fallback",
        slideCountDrift: Math.abs((snapshot.slideCount || 0) - scenario.targetSlides),
        downloadUrl: keepTasks
          ? `${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/download`
          : undefined
      });
      const slideCountDrift = Math.abs((snapshot.slideCount || 0) - scenario.targetSlides);
      if (slideCountDrift > Math.max(5, Math.ceil(scenario.targetSlides * 0.7))) {
        throw new Error(`${scenario.id}: slideCountDrift too high: ${slideCountDrift}`);
      }
      if ((snapshot.finalQualityScore ?? snapshot.qualityScore ?? 0) + 8 < (snapshot.qualityScore ?? 0)) {
        throw new Error(`${scenario.id}: finalQualityScore dropped too much`);
      }
      if (snapshot.modelCriticStatus === "degraded" && snapshot.status !== "success") {
        throw new Error(`${scenario.id}: degraded model critic should not fail task`);
      }
      if (snapshot.autoRepairApplied && !downloaded.ok) {
        throw new Error(`${scenario.id}: autoRepairApplied but PPTX download failed`);
      }
      if ((snapshot.outputFileSize || downloaded.bytes) < 24 * 1024) {
        throw new Error(`${scenario.id}: outputFileSize is too small`);
      }
      if (snapshot.modelSource === "local-fallback" && (snapshot.slideCount || 0) <= 1) {
        throw new Error(`${scenario.id}: fallback produced an empty-looking deck`);
      }
      if (snapshot.status !== "success") {
        throw new Error(`${scenario.id}: task failed: ${snapshot.error || "unknown error"}`);
      }
      if (!downloaded.ok) throw new Error(`${scenario.id}: download failed`);
    }

    console.table(rows);
    console.log("academic-ppt quality regression passed");
  } finally {
    await cleanup(created);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "academic-ppt quality regression failed");
  process.exit(1);
});
