import { selectableImageModels } from "@/lib/image/config";

export type ImageTaskStatus = "已完成" | "生成中" | "生成失败" | "生成超时";
export type ImageMode = "text-to-image" | "image-to-image";
export type ImageResolution = "1K" | "2K" | "4K";

export type ImageTask = {
  userId: string;
  taskId: string;
  type: "image";
  mode: ImageMode;
  title: string;
  prompt: string;
  finalPrompt?: string | null;
  failureReason?: string | null;
  status: ImageTaskStatus | string;
  style: string;
  ratio: string;
  resolution?: ImageResolution;
  count: number;
  images?: string[];
  isFavorite?: boolean;
  favoriteId?: string;
  model: string;
  visualIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type ImageResult = {
  id: string;
  taskId: string;
  prompt: string;
  finalPrompt?: string | null;
  revisedPrompt?: string | null;
  title: string;
  style: string;
  ratio: string;
  resolution?: ImageResolution;
  model: string;
  visualIndex: number;
  liked: boolean;
  createdAt: string;
  url?: string | null;
  b64_json?: string | null;
  mode?: ImageMode;
  status?: ImageTaskStatus | string;
  failureReason?: string | null;
};

export type UploadedImage = {
  file: File;
  previewUrl: string;
  name: string;
  size: number;
  type: string;
};

export const defaultStyle = "默认";
export const styleOptions = [defaultStyle, "未来建筑", "产品海报", "极简界面", "品牌视觉"] as const;
export const ratioOptions = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const;
export const resolutionOptions = ["1K", "2K", "4K"] as const;
export const modelOptions = selectableImageModels;

export const initialPrompt = "生成一张千禧年城市街景。";

export const imageHistoryTasks: ImageTask[] = [];

export const initialImageResults: ImageResult[] = [];
