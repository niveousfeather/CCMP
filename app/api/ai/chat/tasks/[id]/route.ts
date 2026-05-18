import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as storage from "@/lib/storage";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseJsonObject(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
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

function normalizeAsyncStatus(value: unknown, requiresGeneratedFile: boolean, hasAttachments: boolean) {
  if (value === "completed" && (!requiresGeneratedFile || hasAttachments)) return "completed";
  if (value === "failed" || value === "completed") return "failed";
  return "generating";
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await context.params;
  const message = await prisma.chatMessage.findFirst({
    where: {
      id,
      role: "assistant",
      conversation: { userId: user!.id }
    },
    include: {
      attachments: { orderBy: { createdAt: "asc" } }
    }
  });

  if (!message) {
    return NextResponse.json({ code: "NOT_FOUND", message: "任务不存在。" }, { status: 404 });
  }

  const metadata = parseJsonObject(message.metadata || null);
  const asyncTask = metadata?.asyncTask && typeof metadata.asyncTask === "object"
    ? metadata.asyncTask as Record<string, unknown>
    : null;
  if (!asyncTask) {
    return NextResponse.json({ code: "NOT_ASYNC_TASK", message: "这条消息不是异步任务。" }, { status: 400 });
  }

  const attachments = await Promise.all(
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
  );

  const requiresGeneratedFile = asyncTask.requiresGeneratedFile !== false;
  const status = normalizeAsyncStatus(asyncTask.status, requiresGeneratedFile, attachments.length > 0);
  return NextResponse.json({
    task: {
      taskId: message.id,
      status,
      kind: asyncTask.kind === "ppt" ? "ppt" : asyncTask.kind === "word" ? "word" : "agent",
      label: typeof asyncTask.label === "string" ? asyncTask.label : "Nexus AI",
      fileName: typeof asyncTask.fileName === "string" ? asyncTask.fileName : attachments[0]?.name || "生成文件",
      content: message.content,
      failureReason: typeof asyncTask.errorMessage === "string" ? asyncTask.errorMessage : null,
      attachments,
      webContext: metadata?.webContext && typeof metadata.webContext === "object" ? metadata.webContext : null,
      updatedAt: typeof asyncTask.updatedAt === "string" ? asyncTask.updatedAt : message.createdAt.toISOString()
    }
  });
}
