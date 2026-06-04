export type Model3DTaskStatus = "idle" | "queued" | "pending" | "processing" | "retrying" | "succeeded" | "failed";
export type Model3DMode = "image-to-3d" | "multi-view-to-3d" | "batch-image-to-3d" | "text-to-3d";
export type Model3DGenerationProfile = "high-precision" | "smart-mesh";
export type Model3DQuality = "standard" | "high";
export type Model3DTopology = "triangle" | "quad";
export type Model3DTextureQuality = "standard" | "hd";
export type Model3DSceneNodeType = "model" | "group" | "mesh";

export type Model3DSceneTransform = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

export type Model3DSceneNode = {
  children?: Model3DSceneNode[];
  id: string;
  meshCount: number;
  name: string;
  type: Model3DSceneNodeType;
};

export type Model3DSceneSelection = {
  id: string;
  meshCount: number;
  name: string;
  transform: Model3DSceneTransform;
  type: Model3DSceneNodeType;
};

export type Model3DSceneStats = {
  faces: number;
  triangles: number;
  vertices: number;
};

export type Model3DSceneTransformRequest = {
  reset?: boolean;
  nodeId: string;
  transform?: Model3DSceneTransform;
};

export type Model3DOperationRecord = {
  createdAt: string;
  id: string;
  kind: "model" | "structure" | "texture" | "transform";
  nodeId?: string;
  nodeName?: string;
  title: string;
  transform?: Model3DSceneTransform;
};

export type Model3DInputImage = {
  id: string;
  file?: File;
  url: string;
  name: string;
  size: number;
  label?: string;
};

export type Model3DTask = {
  id: string;
  title: string;
  prompt: string;
  mode: Model3DMode;
  status: Model3DTaskStatus;
  model: string;
  generationProfile?: Model3DGenerationProfile;
  quality: Model3DQuality;
  imageAutoOptimizeEnabled?: boolean;
  smartMeshEnabled?: boolean;
  highPrecisionTopology?: Model3DTopology;
  highPrecisionFaceCount?: number | "auto";
  smartMeshTopology?: Model3DTopology;
  smartMeshFaceCount?: number;
  retopoEnabled?: boolean;
  retopoTopology?: Model3DTopology;
  retopoFaceCount?: number;
  topology?: Model3DTopology;
  faceCount?: number;
  textureFaceCount?: number | "auto";
  textureEnabled: boolean;
  textureQuality?: Model3DTextureQuality;
  pbrEnabled: boolean;
  generatePartsEnabled?: boolean;
  inputImageUrl?: string | null;
  inputImages?: Array<{
    objectKey?: string | null;
    url: string;
    name: string;
    label?: string;
  }>;
  exportUrl?: string | null;
  previewModelUrl?: string | null;
  modelUrl?: string | null;
  operations?: Model3DOperationRecord[];
  provider?: "tripo" | "local";
  providerTaskId?: string | null;
  rawStatus?: string | null;
  previewImageUrl?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
};

export const MODEL3D_MODEL_VERSION_P1 = "P1-20260311";
export const MODEL3D_MODEL_VERSION_3 = "v3.0-20250812";
export const MODEL3D_MODEL_VERSION_25 = "v2.5-20250123";
export const MODEL3D_DEFAULT_MODEL = MODEL3D_MODEL_VERSION_25;
export const MODEL3D_DEFAULT_FACE_COUNT = 5000;
export const MODEL3D_DEFAULT_RETOPO_FACE_COUNT = 0;
export const MODEL3D_FACE_COUNT_MIN = 500;
export const MODEL3D_FACE_COUNT_MAX = 20000;
export const MODEL3D_RETOPO_FACE_COUNT_MAX = 50000;
export const MODEL3D_TEXTURE_FACE_COUNT_MAX = 1000000;

export const model3DModelOptions = [
  {
    id: MODEL3D_MODEL_VERSION_P1,
    label: "Nexus 3D 3.1",
    description: "最新 P1.0 模型，适合更精细的模型生成。"
  },
  {
    id: MODEL3D_MODEL_VERSION_3,
    label: "Nexus 3D 3.0",
    description: "V3.0 模型，适合高质量通用 3D 生成。"
  },
  {
    id: MODEL3D_MODEL_VERSION_25,
    label: "Nexus 3D 2.5",
    description: "V2.5 模型，适合稳定的基础 3D 生成。"
  }
];

export const model3DQualityOptions: Array<{ value: Model3DQuality; label: string; description: string }> = [
  { value: "standard", label: "标准", description: "适合快速生成与教学展示。" },
  { value: "high", label: "高质量", description: "适合更精细的模型结构与贴图预览。" }
];

export const initialModel3DPrompt = "生成一个适合教学展示的未来感 3D 教室模型，结构清晰，材质干净。";

export const initialModel3DTasks: Model3DTask[] = [];

export function isModel3DTaskProcessing(status: Model3DTaskStatus | string | null | undefined) {
  return status === "queued" || status === "pending" || status === "processing" || status === "retrying";
}

