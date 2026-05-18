import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as storage from "@/lib/storage";
import { mapVideoStatus, refreshVideoTask } from "@/lib/video/tasks";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function getTitle(prompt: string) {
  const compact = prompt.replace(/\s+/g, " ").trim();
  return compact.length > 24 ? `${compact.slice(0, 24)}...` : compact || "视频生成";
}

async function resolveUrl(objectKey: string | null | undefined, url: string | null | undefined) {
  if (objectKey) {
    try {
      return await storage.getPublicOrSignedUrl(objectKey);
    } catch (error) {
      console.error(`[video:task] signed_url_failed key=${objectKey} error=${error instanceof Error ? error.message : "unknown"}`);
    }
  }
  return url || null;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { user, response } = await requireUser();
  if (response) return response;
  const params = await context.params;

  const refreshed = await refreshVideoTask(params.id, user!.id).catch((error) => {
    console.error(`[video:task] refresh_failed id=${params.id} error=${error instanceof Error ? error.message : "unknown"}`);
    return null;
  });
  const generation =
    refreshed ||
    (await prisma.videoGeneration.findFirst({
      where: { id: params.id, userId: user!.id }
    }));

  if (!generation) return NextResponse.json({ code: "NOT_FOUND", message: "视频任务不存在。" }, { status: 404 });

  return NextResponse.json({
    task: {
      userId: generation.userId,
      taskId: generation.id,
      type: "video",
      title: getTitle(generation.prompt),
      prompt: generation.prompt,
      status: mapVideoStatus(generation.status),
      rawStatus: generation.status,
      model: generation.model,
      resolution: generation.resolution,
      duration: generation.duration || "5s",
      ratio: generation.ratio || "16:9",
      imageUrl: await resolveUrl(generation.imageObjectKey, generation.imageUrl),
      videoUrl: await resolveUrl(generation.resultVideoObjectKey, generation.resultVideoUrl),
      coverUrl: await resolveUrl(generation.coverImageObjectKey, generation.coverImageUrl),
      errorMessage: generation.errorMessage,
      createdAt: generation.createdAt.toISOString(),
      updatedAt: generation.updatedAt.toISOString()
    }
  });
}
