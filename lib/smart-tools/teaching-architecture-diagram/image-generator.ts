import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { TeachingArchitectureImageError } from "@/lib/smart-tools/teaching-architecture-diagram/image-errors";
import { generateTeachingArchitectureImageWithProvider } from "@/lib/smart-tools/teaching-architecture-diagram/image-provider";
import {
  buildTeachingArchitectureImagePrompt,
  buildTeachingArchitectureImageRevisionPrompt,
  chooseTeachingArchitectureVisualPreset,
  type TeachingArchitectureVisualPreset
} from "@/lib/smart-tools/teaching-architecture-diagram/prompts";
import type { TeachingArchitectureBlueprint } from "@/lib/smart-tools/teaching-architecture-diagram/types";

export type TeachingArchitectureImageGenerationResult = {
  imagePath: string;
  provider: string;
  model: string;
  width: number;
  height: number;
  durationMs: number;
  visualPreset: TeachingArchitectureVisualPreset;
};

export async function generateTeachingArchitectureImage(input: {
  taskId: string;
  blueprint: TeachingArchitectureBlueprint;
  imagePrompt?: string;
  visualPreset?: TeachingArchitectureVisualPreset;
  outputPath: string;
  signal: AbortSignal;
  onProviderRequestStart?: () => void;
}): Promise<TeachingArchitectureImageGenerationResult> {
  const startedAt = Date.now();
  const visualPreset = input.visualPreset || chooseTeachingArchitectureVisualPreset(input.blueprint);
  const prompt =
    input.imagePrompt ||
    buildTeachingArchitectureImagePrompt({
      blueprint: input.blueprint,
      visualPreset
    });
  const result = await generateTeachingArchitectureImageWithProvider({
    taskId: input.taskId,
    prompt,
    aspectRatio: input.blueprint.visualPlan.aspectRatio,
    size: input.blueprint.visualPlan.size,
    orientation: input.blueprint.visualPlan.orientation,
    signal: input.signal,
    onProviderRequestStart: input.onProviderRequestStart
  });

  const buffer = result.image.b64_json
    ? Buffer.from(result.image.b64_json, "base64")
    : result.image.url
      ? await fetchImageBuffer(result.image.url, input.signal)
      : null;

  if (!buffer || !isPngLike(buffer)) {
    throw new TeachingArchitectureImageError("IMAGE_PROVIDER_BAD_RESPONSE", "图片生成服务未返回有效 PNG 图片。", {
      retryable: true
    });
  }

  await mkdir(path.dirname(input.outputPath), { recursive: true });
  await writeFile(input.outputPath, buffer);

  return {
    imagePath: input.outputPath,
    provider: result.provider,
    model: result.model,
    width: result.width,
    height: result.height,
    durationMs: Date.now() - startedAt,
    visualPreset
  };
}

export async function reviseTeachingArchitectureImage(input: {
  taskId: string;
  blueprint: TeachingArchitectureBlueprint;
  instruction: string;
  sourceImagePath?: string;
  previousPrompt?: string;
  visualPreset?: TeachingArchitectureVisualPreset;
  outputPath: string;
  promptOutputPath?: string;
  signal: AbortSignal;
  onProviderRequestStart?: () => void;
}): Promise<TeachingArchitectureImageGenerationResult> {
  const startedAt = Date.now();
  const visualPreset = input.visualPreset || chooseTeachingArchitectureVisualPreset(input.blueprint);
  const prompt = buildTeachingArchitectureImageRevisionPrompt({
    blueprint: input.blueprint,
    visualPreset,
    instruction: input.instruction,
    previousPrompt: input.previousPrompt
  });
  const sourceImage = input.sourceImagePath ? await createImageEditFile(input.sourceImagePath) : null;

  const result = await generateTeachingArchitectureImageWithProvider({
    taskId: `${input.taskId}-revision`,
    prompt,
    aspectRatio: input.blueprint.visualPlan.aspectRatio,
    size: input.blueprint.visualPlan.size,
    orientation: input.blueprint.visualPlan.orientation,
    sourceImage,
    signal: input.signal,
    onProviderRequestStart: input.onProviderRequestStart
  });

  const buffer = result.image.b64_json
    ? Buffer.from(result.image.b64_json, "base64")
    : result.image.url
      ? await fetchImageBuffer(result.image.url, input.signal)
      : null;

  if (!buffer || !isPngLike(buffer)) {
    throw new TeachingArchitectureImageError("IMAGE_PROVIDER_BAD_RESPONSE", "图片生成服务未返回有效 PNG 图片。", {
      retryable: true
    });
  }

  await mkdir(path.dirname(input.outputPath), { recursive: true });
  await writeFile(input.outputPath, buffer);
  if (input.promptOutputPath) await writeFile(input.promptOutputPath, prompt, "utf8");

  return {
    imagePath: input.outputPath,
    provider: result.provider,
    model: result.model,
    width: result.width,
    height: result.height,
    durationMs: Date.now() - startedAt,
    visualPreset
  };
}

async function createImageEditFile(filePath: string) {
  const buffer = await readFile(filePath);
  return new File([new Uint8Array(buffer)], "output.png", { type: "image/png" });
}

async function fetchImageBuffer(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new TeachingArchitectureImageError("IMAGE_PROVIDER_BAD_RESPONSE", "图片生成服务返回的图片地址不可用。", {
      retryable: true,
      status: response.status
    });
  }
  const contentType = response.headers.get("content-type") || "";
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!contentType.includes("image/") && !isPngLike(buffer)) {
    throw new TeachingArchitectureImageError("IMAGE_PROVIDER_BAD_RESPONSE", "图片生成服务返回体不是图片。", {
      retryable: true
    });
  }
  return buffer;
}

function isPngLike(buffer: Buffer) {
  return buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
}
