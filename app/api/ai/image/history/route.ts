import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as storage from "@/lib/storage";

function getTitle(prompt: string) {
  const compact = prompt.replace(/\s+/g, " ").trim();
  return compact.length > 24 ? `${compact.slice(0, 24)}...` : compact || "图片生成";
}

function mapStatus(status: string, hasImages: boolean) {
  if ((status === "completed" || status === "success") && hasImages) return "已完成";
  if (status === "timeout") return "生成超时";
  if (status === "failed" || ((status === "completed" || status === "success") && !hasImages)) return "生成失败";
  return "生成中";
}

function isStableInlineOrLocalUrl(url: string | null) {
  return Boolean(url && (url.startsWith("/mock-storage/") || url.startsWith("data:image/")));
}

async function resolveAssetUrl(asset: { url: string | null; objectKey: string | null }) {
  if (isStableInlineOrLocalUrl(asset.url)) return asset.url;

  if (asset.objectKey) {
    try {
      return await storage.getPublicOrSignedUrl(asset.objectKey);
    } catch (error) {
      console.error(`[ai:image:history] asset_url_resolve_failed key=${asset.objectKey} error=${error instanceof Error ? error.message : "unknown"}`);
      return null;
    }
  }

  return asset.url;
}

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;

  const [generations, favorites] = await Promise.all([
    prisma.imageGeneration.findMany({
      where: { userId: user!.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        assets: {
          where: { sourceType: "generated" },
          orderBy: { index: "asc" }
        }
      }
    }),
    prisma.favorite.findMany({
      where: { userId: user!.id, targetType: "image" },
      select: { id: true, targetId: true }
    })
  ]);

  const favoriteMap = new Map(favorites.map((favorite) => [favorite.targetId, favorite.id]));

  const history = await Promise.all(
    generations.map(async (generation) => {
      const images = (await Promise.all(generation.assets.map(resolveAssetUrl))).filter((url): url is string => Boolean(url));
      const favoriteId = favoriteMap.get(generation.id);
      const finalPrompt = generation.finalPrompt || generation.prompt;
      const failureReason =
        generation.failureReason ||
        ((generation.status === "completed" || generation.status === "success") && images.length === 0 ? "图片资源签名失败或地址已失效。" : null);

      return {
        userId: generation.userId,
        taskId: generation.id,
        type: "image",
        mode: generation.mode,
        title: getTitle(finalPrompt),
        prompt: generation.prompt,
        finalPrompt,
        failureReason,
        status: mapStatus(generation.status, images.length > 0),
        model: generation.model,
        style: generation.style || "默认",
        ratio: generation.aspectRatio,
        resolution: generation.resolution,
        count: images.length,
        images,
        isFavorite: Boolean(favoriteId),
        favoriteId,
        createdAt: generation.createdAt.toISOString(),
        updatedAt: generation.updatedAt.toISOString()
      };
    })
  );

  return NextResponse.json({ history });
}
