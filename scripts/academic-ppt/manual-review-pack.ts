import { rm } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const baseUrl = (process.env.ACADEMIC_PPT_TEST_BASE_URL || process.env.ACADEMIC_PPT_REVIEW_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
const keepTasks = process.env.ACADEMIC_PPT_REVIEW_KEEP_TASKS === "1";
const pollIntervalMs = Number(process.env.ACADEMIC_PPT_REVIEW_POLL_MS || 2500);
const timeoutMs = Number(process.env.ACADEMIC_PPT_REVIEW_TIMEOUT_MS || 14 * 60 * 1000);
const taskIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TaskStatus = "queued" | "pending" | "running" | "success" | "failed" | "cancelled";
type TemplateStyle = "academic_clean" | "blue_tech" | "research_report" | "course_presentation";

type TaskSnapshot = {
  taskId: string;
  status: TaskStatus;
  error?: string;
  templateId?: string;
  slideCount?: number;
  qualityScore?: number;
  visualQaScore?: number;
  modelCriticStatus?: "skipped" | "success" | "degraded" | "failed";
  autoRepairRounds?: number;
  outputFileSize?: number;
  downloadUrl?: string;
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
    fileName: "manual-review-paper-abstract.txt",
    mimeType: "text/plain",
    templateStyle: "academic_clean",
    outputLanguage: "zh",
    targetSlides: 9,
    detailLevel: "standard",
    informationDensity: "normal",
    enableVisualQa: true,
    enableIconDecoration: true,
    enableDeepResearch: true,
    enableExternalResearch: false,
    content:
      "题目：多模态证据约束的科研问答系统。摘要：本文研究在学术问答场景中如何降低大模型幻觉。系统包含文档解析、证据检索、跨模态对齐、答案生成和一致性校验五个阶段。背景问题是论文、表格和实验图像经常分散在不同附件中，直接生成答案容易遗漏来源。方法上，我们提出证据片段评分、引用覆盖检查和冲突提示机制。实验采用公开论文问答集合和自建消融任务，指标包括准确率、一致性、引用覆盖率和响应延迟。结果显示，证据约束可以提升回答可信度，但会增加部分延迟。局限包括图像证据质量不稳定和长文档索引成本较高。未来工作将扩展到公式推理和实验图表理解。"
  },
  {
    id: "tech-proposal",
    name: "技术方案型",
    fileName: "manual-review-tech-proposal.md",
    mimeType: "text/markdown",
    templateStyle: "blue_tech",
    outputLanguage: "zh",
    targetSlides: 10,
    detailLevel: "concise",
    informationDensity: "low",
    enableVisualQa: true,
    enableIconDecoration: true,
    enableDeepResearch: false,
    enableExternalResearch: false,
    content:
      "# 本地长任务生成稳定架构方案\n\n## 背景\n学术 PPT 生成任务耗时较长，需要处理多人同时上传、任务排队、取消、恢复和预览降级。\n\n## 架构\n系统采用文件型任务仓库，任务目录包含 task.json、logs.json、uploads、checkpoints、outputs 和 previews。API 只负责快速创建任务和入队，后台 runner 负责解析、规划、导出和质量检查。\n\n## 并发控制\n默认同时运行 1 个任务，可通过环境变量配置上限。pending 和 queued 任务按创建时间调度。\n\n## 质量链路\n模板注册表、layout planner、text layout、PPTX writer、Visual QA 和模型 Critic 形成闭环。预览失败不会导致主任务失败。\n\n## 风险\n本地机器缺少 LibreOffice 或 pdftoppm 时，原生预览会降级为结构化预览。"
  },
  {
    id: "experiment-report",
    name: "实验报告型",
    fileName: "manual-review-experiment.txt",
    mimeType: "text/plain",
    templateStyle: "research_report",
    outputLanguage: "en",
    targetSlides: 11,
    detailLevel: "detailed",
    informationDensity: "normal",
    enableVisualQa: true,
    enableIconDecoration: false,
    enableDeepResearch: true,
    enableExternalResearch: true,
    content:
      "Title: Evaluation of Template-Aware Academic PPT Generation. Background: We evaluate whether template-aware layout planning improves generated academic decks. Method: The pipeline parses source text, creates a structured outline, repairs dense slides, exports PPTX, renders preview when tools are available, and runs visual QA. Experiment setup: five input types are tested, including abstract, technical proposal, experiment report, course presentation, and dense long text. Metrics include slide count deviation, quality score, visual QA score, download success, preview mode, and repair stability. Results: template-aware rendering improves layout diversity and makes method/result slides easier to inspect. Ablation: disabling visual hints leads to more text-only slides. Limitation: native preview depends on local conversion tools. Future work includes image-level critic and SVG preview."
  },
  {
    id: "course-presentation",
    name: "课程汇报型",
    fileName: "manual-review-course.tex",
    mimeType: "application/x-tex",
    templateStyle: "course_presentation",
    outputLanguage: "zh",
    targetSlides: 8,
    detailLevel: "standard",
    informationDensity: "normal",
    enableVisualQa: true,
    enableIconDecoration: true,
    enableDeepResearch: false,
    enableExternalResearch: false,
    content:
      "\\title{人工智能课程汇报：检索增强生成}\\begin{abstract}本课程汇报介绍检索增强生成的基本概念、系统流程、评价指标和风险控制。\\end{abstract}\\section{背景}大模型在知识密集型任务中需要外部证据支持。\\section{方法}典型流程包括查询改写、文档检索、证据排序、答案生成和事实校验。\\section{实验}课堂示例比较无检索和有检索两种模式在准确性与可解释性上的差异。\\section{结果}检索增强能提升引用覆盖率，但也会引入检索噪声。\\section{总结}学生需要理解系统边界、评价指标和负责任使用方式。"
  },
  {
    id: "dense-long-text",
    name: "长文本高密度型",
    fileName: "manual-review-dense-long-text.md",
    mimeType: "text/markdown",
    templateStyle: "blue_tech",
    outputLanguage: "zh",
    targetSlides: 12,
    detailLevel: "detailed",
    informationDensity: "high",
    enableVisualQa: true,
    enableIconDecoration: true,
    enableDeepResearch: true,
    enableExternalResearch: false,
    content:
      "# 高密度长文本生成压力样例\n\n本样例用于观察页面级重排是否能处理长句、过多 bullet、方法页纯文字、对比页失衡和总结页空泛等问题。系统需要将长段落压缩成适合演示的页面，而不是把原文逐字塞进 PPT。研究背景包括本地生成任务的稳定性、模板视觉质量、预览降级、模型审查和自动修复。方法部分包含上传解析、研究增强、模型大纲、规则 critic、repair、PPTX writer、preview renderer、Visual QA、Model Visual Critic、Auto Repair 和最终导出。实验部分需要比较低密度、正常密度和高密度设置下的页面数量、文字溢出、图表占位和下载稳定性。结果部分应突出关键指标，例如生成成功率、下载成功率、队列并发限制、自动修复应用次数和最终视觉 QA 分数。对比部分需要展示启用和关闭图标装饰、启用和关闭视觉 QA、原生预览可用和不可用时的差异。局限包括缺少真实图片级视觉模型、本地环境可能没有 LibreOffice、长文本仍然可能需要人工二次编辑。总结页需要给出 3 到 5 个清晰 takeaway：稳定链路优先、模板映射提升观感、页面级重排控制溢出、自动修复必须可回滚、上线前需要人工验收。"
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
  if (!response.ok) throw new Error(`${init?.method || "GET"} ${url} failed: ${response.status} ${body.message || ""}`.trim());
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
      extraRequirements: `manual review pack: ${scenario.name}. Prioritize readable layouts and avoid text overflow.`
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
  if (keepTasks) return;
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
  console.log(`academic-ppt manual review pack target=${baseUrl}`);
  await readJson<{ tasks: unknown[] }>(`${baseUrl}/api/smart-tools/academic-ppt/tasks?limit=1`);

  try {
    for (const scenario of scenarios) {
      const taskId = await createTask(scenario);
      created.push(taskId);
      const snapshot = await waitForTerminal(taskId);
      if (snapshot.status !== "success") throw new Error(`${scenario.id}: task failed: ${snapshot.error || "unknown error"}`);
      rows.push({
        scenario: scenario.name,
        taskId,
        snapshotUrl: `${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}`,
        downloadUrl: `${baseUrl}/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/download`,
        templateId: snapshot.templateId,
        slideCount: snapshot.slideCount,
        qualityScore: snapshot.qualityScore,
        visualQaScore: snapshot.visualQaScore,
        modelCriticStatus: snapshot.modelCriticStatus,
        autoRepairRounds: snapshot.autoRepairRounds,
        outputFileSize: snapshot.outputFileSize,
        retained: keepTasks
      });
    }

    console.table(rows);
    if (!keepTasks) {
      console.log("manual review pack passed; tasks will be cleaned. Set ACADEMIC_PPT_REVIEW_KEEP_TASKS=1 to keep PPTX files for manual review.");
    } else {
      console.log("manual review tasks retained for human inspection.");
    }
  } finally {
    await cleanup(created);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "academic-ppt manual review pack failed");
  process.exit(1);
});
