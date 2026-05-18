import type { Model3DApiFeature, Model3DExportFormat, Model3DExportResolution } from "@/components/model3d/model3d-api-features";
import type { Model3DGenerationProfile, Model3DMode, Model3DQuality, Model3DTextureQuality, Model3DTopology } from "@/components/model3d/model3d-data";

export type NexusModel3DImageRef = {
  label?: string;
  objectKey?: string | null;
  token: string;
  tripoToken?: boolean;
  url?: string;
  storageUrl?: string;
  fileType?: string;
};

export type NexusModel3DEditOptions = {
  color?: string;
  maskRef?: string;
  mode?: "generate" | "paint";
  strength?: number;
};

export type NexusModel3DAnimationOptions = {
  motionId?: string;
  rigModel?: string;
};

export type NexusModel3DCreateRequest = {
  animation?: NexusModel3DAnimationOptions;
  edit?: NexusModel3DEditOptions;
  faceCount?: number | "auto";
  generateParts?: boolean;
  imageAutoOptimize?: boolean;
  feature: Model3DApiFeature | "animation-apply" | "import-model" | "part-complete" | "retopo";
  imageRefs?: NexusModel3DImageRef[];
  mode?: Model3DMode;
  modelProfile?: Model3DGenerationProfile;
  model?: string;
  pbr?: {
    enabled?: boolean;
  };
  prompt?: string;
  quality?: Model3DQuality;
  sourceModelUrl?: string;
  sourceTaskId?: string;
  texture?: {
    enabled?: boolean;
    inputMode?: "image" | "multi" | "text";
    quality?: Model3DTextureQuality;
  };
  topology?: Model3DTopology;
};

export type NexusModel3DExportRequest = {
  bottomCenterPivot: boolean;
  fileName: string;
  format: Model3DExportFormat;
  resolution: Model3DExportResolution;
  sourceTaskId: string;
};

export type TripoModel3DTaskPayload = {
  type: string;
  [key: string]: unknown;
};

type TripoFileRef = {
  file_token?: string;
  object?: {
    bucket: string;
    key: string;
  };
  type: string;
  url?: string;
};

const DEFAULT_TEXTURE_MODEL_VERSION = "v2.5-20250123";
const HIGH_POLY_TO_LOW_POLY_VERSION = "P-v2.0-20251225";
const MESH_EDIT_MODEL_VERSION = "v1.0-20250506";
const DEFAULT_MODEL_VERSION = "v2.5-20250123";
const SUPPORTED_MODEL_VERSIONS = new Set(["P1-20260311", "v3.0-20250812", "v2.5-20250123", "v2.0-20240919", "v1.4-20240625"]);

export function buildTripoTaskPayload(request: NexusModel3DCreateRequest, defaultModelVersion: string): TripoModel3DTaskPayload {
  switch (request.feature) {
    case "generate-model":
      return buildGenerationPayload(request, defaultModelVersion);
    case "part-split":
      return withOriginalTask("mesh_segmentation", request, {
        model_version: MESH_EDIT_MODEL_VERSION
      });
    case "part-complete":
      return withOriginalTask("mesh_completion", request, {
        model_version: MESH_EDIT_MODEL_VERSION
      });
    case "retopo":
      return withOriginalTask("highpoly_to_lowpoly", request, {
        bake: true,
        face_limit: toFaceLimit(request.faceCount),
        model_version: HIGH_POLY_TO_LOW_POLY_VERSION,
        quad: request.topology === "quad"
      });
    case "texture-generate":
      return buildTexturePayload(request, defaultModelVersion, {
        pbr: request.pbr?.enabled,
        texture: true
      });
    case "texture-edit":
      return buildTexturePayload(request, defaultModelVersion, {
        pbr: request.pbr?.enabled,
        texture: true
      });
    case "texture-upscale":
      return buildConvertPayload(request, {
        bake: true,
        format: "GLTF",
        texture_size: toTextureSize(request.texture?.quality)
      });
    case "pbr-material":
      return buildTexturePayload(request, defaultModelVersion, {
        pbr: true,
        texture: true
      });
    case "animation-rig":
      return withOriginalTask("animate_rig", request, {
        out_format: "glb",
        rig_type: request.animation?.rigModel || "biped",
        spec: "tripo"
      });
    case "animation-apply":
      return withOriginalTask("animate_retarget", request, {
        animation: toAnimationPreset(request.animation?.motionId),
        out_format: "glb"
      });
    case "import-model":
      return buildImportPayload(request);
    case "export-model":
      throw new Error("Use buildTripoExportPayload for export-model requests.");
    default:
      return assertNever(request.feature);
  }
}

export function buildTripoExportPayload(request: NexusModel3DExportRequest): TripoModel3DTaskPayload {
  return stripUndefined({
    type: "convert_model",
    format: toTripoExportFormat(request.format),
    original_model_task_id: request.sourceTaskId,
    pivot_to_center_bottom: request.bottomCenterPivot || undefined,
    texture_size: toTripoTextureSize(request.resolution)
  });
}

function buildGenerationPayload(request: NexusModel3DCreateRequest, defaultModelVersion: string): TripoModel3DTaskPayload {
  const modelVersion = normalizeModelVersion(request.model || defaultModelVersion);
  const shared = buildGenerationSharedParams(request, modelVersion);
  const geometryQuality = isP1Model(modelVersion) ? undefined : toGeometryQuality(request.quality);

  switch (request.mode) {
    case "image-to-3d":
      return stripUndefined({
        ...shared,
        type: "image_to_model",
        enable_image_autofix: request.imageAutoOptimize || undefined,
        file: toFileRef(request.imageRefs?.[0]),
        geometry_quality: geometryQuality,
        orientation: "default",
        smart_low_poly: !isP1Model(modelVersion) && request.modelProfile === "smart-mesh" ? true : undefined
      });
    case "multi-view-to-3d":
      return stripUndefined({
        ...shared,
        type: "multiview_to_model",
        files: buildMultiviewFiles(request.imageRefs),
        geometry_quality: geometryQuality,
        orientation: "default"
      });
    case "batch-image-to-3d":
      return stripUndefined({
        ...shared,
        type: "image_to_model",
        enable_image_autofix: request.imageAutoOptimize || undefined,
        file: toFileRef(request.imageRefs?.[0]),
        geometry_quality: geometryQuality,
        orientation: "default"
      });
    case "text-to-3d":
    default:
      return stripUndefined({
        ...shared,
        type: "text_to_model",
        geometry_quality: geometryQuality,
        prompt: requirePrompt(request.prompt)
      });
  }
}

function buildGenerationSharedParams(request: NexusModel3DCreateRequest, modelVersion: string) {
  const pbr = Boolean(request.pbr?.enabled);
  const texture = Boolean(request.texture?.enabled);
  const textureQuality = toTextureQuality(request.texture?.quality);
  const p1Model = isP1Model(modelVersion);
  const quad = request.topology === "quad" && !p1Model;
  const generateParts = Boolean(request.generateParts) && !texture && !pbr && !quad && !isP1Model(modelVersion);

  return stripUndefined({
    face_limit: toFaceLimit(request.faceCount),
    generate_parts: generateParts || undefined,
    model_version: modelVersion,
    pbr: pbr || undefined,
    quad: quad || undefined,
    texture: texture || undefined,
    texture_quality: texture && textureQuality !== "standard" ? textureQuality : undefined
  });
}

function buildTexturePayload(request: NexusModel3DCreateRequest, defaultModelVersion: string, options: { pbr?: boolean; texture?: boolean }) {
  const textureQuality = toTextureQuality(request.texture?.quality);
  const modelVersion = normalizeModelVersion(request.model || defaultModelVersion);
  return withOriginalTask("texture_model", request, {
    bake: true,
    model_version: toTextureModelVersion(modelVersion),
    pbr: options.pbr || undefined,
    texture: options.texture ?? true,
    texture_prompt: buildTexturePrompt(request),
    texture_quality: textureQuality !== "standard" ? textureQuality : undefined
  });
}

function buildTexturePrompt(request: NexusModel3DCreateRequest) {
  const text = request.prompt?.trim();
  const imageRefs = request.imageRefs?.map(toFileRef).filter(Boolean) as TripoFileRef[] | undefined;
  if (request.texture?.inputMode !== "text" && imageRefs?.length) {
    return stripUndefined({
      image: imageRefs[0],
      images: imageRefs.length > 1 ? imageRefs : undefined
    });
  }

  return stripUndefined({
    text: text || undefined,
  });
}

function buildConvertPayload(request: NexusModel3DCreateRequest, extra: Record<string, unknown>) {
  return withOriginalTask("convert_model", request, extra);
}

function buildImportPayload(request: NexusModel3DCreateRequest) {
  return stripUndefined({
    type: "import_model",
    file: toFileRef(request.imageRefs?.[0])
  });
}

function withOriginalTask(type: string, request: NexusModel3DCreateRequest, extra: Record<string, unknown> = {}): TripoModel3DTaskPayload {
  return stripUndefined({
    ...extra,
    type,
    original_model_task_id: request.sourceTaskId
  });
}

function buildMultiviewFiles(imageRefs: NexusModel3DImageRef[] | undefined) {
  if (!imageRefs?.length) return undefined;
  const labelsInOrder = ["front", "left", "back", "right"];
  const viewByLabel = new Map(imageRefs.map((image) => [normalizeViewLabel(image.label), image]));
  const orderedRefs = labelsInOrder.map((label) => viewByLabel.get(label)).filter(Boolean) as NexusModel3DImageRef[];
  if (orderedRefs.length === 4) return orderedRefs.map(toFileRef);
  return imageRefs.map(toFileRef);
}

function toFileRef(image: NexusModel3DImageRef | undefined): TripoFileRef | undefined {
  if (!image) return undefined;
  const type = normalizeFileType(image.fileType || image.url || image.token);
  if (image.tripoToken && image.token) return { type, file_token: image.token };
  if (isUsableUrl(image.url)) return { type, url: image.url };
  return { type, file_token: image.token };
}

function normalizeViewLabel(label: string | undefined) {
  const value = (label || "").trim().toLowerCase();
  const map: Record<string, string> = {
    back: "back",
    front: "front",
    left: "left",
    right: "right",
    "前视图": "front",
    "后视图": "back",
    "左视图": "left",
    "右视图": "right",
    "前": "front",
    "后": "back",
    "左": "left",
    "右": "right"
  };
  return map[value] || value;
}

function normalizeFileType(value: string | undefined) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("jpeg") || normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "jpeg";
  if (normalized.includes("webp") || normalized.endsWith(".webp")) return "webp";
  if (normalized.includes("png") || normalized.endsWith(".png")) return "png";
  if (normalized.endsWith(".fbx")) return "fbx";
  if (normalized.endsWith(".obj")) return "obj";
  if (normalized.endsWith(".stl")) return "stl";
  if (normalized.endsWith(".glb")) return "glb";
  if (normalized.endsWith(".gltf")) return "glb";
  return "png";
}

function normalizeModelVersion(value: string) {
  const normalized = value?.trim();
  return normalized && normalized !== "default" && SUPPORTED_MODEL_VERSIONS.has(normalized) ? normalized : DEFAULT_MODEL_VERSION;
}

function toTextureModelVersion(defaultModelVersion: string) {
  const normalized = normalizeModelVersion(defaultModelVersion);
  return ["v3.0-20250812", "v2.5-20250123", "v2.0-20240919"].includes(normalized) ? normalized : DEFAULT_TEXTURE_MODEL_VERSION;
}

function isP1Model(modelVersion: string) {
  return modelVersion === "P1-20260311";
}

function toTripoExportFormat(format: Model3DExportFormat) {
  return format === "GLB" ? "GLTF" : format;
}

function toTripoTextureSize(resolution: Model3DExportResolution) {
  switch (resolution) {
    case "512":
      return 512;
    case "1k":
      return 1024;
    case "2k":
      return 2048;
    case "4k":
      return 4096;
    default:
      return 4096;
  }
}

function toFaceLimit(faceCount: number | "auto" | undefined) {
  return typeof faceCount === "number" && faceCount > 0 ? faceCount : undefined;
}

function toTextureSize(quality: Model3DTextureQuality | undefined) {
  return quality === "hd" ? 4096 : 2048;
}

function toTextureQuality(quality: Model3DTextureQuality | undefined) {
  return quality === "hd" ? "detailed" : "standard";
}

function toGeometryQuality(quality: Model3DQuality | undefined) {
  return quality === "high" ? "detailed" : undefined;
}

function toAnimationPreset(value: string | undefined) {
  if (!value) return "preset:idle";
  return value.startsWith("preset:") ? value : `preset:${value}`;
}

function requirePrompt(value: string | undefined) {
  const prompt = value?.trim();
  if (!prompt) throw new Error("Text-to-model requires prompt.");
  return prompt;
}

function isUsableUrl(value: string | undefined) {
  return Boolean(value && /^https?:\/\//.test(value));
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported 3D task feature: ${String(value)}`);
}

