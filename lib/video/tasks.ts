import { prisma } from "@/lib/db";
import { enqueueGenerationExecution } from "@/lib/generation/concurrency";
import {
  getGenerationRetryDelayMs,
  getGenerationRetryNotice,
  isRetryableGenerationError,
  shouldRetryGenerationError
} from "@/lib/generation/retry";
import * as storage from "@/lib/storage";
import { getVideoModelCapability } from "@/lib/video/config";
import { queryVolcVideoTask, submitVolcVideoTask } from "@/lib/video/volcengine";

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_MS = 12 * 60_000;
const MAX_VIDEO_DOWNLOAD_BYTES = 200 * 1024 * 1024;

export function mapVideoStatus(status: string) {
  if (status === "succeeded") return "已完成";
  if (status === "failed") return "生成失败";
  return "生成中";
}

export function enqueueVideoGenerationTask(generationId: string) {
  enqueueGenerationExecution("video", generationId, () => runVideoGenerationTask(generationId));
}

function getDatePath() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function getExtensionFromUrl(url: string, fallback: string) {
  try {
    const match = new URL(url).pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    return match?.[1]?.toLowerCase() || fallback;
  } catch {
    return fallback;
  }
}

async function fetchRemoteAsset(url: string, expectedPrefix: "video/" | "image/") {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Remote asset fetch failed: ${response.status}`);

  const contentType = response.headers.get("content-type") || (expectedPrefix === "video/" ? "video/mp4" : "image/jpeg");
  if (!contentType.toLowerCase().startsWith(expectedPrefix)) {
    throw new Error(`Unexpected remote asset content type: ${contentType}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_VIDEO_DOWNLOAD_BYTES) throw new Error("Remote video file is too large");

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_VIDEO_DOWNLOAD_BYTES) throw new Error("Remote video file is too large");
  return { buffer, contentType };
}

async function persistRemoteAsset({ url, key, expectedPrefix }: { url: string; key: string; expectedPrefix: "video/" | "image/" }) {
  const asset = await fetchRemoteAsset(url, expectedPrefix);
  const uploadResult = await storage.uploadBuffer({
    key,
    buffer: asset.buffer,
    contentType: asset.contentType
  });
  const resolvedUrl = await storage.getPublicOrSignedUrl(uploadResult.key).catch(() => uploadResult.url);
  return { objectKey: uploadResult.key, url: resolvedUrl || uploadResult.url || url };
}

async function persistVideoResultAssets(generation: { id: string; userId: string }, result: { videoUrl: string; coverUrl?: string | null }) {
  const datePath = getDatePath();
  const videoExtension = getExtensionFromUrl(result.videoUrl, "mp4");
  const videoAsset = await persistRemoteAsset({
    url: result.videoUrl,
    key: `users/${generation.userId}/videos/${datePath}/${generation.id}.${videoExtension}`,
    expectedPrefix: "video/"
  });

  let coverAsset: { objectKey: string; url: string } | null = null;
  if (result.coverUrl) {
    try {
      const coverExtension = getExtensionFromUrl(result.coverUrl, "jpg");
      coverAsset = await persistRemoteAsset({
        url: result.coverUrl,
        key: `users/${generation.userId}/video-covers/${datePath}/${generation.id}.${coverExtension}`,
        expectedPrefix: "image/"
      });
    } catch (error) {
      console.error(`[video:task] cover_persist_failed generationId=${generation.id} error=${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  console.info(`[video:task] result_assets_persisted generationId=${generation.id} videoKey=${videoAsset.objectKey}`);
  return { videoAsset, coverAsset };
}

export async function refreshVideoTask(generationId: string, userId: string) {
  const generation = await prisma.videoGeneration.findFirst({
    where: { id: generationId, userId }
  });
  if (!generation || generation.status === "succeeded" || generation.status === "failed") {
    return generation;
  }

  if (!generation.taskId && isRecoverableQueuedStatus(generation.status)) {
    enqueueVideoGenerationTask(generation.id);
    return generation;
  }
  if (!generation.taskId) return generation;

  const capability = getVideoModelCapability(generation.model);
  const result = await queryVolcVideoTask(generation.taskId, generation.imageUrl ? capability?.imageReqKey : capability?.textReqKey);
  if ((result.status === "succeeded" || result.videoUrl) && result.videoUrl) {
    const assets = await persistVideoResultAssets(generation, { videoUrl: result.videoUrl, coverUrl: result.coverUrl });
    return prisma.videoGeneration.update({
      where: { id: generation.id },
      data: {
        status: "succeeded",
        resultVideoUrl: assets.videoAsset.url,
        resultVideoObjectKey: assets.videoAsset.objectKey,
        coverImageUrl: assets.coverAsset?.url || result.coverUrl || null,
        coverImageObjectKey: assets.coverAsset?.objectKey || null,
        errorMessage: null
      }
    });
  }

  if (result.status === "failed") {
    return prisma.videoGeneration.update({
      where: { id: generation.id },
      data: {
        status: "failed",
        errorMessage: result.errorMessage || "视频生成失败，请稍后重试。"
      }
    });
  }

  return generation;
}

function isRecoverableQueuedStatus(status: string) {
  return status === "queued" || status === "pending" || status === "retrying";
}

async function pollVideoTask(generationId: string, taskId: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < MAX_POLL_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const current = await prisma.videoGeneration.findUnique({ where: { id: generationId } });
    if (!current || current.status === "succeeded" || current.status === "failed") return;

    try {
      const capability = getVideoModelCapability(current.model);
      const result = await queryVolcVideoTask(taskId, current.imageUrl ? capability?.imageReqKey : capability?.textReqKey);
      if ((result.status === "succeeded" || result.videoUrl) && result.videoUrl) {
        const assets = await persistVideoResultAssets(current, { videoUrl: result.videoUrl, coverUrl: result.coverUrl });
        await prisma.videoGeneration.update({
          where: { id: generationId },
          data: {
            status: "succeeded",
            resultVideoUrl: assets.videoAsset.url,
            resultVideoObjectKey: assets.videoAsset.objectKey,
            coverImageUrl: assets.coverAsset?.url || result.coverUrl || null,
            coverImageObjectKey: assets.coverAsset?.objectKey || null,
            errorMessage: null
          }
        });
        return;
      }

      if (result.status === "failed") {
        await prisma.videoGeneration.update({
          where: { id: generationId },
          data: { status: "failed", errorMessage: result.errorMessage || "视频生成失败，请稍后重试。" }
        });
        return;
      }
    } catch (error) {
      console.error(`[video:task] poll_failed generationId=${generationId} error=${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  await prisma.videoGeneration.update({
    where: { id: generationId },
    data: { status: "failed", errorMessage: "视频生成超时，请稍后重试。" }
  });
}

export async function runVideoGenerationTask(generationId: string, attempt = 0) {
  const generation = await prisma.videoGeneration.findUnique({ where: { id: generationId } });
  if (!generation) return;

  try {
    await prisma.videoGeneration.update({ where: { id: generationId }, data: { status: "processing", errorMessage: null } });
    const taskId = await submitVolcVideoTask({
      model: generation.model,
      prompt: generation.prompt,
      resolution: generation.resolution,
      duration: generation.duration || undefined,
      ratio: generation.ratio || undefined,
      imageUrl: generation.imageUrl
    });
    await prisma.videoGeneration.update({ where: { id: generationId }, data: { taskId, status: "processing" } });
    console.info(`[video:task] submit_success generationId=${generationId} taskId=${taskId.slice(0, 8)}...`);
    await pollVideoTask(generationId, taskId);
  } catch (error) {
    if (isRetryableGenerationError(error) && shouldRetryGenerationError(error, attempt, "video")) {
      const notice = getGenerationRetryNotice("video", attempt);
      const delayMs = getGenerationRetryDelayMs("video", attempt, error);
      await prisma.videoGeneration.update({
        where: { id: generationId },
        data: { errorMessage: notice, status: "retrying" }
      });
      console.warn(`[video:task] retry_scheduled generationId=${generationId} attempt=${attempt + 1} delayMs=${delayMs}`);
      setTimeout(() => {
        enqueueGenerationExecution("video", generationId, () => runVideoGenerationTask(generationId, attempt + 1));
      }, delayMs);
      return;
    }

    console.error(`[video:task] execution_failed generationId=${generationId} error=${error instanceof Error ? error.message : "unknown"}`);
    await prisma.videoGeneration.update({
      where: { id: generationId },
      data: { status: "failed", errorMessage: error instanceof Error ? error.message : "视频生成失败，请稍后重试。" }
    });
  }
}
