import { randomUUID } from "node:crypto";

import { parseDocuments } from "@/lib/document-processing/parser";
import { detectDeepWritingMode } from "@/lib/agent/runtime/deep-writing-detector";
import type { DeepWritingDetection, DeepWritingDocumentKind } from "@/lib/agent/runtime/deep-writing-detector";
import {
  createDeepWritingPanelState,
  createDeepWritingTaskMemory,
  isDeepWritingResumeRequest,
  resumeDeepWritingTaskMemory,
  type DeepWritingTaskMemory
} from "@/lib/agent/runtime/deep-writing-memory";
import { runDeepWritingDraft, type WritingContentGenerationMode } from "@/lib/agent/runtime/deep-writing-runner";
import type { GeneratedAgentFile } from "@/lib/agent/types";
import type { ConversationFileReference, ToolAdapter } from "@/lib/agent/runtime/tool-adapters/types";
import { classifyWordWriteMode, type WordWriteDocumentKind, type WordWriteModeDecision } from "@/lib/agent/runtime/word-write-mode-classifier";
import * as storage from "@/lib/storage";
import { createMockStorage } from "@/lib/storage/local";
import {
  completeWordTaskMemory,
  createWordTaskMemory,
  generateDocx,
  generateWordDocumentFromRequest,
  resumeWordRequestFromMemory,
  sanitizeWordContent,
  type WordPlan,
  type WordRequest,
  type WordTaskMemory
} from "@/lib/word-engine";
import { composeDeepWritingDocxContent, composeDeepWritingDocxRequest } from "@/lib/word-engine/compose-deep-writing-docx";
import { normalizeDocumentTitle } from "@/lib/word-engine/normalize-document-title";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const WORD_FAILED_MESSAGE = "Word 文档生成失败，请补充更明确的主题或稍后重试。";
const WORD_MISSING_SUBJECT_MESSAGE = "请补充 Word 文档的主题、文体和大致篇幅。";
const WORD_MISSING_FILE_MESSAGE = "请先上传需要整理成 Word 的文件，或补充当前对话中的材料。";
const WORD_MISSING_CONTENT_MESSAGE = "请提供要写入 Word 的正文材料、对话总结或明确主题。";
const WORD_MISSING_ACTIVE_TASK_MESSAGE = "请先在当前对话里生成一个 Word 任务，我再继续完善。";
const DEEP_WRITING_MISSING_ACTIVE_TASK_MESSAGE = "请先在当前对话里启动一个深度写作任务，我再继续。";
const MAX_WORD_TASK_MEMORY_ENTRIES = 100;
const wordTaskMemoryByConversation = new Map<string, WordTaskMemory>();
const deepWritingMemoryByConversation = new Map<string, DeepWritingTaskMemory>();

type WordSourceBundle = {
  uploadedSourceText: string;
  conversationText: string;
  recentSummary: string;
  sourceText: string;
  sourceFileNames: string[];
};

function datePath() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function isDocumentFile(file: File) {
  return /\.(txt|md|pdf|docx)$/i.test(file.name) || /text\/|pdf|wordprocessingml\.document/i.test(file.type || "");
}

function referencesCurrentFile(text: string) {
  return /这个文件|这份文件|这个文档|这份文档|上传资料|上传的资料|根据.*文件|根据.*资料/i.test(text);
}

function referencesPriorWordTask(text: string) {
  return /继续刚才的\s*Word|继续生成这个文档|把刚才的\s*Word\s*补完整|根据刚才的\s*Word\s*继续写/i.test(text);
}

function referencesPriorDeepWritingTask(text: string) {
  return isDeepWritingResumeRequest(text);
}

function currentConversationWordMemory(context: Parameters<ToolAdapter["execute"]>[1]): WordTaskMemory | null {
  const memory = context.wordTaskMemory || wordTaskMemoryByConversation.get(context.conversationId) || null;
  if (!memory || memory.conversationId !== context.conversationId) return null;
  return memory;
}

function rememberWordTaskMemory(memory: WordTaskMemory) {
  wordTaskMemoryByConversation.set(memory.conversationId, memory);
  if (wordTaskMemoryByConversation.size <= MAX_WORD_TASK_MEMORY_ENTRIES) return;
  const oldestKey = wordTaskMemoryByConversation.keys().next().value;
  if (oldestKey) wordTaskMemoryByConversation.delete(oldestKey);
}

function currentConversationDeepWritingMemory(context: Parameters<ToolAdapter["execute"]>[1]): DeepWritingTaskMemory | null {
  const memory = context.deepWritingTaskMemory || deepWritingMemoryByConversation.get(context.conversationId) || null;
  if (!memory || memory.conversationId !== context.conversationId) return null;
  return memory;
}

function rememberDeepWritingMemory(memory: DeepWritingTaskMemory) {
  deepWritingMemoryByConversation.set(memory.conversationId, memory);
  if (deepWritingMemoryByConversation.size <= MAX_WORD_TASK_MEMORY_ENTRIES) return;
  const oldestKey = deepWritingMemoryByConversation.keys().next().value;
  if (oldestKey) deepWritingMemoryByConversation.delete(oldestKey);
}

function sanitizeTitle(value: string) {
  const cleaned = value
    .replace(/帮我|请|生成|写一份|写一个|制作|输出|导出|下载|Word|word|docx|文档|文件/g, " ")
    .replace(/[，。；、:：?？!！]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 60);
}

function sanitizeWritingInstruction(value: string) {
  return value
    .replace(/我将围绕[^，。；;]*[，。；;]?/g, "")
    .replace(/本文将[^，。；;]*[，。；;]?/g, "")
    .replace(/附件依据(?:显示)?[:：]?/g, "")
    .replace(/避免空泛套话[，。；;]?/g, "")
    .replace(/生成正文时优先保留要点[，。；;]?/g, "")
    .replace(/根据用户要求[，。；;]?/g, "")
    .replace(/作为\s*AI[，。；;]?/gi, "")
    .replace(/以下内容来自[:：]?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferTitle(text: string, sourceText?: string) {
  const explicitTopic = text.match(/主题(?:是|为|：|:)\s*([^，。；\n]{2,60})/i)?.[1]?.trim();
  if (explicitTopic) return explicitTopic;
  const cleaned = sanitizeTitle(text);
  if (cleaned.length >= 2) return cleaned;
  const sourceLine = sourceText
    ?.split(/\r?\n|[。；;]/)
    .map((line) => line.trim())
    .find((line) => line.length >= 4);
  return sourceLine?.slice(0, 36) || "Word 文档";
}

function inferDocumentTitle(text: string, documentKind?: string, sourceText?: string) {
  return normalizeDocumentTitle({
    title: inferTitle(text, sourceText),
    instruction: text,
    documentKind,
    fallback: "Word 文档"
  });
}

function collectRecentSummary(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, latestUserMessage: string) {
  return [...messages]
    .reverse()
    .filter((message) => message.role === "assistant" && message.content.trim() && message.content !== latestUserMessage)
    .map((message) => message.content.trim())
    .find(Boolean);
}

function conversationSourceText(files?: ConversationFileReference[]) {
  return (files || [])
    .map((file) => file.extractedText || file.textPreview || "")
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

async function collectWordSources(context: Parameters<ToolAdapter["execute"]>[1]): Promise<WordSourceBundle> {
  const uploadedSourceText = await parseUploadedSourceText(context.files);
  const conversationText = conversationSourceText(context.conversationFiles);
  const recentSummary = collectRecentSummary(context.messages, context.userText) || "";
  const sourceText = uploadedSourceText || conversationText || recentSummary || "";
  const sourceFileNames = [
    ...context.files.map((file) => file.name),
    ...(context.conversationFiles || []).map((file) => file.fileName)
  ].filter(Boolean);
  return { uploadedSourceText, conversationText, recentSummary, sourceText, sourceFileNames };
}

async function parseUploadedSourceText(files: File[]) {
  const documentFiles = files.filter(isDocumentFile);
  if (!documentFiles.length) return "";
  const parsed = await parseDocuments({ files: documentFiles, maxChars: 80_000 });
  if (parsed.status !== "parsed" && parsed.status !== "partial") throw new Error("DOCUMENT_PARSE_FAILED");
  return parsed.files
    .filter((file) => file.status === "parsed" && (file.normalizedText || file.text))
    .map((file) => file.normalizedText || file.text || "")
    .join("\n\n")
    .trim();
}

async function persistDocx({
  buffer,
  userId
}: {
  buffer: Buffer;
  userId: string;
}) {
  const key = `users/${userId || "anonymous"}/word/${datePath()}/${randomUUID()}.docx`;
  try {
    const uploaded = await storage.uploadBuffer({ key, buffer, contentType: DOCX_MIME });
    return { objectKey: uploaded.provider === "mock" ? null : uploaded.key, url: uploaded.url };
  } catch {
    const uploaded = await createMockStorage().uploadBuffer({ key, buffer, contentType: DOCX_MIME });
    return { objectKey: null, url: uploaded.url };
  }
}

function toGeneratedFile(
  result: Pick<Awaited<ReturnType<typeof generateWordDocumentFromRequest>>, "fileName" | "mimeType" | "sizeBytes">,
  persisted: { objectKey: string | null; url: string | null }
): GeneratedAgentFile {
  return {
    fileName: result.fileName,
    mimeType: result.mimeType,
    sizeBytes: result.sizeBytes,
    objectKey: persisted.objectKey,
    url: persisted.url
  };
}

async function generateAndPersistDeepWritingDocx(memory: DeepWritingTaskMemory, context: Parameters<ToolAdapter["execute"]>[1]) {
  const request = composeDeepWritingDocxRequest(memory);
  const content = sanitizeWordContent(composeDeepWritingDocxContent(memory));
  const plan: WordPlan = {
    title: content.title,
    subtitle: content.subtitle,
    sections: content.sections,
    tables: content.tables,
    metadata: {
      language: request.language || "zh-CN",
      stylePreset: request.stylePreset || "formal",
      sourceCount: memory.adoptedSources.length,
      attributes: content.attributes
    }
  };
  const wordTaskMemory = completeWordTaskMemory(createWordTaskMemory(request, "rendering_docx"), plan);
  const result = generateDocx({ content, request, warnings: [], wordTaskMemory });
  const persisted = await persistDocx({ buffer: result.buffer, userId: context.userId });
  return { result, generatedFile: toGeneratedFile(result, persisted) };
}

async function buildWordRequest(context: Parameters<ToolAdapter["execute"]>[1], sources?: WordSourceBundle): Promise<WordRequest> {
  const wordMemory = currentConversationWordMemory(context);
  if (referencesPriorWordTask(context.userText) && wordMemory) {
    return resumeWordRequestFromMemory(wordMemory, context.userText);
  }

  const sourceBundle = sources || (await collectWordSources(context));
  const recentSummary = sourceBundle.recentSummary;
  const sourceText = sourceBundle.sourceText;
  const title = inferDocumentTitle(context.userText, undefined, sourceText);

  return {
    conversationId: context.conversationId,
    title,
    instruction: context.userText,
    contentOrigin: "existing_content",
    sourceText: sourceText || undefined,
    sourceFiles: (context.conversationFiles || []).map((file) => ({
      fileName: file.fileName,
      mimeType: file.mimeType || undefined,
      text: file.extractedText || file.textPreview || undefined
    })),
    conversationSummary: recentSummary,
    outputFileName: title,
    stylePreset: "professional",
    language: "zh-CN"
  };
}

function deepKindFromDocumentKind(kind: WordWriteDocumentKind): DeepWritingDocumentKind {
  if (kind === "lesson_plan") return "lesson_plan";
  if (kind === "manual") return "manual";
  if (kind === "report") return "report";
  if (kind === "plan") return "plan";
  if (kind === "summary") return "summary";
  return "general";
}

function detectionForDecision(decision: WordWriteModeDecision, detection: DeepWritingDetection): DeepWritingDetection {
  if (detection.enabled) return detection;
  return {
    enabled: true,
    trigger: decision.mode === "compose_deep" ? "complexity" : "explicit",
    reason: `word_write_mode:${decision.reason}`,
    confidence: decision.confidence,
    suggestedDocumentKind: deepKindFromDocumentKind(decision.documentKind),
    shouldAutoOpenPanel: true
  };
}

async function buildDeepWritingMemory(
  context: Parameters<ToolAdapter["execute"]>[1],
  sources: WordSourceBundle,
  modeDecision: WordWriteModeDecision,
  detection: DeepWritingDetection
): Promise<DeepWritingTaskMemory | null> {
  const existingMemory = currentConversationDeepWritingMemory(context);
  if (referencesPriorDeepWritingTask(context.userText) && existingMemory) {
    return resumeDeepWritingTaskMemory(existingMemory, context.userText);
  }

  if (!modeDecision.shouldUseDeepWriting) return null;
  const finalDetection = detectionForDecision(modeDecision, detection);
  const safeInstruction = sanitizeWritingInstruction(context.userText) || context.userText;

  return createDeepWritingTaskMemory({
    conversationId: context.conversationId,
    originalInstruction: safeInstruction,
    topic: inferDocumentTitle(safeInstruction, finalDetection.suggestedDocumentKind, sources.sourceText),
    detection: finalDetection,
    sourceFileNames: sources.sourceFileNames,
    sourceSummary: sources.sourceText,
    writingMode: modeDecision.mode === "compose_simple" ? "light" : "deep"
  });
}

async function deepWritingRunResult(memory: DeepWritingTaskMemory, context: Parameters<ToolAdapter["execute"]>[1]) {
  const generatedFiles: GeneratedAgentFile[] = [];
  const contentGenerationMode = resolveWritingContentGenerationMode(context);
  const completedMemory = await runDeepWritingDraft({
    memory,
    sourceText: memory.sourceSummary,
    conversationSummary: memory.sourceSummary,
    signal: context.signal,
    contentGenerationMode,
    generateDraftContent: context.generateWritingContent,
    generateSectionContent: context.generateWritingSectionContent,
    emit: context.emitDeepWritingEvent || (() => undefined),
    generateFinalDocument: async (docxMemory) => {
      const generated = await generateAndPersistDeepWritingDocx(docxMemory, context);
      generatedFiles[0] = generated.generatedFile;
      return {
        fileName: generated.generatedFile.fileName,
        mimeType: generated.generatedFile.mimeType,
        sizeBytes: generated.generatedFile.sizeBytes,
        downloadUrl: generated.generatedFile.url,
        objectKey: generated.generatedFile.objectKey
      };
    }
  });
  rememberDeepWritingMemory(completedMemory);
  const generatedFile = generatedFiles[0] || null;
  const completedPanelState = createDeepWritingPanelState(completedMemory, generatedFile?.url || completedMemory.finalDocument?.downloadUrl || undefined);
  const completed = completedMemory.currentStage === "completed";
  const interrupted = completedMemory.currentStage === "interrupted";
  const publicStage = completed ? "deep_writing_completed" : interrupted ? "deep_writing_interrupted" : "deep_writing_failed";
  const publicContent = completed
    ? "文档已生成，可下载 Word，也可以查看正文预览。"
    : interrupted
      ? "文档生成已暂停，已保留当前正文。请输入“继续”可从断点接着生成。"
      : "深度写作暂未完成，请稍后继续或重试。";
  return {
    result: {
      content: publicContent,
      legacyContent: completed
        ? "文档已生成，可在下方卡片下载，也可以点击查看文档预览完整内容。"
        : "深度写作暂未完成，请稍后继续或重试。",
      modelUsed: "NexusAI Deep Writing Planner",
      providerUsed: "xheai" as const,
      routeReason: completed
        ? "runtime_v2:word-adapter:deep_writing_docx"
        : interrupted
          ? `runtime_v2:word-adapter:deep_writing_interrupted:${contentGenerationMode}`
          : `runtime_v2:word-adapter:deep_writing_failed:${contentGenerationMode}`,
      fallbackUsed: false,
      extractedDocuments: [],
      generatedFiles: completed && generatedFile ? [generatedFile] : [],
      pendingTask: null,
      defaultsApplied: [
        `writing_content_generation:${contentGenerationMode}`,
        "deep_writing_docx",
        "deep_writing_docx_generating",
        publicStage
      ]
    },
    runtimeMode: "adapter" as const,
    resultCard: {
      title: "深度写作 Word 文档",
      description: generatedFile?.fileName || completedMemory.topic,
      status: completed ? ("completed" as const) : interrupted ? ("running" as const) : ("failed" as const),
      taskType: "word" as const,
      downloadUrl: completed ? generatedFile?.url || completedMemory.finalDocument?.downloadUrl || null : null,
      retryable: true,
      mode: "deep_writing" as const,
      deepWritingTaskId: completedMemory.taskId,
      panelAvailable: true,
      panelAutoOpen: true,
      currentStage: completedMemory.currentStage,
      documentReady: completed && Boolean(generatedFile || completedMemory.finalDocument?.downloadUrl),
      contentGenerationMode,
      failureReason: completedMemory.failureReason,
      deepWritingTaskMemory: completedMemory,
      deepWritingPanelState: completedPanelState
    }
  };


}

function resolveWritingContentGenerationMode(context: Parameters<ToolAdapter["execute"]>[1]): WritingContentGenerationMode {
  if (context.generateWritingSectionContent || context.generateWritingContent) return "model_generated";
  if (context.allowDeterministicWriting) return "deterministic_test_only";
  return "unavailable";
}

export const wordAdapter: ToolAdapter = {
  id: "word-adapter",
  targetTool: "word",
  canHandle: (decision) => decision.targetTool === "word",
  validateInputs: (decision, context) => {
    const wantsPriorWordTask = referencesPriorWordTask(context.userText);
    if (wantsPriorWordTask && !currentConversationWordMemory(context)) {
      return { ok: false, missingInputs: ["active_word_task"], message: WORD_MISSING_ACTIVE_TASK_MESSAGE };
    }
    if (!wantsPriorWordTask && referencesPriorDeepWritingTask(context.userText) && !currentConversationDeepWritingMemory(context)) {
      return { ok: false, missingInputs: ["active_deep_writing_task"], message: DEEP_WRITING_MISSING_ACTIVE_TASK_MESSAGE };
    }
    if (decision.missingInputs.includes("subject")) {
      return { ok: false, missingInputs: ["subject"], message: WORD_MISSING_SUBJECT_MESSAGE };
    }
    if (decision.missingInputs.includes("file") || (referencesCurrentFile(context.userText) && !context.files.length && !conversationSourceText(context.conversationFiles))) {
      return { ok: false, missingInputs: ["file"], message: WORD_MISSING_FILE_MESSAGE };
    }
    if (!context.userText.trim()) {
      return { ok: false, missingInputs: ["instruction"], message: WORD_MISSING_CONTENT_MESSAGE };
    }
    return { ok: true };
  },
  execute: async (_decision, context) => {
    const priorWordMemory = currentConversationWordMemory(context);
    if (referencesPriorWordTask(context.userText) && priorWordMemory) {
      const request = await buildWordRequest(context);
      const result = await generateWordDocumentFromRequest({ ...request, contentOrigin: "existing_content" });
      rememberWordTaskMemory(result.wordTaskMemory);
      const persisted = await persistDocx({ buffer: result.buffer, userId: context.userId });
      const generatedFile = toGeneratedFile(result, persisted);

      return {
        result: {
          content: `已生成 Word 文档：${result.fileName}`,
          modelUsed: "NexusAI Word Engine",
          providerUsed: "xheai",
          routeReason: "runtime_v2:word-adapter:word_engine_resume",
          fallbackUsed: false,
          extractedDocuments: [],
          generatedFiles: [generatedFile],
          pendingTask: null,
          defaultsApplied: ["word_engine_resume", ...(result.warnings.length ? result.warnings : [])]
        },
        runtimeMode: "adapter",
        resultCard: {
          title: "Word 文档",
          description: result.fileName,
          status: "completed" as const,
          taskType: "word" as const,
          downloadUrl: generatedFile.url,
          retryable: true,
          wordTaskMemory: result.wordTaskMemory
        }
      };
    }

    const sources = await collectWordSources(context);
    const deepWritingDetection = detectDeepWritingMode({
      userText: context.userText,
      targetTool: "word",
      sourceText: sources.sourceText,
      fileCount: Math.max(context.files.length, context.conversationFiles?.length || 0),
      sourceFileNames: sources.sourceFileNames
    });
    const modeDecision = classifyWordWriteMode({
      userText: context.userText,
      contentMode: context.tools?.contentMode,
      sourceText: sources.sourceText,
      fileCount: Math.max(context.files.length, context.conversationFiles?.length || 0),
      sourceFileNames: sources.sourceFileNames,
      deepWritingDetection
    });

    if (modeDecision.mode === "answer_only") {
      const answer = await context.runChatAnswer();
      return {
        result: {
          ...answer,
          generatedFiles: [],
          pendingTask: null,
          defaultsApplied: [...(answer.defaultsApplied || []), "word_write_mode_answer_only"]
        },
        runtimeMode: "adapter"
      };
    }

    const deepWritingMemory = await buildDeepWritingMemory(context, sources, modeDecision, deepWritingDetection);
    if (deepWritingMemory) {
      rememberDeepWritingMemory(deepWritingMemory);
      return deepWritingRunResult(deepWritingMemory, context);
    }

    if (modeDecision.mode !== "export_existing" || !modeDecision.shouldGenerateImmediateDocx) {
      throw new Error("WORD_WRITE_MODE_BLOCKED_FAST_EXPORT");
    }

    const request = await buildWordRequest(context, sources);
    const result = await generateWordDocumentFromRequest(request);
    rememberWordTaskMemory(result.wordTaskMemory);
    const persisted = await persistDocx({ buffer: result.buffer, userId: context.userId });
    const generatedFile = toGeneratedFile(result, persisted);

    return {
      result: {
        content: `已生成 Word 文档：${result.fileName}`,
        modelUsed: "NexusAI Word Engine",
        providerUsed: "xheai",
        routeReason: "runtime_v2:word-adapter:word_engine",
        fallbackUsed: false,
        extractedDocuments: [],
        generatedFiles: [generatedFile],
        pendingTask: null,
        defaultsApplied: ["word_engine", ...(result.warnings.length ? result.warnings : [])]
      },
      runtimeMode: "adapter",
      resultCard: {
        title: "Word 文档",
        description: result.fileName,
        status: "completed",
        taskType: "word",
        downloadUrl: generatedFile.url,
        retryable: true,
        wordTaskMemory: result.wordTaskMemory
      }
    };
  },
  getResultCard: (result) => result.resultCard || null,
  failureToUserMessage: (error) => {
    if (error instanceof Error && error.message === "DOCUMENT_PARSE_FAILED") return "文件解析失败，请确认文件格式或重新上传。";
    return WORD_FAILED_MESSAGE;
  }
};
