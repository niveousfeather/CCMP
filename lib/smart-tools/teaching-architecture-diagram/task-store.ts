import "server-only";

import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildTeachingArchitectureBlueprintWithModel } from "@/lib/smart-tools/teaching-architecture-diagram/blueprint-builder";
import {
  assertTeachingArchitectureExtractionReady,
  extractTeachingArchitectureContentFromFiles,
  extractTeachingArchitectureTextFromPrompt,
  writeTeachingArchitectureExtraction
} from "@/lib/smart-tools/teaching-architecture-diagram/content-extractor";
import { buildTeachingArchitectureDiagramScene } from "@/lib/smart-tools/teaching-architecture-diagram/diagram-scene";
import {
  generateTeachingArchitectureImage,
  reviseTeachingArchitectureImage
} from "@/lib/smart-tools/teaching-architecture-diagram/image-generator";
import { summarizeImageError } from "@/lib/smart-tools/teaching-architecture-diagram/image-errors";
import {
  buildTeachingArchitectureImagePrompt,
  chooseTeachingArchitectureVisualPreset,
  type TeachingArchitectureVisualPreset
} from "@/lib/smart-tools/teaching-architecture-diagram/prompts";
import { renderTeachingArchitectureSvg } from "@/lib/smart-tools/teaching-architecture-diagram/renderers";
import {
  renderImageBackedEditableSvg,
  readPngSize,
  type ImageBackedEditableSvgResult
} from "@/lib/smart-tools/teaching-architecture-diagram/renderers/image-backed-svg-renderer";
import type {
  TeachingArchitectureBlueprint,
  TeachingArchitectureDiagramScene,
  TeachingArchitectureDiagramType,
  TeachingArchitectureErrorCode,
  TeachingArchitectureLogEntry,
  TeachingArchitectureSceneEdit,
  TeachingArchitectureSceneResponse,
  TeachingArchitectureSourceType,
  TeachingArchitectureTask,
  TeachingArchitectureTaskFile,
  TeachingArchitectureTaskResponse,
  TeachingArchitectureTaskStage,
  TeachingArchitectureTaskStatus,
  TeachingArchitectureSvgRenderMode
} from "@/lib/smart-tools/teaching-architecture-diagram/types";
import {
  AGENT_ANALYSIS_TIMEOUT_MS,
  FILE_ANALYSIS_TIMEOUT_MS,
  IMAGE_GENERATION_TIMEOUT_MS,
  TEACHING_ARCHITECTURE_STYLE_PRESET,
  TOTAL_TASK_TIMEOUT_MS
} from "@/lib/smart-tools/teaching-architecture-diagram/types";

const TASKS_ROOT = path.join(process.cwd(), "data", "smart-tools", "teaching-architecture-diagram", "tasks");
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".pptx", ".txt", ".md", ".markdown"]);
const ALLOWED_DIAGRAM_TYPES = new Set<TeachingArchitectureDiagramType>([
  "auto",
  "central_model",
  "three_layer",
  "left_center_right_flow",
  "closed_loop",
  "tree_module"
]);

type CreateTaskInput =
  | {
      sourceType: "text";
      textPrompt: string;
      diagramType: TeachingArchitectureDiagramType;
      requestOrigin: string;
    }
  | {
      sourceType: "file";
      file: File;
      diagramType: TeachingArchitectureDiagramType;
      requestOrigin: string;
    };

const activeTaskJobs = new Set<string>();

export function createTeachingArchitectureTaskId() {
  return `tad-${randomUUID()}`;
}

export function isTeachingArchitectureDiagramType(value: string): value is TeachingArchitectureDiagramType {
  return ALLOWED_DIAGRAM_TYPES.has(value as TeachingArchitectureDiagramType);
}

export function isTeachingArchitectureSourceType(value: string): value is TeachingArchitectureSourceType {
  return value === "text" || value === "file";
}

export function assertTeachingArchitectureFileAllowed(file: File) {
  const extension = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("仅支持 PDF、DOCX、PPTX、TXT、MD 文件。");
  }
  if (file.size <= 0) throw new Error("上传文件不能为空。");
  if (file.size > MAX_UPLOAD_SIZE) throw new Error("上传文件不能超过 20MB。");
}

export function assertTeachingArchitectureTextAllowed(textPrompt: string) {
  if (!textPrompt.trim()) throw new Error("请输入教学改革描述，或清空后上传教学材料。");
  if (textPrompt.length > 8_000) throw new Error("文字描述不能超过 8000 字。");
}

export async function ensureTeachingArchitectureStorage() {
  await mkdir(TASKS_ROOT, { recursive: true });
}

export async function createTeachingArchitectureTask(input: CreateTaskInput) {
  await ensureTeachingArchitectureStorage();
  const taskId = createTeachingArchitectureTaskId();
  const now = new Date().toISOString();
  const taskDir = getTaskDir(taskId);
  const inputDir = path.join(taskDir, "input");
  await mkdir(inputDir, { recursive: true });

  let files: TeachingArchitectureTaskFile[] | undefined;
  let textPrompt: string | undefined;

  if (input.sourceType === "text") {
    assertTeachingArchitectureTextAllowed(input.textPrompt);
    textPrompt = input.textPrompt.trim();
  } else {
    assertTeachingArchitectureFileAllowed(input.file);
    const storedName = sanitizeFileName(input.file.name);
    await writeFile(path.join(inputDir, storedName), Buffer.from(await input.file.arrayBuffer()));
    files = [
      {
        originalName: input.file.name,
        storedName,
        size: input.file.size,
        type: input.file.type || "application/octet-stream"
      }
    ];
  }

  const task: TeachingArchitectureTask = {
    taskId,
    sourceType: input.sourceType,
    status: "pending",
    stage: "pending",
    progress: 5,
    currentStep: "正在创建任务",
    diagramType: input.diagramType,
    stylePreset: TEACHING_ARCHITECTURE_STYLE_PRESET,
    generationMode: "image_provider",
    textPrompt,
    files,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    retryable: false,
    downloadUrl: `${input.requestOrigin}/api/smart-tools/teaching-architecture-diagram/tasks/${encodeURIComponent(taskId)}/download`,
    preview: {
      type: "placeholder",
      title: "教学架构图生成中",
      description: "任务已创建，正在解析材料、调用 AI 分析，并生成 PNG 架构图。"
    },
    output: {
      fileName: "output.png",
      contentType: "image/png",
      svgFileName: "output.svg",
      svgContentType: "image/svg+xml",
      pngFileName: "output.png",
      pngContentType: "image/png"
    }
  };

  await writeTeachingArchitectureTask(task);
  await appendTeachingArchitectureLog(taskId, "info", input.sourceType === "text" ? "已接收文字描述输入。" : `已接收上传文件：${files?.[0]?.storedName || "unknown"}。`);
  void startTeachingArchitectureTaskJob(taskId).catch((error) => {
    console.error("[teaching-architecture-diagram] background task failed", {
      taskId,
      error: error instanceof Error ? error.message : String(error)
    });
  });
  return task;
}

export async function listTeachingArchitectureTasks(limit = 10) {
  await ensureTeachingArchitectureStorage();
  const entries = await readdir(TASKS_ROOT, { withFileTypes: true }).catch(() => []);
  const tasks = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          return await readTeachingArchitectureTask(entry.name);
        } catch {
          return undefined;
        }
      })
  );
  return tasks
    .filter((task): task is TeachingArchitectureTask => Boolean(task))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, Math.min(Math.max(limit, 1), 20));
}

export async function readTeachingArchitectureTask(taskId: string): Promise<TeachingArchitectureTask> {
  assertSafeTaskId(taskId);
  const task = JSON.parse(await readFile(path.join(getTaskDir(taskId), "task.json"), "utf8")) as TeachingArchitectureTask;
  return maybeAdvanceTeachingArchitectureTask(normalizeLegacyTask(task));
}

export async function readTeachingArchitectureTaskResponse(taskId: string): Promise<TeachingArchitectureTaskResponse> {
  const task = await readTeachingArchitectureTask(taskId);
  const blueprint = await readTeachingArchitectureBlueprint(taskId).catch(() => undefined);
  return { ...task, blueprint };
}

export async function deleteTeachingArchitectureTask(taskId: string) {
  assertSafeTaskId(taskId);
  await rm(getTaskDir(taskId), { recursive: true, force: true });
}

export async function readTeachingArchitectureBlueprint(taskId: string): Promise<TeachingArchitectureBlueprint> {
  assertSafeTaskId(taskId);
  return JSON.parse(await readFile(path.join(getTaskDir(taskId), "blueprint.json"), "utf8")) as TeachingArchitectureBlueprint;
}

export async function readTeachingArchitectureSceneResponse(taskId: string): Promise<TeachingArchitectureSceneResponse> {
  const task = await readTeachingArchitectureTask(taskId);
  if (task.status !== "completed") throw new Error("架构图尚未生成完成，暂不能编辑文字。");
  const scene = await readTeachingArchitectureScene(taskId);
  const visualPreset = await readTaskVisualPreset(taskId);
  const imageContext = await readSceneBackgroundImageContext(taskId, scene);
  return {
    scene: imageContext.scene,
    svgUrl: `/api/smart-tools/teaching-architecture-diagram/tasks/${encodeURIComponent(taskId)}/download?format=svg&preview=1`,
    backgroundImageDataUri: imageContext.backgroundImageDataUri,
    svgRenderMode: imageContext.svgRenderMode,
    visualPreset,
    task
  };
}

export async function updateTeachingArchitectureSceneText(taskId: string, edits: TeachingArchitectureSceneEdit[]): Promise<TeachingArchitectureSceneResponse> {
  assertSafeTaskId(taskId);
  if (!Array.isArray(edits) || edits.length <= 0) throw new Error("请提供需要保存的文字修改。");
  if (edits.length > 80) throw new Error("单次文字修改数量过多，请分批保存。");

  const task = await readTeachingArchitectureTask(taskId);
  if (task.status !== "completed") throw new Error("架构图尚未生成完成，暂不能保存文字修改。");

  const scene = await readTeachingArchitectureScene(taskId);
  const nextScene = applySceneTextEdits(scene, edits);
  const taskDir = getTaskDir(taskId);
  await writeJson(path.join(taskDir, "edited-scene.json"), nextScene);
  const renderResult = await renderTeachingArchitectureTaskSvg({
    taskId,
    taskDir,
    scene: nextScene,
    visualPreset: await readTaskVisualPreset(taskId),
    logFallback: true
  });

  const svgStat = await stat(path.join(taskDir, "output.svg"));
  const updatedAt = new Date().toISOString();
  const nextTask: TeachingArchitectureTask = {
    ...task,
    updatedAt,
    output: {
      ...task.output,
      fileName: "output.svg",
      contentType: "image/svg+xml",
      size: svgStat.size,
      svgFileName: "output.svg",
      svgContentType: "image/svg+xml",
      svgSize: svgStat.size
    },
    image: {
      ...task.image,
      mode: "svg_renderer",
      status: "generated",
      outputSvg: "output.svg",
      width: renderResult.width,
      height: renderResult.height,
      renderer: nextScene.layout
    }
  };
  await writeTeachingArchitectureTask(nextTask);
  await appendTeachingArchitectureLog(
    taskId,
    "info",
    `已保存 ${edits.length} 项文字修改并重新渲染 output.svg，svgRenderMode=${renderResult.mode} editableTextBoxCount=${renderResult.editableTextBoxCount ?? 0}。`
  );
  const imageContext = await readSceneBackgroundImageContext(taskId, nextScene);
  return {
    scene: imageContext.scene,
    svgUrl: `/api/smart-tools/teaching-architecture-diagram/tasks/${encodeURIComponent(taskId)}/download?format=svg&preview=1`,
    backgroundImageDataUri: imageContext.backgroundImageDataUri,
    svgRenderMode: imageContext.svgRenderMode,
    visualPreset: renderResult.visualPreset,
    task: nextTask
  };
}

export async function requestTeachingArchitectureImageRevision(taskId: string, instruction: unknown): Promise<TeachingArchitectureTaskResponse> {
  assertSafeTaskId(taskId);
  const revisionInstruction = sanitizeImageRevisionInstruction(instruction);
  const task = await readTeachingArchitectureTask(taskId);
  if (task.status !== "completed") throw new Error("架构图尚未生成完成，暂不能修改图片。");
  if (activeTaskJobs.has(taskId)) throw new Error("当前任务正在处理中，请稍后再提交新的图片修改。");

  const taskDir = getTaskDir(taskId);
  const pngPath = path.join(taskDir, "output.png");
  await stat(pngPath).catch(() => {
    throw new Error("未找到 output.png，无法进行图片修改。");
  });

  const now = new Date().toISOString();
  const nextTask: TeachingArchitectureTask = {
    ...task,
    status: "generating",
    stage: "generating_image",
    progress: 82,
    currentStep: "正在根据修改说明重新生成图片",
    updatedAt: now,
    failedAt: undefined,
    errorCode: undefined,
    errorMessage: undefined,
    retryable: false
  };
  await writeTeachingArchitectureTask(nextTask);
  await appendTeachingArchitectureLog(taskId, "info", `用户提交图片修改说明：${revisionInstruction.slice(0, 180)}`);
  activeTaskJobs.add(taskId);
  void runTeachingArchitectureImageRevisionTask(taskId, revisionInstruction)
    .catch((error) => {
    console.error("[teaching-architecture-diagram] image revision failed", {
      taskId,
      error: error instanceof Error ? error.message : String(error)
    });
    })
    .finally(() => {
      activeTaskJobs.delete(taskId);
    });
  return readTeachingArchitectureTaskResponse(taskId);
}

export async function appendTeachingArchitectureLog(taskId: string, level: TeachingArchitectureLogEntry["level"], message: string) {
  assertSafeTaskId(taskId);
  const entry: TeachingArchitectureLogEntry = { time: new Date().toISOString(), level, message };
  await writeFile(path.join(getTaskDir(taskId), "logs.jsonl"), `${JSON.stringify(entry)}\n`, { flag: "a" });
}

export async function getTeachingArchitectureDownload(taskId: string, format: "svg" | "png" | "auto" = "auto") {
  const task = await readTeachingArchitectureTask(taskId);
  if (task.status !== "completed") return { task, ready: false as const };

  const requestedFileName = format === "svg" ? task.output.svgFileName || "output.svg" : task.output.pngFileName || task.image?.outputPng || "output.png";
  const fileName = format === "auto" ? task.output.pngFileName || task.image?.outputPng || task.output.svgFileName || "output.svg" : requestedFileName;
  const filePath = path.join(getTaskDir(taskId), fileName);
  const fileStat = await stat(filePath);
  const isPng = fileName.endsWith(".png");
  return {
    task,
    ready: true as const,
    filePath,
    fileName,
    contentType: isPng ? "image/png" : "image/svg+xml",
    size: fileStat.size,
    stream: createReadStream(filePath)
  };
}

export async function retryTeachingArchitectureTask(taskId: string) {
  const task = await readTeachingArchitectureTask(taskId);
  if (task.status !== "failed" || !task.retryable) throw new Error("仅支持重试失败且可重试的教学架构图任务。");
  const now = new Date().toISOString();
  const nextTask: TeachingArchitectureTask = {
    ...task,
    status: "analyzing",
    stage: "analyzing",
    progress: 45,
    currentStep: "正在重新调用 AI 模型分析文档",
    updatedAt: now,
    failedAt: undefined,
    completedAt: undefined,
    errorCode: undefined,
    errorMessage: undefined,
    retryable: false
  };
  await writeTeachingArchitectureTask(nextTask);
  await appendTeachingArchitectureLog(taskId, "info", "用户触发重试，复用已有 extraction.json 重新生成 blueprint 与 output.svg。");
  void startTeachingArchitectureTaskJob(taskId).catch((error) => {
    console.error("[teaching-architecture-diagram] retry task failed", {
      taskId,
      error: error instanceof Error ? error.message : String(error)
    });
  });
  return nextTask;
}

async function startTeachingArchitectureTaskJob(taskId: string) {
  if (activeTaskJobs.has(taskId)) return;
  activeTaskJobs.add(taskId);
  try {
    const task = await readTeachingArchitectureTaskNoAdvance(taskId);
    if (task.status === "completed") return;
    await runTeachingArchitectureTask(task);
  } finally {
    activeTaskJobs.delete(taskId);
  }
}

async function runTeachingArchitectureImageRevisionTask(taskId: string, instruction: string) {
  const taskDir = getTaskDir(taskId);
  const task = await readTeachingArchitectureTaskNoAdvance(taskId);
  try {
    const blueprint = await readTeachingArchitectureBlueprint(taskId);
    const visualPreset = chooseTeachingArchitectureVisualPreset(blueprint);
    const previousPrompt = await readFile(path.join(taskDir, "prompt.txt"), "utf8").catch(() => undefined);
    await appendTeachingArchitectureLog(taskId, "info", `正在重新调用 image 模型修改 output.png，visualPreset=${visualPreset}。`);
    const imageResult = await runWithTimeout(
      async (signal) =>
        reviseTeachingArchitectureImage({
          taskId,
          blueprint,
          instruction,
          previousPrompt,
          visualPreset,
          sourceImagePath: path.join(taskDir, "output.png"),
          outputPath: path.join(taskDir, "output.png"),
          promptOutputPath: path.join(taskDir, "revision-prompt.txt"),
          signal,
          onProviderRequestStart: () => {
            void appendTeachingArchitectureLog(taskId, "info", "image revision provider request started。");
          }
        }),
      IMAGE_GENERATION_TIMEOUT_MS,
      "IMAGE_PROVIDER_TIMEOUT"
    );
    await appendTeachingArchitectureLog(
      taskId,
      "info",
      `image 修改生成完成，provider=${imageResult.provider} model=${imageResult.model} durationMs=${imageResult.durationMs}。`
    );

    const scene = await readTeachingArchitectureScene(taskId).catch(() => buildTeachingArchitectureDiagramScene(blueprint));
    await renderTeachingArchitectureTaskSvg({
      taskId,
      taskDir,
      scene,
      visualPreset,
      logFallback: true
    });
    const pngStat = await stat(path.join(taskDir, "output.png"));
    const svgStat = await stat(path.join(taskDir, "output.svg")).catch(() => undefined);
    const completedAt = new Date().toISOString();
    const completedTask: TeachingArchitectureTask = {
      ...task,
      status: "completed",
      stage: "completed",
      progress: 100,
      currentStep: "图片已根据修改说明重新生成",
      generationMode: "image_provider",
      updatedAt: completedAt,
      completedAt,
      failedAt: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      retryable: false,
      preview: {
        type: "image",
        title: "教学架构图 PNG",
        description: "已根据修改说明重新生成 output.png。",
        imageUrl: `/api/smart-tools/teaching-architecture-diagram/tasks/${encodeURIComponent(taskId)}/download?format=png&preview=1`,
        svgUrl: `/api/smart-tools/teaching-architecture-diagram/tasks/${encodeURIComponent(taskId)}/download?format=svg&preview=1`
      },
      output: {
        ...task.output,
        fileName: "output.png",
        contentType: "image/png",
        size: pngStat.size,
        pngFileName: "output.png",
        pngContentType: "image/png",
        pngSize: pngStat.size,
        svgFileName: svgStat ? "output.svg" : task.output.svgFileName,
        svgContentType: svgStat ? "image/svg+xml" : task.output.svgContentType,
        svgSize: svgStat?.size || task.output.svgSize
      },
      image: {
        ...task.image,
        mode: "image_provider",
        status: "generated",
        provider: imageResult.provider,
        model: imageResult.model,
        outputFile: "output.png",
        outputSvg: svgStat ? "output.svg" : task.image?.outputSvg,
        outputPng: "output.png",
        width: imageResult.width,
        height: imageResult.height,
        aspectRatio: blueprint.visualPlan.aspectRatio,
        size: blueprint.visualPlan.size,
        durationMs: imageResult.durationMs
      }
    };
    await writeTeachingArchitectureTask(completedTask);
  } catch (error) {
    const latest = await readTeachingArchitectureTaskNoAdvance(taskId).catch(() => task);
    const failedTask = failTeachingArchitectureTask(latest, normalizeTaskFailure(error, "generating_image"));
    await writeTeachingArchitectureTask(failedTask);
    await appendTeachingArchitectureLog(taskId, "error", failedTask.errorMessage || "图片修改失败。");
  }
}

async function runTeachingArchitectureTask(task: TeachingArchitectureTask) {
  const taskDir = getTaskDir(task.taskId);
  try {
    await updateTeachingArchitectureStage(task.taskId, {
      status: "running",
      stage: "extracting",
      progress: 20,
      currentStep: task.sourceType === "file" ? "正在解析上传材料" : "正在读取文字描述"
    });

    const extraction = await runWithTimeout(
      () =>
        task.sourceType === "text"
          ? extractTeachingArchitectureTextFromPrompt({ taskDir, textPrompt: task.textPrompt || "" })
          : extractTeachingArchitectureContentFromFiles({ taskDir, files: task.files || [] }),
      FILE_ANALYSIS_TIMEOUT_MS,
      "FILE_ANALYSIS_TIMEOUT"
    );
    await writeTeachingArchitectureExtraction(taskDir, extraction);
    assertTeachingArchitectureExtractionReady(extraction);
    await appendTeachingArchitectureLog(task.taskId, "info", `内容提取完成，提取文本长度 ${extraction.textLength}。`);
    for (const warning of extraction.warnings) await appendTeachingArchitectureLog(task.taskId, "warn", warning);

    await updateTeachingArchitectureStage(task.taskId, {
      status: "analyzing",
      stage: "analyzing",
      progress: 45,
      currentStep: "正在调用 AI 模型分析文档"
    });
    await appendTeachingArchitectureLog(task.taskId, "info", "正在调用 AI 模型分析文档并生成 diagram_blueprint.json。");
    const blueprint = await runWithTimeout(
      async (signal) =>
        buildTeachingArchitectureBlueprintWithModel({
          extraction,
          diagramType: task.diagramType,
          generatedAt: new Date().toISOString(),
          signal
        }),
      AGENT_ANALYSIS_TIMEOUT_MS,
      "AGENT_ANALYSIS_TIMEOUT"
    );
    await writeJson(path.join(taskDir, "blueprint.json"), blueprint);
    await appendTeachingArchitectureLog(
      task.taskId,
      "info",
      blueprint.source.parser === "ai_model"
        ? `AI 模型分析完成，provider=${blueprint.source.provider || "-"} model=${blueprint.source.model || "-"}。`
        : "AI 模型分析不可用，已使用本地规则兜底生成 diagram_blueprint.json。"
    );

    await updateTeachingArchitectureStage(task.taskId, {
      status: "generating",
      stage: "building_prompt",
      progress: 70,
      currentStep: "正在构建架构图生成提示词"
    });
    const visualPreset = chooseTeachingArchitectureVisualPreset(blueprint);
    const imagePrompt = buildTeachingArchitectureImagePrompt({ blueprint, visualPreset });
    await writeFile(path.join(taskDir, "prompt.txt"), imagePrompt, "utf8");
    await appendTeachingArchitectureLog(task.taskId, "info", `已选择 image visualPreset=${visualPreset}。`);

    await updateTeachingArchitectureStage(task.taskId, {
      status: "generating",
      stage: "generating_image",
      progress: 82,
      currentStep: "正在调用 image 模型生成架构图参考图"
    });
    await appendTeachingArchitectureLog(task.taskId, "info", "正在调用 image 模型生成 output.png。");
    const imageResult = await runWithTimeout(
      async (signal) =>
        generateTeachingArchitectureImage({
          taskId: task.taskId,
          blueprint,
          imagePrompt,
          visualPreset,
          outputPath: path.join(taskDir, "output.png"),
          signal,
          onProviderRequestStart: () => {
            void appendTeachingArchitectureLog(task.taskId, "info", "image provider request started。");
          }
        }),
      IMAGE_GENERATION_TIMEOUT_MS,
      "IMAGE_PROVIDER_TIMEOUT"
    );
    await appendTeachingArchitectureLog(
      task.taskId,
      "info",
      `image 模型生成完成，provider=${imageResult.provider} model=${imageResult.model} durationMs=${imageResult.durationMs}。`
    );

    await updateTeachingArchitectureStage(task.taskId, {
      status: "generating",
      stage: "rendering_svg",
      progress: 92,
      currentStep: "正在封存 SVG 备用文件"
    });
    await renderAndCompleteTask(task.taskId, blueprint, imageResult);
  } catch (error) {
    const latest = await readTeachingArchitectureTaskNoAdvance(task.taskId).catch(() => task);
    const failedTask = failTeachingArchitectureTask(latest, normalizeTaskFailure(error, latest.stage));
    await writeTeachingArchitectureTask(failedTask);
    await appendTeachingArchitectureLog(task.taskId, "error", failedTask.errorMessage || "任务处理失败。");
  }
}

async function renderAndCompleteTask(
  taskId: string,
  blueprint: TeachingArchitectureBlueprint,
  imageResult?: {
    provider: string;
    model: string;
    width: number;
    height: number;
    durationMs: number;
    visualPreset?: TeachingArchitectureVisualPreset;
  }
) {
  const taskDir = getTaskDir(taskId);
  const scene = buildTeachingArchitectureDiagramScene(blueprint);
  await writeJson(path.join(taskDir, "diagram-scene.json"), scene);
  const renderResult = await renderTeachingArchitectureTaskSvg({
    taskId,
    taskDir,
    scene,
    visualPreset: imageResult?.visualPreset || chooseTeachingArchitectureVisualPreset(blueprint),
    logFallback: true
  });
  const svgStat = await stat(path.join(taskDir, "output.svg"));
  const pngStat = imageResult ? await stat(path.join(taskDir, "output.png")) : undefined;
  const completedAt = new Date().toISOString();
  const latestTask = await readTeachingArchitectureTaskNoAdvance(taskId);
  const completedTask: TeachingArchitectureTask = {
    ...latestTask,
    status: "completed",
    stage: "completed",
    progress: 100,
    currentStep: imageResult ? "PNG 架构图已生成" : "SVG 架构图已生成",
    generationMode: imageResult ? "image_provider" : "svg_renderer",
    updatedAt: completedAt,
    completedAt,
    failedAt: undefined,
    errorCode: undefined,
    errorMessage: undefined,
    retryable: false,
    preview: {
      type: "image",
      title: imageResult ? "教学架构图 PNG" : "教学架构图 SVG",
      description: imageResult ? "已根据 AI 分析蓝图生成 output.png，可在底部输入修改说明继续调整图片。" : "已根据 AI 分析蓝图生成备用 output.svg。",
      imageUrl: `/api/smart-tools/teaching-architecture-diagram/tasks/${encodeURIComponent(taskId)}/download?format=${imageResult ? "png" : "svg"}&preview=1`,
      svgUrl: `/api/smart-tools/teaching-architecture-diagram/tasks/${encodeURIComponent(taskId)}/download?format=svg&preview=1`
    },
    output: {
      fileName: imageResult ? "output.png" : "output.svg",
      contentType: imageResult ? "image/png" : "image/svg+xml",
      size: imageResult ? pngStat?.size : svgStat.size,
      svgFileName: "output.svg",
      svgContentType: "image/svg+xml",
      svgSize: svgStat.size,
      pngFileName: imageResult ? "output.png" : undefined,
      pngContentType: imageResult ? "image/png" : undefined,
      pngSize: pngStat?.size
    },
    image: {
      mode: imageResult ? "image_provider" : "svg_renderer",
      status: "generated",
      provider: imageResult?.provider,
      model: imageResult?.model,
      outputFile: imageResult ? "output.png" : undefined,
      outputSvg: "output.svg",
      outputPng: imageResult ? "output.png" : undefined,
      renderer: scene.layout,
      width: imageResult?.width || renderResult.width,
      height: imageResult?.height || renderResult.height,
      aspectRatio: blueprint.visualPlan.aspectRatio,
      size: blueprint.visualPlan.size,
      durationMs: imageResult?.durationMs
    },
    generationQuality: summarizeGenerationQuality(blueprint)
  };
  await writeTeachingArchitectureTask(completedTask);
  await appendTeachingArchitectureLog(
    taskId,
    `info`,
    `output.png 主预览已生成，output.svg 已封存备用，renderer=${scene.layout} svgRenderMode=${renderResult.mode} visualPreset=${renderResult.visualPreset || "-"} imageWidth=${imageResult?.width || renderResult.width} imageHeight=${imageResult?.height || renderResult.height} editableTextBoxCount=${renderResult.editableTextBoxCount ?? 0} svgBytes=${svgStat.size}。`
  );
}

async function updateTeachingArchitectureStage(taskId: string, next: Pick<TeachingArchitectureTask, "status" | "stage" | "progress" | "currentStep">) {
  const task = await readTeachingArchitectureTaskNoAdvance(taskId);
  await writeTeachingArchitectureTask({
    ...task,
    ...next,
    updatedAt: new Date().toISOString(),
    startedAt: task.startedAt || new Date().toISOString()
  });
  await appendTeachingArchitectureLog(taskId, "info", `任务阶段更新为 ${next.stage}。`);
}

async function renderTeachingArchitectureTaskSvg(params: {
  taskId: string;
  taskDir: string;
  scene: TeachingArchitectureDiagramScene;
  visualPreset?: TeachingArchitectureVisualPreset;
  logFallback?: boolean;
}): Promise<{
  mode: TeachingArchitectureSvgRenderMode;
  visualPreset?: TeachingArchitectureVisualPreset;
  width: number;
  height: number;
  editableTextBoxCount?: number;
}> {
  const pngPath = path.join(params.taskDir, "output.png");
  const pngExists = await stat(pngPath)
    .then((entry) => entry.isFile())
    .catch(() => false);

  if (pngExists) {
    try {
      const imageBacked = await renderImageBackedEditableSvg({
        scene: params.scene,
        outputPngPath: pngPath,
        visualPreset: params.visualPreset
      });
      await writeFile(path.join(params.taskDir, "output.svg"), imageBacked.svg, "utf8");
      return {
        mode: "image-backed-editable-text",
        visualPreset: params.visualPreset,
        width: imageBacked.width,
        height: imageBacked.height,
        editableTextBoxCount: imageBacked.editableTextBoxCount
      };
    } catch (error) {
      if (params.logFallback) {
        await appendTeachingArchitectureLog(
          params.taskId,
          "warn",
          `svgRenderMode=image-backed-editable-text fallback=pure-vector reason=${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  } else if (params.logFallback) {
    await appendTeachingArchitectureLog(params.taskId, "info", "svgRenderMode=pure-vector fallback reason=output.png missing。");
  }

  await writeFile(path.join(params.taskDir, "output.svg"), renderTeachingArchitectureSvg(params.scene), "utf8");
  return {
    mode: "pure-vector",
    visualPreset: params.visualPreset,
    width: params.scene.width,
    height: params.scene.height,
    editableTextBoxCount: undefined
  };
}

async function readSceneBackgroundImageContext(taskId: string, scene: TeachingArchitectureDiagramScene) {
  const taskDir = getTaskDir(taskId);
  const pngPath = path.join(taskDir, "output.png");
  const png = await readFile(pngPath).catch(() => undefined);
  if (!png) {
    return {
      scene,
      svgRenderMode: "pure-vector" as TeachingArchitectureSvgRenderMode,
      backgroundImageDataUri: undefined
    };
  }
  try {
    const size = readPngSize(png);
    return {
      scene: {
        ...scene,
        width: size.width,
        height: size.height
      },
      svgRenderMode: "image-backed-editable-text" as TeachingArchitectureSvgRenderMode,
      backgroundImageDataUri: `data:image/png;base64,${png.toString("base64")}`
    };
  } catch (error) {
    await appendTeachingArchitectureLog(taskId, "warn", `前端读取 output.png 失败，已使用 pure-vector 编辑视图。reason=${error instanceof Error ? error.message : String(error)}`);
    return {
      scene,
      svgRenderMode: "pure-vector" as TeachingArchitectureSvgRenderMode,
      backgroundImageDataUri: undefined
    };
  }
}

async function readTaskVisualPreset(taskId: string): Promise<TeachingArchitectureVisualPreset | undefined> {
  const blueprint = await readTeachingArchitectureBlueprint(taskId).catch(() => undefined);
  return blueprint ? chooseTeachingArchitectureVisualPreset(blueprint) : undefined;
}

async function runWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutCode: Extract<TeachingArchitectureErrorCode, "FILE_ANALYSIS_TIMEOUT" | "AGENT_ANALYSIS_TIMEOUT" | "IMAGE_PROVIDER_TIMEOUT">
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(timeoutCode)), timeoutMs);
  try {
    return await fn(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      if (timeoutCode === "FILE_ANALYSIS_TIMEOUT") throw new Error("文件解析超时，请稍后重试或减少材料数量。");
      if (timeoutCode === "IMAGE_PROVIDER_TIMEOUT") throw new Error("图片模型生成超时，请稍后重试或减少材料数量。");
      throw new Error("AI 蓝图分析超时，请稍后重试或减少材料数量。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getTaskDir(taskId: string) {
  assertSafeTaskId(taskId);
  return path.join(TASKS_ROOT, taskId);
}

async function maybeAdvanceTeachingArchitectureTask(task: TeachingArchitectureTask) {
  if (task.status === "completed" || task.status === "failed") return task;
  const ageMs = Date.now() - Date.parse(task.createdAt);
  if (ageMs <= TOTAL_TASK_TIMEOUT_MS) return task;
  const failedTask = failTeachingArchitectureTask(task, {
    errorCode: "TASK_TIMEOUT",
    errorMessage: "任务处理超时，请稍后重试或减少材料数量。",
    retryable: true,
    stage: task.stage
  });
  await writeTeachingArchitectureTask(failedTask);
  return failedTask;
}

async function readTeachingArchitectureTaskNoAdvance(taskId: string): Promise<TeachingArchitectureTask> {
  assertSafeTaskId(taskId);
  return normalizeLegacyTask(JSON.parse(await readFile(path.join(getTaskDir(taskId), "task.json"), "utf8")) as TeachingArchitectureTask);
}

async function readTeachingArchitectureScene(taskId: string): Promise<TeachingArchitectureDiagramScene> {
  assertSafeTaskId(taskId);
  const taskDir = getTaskDir(taskId);
  const editedPath = path.join(taskDir, "edited-scene.json");
  const sourcePath = path.join(taskDir, "diagram-scene.json");
  const raw = await readFile(editedPath, "utf8").catch(() => readFile(sourcePath, "utf8"));
  return normalizeSceneForEditing(JSON.parse(raw) as TeachingArchitectureDiagramScene);
}

function applySceneTextEdits(scene: TeachingArchitectureDiagramScene, edits: TeachingArchitectureSceneEdit[]): TeachingArchitectureDiagramScene {
  const nextScene = normalizeSceneForEditing(scene);
  for (const edit of edits) {
    if (!edit || typeof edit !== "object") throw new Error("文字修改格式无效。");
    if (edit.targetType === "title") {
      nextScene.title = sanitizeSceneText(edit.value, 40, "总标题");
      continue;
    }
    if (edit.targetType === "nodeTitle") {
      const node = nextScene.nodes.find((item) => item.id === edit.nodeId);
      if (!node) throw new Error("节点不存在，无法保存标题修改。");
      node.title = sanitizeSceneText(edit.value, 16, "节点标题");
      continue;
    }
    if (edit.targetType === "nodeTag") {
      const node = nextScene.nodes.find((item) => item.id === edit.nodeId);
      if (!node || !Number.isInteger(edit.tagIndex) || edit.tagIndex < 0 || edit.tagIndex >= node.tags.length) {
        throw new Error("节点标签不存在，无法保存标签修改。");
      }
      node.tags[edit.tagIndex] = sanitizeSceneText(edit.value, 12, "节点标签");
      continue;
    }
    if (edit.targetType === "edgeLabel") {
      const edge = nextScene.edges.find((item) => item.id === edit.edgeId);
      if (!edge) throw new Error("连线标签不存在，无法保存文字修改。");
      edge.label = sanitizeSceneText(edit.value, 8, "连线标签");
      continue;
    }
    throw new Error("不支持的文字修改类型。");
  }
  return nextScene;
}

function sanitizeSceneText(value: unknown, maxChars: number, label: string) {
  if (typeof value !== "string") throw new Error(`${label}必须是文本。`);
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error(`${label}不能为空。`);
  if (/[<>]/.test(normalized)) throw new Error(`${label}不能包含尖括号或 HTML 标签。`);
  if (/on[a-z]+\s*=|javascript:/i.test(normalized)) throw new Error(`${label}包含不安全内容。`);
  if (Array.from(normalized).length > maxChars) throw new Error(`${label}不能超过 ${maxChars} 个字符。`);
  return normalized;
}

function sanitizeImageRevisionInstruction(value: unknown) {
  if (typeof value !== "string") throw new Error("请输入图片修改说明。");
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("请输入图片修改说明。");
  if (normalized.length > 1000) throw new Error("图片修改说明不能超过 1000 个字符。");
  if (/[<>]/.test(normalized) || /on[a-z]+\s*=|javascript:/i.test(normalized)) {
    throw new Error("图片修改说明包含不安全内容。");
  }
  return normalized;
}

function normalizeSceneForEditing(scene: TeachingArchitectureDiagramScene): TeachingArchitectureDiagramScene {
  return {
    title: typeof scene.title === "string" ? scene.title : "教学架构图",
    layout: scene.layout,
    width: Number(scene.width) || 1024,
    height: Number(scene.height) || 1536,
    background: scene.background || "#ffffff",
    theme: scene.theme,
    nodes: (scene.nodes || []).map((node, index) => ({
      id: node.id || (index === 0 ? "center" : `node-${index}`),
      index: Number.isFinite(node.index) ? node.index : index,
      title: typeof node.title === "string" ? node.title : "节点",
      tags: Array.isArray(node.tags) ? node.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 2) : [],
      role: node.role
    })),
    edges: (scene.edges || []).map((edge, index) => ({
      ...edge,
      id: edge.id || `edge-${index + 1}`,
      label: typeof edge.label === "string" ? edge.label : edge.label
    }))
  };
}

function normalizeTaskFailure(error: unknown, stage: TeachingArchitectureTaskStage): {
  errorCode: TeachingArchitectureErrorCode;
  errorMessage: string;
  retryable: boolean;
  stage?: TeachingArchitectureTaskStage;
} {
  if (stage === "generating_image") {
    const summary = summarizeImageError(error);
    return {
      errorCode: summary.code,
      errorMessage: summary.message,
      retryable: summary.retryable,
      stage
    };
  }
  if (stage === "extracting") {
    return {
      errorCode: "CONTENT_EXTRACTION_FAILED",
      errorMessage: error instanceof Error ? error.message : "内容提取失败，请检查材料后重试。",
      retryable: false,
      stage
    };
  }
  return {
    errorCode: "AGENT_ANALYSIS_TIMEOUT",
    errorMessage: error instanceof Error ? error.message : "AI 蓝图分析失败，请稍后重试。",
    retryable: true,
    stage
  };
}

function failTeachingArchitectureTask(
  task: TeachingArchitectureTask,
  input: { errorCode: TeachingArchitectureErrorCode; errorMessage: string; retryable: boolean; stage?: TeachingArchitectureTaskStage }
): TeachingArchitectureTask {
  const now = new Date().toISOString();
  return {
    ...task,
    status: "failed",
    stage: input.stage || task.stage || "failed",
    progress: Math.max(task.progress, 1),
    currentStep: input.errorMessage,
    updatedAt: now,
    failedAt: now,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    retryable: input.retryable
  };
}

function summarizeGenerationQuality(blueprint: TeachingArchitectureBlueprint): NonNullable<TeachingArchitectureTask["generationQuality"]> {
  const nodes = blueprint.imageNodes || [];
  const shortTagCount = nodes.reduce((sum, node) => sum + node.shortTags.length, 0);
  const averageShortTagCount = nodes.length ? Number((shortTagCount / nodes.length).toFixed(2)) : 0;
  return {
    recommendedType: blueprint.layoutIntent.recommendedType,
    nodeCount: nodes.length,
    shortTagCount,
    averageShortTagCount,
    aspectRatio: blueprint.visualPlan.aspectRatio,
    size: blueprint.visualPlan.size,
    titleLength: Array.from(blueprint.title).length,
    warnings: []
  };
}

async function writeTeachingArchitectureTask(task: TeachingArchitectureTask) {
  await writeJson(path.join(getTaskDir(task.taskId), "task.json"), task);
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sanitizeFileName(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  const basename = path.basename(fileName, extension).replace(/[^\p{L}\p{N}._-]+/gu, "-");
  return `${basename || "upload"}${extension}`;
}

function assertSafeTaskId(taskId: string) {
  if (!/^tad-[0-9a-f-]{36}$/i.test(taskId)) throw new Error("无效的任务 ID。");
}

function normalizeLegacyTask(task: TeachingArchitectureTask): TeachingArchitectureTask {
  return {
    ...task,
    sourceType: task.sourceType || "text",
    stage: task.stage || getStageFromStatus(task.status),
    stylePreset: TEACHING_ARCHITECTURE_STYLE_PRESET,
    generationMode: task.generationMode || (task.output?.pngFileName || task.image?.outputPng ? "image_provider" : "svg_renderer"),
    diagramType: normalizeDiagramType(task.diagramType),
    retryable: task.retryable ?? false,
    output: normalizeTaskOutput(task)
  };
}

function getStageFromStatus(status: TeachingArchitectureTaskStatus): TeachingArchitectureTaskStage {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "running") return "extracting";
  if (status === "analyzing") return "analyzing";
  if (status === "generating") return "rendering_svg";
  return "pending";
}

function normalizeDiagramType(value: TeachingArchitectureDiagramType): TeachingArchitectureDiagramType {
  const legacyMap: Record<string, TeachingArchitectureDiagramType> = {
    "center-model": "central_model",
    "three-layer": "three_layer",
    "left-right-flow": "left_center_right_flow",
    "closed-loop": "closed_loop",
    "tree-modules": "tree_module"
  };
  return legacyMap[value] || value || "auto";
}

function normalizeTaskOutput(task: TeachingArchitectureTask): TeachingArchitectureTask["output"] {
  const hasPng = Boolean(task.output?.pngFileName || task.image?.outputPng);
  return {
    fileName: task.output?.fileName || (hasPng ? "output.png" : "output.svg"),
    contentType: task.output?.contentType || (hasPng ? "image/png" : "image/svg+xml"),
    size: task.output?.size || (hasPng ? task.output?.pngSize : task.output?.svgSize),
    svgFileName: task.output?.svgFileName || "output.svg",
    svgContentType: "image/svg+xml",
    svgSize: task.output?.svgSize || task.output?.size,
    pngFileName: task.output?.pngFileName || task.image?.outputPng,
    pngContentType: task.output?.pngContentType || (hasPng ? "image/png" : undefined),
    pngSize: task.output?.pngSize
  };
}

export const teachingArchitectureTimeouts = {
  FILE_ANALYSIS_TIMEOUT_MS,
  AGENT_ANALYSIS_TIMEOUT_MS,
  TOTAL_TASK_TIMEOUT_MS
};
