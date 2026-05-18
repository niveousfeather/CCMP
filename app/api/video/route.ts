import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeErrorLog } from "@/lib/error-log";
import { checkAndConsumeQuota } from "@/lib/quota";
import * as storage from "@/lib/storage";
import { getVideoModelCapability, isSupportedVideoDuration, isSupportedVideoResolution, JIMENG_VIDEO_MODEL } from "@/lib/video/config";
import { enqueueVideoGenerationTask } from "@/lib/video/tasks";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedImageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function isAllowedImage(file: File) {
  return allowedImageExtensions.has(getExtension(file.name)) && (!file.type || allowedImageTypes.has(file.type));
}

function getDatePath() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function getPubliclyReachableUrl(url: string | null) {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  return null;
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const formData = await request.formData();
  const prompt = String(formData.get("prompt") || "").trim();
  const model = String(formData.get("model") || JIMENG_VIDEO_MODEL);
  const resolution = String(formData.get("resolution") || "720P");
  const duration = String(formData.get("duration") || "5s");
  const ratio = String(formData.get("ratio") || "16:9");
  const image = formData.get("image");
  const imageFile = image instanceof File ? image : null;

  if (!prompt) return jsonError("INVALID_PROMPT", "请输入视频生成提示词。", 400);
  if (!getVideoModelCapability(model)) return jsonError("INVALID_MODEL", "当前视频模型不可用。", 400);
  if (!isSupportedVideoResolution(model, resolution)) return jsonError("UNSUPPORTED_RESOLUTION", "当前模型暂不支持该分辨率。", 400);
  if (!isSupportedVideoDuration(model, duration)) return jsonError("UNSUPPORTED_DURATION", "当前模型仅支持 5 秒或 10 秒视频。", 400);

  let imageUrl: string | null = null;
  let imageObjectKey: string | null = null;

  if (imageFile) {
    if (!isAllowedImage(imageFile)) return jsonError("UNSUPPORTED_IMAGE_TYPE", "仅支持 jpg、jpeg、png、webp 图片。", 400);
    if (imageFile.size > MAX_IMAGE_SIZE) return jsonError("IMAGE_TOO_LARGE", "图片过大，请压缩后重试。", 400);

    const extension = getExtension(imageFile.name) || "png";
    const key = `users/${user!.id}/video-uploads/${getDatePath()}/${randomUUID()}.${extension}`;
    try {
      const uploadResult = await storage.uploadFile({
        key,
        file: imageFile,
        contentType: imageFile.type || "image/png"
      });
      imageObjectKey = uploadResult.key;
      imageUrl = getPubliclyReachableUrl(await storage.getPublicOrSignedUrl(uploadResult.key)) || getPubliclyReachableUrl(uploadResult.url);
    } catch (error) {
      await writeErrorLog({
        userId: user!.id,
        route: "/api/video",
        method: "POST",
        status: 500,
        code: "REFERENCE_UPLOAD_FAILED",
        provider: "storage",
        message: error instanceof Error ? error.message : "Video reference upload failed."
      });
      console.error(`[video] reference_upload_failed error=${error instanceof Error ? error.message : "unknown"}`);
      return jsonError("REFERENCE_UPLOAD_FAILED", "参考图片上传失败，请稍后重试。", 500);
    }

    if (!imageUrl) {
      return jsonError("REFERENCE_IMAGE_UNREACHABLE", "参考图片需要可被视频模型访问，请配置 OSS 后重试。", 400);
    }
  }

  const quotaResult = await checkAndConsumeQuota(user!.id, "video");
  if (!quotaResult.ok) {
    return NextResponse.json(quotaResult, { status: 429 });
  }

  const generation = await prisma.videoGeneration.create({
    data: {
      userId: user!.id,
      prompt,
      imageUrl,
      imageObjectKey,
      model,
      resolution,
      duration,
      ratio,
      status: "pending"
    }
  });

  console.info(`[video] generation_id=${generation.id} task_created model=${model} resolution=${resolution}`);
  setTimeout(() => {
    enqueueVideoGenerationTask(generation.id);
  }, 0);

  return NextResponse.json({
    task: {
      userId: generation.userId,
      taskId: generation.id,
      type: "video",
      title: "视频生成",
      prompt: generation.prompt,
      status: "生成中",
      model: generation.model,
      resolution: generation.resolution,
      duration: generation.duration,
      ratio: generation.ratio,
      imageUrl: generation.imageUrl,
      videoUrl: null,
      coverUrl: null,
      errorMessage: null,
      createdAt: generation.createdAt.toISOString(),
      updatedAt: generation.updatedAt.toISOString()
    }
  });
}
