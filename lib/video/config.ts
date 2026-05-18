export const JIMENG_VIDEO_MODEL = "即梦AI-视频生成3.0 720P";

export const videoModelCapabilities = {
  [JIMENG_VIDEO_MODEL]: {
    providerModel: "jimeng-3.0-720p",
    supportedResolutions: ["720P"],
    supportedRatios: ["16:9", "9:16", "1:1", "4:3"],
    supportedDurations: ["5s", "10s"],
    textReqKey: "jimeng_t2v_v30",
    imageReqKey: "jimeng_i2v_first_v30"
  }
} as const;

export type VideoModelName = keyof typeof videoModelCapabilities;
export type VideoResolution = (typeof videoModelCapabilities)[VideoModelName]["supportedResolutions"][number] | "1080P";

export const videoModels = Object.keys(videoModelCapabilities) as VideoModelName[];
export const videoResolutions = ["720P", "1080P"] as const;
export const videoDurationOptions = ["4s", "5s", "8s", "10s", "12s", "15s"] as const;
export const videoRatioOptions = ["16:9", "9:16", "1:1", "4:3"] as const;

export function getVideoModelDisplayName(model: string) {
  if (model === JIMENG_VIDEO_MODEL || model === "jimeng-3.0-720p") return "Nexus Video3.0";
  return model;
}

export function getVideoModelCapability(model: string) {
  return videoModelCapabilities[model as VideoModelName] || null;
}

export function isSupportedVideoResolution(model: string, resolution: string) {
  const capability = getVideoModelCapability(model);
  return Boolean(capability?.supportedResolutions.includes(resolution as "720P"));
}

export function isSupportedVideoDuration(model: string, duration: string) {
  const capability = getVideoModelCapability(model);
  return Boolean(capability?.supportedDurations.includes(duration as "5s" | "10s"));
}
