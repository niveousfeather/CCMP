import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { enqueueAgentChatTask } from "@/lib/agent/async-tasks";
import { planAgentRuntimeTurn, type AgentRuntimePlan } from "@/lib/agent/runtime";
import { buildAgentRuntimeContextPack, buildRuntimeChatMessagesFromContextPack } from "@/lib/agent/runtime/context-pack";
import { executeRuntimeTool } from "@/lib/agent/runtime/tool-executor";
import type { AgentActiveTask } from "@/lib/agent/runtime/tool-adapters";
import { callChatModel, extractAgentTask, isAgentProviderRequestError, runAgent } from "@/lib/agent/router";
import { isFunctionalAgentTask, shouldUseFastChatRoute } from "@/lib/agent/task-router";
import type {
  AgentChatMessage,
  AgentProvider,
  AgentRunResult,
  AgentTask,
  AgentToolSelection,
  GeneratedAgentFile,
  WebContextResult
} from "@/lib/agent/types";
import { isDocumentFile, parseDocumentsWithKimi } from "@/lib/agent/skills/parse-document";
import { isVideoUnderstandingFile } from "@/lib/agent/skills/parse-video";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as storage from "@/lib/storage";

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = {
  role: ChatRole;
  content: string;
};

type ChatMode = "agent" | "manual";

type ParsedRequest = {
  mode: ChatMode;
  conversationId: string | null;
  model: string;
  messages: ChatMessage[];
  files: File[];
  requestId: string;
  stream?: boolean;
  tools?: AgentToolSelection;
};

type ExtractedFile = {
  fileName: string;
  fileId: string;
  content: string;
};

type ChatImageGenerationMetadata = {
  generationId: string;
  originalPrompt: string;
  finalPrompt?: string | null;
  model: string;
  aspectRatio: string;
  resolution: string;
  status: string;
  images?: string[];
  referenceImages?: Array<{ url: string; name?: string }>;
  taskPlan?: {
    mode: "text-to-image" | "image-to-image";
    reason?: string;
    defaultsApplied?: string[];
  };
  failureReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type ChatImageTaskPlan = {
  shouldGenerate: boolean;
  clarificationQuestion?: string;
  finalPrompt: string;
  aspectRatio: string;
  resolution: "1K";
  mode: "text-to-image" | "image-to-image";
  reason?: string;
  defaultsApplied: string[];
};

type AsyncAgentTaskPlan = {
  kind: "agent" | "ppt" | "word";
  label: string;
  pendingContent: string;
  pendingFileName?: string;
  requiresGeneratedFile: boolean;
};

type AgentRuntimePublicStatus = {
  label: string;
  steps: string[];
  events: Array<{
    stage: string;
    label: string;
    visible: boolean;
  }>;
  completedLabel: string;
};

type ChatStreamWriter = {
  runtimeStatus: (stage: string, message: string) => void;
  token: (text: string) => void;
  toolStatus: (message: string) => void;
  final: (data: Record<string, unknown>) => void;
  error: (message: string) => void;
};

type ChatTaskCardType = "ppt" | "word" | "excel" | "image" | "file-analysis" | "teaching-diagram" | "knowledge-graph";

type ChatTaskCard = {
  kind: "task_card";
  taskType: ChatTaskCardType;
  status: "queued" | "running" | "completed" | "failed";
  title: string;
  description?: string;
  taskId?: string;
  downloadUrl?: string | null;
  openUrl?: string | null;
  retryable?: boolean;
  failureReason?: string | null;
};

class ChatRouteError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const CHAT_TIMEOUT_MS = 60_000;
const CHAT_AGENT_FAST_TIMEOUT_MS = 90_000;
const AGENT_LONG_TASK_TIMEOUT_MS = 180_000;
const AGENT_FILE_TASK_TIMEOUT_MS = 240_000;
const CHAT_IMAGE_MODEL = "gpt-image-2";
const CHAT_IMAGE_RESOLUTION = "1K";
const CHAT_IMAGE_PROMPT_TIMEOUT_MS = 4500;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_FILE_SIZE = 80 * 1024 * 1024;
const MAX_FILES = 5;
const allowedExtensions = new Set(["png", "jpg", "jpeg", "webp", "pdf", "txt", "md", "doc", "docx", "xls", "xlsx", "csv", "mp4", "mov", "webm", "m4v"]);

const modelProviders: Record<string, AgentProvider> = {
  "gpt-5.4": "xheai",
  "kimi-k2.5": "moonshot"
};

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

function wantsStream(request: NextRequest) {
  if (request.nextUrl.searchParams.get("stream") === "1") return true;
  return (request.headers.get("accept") || "").includes("text/event-stream");
}

function createSseEncoder(controller: ReadableStreamDefaultController<Uint8Array>) {
  const encoder = new TextEncoder();
  return (event: string, data: Record<string, unknown>) => {
    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  };
}

function streamResponse(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no"
    }
  });
}

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const role = typeof item?.role === "string" ? item.role : "";
      const content = typeof item?.content === "string" ? item.content.trim() : "";
      if ((role === "system" || role === "user" || role === "assistant") && content) return { role, content };
      return null;
    })
    .filter(Boolean)
    .slice(-20) as ChatMessage[];
}

function normalizeTools(value: unknown): AgentToolSelection | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as { webSearch?: unknown; contentMode?: unknown };
  const contentMode =
    raw.contentMode === "write" || raw.contentMode === "ppt" || raw.contentMode === "image" ? raw.contentMode : null;
  return {
    webSearch: raw.webSearch === true,
    contentMode
  };
}

function getChatTimeoutMs(parsed: ParsedRequest) {
  if (parsed.files.length > 0) return AGENT_FILE_TASK_TIMEOUT_MS;
  if (parsed.mode !== "agent") return CHAT_TIMEOUT_MS;
  if (parsed.tools?.webSearch || parsed.tools?.contentMode === "write" || parsed.tools?.contentMode === "ppt" || parsed.tools?.contentMode === "image") {
    return AGENT_LONG_TASK_TIMEOUT_MS;
  }
  const fastTimeoutMs = Number(process.env.AGENT_FAST_CHAT_TIMEOUT_MS || CHAT_AGENT_FAST_TIMEOUT_MS);
  return Math.max(Number.isFinite(fastTimeoutMs) ? fastTimeoutMs : CHAT_AGENT_FAST_TIMEOUT_MS, 60_000);
}

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function isAllowedFile(file: File) {
  return allowedExtensions.has(getExtension(file.name));
}

function makeTitle(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 20 ? `${compact.slice(0, 20)}...` : compact || "新对话";
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function getDatePath() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function getAttachmentKind(mimeType?: string | null, fileName?: string) {
  const extension = fileName?.split(".").pop()?.toLowerCase() || "";
  if (mimeType?.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(extension)) return "image";
  if (mimeType?.startsWith("video/") || ["mp4", "mov", "webm", "m4v"].includes(extension)) return "video";
  if (extension === "pdf") return "pdf";
  if (["xls", "xlsx", "csv"].includes(extension)) return "spreadsheet";
  if (["txt", "md"].includes(extension)) return "text";
  if (["doc", "docx"].includes(extension)) return "word";
  return "file";
}

function isImageAttachment(file: File) {
  const extension = getExtension(file.name);
  return file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(extension);
}

function isVagueImageRequest(text: string) {
  const compact = text
    .replace(/[，。！？、,.!?]/g, " ")
    .replace(/\s+/g, "")
    .replace(/(帮我|请|生成|画|做|制作|设计|一张|一个|图片|图像|海报|配图|插画|封面|背景图)/g, "");
  return compact.length < 4;
}

function inferImageAspectRatio(text: string) {
  const normalized = text.toLowerCase().replace(/\s+/g, "");
  if (/16[:：比]?9|十六比九|横版|宽屏|横屏/.test(normalized)) return "16:9";
  if (/9[:：比]?16|九比十六|竖版|竖屏/.test(normalized)) return "9:16";
  if (/4[:：比]?3|四比三/.test(normalized)) return "4:3";
  if (/3[:：比]?4|三比四/.test(normalized)) return "3:4";
  if (/1[:：比]?1|一比一|正方形|方图/.test(normalized)) return "1:1";

  if (/头像|logo|图标|徽标|表情包|贴纸|印章/.test(normalized)) return "1:1";
  if (/海报|宣传|广告|联动|促销|活动|小红书|朋友圈|手机壁纸|短视频封面|竖版封面/.test(normalized)) return "9:16";
  if (/ppt|课件|课堂|课程|配图|横幅|banner|网站|电脑壁纸|演示|封面图|网页/.test(normalized)) return "16:9";
  if (/书籍封面|杂志封面|人物全身|立绘/.test(normalized)) return "3:4";
  return "16:9";
}

function buildFallbackImagePrompt(userText: string, aspectRatio: string) {
  const ratioHint =
    aspectRatio === "9:16"
      ? "竖版构图，适合海报或移动端展示"
      : aspectRatio === "1:1"
        ? "正方形构图，主体居中，适合头像、图标或社交媒体封面"
        : aspectRatio === "3:4"
          ? "竖向构图，主体完整，适合封面或人物展示"
          : aspectRatio === "4:3"
            ? "经典横向构图，画面稳定，适合教学插图"
            : "横向宽屏构图，适合课堂展示、PPT 或网页配图";
  const hasRegionHint =
    /中国|大陆|亚洲|东亚|日本|韩国|欧美|美国|英国|法国|德国|欧洲|泰国|越南|新加坡|香港|台湾|澳门|北京|上海|广州|深圳|重庆|成都|杭州|南京|武汉|西安/.test(
      userText
    );
  const regionHint = hasRegionHint ? "" : "默认地域与人物气质：中国、亚洲语境，符合中国大陆审美和生活场景。";

  return [
    userText,
    "",
    regionHint,
    `画面比例：${aspectRatio}，${ratioHint}。`,
    "要求：主体明确，构图完整，层次清晰，光线自然，色彩协调，细节丰富，画面干净，避免多余文字、水印、变形和低清晰度。"
  ].filter(Boolean).join("\n");
}

function hasImageRegionHint(text: string) {
  return /中国|大陆|亚洲|东亚|日本|韩国|欧美|美国|英国|法国|德国|欧洲|泰国|越南|新加坡|香港|台湾|澳门|北京|上海|广州|深圳|重庆|成都|杭州|南京|武汉|西安/.test(
    text
  );
}

function sanitizeAspectRatio(value: unknown, fallback: string) {
  return ["1:1", "4:3", "3:4", "16:9", "9:16"].includes(String(value)) ? String(value) : fallback;
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const source = fenced || trimmed;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(source.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeImageTaskPlan(value: Record<string, unknown> | null, fallback: ChatImageTaskPlan): ChatImageTaskPlan {
  if (!value) return fallback;
  const shouldGenerate = typeof value.shouldGenerate === "boolean" ? value.shouldGenerate : fallback.shouldGenerate;
  const clarificationQuestion =
    typeof value.clarificationQuestion === "string" ? value.clarificationQuestion.trim().slice(0, 160) : undefined;
  const finalPrompt = typeof value.finalPrompt === "string" ? value.finalPrompt.trim() : fallback.finalPrompt;
  const aspectRatio = sanitizeAspectRatio(value.aspectRatio, fallback.aspectRatio);
  const mode = value.mode === "image-to-image" || value.mode === "text-to-image" ? value.mode : fallback.mode;
  const reason = typeof value.reason === "string" ? value.reason.trim().slice(0, 160) : fallback.reason;
  const defaultsApplied = Array.isArray(value.defaultsApplied)
    ? value.defaultsApplied.filter((item): item is string => typeof item === "string").slice(0, 5)
    : fallback.defaultsApplied;

  return {
    shouldGenerate,
    clarificationQuestion,
    finalPrompt: finalPrompt || fallback.finalPrompt,
    aspectRatio,
    resolution: "1K",
    mode,
    reason,
    defaultsApplied
  };
}

function buildLocalImageTaskPlan(userText: string, files: File[]): ChatImageTaskPlan {
  const hasReferenceImage = files.some(isImageAttachment);
  const aspectRatio = inferImageAspectRatio(userText);
  const defaultsApplied = ["resolution:1K"];
  if (!hasImageRegionHint(userText)) defaultsApplied.push("region:china_asia");

  return {
    shouldGenerate: !isVagueImageRequest(userText),
    clarificationQuestion: isVagueImageRequest(userText)
      ? "可以，我先确认一下：你想生成什么画面？请补充主题、用途或风格，比如“课堂导入海报”“课程封面”“写实插画”等。"
      : undefined,
    finalPrompt: buildFallbackImagePrompt(userText, aspectRatio),
    aspectRatio,
    resolution: "1K",
    mode: hasReferenceImage ? "image-to-image" : "text-to-image",
    reason: hasReferenceImage ? "用户上传了参考图，按图生图任务处理" : "用户选择了图像生成",
    defaultsApplied
  };
}

async function parseImageTaskPlanWithModel(userText: string, files: File[], signal: AbortSignal) {
  const fallback = buildLocalImageTaskPlan(userText, files);
  if (!fallback.shouldGenerate) return fallback;

  const childSignal = createChildAbortSignal(signal, CHAT_IMAGE_PROMPT_TIMEOUT_MS);
  try {
    const content = await callChatModel({
      provider: "xheai",
      model: "gpt-5.4",
      signal: childSignal.signal,
      messages: [
        {
          role: "system",
          content:
            "你是 Nexus Agent 的图像任务解析器。请把用户自然语言解析为稳定 JSON，不要输出 Markdown。字段：shouldGenerate:boolean, clarificationQuestion?:string, finalPrompt:string, aspectRatio:'1:1'|'4:3'|'3:4'|'16:9'|'9:16', mode:'text-to-image'|'image-to-image', reason?:string, defaultsApplied:string[]。如果需求过于空泛，应 shouldGenerate=false 并给 clarificationQuestion。默认画质固定 1K；用户未说明国家地区时，在 finalPrompt 中补充中国、亚洲语境。"
        },
        {
          role: "user",
          content: JSON.stringify({
            userText,
            hasReferenceImage: files.some(isImageAttachment),
            fallback
          })
        }
      ]
    });
    const plan = normalizeImageTaskPlan(extractJsonObject(content), fallback);
    if (!plan.shouldGenerate && !plan.clarificationQuestion) {
      return { ...plan, clarificationQuestion: fallback.clarificationQuestion || "请再补充一下你想生成的画面主题或用途。" };
    }
    return plan;
  } catch (error) {
    console.warn(`[ai:chat:image] task_plan_failed error=${error instanceof Error ? error.message : "unknown"}`);
    return fallback;
  } finally {
    childSignal.dispose();
  }
}

function createChildAbortSignal(parentSignal: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  if (parentSignal.aborted) controller.abort();
  else parentSignal.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parentSignal.removeEventListener("abort", abort);
    }
  };
}

async function optimizeImagePrompt(userText: string, aspectRatio: string, signal: AbortSignal) {
  const fallbackPrompt = buildFallbackImagePrompt(userText, aspectRatio);
  const childSignal = createChildAbortSignal(signal, CHAT_IMAGE_PROMPT_TIMEOUT_MS);
  try {
    const content = await callChatModel({
      provider: "xheai",
      model: "gpt-5.4",
      signal: childSignal.signal,
      messages: [
        {
          role: "system",
          content:
            "你是 Nexus Agent 的图像生成提示词优化器。根据用户需求生成适合文生图/图生图模型的中文提示词。要求：补全主体、画面构图、风格、光线、色彩、细节、用途和画幅；如果用户没有明确国家或地区，默认补充中国、亚洲语境；保留用户核心意图；不要输出解释、标题或 Markdown；不超过 300 字。"
        },
        {
          role: "user",
          content: `用户需求：${userText}\n推荐比例：${aspectRatio}\n基础提示词：${fallbackPrompt}`
        }
      ]
    });
    return content.replace(/^["“]|["”]$/g, "").trim() || fallbackPrompt;
  } catch (error) {
    console.warn(`[ai:chat:image] prompt_optimize_failed error=${error instanceof Error ? error.message : "unknown"}`);
    return fallbackPrompt;
  } finally {
    childSignal.dispose();
  }
}

async function createImageGenerationFromChat({
  request,
  userText,
  finalPrompt,
  aspectRatio,
  files,
  taskPlan
}: {
  request: NextRequest;
  userText: string;
  finalPrompt: string;
  aspectRatio: string;
  files: File[];
  taskPlan: ChatImageTaskPlan;
}) {
  const formData = new FormData();
  const referenceImage = files.find(isImageAttachment) || null;
  formData.append("model", CHAT_IMAGE_MODEL);
  formData.append("prompt", finalPrompt);
  formData.append("style", "");
  formData.append("aspect_ratio", aspectRatio);
  formData.append("resolution", CHAT_IMAGE_RESOLUTION);
  formData.append("count", "1");
  if (referenceImage) formData.append("image", referenceImage, referenceImage.name);

  const response = await fetch(new URL("/api/ai/image", request.nextUrl.origin), {
    method: "POST",
    headers: {
      cookie: request.headers.get("cookie") || ""
    },
    body: formData
  });
  const data = (await response.json().catch(() => ({}))) as {
    generation?: {
      id?: string;
      taskId?: string;
      status?: string;
      images?: string[];
      createdAt?: string;
      updatedAt?: string;
      failureReason?: string | null;
    };
    code?: string;
    message?: string;
  };

  if (!response.ok || !data.generation?.taskId) {
    throw new ChatRouteError(data.code || "IMAGE_TASK_CREATE_FAILED", data.message || "图片生成任务创建失败，请稍后重试。", response.status || 502);
  }

  return {
    generationId: data.generation.taskId,
    originalPrompt: userText,
    finalPrompt,
    model: CHAT_IMAGE_MODEL,
    aspectRatio,
    resolution: CHAT_IMAGE_RESOLUTION,
    status: data.generation.status || "生成中",
    images: data.generation.images || [],
    taskPlan: {
      mode: taskPlan.mode,
      reason: taskPlan.reason,
      defaultsApplied: taskPlan.defaultsApplied
    },
    failureReason: data.generation.failureReason || null,
    createdAt: data.generation.createdAt,
    updatedAt: data.generation.updatedAt
  } satisfies ChatImageGenerationMetadata;
}

async function runChatImageGeneration({
  request,
  userText,
  files,
  signal
}: {
  request: NextRequest;
  userText: string;
  files: File[];
  signal: AbortSignal;
}): Promise<{ result: AgentRunResult; imageGeneration: ChatImageGenerationMetadata | null }> {
  const taskPlan = await parseImageTaskPlanWithModel(userText, files, signal);
  if (!taskPlan.shouldGenerate) {
    return {
      result: {
        content:
          taskPlan.clarificationQuestion ||
          "可以，我先确认一下：你想生成什么画面？请补充主题、用途或风格，比如“课堂导入海报”“课程封面”“写实插画”等。",
        modelUsed: CHAT_IMAGE_MODEL,
        providerUsed: "xheai",
        routeReason: "image_clarification",
        fallbackUsed: false,
        extractedDocuments: [],
        generatedFiles: [],
        pendingTask: null,
        defaultsApplied: []
      },
      imageGeneration: null
    };
  }

  const aspectRatio = taskPlan.aspectRatio;
  const finalPrompt =
    taskPlan.finalPrompt && taskPlan.finalPrompt.length >= 12
      ? taskPlan.finalPrompt
      : await optimizeImagePrompt(userText, aspectRatio, signal);
  const finalPlan = {
    ...taskPlan,
    finalPrompt
  };
  const imageGeneration = await createImageGenerationFromChat({
    request,
    userText,
    finalPrompt,
    aspectRatio,
    files,
    taskPlan: finalPlan
  });
  return {
    result: {
      content: `好的，我正在围绕“${userText}”生成图片。`,
      modelUsed: CHAT_IMAGE_MODEL,
      providerUsed: "xheai",
      routeReason: "chat_image_generation",
      fallbackUsed: false,
      extractedDocuments: [],
      generatedFiles: [],
      pendingTask: null,
      defaultsApplied: []
    },
    imageGeneration
  };
}

async function toClientAttachment(attachment: {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  objectKey: string | null;
  url: string | null;
  providerFileId: string | null;
  createdAt: Date;
}) {
  const downloadUrl = attachment.objectKey
    ? await storage.getPublicOrSignedUrl(attachment.objectKey).catch(() => null)
    : null;
  const url = downloadUrl || attachment.url;

  return {
    id: attachment.id,
    name: attachment.fileName,
    type: attachment.mimeType || "",
    size: attachment.sizeBytes,
    kind: getAttachmentKind(attachment.mimeType, attachment.fileName),
    previewUrl: url || undefined,
    url,
    downloadUrl: `/api/ai/chat/attachments/${encodeURIComponent(attachment.id)}/download`,
    objectKey: attachment.objectKey,
    providerFileId: attachment.providerFileId,
    uploadedAt: formatTime(attachment.createdAt),
    status: "已发送"
  };
}

async function parseRequest(request: NextRequest): Promise<ParsedRequest> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const mode = formData.get("mode") === "manual" ? "manual" : "agent";
    const model = String(formData.get("model") || "gpt-5.4");
    const conversationId = String(formData.get("conversationId") || "").trim() || null;
    const requestId = String(formData.get("requestId") || "").trim() || randomUUID();
    const rawMessages = String(formData.get("messages") || "[]");
    const rawTools = String(formData.get("tools") || "");
    const stream = String(formData.get("stream") || "") === "true";
    const messages = normalizeMessages(JSON.parse(rawMessages || "[]"));
    const tools = normalizeTools(parseJsonObject(rawTools));
    const files = formData.getAll("files").filter((item): item is File => item instanceof File);
    return { mode, conversationId, model, messages, files, requestId, stream, tools };
  }

  const body = (await request.json().catch(() => null)) as {
    mode?: string;
    conversationId?: string | null;
    model?: string;
    messages?: unknown;
    requestId?: unknown;
    stream?: unknown;
    tools?: unknown;
  } | null;

  return {
    mode: body?.mode === "manual" ? "manual" : "agent",
    conversationId: body?.conversationId || null,
    model: body?.model || "gpt-5.4",
    messages: normalizeMessages(body?.messages),
    files: [],
    requestId: typeof body?.requestId === "string" && body.requestId.trim() ? body.requestId.trim() : randomUUID(),
    stream: body?.stream === true,
    tools: normalizeTools(body?.tools)
  };
}

function validateFiles(files: File[], mode: ChatMode, model: string) {
  if (files.length > MAX_FILES) return jsonError("TOO_MANY_FILES", `单次最多上传 ${MAX_FILES} 个文件。`, 400);

  for (const file of files) {
    if (isVideoUnderstandingFile(file)) {
      if (file.size > MAX_VIDEO_FILE_SIZE) return jsonError("FILE_TOO_LARGE", `${file.name} 超过 80MB。`, 400);
      continue;
    }
    if (file.size > MAX_FILE_SIZE) return jsonError("FILE_TOO_LARGE", `${file.name} 超过 10MB。`, 400);
    if (!isAllowedFile(file)) return jsonError("UNSUPPORTED_FILE_TYPE", `${file.name} 暂不支持解析。`, 400);
  }

  if (mode === "manual" && files.some((file) => isDocumentFile(file) || isVideoUnderstandingFile(file)) && model !== "kimi-k2.5") {
    return jsonError("UNSUPPORTED_MODEL_FOR_FILES", "手动模式下，文件理解能力仅支持 kimi-k2.5。", 400);
  }

  return null;
}

async function getOrCreateConversation({
  conversationId,
  userId,
  model,
  firstMessage
}: {
  conversationId: string | null;
  userId: string;
  model: string;
  firstMessage: string;
}) {
  if (conversationId && !conversationId.startsWith("draft-") && !conversationId.startsWith("local-")) {
    const existing = await prisma.chatConversation.findFirst({ where: { id: conversationId, userId } });
    if (existing) return existing;
  }

  return prisma.chatConversation.create({
    data: { userId, title: makeTitle(firstMessage), model }
  });
}

function parseJsonObject(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function compactWebContext(webContext?: WebContextResult | null) {
  if (!webContext) return null;
  return {
    provider: webContext.provider,
    query: webContext.query,
    summary: webContext.summary ? webContext.summary.slice(0, 240) : "",
    items: webContext.items
      .filter((item) => item.url && item.title)
      .slice(0, 12)
      .map((item) => ({
        id: item.id,
        title: item.title.slice(0, 80),
        url: item.url,
        snippet: item.snippet ? item.snippet.replace(/\s+/g, " ").trim().slice(0, 160) : "",
        website: item.website,
        date: item.date,
        type: item.type
      })),
    rawMeta: {
      requestId: webContext.rawMeta?.requestId,
      source: webContext.rawMeta?.source,
      fallbackUsed: webContext.rawMeta?.fallbackUsed,
      fallbackFrom: webContext.rawMeta?.fallbackFrom,
      fetchedPages: webContext.rawMeta?.fetchedPages,
      searchDepth: webContext.rawMeta?.searchDepth
    }
  };
}

function normalizeTaskCardStatus(status?: string): ChatTaskCard["status"] {
  if (status === "completed") return "completed";
  if (status === "failed" || status === "timeout") return "failed";
  if (status === "queued" || status === "pending") return "queued";
  return "running";
}

function taskTypeFromTarget(targetTool?: string | null): ChatTaskCardType | null {
  if (targetTool === "ppt-simple" || targetTool === "ppt") return "ppt";
  if (targetTool === "word") return "word";
  if (targetTool === "excel") return "excel";
  if (targetTool === "image") return "image";
  if (targetTool === "file-analysis") return "file-analysis";
  if (targetTool === "teaching-diagram") return "teaching-diagram";
  if (targetTool === "knowledge-graph") return "knowledge-graph";
  return null;
}

function getTaskTypeTitle(taskType: ChatTaskCardType) {
  if (taskType === "ppt") return "PPT 生成任务";
  if (taskType === "word") return "Word 生成任务";
  if (taskType === "excel") return "Excel 任务";
  if (taskType === "image") return "图片任务";
  if (taskType === "file-analysis") return "文件分析";
  if (taskType === "teaching-diagram") return "教学架构图";
  return "知识图谱";
}

function buildTaskCard(input: {
  taskType: ChatTaskCardType;
  status?: ChatTaskCard["status"] | string;
  title?: string;
  description?: string;
  taskId?: string;
  downloadUrl?: string | null;
  openUrl?: string | null;
  retryable?: boolean;
  failureReason?: string | null;
}): ChatTaskCard {
  return {
    kind: "task_card",
    taskType: input.taskType,
    status: typeof input.status === "string" ? normalizeTaskCardStatus(input.status) : input.status || "running",
    title: input.title || getTaskTypeTitle(input.taskType),
    description: input.description,
    taskId: input.taskId,
    downloadUrl: input.downloadUrl || null,
    openUrl: input.openUrl || null,
    retryable: input.retryable,
    failureReason: input.failureReason || null
  };
}

function buildAsyncTaskCard(input: {
  kind: "agent" | "ppt" | "word";
  label: string;
  taskId: string;
  fileName?: string;
  requiresGeneratedFile: boolean;
  status?: ChatTaskCard["status"] | string;
  failureReason?: string | null;
}): ChatTaskCard {
  const taskType: ChatTaskCardType = input.kind === "ppt" ? "ppt" : input.kind === "word" ? "word" : "file-analysis";
  return buildTaskCard({
    taskType,
    status: input.status || "queued",
    title: input.fileName || input.label || getTaskTypeTitle(taskType),
    description:
      taskType === "file-analysis"
        ? "正在分析文件并整理结果"
        : `正在生成 ${taskType === "ppt" ? "PPT" : "Word"} 文件`,
    taskId: input.taskId,
    downloadUrl: null,
    openUrl: input.taskId ? `/api/ai/chat/tasks/${encodeURIComponent(input.taskId)}` : null,
    retryable: input.status === "failed",
    failureReason: input.failureReason || null
  });
}

function buildAdapterTaskCard(input: {
  targetTool?: string | null;
  resultCard?: {
    title: string;
    description: string;
    status: string;
    taskType?: string;
    taskId?: string;
    downloadUrl?: string | null;
    openUrl?: string | null;
    retryable?: boolean;
    failureReason?: string | null;
  } | null;
  generatedAttachment?: { downloadUrl?: string; url?: string | null; name?: string } | null;
  imageGeneration?: unknown | null;
}): ChatTaskCard | null {
  const rawTaskType = typeof input.resultCard?.taskType === "string" ? input.resultCard.taskType : null;
  const taskType = taskTypeFromTarget(rawTaskType || input.targetTool) || taskTypeFromTarget(input.targetTool);
  if (!taskType || !input.resultCard) return null;
  const imageTask =
    input.imageGeneration && typeof input.imageGeneration === "object"
      ? (input.imageGeneration as { generationId?: string; status?: string; failureReason?: string | null })
      : null;
  const generatedDownloadUrl = input.generatedAttachment?.downloadUrl || input.generatedAttachment?.url || null;
  return buildTaskCard({
    taskType,
    status: generatedDownloadUrl ? "completed" : imageTask?.status || input.resultCard.status,
    title: input.resultCard.title || input.generatedAttachment?.name || getTaskTypeTitle(taskType),
    description: input.resultCard.description,
    taskId: input.resultCard.taskId || imageTask?.generationId,
    downloadUrl: generatedDownloadUrl || input.resultCard.downloadUrl || null,
    openUrl: input.resultCard.openUrl || null,
    retryable: input.resultCard.retryable ?? true,
    failureReason: input.resultCard.failureReason || imageTask?.failureReason || null
  });
}

async function getConversationSummaryCache(conversationId: string, userId: string) {
  // Conversation-level memory only: never read summaries from another conversation or a user profile.
  const latestAssistant = await prisma.chatMessage.findFirst({
    where: {
      role: "assistant",
      conversation: { id: conversationId, userId }
    },
    orderBy: { createdAt: "desc" },
    select: { metadata: true }
  });
  const metadata = parseJsonObject(latestAssistant?.metadata || null);
  const summary = metadata?.conversationSummaryCache;
  return typeof summary === "string" && summary.trim() ? summary.slice(0, 1200) : null;
}

function getAsyncPendingKind(text: string, tools?: AgentToolSelection): "ppt" | "word" | null {
  const normalized = text.toLowerCase().replace(/\s+/g, "");
  if (tools?.contentMode === "ppt" || /ppt|pptx|演示文稿|幻灯片|课件/.test(normalized)) return "ppt";
  if (tools?.contentMode === "write" || /word|docx/.test(normalized)) return "word";
  return null;
}

function getPendingFileName(kind: "ppt" | "word") {
  return kind === "ppt" ? "演示文稿.pptx" : "文档.docx";
}

function getAsyncAgentTaskPlan({
  files,
  pendingTask,
  text,
  tools
}: {
  files: File[];
  pendingTask?: AgentTask | null;
  text: string;
  tools?: AgentToolSelection;
}): AsyncAgentTaskPlan | null {
  if (pendingTask || tools?.contentMode === "image") return null;
  if (!files.length && !isFunctionalAgentTask(text, tools)) return null;
  const task = extractAgentTask(text, files.length > 0, { pendingTask, tools });
  if (task.type === "clarify" || shouldUseFastChatRoute({ text, hasFiles: files.length > 0, task, tools })) return null;

  const fileKind =
    task.type === "create_presentation" || task.outputFormat === "pptx"
      ? "ppt"
      : task.type === "create_document" || task.outputFormat === "docx"
        ? "word"
        : getAsyncPendingKind(text, tools);

  if (fileKind === "ppt") {
    return {
      kind: "ppt",
      label: "PPT 生成",
      pendingContent: "好的，我已收到需求，正在生成 PPT。",
      pendingFileName: getPendingFileName("ppt"),
      requiresGeneratedFile: true
    };
  }

  if (fileKind === "word") {
    return {
      kind: "word",
      label: "Word 生成",
      pendingContent: "好的，我已收到需求，正在生成 Word 文档。",
      pendingFileName: getPendingFileName("word"),
      requiresGeneratedFile: true
    };
  }

  if (files.length) {
    return {
      kind: "agent",
      label: "Nexus AI 正在理解文件",
      pendingContent: "好的，Nexus AI 正在理解文件并整理回答。",
      requiresGeneratedFile: false
    };
  }

  return {
    kind: "agent",
    label: "Nexus AI 正在思考",
    pendingContent: "好的，Nexus AI 正在思考并整理回答。",
    requiresGeneratedFile: false
  };
}

async function getPendingAgentTask(conversationId: string, userId: string) {
  const latestAssistant = await prisma.chatMessage.findFirst({
    where: {
      role: "assistant",
      conversation: { id: conversationId, userId }
    },
    orderBy: { createdAt: "desc" }
  });
  const metadata = parseJsonObject(latestAssistant?.metadata || null);
  const pendingTask = metadata?.pendingTask;
  if (!pendingTask || typeof pendingTask !== "object") return null;

  const agentTask = metadata?.agentTask;
  const isActiveClarification =
    agentTask &&
    typeof agentTask === "object" &&
    (agentTask as AgentTask).type === "clarify" &&
    (pendingTask as AgentTask).type === "clarify";

  return isActiveClarification ? (pendingTask as AgentTask) : null;
}

function taskCardKindToActiveKind(value: unknown): AgentActiveTask["kind"] | null {
  if (value === "ppt") return "ppt";
  if (value === "word") return "word";
  if (value === "excel") return "excel";
  if (value === "image") return "image";
  if (value === "file-analysis") return "file-analysis";
  if (value === "teaching-diagram") return "teaching-diagram";
  if (value === "knowledge-graph") return "knowledge-graph";
  return null;
}

function inferActiveTaskKind(metadata: Record<string, unknown> | null, attachments: Array<{ fileName: string }>): AgentActiveTask["kind"] | null {
  const taskCard = metadata?.taskCard;
  if (taskCard && typeof taskCard === "object") {
    const kind = taskCardKindToActiveKind((taskCard as Record<string, unknown>).taskType);
    if (kind) return kind;
  }
  const imageGeneration = metadata?.imageGeneration;
  if (imageGeneration && typeof imageGeneration === "object") return "image";
  const asyncTask = metadata?.asyncTask;
  if (asyncTask && typeof asyncTask === "object") {
    const kind = (asyncTask as Record<string, unknown>).kind;
    if (kind === "ppt") return "ppt";
    if (kind === "word") return "word";
    if (kind === "agent") return "file-analysis";
  }
  const routeReason = typeof metadata?.routeReason === "string" ? metadata.routeReason : "";
  if (routeReason.includes("teaching_diagram")) return "teaching-diagram";
  if (routeReason.includes("knowledge_graph")) return "knowledge-graph";
  const fileName = attachments[0]?.fileName?.toLowerCase() || "";
  if (fileName.endsWith(".pptx")) return "ppt";
  if (fileName.endsWith(".docx")) return "word";
  if (fileName.endsWith(".xlsx") || fileName.endsWith(".csv")) return "excel";
  return null;
}

async function getActiveConversationTask(conversationId: string, userId: string): Promise<AgentActiveTask | null> {
  // Conversation-level memory only: recover active objects from this conversationId and this user.
  const recentAssistants = await prisma.chatMessage.findMany({
    where: {
      role: "assistant",
      conversation: { id: conversationId, userId }
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      attachments: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });

  for (const assistant of recentAssistants) {
    const metadata = parseJsonObject(assistant.metadata || null);
    const kind = inferActiveTaskKind(metadata, assistant.attachments);
    if (!kind) continue;
    const taskCard = metadata?.taskCard && typeof metadata.taskCard === "object" ? (metadata.taskCard as Record<string, unknown>) : null;
    return {
      id: typeof taskCard?.taskId === "string" && taskCard.taskId ? taskCard.taskId : assistant.id,
      kind,
      title:
        (typeof taskCard?.title === "string" && taskCard.title) ||
        assistant.attachments[0]?.fileName ||
        assistant.content.slice(0, 32),
      status: (typeof taskCard?.status === "string" && taskCard.status) || "active",
      source: "conversation"
    };
  }

  const latestUserAttachment = await prisma.chatAttachment.findFirst({
    where: {
      conversationId,
      userId,
      message: { role: "user" }
    },
    orderBy: { createdAt: "desc" }
  });
  if (!latestUserAttachment) return null;

  const fileName = latestUserAttachment.fileName.toLowerCase();
  const kind: AgentActiveTask["kind"] =
    fileName.endsWith(".pptx") || fileName.endsWith(".ppt")
      ? "ppt"
      : fileName.endsWith(".xlsx") || fileName.endsWith(".csv") || fileName.endsWith(".xls")
        ? "excel"
        : latestUserAttachment.mimeType?.startsWith("image/")
          ? "image"
          : "file-analysis";
  return {
    id: latestUserAttachment.id,
    kind,
    title: latestUserAttachment.fileName,
    status: "uploaded",
    source: "conversation"
  };
}

async function saveUserAttachments({
  files,
  userId,
  conversationId,
  messageId,
  extractedFiles
}: {
  files: File[];
  userId: string;
  conversationId: string;
  messageId: string;
  extractedFiles: ExtractedFile[];
}) {
  const extractedByName = new Map(extractedFiles.map((file) => [file.fileName, file]));
  const datePath = getDatePath();
  const rows = [];

  for (const file of files) {
    const extension = getExtension(file.name) || "bin";
    const key = `users/${userId}/chat/${datePath}/${randomUUID()}.${extension}`;
    let uploadResult: storage.StorageObjectResult | null = null;

    try {
      uploadResult = await storage.uploadFile({
        key,
        file,
        contentType: file.type || "application/octet-stream"
      });
    } catch {
      console.error(`[ai:chat] attachment storage failed file=${file.name}`);
    }

    const extracted = extractedByName.get(file.name);
    rows.push({
      messageId,
      conversationId,
      userId,
      fileName: file.name,
      mimeType: file.type || extension,
      sizeBytes: file.size,
      objectKey: uploadResult?.key || null,
      url: uploadResult?.url || null,
      providerFileId: extracted?.fileId || null,
      extractedText: extracted?.content ? extracted.content.slice(0, 20_000) : null
    });
  }

  if (!rows.length) return [];
  await prisma.chatAttachment.createMany({ data: rows });
  return prisma.chatAttachment.findMany({
    where: { messageId },
    orderBy: { createdAt: "asc" }
  });
}

async function saveGeneratedFiles({
  files,
  userId,
  conversationId,
  messageId
}: {
  files: GeneratedAgentFile[];
  userId: string;
  conversationId: string;
  messageId: string;
}) {
  if (!files.length) return [];

  await prisma.chatAttachment.createMany({
    data: files.map((file) => ({
      messageId,
      conversationId,
      userId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      objectKey: file.objectKey,
      url: file.url,
      extractedText: null
    }))
  });

  return prisma.chatAttachment.findMany({
    where: { messageId },
    orderBy: { createdAt: "asc" }
  });
}

type ChatErrorInfo = {
  code: string;
  kind: string;
  message: string;
  providerRequest?: {
    elapsedMs?: number;
    endpoint?: string;
    model?: string;
    provider?: AgentProvider;
    requestId?: string;
    stage?: string;
    status?: number;
    timeoutMs?: number;
  };
  status: number;
};

function getChatErrorInfo(error: unknown, timeoutMs?: number): ChatErrorInfo {
  if (isAgentProviderRequestError(error)) {
    const providerRequest = {
      elapsedMs: error.elapsedMs,
      endpoint: error.endpoint,
      model: error.model,
      provider: error.provider,
      requestId: error.requestId,
      status: error.status,
      timeoutMs: error.timeoutMs || timeoutMs
    };
    if (error.kind === "server_timeout") {
      return {
        code: "SERVER_TIMEOUT",
        kind: "server_timeout",
        message: "模型响应超时，请稍后重试。",
        providerRequest,
        status: 504
      };
    }
    if (error.kind === "provider_504") {
      return {
        code: "PROVIDER_TIMEOUT",
        kind: "provider_504",
        message: "模型服务响应超时，请稍后重试。",
        providerRequest,
        status: 504
      };
    }
    if (error.kind === "client_abort") {
      return {
        code: "STREAM_INTERRUPTED",
        kind: "stream_interrupted",
        message: "回复中断，已保留已生成内容，可以重试。",
        providerRequest,
        status: 499
      };
    }
    if (error.kind === "bad_response") {
      return {
        code: "BAD_PROVIDER_RESPONSE",
        kind: "bad_response",
        message: "模型服务返回异常，请稍后重试。",
        providerRequest,
        status: 502
      };
    }
    return {
      code: error.kind === "network_error" ? "NETWORK_ERROR" : "PROVIDER_ERROR",
      kind: error.kind,
      message: "模型服务暂时不可用，请稍后重试。",
      providerRequest,
      status: 502
    };
  }

  if (error instanceof Error) {
    if (
      error.message === "MISSING_XHEAI_API_KEY" ||
      error.message === "MISSING_CLAUDECODER_API_KEY" ||
      error.message === "MISSING_AGENT_TASK_API_KEY" ||
      error.message === "MISSING_KIMI_API_KEY" ||
      error.message === "MISSING_VISION_API_KEY"
    ) {
      return { code: "MISSING_API_KEY", kind: "config_error", message: "模型服务暂未配置，请联系管理员。", status: 500 };
    }
    if (error.message === "VISION_IMAGE_EXTRACT_FAILED") {
      return { code: "VISION_IMAGE_EXTRACT_FAILED", kind: "provider_error", message: "图片内容解析失败，请换一张更清晰的图片或稍后重试。", status: 502 };
    }
    if (error.message === "DEBUG_STREAM_ABORT" || error.message === "client_abort") {
      return { code: "STREAM_INTERRUPTED", kind: "stream_interrupted", message: "回复中断，已保留已生成内容，可以重试。", status: 499 };
    }
    if (error.message === "IMAGE_FILE_TOO_LARGE") {
      return { code: "IMAGE_FILE_TOO_LARGE", kind: "validation_error", message: "图片文件过大，请上传 8MB 以内的图片。", status: 400 };
    }
    if (error.message === "VISION_PROVIDER_ERROR" || error.message === "VISION_BAD_PROVIDER_RESPONSE") {
      return { code: "VISION_PROVIDER_ERROR", kind: "provider_error", message: "图片理解服务暂时不可用，请稍后重试。", status: 502 };
    }
    if (error.message === "KIMI_FILE_UPLOAD_FAILED") {
      return { code: "KIMI_FILE_UPLOAD_FAILED", kind: "provider_error", message: "文件上传到 Kimi 失败，请稍后重试。", status: 502 };
    }
    if (error.message === "KIMI_FILE_EXTRACT_FAILED") {
      return { code: "KIMI_FILE_EXTRACT_FAILED", kind: "provider_error", message: "文件解析服务暂时不可用，请稍后重试。", status: 502 };
    }
    if (error.message === "KIMI_VIDEO_EXTRACT_FAILED" || error.message === "KIMI_CHAT_FAILED") {
      return { code: "KIMI_VIDEO_EXTRACT_FAILED", kind: "provider_error", message: "视频理解服务暂时不可用，请稍后重试。", status: 502 };
    }
    if (error.message === "VIDEO_FILE_TOO_LARGE") {
      return { code: "VIDEO_FILE_TOO_LARGE", kind: "validation_error", message: "视频文件过大，请上传 80MB 以内的视频。", status: 400 };
    }
    if (error.message === "BAD_PROVIDER_RESPONSE") {
      return { code: "BAD_PROVIDER_RESPONSE", kind: "bad_response", message: "模型服务返回异常，请稍后重试。", status: 502 };
    }
    if (error.message === "WORD_DOCUMENT_FAILED") {
      return { code: "WORD_DOCUMENT_FAILED", kind: "provider_error", message: "Word 文档生成失败，请稍后重试。", status: 502 };
    }
    if (error.name === "AbortError") {
      const reason = String((error as Error & { cause?: unknown }).cause || "");
      return {
        code: "SERVER_TIMEOUT",
        kind: reason.includes("client_abort") ? "client_abort" : "server_timeout",
        message: "模型响应超时，请稍后重试。",
        providerRequest: { timeoutMs },
        status: 504
      };
    }
  }

  return { code: "PROVIDER_ERROR", kind: "provider_error", message: "模型服务暂时不可用，请稍后重试。", status: 502 };
}

function providerErrorFromException(error: unknown, timeoutMs?: number) {
  const info = getChatErrorInfo(error, timeoutMs);
  return jsonError(info.code, info.message, info.status);
}

function isAgentDebugRequest(request: NextRequest) {
  return process.env.NODE_ENV === "development" || request.nextUrl.searchParams.get("debugAgent") === "1";
}

function getRuntimeToolLabel(targetTool?: string) {
  if (targetTool === "file-analysis") return "文件分析";
  if (targetTool === "word") return "Word 生成";
  if (targetTool === "excel") return "Excel 处理";
  if (targetTool === "ppt-simple") return "PPT 生成";
  if (targetTool === "image") return "图片修改";
  if (targetTool === "teaching-diagram") return "教学架构图";
  if (targetTool === "knowledge-graph") return "知识图谱";
  return "普通聊天";
}

function buildRuntimePublicStatus(plan: AgentRuntimePlan | null): AgentRuntimePublicStatus | null {
  if (!plan) return null;
  const targetLabel = getRuntimeToolLabel(plan.decision.targetTool);
  const stageLabels: Record<string, string> = {
    analyzing_context: "正在整理上下文",
    planning_intent: "正在理解你的需求",
    selecting_skill: `已识别为：${targetLabel}`,
    checking_execution_gate: "正在判断是否需要工具",
    calling_model: "正在生成回复",
    calling_tool: "正在创建任务",
    completed: "已完成"
  };
  const events = plan.decision.progressStages.map((stage) => ({
    stage,
    label: stageLabels[stage] || "正在处理",
    visible: true
  }));
  const steps = events.map((event) => event.label);
  return {
    label:
      plan.decision.nextAction === "run_legacy_tool"
        ? `已识别为：${targetLabel}`
      : plan.decision.nextAction === "ask_clarification"
          ? "正在检查输入"
          : "正在生成回复",
    steps,
    events,
    completedLabel: "已完成"
  };
}

function compactRuntimeDebugTrace(plan: AgentRuntimePlan | null, activeTask: AgentActiveTask | null, adapterId?: string | null) {
  if (!plan) return null;
  return {
    intent: plan.decision.intent,
    targetTool: plan.decision.targetTool,
    confidence: plan.decision.confidence,
    nextAction: plan.decision.nextAction,
    adapterId: adapterId || null,
    missingInputs: plan.decision.missingInputs,
    activeTaskId: activeTask?.id || null,
    activeTaskKind: activeTask?.kind || null,
    activeTaskTitle: activeTask?.title || null,
    sessionPreferences: plan.trace.contextPack.sessionPreferences,
    memoryHints: plan.trace.contextPack.memoryHints
  };
}

function createConversationSummaryCache(messages: AgentChatMessage[], previousSummary?: string | null) {
  const normalized = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => `${message.role === "user" ? "用户" : "助手"}：${message.content.replace(/\s+/g, " ").trim().slice(0, 180)}`)
    .filter(Boolean);
  if (normalized.length <= 10 && !previousSummary) return null;
  const base = previousSummary ? [`既有摘要：${previousSummary.slice(0, 500)}`] : [];
  return [...base, ...normalized.slice(-10)].join("\n").slice(0, 1200);
}

function buildFileAnswerSummary(documents: ExtractedFile[]) {
  return documents
    .map((file) => {
      const clean = file.content.replace(/\s+/g, " ").trim();
      return `文件：${file.fileName}\n摘要片段：${clean.slice(0, 1200)}`;
    })
    .join("\n\n---\n\n");
}

function streamPlanStages(writer: ChatStreamWriter, plan: AgentRuntimePlan | null) {
  const status = buildRuntimePublicStatus(plan);
  if (!status?.events.length) {
    writer.runtimeStatus("planning_intent", "正在理解你的需求");
    return;
  }
  status.events
    .filter((event) => event.visible && event.stage !== "calling_model" && event.stage !== "calling_tool" && event.stage !== "completed")
    .forEach((event) => writer.runtimeStatus(event.stage, event.label));
}

function toStreamAssistantMessage(message: {
  id: string;
  content: string;
  createdAt: Date;
}, extras?: Partial<{
  attachments: unknown[];
  imageGeneration: unknown | null;
  pendingFileGeneration: unknown | null;
  pendingAgentTask: unknown | null;
  requestId: string | null;
  streamError: string | null;
  streamStatus: string | null;
  taskCard: ChatTaskCard | null;
  webContext: unknown | null;
}>) {
  return {
    id: message.id,
    role: "assistant",
    content: message.content,
    createdAt: formatTime(message.createdAt),
    requestId: extras?.requestId || undefined,
    streamStatus: extras?.streamStatus || undefined,
    streamError: extras?.streamError || undefined,
    taskCard: extras?.taskCard || null,
    attachments: extras?.attachments || [],
    imageGeneration: extras?.imageGeneration || null,
    pendingFileGeneration: extras?.pendingFileGeneration || null,
    pendingAgentTask: extras?.pendingAgentTask || null,
    webContext: extras?.webContext || null
  };
}

function createClarificationResult({
  agentRuntimePlan,
  content,
  routeReason
}: {
  agentRuntimePlan: AgentRuntimePlan | null;
  content: string;
  routeReason: string;
}): AgentRunResult {
  return {
    content,
    modelUsed: "NexusAI Runtime V2",
    providerUsed: "xheai",
    routeReason,
    fallbackUsed: false,
    extractedDocuments: [],
    generatedFiles: [],
    agentTask: agentRuntimePlan?.trace.legacyTask,
    pendingTask: agentRuntimePlan?.trace.legacyTask || null,
    defaultsApplied: [],
    webContext: null
  };
}

async function runManualChat(parsed: ParsedRequest, signal: AbortSignal, timeoutMs?: number): Promise<AgentRunResult> {
  const provider = modelProviders[parsed.model];
  if (!provider) throw new Error("INVALID_MODEL");

  const contextPack = buildAgentRuntimeContextPack({
    messages: parsed.messages as AgentChatMessage[],
    files: parsed.files.map((file) => ({ name: file.name, type: file.type, size: file.size }))
  });
  let messages = buildRuntimeChatMessagesFromContextPack(contextPack) as AgentChatMessage[];
  let extractedFiles: ExtractedFile[] = [];

  if (parsed.files.some(isDocumentFile)) {
    const extractedDocuments = await parseDocumentsWithKimi(parsed.files, signal);
    extractedFiles = extractedDocuments.map((file) => ({
      fileName: file.fileName,
      fileId: file.fileId,
      content: file.content
    }));
    messages = [
      {
        role: "system",
        content: "以下是用户上传文档的压缩摘要。请基于摘要和用户问题回答；如果摘要不足以支持结论，说明需要用户提供更具体片段或文件。"
      },
      { role: "system", content: buildFileAnswerSummary(extractedFiles) },
      ...buildRuntimeChatMessagesFromContextPack({
        ...contextPack,
        attachmentSummaries: extractedFiles.map((file) => ({
          name: file.fileName,
          kind: "document",
          summary: `已解析文档：${file.fileName}`
        })),
        tokenBudgetHint: {
          mode: "file_summary",
          maxRecentMessages: 8,
          maxAttachmentChars: 1800,
          reason: "document_content_summarized_before_model_call"
        }
      }).slice(-2)
    ];
  }

  const content = await callChatModel({ stage: "manual_chat", provider, model: parsed.model, messages, maxTokens: 1600, signal, timeoutMs });

  return {
    content,
    modelUsed: parsed.model,
    providerUsed: provider,
    routeReason: "manual_model",
    fallbackUsed: false,
    extractedDocuments: extractedFiles.map((file) => ({
      fileName: file.fileName,
      fileId: file.fileId,
      content: file.content,
      extractedMarkdown: file.content
    })),
    generatedFiles: [],
    pendingTask: null,
    defaultsApplied: []
  };
}

async function runRuntimeChatAnswer(
  parsed: ParsedRequest,
  signal: AbortSignal,
  timeoutMs?: number,
  options?: { conversationSummary?: string | null; activeTask?: AgentActiveTask | null; onToken?: (token: string) => void; stream?: boolean }
): Promise<AgentRunResult> {
  const model = parsed.model in modelProviders ? parsed.model : "gpt-5.4";
  const runtimeParsed = { ...parsed, mode: "manual" as const, model, tools: { ...parsed.tools, contentMode: null } };
  const contextPack = buildAgentRuntimeContextPack({
    messages: runtimeParsed.messages as AgentChatMessage[],
    files: runtimeParsed.files.map((file) => ({ name: file.name, type: file.type, size: file.size })),
    activeTask: options?.activeTask
      ? {
          id: options.activeTask.id,
          kind: options.activeTask.kind,
          title: options.activeTask.title,
          status: options.activeTask.status
        }
      : null,
    cachedConversationSummary: options?.conversationSummary || null
  });
  const provider = modelProviders[model];
  const messages = buildRuntimeChatMessagesFromContextPack(contextPack) as AgentChatMessage[];
  const content = await callChatModel({
    stage: "runtime_chat_answer",
    provider,
    model,
    messages,
    maxTokens: 1400,
    stream: options?.stream === true,
    onToken: options?.onToken,
    signal,
    timeoutMs
  });

  return {
    content,
    modelUsed: model,
    providerUsed: provider,
    routeReason: `runtime_v2:answer_chat:${contextPack.tokenBudgetHint.mode}`,
    fallbackUsed: false,
    extractedDocuments: [],
    generatedFiles: [],
    pendingTask: null,
    defaultsApplied: [`context_pack:${contextPack.tokenBudgetHint.mode}`]
  };
}

async function saveAssistantErrorMessage({
  conversationId,
  conversationModel,
  errorInfo,
  agentRuntimePlan,
  mode,
  tools
}: {
  conversationId: string;
  conversationModel: string;
  errorInfo: ChatErrorInfo;
  agentRuntimePlan?: AgentRuntimePlan | null;
  mode: ChatMode;
  tools?: AgentToolSelection;
}) {
  return prisma.chatMessage.create({
    data: {
      conversationId,
      role: "assistant",
      content: errorInfo.message,
      model: conversationModel,
      metadata: JSON.stringify({
        mode,
        tools: tools || null,
        error: true,
        errorCode: errorInfo.code,
        errorKind: errorInfo.kind,
        agentRuntimeV2: agentRuntimePlan || null,
        conversationSummaryCache:
          agentRuntimePlan?.trace.contextPack.recentSummary || agentRuntimePlan?.trace.memory.conversationSummary || null,
        providerRequest: errorInfo.providerRequest || null
      })
    }
  });
}

async function savePartialAssistantMessage({
  accumulatedText,
  agentRuntimePlan,
  conversationId,
  conversationModel,
  errorCode,
  mode,
  requestId,
  runtimeStage,
  tools,
  userMessage
}: {
  accumulatedText: string;
  agentRuntimePlan?: AgentRuntimePlan | null;
  conversationId: string;
  conversationModel: string;
  errorCode?: string;
  mode: ChatMode;
  requestId: string;
  runtimeStage: string;
  tools?: AgentToolSelection;
  userMessage: string;
}) {
  const fallbackContent = "回复中断，已保留已生成内容，可以重试。";
  const content = accumulatedText.trim() || fallbackContent;
  return prisma.chatMessage.create({
    data: {
      conversationId,
      role: "assistant",
      content,
      model: conversationModel,
      metadata: JSON.stringify({
        mode,
        tools: tools || null,
        streamStatus: "interrupted",
        partial: true,
        requestId,
        runtimeStage,
        accumulatedText: content,
        errorCode: errorCode || "STREAM_INTERRUPTED",
        fallback: !accumulatedText.trim(),
        agentRuntimeV2: agentRuntimePlan || null,
        conversationSummaryCache:
          agentRuntimePlan?.trace.contextPack.recentSummary ||
          agentRuntimePlan?.trace.memory.conversationSummary ||
          createConversationSummaryCache([{ role: "user", content: userMessage }, { role: "assistant", content }])
      })
    }
  });
}

async function streamChatResponse({
  parsed,
  request,
  userId
}: {
  parsed: ParsedRequest;
  request: NextRequest;
  userId: string;
}) {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = createSseEncoder(controller);
      const requestId = parsed.requestId || randomUUID();
      let runtimeStage = "planning_intent";
      let serverSideFullText = "";
      let finalSent = false;
      let streamWriteFailed = false;
      let debugAbortAfterChars = 0;
      const sendEvent = (event: string, data: Record<string, unknown>) => {
        try {
          send(event, { requestId, ...data });
        } catch {
          streamWriteFailed = true;
        }
      };
      const writer: ChatStreamWriter = {
        runtimeStatus: (stage, message) => {
          runtimeStage = stage;
          sendEvent("runtime_status", { stage, message });
        },
        token: (text) => {
          if (!text) return;
          serverSideFullText += text;
          sendEvent("token", { text });
          if (streamWriteFailed) throw new Error("client_abort");
          if (debugAbortAfterChars > 0 && serverSideFullText.length >= debugAbortAfterChars) {
            throw new Error("DEBUG_STREAM_ABORT");
          }
        },
        toolStatus: (message) => {
          runtimeStage = "calling_tool";
          sendEvent("tool_status", { message });
        },
        final: (data) => {
          finalSent = true;
          sendEvent("final", data);
        },
        error: (message) => sendEvent("error", { message })
      };
      const abortController = new AbortController();
      request.signal.addEventListener("abort", () => abortController.abort(new Error("client_abort")), { once: true });
      const timeoutMs = getChatTimeoutMs(parsed);
      const timer = setTimeout(() => abortController.abort(new Error(`server_timeout:${timeoutMs}`)), timeoutMs);
      let conversation: { id: string; title: string; createdAt: Date } | null = null;
      let savedUserMessage: { id: string; content: string; createdAt: Date } | null = null;
      let agentRuntimePlan: AgentRuntimePlan | null = null;
      let activeTask: AgentActiveTask | null = null;
      let assistantMessageSaved = false;
      let userAttachmentsSaved = false;
      const conversationModel = parsed.mode === "agent" ? "Nexus AI" : parsed.model;
      const debugAgent = isAgentDebugRequest(request);
      debugAbortAfterChars = debugAgent ? Number(request.nextUrl.searchParams.get("debugStreamAbortAfterChars") || 0) : 0;

      try {
        writer.runtimeStatus("planning_intent", "正在理解你的需求");
        const userMessage = [...parsed.messages].reverse().find((message) => message.role === "user");
        const userText = userMessage?.content || parsed.messages[parsed.messages.length - 1]?.content || "";
        conversation = await getOrCreateConversation({
          conversationId: parsed.conversationId,
          userId,
          model: conversationModel,
          firstMessage: userText
        });
        const earlyTitle = conversation.title === "新对话" ? makeTitle(userText) : conversation.title;
        savedUserMessage = await prisma.chatMessage.create({
          data: {
            conversationId: conversation.id,
            role: "user",
            content: userText,
            model: conversationModel,
            metadata: JSON.stringify({ mode: parsed.mode, pendingAssistant: true, requestId, stream: true })
          }
        });
        await prisma.chatConversation.update({
          where: { id: conversation.id },
          data: { title: earlyTitle, model: conversationModel, updatedAt: new Date() }
        });

        const pendingAgentTask = parsed.mode === "agent" ? await getPendingAgentTask(conversation.id, userId) : null;
        activeTask = parsed.mode === "agent" ? await getActiveConversationTask(conversation.id, userId) : null;
        const conversationSummaryCache = await getConversationSummaryCache(conversation.id, userId);
        agentRuntimePlan =
          parsed.mode === "agent"
            ? planAgentRuntimeTurn({
                messages: parsed.messages as AgentChatMessage[],
                files: parsed.files.map((file) => ({ name: file.name, type: file.type, size: file.size })),
                pendingTask: pendingAgentTask,
                activeTask,
                cachedConversationSummary: conversationSummaryCache,
                tools: parsed.tools
              })
            : null;
        streamPlanStages(writer, agentRuntimePlan);
        const runtimePublicStatus = buildRuntimePublicStatus(agentRuntimePlan);
        const nextConversationSummaryCache = (assistantContent: string) =>
          createConversationSummaryCache(
            [...(parsed.messages as AgentChatMessage[]), { role: "assistant", content: assistantContent }],
            conversationSummaryCache
          );
        const runtimeAction = parsed.mode === "agent" ? agentRuntimePlan?.decision.nextAction || "answer_chat" : "run_legacy_tool";

        const saveAttachmentsForResult = async (result: AgentRunResult) => {
          const savedUserAttachments = await saveUserAttachments({
            files: parsed.files,
            userId,
            conversationId: conversation!.id,
            messageId: savedUserMessage!.id,
            extractedFiles: result.extractedDocuments.map((file) => ({
              fileName: file.fileName,
              fileId: file.fileId,
              content: file.extractedMarkdown || file.content
            }))
          });
          userAttachmentsSaved = true;
          const userAttachments = await Promise.all(savedUserAttachments.map(toClientAttachment));
          return { savedUserAttachments, userAttachments };
        };

        if (parsed.mode === "agent" && runtimeAction === "ask_clarification") {
          const content =
            agentRuntimePlan?.decision.clarificationQuestion || "我先确认一下：你希望我现在直接执行，还是先给你方案和建议？";
          writer.runtimeStatus("completed", "已完成");
          writer.token(content);
          const finalContent = serverSideFullText || content;
          const savedAssistantMessage = await prisma.chatMessage.create({
            data: {
              conversationId: conversation.id,
              role: "assistant",
              content: finalContent,
              model: conversationModel,
              metadata: JSON.stringify({
                mode: parsed.mode,
                tools: parsed.tools || null,
                requestId,
                streamStatus: "completed",
                routeReason: "runtime_v2:clarification",
                agentRuntimeV2: agentRuntimePlan,
                runtimePublicStatus,
                conversationSummaryCache: nextConversationSummaryCache(finalContent),
                ...(debugAgent ? { agentRuntimeDebug: compactRuntimeDebugTrace(agentRuntimePlan, activeTask) } : {})
              })
            }
          });
          assistantMessageSaved = true;
          const { userAttachments } = await saveAttachmentsForResult(createClarificationResult({ agentRuntimePlan, content: finalContent, routeReason: "runtime_v2:clarification" }));
          writer.final({
            messageId: savedAssistantMessage.id,
            conversationId: conversation.id,
            content: finalContent,
            conversation: {
              userId,
              conversationId: conversation.id,
              type: "chat",
              title: earlyTitle,
              summary: finalContent,
              status: "活跃",
              model: conversationModel,
              createdAt: conversation.createdAt.toISOString(),
              updatedAt: new Date().toISOString()
            },
            userMessage: {
              id: savedUserMessage.id,
              role: "user",
              content: savedUserMessage.content,
              createdAt: formatTime(savedUserMessage.createdAt),
              attachments: userAttachments
            },
            assistantMessage: toStreamAssistantMessage(savedAssistantMessage, { requestId, streamStatus: "completed" }),
            ...(debugAgent ? { agentRuntimeTrace: compactRuntimeDebugTrace(agentRuntimePlan, activeTask) } : {})
          });
          return;
        }

        if (parsed.mode === "agent" && runtimeAction === "answer_chat") {
          writer.runtimeStatus("calling_model", "正在生成回复");
          let streamedText = "";
          const result = await runRuntimeChatAnswer(parsed, abortController.signal, timeoutMs, {
            conversationSummary: conversationSummaryCache,
            activeTask,
            stream: true,
            onToken: (token) => {
              streamedText += token;
              writer.token(token);
            }
          });
          if (!streamedText.trim()) writer.token(result.content);
          const finalContent = serverSideFullText || result.content;
          const savedAssistantMessage = await prisma.chatMessage.create({
            data: {
              conversationId: conversation.id,
              role: "assistant",
              content: finalContent,
              model: conversationModel,
              metadata: JSON.stringify({
                mode: parsed.mode,
                tools: parsed.tools || null,
                requestId,
                streamStatus: "completed",
                routeReason: result.routeReason,
                fallbackUsed: result.fallbackUsed,
                agentRuntimeV2: agentRuntimePlan,
                runtimePublicStatus,
                conversationSummaryCache: nextConversationSummaryCache(finalContent),
                ...(debugAgent ? { agentRuntimeDebug: compactRuntimeDebugTrace(agentRuntimePlan, activeTask) } : {})
              })
            }
          });
          assistantMessageSaved = true;
          const { userAttachments } = await saveAttachmentsForResult(result);
          await prisma.chatConversation.update({
            where: { id: conversation.id },
            data: { title: earlyTitle, model: conversationModel, updatedAt: new Date() }
          });
          writer.runtimeStatus("completed", "已完成");
          writer.final({
            messageId: savedAssistantMessage.id,
            conversationId: conversation.id,
            content: finalContent,
            conversation: {
              userId,
              conversationId: conversation.id,
              type: "chat",
              title: earlyTitle,
              summary: finalContent,
              status: "活跃",
              model: conversationModel,
              createdAt: conversation.createdAt.toISOString(),
              updatedAt: new Date().toISOString()
            },
            userMessage: {
              id: savedUserMessage.id,
              role: "user",
              content: savedUserMessage.content,
              createdAt: formatTime(savedUserMessage.createdAt),
              attachments: userAttachments
            },
            assistantMessage: toStreamAssistantMessage(savedAssistantMessage, { requestId, streamStatus: "completed" }),
            ...(debugAgent ? { agentRuntimeTrace: compactRuntimeDebugTrace(agentRuntimePlan, activeTask) } : {})
          });
          return;
        }

        writer.toolStatus("正在创建任务");
        const asyncTaskPlan =
          parsed.mode === "agent" && agentRuntimePlan?.decision.nextAction === "run_legacy_tool"
            ? getAsyncAgentTaskPlan({
                text: userText,
                files: parsed.files,
                pendingTask: pendingAgentTask,
                tools: parsed.tools
              })
            : null;
        if (asyncTaskPlan) {
          const finalContent = asyncTaskPlan.pendingContent;
          const taskCard = buildAsyncTaskCard({
            kind: asyncTaskPlan.kind,
            label: asyncTaskPlan.label,
            taskId: "",
            fileName: asyncTaskPlan.pendingFileName,
            requiresGeneratedFile: asyncTaskPlan.requiresGeneratedFile,
            status: "queued"
          });
          const savedAssistantMessage = await prisma.chatMessage.create({
            data: {
              conversationId: conversation.id,
              role: "assistant",
              content: finalContent,
              model: conversationModel,
              metadata: JSON.stringify({
                mode: parsed.mode,
                tools: parsed.tools || null,
                requestId,
                streamStatus: "completed",
                agentRuntimeV2: agentRuntimePlan,
                runtimePublicStatus,
                conversationSummaryCache: nextConversationSummaryCache(finalContent),
                taskCard,
                asyncTask: {
                  id: "",
                  status: "queued",
                  kind: asyncTaskPlan.kind,
                  label: asyncTaskPlan.label,
                  fileName: asyncTaskPlan.pendingFileName,
                  requiresGeneratedFile: asyncTaskPlan.requiresGeneratedFile,
                  updatedAt: new Date().toISOString()
                }
              })
            }
          });
          assistantMessageSaved = true;
          const savedTaskCard = { ...taskCard, taskId: savedAssistantMessage.id, openUrl: `/api/ai/chat/tasks/${encodeURIComponent(savedAssistantMessage.id)}` };
          await prisma.chatMessage.update({
            where: { id: savedAssistantMessage.id },
            data: {
              metadata: JSON.stringify({
                mode: parsed.mode,
                tools: parsed.tools || null,
                requestId,
                streamStatus: "completed",
                agentRuntimeV2: agentRuntimePlan,
                runtimePublicStatus,
                conversationSummaryCache: nextConversationSummaryCache(finalContent),
                taskCard: savedTaskCard,
                asyncTask: {
                  id: savedAssistantMessage.id,
                  status: "queued",
                  kind: asyncTaskPlan.kind,
                  label: asyncTaskPlan.label,
                  fileName: asyncTaskPlan.pendingFileName,
                  requiresGeneratedFile: asyncTaskPlan.requiresGeneratedFile,
                  updatedAt: new Date().toISOString()
                }
              })
            }
          });
          const savedUserAttachments = await saveUserAttachments({
            files: parsed.files,
            userId,
            conversationId: conversation.id,
            messageId: savedUserMessage.id,
            extractedFiles: []
          });
          userAttachmentsSaved = true;
          const userAttachments = await Promise.all(savedUserAttachments.map(toClientAttachment));
          enqueueAgentChatTask({
            assistantMessageId: savedAssistantMessage.id,
            conversationId: conversation.id,
            files: parsed.files,
            kind: asyncTaskPlan.kind,
            label: asyncTaskPlan.label,
            messages: parsed.messages as AgentChatMessage[],
            pendingFileName: asyncTaskPlan.pendingFileName,
            requiresGeneratedFile: asyncTaskPlan.requiresGeneratedFile,
            tools: parsed.tools,
            userId
          });
          writer.token(finalContent);
          const streamedFinalContent = serverSideFullText || finalContent;
          writer.runtimeStatus("completed", "已完成");
          writer.final({
            messageId: savedAssistantMessage.id,
            conversationId: conversation.id,
            taskId: savedAssistantMessage.id,
            content: streamedFinalContent,
            conversation: {
              userId,
              conversationId: conversation.id,
              type: "chat",
              title: earlyTitle,
              summary: streamedFinalContent,
              status: "活跃",
              model: conversationModel,
              createdAt: conversation.createdAt.toISOString(),
              updatedAt: new Date().toISOString()
            },
            userMessage: {
              id: savedUserMessage.id,
              role: "user",
              content: savedUserMessage.content,
              createdAt: formatTime(savedUserMessage.createdAt),
              attachments: userAttachments
            },
            assistantMessage: toStreamAssistantMessage(savedAssistantMessage, {
              requestId,
              streamStatus: "completed",
              taskCard: savedTaskCard,
              pendingFileGeneration:
                asyncTaskPlan.requiresGeneratedFile && (asyncTaskPlan.kind === "ppt" || asyncTaskPlan.kind === "word")
                  ? {
                      taskId: savedAssistantMessage.id,
                      kind: asyncTaskPlan.kind,
                      fileName: asyncTaskPlan.pendingFileName || getPendingFileName(asyncTaskPlan.kind),
                      status: "generating"
                    }
                  : null,
              pendingAgentTask: !asyncTaskPlan.requiresGeneratedFile
                ? {
                    taskId: savedAssistantMessage.id,
                    label: asyncTaskPlan.label,
                    status: "generating"
                  }
                : null
            }),
            ...(debugAgent ? { agentRuntimeTrace: compactRuntimeDebugTrace(agentRuntimePlan, activeTask) } : {})
          });
          return;
        }

        const runLegacyAgent = () =>
          runAgent({
            userId,
            messages: parsed.messages as AgentChatMessage[],
            files: parsed.files,
            preferences: null,
            pendingTask: pendingAgentTask,
            tools: parsed.tools,
            signal: abortController.signal
          });
        const runImageGeneration = () =>
          runChatImageGeneration({
            request,
            userText,
            files: parsed.files,
            signal: abortController.signal
          });
        const adapterRun =
          parsed.mode === "agent" && runtimeAction === "run_legacy_tool" && agentRuntimePlan
            ? await executeRuntimeTool(agentRuntimePlan.decision, {
                request,
                origin: request.nextUrl.origin,
                userId,
                conversationId: conversation.id,
                userText,
                messages: parsed.messages as AgentChatMessage[],
                files: parsed.files,
                tools: parsed.tools,
                signal: abortController.signal,
                timeoutMs,
                activeTask,
                runLegacyAgent,
                runImageGeneration,
                runChatAnswer: () =>
                  runRuntimeChatAnswer(parsed, abortController.signal, timeoutMs, {
                    conversationSummary: conversationSummaryCache,
                    activeTask
                  })
              })
            : null;
        const adapterId = adapterRun && "adapterId" in adapterRun ? adapterRun.adapterId : null;
        const result = adapterRun ? adapterRun.result : parsed.mode === "agent" ? await runLegacyAgent() : await runManualChat(parsed, abortController.signal, timeoutMs);
        const imageGeneration = adapterRun && "imageGeneration" in adapterRun ? adapterRun.imageGeneration || null : null;
        const adapterResultCard = adapterRun && "resultCard" in adapterRun ? adapterRun.resultCard || null : null;
        const baseTaskCard = buildAdapterTaskCard({
          targetTool: agentRuntimePlan?.decision.targetTool,
          resultCard: adapterResultCard,
          imageGeneration
        });
        writer.token(result.content);
        const finalContent = serverSideFullText || result.content;
        const { userAttachments, savedUserAttachments } = await saveAttachmentsForResult(result);
        const savedAssistantMessage = await prisma.chatMessage.create({
          data: {
            conversationId: conversation.id,
            role: "assistant",
            content: finalContent,
            model: conversationModel,
            metadata: JSON.stringify({
              mode: parsed.mode,
              tools: parsed.tools || null,
              requestId,
              streamStatus: "completed",
              routeReason: result.routeReason,
              fallbackUsed: result.fallbackUsed,
              generatedFileCount: result.generatedFiles.length,
              agentTask: result.agentTask || null,
              pendingTask: result.pendingTask || null,
              defaultsApplied: result.defaultsApplied || [],
              agentRuntimeV2: agentRuntimePlan,
              runtimePublicStatus,
              conversationSummaryCache: nextConversationSummaryCache(finalContent),
              taskCard: baseTaskCard,
              ...(debugAgent ? { agentRuntimeDebug: compactRuntimeDebugTrace(agentRuntimePlan, activeTask, adapterId) } : {}),
              webContext: compactWebContext(result.webContext),
              imageGeneration
            })
          }
        });
        assistantMessageSaved = true;
        const generatedAttachments = await saveGeneratedFiles({
          files: result.generatedFiles,
          userId,
          conversationId: conversation.id,
          messageId: savedAssistantMessage.id
        });
        const assistantAttachments = await Promise.all(generatedAttachments.map(toClientAttachment));
        const taskCard = buildAdapterTaskCard({
          targetTool: agentRuntimePlan?.decision.targetTool,
          resultCard: adapterResultCard,
          generatedAttachment: assistantAttachments[0] || null,
          imageGeneration
        }) || baseTaskCard;
        if (taskCard && JSON.stringify(taskCard) !== JSON.stringify(baseTaskCard)) {
          const existingMetadata = parseJsonObject(savedAssistantMessage.metadata || null) || {};
          await prisma.chatMessage.update({
            where: { id: savedAssistantMessage.id },
            data: {
              metadata: JSON.stringify({ ...existingMetadata, taskCard })
            }
          });
        }
        await prisma.chatConversation.update({
          where: { id: conversation.id },
          data: { title: earlyTitle, model: conversationModel, updatedAt: new Date() }
        });
        writer.runtimeStatus("completed", "已完成");
        writer.final({
          messageId: savedAssistantMessage.id,
          conversationId: conversation.id,
          content: finalContent,
          attachments: assistantAttachments,
          conversation: {
            userId,
            conversationId: conversation.id,
            type: "chat",
            title: earlyTitle,
            summary: finalContent,
            status: "活跃",
            model: conversationModel,
            createdAt: conversation.createdAt.toISOString(),
            updatedAt: new Date().toISOString()
          },
          userMessage: {
            id: savedUserMessage.id,
            role: "user",
            content: savedUserMessage.content,
            createdAt: formatTime(savedUserMessage.createdAt),
            attachments: userAttachments
          },
          assistantMessage: toStreamAssistantMessage(savedAssistantMessage, {
            requestId,
            streamStatus: "completed",
            taskCard,
            attachments: assistantAttachments,
            imageGeneration,
            webContext: compactWebContext(result.webContext)
          }),
          ...(debugAgent ? { agentRuntimeTrace: compactRuntimeDebugTrace(agentRuntimePlan, activeTask, adapterId) } : {})
        });
      } catch (error) {
        const errorInfo = getChatErrorInfo(error, timeoutMs);
        console.error(`[ai:chat:stream:error] code=${errorInfo.code} kind=${errorInfo.kind} status=${errorInfo.status}`);
        if (!finalSent) writer.error(errorInfo.message);
        if (conversation && savedUserMessage && !assistantMessageSaved) {
          if (!userAttachmentsSaved && parsed.files.length) {
            await saveUserAttachments({
              files: parsed.files,
              userId,
              conversationId: conversation.id,
              messageId: savedUserMessage.id,
              extractedFiles: []
            });
          }
          const savedAssistantMessage = await savePartialAssistantMessage({
            conversationId: conversation.id,
            conversationModel,
            accumulatedText: serverSideFullText,
            errorCode: streamWriteFailed ? "STREAM_WRITE_FAILED" : errorInfo.code,
            agentRuntimePlan,
            mode: parsed.mode,
            requestId,
            runtimeStage,
            tools: parsed.tools,
            userMessage: savedUserMessage.content
          });
          assistantMessageSaved = true;
          writer.final({
            messageId: savedAssistantMessage.id,
            conversationId: conversation.id,
            content: savedAssistantMessage.content,
            assistantMessage: {
              ...toStreamAssistantMessage(savedAssistantMessage, {
                requestId,
                streamStatus: "interrupted",
                streamError: "回复中断，已保留已生成内容，可以重试。"
              }),
              fallback: true
            }
          });
        }
      } finally {
        clearTimeout(timer);
        try {
          controller.close();
        } catch {
          streamWriteFailed = true;
        }
      }
    }
  });
  return streamResponse(stream);
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  let parsed: ParsedRequest;
  try {
    parsed = await parseRequest(request);
  } catch {
    return jsonError("INVALID_REQUEST", "请求格式不正确。", 400);
  }
  const streamEnabled = parsed.stream === true || wantsStream(request);

  if (!parsed.messages.length) return jsonError("INVALID_MESSAGES", "消息内容不能为空。", 400);
  const invalidModel = parsed.mode === "manual" && !modelProviders[parsed.model];
  if (invalidModel) return jsonError("INVALID_MODEL", "当前模型不可用。", 400);

  const fileError = validateFiles(parsed.files, parsed.mode, parsed.model);
  if (fileError) return fileError;

  if (streamEnabled) return streamChatResponse({ parsed, request, userId: user!.id });

  const controller = new AbortController();
  const timeoutMs = getChatTimeoutMs(parsed);
  const requestStartedAt = Date.now();
  const timer = setTimeout(() => controller.abort(new Error(`server_timeout:${timeoutMs}`)), timeoutMs);
  let conversation: { id: string; title: string; createdAt: Date } | null = null;
  let conversationModel = parsed.mode === "agent" ? "Nexus AI" : parsed.model;
  let earlyTitle = "";
  let savedUserMessage: { id: string; content: string; createdAt: Date } | null = null;
  let userAttachmentsSaved = false;
  let userText = "";
  let assistantMessageSaved = false;
  let agentRuntimePlan: AgentRuntimePlan | null = null;
  let activeTask: AgentActiveTask | null = null;
  let conversationSummaryCache: string | null = null;
  const debugAgent = isAgentDebugRequest(request);

  try {
    const userMessage = [...parsed.messages].reverse().find((message) => message.role === "user");
    userText = userMessage?.content || parsed.messages[parsed.messages.length - 1]?.content || "";
    conversationModel = parsed.mode === "agent" ? "Nexus AI" : parsed.model;
    conversation = await getOrCreateConversation({
      conversationId: parsed.conversationId,
      userId: user!.id,
      model: conversationModel,
      firstMessage: userText
    });
    earlyTitle = conversation.title === "新对话" ? makeTitle(userText) : conversation.title;
    savedUserMessage = await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: userText,
        model: conversationModel,
        metadata: JSON.stringify({ mode: parsed.mode, pendingAssistant: true })
      }
    });
    await prisma.chatConversation.update({
      where: { id: conversation.id },
      data: { title: earlyTitle, model: conversationModel, updatedAt: new Date() }
    });

    const pendingAgentTask =
      parsed.mode === "agent" ? await getPendingAgentTask(conversation.id, user!.id) : null;
    activeTask = parsed.mode === "agent" ? await getActiveConversationTask(conversation.id, user!.id) : null;
    conversationSummaryCache = await getConversationSummaryCache(conversation.id, user!.id);
    agentRuntimePlan =
      parsed.mode === "agent"
        ? planAgentRuntimeTurn({
            messages: parsed.messages as AgentChatMessage[],
            files: parsed.files.map((file) => ({ name: file.name, type: file.type, size: file.size })),
            pendingTask: pendingAgentTask,
            activeTask,
            cachedConversationSummary: conversationSummaryCache,
            tools: parsed.tools
          })
        : null;
    if (agentRuntimePlan) {
      console.info(
        `[agent:runtime:v2] stages=${agentRuntimePlan.decision.progressStages.join(">")} nextAction=${agentRuntimePlan.decision.nextAction} intent=${agentRuntimePlan.decision.intent} targetTool=${agentRuntimePlan.decision.targetTool} confidence=${agentRuntimePlan.decision.confidence}`
      );
    }
    const runtimePublicStatus = buildRuntimePublicStatus(agentRuntimePlan);
    const nextConversationSummaryCache = (assistantContent: string) =>
      createConversationSummaryCache(
        [...(parsed.messages as AgentChatMessage[]), { role: "assistant", content: assistantContent }],
        conversationSummaryCache
      );
    const asyncTaskPlan =
      parsed.mode === "agent" && agentRuntimePlan?.decision.nextAction === "run_legacy_tool"
        ? getAsyncAgentTaskPlan({
            text: userText,
            files: parsed.files,
            pendingTask: pendingAgentTask,
            tools: parsed.tools
          })
        : null;

    if (asyncTaskPlan) {
      const taskCard = buildAsyncTaskCard({
        kind: asyncTaskPlan.kind,
        label: asyncTaskPlan.label,
        taskId: "",
        fileName: asyncTaskPlan.pendingFileName,
        requiresGeneratedFile: asyncTaskPlan.requiresGeneratedFile,
        status: "queued"
      });
      const savedAssistantMessage = await prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: asyncTaskPlan.pendingContent,
          model: conversationModel,
          metadata: JSON.stringify({
            mode: parsed.mode,
            tools: parsed.tools || null,
            agentRuntimeV2: agentRuntimePlan,
            runtimePublicStatus,
            conversationSummaryCache: nextConversationSummaryCache(asyncTaskPlan.pendingContent),
            taskCard,
            asyncTask: {
              id: "",
              status: "queued",
              kind: asyncTaskPlan.kind,
              label: asyncTaskPlan.label,
              fileName: asyncTaskPlan.pendingFileName,
              requiresGeneratedFile: asyncTaskPlan.requiresGeneratedFile,
              updatedAt: new Date().toISOString()
            }
          })
        }
      });
      assistantMessageSaved = true;
      const savedTaskCard = { ...taskCard, taskId: savedAssistantMessage.id, openUrl: `/api/ai/chat/tasks/${encodeURIComponent(savedAssistantMessage.id)}` };
      await prisma.chatMessage.update({
        where: { id: savedAssistantMessage.id },
        data: {
          metadata: JSON.stringify({
            mode: parsed.mode,
            tools: parsed.tools || null,
            agentRuntimeV2: agentRuntimePlan,
            runtimePublicStatus,
            conversationSummaryCache: nextConversationSummaryCache(asyncTaskPlan.pendingContent),
            taskCard: savedTaskCard,
            asyncTask: {
              id: savedAssistantMessage.id,
              status: "queued",
              kind: asyncTaskPlan.kind,
              label: asyncTaskPlan.label,
              fileName: asyncTaskPlan.pendingFileName,
              requiresGeneratedFile: asyncTaskPlan.requiresGeneratedFile,
              updatedAt: new Date().toISOString()
            }
          })
        }
      });
      const savedUserAttachments = await saveUserAttachments({
        files: parsed.files,
        userId: user!.id,
        conversationId: conversation.id,
        messageId: savedUserMessage.id,
        extractedFiles: []
      });
      userAttachmentsSaved = true;
      const userAttachments = await Promise.all(savedUserAttachments.map(toClientAttachment));
      enqueueAgentChatTask({
        assistantMessageId: savedAssistantMessage.id,
        conversationId: conversation.id,
        files: parsed.files,
        kind: asyncTaskPlan.kind,
        label: asyncTaskPlan.label,
        messages: parsed.messages as AgentChatMessage[],
        pendingFileName: asyncTaskPlan.pendingFileName,
        requiresGeneratedFile: asyncTaskPlan.requiresGeneratedFile,
        tools: parsed.tools,
        userId: user!.id
      });

      return NextResponse.json({
        content: asyncTaskPlan.pendingContent,
        model: conversationModel,
        provider: "agent",
        runtimeStatus: runtimePublicStatus,
        ...(debugAgent ? { agentRuntimeTrace: compactRuntimeDebugTrace(agentRuntimePlan, activeTask) } : {}),
        conversationId: conversation.id,
        conversation: {
          userId: user!.id,
          conversationId: conversation.id,
          type: "chat",
          title: earlyTitle,
          summary: asyncTaskPlan.pendingContent,
          status: "活跃",
          model: conversationModel,
          createdAt: conversation.createdAt.toISOString(),
          updatedAt: new Date().toISOString()
        },
        userMessage: {
          id: savedUserMessage.id,
          role: "user",
          content: savedUserMessage.content,
          createdAt: formatTime(savedUserMessage.createdAt),
          attachments: userAttachments
        },
        assistantMessage: {
          id: savedAssistantMessage.id,
          role: "assistant",
          content: asyncTaskPlan.pendingContent,
          createdAt: formatTime(savedAssistantMessage.createdAt),
          attachments: [],
          taskCard: savedTaskCard,
          pendingFileGeneration:
            asyncTaskPlan.requiresGeneratedFile && (asyncTaskPlan.kind === "ppt" || asyncTaskPlan.kind === "word")
              ? {
                  taskId: savedAssistantMessage.id,
                  kind: asyncTaskPlan.kind,
                  fileName: asyncTaskPlan.pendingFileName || getPendingFileName(asyncTaskPlan.kind),
                  status: "generating"
                }
              : null,
          pendingAgentTask: !asyncTaskPlan.requiresGeneratedFile
            ? {
                taskId: savedAssistantMessage.id,
                label: asyncTaskPlan.label,
                status: "generating"
              }
            : null,
          imageGeneration: null,
          webContext: null
        }
      });
    }

    const runtimeAction = parsed.mode === "agent" ? agentRuntimePlan?.decision.nextAction || "answer_chat" : "run_legacy_tool";
    const runLegacyAgent = () =>
      runAgent({
        userId: user!.id,
        messages: parsed.messages as AgentChatMessage[],
        files: parsed.files,
        preferences: null,
        pendingTask: pendingAgentTask,
        tools: parsed.tools,
        signal: controller.signal
      });
    const runImageGeneration = () =>
      runChatImageGeneration({
        request,
        userText,
        files: parsed.files,
        signal: controller.signal
      });
    const adapterRun =
      parsed.mode === "agent" && runtimeAction === "run_legacy_tool" && agentRuntimePlan
        ? await executeRuntimeTool(agentRuntimePlan.decision, {
            request,
            origin: request.nextUrl.origin,
            userId: user!.id,
            conversationId: conversation.id,
            userText,
            messages: parsed.messages as AgentChatMessage[],
            files: parsed.files,
            tools: parsed.tools,
            signal: controller.signal,
            timeoutMs,
            activeTask,
            runLegacyAgent,
            runImageGeneration,
            runChatAnswer: () => runRuntimeChatAnswer(parsed, controller.signal, timeoutMs, { conversationSummary: conversationSummaryCache, activeTask })
          })
        : null;
    const adapterId = adapterRun && "adapterId" in adapterRun ? adapterRun.adapterId : null;
    const result = adapterRun
      ? adapterRun.result
      : parsed.mode === "agent" && runtimeAction === "ask_clarification"
        ? createClarificationResult({
            agentRuntimePlan,
            content: agentRuntimePlan?.decision.clarificationQuestion || "我先确认一下：你希望我现在直接执行，还是先给你方案和建议？",
            routeReason: "runtime_v2:clarification"
          })
      : parsed.mode === "agent" && runtimeAction === "answer_chat"
        ? await runRuntimeChatAnswer(parsed, controller.signal, timeoutMs, { conversationSummary: conversationSummaryCache, activeTask })
      : parsed.mode === "agent"
        ? await runLegacyAgent()
        : await runManualChat(parsed, controller.signal, timeoutMs);
    const imageGeneration = adapterRun && "imageGeneration" in adapterRun ? adapterRun.imageGeneration || null : null;
    const adapterResultCard = adapterRun && "resultCard" in adapterRun ? adapterRun.resultCard || null : null;
    const baseTaskCard = buildAdapterTaskCard({
      targetTool: agentRuntimePlan?.decision.targetTool,
      resultCard: adapterResultCard,
      imageGeneration
    });

    const savedUserAttachments = await saveUserAttachments({
      files: parsed.files,
      userId: user!.id,
      conversationId: conversation.id,
      messageId: savedUserMessage.id,
      extractedFiles: result.extractedDocuments.map((file) => ({
        fileName: file.fileName,
        fileId: file.fileId,
        content: file.extractedMarkdown || file.content
      }))
    });
    userAttachmentsSaved = true;

    const savedAssistantMessage = await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: result.content,
        model: conversationModel,
        metadata: JSON.stringify({
          mode: parsed.mode,
          tools: parsed.tools || null,
          modelUsed: result.modelUsed,
          providerUsed: result.providerUsed,
          routeReason: result.routeReason,
          fallbackUsed: result.fallbackUsed,
          generatedFileCount: result.generatedFiles.length,
          agentTask: result.agentTask || null,
          pendingTask: result.pendingTask || null,
          defaultsApplied: result.defaultsApplied || [],
          agentRuntimeV2: agentRuntimePlan,
          runtimePublicStatus,
          conversationSummaryCache: nextConversationSummaryCache(result.content),
          taskCard: baseTaskCard,
          ...(debugAgent ? { agentRuntimeDebug: compactRuntimeDebugTrace(agentRuntimePlan, activeTask, adapterId) } : {}),
          webContext: compactWebContext(result.webContext),
          imageGeneration
        })
      }
    });
    assistantMessageSaved = true;

    const generatedAttachments = await saveGeneratedFiles({
      files: result.generatedFiles,
      userId: user!.id,
      conversationId: conversation.id,
      messageId: savedAssistantMessage.id
    });
    const title = earlyTitle;
    await prisma.chatConversation.update({
      where: { id: conversation.id },
      data: { title, model: conversationModel, updatedAt: new Date() }
    });

    const [userAttachments, assistantAttachments] = await Promise.all([
      Promise.all(savedUserAttachments.map(toClientAttachment)),
      Promise.all(generatedAttachments.map(toClientAttachment))
    ]);
    const taskCard = buildAdapterTaskCard({
      targetTool: agentRuntimePlan?.decision.targetTool,
      resultCard: adapterResultCard,
      generatedAttachment: assistantAttachments[0] || null,
      imageGeneration
    }) || baseTaskCard;
    if (taskCard && JSON.stringify(taskCard) !== JSON.stringify(baseTaskCard)) {
      const existingMetadata = parseJsonObject(savedAssistantMessage.metadata || null) || {};
      await prisma.chatMessage.update({
        where: { id: savedAssistantMessage.id },
        data: {
          metadata: JSON.stringify({ ...existingMetadata, taskCard })
        }
      });
    }

    return NextResponse.json({
      content: result.content,
      model: conversationModel,
      provider: parsed.mode === "agent" ? "agent" : result.providerUsed,
      runtimeStatus: runtimePublicStatus,
      ...(debugAgent ? { agentRuntimeTrace: compactRuntimeDebugTrace(agentRuntimePlan, activeTask, adapterId) } : {}),
      conversationId: conversation.id,
      conversation: {
        userId: user!.id,
        conversationId: conversation.id,
        type: "chat",
        title,
        summary: result.content,
        status: "活跃",
        model: conversationModel,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: new Date().toISOString()
      },
      userMessage: {
        id: savedUserMessage.id,
        role: "user",
        content: savedUserMessage.content,
        createdAt: formatTime(savedUserMessage.createdAt),
        attachments: userAttachments
      },
      assistantMessage: {
        id: savedAssistantMessage.id,
        role: "assistant",
        content: result.content,
        createdAt: formatTime(savedAssistantMessage.createdAt),
        attachments: assistantAttachments,
        taskCard,
        imageGeneration,
        webContext: compactWebContext(result.webContext)
      }
    });
  } catch (error) {
    if (error instanceof ChatRouteError) {
      return jsonError(error.code, error.message, error.status);
    }
    if (error instanceof Error && error.message === "INVALID_MODEL") {
      return jsonError("INVALID_MODEL", "当前模型不可用。", 400);
    }
    const errorInfo = getChatErrorInfo(error, timeoutMs);
    const elapsedMs = Date.now() - requestStartedAt;
    console.error(
      `[ai:chat:error] code=${errorInfo.code} kind=${errorInfo.kind} status=${errorInfo.status} elapsedMs=${elapsedMs} timeoutMs=${timeoutMs} provider=${errorInfo.providerRequest?.provider || "-"} model=${errorInfo.providerRequest?.model || conversationModel} requestId=${errorInfo.providerRequest?.requestId || "-"}`
    );

    if (conversation && savedUserMessage && !assistantMessageSaved) {
      try {
        if (!userAttachmentsSaved && parsed.files.length) {
          await saveUserAttachments({
            files: parsed.files,
            userId: user!.id,
            conversationId: conversation.id,
            messageId: savedUserMessage.id,
            extractedFiles: []
          });
          userAttachmentsSaved = true;
        }

        const savedAssistantMessage = await saveAssistantErrorMessage({
          conversationId: conversation.id,
          conversationModel,
          errorInfo,
          agentRuntimePlan,
          mode: parsed.mode,
          tools: parsed.tools
        });
        await prisma.chatConversation.update({
          where: { id: conversation.id },
          data: { title: earlyTitle || conversation.title, model: conversationModel, updatedAt: new Date() }
        });

        return NextResponse.json({
          code: errorInfo.code,
          message: errorInfo.message,
          content: errorInfo.message,
          model: conversationModel,
          provider: parsed.mode === "agent" ? "agent" : errorInfo.providerRequest?.provider || "provider",
          runtimeStatus: buildRuntimePublicStatus(agentRuntimePlan),
          ...(debugAgent ? { agentRuntimeTrace: compactRuntimeDebugTrace(agentRuntimePlan, activeTask) } : {}),
          conversationId: conversation.id,
          conversation: {
            userId: user!.id,
            conversationId: conversation.id,
            type: "chat",
            title: earlyTitle || conversation.title,
            summary: errorInfo.message,
            status: "异常",
            model: conversationModel,
            createdAt: conversation.createdAt.toISOString(),
            updatedAt: new Date().toISOString()
          },
          userMessage: {
            id: savedUserMessage.id,
            role: "user",
            content: savedUserMessage.content,
            createdAt: formatTime(savedUserMessage.createdAt),
            attachments: []
          },
          assistantMessage: {
            id: savedAssistantMessage.id,
            role: "assistant",
            content: errorInfo.message,
            createdAt: formatTime(savedAssistantMessage.createdAt),
            attachments: [],
            imageGeneration: null,
            webContext: null,
            fallback: true
          },
          error: {
            code: errorInfo.code,
            kind: errorInfo.kind,
            providerRequest: errorInfo.providerRequest || null
          }
        });
      } catch (persistError) {
        console.error(
          `[ai:chat:error] persist_failed code=${errorInfo.code} message=${persistError instanceof Error ? persistError.message : "unknown"}`
        );
      }
    }

    const safeResponse = providerErrorFromException(error, timeoutMs);
    if (safeResponse.status >= 500) console.error(`[ai:chat] safeStatus=${safeResponse.status}`);
    return safeResponse;
  } finally {
    clearTimeout(timer);
  }
}
