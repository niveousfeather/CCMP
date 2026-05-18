import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as storage from "@/lib/storage";

function getAttachmentKind(mimeType?: string | null, fileName?: string) {
  const extension = fileName?.split(".").pop()?.toLowerCase() || "";
  if (mimeType?.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(extension)) return "image";
  if (extension === "pdf") return "pdf";
  if (["xls", "xlsx", "csv"].includes(extension)) return "spreadsheet";
  if (["txt", "md"].includes(extension)) return "text";
  if (["doc", "docx"].includes(extension)) return "word";
  return "file";
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function parseJsonObject(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await params;
  const [conversation, favorite] = await Promise.all([
    prisma.chatConversation.findFirst({
      where: { id, userId: user!.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            attachments: { orderBy: { createdAt: "asc" } }
          }
        }
      }
    }),
    prisma.favorite.findFirst({
      where: { userId: user!.id, targetType: "chat", targetId: id },
      select: { id: true }
    })
  ]);

  if (!conversation) return NextResponse.json({ message: "会话不存在" }, { status: 404 });

  const messages = await Promise.all(
    conversation.messages.map(async (message) => {
      const metadata = parseJsonObject(message.metadata || null);
      const asyncTask = metadata?.asyncTask && typeof metadata.asyncTask === "object"
        ? metadata.asyncTask as Record<string, unknown>
        : null;
      const isAsyncPending = asyncTask?.status === "queued" || asyncTask?.status === "processing";
      const isAsyncFailed = asyncTask?.status === "failed";
      const asyncKind = asyncTask?.kind === "ppt" ? "ppt" : asyncTask?.kind === "word" ? "word" : "agent";
      const requiresGeneratedFile = asyncTask?.requiresGeneratedFile !== false;
      const pendingFileGeneration =
        asyncTask && (isAsyncPending || isAsyncFailed) && requiresGeneratedFile && (asyncKind === "ppt" || asyncKind === "word")
          ? {
              taskId: typeof asyncTask.id === "string" ? asyncTask.id : message.id,
              kind: asyncKind,
              fileName: typeof asyncTask.fileName === "string" ? asyncTask.fileName : "生成文件",
              status: isAsyncPending ? "generating" : "failed",
              failureReason: isAsyncFailed && typeof asyncTask.errorMessage === "string" ? asyncTask.errorMessage : null
            }
          : null;
      const pendingAgentTask =
        asyncTask && (isAsyncPending || isAsyncFailed) && !requiresGeneratedFile
          ? {
              taskId: typeof asyncTask.id === "string" ? asyncTask.id : message.id,
              label: typeof asyncTask.label === "string" ? asyncTask.label : "Nexus AI",
              status: isAsyncPending ? "generating" : "failed",
              failureReason: isAsyncFailed && typeof asyncTask.errorMessage === "string" ? asyncTask.errorMessage : null
            }
          : null;
      return {
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: formatTime(message.createdAt),
        fallback: metadata?.fallback === true || metadata?.fallbackUsed === true,
        imageGeneration:
          metadata?.imageGeneration && typeof metadata.imageGeneration === "object" ? metadata.imageGeneration : null,
        webContext: metadata?.webContext && typeof metadata.webContext === "object" ? metadata.webContext : null,
        pendingFileGeneration,
        pendingAgentTask,
        attachments: await Promise.all(
          message.attachments.map(async (attachment) => {
            const signedOrPublicUrl = attachment.objectKey
              ? await storage.getPublicOrSignedUrl(attachment.objectKey).catch(() => null)
              : null;
            const url = signedOrPublicUrl || attachment.url;
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
          })
        )
      };
    })
  );

  return NextResponse.json({
    conversation: {
      userId: conversation.userId,
      conversationId: conversation.id,
      type: "chat",
      title: conversation.title,
      summary: messages[messages.length - 1]?.content || "Nexus AI 已就绪。输入问题，或上传文档开始分析。",
      status: "活跃",
      model: conversation.model,
      isFavorite: Boolean(favorite),
      favoriteId: favorite?.id,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString()
    },
    messages
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { title?: string } | null;
  const title = body?.title?.replace(/\s+/g, " ").trim();
  if (!title) return NextResponse.json({ message: "请输入新的会话名称" }, { status: 400 });

  const conversation = await prisma.chatConversation.findFirst({
    where: { id, userId: user!.id },
    select: { id: true }
  });

  if (!conversation) return NextResponse.json({ message: "会话不存在" }, { status: 404 });

  const updated = await prisma.chatConversation.update({
    where: { id },
    data: { title: title.slice(0, 60), updatedAt: new Date() },
    select: { id: true, title: true, updatedAt: true }
  });

  return NextResponse.json({
    conversation: {
      conversationId: updated.id,
      title: updated.title,
      updatedAt: updated.updatedAt.toISOString()
    }
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await params;
  const conversation = await prisma.chatConversation.findFirst({
    where: { id, userId: user!.id },
    include: { attachments: true }
  });

  if (!conversation) return NextResponse.json({ message: "会话不存在" }, { status: 404 });

  // TODO: 正式审计场景下，可改为保留附件对象，仅删除会话索引。
  await Promise.all(
    conversation.attachments
      .filter((attachment) => Boolean(attachment.objectKey))
      .map((attachment) => storage.deleteObject(attachment.objectKey!))
  );

  await prisma.$transaction([
    prisma.favorite.deleteMany({ where: { userId: user!.id, targetType: "chat", targetId: id } }),
    prisma.chatConversation.delete({ where: { id } })
  ]);

  return NextResponse.json({ ok: true });
}
