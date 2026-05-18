import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as storage from "@/lib/storage";

type FavoriteTargetType = "image" | "chat" | "model3d";

function normalizeTargetType(value: unknown): FavoriteTargetType | null {
  return value === "image" || value === "chat" || value === "model3d" ? value : null;
}

function getTitle(text: string, fallback: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 24 ? `${compact.slice(0, 24)}...` : compact || fallback;
}

function mapStatus(status: string, hasImages = true) {
  if ((status === "completed" || status === "success") && hasImages) return "已完成";
  if (status === "timeout") return "生成超时";
  if (status === "failed" || ((status === "completed" || status === "success") && !hasImages)) return "生成失败";
  if (status === "active") return "活跃";
  return "生成中";
}

async function assertTargetExists(userId: string, targetType: FavoriteTargetType, targetId: string) {
  if (targetType === "image") {
    return Boolean(await prisma.imageGeneration.findFirst({ where: { id: targetId, userId }, select: { id: true } }));
  }
  if (targetType === "model3d") {
    return Boolean(await prisma.model3DGeneration.findFirst({ where: { taskId: targetId, userId }, select: { id: true } }));
  }
  return Boolean(await prisma.chatConversation.findFirst({ where: { id: targetId, userId }, select: { id: true } }));
}

async function resolveAsset(asset: { url: string | null; objectKey: string | null }) {
  if (asset.url && (asset.url.startsWith("/mock-storage/") || asset.url.startsWith("data:image/"))) return asset.url;

  if (asset.objectKey) {
    try {
      return await storage.getPublicOrSignedUrl(asset.objectKey);
    } catch (error) {
      console.error(`[api:favorites] image_asset_url_resolve_failed key=${asset.objectKey} error=${error instanceof Error ? error.message : "unknown"}`);
      return null;
    }
  }

  return asset.url;
}

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const type = request.nextUrl.searchParams.get("type");
  const targetType = normalizeTargetType(type);
  const favorites = await prisma.favorite.findMany({
    where: { userId: user!.id, ...(targetType ? { targetType } : {}) },
    orderBy: { createdAt: "desc" }
  });

  const imageIds = favorites.filter((item) => item.targetType === "image").map((item) => item.targetId);
  const chatIds = favorites.filter((item) => item.targetType === "chat").map((item) => item.targetId);
  const model3DIds = favorites.filter((item) => item.targetType === "model3d").map((item) => item.targetId);

  const [images, chats, model3DGenerations] = await Promise.all([
    imageIds.length
      ? prisma.imageGeneration.findMany({
          where: { id: { in: imageIds }, userId: user!.id },
          include: {
            assets: {
              where: { sourceType: "generated" },
              orderBy: { index: "asc" }
            }
          }
        })
      : Promise.resolve([]),
    chatIds.length
      ? prisma.chatConversation.findMany({
          where: { id: { in: chatIds }, userId: user!.id },
          include: {
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { content: true }
            }
          }
        })
      : Promise.resolve([]),
    model3DIds.length
      ? prisma.model3DGeneration.findMany({
          where: { taskId: { in: model3DIds }, userId: user!.id }
        })
      : Promise.resolve([])
  ]);

  const imageMap = new Map(
    await Promise.all(
      images.map(async (generation) => {
        const urls = (await Promise.all(generation.assets.map(resolveAsset))).filter((url): url is string => Boolean(url));
        const finalPrompt = generation.finalPrompt || generation.prompt;
        return [
          generation.id,
          {
            favoriteId: "",
            targetId: generation.id,
            taskId: generation.id,
            type: "image" as const,
            title: getTitle(finalPrompt, "图片生成"),
            prompt: generation.prompt,
            finalPrompt,
            failureReason: generation.failureReason,
            model: generation.model,
            status: mapStatus(generation.status, urls.length > 0),
            ratio: generation.aspectRatio,
            resolution: generation.resolution,
            style: generation.style || "默认",
            createdAt: generation.createdAt.toISOString(),
            updatedAt: generation.updatedAt.toISOString(),
            images: urls,
            thumbnailUrl: urls[0] || null
          }
        ] as const;
      })
    )
  );

  const chatMap = new Map(
    chats.map((conversation) => [
      conversation.id,
      {
        favoriteId: "",
        targetId: conversation.id,
        taskId: conversation.id,
        type: "chat" as const,
        title: conversation.title,
        prompt: conversation.messages[0]?.content || "暂无消息摘要",
        model: conversation.model,
        status: "活跃",
        ratio: "-",
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        thumbnailUrl: null
      }
    ])
  );

  const model3DMap = new Map(
    await Promise.all(
      model3DGenerations.map(async (generation) => [
        generation.taskId,
        {
          favoriteId: "",
          targetId: generation.taskId,
          taskId: generation.taskId,
          type: "model3d" as const,
          title: generation.title || "Nexus 3D Preview",
          prompt: generation.prompt,
          model: "nexus-3d-preview",
          status: generation.status === "succeeded" ? "已完成" : generation.status === "failed" ? "生成失败" : "生成中",
          failureReason: generation.errorMessage,
          ratio: "-",
          resolution: generation.textureQuality || "standard",
          createdAt: generation.createdAt.toISOString(),
          updatedAt: generation.updatedAt.toISOString(),
          thumbnailUrl: generation.previewImageObjectKey ? await storage.getPublicOrSignedUrl(generation.previewImageObjectKey).catch(() => generation.previewImageUrl) : generation.previewImageUrl
        }
      ] as const)
    )
  );

  const records = favorites
    .map((favorite) => {
      const record = favorite.targetType === "image" ? imageMap.get(favorite.targetId) : favorite.targetType === "model3d" ? model3DMap.get(favorite.targetId) : chatMap.get(favorite.targetId);
      return record ? { ...record, favoriteId: favorite.id, favoritedAt: favorite.createdAt.toISOString(), isFavorite: true } : null;
    })
    .filter(Boolean);

  return NextResponse.json({ records });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const body = (await request.json().catch(() => null)) as { targetType?: string; targetId?: string } | null;
  const targetType = normalizeTargetType(body?.targetType);
  const targetId = body?.targetId?.trim();

  if (!targetType || !targetId) return NextResponse.json({ message: "收藏参数不完整" }, { status: 400 });

  const exists = await assertTargetExists(user!.id, targetType, targetId);
  if (!exists) return NextResponse.json({ message: "记录不存在或无权访问" }, { status: 404 });

  const favorite = await prisma.favorite.upsert({
    where: { userId_targetType_targetId: { userId: user!.id, targetType, targetId } },
    update: {},
    create: { userId: user!.id, targetType, targetId }
  });

  return NextResponse.json({ favorite });
}

export async function DELETE(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const search = request.nextUrl.searchParams;
  const targetType = normalizeTargetType(search.get("targetType"));
  const targetId = search.get("targetId")?.trim();

  if (!targetType || !targetId) return NextResponse.json({ message: "收藏参数不完整" }, { status: 400 });

  await prisma.favorite.deleteMany({ where: { userId: user!.id, targetType, targetId } });

  return NextResponse.json({ ok: true });
}
