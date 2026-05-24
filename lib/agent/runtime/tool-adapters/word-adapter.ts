import { randomUUID } from "node:crypto";

import { parseDocuments } from "@/lib/document-processing/parser";
import type { GeneratedAgentFile } from "@/lib/agent/types";
import type { ConversationFileReference, ToolAdapter } from "@/lib/agent/runtime/tool-adapters/types";
import * as storage from "@/lib/storage";
import { createMockStorage } from "@/lib/storage/local";
import { generateWordDocumentFromRequest, resumeWordRequestFromMemory, type WordRequest, type WordTaskMemory } from "@/lib/word-engine";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const WORD_FAILED_MESSAGE = "Word 文档生成失败，请补充更明确的主题或稍后重试。";
const WORD_MISSING_SUBJECT_MESSAGE = "请补充 Word 文档的主题、文体和大致篇幅。";
const WORD_MISSING_FILE_MESSAGE = "请先上传需要整理成 Word 的文件，或补充当前对话中的材料。";
const WORD_MISSING_CONTENT_MESSAGE = "请提供要写入 Word 的正文材料、对话总结或明确主题。";
const WORD_MISSING_ACTIVE_TASK_MESSAGE = "请先在当前对话里生成一个 Word 任务，我再继续完善。";
const MAX_WORD_TASK_MEMORY_ENTRIES = 100;
const wordTaskMemoryByConversation = new Map<string, WordTaskMemory>();

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

function sanitizeTitle(value: string) {
  const cleaned = value
    .replace(/帮我|请|生成|写一份|写一个|制作|输出|导出|下载|Word|word|docx|文档|文件/g, " ")
    .replace(/[，。；、:：?？!！]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 60);
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

function toGeneratedFile(result: Awaited<ReturnType<typeof generateWordDocumentFromRequest>>, persisted: { objectKey: string | null; url: string | null }): GeneratedAgentFile {
  return {
    fileName: result.fileName,
    mimeType: result.mimeType,
    sizeBytes: result.sizeBytes,
    objectKey: persisted.objectKey,
    url: persisted.url
  };
}

async function buildWordRequest(context: Parameters<ToolAdapter["execute"]>[1]): Promise<WordRequest> {
  const wordMemory = currentConversationWordMemory(context);
  if (referencesPriorWordTask(context.userText) && wordMemory) {
    return resumeWordRequestFromMemory(wordMemory, context.userText);
  }

  const uploadedSourceText = await parseUploadedSourceText(context.files);
  const conversationText = conversationSourceText(context.conversationFiles);
  const recentSummary = collectRecentSummary(context.messages, context.userText);
  const sourceText = uploadedSourceText || conversationText || recentSummary || "";
  const title = inferTitle(context.userText, sourceText);

  return {
    conversationId: context.conversationId,
    title,
    instruction: context.userText,
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

export const wordAdapter: ToolAdapter = {
  id: "word-adapter",
  targetTool: "word",
  canHandle: (decision) => decision.targetTool === "word",
  validateInputs: (decision, context) => {
    if (referencesPriorWordTask(context.userText) && !currentConversationWordMemory(context)) {
      return { ok: false, missingInputs: ["active_word_task"], message: WORD_MISSING_ACTIVE_TASK_MESSAGE };
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
    const request = await buildWordRequest(context);
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
