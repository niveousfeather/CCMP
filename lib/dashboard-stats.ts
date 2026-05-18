import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/session";
import * as storage from "@/lib/storage";
import { isPlatformOwnerAdmin } from "@/lib/auth";
import { getImageModelLabel } from "@/lib/image/config";
import { getUserDailyQuota } from "@/lib/quota";
import { getVideoModelDisplayName } from "@/lib/video/config";

export type DashboardMetric = {
  id: "chat" | "image" | "video" | "users";
  label: string;
  value: string;
  change: string;
  tone: "positive" | "neutral";
};

export type DashboardOverviewItem = {
  id: string;
  label: string;
  value: string;
  description: string;
};

export type DashboardRecentImage = {
  id: string;
  title: string;
  prompt: string;
  model: string;
  createdAt: string;
  thumbnailUrl: string | null;
};

export type DashboardRecentVideo = {
  id: string;
  title: string;
  prompt: string;
  model: string;
  status: string;
  createdAt: string;
  thumbnailUrl: string | null;
  videoUrl: string | null;
};

export type DashboardQuota = {
  role: string;
  imageDailyLimit: number;
  videoDailyLimit: number;
  model3DDailyLimit: number;
  imageUsedToday: number;
  videoUsedToday: number;
  model3DUsedToday: number;
  imageRemaining: number;
  videoRemaining: number;
  model3DRemaining: number;
};

export type DashboardStats = {
  scope: "admin" | "user";
  metrics: DashboardMetric[];
  overview: DashboardOverviewItem[];
  quota: DashboardQuota;
  recentImages: DashboardRecentImage[];
  recentVideos: DashboardRecentVideo[];
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatDate(value?: Date | null) {
  if (!value) return "暂无记录";
  return value.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function makeTitle(prompt: string) {
  const compact = prompt.replace(/\s+/g, " ").trim();
  return compact.length > 20 ? `${compact.slice(0, 20)}...` : compact || "图片生成";
}

function mostUsedModule(chatCount: number, imageCount: number, videoCount: number) {
  const modules = [
    { label: "智能对话", count: chatCount },
    { label: "图片生成", count: imageCount },
    { label: "视频生成", count: videoCount }
  ];
  const top = modules.sort((left, right) => right.count - left.count)[0];
  return top.count > 0 ? top.label : "暂无数据";
}

function mostUsedModel(models: string[]) {
  if (!models.length) return "暂无数据";
  const counts = new Map<string, number>();
  models.forEach((model) => counts.set(model, (counts.get(model) || 0) + 1));
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "暂无数据";
}

async function resolveGeneratedAsset(asset?: { url: string | null; objectKey: string | null }) {
  if (!asset) return null;
  if (asset.url && (asset.url.startsWith("/mock-storage/") || asset.url.startsWith("data:image/"))) return asset.url;

  if (asset.objectKey) {
    try {
      return await storage.getPublicOrSignedUrl(asset.objectKey);
    } catch (error) {
      console.error(`[dashboard] image_asset_url_resolve_failed key=${asset.objectKey} error=${error instanceof Error ? error.message : "unknown"}`);
      return null;
    }
  }

  return asset.url;
}

export async function getDashboardStats(user: SessionUser): Promise<DashboardStats> {
  const isAdmin = isPlatformOwnerAdmin(user);
  const ownWhere = isAdmin ? undefined : { userId: user.id };
  const recentOwnerWhere = { userId: user.id };

  const [
    conversationCount,
    imageGenerationCount,
    userCount,
    favoriteCount,
    latestConversation,
    latestImage,
    latestVideo,
    recentConversations,
    recentImagesRaw,
    videoGenerationCount,
    recentVideosRaw,
    quota
  ] = await Promise.all([
    prisma.chatConversation.count({ where: ownWhere }),
    prisma.imageGeneration.count({ where: ownWhere }),
    isAdmin ? prisma.user.count() : Promise.resolve(0),
    prisma.favorite.count({ where: isAdmin ? undefined : { userId: user.id } }),
    prisma.chatConversation.findFirst({ where: ownWhere, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.imageGeneration.findFirst({ where: ownWhere, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.videoGeneration.findFirst({ where: ownWhere, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.chatConversation.findMany({ where: ownWhere, orderBy: { updatedAt: "desc" }, take: 100, select: { model: true } }),
    prisma.imageGeneration.findMany({
      where: { ...recentOwnerWhere, status: { in: ["completed", "success"] }, assets: { some: { sourceType: "generated" } } },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        assets: {
          where: { sourceType: "generated" },
          orderBy: { index: "asc" },
          take: 1
        }
      }
    }),
    prisma.videoGeneration.count({ where: ownWhere }),
    prisma.videoGeneration.findMany({
      where: recentOwnerWhere,
      orderBy: { createdAt: "desc" },
      take: 4
    }),
    getUserDailyQuota(user.id)
  ]);

  const latestAt = [latestConversation?.updatedAt, latestImage?.updatedAt, latestVideo?.updatedAt]
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;
  const models = [...recentConversations.map((item) => item.model), ...recentImagesRaw.map((item) => item.model), ...recentVideosRaw.map((item) => item.model)];

  const recentImagesAll = await Promise.all(
    recentImagesRaw.map(async (generation) => {
      const thumbnailUrl = await resolveGeneratedAsset(generation.assets[0]);
      if (!thumbnailUrl) return null;
      const prompt = generation.finalPrompt || generation.prompt;
      return {
        id: generation.id,
        title: makeTitle(prompt),
        prompt,
        model: getImageModelLabel(generation.model),
        createdAt: formatDate(generation.createdAt),
        thumbnailUrl
      };
    })
  );
  const recentImages = recentImagesAll.filter(Boolean).slice(0, 4) as DashboardRecentImage[];
  const recentVideos: DashboardRecentVideo[] = recentVideosRaw.map((generation) => ({
    id: generation.id,
    title: makeTitle(generation.prompt),
    prompt: generation.prompt,
    model: getVideoModelDisplayName(generation.model),
    status: generation.status,
    createdAt: formatDate(generation.createdAt),
    thumbnailUrl: generation.coverImageUrl || generation.imageUrl || null,
    videoUrl: generation.resultVideoUrl
  }));

  const metrics: DashboardMetric[] = [
    { id: "chat", label: "总对话数", value: formatNumber(conversationCount), change: isAdmin ? "平台会话" : "我的会话", tone: "neutral" },
    {
      id: "image",
      label: "总图片生成数",
      value: formatNumber(imageGenerationCount),
      change: isAdmin ? "平台图片任务" : "我的图片任务",
      tone: "neutral"
    },
    {
      id: "video",
      label: "总视频生成数",
      value: formatNumber(videoGenerationCount),
      change: isAdmin ? "平台视频任务" : "我的视频任务",
      tone: "neutral"
    }
  ];

  if (isAdmin) {
    metrics.push({ id: "users", label: "当前用户数", value: formatNumber(userCount), change: "团队账号", tone: "neutral" });
  }

  return {
    scope: isAdmin ? "admin" : "user",
    metrics,
    quota,
    overview: [
      {
        id: "favorites",
        label: "总收藏数",
        value: formatNumber(favoriteCount),
        description: isAdmin ? "平台用户收藏的图片与对话" : "当前账号收藏的图片与对话"
      },
      {
        id: "latest",
        label: "最近一次创作",
        value: formatDate(latestAt),
        description: isAdmin ? "平台最近更新时间" : "你的最近更新时间"
      },
      {
        id: "module",
        label: "最常用模块",
        value: mostUsedModule(conversationCount, imageGenerationCount, videoGenerationCount),
        description: "按对话、图片和视频总量估算"
      },
      {
        id: "model",
        label: "最常用模型",
        value: mostUsedModel(models),
        description: "按最近记录估算"
      }
    ],
    recentImages,
    recentVideos
  };
}
