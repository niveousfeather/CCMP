export type AcademicPptTaskStatus = "idle" | "queued" | "pending" | "running" | "success" | "failed" | "cancelled" | "missing";

export type AcademicPptPipelineStepId =
  | "parse_paper"
  | "research_analysis"
  | "structure_planning"
  | "slide_generation"
  | "visual_check"
  | "post_process"
  | "export_file";

export type AcademicPptStepStatus = "waiting" | "running" | "success" | "failed";

export type AcademicPptLogLevel = "info" | "warn" | "error";
export type AcademicPptModelSource = "nexus-model" | "paper-ppt-agent" | "paper-ppt-agent-degraded" | "local-fallback";
export type AcademicPptGeneratorSource = "tools-engine" | "local-fallback";
export type AcademicPptQualityLevel = "good" | "warning" | "poor";
export type AcademicPptQualityIssueSeverity = "info" | "warn" | "error";
export type AcademicPptPreviewType = "image" | "svg" | "pdf" | "outline";
export type AcademicPptPreviewSource = "svg_final" | "native_preview" | "structured_placeholder";
export type AcademicPptStorageProvider = "local" | "oss";
export type AcademicPptResearchStatus = "skipped" | "success" | "degraded" | "failed";
export type AcademicPptSearchStatus = "disabled" | "enabled" | "success" | "degraded" | "failed" | "skipped";
export type AcademicPptSearchProvider = "nexus-searxng";
export type AcademicPptGeneratorPreference = "paper-ppt-agent";
export type AcademicPptResearchSourceType = "web" | "file" | "model" | "internal";
export type AcademicPptModelCriticStatus = "skipped" | "success" | "degraded" | "failed";
export type AcademicPptModelBridgeStatus = "not_started" | "started" | "success" | "fallback_success" | "failed";
export type AcademicPptModelBridgeAttemptStatus = "not_started" | "started" | "success" | "failed" | "timeout" | "skipped";
export type AcademicPptModelBridgeUrlSource = "NEXT_PUBLIC_APP_URL" | "request-origin" | "env" | "default";
export type AcademicPptGenerationMode = "paper-ppt-agent" | "paper-ppt-agent-rule-fallback";
export type AcademicPptVisualPipelineStatus = "not_started" | "success" | "degraded" | "failed";
export type AcademicPptModelCriticIssueCategory =
  | "layout"
  | "density"
  | "readability"
  | "visual_balance"
  | "template_fit"
  | "logic"
  | "missing_content"
  | "overflow";
export type AcademicPptModelCriticRepairAction =
  | "shorten_text"
  | "split_slide"
  | "change_layout"
  | "add_visual"
  | "remove_visual"
  | "rebalance_columns"
  | "add_summary"
  | "adjust_density";
export type AcademicPptVisualType =
  | "none"
  | "chart"
  | "table"
  | "formula"
  | "flow"
  | "architecture"
  | "timeline"
  | "comparison"
  | "kpi"
  | "matrix"
  | "process"
  | "swot";

export type AcademicPptTemplateStyle = "academic_clean" | "blue_tech" | "research_report" | "course_presentation";
export type AcademicPptAspectRatio = "16:9" | "4:3";
export type AcademicPptOutputLanguage = "zh" | "en";
export type AcademicPptDetailLevel = "concise" | "standard" | "detailed";
export type AcademicPptInformationDensity = "low" | "normal" | "high";

export type AcademicPptSourceFileType = "PDF" | "PPTX" | "TeX" | "Text" | "Markdown";
export type AcademicPptUploadStatus = "empty" | "ready" | "uploaded" | "failed";

export type AcademicPptSourceFile = {
  name: string;
  sizeBytes: number;
  type: AcademicPptSourceFileType;
  status: AcademicPptUploadStatus;
};

export type AcademicPptPipelineStep = {
  id: AcademicPptPipelineStepId;
  label: string;
  status: AcademicPptStepStatus;
};

export type AcademicPptRecentTask = {
  taskId: string;
  sourceFileName: string;
  status: Exclude<AcademicPptTaskStatus, "idle">;
  slideCount?: number;
  createdAt: string;
  completedAt?: string;
  modelSource?: AcademicPptModelSource;
  generatorSource?: AcademicPptGeneratorSource;
  qualityScore?: number;
};

export type AcademicPptSlidePreview = {
  id: string;
  index?: number;
  title: string;
  subtitle?: string;
  layout?: AcademicPptExtendedSlideLayout;
  visualType?: AcademicPptVisualType;
  templateIntent?: string;
  templateId?: string;
  bullets?: string[];
  visualHint?: string;
  emphasis?: string;
  iconDecorations?: AcademicPptIconDecoration[];
  status: "placeholder" | "generating" | "ready";
};

export type AcademicPptSlideLayout = "cover" | "section" | "content" | "compare" | "timeline" | "summary";
export type AcademicPptExtendedSlideLayout =
  | AcademicPptSlideLayout
  | "agenda"
  | "two_column"
  | "method"
  | "experiment"
  | "result"
  | "table"
  | "formula"
  | "chart"
  | "architecture"
  | "flow"
  | "ending";

export type AcademicPptSlideSection = {
  heading: string;
  items: string[];
};

export type AcademicPptSlide = {
  title: string;
  subtitle?: string;
  layout: AcademicPptExtendedSlideLayout;
  bullets: string[];
  sections?: AcademicPptSlideSection[];
  speakerNotes?: string;
  visualHint?: string;
  visualType?: AcademicPptVisualType;
  templateIntent?: string;
  emphasis?: string;
  iconDecorations?: AcademicPptIconDecoration[];
};

export type AcademicPptOutline = {
  title: string;
  subtitle?: string;
  language: AcademicPptOutputLanguage;
  slides: AcademicPptSlide[];
};

export type AcademicPptQualityIssue = {
  code: string;
  severity: AcademicPptQualityIssueSeverity;
  message: string;
  slideIndex?: number;
};

export type AcademicPptQualityReport = {
  score: number;
  level: AcademicPptQualityLevel;
  issues: AcademicPptQualityIssue[];
  suggestions: string[];
};

export type AcademicPptNativePreviewSlide = {
  // Internal preview identity is 0-based. Use pageNumber for user-facing labels and routes.
  index: number;
  pageNumber?: number;
  url?: string;
  imageUrl?: string;
  assetPath?: string;
  source?: AcademicPptPreviewSource;
  publicUrl?: string;
  storageKey?: string;
  storageProvider?: AcademicPptStorageProvider;
  width?: number;
  height?: number;
  fileSizeBytes?: number;
};

export type AcademicPptPreviewDiagnostics = {
  libreOffice: "available" | "missing";
  pdftoppm: "available" | "missing";
  nativePreview: "available" | "unavailable";
  reason?: string;
  checkedAt: string;
};

export type AcademicPptPreviewManifest = {
  taskId?: string;
  status?: "ready" | "pending" | "unavailable";
  available: boolean;
  type: AcademicPptPreviewType;
  source: AcademicPptPreviewSource;
  slideCount: number;
  previewCount: number;
  slides: AcademicPptNativePreviewSlide[];
  pptxUrl?: string;
  previewManifestUrl?: string;
  previewStoragePrefix?: string;
  storageProvider?: AcademicPptStorageProvider;
  fallbackReason?: string;
  diagnostics?: AcademicPptPreviewDiagnostics;
  createdAt?: string;
  updatedAt?: string;
  generatedAt: string;
};

export type AcademicPptVisualQaIssue = {
  code: string;
  severity: AcademicPptQualityIssueSeverity;
  message: string;
  slideIndex?: number;
};

export type AcademicPptVisualQaReport = {
  score: number;
  level: AcademicPptQualityLevel;
  issues: AcademicPptVisualQaIssue[];
  summary?: string;
  previewType?: AcademicPptPreviewType;
};

export type AcademicPptModelCriticReport = {
  enabled: boolean;
  status: AcademicPptModelCriticStatus;
  score: number;
  level: AcademicPptQualityLevel;
  summary: string;
  issues: Array<{
    slideIndex?: number;
    severity: AcademicPptQualityIssueSeverity;
    category: AcademicPptModelCriticIssueCategory;
    message: string;
    suggestion: string;
  }>;
  repairActions: Array<{
    slideIndex?: number;
    action: AcademicPptModelCriticRepairAction;
    reason: string;
  }>;
  fallbackReason?: string;
};

export type AcademicPptIconDecorationKind =
  | "node"
  | "arrow"
  | "gear"
  | "module"
  | "database"
  | "flask"
  | "chart"
  | "check"
  | "star"
  | "clock"
  | "compare"
  | "formula"
  | "table";

export type AcademicPptIconDecoration = {
  kind: AcademicPptIconDecorationKind;
  label: string;
  tone: "primary" | "accent" | "secondary";
};

export type AcademicPptResearchSource = {
  title: string;
  url?: string;
  sourceType: AcademicPptResearchSourceType;
  snippet: string;
  publishedAt?: string;
};

export type AcademicPptResearchBrief = {
  enabled: boolean;
  status: AcademicPptResearchStatus;
  queries: string[];
  sources: AcademicPptResearchSource[];
  summary: string;
  keyFindings: string[];
  limitations: string[];
  generatedAt: string;
  fallbackReason?: string;
};

export type AcademicPptSettings = {
  templateStyle: AcademicPptTemplateStyle;
  aspectRatio: AcademicPptAspectRatio;
  outputLanguage: AcademicPptOutputLanguage;
  targetSlides: number;
  detailLevel: AcademicPptDetailLevel;
  informationDensity: AcademicPptInformationDensity;
  enableVisualQa: boolean;
  enableIconDecoration: boolean;
  enableDeepResearch: boolean;
  enableExternalResearch: boolean;
  visualQaEnabled?: boolean;
  deepResearchEnabled: boolean;
  externalResearchEnabled?: boolean;
  webSearchEnabled?: boolean;
  searchProvider?: AcademicPptSearchProvider;
  generatorPreference?: AcademicPptGeneratorPreference;
  iconSearchEnabled?: boolean;
  extraRequirements: string;
};

export type AcademicPptTaskRequestSnapshot = {
  slideCount: number;
  templateId: string;
  language: AcademicPptOutputLanguage;
  deepResearchEnabled: boolean;
  externalResearchEnabled: boolean;
  webSearchEnabled: boolean;
  visualQaEnabled: boolean;
  iconDecorationEnabled: boolean;
  searchProvider: AcademicPptSearchProvider;
  generatorPreference: AcademicPptGeneratorPreference;
};

export type AcademicPptTaskLog = {
  time: string;
  level: AcademicPptLogLevel;
  message: string;
};

export type AcademicPptTaskSnapshot = {
  taskId: string;
  status: Exclude<AcademicPptTaskStatus, "idle">;
  progress?: number;
  currentStep?: string;
  error?: string;
  resumable?: boolean;
  resumeFromStep?: AcademicPptTaskStep;
  lastCompletedStep?: AcademicPptTaskStep;
  retryCount?: number;
  maxRetries?: number;
  timeoutAt?: string;
  downloadUrl?: string;
  outputStorageProvider?: AcademicPptStorageProvider;
  pptxUrl?: string;
  previewManifestUrl?: string;
  previewStoragePrefix?: string;
  previewAssetsReady?: boolean;
  modelSource?: AcademicPptModelSource;
  modelName?: string;
  fallbackReason?: string;
  generationMode?: AcademicPptGenerationMode;
  visualPipelineStatus?: AcademicPptVisualPipelineStatus;
  generatorSource?: AcademicPptGeneratorSource;
  requestSnapshot?: AcademicPptTaskRequestSnapshot;
  modelBridgeStatus?: AcademicPptModelBridgeStatus;
  modelBridgePrimaryModel?: string;
  modelBridgePrimaryStatus?: AcademicPptModelBridgeAttemptStatus;
  modelBridgeFallbackModel?: string;
  modelBridgeFallbackStatus?: AcademicPptModelBridgeAttemptStatus;
  modelBridgeErrorSummary?: string;
  modelBridgeUrlSource?: AcademicPptModelBridgeUrlSource;
  slideCount?: number;
  outputFileSize?: number;
  templateId?: string;
  templateName?: string;
  templateStyle?: AcademicPptTemplateStyle;
  sourceFileType?: AcademicPptSourceFileType;
  extractedTextLength?: number;
  outlineTitle?: string;
  completedAt?: string;
  startedAt?: string;
  failedAt?: string;
  cancelledAt?: string;
  qualityScore?: number;
  qualityLevel?: AcademicPptQualityLevel;
  qualityIssuesCount?: number;
  repairRounds?: number;
  slidesPreview?: AcademicPptSlidePreview[];
  previewUpdatedAt?: string;
  nativePreview?: AcademicPptPreviewManifest;
  previewAvailable?: boolean;
  previewType?: AcademicPptPreviewType;
  previewSlideCount?: number;
  previewFallbackReason?: string;
  visualQaScore?: number;
  visualQaLevel?: AcademicPptQualityLevel;
  visualQaIssuesCount?: number;
  visualQaEnabled?: boolean;
  visualQaSummary?: string;
  visualQaPreviewType?: AcademicPptPreviewType;
  iconDecorationEnabled?: boolean;
  researchEnabled?: boolean;
  externalResearchEnabled?: boolean;
  deepResearchEnabled?: boolean;
  webSearchEnabled?: boolean;
  searchEnabled?: boolean;
  searchProvider?: AcademicPptSearchProvider;
  searchStatus?: AcademicPptSearchStatus;
  researchStatus?: AcademicPptResearchStatus;
  researchSourcesCount?: number;
  researchFallbackReason?: string;
  researchBriefUpdatedAt?: string;
  modelCriticEnabled?: boolean;
  modelCriticStatus?: AcademicPptModelCriticStatus;
  modelCriticScore?: number;
  modelCriticLevel?: AcademicPptQualityLevel;
  modelCriticIssuesCount?: number;
  modelCriticRounds?: number;
  modelCriticFallbackReason?: string;
  autoRepairFallbackReason?: string;
  autoRepairRounds?: number;
  autoRepairApplied?: boolean;
  finalQualityScore?: number;
  finalVisualQaScore?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type AcademicPptTaskStep =
  | "upload_received"
  | "parsing_source"
  | "source_parsed"
  | "research_enhancement"
  | "research_ready"
  | "planning_outline"
  | "outline_generated"
  | "running_critic"
  | "repairing_outline"
  | "outline_ready"
  | "generating_slides"
  | "visual_qa"
  | "repairing_slides"
  | "exporting_pptx"
  | "pptx_exported"
  | "rendering_preview"
  | "completed"
  | "failed"
  | "cancelled";

export type AcademicPptCheckpointName =
  | "source-parsed"
  | "research-brief"
  | "paper-outline"
  | "slide-plan"
  | "template-plan"
  | "generation-state"
  | "outline-draft"
  | "outline-critic"
  | "outline-repaired"
  | "pptx-exported"
  | "preview"
  | "model-critic-round-1"
  | "model-critic-round-2"
  | "auto-repair-round-1"
  | "auto-repair-round-2";

export type AcademicPptTaskRecord = {
  taskId: string;
  status: Exclude<AcademicPptTaskStatus, "idle">;
  progress: number;
  currentStep: AcademicPptTaskStep;
  inputFileName: string;
  inputFilePath: string;
  outputFilePath?: string;
  outputStorageProvider?: AcademicPptStorageProvider;
  pptxUrl?: string;
  previewManifestUrl?: string;
  previewStoragePrefix?: string;
  previewAssetsReady?: boolean;
  error?: string;
  resumable?: boolean;
  resumeFromStep?: AcademicPptTaskStep;
  lastCompletedStep?: AcademicPptTaskStep;
  retryCount?: number;
  maxRetries?: number;
  timeoutAt?: string;
  modelSource?: AcademicPptModelSource;
  modelName?: string;
  fallbackReason?: string;
  generationMode?: AcademicPptGenerationMode;
  visualPipelineStatus?: AcademicPptVisualPipelineStatus;
  generatorSource?: AcademicPptGeneratorSource;
  requestSnapshot?: AcademicPptTaskRequestSnapshot;
  modelBridgeStatus?: AcademicPptModelBridgeStatus;
  modelBridgePrimaryModel?: string;
  modelBridgePrimaryStatus?: AcademicPptModelBridgeAttemptStatus;
  modelBridgeFallbackModel?: string;
  modelBridgeFallbackStatus?: AcademicPptModelBridgeAttemptStatus;
  modelBridgeErrorSummary?: string;
  modelBridgeUrlSource?: AcademicPptModelBridgeUrlSource;
  slideCount?: number;
  outputFileSize?: number;
  templateId?: string;
  templateName?: string;
  templateStyle?: AcademicPptTemplateStyle;
  sourceFileType?: AcademicPptSourceFileType;
  extractedTextLength?: number;
  outlineTitle?: string;
  completedAt?: string;
  startedAt?: string;
  failedAt?: string;
  cancelledAt?: string;
  qualityScore?: number;
  qualityLevel?: AcademicPptQualityLevel;
  qualityIssuesCount?: number;
  repairRounds?: number;
  qualityReportPath?: string;
  slidesPreview?: AcademicPptSlidePreview[];
  previewUpdatedAt?: string;
  cancelRequested?: boolean;
  previewAvailable?: boolean;
  previewType?: AcademicPptPreviewType;
  previewSlideCount?: number;
  previewFallbackReason?: string;
  previewManifestPath?: string;
  visualQaScore?: number;
  visualQaLevel?: AcademicPptQualityLevel;
  visualQaIssuesCount?: number;
  visualQaEnabled?: boolean;
  visualQaSummary?: string;
  visualQaPreviewType?: AcademicPptPreviewType;
  iconDecorationEnabled?: boolean;
  researchEnabled?: boolean;
  externalResearchEnabled?: boolean;
  deepResearchEnabled?: boolean;
  webSearchEnabled?: boolean;
  searchEnabled?: boolean;
  searchProvider?: AcademicPptSearchProvider;
  searchStatus?: AcademicPptSearchStatus;
  researchStatus?: AcademicPptResearchStatus;
  researchSourcesCount?: number;
  researchFallbackReason?: string;
  researchBriefUpdatedAt?: string;
  modelCriticEnabled?: boolean;
  modelCriticStatus?: AcademicPptModelCriticStatus;
  modelCriticScore?: number;
  modelCriticLevel?: AcademicPptQualityLevel;
  modelCriticIssuesCount?: number;
  modelCriticRounds?: number;
  modelCriticFallbackReason?: string;
  autoRepairFallbackReason?: string;
  autoRepairRounds?: number;
  autoRepairApplied?: boolean;
  finalQualityScore?: number;
  finalVisualQaScore?: number;
  createdAt: string;
  updatedAt: string;
};

export type AcademicPptPreviewResponse = AcademicPptPreviewManifest & {
  taskId: string;
};

export type CancelAcademicPptTaskResponse = {
  taskId: string;
  status: Exclude<AcademicPptTaskStatus, "idle">;
};

export type CreateAcademicPptTaskRequest = {
  sourceFile?: AcademicPptSourceFile | null;
  settings: AcademicPptSettings;
};

export type CreateAcademicPptTaskResponse = {
  taskId: string;
  status: Exclude<AcademicPptTaskStatus, "idle">;
};

export type ResumeAcademicPptTaskResponse = {
  taskId: string;
  status: Exclude<AcademicPptTaskStatus, "idle">;
  task?: AcademicPptTaskSnapshot;
};

export type AcademicPptLogsResponse = {
  taskId: string;
  logs: AcademicPptTaskLog[];
};

export type AcademicPptRecentTasksResponse = {
  tasks: AcademicPptRecentTask[];
};
