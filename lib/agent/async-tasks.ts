import { enqueueGenerationExecution } from "@/lib/generation/concurrency";
import { prisma } from "@/lib/db";
import { runAgent } from "@/lib/agent/router";
import type { AgentChatMessage, AgentToolSelection, GeneratedAgentFile, WebContextResult } from "@/lib/agent/types";

type AgentAsyncTaskPayload = {
  assistantMessageId: string;
  conversationId: string;
  files: File[];
  kind: "agent" | "ppt" | "word";
  label: string;
  messages: AgentChatMessage[];
  pendingFileName?: string;
  requiresGeneratedFile: boolean;
  tools?: AgentToolSelection;
  userId: string;
};

type ChatMetadata = Record<string, unknown>;

function readPositiveIntEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAgentAsyncTaskTimeoutMs(kind: AgentAsyncTaskPayload["kind"]) {
  if (kind === "word") {
    return readPositiveIntEnv("AGENT_WORD_ASYNC_TASK_TIMEOUT_MS", 600_000);
  }
  return readPositiveIntEnv("AGENT_ASYNC_TASK_TIMEOUT_MS", 300_000);
}

function parseMetadata(value: string | null): ChatMetadata {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as ChatMetadata : {};
  } catch {
    return {};
  }
}

function mergeMetadata(base: string | null, patch: ChatMetadata) {
  return JSON.stringify({ ...parseMetadata(base), ...patch });
}

function toPendingKind(fileName: string): "ppt" | "word" {
  return fileName.toLowerCase().endsWith(".pptx") ? "ppt" : "word";
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

function buildAsyncTaskMetadata(
  payload: Pick<AgentAsyncTaskPayload, "assistantMessageId" | "kind" | "label" | "pendingFileName" | "requiresGeneratedFile">,
  patch: ChatMetadata
) {
  return {
    id: payload.assistantMessageId,
    kind: payload.kind,
    label: payload.label,
    fileName: payload.pendingFileName,
    requiresGeneratedFile: payload.requiresGeneratedFile,
    updatedAt: new Date().toISOString(),
    ...patch
  };
}

function getWordProgressMessage(startedAt: number) {
  const elapsed = Date.now() - startedAt;
  if (elapsed < 15_000) return "正在理解需求";
  if (elapsed < 90_000) return "正在联网补充资料";
  if (elapsed < 300_000) return "正在生成文档结构";
  if (elapsed < 480_000) return "正在完善文档内容";
  if (elapsed < 560_000) return "正在排版 Word";
  return "正在导出文件";
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
  if (!files.length) return;

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
}

async function updateAssistantMessage({
  assistantMessageId,
  content,
  metadata
}: {
  assistantMessageId: string;
  content?: string;
  metadata: ChatMetadata;
}) {
  const existing = await prisma.chatMessage.findUnique({
    where: { id: assistantMessageId },
    select: { metadata: true }
  });
  if (!existing) return;

  await prisma.chatMessage.update({
    where: { id: assistantMessageId },
    data: {
      ...(content === undefined ? {} : { content }),
      metadata: mergeMetadata(existing.metadata, metadata)
    }
  });
}

export function enqueueAgentChatTask(payload: AgentAsyncTaskPayload) {
  enqueueGenerationExecution("agent", payload.assistantMessageId, () => runAgentChatTask(payload));
}

async function runAgentChatTask({
  assistantMessageId,
  conversationId,
  files,
  kind,
  label,
  messages,
  pendingFileName,
  requiresGeneratedFile,
  tools,
  userId
}: AgentAsyncTaskPayload) {
  const controller = new AbortController();
  const timeoutMs = getAgentAsyncTaskTimeoutMs(kind);
  const taskStartedAt = Date.now();
  console.info(`[agent:async] task_started kind=${kind} messageId=${assistantMessageId} timeout=${timeoutMs}`);
  const timeout = setTimeout(() => {
    console.error(`[agent:async] task_abort kind=${kind} messageId=${assistantMessageId} stage=total reason=timeout timeout=${timeoutMs}`);
    controller.abort(new Error(`${kind}_total_timeout_${timeoutMs}`));
  }, timeoutMs);
  let heartbeatInFlight = false;
  const heartbeat =
    kind === "word"
      ? setInterval(() => {
          if (heartbeatInFlight) return;
          heartbeatInFlight = true;
          updateAssistantMessage({
            assistantMessageId,
            metadata: {
              asyncTask: buildAsyncTaskMetadata(
                { assistantMessageId, kind, label, pendingFileName, requiresGeneratedFile },
                {
                  status: "processing",
                  progressMessage: getWordProgressMessage(taskStartedAt),
                  heartbeatAt: new Date().toISOString()
                }
              )
            }
          })
            .catch((error) => {
              console.warn(`[agent:async] heartbeat_failed kind=${kind} messageId=${assistantMessageId} error=${error instanceof Error ? error.message : "unknown"}`);
            })
            .finally(() => {
              heartbeatInFlight = false;
            });
        }, readPositiveIntEnv("AGENT_WORD_ASYNC_HEARTBEAT_MS", 60_000))
      : null;

  try {
    await updateAssistantMessage({
      assistantMessageId,
      metadata: {
        asyncTask: buildAsyncTaskMetadata(
          { assistantMessageId, kind, label, pendingFileName, requiresGeneratedFile },
          {
            status: "processing",
            progressMessage: kind === "word" ? "正在理解需求" : undefined
          }
        )
      }
    });

    const result = await runAgent({
      userId,
      messages,
      files,
      preferences: null,
      pendingTask: null,
      tools,
      signal: controller.signal
    });

    await saveGeneratedFiles({
      files: result.generatedFiles,
      userId,
      conversationId,
      messageId: assistantMessageId
    });

    const generatedFile = result.generatedFiles[0] || null;
    const completed = requiresGeneratedFile ? result.generatedFiles.length > 0 : true;
    await updateAssistantMessage({
      assistantMessageId,
      content: result.content,
      metadata: {
        modelUsed: result.modelUsed,
        providerUsed: result.providerUsed,
        routeReason: result.routeReason,
        fallbackUsed: result.fallbackUsed,
        generatedFileCount: result.generatedFiles.length,
        agentTask: result.agentTask || null,
        pendingTask: result.pendingTask || null,
        defaultsApplied: result.defaultsApplied || [],
        webContext: compactWebContext(result.webContext),
        asyncTask: buildAsyncTaskMetadata(
          {
            assistantMessageId,
            kind: generatedFile ? toPendingKind(generatedFile.fileName) : kind,
            label,
            pendingFileName: generatedFile?.fileName || pendingFileName,
            requiresGeneratedFile
          },
          {
            status: completed ? "completed" : "failed",
            errorMessage: completed ? null : result.content
          }
        )
      }
    });

    await prisma.chatConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() }
    });
  } catch (error) {
    const message = "生成失败，请重新输入后重试。";
    console.error(`[agent:async] task_failed messageId=${assistantMessageId} error=${error instanceof Error ? error.message : "unknown"}`);
    await updateAssistantMessage({
      assistantMessageId,
      content: message,
      metadata: {
        asyncTask: buildAsyncTaskMetadata(
          { assistantMessageId, kind, label, pendingFileName, requiresGeneratedFile },
          {
            status: "failed",
            errorMessage: message
          }
        )
      }
    });
  } finally {
    clearTimeout(timeout);
    if (heartbeat) clearInterval(heartbeat);
  }
}
