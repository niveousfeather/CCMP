import type { TeachingArchitectureVisualPreset } from "@/lib/smart-tools/teaching-architecture-diagram/prompts";

export type TeachingArchitectureSourceType = "text" | "file";

export type TeachingArchitectureDiagramType =
  | "auto"
  | "central_model"
  | "three_layer"
  | "left_center_right_flow"
  | "closed_loop"
  | "tree_module";

export type TeachingArchitectureStylePreset = "academic_paper_figure_svg";

export type TeachingArchitectureGenerationMode = "svg_renderer" | "image_provider";

export type TeachingArchitectureDiagramSceneLayout = Exclude<TeachingArchitectureDiagramType, "auto">;

export type TeachingArchitectureSvgRenderMode = "image-backed-editable-text" | "pure-vector";

export type TeachingArchitectureDiagramSceneNodeRole = "center" | "main" | "support" | "feedback" | "output";

export type TeachingArchitectureDiagramSceneNode = {
  id: string;
  index: number;
  title: string;
  tags: string[];
  role: TeachingArchitectureDiagramSceneNodeRole;
};

export type TeachingArchitectureDiagramSceneEdge = {
  id: string;
  from: string;
  to: string;
  type: "solid" | "dashed" | "loop" | "feedback";
  label?: string;
};

export type TeachingArchitectureDiagramScene = {
  title: string;
  layout: TeachingArchitectureDiagramSceneLayout;
  width: number;
  height: number;
  background: string;
  theme: {
    primary: string;
    secondary: string;
    accent: string;
    success: string;
    danger: string;
    text: string;
    muted: string;
    stroke: string;
  };
  nodes: TeachingArchitectureDiagramSceneNode[];
  edges: TeachingArchitectureDiagramSceneEdge[];
};

export type TeachingArchitectureSceneEdit =
  | {
      targetType: "title";
      value: string;
    }
  | {
      targetType: "nodeTitle";
      nodeId: string;
      value: string;
    }
  | {
      targetType: "nodeTag";
      nodeId: string;
      tagIndex: number;
      value: string;
    }
  | {
      targetType: "edgeLabel";
      edgeId: string;
      value: string;
    };

export type TeachingArchitectureSceneResponse = {
  scene: TeachingArchitectureDiagramScene;
  svgUrl: string;
  backgroundImageDataUri?: string;
  svgRenderMode?: TeachingArchitectureSvgRenderMode;
  visualPreset?: TeachingArchitectureVisualPreset;
  task?: TeachingArchitectureTask;
};

export type TeachingArchitectureTaskStatus =
  | "pending"
  | "running"
  | "analyzing"
  | "generating"
  | "completed"
  | "failed";

export type TeachingArchitectureTaskStage =
  | "pending"
  | "extracting"
  | "analyzing"
  | "building_prompt"
  | "rendering_svg"
  | "generating_image"
  | "completed"
  | "failed";

export type TeachingArchitectureErrorCode =
  | "MODEL_PROVIDER_TIMEOUT"
  | "TASK_TIMEOUT"
  | "INVALID_INPUT"
  | "FILE_ANALYSIS_TIMEOUT"
  | "CONTENT_EXTRACTION_FAILED"
  | "AGENT_ANALYSIS_TIMEOUT"
  | "IMAGE_PROVIDER_NOT_CONFIGURED"
  | "IMAGE_PROVIDER_TIMEOUT"
  | "IMAGE_PROVIDER_BAD_RESPONSE"
  | "IMAGE_PROVIDER_FAILED";

export const TEACHING_ARCHITECTURE_STYLE_PRESET: TeachingArchitectureStylePreset = "academic_paper_figure_svg";

export const FILE_ANALYSIS_TIMEOUT_MS = 45_000;
export const AGENT_ANALYSIS_TIMEOUT_MS = 300_000;
export const IMAGE_GENERATION_TIMEOUT_MS = 300_000;
export const TOTAL_TASK_TIMEOUT_MS =
  FILE_ANALYSIS_TIMEOUT_MS + AGENT_ANALYSIS_TIMEOUT_MS + IMAGE_GENERATION_TIMEOUT_MS;

export type TeachingArchitectureBlueprintFields = {
  teachingReformBackground: string[];
  coreProblems: string[];
  constructionGoals: string[];
  teachingResources: string[];
  implementationPath: string[];
  teachingMode: string[];
  technicalSupport: string[];
  evaluationMechanism: string[];
  outcomes: string[];
  demonstrationPromotion: string[];
};

export type TeachingArchitectureExtractionStatus = "extracted" | "pending_parser" | "failed";

export type TeachingArchitectureExtractionFile = {
  fileName: string;
  storedName?: string;
  mimeType: string;
  size: number;
  extractionStatus: TeachingArchitectureExtractionStatus;
  extractedTextLength: number;
  errorCode?: string;
  errorMessage?: string;
};

export type TeachingArchitectureExtraction = {
  sourceType: TeachingArchitectureSourceType;
  textLength: number;
  files: TeachingArchitectureExtractionFile[];
  warnings: string[];
  extractedText: string;
  sourceSummary: string;
};

export type TeachingArchitectureGeneratedFallbacks = Partial<Record<TeachingArchitectureBlueprintFieldKey, boolean>>;

export type TeachingArchitectureBlueprintFieldKey = keyof TeachingArchitectureBlueprintFields;

export type TeachingArchitectureLayoutIntent = {
  recommendedType: TeachingArchitectureDiagramType;
  reason: string;
  mainStructure: string;
  flowDirection: string;
  emphasisNodes: string[];
};

export type TeachingArchitectureImageNode = {
  title: string;
  shortTags: string[];
  category: TeachingArchitectureBlueprintFieldKey | "combined";
  evidence: string[];
};

export type TeachingArchitectureVisualPlan = {
  canvasRatio: "3:4" | "4:3" | "16:9";
  aspectRatio: "3:4" | "4:3" | "16:9";
  size: "1024x1536" | "1536x1024" | "1792x1024";
  orientation: "portrait" | "landscape";
  background: "white";
  primaryColor: "deep_blue";
  accentColor: "orange_or_teal";
  stylePreset: TeachingArchitectureStylePreset;
  density: "academic_readable";
};

export type TeachingArchitectureBlueprintSection = {
  key: TeachingArchitectureBlueprintFieldKey;
  title: string;
  summary: string;
  items: string[];
};

export type TeachingArchitectureBlueprint = {
  version: 2;
  sourceType: TeachingArchitectureSourceType;
  sourceExtractionStatus: "extracted" | "partial" | "pending_parser" | "failed";
  diagramType: TeachingArchitectureDiagramType;
  title: string;
  coreTheme: string;
  fields: TeachingArchitectureBlueprintFields;
  generatedFallback: TeachingArchitectureGeneratedFallbacks;
  layoutIntent: TeachingArchitectureLayoutIntent;
  visualPlan: TeachingArchitectureVisualPlan;
  imageNodes: TeachingArchitectureImageNode[];
  generatedAt: string;
  source: {
    parser: "ai_model" | "rule_based";
    model?: string;
    provider?: string;
    sourceSummary: string;
    textLength: number;
    textPrompt?: string;
    files?: TeachingArchitectureExtractionFile[];
    warnings?: string[];
  };
  sections: TeachingArchitectureBlueprintSection[];
};

export type TeachingArchitectureTaskFile = {
  originalName: string;
  storedName: string;
  size: number;
  type: string;
};

export type TeachingArchitectureTask = {
  taskId: string;
  sourceType: TeachingArchitectureSourceType;
  status: TeachingArchitectureTaskStatus;
  stage: TeachingArchitectureTaskStage;
  progress: number;
  currentStep: string;
  diagramType: TeachingArchitectureDiagramType;
  stylePreset: TeachingArchitectureStylePreset;
  generationMode?: TeachingArchitectureGenerationMode;
  textPrompt?: string;
  files?: TeachingArchitectureTaskFile[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  errorCode?: TeachingArchitectureErrorCode;
  errorMessage?: string;
  retryable?: boolean;
  downloadUrl?: string;
  preview: {
    type: "placeholder" | "image";
    title: string;
    description: string;
    imageUrl?: string;
    svgUrl?: string;
  };
  output: {
    fileName: string;
    contentType: string;
    size?: number;
    svgFileName?: "output.svg";
    svgContentType?: "image/svg+xml";
    svgSize?: number;
    pngFileName?: "output.png";
    pngContentType?: "image/png";
    pngSize?: number;
  };
  image?: {
    mode?: TeachingArchitectureGenerationMode;
    provider?: string;
    model?: string;
    status: "generated" | "failed";
    outputFile?: "output.png";
    outputSvg?: "output.svg";
    outputPng?: "output.png";
    renderer?: Exclude<TeachingArchitectureDiagramType, "auto">;
    width?: number;
    height?: number;
    aspectRatio?: TeachingArchitectureVisualPlan["aspectRatio"];
    size?: TeachingArchitectureVisualPlan["size"];
    durationMs?: number;
  };
  generationQuality?: {
    recommendedType: TeachingArchitectureDiagramType;
    nodeCount: number;
    shortTagCount: number;
    averageShortTagCount: number;
    aspectRatio: TeachingArchitectureVisualPlan["aspectRatio"];
    size: TeachingArchitectureVisualPlan["size"];
    titleLength: number;
    warnings: string[];
  };
};

export type TeachingArchitectureTaskListResponse = {
  tasks: TeachingArchitectureTask[];
};

export type TeachingArchitectureCreateTaskResponse = {
  taskId: string;
  status: TeachingArchitectureTaskStatus;
  stage: TeachingArchitectureTaskStage;
};

export type TeachingArchitectureTaskResponse = TeachingArchitectureTask & {
  blueprint?: TeachingArchitectureBlueprint;
};

export type TeachingArchitectureImageRevisionResponse = TeachingArchitectureTaskResponse;

export type TeachingArchitectureLogEntry = {
  time: string;
  level: "info" | "warn" | "error";
  message: string;
};
