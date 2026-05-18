export type ImageProvider = "xheai" | "subrouter" | "jimeng";

export type ImageModelCapability = {
  id: string;
  label: string;
  provider: ImageProvider;
  providerModel: string;
  apiMode?: "openai" | "gemini_native";
  enabled: boolean;
  disabledReason?: string;
  supportsImageUpload: boolean;
  supportsReferenceImage: boolean;
  defaultAspectRatio: string;
  version: string;
};

export const imageModelCapabilities = [
  {
    id: "gpt-image-2",
    label: "Nexus Image2",
    provider: "subrouter",
    providerModel: "gpt-image-2",
    apiMode: "openai",
    enabled: true,
    supportsImageUpload: true,
    supportsReferenceImage: true,
    defaultAspectRatio: "16:9",
    version: "2"
  },
  {
    id: "gemini-3-pro-image-preview",
    label: "Nexus nano PRO",
    provider: "xheai",
    providerModel: "gemini-3.1-flash-image-preview",
    apiMode: "gemini_native",
    enabled: false,
    disabledReason: "第三方模型通道暂不可用",
    supportsImageUpload: true,
    supportsReferenceImage: true,
    defaultAspectRatio: "16:9",
    version: "3-pro"
  },
  {
    id: "jimeng-image-2.1",
    label: "Nexus Image mini2",
    provider: "jimeng",
    providerModel: "jimeng_high_aes_general_v21_L",
    apiMode: "openai",
    enabled: true,
    supportsImageUpload: false,
    supportsReferenceImage: false,
    defaultAspectRatio: "16:9",
    version: "2.1"
  }
] as const satisfies readonly ImageModelCapability[];

export const selectableImageModels = imageModelCapabilities;

const legacyModelMap: Record<string, string> = {
  "gpt-image-2-all": "gpt-image-2",
  "nano-banana-2": "gemini-3-pro-image-preview"
};

export function normalizeImageModelId(model: string) {
  return legacyModelMap[model] || model;
}

export function getImageModelCapability(model: string) {
  const normalized = normalizeImageModelId(model);
  return imageModelCapabilities.find((item) => item.id === normalized && item.enabled) || null;
}

export function isSelectableImageModel(model: string) {
  return Boolean(getImageModelCapability(model));
}

export function getImageModelLabel(model: string) {
  const normalized = normalizeImageModelId(model);
  const capability = imageModelCapabilities.find((item) => item.id === normalized);
  return capability?.label || model;
}
