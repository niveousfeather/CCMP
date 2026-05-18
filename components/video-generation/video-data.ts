import {
  JIMENG_VIDEO_MODEL,
  videoDurationOptions,
  videoModelCapabilities,
  videoModels,
  videoRatioOptions,
  videoResolutions
} from "@/lib/video/config";

export { JIMENG_VIDEO_MODEL };

export type VideoTaskStatus = "生成中" | "已完成" | "生成失败";

export type VideoTask = {
  userId: string;
  taskId: string;
  type: "video";
  title: string;
  prompt: string;
  status: VideoTaskStatus | string;
  rawStatus?: string;
  model: string;
  duration: string;
  ratio: string;
  resolution: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  coverUrl?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
};

export const videoModelOptions = videoModels;
export const videoResolutionOptions = videoResolutions;
export const durationOptions = videoDurationOptions;
export const ratioOptions = videoRatioOptions;
export const modelCapabilities = videoModelCapabilities;

export const initialVideoPrompt =
  "生成一段高端 AI 平台产品概念短片，黑白极简空间，镜头缓慢推进，展示统一工作台与未来感光影。";

export const defaultVideoTask: VideoTask = {
  userId: "current-user",
  taskId: "video-empty",
  type: "video",
  title: "视频生成",
  prompt: "",
  status: "生成中",
  model: JIMENG_VIDEO_MODEL,
  duration: "5s",
  ratio: "16:9",
  resolution: "720P",
  createdAt: "",
  updatedAt: ""
};
