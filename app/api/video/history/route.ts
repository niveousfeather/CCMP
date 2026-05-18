import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as storage from "@/lib/storage";
import { mapVideoStatus } from "@/lib/video/tasks";

function getTitle(prompt: string) {
  const compact = prompt.replace(/\s+/g, " ").trim();
  return compact.length > 24 ? `${compact.slice(0, 24)}...` : compact || "视频生成";
}

async function resolveUrl(objectKey: string | null | undefined, url: string | null | undefined) {
  if (objectKey) {
    try {
      return await storage.getPublicOrSignedUrl(objectKey);
    } catch (error) {
      console.error(`[video:history] signed_url_failed key=${objectKey} error=${error instanceof Error ? error.message : "unknown"}`);
    }
  }
  return url || null;
}

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;

  const generations = await prisma.videoGeneration.findMany({
    where: { userId: user!.id },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  const history = await Promise.all(
    generations.map(async (generation) => ({
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
    }))
  );

  return NextResponse.json({ history });
}
