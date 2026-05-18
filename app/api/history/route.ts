import { NextResponse } from "next/server";

import { isPlatformOwnerAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { mapModel3DStatus } from "@/lib/model3d/history";
import * as storage from "@/lib/storage";
import { mapVideoStatus } from "@/lib/video/tasks";

function getTitle(text: string, fallback: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 24 ? `${compact.slice(0, 24)}...` : compact || fallback;
}

function mapImageStatus(status: string, hasImages: boolean) {
  if ((status === "completed" || status === "success") && hasImages) return "已完成";
  if (status === "timeout") return "生成超时";
  if (status === "failed" || ((status === "completed" || status === "success") && !hasImages)) return "生成失败";
  return "生成中";
}

function isStableInlineOrLocalUrl(url: string | null) {
  return Boolean(url && (url.startsWith("/mock-storage/") || url.startsWith("data:image/")));
}

async function resolveAsset(asset: { url: string | null; objectKey: string | null }) {
  if (isStableInlineOrLocalUrl(asset.url)) return asset.url;

  if (asset.objectKey) {
    try {
      return await storage.getPublicOrSignedUrl(asset.objectKey);
    } catch (error) {
      console.error(`[api:history] image_asset_url_resolve_failed key=${asset.objectKey} error=${error instanceof Error ? error.message : "unknown"}`);
      return null;
    }
  }

  return asset.url;
}

async function resolveStoredUrl(objectKey: string | null, url: string | null) {
  if (url && (url.startsWith("/mock-storage/") || url.startsWith("data:"))) return url;

  if (objectKey) {
    try {
      return await storage.getPublicOrSignedUrl(objectKey);
    } catch (error) {
      console.error(`[api:history] stored_url_resolve_failed key=${objectKey} error=${error instanceof Error ? error.message : "unknown"}`);
      return null;
    }
  }

  return url;
}

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  const historyWhere = isPlatformOwnerAdmin(user) ? undefined : { userId: user!.id };

  const [generations, videoGenerations, model3DGenerations, conversations, favorites] = await Promise.all([
    prisma.imageGeneration.findMany({
      where: historyWhere,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        assets: {
          where: { sourceType: "generated" },
          orderBy: { index: "asc" }
        }
      }
    }),
    prisma.videoGeneration.findMany({
      where: historyWhere,
      orderBy: { updatedAt: "desc" },
      take: 100
    }),
    prisma.model3DGeneration.findMany({
      where: historyWhere,
      orderBy: { updatedAt: "desc" },
      take: 100
    }),
    prisma.chatConversation.findMany({
      where: historyWhere,
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true }
        }
      }
    }),
    prisma.favorite.findMany({
      where: { userId: user!.id },
      select: { id: true, targetType: true, targetId: true }
    })
  ]);

  const favoriteMap = new Map(favorites.map((item) => [`${item.targetType}:${item.targetId}`, item.id]));

  const imageRecords = await Promise.all(
    generations.map(async (generation) => {
      const images = (await Promise.all(generation.assets.map(resolveAsset))).filter((url): url is string => Boolean(url));
      const favoriteId = favoriteMap.get(`image:${generation.id}`);
      const finalPrompt = generation.finalPrompt || generation.prompt;

      return {
        id: generation.id,
        taskId: generation.id,
        userId: generation.userId,
        type: "image" as const,
        title: getTitle(finalPrompt, "图片生成"),
        prompt: generation.prompt,
        finalPrompt,
        failureReason: generation.failureReason,
        model: generation.model,
        status: mapImageStatus(generation.status, images.length > 0),
        style: generation.style || "默认",
        ratio: generation.aspectRatio,
        resolution: generation.resolution,
        createdAt: generation.createdAt.toISOString(),
        updatedAt: generation.updatedAt.toISOString(),
        images,
        thumbnailUrl: images[0] || null,
        isFavorite: Boolean(favoriteId),
        favoriteId
      };
    })
  );

  const chatRecords = conversations.map((conversation) => {
    const favoriteId = favoriteMap.get(`chat:${conversation.id}`);
    return {
      id: conversation.id,
      taskId: conversation.id,
      userId: conversation.userId,
      type: "chat" as const,
      title: conversation.title,
      prompt: conversation.messages[0]?.content || "暂无消息摘要",
      model: conversation.model,
      status: "活跃",
      ratio: "-",
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      thumbnailUrl: null,
      isFavorite: Boolean(favoriteId),
      favoriteId
    };
  });

  const videoRecords = await Promise.all(
    videoGenerations.map(async (generation) => {
      const favoriteId = favoriteMap.get(`video:${generation.id}`);
      const thumbnailUrl =
        (await resolveStoredUrl(generation.coverImageObjectKey || generation.imageObjectKey, generation.coverImageUrl || generation.imageUrl)) ||
        generation.coverImageUrl ||
        generation.imageUrl ||
        null;

      return {
        id: generation.id,
        taskId: generation.id,
        userId: generation.userId,
        type: "video" as const,
        title: getTitle(generation.prompt, "视频生成"),
        prompt: generation.prompt,
        model: generation.model,
        status: mapVideoStatus(generation.status),
        failureReason: generation.errorMessage,
        duration: generation.duration || "5s",
        ratio: generation.ratio || "16:9",
        resolution: generation.resolution,
        createdAt: generation.createdAt.toISOString(),
        updatedAt: generation.updatedAt.toISOString(),
        thumbnailUrl,
        isFavorite: Boolean(favoriteId),
        favoriteId
      };
    })
  );

  const model3DRecords = await Promise.all(
    model3DGenerations.map(async (generation) => {
      const favoriteId = favoriteMap.get(`model3d:${generation.taskId}`);
      const thumbnailUrl = await resolveStoredUrl(generation.previewImageObjectKey, generation.previewImageUrl);

      return {
        id: generation.taskId,
        taskId: generation.taskId,
        userId: generation.userId,
        type: "model3d" as const,
        title: generation.title || "Nexus 3D Preview",
        prompt: generation.prompt,
        model: "nexus-3d-preview",
        status: mapModel3DStatus(generation.status),
        failureReason: generation.errorMessage,
        ratio: "-",
        resolution: generation.textureQuality || "standard",
        createdAt: generation.createdAt.toISOString(),
        updatedAt: generation.updatedAt.toISOString(),
        thumbnailUrl,
        isFavorite: Boolean(favoriteId),
        favoriteId
      };
    })
  );

  const records = [...imageRecords, ...videoRecords, ...model3DRecords, ...chatRecords].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );

  return NextResponse.json({ records });
}
