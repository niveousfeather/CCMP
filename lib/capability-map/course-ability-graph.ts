import { courseAbilityDiagnosticWarning } from "@/lib/capability-map/diagnostics";

export type CourseAbilityGraphInput = {
  courseName: string;
  majorDirection: string;
  region: string;
};

export type CourseAbilityTreeNode = {
  id: string;
  name: string;
  level: number;
  weight: number;
  description: string;
  children?: CourseAbilityTreeNode[];
};

export type CourseSkillWeight = {
  skill: string;
  weight: number;
  description: string;
};

export type CourseRelatedJob = {
  id: string;
  title: string;
  relevance: number;
  reason: string;
};

export type CourseSalaryRange = {
  jobTitle: string;
  min: number;
  max: number;
  unit: "CNY/month";
  region: string;
  note: string;
};

export type CourseEvidenceSource = {
  id: string;
  title: string;
  sourceType: "model_synthesis" | "industry_report" | "job_posting" | "policy" | "curriculum_standard" | "manual";
  url: string | null;
  publishDate: string | null;
  reliability: "high" | "medium" | "low";
  summary: string;
};

export type CourseUpdateSuggestion = {
  title: string;
  priority: "high" | "medium" | "low";
  reason: string;
  actions: string[];
};

export type IndustryTrend = {
  id: string;
  name: string;
  description: string;
  evidenceSourceIds: string[];
};

export type RegionalJob = {
  id: string;
  title: string;
  region: string;
  relevance: number;
  trendIds: string[];
  abilityIds: string[];
};

export type MajorAbility = {
  id: string;
  name: string;
  description: string;
  jobIds: string[];
  trendIds: string[];
  courseAbilityIds: string[];
};

export type SkillNode = {
  id: string;
  name: string;
  level: 1 | 2;
  parentId: string;
  weight: number;
  description: string;
  relatedJobIds: string[];
  evidenceSourceIds: string[];
  trendIds: string[];
  teachingSuggestions: string[];
  assessmentMethods: string[];
  x: number;
  y: number;
};

export type CourseRootNode = {
  id: "course_root";
  name: string;
  weight: 100;
  description: string;
  relatedJobIds: string[];
  evidenceSourceIds: string[];
  trendIds: string[];
  coreAbilityNodeIds: string[];
  x: number;
  y: number;
};

export type CourseAbilityEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
};

export type ProcessGraphStageId = "industry" | "regionalJobs" | "majorAbilities" | "coreCourses";

export type ProcessGraphNodeType =
  | "industry"
  | "trend"
  | "impact"
  | "region"
  | "job"
  | "ability"
  | "element"
  | "coreCourse"
  | "coursePosition"
  | "courseModule";

export type ProcessGraphNode = {
  id: string;
  type: ProcessGraphNodeType;
  title: string;
  subtitle: string;
  description: string;
  level: 1 | 2 | 3;
  tags?: string[];
  weight?: number;
  relatedModuleIds?: string[];
};

export type ProcessGraphEdge = {
  id?: string;
  source: string;
  target: string;
  label?: string;
};

export type ProcessGraphKeyItem = {
  title: string;
  description: string;
  metric?: string;
};

export type ProcessGraphStage = {
  id: ProcessGraphStageId;
  title: string;
  lead: string;
  summary: string;
  notice: string;
  nodes: ProcessGraphNode[];
  edges: ProcessGraphEdge[];
  keyItems: ProcessGraphKeyItem[];
};

export type CoreCourseSuggestion = {
  id: string;
  name: string;
  position: string;
  supportedAbilityIds?: string[];
  supportedAbilityNames: string[];
  relatedJobIds?: string[];
  relatedJobNames: string[];
  description?: string;
  isCurrentCourse?: boolean;
  status?: "available" | "placeholder";
};

export type CourseAbilityMap = {
  rootNode: CourseRootNode;
  nodes: SkillNode[];
  edges: CourseAbilityEdge[];
};

export type ImpactPath = {
  id: string;
  industryTrend: string;
  affectedJobs: string[];
  majorAbilities: string[];
  courseAbilities: string[];
  teachingSuggestions: string[];
  evidenceSourceIds: string[];
};

export type CourseMappingDimensionKey =
  | "coreTasks"
  | "standardWorkflow"
  | "coreOccupationalAbilities"
  | "assessableSkillPoints"
  | "supportingKnowledgePoints"
  | "assessmentMethods"
  | "enterpriseStandardsOrCertificates";

export type CourseMappingItem = {
  id: string;
  text: string;
  description?: string;
  relatedTeachingModuleIds?: string[];
};

export type CourseMappingDimension = {
  key: CourseMappingDimensionKey;
  title: string;
  items: CourseMappingItem[];
};

export type CourseTeachingModule = {
  id: string;
  title: string;
  description?: string;
  hours?: string;
  sourceItemIds?: string[];
};

export type CourseMapping = {
  abilityId: string;
  abilityName: string;
  parentAbilityName?: string;
  typicalWorkProject: {
    id: string;
    name: string;
    description?: string;
  };
  mappingDimensions: CourseMappingDimension[];
  teachingModules: CourseTeachingModule[];
};

export type WorkflowStage = {
  id: string;
  name: string;
  description?: string;
  moduleIds: string[];
};

export type TeachingModuleNode = {
  id: string;
  name: string;
  hours?: number;
  description?: string;
  workflowStageId: string;
  taskIds: string[];
  relatedJobIds: string[];
  evidenceSourceIds: string[];
  trendIds: string[];
  teachingSuggestions: string[];
  assessmentMethods: string[];
};

export type CourseTaskNode = {
  id: string;
  name: string;
  description?: string;
  moduleId: string;
  abilityTags?: string[];
  aiTools?: string[];
  relatedJobIds: string[];
  evidenceSourceIds: string[];
  trendIds: string[];
  teachingSuggestions: string[];
  assessmentMethods: string[];
};

export type ModuleMapping = {
  moduleId: string;
  moduleName: string;
  hours?: number;
  typicalWorkProject: {
    id: string;
    name: string;
    description?: string;
  };
  mappingDimensions: CourseMappingDimension[];
};

export type CourseProfile = {
  positioning: string;
  targetJobIds: string[];
  coreAbilityStructure: string[];
  mockNotice: string;
};

export type CourseAbilityGraphMeta = {
  generatedAt: string;
  model: string;
  provider: string;
  source: "model" | "mock" | "mock-fallback";
  warnings: string[];
};

export type CourseAbilityGraphPayload = {
  course: CourseAbilityGraphInput;
  courseProfile: CourseProfile;
  abilityTree: CourseAbilityTreeNode[];
  skillWeights: CourseSkillWeight[];
  relatedJobs: CourseRelatedJob[];
  salaryRanges: CourseSalaryRange[];
  evidenceSources: CourseEvidenceSource[];
  updateSuggestions: CourseUpdateSuggestion[];
  industryTrends: IndustryTrend[];
  regionalJobMap: RegionalJob[];
  majorAbilityMap: MajorAbility[];
  industryGraph: ProcessGraphStage;
  regionalJobGraph: ProcessGraphStage;
  majorAbilityGraph: ProcessGraphStage;
  coreCourseSuggestions: CoreCourseSuggestion[];
  coreCourseGraph: ProcessGraphStage;
  courseAbilityMap: CourseAbilityMap;
  courseMappings: CourseMapping[];
  workflowStages: WorkflowStage[];
  teachingModules: TeachingModuleNode[];
  tasks: CourseTaskNode[];
  moduleMappings: ModuleMapping[];
  impactPaths: ImpactPath[];
  meta: CourseAbilityGraphMeta;
};

export type CourseAbilityGraphModelOutput = Partial<
  Omit<
    CourseAbilityGraphPayload,
    | "abilityTree"
    | "coreCourseGraph"
    | "coreCourseSuggestions"
    | "courseAbilityMap"
    | "courseMappings"
    | "courseProfile"
    | "evidenceSources"
    | "industryGraph"
    | "majorAbilityGraph"
    | "meta"
    | "moduleMappings"
    | "regionalJobGraph"
    | "tasks"
    | "teachingModules"
    | "workflowStages"
  >
> & {
  abilityTree?: unknown;
  coreCourseGraph?: unknown;
  coreCourseSuggestions?: unknown;
  courseAbilityMap?: unknown;
  courseMappings?: unknown;
  courseProfile?: unknown;
  evidenceSources?: unknown;
  industryGraph?: unknown;
  majorAbilityGraph?: unknown;
  meta?: Partial<CourseAbilityGraphMeta>;
  moduleMappings?: unknown;
  regionalJobGraph?: unknown;
  tasks?: unknown;
  teachingModules?: unknown;
  workflowStages?: unknown;
};

export type ProcessGraphsSemanticSkeleton = {
  coreCourses?: Array<{ isCurrentCourse?: boolean; name?: string; position?: string; reason?: string }>;
  industryChanges?: string[];
  industryKeywords?: string[];
  majorAbilities?: Array<{ description?: string; name?: string; weight?: number }>;
  meta?: Partial<CourseAbilityGraphMeta>;
  regionalJobs?: Array<{ description?: string; name?: string; relevance?: number }>;
};

export type CourseStructureSemanticSkeleton = {
  courseName?: string;
  meta?: Partial<CourseAbilityGraphMeta>;
  workflowStages?: Array<{
    description?: string;
    modules?: Array<{
      description?: string;
      hours?: number;
      name?: string;
      tasks?: Array<{ description?: string; name?: string }>;
    }>;
    name?: string;
  }>;
};

export type MappingAnalysisSemanticSkeleton = {
  meta?: Partial<CourseAbilityGraphMeta>;
  moduleMappings?: Array<{
    dimensions?: Partial<Record<
      | "核心工作任务"
      | "标准工作流程"
      | "核心职业能力"
      | "可考核技能点"
      | "支撑知识点"
      | "考核评价方式"
      | "对应企业标准或大赛证书要求",
      string[]
    >>;
    moduleId?: string;
    moduleName?: string;
    typicalWorkProject?: string;
  }>;
  relatedJobs?: Array<{ description?: string; relevance?: number; title?: string }>;
  skillWeights?: Array<{ description?: string; name?: string; weight?: number }>;
  updateSuggestions?: Array<{ description?: string; priority?: string; title?: string }>;
};

export type MappingModuleReference = {
  hours?: number;
  moduleId: string;
  moduleName: string;
};

const DEFAULT_INPUT: CourseAbilityGraphInput = {
  courseName: "AI动画全流程制作",
  majorDirection: "影视动画",
  region: "重庆"
};

const DATA_NOTICE = "当前为本地示例数据，未接入真实资料库，不能作为正式引用。";
const DRAFT_EVIDENCE_NOTICE = "当前为本地示例数据或模型生成草案，未接入真实资料库，不能作为正式引用。";

const DIMENSION_TITLES: Record<CourseMappingDimensionKey, string> = {
  coreTasks: "核心工作任务",
  standardWorkflow: "标准工作流程",
  coreOccupationalAbilities: "核心职业能力",
  assessableSkillPoints: "可考核技能点",
  supportingKnowledgePoints: "支撑知识点",
  assessmentMethods: "考核评价方式",
  enterpriseStandardsOrCertificates: "对应企业标准 / 大赛证书要求"
};

const DIMENSION_ORDER: CourseMappingDimensionKey[] = [
  "coreTasks",
  "standardWorkflow",
  "coreOccupationalAbilities",
  "assessableSkillPoints",
  "supportingKnowledgePoints",
  "assessmentMethods",
  "enterpriseStandardsOrCertificates"
];

function normalizeGeneratedText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/aigc/gi, "AIGC")
    .replace(/(^|[^A-Za-z])ai(?=[^A-Za-z]|$)/gi, (_, prefix: string) => `${prefix}AI`)
    .replace(/([，。！？；：、,.!?;:])\1+/g, "$1")
    .replace(/\s+([，。！？；：、,.!?;:])/g, "$1")
    .replace(/([（(])\s+/g, "$1")
    .replace(/\s+([）)])/g, "$1")
    .trim();
}

const INTERNAL_DISPLAY_LABELS: Record<string, string> = {
  aigc_visual_content: "AIGC视觉内容创作",
  aigc_visual_content_creation: "AIGC视觉内容创作",
  aigc_visual_content_production: "AIGC视觉内容生产",
  digital_media_art: "数字媒体艺术",
  smart_image_genera: "智能图像生成",
  smart_image_generation: "智能图像生成",
  smart_video_content: "智能视频内容创作",
  smart_video_content_creation: "智能视频内容创作"
};

const INTERNAL_DISPLAY_TOKENS: Record<string, string> = {
  aigc: "AIGC",
  ai: "AI",
  art: "艺术",
  brand: "品牌",
  content: "内容",
  creation: "创作",
  design: "设计",
  digital: "数字",
  genera: "生成",
  generation: "生成",
  image: "图像",
  media: "媒体",
  new: "新",
  operation: "运营",
  packaging: "包装",
  production: "生产",
  short: "短",
  smart: "智能",
  video: "视频",
  visual: "视觉"
};

function internalIdentifierKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function looksLikeInternalIdentifier(value: string) {
  return value.includes("_") || /[a-z0-9][A-Z]/.test(value);
}

function humanizeInternalIdentifier(value: string) {
  const key = internalIdentifierKey(value);
  if (INTERNAL_DISPLAY_LABELS[key]) return INTERNAL_DISPLAY_LABELS[key];
  const tokens = key.split("_").filter(Boolean);
  if (!tokens.length || tokens.some((token) => !INTERNAL_DISPLAY_TOKENS[token])) return "";
  return tokens.map((token) => INTERNAL_DISPLAY_TOKENS[token]).join("");
}

function replaceEmbeddedInternalIdentifiers(value: string) {
  return value
    .replace(/[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+/g, (token) => humanizeInternalIdentifier(token) || "相关内容")
    .replace(/\b[a-z]+(?:[A-Z][A-Za-z0-9]+)+\b/g, (token) => humanizeInternalIdentifier(token) || "相关内容");
}

function cleanText(value: unknown, fallback = "", maxLength = 120) {
  const cleaned = typeof value === "string" ? normalizeGeneratedText(value) : "";
  return (cleaned || normalizeGeneratedText(fallback)).slice(0, maxLength);
}

function cleanDisplayText(value: unknown, fallback = "", maxLength = 120) {
  const raw = typeof value === "string" ? normalizeGeneratedText(value) : "";
  const fallbackText = replaceEmbeddedInternalIdentifiers(normalizeGeneratedText(fallback));
  if (!raw) return fallbackText.slice(0, maxLength);
  if (looksLikeInternalIdentifier(raw)) {
    const pureLabel = humanizeInternalIdentifier(raw);
    if (pureLabel) return pureLabel.slice(0, maxLength);
    if (/^[A-Za-z0-9_\-]+$/.test(raw)) return fallbackText.slice(0, maxLength);
  }
  return replaceEmbeddedInternalIdentifiers(raw).slice(0, maxLength);
}

function cleanDescription(value: unknown, fallback: string, maxLength = 160, minLength = 8) {
  const cleaned = cleanDisplayText(value, "", maxLength);
  return cleaned.length >= minLength && !isLowQualitySemanticText(cleaned) ? cleaned : cleanDisplayText(fallback, "", maxLength);
}

function canonicalDisplayName(value: string) {
  return normalizeGeneratedText(value)
    .toLocaleLowerCase("zh-CN")
    .replace(/[《》“”‘’（）()\[\]【】\s，。！？；：、,.!?;:_-]/g, "");
}

function uniqueDisplayStrings(values: unknown, fallback: string[]) {
  const candidates = Array.isArray(values) ? values : [];
  const seen = new Set<string>();
  const result = candidates
    .map((item) => cleanDisplayText(item, "", 60))
    .filter((item) => {
      const key = canonicalDisplayName(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return result.length ? result : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeInput(input: CourseAbilityGraphInput): CourseAbilityGraphInput {
  return {
    courseName: cleanDisplayText(input.courseName, DEFAULT_INPUT.courseName, 60),
    majorDirection: cleanDisplayText(input.majorDirection, DEFAULT_INPUT.majorDirection, 40),
    region: cleanDisplayText(input.region, DEFAULT_INPUT.region, 40)
  };
}

function buildEdges(rootNode: CourseRootNode, nodes: SkillNode[]): CourseAbilityEdge[] {
  return nodes.map((node) => ({
    id: `${node.parentId}-${node.id}`,
    source: node.parentId === rootNode.id ? rootNode.id : node.parentId,
    target: node.id,
    label: node.parentId === rootNode.id ? "包含" : "细化"
  }));
}

function buildAbilityTree(nodes: SkillNode[]): CourseAbilityTreeNode[] {
  const firstLevel = nodes.filter((node) => node.level === 1);
  return firstLevel.map((node) => ({
    id: node.id,
    name: node.name,
    level: node.level,
    weight: node.weight,
    description: node.description,
    children: nodes
      .filter((child) => child.parentId === node.id)
      .map((child) => ({
        id: child.id,
        name: child.name,
        level: child.level,
        weight: child.weight,
        description: child.description,
        children: []
      }))
  }));
}

function hasStringId(value: unknown): value is { id: string } {
  return isRecord(value) && typeof value.id === "string" && Boolean(value.id.trim());
}

function validArray<T>(value: unknown, validate: (item: unknown) => boolean): value is T[] {
  return Array.isArray(value) && value.length > 0 && value.every(validate);
}

function validOptionalArray<T>(value: unknown, validate: (item: unknown) => boolean): value is T[] {
  return Array.isArray(value) && value.every(validate);
}

function validProcessGraphStage(value: unknown, expectedId: ProcessGraphStageId) {
  if (!isRecord(value)) return false;
  return (
    value.id === expectedId &&
    typeof value.title === "string" &&
    typeof value.lead === "string" &&
    typeof value.summary === "string" &&
    typeof value.notice === "string" &&
    validArray<ProcessGraphNode>(value.nodes, (node) =>
      isRecord(node) &&
      typeof node.id === "string" &&
      typeof node.type === "string" &&
      typeof node.title === "string" &&
      typeof node.subtitle === "string" &&
      typeof node.description === "string" &&
      (node.level === 1 || node.level === 2 || node.level === 3)
    ) &&
    validOptionalArray<ProcessGraphEdge>(value.edges, (edge) => isRecord(edge) && typeof edge.source === "string" && typeof edge.target === "string") &&
    validOptionalArray<ProcessGraphKeyItem>(value.keyItems, (item) => isRecord(item) && typeof item.title === "string" && typeof item.description === "string")
  );
}

function validCoreCourseSuggestion(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.position === "string" &&
    validOptionalArray<string>(value.supportedAbilityNames, (item) => typeof item === "string") &&
    validOptionalArray<string>(value.relatedJobNames, (item) => typeof item === "string")
  );
}

function validWorkflowStage(value: unknown) {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && Array.isArray(value.moduleIds);
}

function validTeachingModule(value: unknown) {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.workflowStageId === "string" && Array.isArray(value.taskIds);
}

function validCourseTask(value: unknown) {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.moduleId === "string";
}

function validCourseAbilityMap(value: unknown) {
  return (
    isRecord(value) &&
    isRecord(value.rootNode) &&
    value.rootNode.id === "course_root" &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges)
  );
}

function validModuleMapping(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.moduleId === "string" &&
    typeof value.moduleName === "string" &&
    isRecord(value.typicalWorkProject) &&
    typeof value.typicalWorkProject.id === "string" &&
    typeof value.typicalWorkProject.name === "string" &&
    Array.isArray(value.mappingDimensions)
  );
}

function validEvidenceSource(value: unknown) {
  return isRecord(value) && typeof value.id === "string" && typeof value.title === "string" && typeof value.summary === "string";
}

function fallbackEvidenceSource(): CourseEvidenceSource {
  return {
    id: "evidence_pending_real_repository",
    title: "待接入真实资料库",
    sourceType: "manual",
    url: null,
    publishDate: null,
    reliability: "low",
    summary: "模型输出未提供证据来源；当前仅保留占位状态，后续需接入真实资料库后校准。"
  };
}

const GENERIC_COURSE_POSITION = /^(专业核心课程|专业基础课程|核心课程|基础课程|专业必修课程|必修课程|建议核心课程)[。.]?$/;

function normalizedCoursePosition(name: string, value: unknown, fallback: string) {
  const position = cleanDisplayText(value, "", 180);
  if (!position || position.length < 8 || GENERIC_COURSE_POSITION.test(position)) return cleanDescription(fallback, fallback, 180);
  return position;
}

function digitalMediaCourseFillers(): CoreCourseSuggestion[] {
  return [
    {
      id: "core_course_digital_image_design",
      name: "数字影像创意设计",
      position: "面向品牌传播与文化表达场景，训练影像创意、视觉风格和数字叙事设计。",
      supportedAbilityNames: ["视觉创意策划", "数字影像设计", "视觉叙事", "风格控制"],
      relatedJobNames: ["数字影像设计师", "视觉设计师", "新媒体设计师"],
      description: "以主题影像项目为载体，完成创意提案、画面设计、影像制作与成果呈现。",
      status: "placeholder"
    },
    {
      id: "core_course_short_video_packaging",
      name: "短视频视觉包装设计",
      position: "面向短视频与融媒体内容生产，训练栏目包装、动态视觉和平台化传播表达。",
      supportedAbilityNames: ["动态视觉设计", "短视频制作", "视听节奏控制", "内容包装"],
      relatedJobNames: ["短视频包装设计师", "动态视觉设计师", "融媒体内容制作员"],
      description: "围绕短视频栏目完成视觉定位、动态版式、声音配合和多平台输出。",
      status: "placeholder"
    },
    {
      id: "core_course_interactive_media",
      name: "交互媒体设计",
      position: "面向数字展陈与互动传播场景，训练信息架构、交互原型和多媒体体验设计。",
      supportedAbilityNames: ["交互原型设计", "信息架构", "多媒体整合", "用户体验评价"],
      relatedJobNames: ["交互设计师", "数字展陈设计师", "多媒体设计师"],
      description: "通过交互媒体项目完成需求分析、体验流程、原型制作和展示测试。",
      status: "placeholder"
    },
    {
      id: "core_course_new_media_communication",
      name: "新媒体视觉传播",
      position: "面向新媒体品牌传播，训练内容策划、视觉系统设计和跨平台传播执行。",
      supportedAbilityNames: ["传播内容策划", "品牌视觉设计", "跨平台适配", "传播效果复盘"],
      relatedJobNames: ["新媒体视觉设计师", "品牌内容设计师", "视觉传播执行"],
      description: "以品牌传播任务串联内容策划、视觉设计、平台适配和传播复盘。",
      status: "placeholder"
    },
    {
      id: "core_course_digital_content_operation",
      name: "数字内容项目策划与运营",
      position: "面向数字内容项目全周期，训练项目策划、协作生产、发布运营和成果评价。",
      supportedAbilityNames: ["项目策划", "生产协作", "内容运营", "数据复盘"],
      relatedJobNames: ["数字内容项目执行", "内容运营专员", "AIGC内容创作者"],
      description: "围绕真实项目完成选题、排期、协作、发布、运营和成果复盘。",
      status: "placeholder"
    }
  ];
}

function rotatingValues(values: string[], index: number, size: number) {
  if (!values.length) return [];
  return Array.from({ length: Math.min(size, values.length) }, (_, offset) => values[(index + offset) % values.length]);
}

function normalizeCoreCourseSuggestions(
  value: unknown,
  fallback: CoreCourseSuggestion[],
  course: CourseAbilityGraphInput,
  warnings: string[]
) {
  const hasValidSuggestions = validArray<CoreCourseSuggestion>(value, validCoreCourseSuggestion);
  if (!hasValidSuggestions) {
    warnings.push("缺少 coreCourseSuggestions，已使用本地示例核心课程建议兜底。");
  }

  const modelSuggestions = hasValidSuggestions ? value : [];
  const currentName = cleanDisplayText(course.courseName, DEFAULT_INPUT.courseName, 80);
  const currentKey = canonicalDisplayName(currentName);
  const fallbackAbilityPool = uniqueDisplayStrings(fallback.flatMap((item) => item.supportedAbilityNames), ["专业综合实践"]);
  const fallbackJobPool = uniqueDisplayStrings(fallback.flatMap((item) => item.relatedJobNames), ["数字内容设计师"]);
  const currentCandidate = modelSuggestions.find((item) => canonicalDisplayName(item.name) === currentKey || item.isCurrentCourse);
  const currentFallback = fallback.find((item) => item.isCurrentCourse) || fallback[0];
  const currentCourse: CoreCourseSuggestion = {
    id: "core_course_current",
    name: currentName,
    position: normalizedCoursePosition(
      currentName,
      currentCandidate?.position,
      `面向${course.majorDirection}专业的综合项目实践，统筹${currentName}相关创意、工具、流程与成果交付训练。`
    ),
    supportedAbilityNames: uniqueDisplayStrings(currentCandidate?.supportedAbilityNames, currentFallback?.supportedAbilityNames || fallbackAbilityPool).slice(0, 5),
    relatedJobNames: uniqueDisplayStrings(currentCandidate?.relatedJobNames, currentFallback?.relatedJobNames || fallbackJobPool).slice(0, 4),
    description: cleanDescription(
      currentCandidate?.description,
      `《${currentName}》是${course.majorDirection}专业核心课程之一，承担综合创作流程与项目实践训练。`,
      180
    ),
    isCurrentCourse: true,
    status: "available"
  };

  const genericCourseName = /^(专业核心课程|专业基础课程|核心课程|基础课程|课程\d*)$/;
  const normalizedModelSuggestions = modelSuggestions
    .map((item, index): CoreCourseSuggestion | null => {
      const name = cleanDisplayText(item.name, "", 80);
      if (!name || canonicalDisplayName(name) === currentKey || item.isCurrentCourse || genericCourseName.test(name)) return null;
      return {
        ...item,
        id: semanticId("core_course", name, index),
        name,
        position: normalizedCoursePosition(
          name,
          item.position,
          `${name}面向${course.majorDirection}专业的典型工作任务，强化专项设计与项目交付能力。`
        ),
        supportedAbilityNames: uniqueDisplayStrings(item.supportedAbilityNames, rotatingValues(fallbackAbilityPool, index, 4)).slice(0, 5),
        relatedJobNames: uniqueDisplayStrings(item.relatedJobNames, rotatingValues(fallbackJobPool, index, 3)).slice(0, 4),
        description: cleanDescription(item.description, `${name}承接专业能力结构中的专项训练任务，并形成可评价的课程成果。`, 180),
        isCurrentCourse: false,
        status: "placeholder"
      };
    })
    .filter((item): item is CoreCourseSuggestion => Boolean(item));
  const seenAbilitySignatures = new Set<string>();
  const seenJobSignatures = new Set<string>();
  const differentiatedModelSuggestions = normalizedModelSuggestions.map((item, index) => {
    const abilitySignature = item.supportedAbilityNames.map(canonicalDisplayName).sort().join("|");
    const jobSignature = item.relatedJobNames.map(canonicalDisplayName).sort().join("|");
    const supportedAbilityNames = seenAbilitySignatures.has(abilitySignature)
      ? rotatingValues(fallbackAbilityPool, index * 2, 4)
      : item.supportedAbilityNames;
    const relatedJobNames = seenJobSignatures.has(jobSignature)
      ? rotatingValues(fallbackJobPool, index * 2, 3)
      : item.relatedJobNames;
    seenAbilitySignatures.add(supportedAbilityNames.map(canonicalDisplayName).sort().join("|"));
    seenJobSignatures.add(relatedJobNames.map(canonicalDisplayName).sort().join("|"));
    return { ...item, relatedJobNames, supportedAbilityNames };
  });

  const domainFillers = /数字媒体|视觉|新媒体|AIGC/i.test(`${course.majorDirection}${currentName}`)
    ? digitalMediaCourseFillers()
    : fallback.filter((item) => !item.isCurrentCourse);
  const seen = new Set<string>([currentKey]);
  const uniqueSuggestions = [currentCourse];
  const candidates = [...differentiatedModelSuggestions, ...domainFillers, ...digitalMediaCourseFillers()];

  candidates.forEach((item, index) => {
    if (uniqueSuggestions.length >= 6) return;
    const name = cleanDisplayText(item.name, "", 80);
    const key = canonicalDisplayName(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    uniqueSuggestions.push({
      ...item,
      id: semanticId("core_course", name, index),
      name,
      position: normalizedCoursePosition(name, item.position, `${name}面向专业典型任务，强化专项设计与项目交付能力。`),
      supportedAbilityNames: uniqueDisplayStrings(item.supportedAbilityNames, rotatingValues(fallbackAbilityPool, index, 4)).slice(0, 5),
      relatedJobNames: uniqueDisplayStrings(item.relatedJobNames, rotatingValues(fallbackJobPool, index, 3)).slice(0, 4),
      description: cleanDescription(item.description, `${name}承接专业能力结构中的专项训练任务，并形成可评价的课程成果。`, 180),
      isCurrentCourse: false,
      status: "placeholder"
    });
  });

  const rawNameCount = modelSuggestions.filter((item) => cleanDisplayText(item.name, "", 80)).length;
  const uniqueModelNameCount = new Set(modelSuggestions.map((item) => canonicalDisplayName(item.name)).filter(Boolean)).size;
  if (rawNameCount > uniqueModelNameCount) warnings.push("CORE_COURSE_SUGGESTIONS_DEDUPED");
  if (uniqueSuggestions.length > uniqueModelNameCount) warnings.push("CORE_COURSE_SUGGESTIONS_LOCAL_SUPPLEMENT");
  if (!currentCandidate) warnings.push("coreCourseSuggestions 缺少当前课程入口，已自动补充当前课程入口。");

  return uniqueSuggestions.slice(0, 6);
}

function normalizeProcessGraphStageText(stage: ProcessGraphStage): ProcessGraphStage {
  const nodes = stage.nodes.map((node) => {
    const title = cleanDisplayText(node.title, "未命名节点", 80);
    return {
      ...node,
      title,
      subtitle: cleanDisplayText(node.subtitle, "图谱节点", 60),
      description: cleanDescription(node.description, `${title}用于说明${stage.title}中的关键推导关系。`, 180),
      tags: uniqueDisplayStrings(node.tags, []).slice(0, 3)
    };
  });

  let visibleNodes = nodes;
  if (stage.id === "majorAbilities") {
    const levelOneNodes = nodes.filter((node) => node.level === 1);
    const levelTwoNodes = nodes.filter((node) => node.level === 2);
    const preferredLevelTwoIds = new Set<string>();
    levelOneNodes.forEach((ability) => {
      const firstElement = stage.edges.find((edge) => edge.source === ability.id && levelTwoNodes.some((node) => node.id === edge.target));
      if (firstElement) preferredLevelTwoIds.add(firstElement.target);
    });
    levelTwoNodes.forEach((node) => {
      if (preferredLevelTwoIds.size < 8) preferredLevelTwoIds.add(node.id);
    });
    visibleNodes = nodes.filter((node) => node.level !== 2 || preferredLevelTwoIds.has(node.id));
  }

  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  return {
    ...stage,
    title: cleanDisplayText(stage.title, "图谱生成过程", 60),
    lead: cleanDescription(stage.lead, "从上游需求逐层推导课程建设内容。", 120),
    summary: cleanDescription(stage.summary, "当前图谱展示上游来源、中间拆解与下游课程建设结果之间的关系。", 220),
    notice: DRAFT_EVIDENCE_NOTICE,
    nodes: visibleNodes,
    edges: stage.edges
      .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
      .map((edge) => ({ ...edge, label: edge.label ? cleanDisplayText(edge.label, "", 30) : undefined })),
    keyItems: stage.keyItems.slice(0, 6).map((item) => ({
      ...item,
      title: cleanDisplayText(item.title, "关键条目", 80),
      description: cleanDescription(item.description, "用于说明该阶段的关键推导结论。", 180),
      metric: item.metric ? cleanDisplayText(item.metric, "", 40) : undefined
    }))
  };
}

function rebuildCoreCourseGraph(baseGraph: ProcessGraphStage, suggestions: CoreCourseSuggestion[]): ProcessGraphStage {
  const abilityNodes = baseGraph.nodes.filter((node) => node.level === 1).slice(0, 8);
  const courseNodes = suggestions.map<ProcessGraphNode>((course) => ({
    id: course.id,
    type: "coreCourse",
    title: course.name,
    subtitle: course.isCurrentCourse ? "当前课程能力图谱入口" : "建议核心课程",
    description: course.description || course.position,
    level: 2,
    tags: course.supportedAbilityNames.slice(0, 3),
    weight: course.isCurrentCourse ? 100 : undefined
  }));
  const positionNodes = suggestions.map<ProcessGraphNode>((course) => ({
    id: `${course.id}_position`,
    type: "coursePosition",
    title: course.status === "available" ? "可查看课程能力图谱" : "后续可生成课程能力图谱",
    subtitle: "课程定位 / 支撑岗位",
    description: `${course.position} 支撑岗位：${course.relatedJobNames.join("、")}。`,
    level: 3,
    tags: course.relatedJobNames.slice(0, 2)
  }));

  const abilityEdges = suggestions.flatMap<ProcessGraphEdge>((course, courseIndex) => {
    const related = abilityNodes.filter((ability) =>
      course.supportedAbilityNames.some((name) => {
        const abilityKey = canonicalDisplayName(ability.title);
        const nameKey = canonicalDisplayName(name);
        return abilityKey === nameKey || abilityKey.includes(nameKey) || nameKey.includes(abilityKey);
      })
    );
    const targets = related.length ? related.slice(0, 3) : rotatingValues(abilityNodes.map((node) => node.id), courseIndex, 3).map((id) => abilityNodes.find((node) => node.id === id)!).filter(Boolean);
    return targets.map((ability) => ({ source: ability.id, target: course.id, label: course.isCurrentCourse ? "重点支撑" : "支撑" }));
  });

  return normalizeProcessGraphStageText({
    ...baseGraph,
    id: "coreCourses",
    title: "专业核心课程建设建议",
    lead: "从专业能力结构推导专业核心课程体系。",
    summary: "从专业能力类别出发形成差异化核心课程建议，并说明每门课程的定位、支撑岗位和后续生成状态。",
    nodes: [...abilityNodes, ...courseNodes, ...positionNodes],
    edges: [
      ...abilityEdges,
      ...suggestions.map<ProcessGraphEdge>((course) => ({ source: course.id, target: `${course.id}_position`, label: "定位" }))
    ],
    keyItems: suggestions.map((course) => ({
      title: course.name,
      description: course.position,
      metric: course.status === "available" ? "可查看图谱" : "后续可生成"
    }))
  });
}

function alignProcessStageWithTeachingModules(stage: ProcessGraphStage, teachingModules: TeachingModuleNode[]) {
  if (!teachingModules.length || stage.id === "coreCourses") return stage;
  const oldCourseModuleIds = new Set(stage.nodes.filter((node) => node.type === "courseModule").map((node) => node.id));
  const nonModuleNodes = stage.nodes
    .filter((node) => node.type !== "courseModule")
    .map((node, index) => {
      if (!node.relatedModuleIds?.length) return node;
      const relationCount = Math.min(2, Math.max(1, node.relatedModuleIds.length));
      return {
        ...node,
        relatedModuleIds: rotatingValues(teachingModules.map((module) => module.id), index, relationCount)
      };
    });

  if (!oldCourseModuleIds.size) return normalizeProcessGraphStageText({ ...stage, nodes: nonModuleNodes });

  const moduleNodes = teachingModules.map<ProcessGraphNode>((module) => ({
    id: `${stage.id}_module_${module.id}`,
    type: "courseModule",
    title: cleanDisplayText(module.name, "教学模块", 70),
    subtitle: module.hours ? `${module.hours} 学时` : "课程模块",
    description: cleanDescription(module.description, "围绕典型工作任务组织知识、技能训练与项目成果。", 180),
    level: 3,
    relatedModuleIds: [module.id]
  }));
  const middleNodes = nonModuleNodes.filter((node) => node.level === 2);
  const retainedEdges = stage.edges.filter((edge) => !oldCourseModuleIds.has(edge.source) && !oldCourseModuleIds.has(edge.target));
  const moduleEdges = middleNodes.flatMap<ProcessGraphEdge>((node, index) =>
    rotatingValues(moduleNodes.map((module) => module.id), index, Math.min(2, moduleNodes.length)).map((target) => ({
      source: node.id,
      target,
      label: "支撑"
    }))
  );

  return normalizeProcessGraphStageText({
    ...stage,
    nodes: [...nonModuleNodes, ...moduleNodes],
    edges: [...retainedEdges, ...moduleEdges]
  });
}

function normalizeAbilityTreeDisplay(nodes: CourseAbilityTreeNode[]): CourseAbilityTreeNode[] {
  return nodes.map((node, index) => ({
    ...node,
    name: cleanDisplayText(node.name, `专业能力${index + 1}`, 80),
    description: cleanDescription(node.description, "围绕课程项目形成可执行、可评价的专业能力。", 180),
    children: node.children ? normalizeAbilityTreeDisplay(node.children) : undefined
  }));
}

function normalizeCourseMappingDisplay(mappings: CourseMapping[]): CourseMapping[] {
  return mappings.map((mapping) => ({
    ...mapping,
    abilityName: cleanDisplayText(mapping.abilityName, "课程能力", 80),
    parentAbilityName: mapping.parentAbilityName ? cleanDisplayText(mapping.parentAbilityName, "", 80) : undefined,
    typicalWorkProject: {
      ...mapping.typicalWorkProject,
      name: cleanDisplayText(mapping.typicalWorkProject.name, "典型工作项目", 80),
      description: cleanDescription(mapping.typicalWorkProject.description, "围绕典型工作任务组织课程项目实施与成果交付。", 180)
    },
    mappingDimensions: mapping.mappingDimensions.map((dimension) => ({
      ...dimension,
      title: cleanDisplayText(dimension.title, DIMENSION_TITLES[dimension.key], 60),
      items: dimension.items.map((item) => ({
        ...item,
        text: cleanDisplayText(item.text, "课程建设要点", 100),
        description: item.description ? cleanDescription(item.description, "用于说明课程建设维度中的具体要求。", 180) : undefined
      }))
    })),
    teachingModules: mapping.teachingModules.map((module) => ({
      ...module,
      title: cleanDisplayText(module.title, "教学模块", 80),
      description: module.description ? cleanDescription(module.description, "围绕典型任务组织教学活动与成果评价。", 180) : undefined
    }))
  }));
}

function normalizeMeta(value: unknown, sourceFallback: CourseAbilityGraphMeta["source"], warnings: string[]): CourseAbilityGraphMeta {
  const meta = isRecord(value) ? value : {};
  const source = meta.source === "model" || meta.source === "mock" || meta.source === "mock-fallback" ? meta.source : sourceFallback;
  if (!("source" in meta)) warnings.push("缺少 meta.source，已自动补充 source。");

  const existingWarnings = Array.isArray(meta.warnings) ? meta.warnings.filter((item): item is string => typeof item === "string") : [];
  return {
    generatedAt: typeof meta.generatedAt === "string" ? meta.generatedAt : new Date().toISOString(),
    model: typeof meta.model === "string" ? meta.model : source === "model" ? "model-output" : "local-example",
    provider: typeof meta.provider === "string" ? meta.provider : "capability-map",
    source,
    warnings: Array.from(new Set([DATA_NOTICE, ...existingWarnings, ...warnings]))
  };
}

function dimensionItems(moduleId: string, key: CourseMappingDimensionKey, items: Array<{ text: string; description?: string }>): CourseMappingDimension {
  return {
    key,
    title: DIMENSION_TITLES[key],
    items: items.map((item, index) => ({
      id: `${moduleId}_${key}_${index + 1}`,
      text: item.text,
      description: item.description
    }))
  };
}

function dimensions(moduleId: string, seed: Record<CourseMappingDimensionKey, Array<{ text: string; description?: string }>>): CourseMappingDimension[] {
  return DIMENSION_ORDER.map((key) => dimensionItems(moduleId, key, seed[key]));
}

function createModuleMapping(input: {
  moduleId: string;
  moduleName: string;
  hours?: number;
  typicalProjectName: string;
  typicalProjectDescription: string;
  focus: string;
  artifact: string;
  workflow: string[];
  skills: string[];
  knowledge: string[];
  assessment: string[];
  standards: string[];
}): ModuleMapping {
  return {
    moduleId: input.moduleId,
    moduleName: input.moduleName,
    hours: input.hours,
    typicalWorkProject: {
      id: `work_project_${input.moduleId}`,
      name: input.typicalProjectName,
      description: input.typicalProjectDescription
    },
    mappingDimensions: dimensions(input.moduleId, {
      coreTasks: [
        { text: `明确${input.focus}的任务目标与交付标准` },
        { text: `完成${input.artifact}的关键制作任务` },
        { text: `根据反馈优化${input.artifact}质量` }
      ],
      standardWorkflow: input.workflow.map((text) => ({ text })),
      coreOccupationalAbilities: input.skills.map((text) => ({ text })),
      assessableSkillPoints: [
        { text: `${input.artifact}完整度与规范性` },
        { text: `${input.focus}的技术准确度和表达清晰度` },
        { text: "过程文件、修改记录和交付说明" }
      ],
      supportingKnowledgePoints: input.knowledge.map((text) => ({ text })),
      assessmentMethods: input.assessment.map((text) => ({ text })),
      enterpriseStandardsOrCertificates: input.standards.map((text) => ({ text }))
    })
  };
}

function buildGenericModuleMappings(course: CourseAbilityGraphInput, modules: TeachingModuleNode[]): ModuleMapping[] {
  return modules.map((module) =>
    createModuleMapping({
      moduleId: module.id,
      moduleName: module.name,
      hours: module.hours,
      typicalProjectName: `${module.name}典型工作项目`,
      typicalProjectDescription: `面向${course.region}地区${course.majorDirection}岗位任务，完成${module.name}相关项目交付。`,
      focus: module.name,
      artifact: `${module.name}项目成果`,
      workflow: ["接收任务", "分析需求", "制定方案", "完成制作", "检查修订", "提交成果"],
      skills: ["项目任务理解能力", "AI 工具辅助制作能力", "过程记录与问题修订能力", "成果展示与说明能力"],
      knowledge: ["课程模块知识", "工作流程规范", "成果质量标准", "工具使用边界"],
      assessment: ["过程记录检查", "阶段成果评审", "作品展示答辩"],
      standards: ["当前为占位映射，后续需接入真实企业标准、大赛证书或课程标准后校准"]
    })
  );
}

function buildModuleMappings(course: CourseAbilityGraphInput, modules: TeachingModuleNode[]): ModuleMapping[] {
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const module = (id: string) => {
    const found = moduleById.get(id);
    if (!found) throw new Error(`Missing module ${id}`);
    return found;
  };

  return [
    {
      moduleId: "script_design",
      moduleName: module("script_design").name,
      hours: module("script_design").hours,
      typicalWorkProject: {
        id: "work_project_script_design",
        name: "撰写动画剧本 / AI辅助剧本与分镜设计",
        description: `面向${course.region}地区影视动画课程短片项目，完成选题、剧本、分镜和前期设定。`
      },
      mappingDimensions: dimensions("script_design", {
        coreTasks: [
          { text: "明确动画剧本结构" },
          { text: "运用 AI 工具辅助生成剧本" },
          { text: "优化剧本创意或片段" },
          { text: "确定动画分镜" }
        ],
        standardWorkflow: [
          { text: "接收任务" },
          { text: "确定选题" },
          { text: "列出剧本关键结构" },
          { text: "撰写提示词" },
          { text: "生成剧本初稿" },
          { text: "优化提示词" },
          { text: "生成剧本细节" },
          { text: "AI 辅助制作分镜" }
        ],
        coreOccupationalAbilities: [
          { text: "能严格执行动画剧本创作规范" },
          { text: "能规范使用 AI 工具" },
          { text: "能自主处理剧本存在的问题" },
          { text: "能团队协作完成剧本及分镜" }
        ],
        assessableSkillPoints: [
          { text: "三幕结构的规范运用" },
          { text: "AI 剧本情节流畅度和故事完整性" },
          { text: "人工优化剧本的熟练度" },
          { text: "分镜的可执行度" }
        ],
        supportingKnowledgePoints: [
          { text: "动画剧本的定义与分类" },
          { text: "动画剧本的经典结构" },
          { text: "AI 辅助动画剧本生成工具" },
          { text: "AI 辅助撰写动画剧本的方法" },
          { text: "AI 辅助制作分镜的方法" }
        ],
        assessmentMethods: [
          { text: "实操考核" },
          { text: "理论笔试" },
          { text: "剧本质量考核" }
        ],
        enterpriseStandardsOrCertificates: [
          { text: "世界职业院校技能大赛相关要求" },
          { text: "数字艺术设计大赛 AIGC 赛道要求" },
          { text: "AI 广告设计相关证书要求" },
          { text: "AI 短视频运营相关证书要求" }
        ]
      })
    },
    createModuleMapping({
      moduleId: "model_generation",
      moduleName: module("model_generation").name,
      hours: module("model_generation").hours,
      typicalProjectName: "AI辅助角色与道具模型生成项目",
      typicalProjectDescription: "围绕课程短片资产需求，完成角色、道具和基础模型的生成、修正与规范交付。",
      focus: "角色与道具模型",
      artifact: "模型资产",
      workflow: ["接收资产清单", "收集造型参考", "生成模型草案", "人工修正结构", "检查拓扑与材质", "提交资产包"],
      skills: ["能把造型设定转化为模型任务", "能使用 AI 或三维工具生成模型初稿", "能判断模型是否满足动画制作要求"],
      knowledge: ["三维模型结构基础", "角色与道具造型规律", "AI模型生成工具使用方法", "拓扑、UV 与材质基础"],
      assessment: ["模型资产阶段评审", "文件命名与归档检查", "模型可动画性检查"],
      standards: ["数字创意作品资产提交规范", "三维模型文件组织规范", "AIGC 作品过程说明要求"]
    }),
    createModuleMapping({
      moduleId: "animation_production",
      moduleName: module("animation_production").name,
      hours: module("animation_production").hours,
      typicalProjectName: "角色绑定与动画镜头制作项目",
      typicalProjectDescription: "基于角色资产完成骨骼绑定、关键动作、镜头表演和动画预览。",
      focus: "角色动作与镜头表演",
      artifact: "动画镜头",
      workflow: ["导入角色资产", "建立骨骼与控制器", "设置关键姿态", "调整动作节奏", "输出预览并修订", "提交动画镜头"],
      skills: ["能完成基础绑定与蒙皮测试", "能制作关键帧动作", "能根据分镜调整表演节奏"],
      knowledge: ["骨骼绑定与蒙皮基础", "动画十二原则", "关键帧、曲线与运动规律", "镜头表演节奏"],
      assessment: ["绑定控制测试", "动作预览评审", "关键帧动画质量评价"],
      standards: ["动画镜头文件版本管理规范", "动画作品集动作镜头展示要求", "职业技能大赛动画任务评价要求"]
    }),
    createModuleMapping({
      moduleId: "scene_building",
      moduleName: module("scene_building").name,
      hours: module("scene_building").hours,
      typicalProjectName: "AI辅助动画场景生成与搭建项目",
      typicalProjectDescription: "依据剧本和分镜完成场景概念、空间搭建、镜头调度、灯光检查和场景渲染。",
      focus: "动画场景空间与渲染",
      artifact: "场景搭建与渲染文件",
      workflow: ["解析场景需求", "生成场景参考", "搭建空间结构", "安排镜头机位", "检查灯光与材质", "输出场景镜头"],
      skills: ["能根据剧本设计场景空间", "能使用 AI 生成场景参考", "能完成场景搭建和镜头组织", "能检查场景渲染输出规范"],
      knowledge: ["场景设计与空间构成", "镜头机位与视觉动线", "AI 场景生成方法", "灯光材质与渲染基础", "资产复用与风格统一"],
      assessment: ["场景空间完整度评价", "镜头调度检查", "场景渲染输出检查", "场景文件规范检查"],
      standards: ["影视动画场景设计任务要求", "数字艺术设计大赛场景表达要求", "AIGC 场景素材使用说明要求"]
    }),
    createModuleMapping({
      moduleId: "render_output",
      moduleName: module("render_output").name,
      hours: module("render_output").hours,
      typicalProjectName: "动画短片渲染、合成、输出与展示项目",
      typicalProjectDescription: "完成音效配音、镜头合成、成片输出、短片展示和项目复盘。",
      focus: "渲染合成与成片展示",
      artifact: "动画短片成片",
      workflow: ["检查镜头与声音素材", "整理音效与配音", "完成剪辑与合成", "统一字幕和片头片尾", "输出成片", "准备展示材料", "完成项目复盘"],
      skills: ["能完成声音素材整理", "能完成动画短片合成输出", "能按输出标准提交成片", "能用岗位语言复盘项目过程"],
      knowledge: ["音效配音与节奏匹配", "剪辑合成基础", "输出格式与色彩基础", "作品展示叙事方法", "项目复盘方法"],
      assessment: ["音效与画面匹配评价", "最终短片质量评价", "输出规格检查", "作品展示答辩", "项目复盘报告评价"],
      standards: ["影视后期输出格式要求", "短视频作品交付规范", "数字艺术设计大赛作品提交要求", "AIGC 作品过程说明要求"]
    })
  ];
}

function createMockCourseAbilityGraph(input: CourseAbilityGraphInput = DEFAULT_INPUT, warnings: string[] = []): CourseAbilityGraphPayload {
  const course = normalizeInput(input);
  const evidenceSources: CourseEvidenceSource[] = [
    {
      id: "evidence_local_synthesis",
      title: "本地归纳：AI动画全流程制作课程能力结构",
      sourceType: "model_synthesis",
      url: null,
      publishDate: null,
      reliability: "medium",
      summary: "基于影视动画课程建设、AI辅助动画流程和职业教育项目化教学的本地示例归纳，不能作为正式引用。"
    },
    {
      id: "evidence_curriculum_placeholder",
      title: "课程标准占位：影视动画实践课程要求",
      sourceType: "curriculum_standard",
      url: null,
      publishDate: null,
      reliability: "medium",
      summary: "字段预留给后续接入真实人才培养方案、课程标准和教学大纲。当前为本地示例数据。"
    },
    {
      id: "evidence_job_placeholder",
      title: "岗位数据占位：AI动画与影视动画岗位",
      sourceType: "job_posting",
      url: null,
      publishDate: null,
      reliability: "low",
      summary: "字段预留给后续招聘数据或产业调研数据。当前不爬取真实岗位，不伪造真实链接。"
    },
    {
      id: "evidence_ai_workflow_placeholder",
      title: "趋势占位：AI辅助动画全流程变化",
      sourceType: "model_synthesis",
      url: null,
      publishDate: null,
      reliability: "medium",
      summary: "用于说明 AI 辅助剧本、分镜、模型生成、动画制作和后期合成对课程内容的影响。"
    }
  ];

  const industryTrends: IndustryTrend[] = [
    {
      id: "trend_ai_full_pipeline",
      name: "AI辅助动画全流程普及",
      description: "AI 工具正在进入剧本、分镜、模型、动作、渲染和合成环节，推动课程从单点技能训练转向全流程项目训练。",
      evidenceSourceIds: ["evidence_ai_workflow_placeholder"]
    },
    {
      id: "trend_aigc_content",
      name: "AIGC内容生产岗位增长",
      description: "影视动画、短视频和数字创意项目更需要能把 AI 输出转化为可控作品的复合型创作者。",
      evidenceSourceIds: ["evidence_local_synthesis", "evidence_job_placeholder"]
    },
    {
      id: "trend_project_showcase",
      name: "项目作品驱动就业评价",
      description: "高校课程成果需要形成完整短片、过程记录和作品集说明，支撑就业展示与课程评价。",
      evidenceSourceIds: ["evidence_curriculum_placeholder", "evidence_job_placeholder"]
    }
  ];

  const relatedJobs: CourseRelatedJob[] = [
    { id: "job_ai_animator", title: "AI动画制作员", relevance: 94, reason: "课程覆盖 AI 辅助剧本、分镜、模型生成、动画制作和合成输出，与岗位全流程能力高度匹配。" },
    { id: "job_storyboard_artist", title: "动画分镜师", relevance: 86, reason: "前期策划阶段训练剧本结构、分镜设计和 AI 参考筛选能力。" },
    { id: "job_3d_animator", title: "三维动画师", relevance: 82, reason: "中期制作阶段保留角色模型、绑定、动画和场景搭建等三维动画核心能力。" },
    { id: "job_aigc_creator", title: "AIGC内容创作者", relevance: 80, reason: "课程强调提示词、生成结果判断、人工优化和合规说明，适合 AIGC 内容生产方向。" },
    { id: "job_post_producer", title: "影视动画后期制作", relevance: 76, reason: "后期合成阶段训练渲染输出、音效配音、合成成片和展示复盘。" },
    { id: "job_digital_project_executor", title: "数字内容项目执行", relevance: 72, reason: "课程要求学生记录项目过程、协同交付和展示复盘，支撑数字内容项目执行岗位。" }
  ];

  const regionalJobMap: RegionalJob[] = [
    { id: "job_ai_animator", title: "AI动画制作员", region: course.region, relevance: 94, trendIds: ["trend_ai_full_pipeline", "trend_aigc_content"], abilityIds: ["script_design", "model_generation", "animation_production", "render_output"] },
    { id: "job_storyboard_artist", title: "动画分镜师", region: course.region, relevance: 86, trendIds: ["trend_ai_full_pipeline"], abilityIds: ["script_design"] },
    { id: "job_3d_animator", title: "三维动画师", region: course.region, relevance: 82, trendIds: ["trend_project_showcase"], abilityIds: ["model_generation", "animation_production", "scene_building"] },
    { id: "job_aigc_creator", title: "AIGC内容创作者", region: course.region, relevance: 80, trendIds: ["trend_aigc_content"], abilityIds: ["script_design", "model_generation", "scene_building"] },
    { id: "job_post_producer", title: "影视动画后期制作", region: course.region, relevance: 76, trendIds: ["trend_project_showcase"], abilityIds: ["render_output"] },
    { id: "job_digital_project_executor", title: "数字内容项目执行", region: course.region, relevance: 72, trendIds: ["trend_aigc_content", "trend_project_showcase"], abilityIds: ["script_design", "render_output"] }
  ];

  const workflowStages: WorkflowStage[] = [
    {
      id: "pre_production",
      name: "前期策划阶段",
      description: "完成动画选题、剧本结构、分镜方案、角色原画和场景概念设定。",
      moduleIds: ["script_design"]
    },
    {
      id: "production",
      name: "中期制作阶段",
      description: "围绕模型生成、绑定动画、场景搭建和镜头制作组织项目化训练。",
      moduleIds: ["model_generation", "animation_production", "scene_building"]
    },
    {
      id: "post_production",
      name: "后期合成阶段",
      description: "完成渲染输出、声音整合、合成成片、作品展示和项目复盘。",
      moduleIds: ["render_output"]
    }
  ];

  const baseModuleProps = {
    evidenceSourceIds: ["evidence_local_synthesis", "evidence_curriculum_placeholder"],
    trendIds: ["trend_ai_full_pipeline", "trend_project_showcase"],
    relatedJobIds: ["job_ai_animator", "job_3d_animator"],
    teachingSuggestions: ["采用完整短片项目贯穿模块", "要求提交过程文件、成果文件和复盘说明"],
    assessmentMethods: ["阶段成果评审", "过程记录检查", "作品质量评价"]
  };

  const teachingModules: TeachingModuleNode[] = [
    {
      ...baseModuleProps,
      id: "script_design",
      name: "动画剧本设定",
      hours: 16,
      description: "完成动画剧本撰写、分镜设计、原画设定和场景设定，建立后续制作的创意依据。",
      workflowStageId: "pre_production",
      taskIds: ["script_writing", "storyboard_design", "original_art_setting", "scene_concept_setting"],
      relatedJobIds: ["job_ai_animator", "job_storyboard_artist", "job_aigc_creator"]
    },
    {
      ...baseModuleProps,
      id: "model_generation",
      name: "动画模型制作",
      hours: 20,
      description: "运用三维工具和 AI 辅助方法完成道具、角色模型生成与优化。",
      workflowStageId: "production",
      taskIds: ["prop_model_generation", "character_model_generation"],
      relatedJobIds: ["job_ai_animator", "job_3d_animator", "job_aigc_creator"]
    },
    {
      ...baseModuleProps,
      id: "animation_production",
      name: "动画制作",
      hours: 24,
      description: "完成骨骼绑定、蒙皮测试、关键帧动作和角色动画镜头制作。",
      workflowStageId: "production",
      taskIds: ["rigging_skinning", "character_animation"],
      relatedJobIds: ["job_ai_animator", "job_3d_animator"]
    },
    {
      ...baseModuleProps,
      id: "scene_building",
      name: "动画场景搭建",
      hours: 16,
      description: "依据分镜和场景设定完成动画场景生成、空间搭建、镜头组织和场景渲染。",
      workflowStageId: "production",
      taskIds: ["scene_generation", "scene_render"],
      relatedJobIds: ["job_3d_animator", "job_aigc_creator"]
    },
    {
      ...baseModuleProps,
      id: "render_output",
      name: "动画渲染输出",
      hours: 12,
      description: "完成动画音效与配音、合成输出、短片展示和项目复盘，形成完整课程作品。",
      workflowStageId: "post_production",
      taskIds: ["sound_dubbing", "composition_output", "shortfilm_showcase"],
      relatedJobIds: ["job_post_producer", "job_ai_animator"]
    }
  ];

  const task = (
    id: string,
    name: string,
    moduleId: string,
    description: string,
    abilityTags: string[],
    aiTools: string[] = []
  ): CourseTaskNode => ({
    id,
    name,
    moduleId,
    description,
    abilityTags,
    aiTools,
    relatedJobIds: teachingModules.find((module) => module.id === moduleId)?.relatedJobIds || ["job_ai_animator"],
    evidenceSourceIds: ["evidence_local_synthesis", "evidence_ai_workflow_placeholder"],
    trendIds: ["trend_ai_full_pipeline", "trend_project_showcase"],
    teachingSuggestions: ["以任务成果、过程记录和问题修订作为评价依据"],
    assessmentMethods: ["任务成果质量", "过程记录完整度", "课堂展示与答辩"]
  });

  const tasks: CourseTaskNode[] = [
    task("script_writing", "动画剧本撰写", "script_design", "围绕主题完成三幕结构、角色动机和关键情节设计。", ["剧本结构", "叙事表达"], ["AI剧本生成工具"]),
    task("storyboard_design", "动画分镜设计", "script_design", "将剧本转化为镜头、景别、动作和节奏信息。", ["镜头语言", "分镜表达"], ["AI分镜工具"]),
    task("original_art_setting", "动画原画设定", "script_design", "完成角色造型、画面风格和关键视觉设定。", ["视觉设定", "风格表达"], ["AI图像生成工具"]),
    task("scene_concept_setting", "动画场景设定", "script_design", "明确场景空间、氛围、道具和叙事功能。", ["场景设计", "空间叙事"], ["AI场景参考工具"]),
    task("prop_model_generation", "道具模型生成与优化", "model_generation", "生成并修正道具模型，使其满足镜头展示和资产规范。", ["模型生成", "资产优化"], ["AI模型生成工具"]),
    task("character_model_generation", "角色模型生成与优化", "model_generation", "完成角色模型生成、结构修正、材质基础和可动画检查。", ["角色建模", "资产规范"], ["AI模型生成工具"]),
    task("rigging_skinning", "骨骼绑定与蒙皮", "animation_production", "完成角色骨骼、控制器、蒙皮和动作测试。", ["角色绑定", "动作测试"]),
    task("character_animation", "角色动画制作", "animation_production", "根据分镜完成关键帧、动作节奏和角色表演。", ["关键帧动画", "角色表演"], ["动作参考生成工具"]),
    task("scene_generation", "动画场景生成", "scene_building", "结合 AI 参考与三维工具完成场景搭建和镜头空间组织。", ["场景生成", "镜头组织"], ["AI场景生成工具"]),
    task("scene_render", "动画场景渲染", "scene_building", "完成灯光、材质检查、渲染参数和场景镜头输出。", ["灯光渲染", "输出规范"]),
    task("sound_dubbing", "动画音效与配音", "render_output", "根据剧情节奏整理音效、配音和声音层次。", ["音效配音", "节奏匹配"], ["AI配音工具"]),
    task("composition_output", "动画合成与输出", "render_output", "整合镜头、声音、字幕和片头片尾，输出完整短片。", ["合成输出", "成片交付"]),
    task("shortfilm_showcase", "动画短片展示", "render_output", "完成作品展示、项目说明、复盘报告和答辩表达。", ["作品展示", "项目复盘"])
  ];

  const rootNode: CourseRootNode = {
    id: "course_root",
    name: `课程：${course.courseName}`,
    weight: 100,
    description: `${course.courseName}是${course.majorDirection}专业面向 AI 动画制作、AIGC 内容创作和影视动画后期岗位的项目化课程，强调从剧本、分镜、模型、动画、渲染到合成展示的完整流程。`,
    relatedJobIds: relatedJobs.map((job) => job.id),
    evidenceSourceIds: ["evidence_local_synthesis", "evidence_curriculum_placeholder"],
    trendIds: industryTrends.map((trend) => trend.id),
    coreAbilityNodeIds: workflowStages.map((stage) => stage.id),
    x: 520,
    y: 330
  };

  const nodes: SkillNode[] = [
    ...workflowStages.map<SkillNode>((stage, index) => ({
      id: stage.id,
      name: stage.name,
      level: 1,
      parentId: rootNode.id,
      weight: [24, 48, 28][index] || 20,
      description: stage.description || "",
      relatedJobIds: relatedJobs.map((job) => job.id),
      evidenceSourceIds: ["evidence_local_synthesis", "evidence_curriculum_placeholder"],
      trendIds: industryTrends.map((trend) => trend.id),
      teachingSuggestions: ["按工作流程组织项目任务", "要求学生提交阶段成果和过程记录"],
      assessmentMethods: ["流程完整度", "阶段成果评审", "项目复盘"],
      x: 240 + index * 280,
      y: 180
    })),
    ...tasks.map<SkillNode>((taskNode, index) => {
      const module = teachingModules.find((item) => item.id === taskNode.moduleId);
      return {
        id: taskNode.id,
        name: taskNode.name,
        level: 2,
        parentId: module?.workflowStageId || workflowStages[0].id,
        weight: 6 + (index % 4),
        description: taskNode.description || "",
        relatedJobIds: taskNode.relatedJobIds,
        evidenceSourceIds: taskNode.evidenceSourceIds,
        trendIds: taskNode.trendIds,
        teachingSuggestions: taskNode.teachingSuggestions,
        assessmentMethods: taskNode.assessmentMethods,
        x: 100 + (index % 7) * 130,
        y: 440 + Math.floor(index / 7) * 160
      };
    })
  ];

  const courseAbilityMap: CourseAbilityMap = {
    rootNode,
    nodes,
    edges: buildEdges(rootNode, nodes)
  };

  const moduleMappings = buildModuleMappings(course, teachingModules);

  const skillWeights: CourseSkillWeight[] = [
    { skill: "剧本与分镜设计", weight: 16, description: "完成故事结构、分镜设计、原画设定和前期视觉规划。" },
    { skill: "AI工具使用", weight: 16, description: "规范使用 AI 辅助剧本、分镜、模型、场景和配音工具。" },
    { skill: "模型生成与优化", weight: 18, description: "完成角色、道具模型生成、结构修正和资产规范检查。" },
    { skill: "动画制作", weight: 18, description: "完成绑定、关键帧、动作节奏和角色表演镜头制作。" },
    { skill: "场景搭建", weight: 12, description: "完成动画场景生成、空间组织和镜头调度。" },
    { skill: "渲染合成与输出", weight: 12, description: "完成渲染、声音、合成、输出和素材归档。" },
    { skill: "项目展示与评价", weight: 8, description: "完成短片展示、过程说明、复盘报告和岗位化表达。" }
  ];

  const majorAbilityMap: MajorAbility[] = [
    {
      id: "major_ai_pipeline",
      name: "AI动画全流程制作能力",
      description: "从剧本、分镜、模型、动画、渲染到合成展示组织完整课程项目。",
      jobIds: ["job_ai_animator", "job_aigc_creator"],
      trendIds: ["trend_ai_full_pipeline"],
      courseAbilityIds: teachingModules.map((module) => module.id)
    },
    {
      id: "major_visual_animation",
      name: "影视动画视觉表达能力",
      description: "通过镜头、角色、场景、动作和渲染表达动画叙事与视觉风格。",
      jobIds: ["job_storyboard_artist", "job_3d_animator", "job_post_producer"],
      trendIds: ["trend_project_showcase"],
      courseAbilityIds: ["script_design", "animation_production", "render_output"]
    },
    {
      id: "major_aigc_creation",
      name: "AIGC内容创作与人工优化能力",
      description: "能判断、筛选和修订 AI 生成结果，并形成可交付课程作品。",
      jobIds: ["job_aigc_creator", "job_ai_animator"],
      trendIds: ["trend_aigc_content"],
      courseAbilityIds: ["script_design", "model_generation", "scene_building"]
    }
  ];

  const moduleName = (moduleId: string) => teachingModules.find((module) => module.id === moduleId)?.name || moduleId;
  const moduleDescription = (moduleId: string) => teachingModules.find((module) => module.id === moduleId)?.description || "";
  const moduleHours = (moduleId: string) => teachingModules.find((module) => module.id === moduleId)?.hours || 0;

  const industryGraph: ProcessGraphStage = {
    id: "industry",
    title: "产业图谱",
    lead: "从产业变化识别课程内容更新方向。",
    summary: "以数字创意产业、影视动画内容生产和 AIGC 动画生产为上游，拆解 AI 工具带来的生产变化，再推导课程内容更新方向。",
    notice: DATA_NOTICE,
    nodes: [
      { id: "industry_digital_creative", type: "industry", title: "数字创意产业", subtitle: "产业领域", description: "本地示例中的上位产业方向，强调数字内容策划、制作、分发和项目化交付。", level: 1, tags: ["本地示例"] },
      { id: "industry_animation_content", type: "industry", title: "影视动画内容生产", subtitle: "产业领域", description: "围绕短片、镜头、角色、场景、后期合成和作品展示形成的内容生产场景。", level: 1, tags: ["本地示例"] },
      { id: "industry_aigc_animation", type: "industry", title: "AIGC 动画生产", subtitle: "产业领域", description: "以 AI 辅助剧本、分镜、模型、场景和配音为代表的动画生产方式变化。", level: 1, tags: ["本地示例"] },
      { id: "trend_script_storyboard", type: "trend", title: "AI 辅助剧本与分镜", subtitle: "生产变化", description: "AI 参与选题、剧本草案、分镜参考和镜头拆解，要求课程加入提示词、筛选与人工优化训练。", level: 2, relatedModuleIds: ["script_design"] },
      { id: "trend_image_character", type: "trend", title: "AI 图像生成与角色设计", subtitle: "生产变化", description: "通过文生图、图生图与风格参考生成角色、原画和视觉设定，课程需训练审美判断与设定一致性。", level: 2, relatedModuleIds: ["script_design", "model_generation"] },
      { id: "trend_model_generation", type: "trend", title: "AI 辅助三维模型生成", subtitle: "生产变化", description: "AI 模型生成进入角色、道具和基础资产制作环节，但仍需要结构修正、资产规范和可动画检查。", level: 2, relatedModuleIds: ["model_generation"] },
      { id: "trend_animation_compositing", type: "trend", title: "AI 辅助动画与合成", subtitle: "生产变化", description: "动作参考、配音、合成与输出环节开始被 AI 工具辅助，课程需保留动画规律和人工质量把关。", level: 2, relatedModuleIds: ["animation_production", "render_output"] },
      { id: "trend_multi_tool_pipeline", type: "trend", title: "多工具协同生产流程", subtitle: "生产变化", description: "数字内容生产从单一软件操作转向多工具协同、过程记录和项目化交付。", level: 2, relatedModuleIds: ["scene_building", "render_output"] },
      { id: "impact_ai_toolchain", type: "impact", title: "课程需要加入 AI 工具链", subtitle: "课程影响", description: "课程应把 AI 剧本、图像、模型、配音和辅助合成纳入教学任务，但不把 AI 输出当成最终答案。", level: 3, relatedModuleIds: ["script_design", "model_generation", "render_output"] },
      { id: "impact_project_workflow", type: "impact", title: "课程需要强化项目化流程", subtitle: "课程影响", description: "课程组织方式应从单点技能练习转为完整短片项目，强调阶段成果、过程记录和团队协同。", level: 3, relatedModuleIds: teachingModules.map((module) => module.id) },
      { id: "impact_full_pipeline", type: "impact", title: "覆盖从剧本到输出的全流程", subtitle: "课程影响", description: "课程能力图谱需要覆盖剧本、分镜、模型、动画、场景、渲染合成和作品展示。", level: 3, relatedModuleIds: teachingModules.map((module) => module.id) },
      { id: "impact_showcase_assessment", type: "impact", title: "强化作品展示与评价", subtitle: "课程影响", description: "课程最终成果需要能转化为作品展示、复盘报告和岗位化表达。", level: 3, relatedModuleIds: ["render_output"] }
    ],
    edges: [
      { source: "industry_digital_creative", target: "trend_multi_tool_pipeline", label: "推动" },
      { source: "industry_digital_creative", target: "trend_image_character", label: "影响" },
      { source: "industry_animation_content", target: "trend_script_storyboard", label: "拆解" },
      { source: "industry_animation_content", target: "trend_animation_compositing", label: "影响" },
      { source: "industry_aigc_animation", target: "trend_script_storyboard", label: "推动" },
      { source: "industry_aigc_animation", target: "trend_image_character", label: "推动" },
      { source: "industry_aigc_animation", target: "trend_model_generation", label: "推动" },
      { source: "industry_aigc_animation", target: "trend_animation_compositing", label: "推动" },
      { source: "trend_script_storyboard", target: "impact_ai_toolchain", label: "要求" },
      { source: "trend_image_character", target: "impact_ai_toolchain", label: "要求" },
      { source: "trend_model_generation", target: "impact_ai_toolchain", label: "要求" },
      { source: "trend_multi_tool_pipeline", target: "impact_project_workflow", label: "要求" },
      { source: "trend_script_storyboard", target: "impact_full_pipeline", label: "支撑" },
      { source: "trend_model_generation", target: "impact_full_pipeline", label: "支撑" },
      { source: "trend_animation_compositing", target: "impact_full_pipeline", label: "支撑" },
      { source: "trend_animation_compositing", target: "impact_showcase_assessment", label: "导向" },
      { source: "trend_multi_tool_pipeline", target: "impact_showcase_assessment", label: "导向" }
    ],
    keyItems: [
      { title: "三层推导", description: "产业领域 → 技术趋势 / 生产变化 → 课程影响。", metric: "本地示例" },
      { title: "课程更新方向", description: "加入 AI 工具链、强化项目化流程、覆盖全流程、强化展示评价。", metric: "4 类影响" },
      { title: "证据状态", description: DATA_NOTICE, metric: "不可正式引用" }
    ]
  };

  const regionalIndustryNodes: ProcessGraphNode[] = [
    { id: "region_animation_content", type: "region", title: `${course.region}影视动画内容生产`, subtitle: "区域产业方向", description: "本地示例中的区域内容生产方向，面向动画短片、镜头制作与后期交付。", level: 1 },
    { id: "region_digital_project", type: "region", title: "数字内容项目执行", subtitle: "区域产业方向", description: "强调数字内容项目的任务拆解、过程协同、交付检查和复盘展示。", level: 1 },
    { id: "region_aigc_content", type: "region", title: "AIGC 内容生产", subtitle: "区域产业方向", description: "围绕 AI 辅助图文、视频、动画素材和短片内容的本地示例生产方向。", level: 1 },
    { id: "region_short_video", type: "region", title: "文化创意与短视频内容制作", subtitle: "区域产业方向", description: "面向文化创意传播、短视频包装和数字内容表达的本地示例方向。", level: 1 }
  ];

  const regionalJobGraph: ProcessGraphStage = {
    id: "regionalJobs",
    title: "区域岗位图谱",
    lead: "从区域岗位需求定位课程服务对象。",
    summary: `围绕${course.region}地区影视动画与数字内容岗位，表达区域产业方向、典型岗位和课程模块之间的对应关系。`,
    notice: DATA_NOTICE,
    nodes: [
      ...regionalIndustryNodes,
      ...regionalJobMap.map<ProcessGraphNode>((job) => ({
        id: job.id,
        type: "job",
        title: job.title,
        subtitle: `相关度 ${job.relevance}%`,
        description: `${job.title}要求学生具备 ${job.abilityIds.map(moduleName).join("、")} 等课程模块支撑的岗位能力。当前相关度为本地示例，不代表真实招聘统计。`,
        level: 2,
        tags: job.abilityIds.map(moduleName),
        weight: job.relevance,
        relatedModuleIds: job.abilityIds
      })),
      ...teachingModules.map<ProcessGraphNode>((module) => ({
        id: `regional_module_${module.id}`,
        type: "courseModule",
        title: module.name,
        subtitle: module.hours ? `${module.hours} 学时` : "课程模块",
        description: module.description || "",
        level: 3,
        relatedModuleIds: [module.id]
      }))
    ],
    edges: [
      { source: "region_animation_content", target: "job_ai_animator", label: "对应" },
      { source: "region_animation_content", target: "job_storyboard_artist", label: "对应" },
      { source: "region_animation_content", target: "job_3d_animator", label: "对应" },
      { source: "region_digital_project", target: "job_digital_project_executor", label: "对应" },
      { source: "region_digital_project", target: "job_post_producer", label: "对应" },
      { source: "region_aigc_content", target: "job_ai_animator", label: "对应" },
      { source: "region_aigc_content", target: "job_aigc_creator", label: "对应" },
      { source: "region_short_video", target: "job_aigc_creator", label: "对应" },
      { source: "region_short_video", target: "job_post_producer", label: "对应" },
      ...regionalJobMap.flatMap<ProcessGraphEdge>((job) =>
        job.abilityIds.map((abilityId) => ({
          source: job.id,
          target: `regional_module_${abilityId}`,
          label: "支撑"
        }))
      )
    ],
    keyItems: regionalJobMap.map((job) => ({
      title: job.title,
      description: `关联 ${job.abilityIds.length} 个课程模块：${job.abilityIds.map(moduleName).join("、")}。`,
      metric: `相关度 ${job.relevance}%`
    }))
  };

  const majorAbilityGraph: ProcessGraphStage = {
    id: "majorAbilities",
    title: "专业能力图谱",
    lead: "从岗位能力抽取专业能力结构。",
    summary: `${course.majorDirection}专业能力结构以七类能力为上游，拆解能力要素，再映射到《${course.courseName}》五个教学模块。`,
    notice: DATA_NOTICE,
    nodes: [
      ...skillWeights.map<ProcessGraphNode>((skill) => ({
        id: `major_skill_${skill.skill}`,
        type: "ability",
        title: skill.skill,
        subtitle: `权重 ${skill.weight}%`,
        description: skill.description,
        level: 1,
        weight: skill.weight,
        tags: ["本地示例权重"]
      })),
      { id: "element_story_structure", type: "element", title: "故事结构设计", subtitle: "能力要素", description: "能把主题转化为故事结构、角色动机和关键情节。", level: 2, relatedModuleIds: ["script_design"] },
      { id: "element_storyboard_expression", type: "element", title: "分镜表达", subtitle: "能力要素", description: "能将剧本转化为镜头、景别、动作和节奏信息。", level: 2, relatedModuleIds: ["script_design"] },
      { id: "element_visual_narrative", type: "element", title: "视觉叙事", subtitle: "能力要素", description: "能通过角色、场景、镜头和画面风格表达动画叙事。", level: 2, relatedModuleIds: ["script_design", "scene_building"] },
      { id: "element_text_to_image", type: "element", title: "文生图", subtitle: "能力要素", description: "能使用文本提示生成角色、场景或风格参考，并进行人工筛选。", level: 2, relatedModuleIds: ["script_design", "scene_building"] },
      { id: "element_image_to_image", type: "element", title: "图生图", subtitle: "能力要素", description: "能基于草图或参考图进行风格延展、设定优化和视觉统一。", level: 2, relatedModuleIds: ["script_design", "model_generation"] },
      { id: "element_ai_storyboard", type: "element", title: "AI 分镜", subtitle: "能力要素", description: "能使用 AI 工具辅助分镜参考生成，并判断镜头可执行性。", level: 2, relatedModuleIds: ["script_design"] },
      { id: "element_ai_video_assist", type: "element", title: "AI 视频辅助", subtitle: "能力要素", description: "能把 AI 辅助动作、配音或合成输出纳入动画制作流程。", level: 2, relatedModuleIds: ["animation_production", "render_output"] },
      { id: "element_character_model", type: "element", title: "角色模型", subtitle: "能力要素", description: "能完成角色模型生成、修正、材质基础和可动画检查。", level: 2, relatedModuleIds: ["model_generation"] },
      { id: "element_prop_model", type: "element", title: "道具模型", subtitle: "能力要素", description: "能生成并修正道具模型，使其满足镜头展示和资产规范。", level: 2, relatedModuleIds: ["model_generation"] },
      { id: "element_asset_optimization", type: "element", title: "资产优化", subtitle: "能力要素", description: "能检查模型拓扑、材质、文件命名、资产归档和后续可用性。", level: 2, relatedModuleIds: ["model_generation", "scene_building"] },
      { id: "element_keyframe_motion", type: "element", title: "关键帧动作", subtitle: "能力要素", description: "能完成关键姿态、动作节奏和角色表演镜头制作。", level: 2, relatedModuleIds: ["animation_production"] },
      { id: "element_scene_space", type: "element", title: "场景空间组织", subtitle: "能力要素", description: "能依据剧本和分镜完成场景生成、空间搭建和镜头组织。", level: 2, relatedModuleIds: ["scene_building"] },
      { id: "element_render_composite", type: "element", title: "渲染合成", subtitle: "能力要素", description: "能完成灯光、材质、剪辑、声音、字幕和成片输出检查。", level: 2, relatedModuleIds: ["render_output"] },
      { id: "element_showcase_review", type: "element", title: "项目展示复盘", subtitle: "能力要素", description: "能用岗位语言展示作品、说明过程并完成项目复盘。", level: 2, relatedModuleIds: ["render_output"] },
      ...teachingModules.map<ProcessGraphNode>((module) => ({
        id: `major_module_${module.id}`,
        type: "courseModule",
        title: module.name,
        subtitle: module.hours ? `${module.hours} 学时` : "课程模块",
        description: moduleDescription(module.id),
        level: 3,
        relatedModuleIds: [module.id]
      }))
    ],
    edges: [
      { source: "major_skill_剧本与分镜设计", target: "element_story_structure", label: "拆解" },
      { source: "major_skill_剧本与分镜设计", target: "element_storyboard_expression", label: "拆解" },
      { source: "major_skill_剧本与分镜设计", target: "element_visual_narrative", label: "拆解" },
      { source: "major_skill_AI工具使用", target: "element_text_to_image", label: "拆解" },
      { source: "major_skill_AI工具使用", target: "element_image_to_image", label: "拆解" },
      { source: "major_skill_AI工具使用", target: "element_ai_storyboard", label: "拆解" },
      { source: "major_skill_AI工具使用", target: "element_ai_video_assist", label: "拆解" },
      { source: "major_skill_模型生成与优化", target: "element_character_model", label: "拆解" },
      { source: "major_skill_模型生成与优化", target: "element_prop_model", label: "拆解" },
      { source: "major_skill_模型生成与优化", target: "element_asset_optimization", label: "拆解" },
      { source: "major_skill_动画制作", target: "element_keyframe_motion", label: "拆解" },
      { source: "major_skill_场景搭建", target: "element_scene_space", label: "拆解" },
      { source: "major_skill_渲染合成与输出", target: "element_render_composite", label: "拆解" },
      { source: "major_skill_项目展示与评价", target: "element_showcase_review", label: "拆解" },
      ...[
        "element_story_structure",
        "element_storyboard_expression",
        "element_visual_narrative",
        "element_text_to_image",
        "element_image_to_image",
        "element_ai_storyboard"
      ].map<ProcessGraphEdge>((source) => ({ source, target: "major_module_script_design", label: "支撑" })),
      ...["element_image_to_image", "element_character_model", "element_prop_model", "element_asset_optimization"].map<ProcessGraphEdge>((source) => ({ source, target: "major_module_model_generation", label: "支撑" })),
      ...["element_ai_video_assist", "element_keyframe_motion"].map<ProcessGraphEdge>((source) => ({ source, target: "major_module_animation_production", label: "支撑" })),
      ...["element_text_to_image", "element_visual_narrative", "element_asset_optimization", "element_scene_space"].map<ProcessGraphEdge>((source) => ({ source, target: "major_module_scene_building", label: "支撑" })),
      ...["element_ai_video_assist", "element_render_composite", "element_showcase_review"].map<ProcessGraphEdge>((source) => ({ source, target: "major_module_render_output", label: "支撑" }))
    ],
    keyItems: skillWeights.map((skill) => ({
      title: skill.skill,
      description: skill.description,
      metric: `权重 ${skill.weight}%`
    }))
  };

  const coreCourseSuggestions: CoreCourseSuggestion[] = [
    {
      id: "core_course_ai_full_pipeline",
      name: course.courseName,
      position: "面向 AIGC 动画生产流程的综合项目课程，承担 AI 工具链与动画全流程项目实践训练。",
      supportedAbilityIds: ["ability_ai_tool", "ability_script_storyboard", "ability_animation", "ability_render_output", "ability_showcase"],
      supportedAbilityNames: ["AI工具使用", "剧本与分镜设计", "动画制作", "渲染合成与输出", "项目展示与评价"],
      relatedJobIds: ["job_ai_animator", "job_aigc_creator", "job_storyboard_artist", "job_post_producer"],
      relatedJobNames: ["AI动画制作员", "AIGC内容创作者", "动画分镜师", "影视动画后期制作"],
      description: `《${course.courseName}》是${course.majorDirection}专业核心课程之一，承担“AI工具链 + 动画全流程项目实践”的综合训练功能。`,
      isCurrentCourse: true,
      status: "available"
    },
    {
      id: "core_course_script_storyboard",
      name: "动画剧本与分镜设计",
      position: "支撑前期策划与视觉叙事表达。",
      supportedAbilityIds: ["ability_script_storyboard", "ability_ai_tool"],
      supportedAbilityNames: ["故事结构设计", "分镜表达", "视觉叙事", "AI辅助脚本生成"],
      relatedJobIds: ["job_storyboard_artist", "job_aigc_creator"],
      relatedJobNames: ["动画分镜师", "AIGC内容创作者", "动画导演助理"],
      description: "面向动画前期创作，训练故事结构、镜头拆解、视觉叙事和 AI 辅助脚本生成能力。",
      status: "placeholder"
    },
    {
      id: "core_course_model_assets",
      name: "三维模型生成与资产制作",
      position: "支撑角色、道具、场景等数字资产生产。",
      supportedAbilityIds: ["ability_model_optimization"],
      supportedAbilityNames: ["模型生成与优化", "角色模型", "道具模型", "资产规范整理"],
      relatedJobIds: ["job_3d_animator", "job_ai_animator"],
      relatedJobNames: ["三维动画师", "数字资产制作员", "AI动画制作员"],
      description: "面向数字资产生产，训练模型生成、资产修正、结构检查和项目交付规范。",
      status: "placeholder"
    },
    {
      id: "core_course_character_motion",
      name: "角色动画与运动表现",
      position: "支撑角色绑定、动作设计与动画表现。",
      supportedAbilityIds: ["ability_animation"],
      supportedAbilityNames: ["骨骼绑定", "角色动画", "运动节奏", "表演表达"],
      relatedJobIds: ["job_3d_animator", "job_ai_animator"],
      relatedJobNames: ["角色动画师", "三维动画师", "AI动画制作员"],
      description: "面向角色动画制作，训练绑定、关键帧、动作节奏和角色表演镜头制作能力。",
      status: "placeholder"
    },
    {
      id: "core_course_scene_render",
      name: "动画场景设计与渲染",
      position: "支撑场景搭建、空间组织、灯光材质与渲染。",
      supportedAbilityIds: ["ability_scene_building", "ability_render_output"],
      supportedAbilityNames: ["场景搭建", "材质灯光", "渲染输出", "视觉风格控制"],
      relatedJobIds: ["job_3d_animator", "job_post_producer"],
      relatedJobNames: ["场景设计师", "三维动画师", "影视动画后期制作"],
      description: "面向场景设计与镜头空间，训练场景生成、空间组织、灯光材质和风格控制能力。",
      status: "placeholder"
    },
    {
      id: "core_course_post_compositing",
      name: "影视动画后期合成",
      position: "支撑声音、合成、剪辑、输出与作品包装。",
      supportedAbilityIds: ["ability_render_output", "ability_showcase"],
      supportedAbilityNames: ["渲染合成与输出", "音效与配音", "剪辑包装", "作品展示"],
      relatedJobIds: ["job_post_producer", "job_digital_project_executor"],
      relatedJobNames: ["影视动画后期制作", "数字内容项目执行"],
      description: "面向动画短片成片交付，训练声音、合成、剪辑、输出和作品包装能力。",
      status: "placeholder"
    },
    {
      id: "core_course_project_training",
      name: "数字内容项目实训",
      position: "综合训练项目策划、生产协作、成果交付与评价。",
      supportedAbilityIds: ["ability_showcase", "ability_ai_tool"],
      supportedAbilityNames: ["项目展示与评价", "团队协作", "项目管理", "作品复盘"],
      relatedJobIds: ["job_digital_project_executor", "job_aigc_creator", "job_ai_animator"],
      relatedJobNames: ["数字内容项目执行", "AIGC内容创作者", "AI动画制作员"],
      description: "面向真实项目化交付，训练项目策划、协作生产、成果交付、展示答辩和复盘评价。",
      status: "placeholder"
    }
  ];

  const coreAbilityNodes: ProcessGraphNode[] = [
    { id: "core_ability_script_storyboard", type: "ability", title: "剧本与分镜设计", subtitle: "专业能力类别", description: "支撑故事结构、分镜表达、视觉叙事与前期策划课程。", level: 1, weight: 16 },
    { id: "core_ability_ai_tool", type: "ability", title: "AI工具使用", subtitle: "专业能力类别", description: "支撑提示词、生成结果筛选、AI 辅助分镜、图像、视频和人工优化。", level: 1, weight: 16 },
    { id: "core_ability_model_optimization", type: "ability", title: "模型生成与优化", subtitle: "专业能力类别", description: "支撑角色、道具和数字资产生成、修正、规范整理。", level: 1, weight: 18 },
    { id: "core_ability_animation", type: "ability", title: "动画制作", subtitle: "专业能力类别", description: "支撑绑定、角色动画、运动节奏和镜头表演。", level: 1, weight: 18 },
    { id: "core_ability_scene_building", type: "ability", title: "场景搭建", subtitle: "专业能力类别", description: "支撑动画场景设计、空间组织、镜头调度和风格控制。", level: 1, weight: 12 },
    { id: "core_ability_render_output", type: "ability", title: "渲染合成与输出", subtitle: "专业能力类别", description: "支撑灯光材质、剪辑合成、音效配音和成片输出。", level: 1, weight: 12 },
    { id: "core_ability_showcase", type: "ability", title: "项目展示与评价", subtitle: "专业能力类别", description: "支撑作品展示、项目复盘、过程说明和课程评价。", level: 1, weight: 8 }
  ];

  const coreCourseGraph: ProcessGraphStage = {
    id: "coreCourses",
    title: "专业核心课程建设建议",
    lead: "从专业能力结构推导专业核心课程体系。",
    summary: `${course.majorDirection}专业核心课程建议从专业能力类别出发，形成核心课程体系，并说明每门课程的定位、支撑岗位和后续课程图谱生成状态。`,
    notice: DATA_NOTICE,
    nodes: [
      ...coreAbilityNodes,
      ...coreCourseSuggestions.map<ProcessGraphNode>((suggestion) => ({
        id: suggestion.id,
        type: "coreCourse",
        title: suggestion.name,
        subtitle: suggestion.isCurrentCourse ? "当前课程能力图谱入口" : "建议核心课程",
        description: suggestion.description || suggestion.position,
        level: 2,
        tags: suggestion.supportedAbilityNames.slice(0, 3),
        weight: suggestion.isCurrentCourse ? 100 : undefined
      })),
      ...coreCourseSuggestions.map<ProcessGraphNode>((suggestion) => ({
        id: `${suggestion.id}_position`,
        type: "coursePosition",
        title: suggestion.status === "available" ? "可查看课程能力图谱" : "后续可生成课程能力图谱",
        subtitle: "课程定位 / 支撑岗位",
        description: `${suggestion.position} 支撑岗位：${suggestion.relatedJobNames.join("、")}。`,
        level: 3,
        tags: suggestion.relatedJobNames.slice(0, 2)
      }))
    ],
    edges: [
      ...coreCourseSuggestions.flatMap<ProcessGraphEdge>((suggestion) =>
        (suggestion.supportedAbilityIds || []).map((abilityId) => ({
          source: `core_${abilityId}`,
          target: suggestion.id,
          label: "支撑"
        }))
      ),
      ...coreCourseSuggestions.map<ProcessGraphEdge>((suggestion) => ({
        source: suggestion.id,
        target: `${suggestion.id}_position`,
        label: suggestion.status === "available" ? "进入" : "占位"
      }))
    ],
    keyItems: coreCourseSuggestions.map((suggestion) => ({
      title: suggestion.name,
      description: suggestion.position,
      metric: suggestion.status === "available" ? "可查看图谱" : "后续可生成"
    }))
  };

  const impactPaths: ImpactPath[] = [
    {
      id: "impact_ai_pipeline",
      industryTrend: "AI辅助动画全流程普及",
      affectedJobs: ["AI动画制作员", "AIGC内容创作者"],
      majorAbilities: ["AI动画全流程制作能力", "AIGC内容创作与人工优化能力"],
      courseAbilities: ["动画剧本设定", "动画模型制作", "动画制作", "动画场景搭建"],
      teachingSuggestions: ["将课程改为全流程短片项目", "在每个模块加入 AI 生成、人工判断和过程记录", "要求提交工具使用边界说明"],
      evidenceSourceIds: ["evidence_ai_workflow_placeholder"]
    },
    {
      id: "impact_project_showcase",
      industryTrend: "项目作品驱动就业评价",
      affectedJobs: ["三维动画师", "影视动画后期制作"],
      majorAbilities: ["影视动画视觉表达能力", "项目展示与复盘表达能力"],
      courseAbilities: ["动画渲染输出"],
      teachingSuggestions: ["把结课作业升级为动画短片展示", "增加成片输出、项目复盘和作品集说明", "用过程文件支撑评价"],
      evidenceSourceIds: ["evidence_curriculum_placeholder", "evidence_job_placeholder"]
    },
    {
      id: "impact_aigc_content",
      industryTrend: "AIGC内容生产岗位增长",
      affectedJobs: ["AI动画制作员", "动画分镜师", "AIGC内容创作者"],
      majorAbilities: ["AI工具规范使用能力", "生成结果筛选与二次创作能力"],
      courseAbilities: ["动画剧本设定", "动画模型制作", "动画场景搭建"],
      teachingSuggestions: ["增加提示词、筛选、修订和合规说明", "要求学生说明 AI 结果如何被转化为课程作品"],
      evidenceSourceIds: ["evidence_local_synthesis", "evidence_ai_workflow_placeholder"]
    }
  ];

  const abilityTree = buildAbilityTree(nodes);
  const mockNormalizationWarnings: string[] = [];
  const readableCoreCourseSuggestions = normalizeCoreCourseSuggestions(
    coreCourseSuggestions,
    coreCourseSuggestions,
    course,
    mockNormalizationWarnings
  );
  const readableIndustryGraph = normalizeProcessGraphStageText(industryGraph);
  const readableRegionalJobGraph = normalizeProcessGraphStageText(regionalJobGraph);
  const readableMajorAbilityGraph = normalizeProcessGraphStageText(majorAbilityGraph);
  const readableCoreCourseGraph = rebuildCoreCourseGraph(coreCourseGraph, readableCoreCourseSuggestions);

  const payload: CourseAbilityGraphPayload = {
    course,
    courseProfile: {
      positioning: rootNode.description,
      targetJobIds: rootNode.relatedJobIds,
      coreAbilityStructure: workflowStages.map((stage) => `${stage.name}（${stage.moduleIds.length} 个教学模块）`),
      mockNotice: DATA_NOTICE
    },
    abilityTree,
    skillWeights,
    relatedJobs,
    salaryRanges: [
      { jobTitle: "AI动画制作员", min: 7000, max: 15000, unit: "CNY/month", region: course.region, note: "待校准区间，后续应接入真实招聘数据校准。" },
      { jobTitle: "动画分镜师", min: 5500, max: 11000, unit: "CNY/month", region: course.region, note: "前期岗位受作品质量、镜头表达和项目经验影响明显。" },
      { jobTitle: "三维动画师", min: 6500, max: 13000, unit: "CNY/month", region: course.region, note: "三维动画岗位通常更看重动作表现和项目交付能力。" },
      { jobTitle: "AIGC内容创作者", min: 7000, max: 16000, unit: "CNY/month", region: course.region, note: "新型内容创作岗位为本地示例设定，真实薪资需后续资料库校准。" },
      { jobTitle: "影视动画后期制作", min: 6000, max: 12000, unit: "CNY/month", region: course.region, note: "后期岗位受合成、输出、声音和展示能力影响。" },
      { jobTitle: "数字内容项目执行", min: 5500, max: 10000, unit: "CNY/month", region: course.region, note: "项目执行岗位为本地示例设定，真实薪资需后续资料库校准。" }
    ],
    evidenceSources,
    updateSuggestions: [
      { title: "以 AI 动画短片项目重组课程", priority: "high", reason: "AI 工具已进入动画前中后期多个环节，课程需要从单项技能训练转为全流程项目训练。", actions: ["按工作流程设置模块", "每个模块保留 AI 使用记录", "用短片成片作为综合成果"] },
      { title: "强化生成结果的人工判断与优化", priority: "high", reason: "岗位更需要能筛选、修订和解释 AI 输出的创作者，而不是只会生成素材。", actions: ["增加提示词和筛选依据", "要求人工优化前后对比", "加入合规说明"] },
      { title: "建立项目展示与复盘评价", priority: "medium", reason: "课程成果需要转化为就业可识别的作品集案例。", actions: ["设置短片展示答辩", "提交项目复盘报告", "整理作品集图文页"] }
    ],
    industryTrends,
    regionalJobMap,
    majorAbilityMap,
    industryGraph: readableIndustryGraph,
    regionalJobGraph: readableRegionalJobGraph,
    majorAbilityGraph: readableMajorAbilityGraph,
    coreCourseSuggestions: readableCoreCourseSuggestions,
    coreCourseGraph: readableCoreCourseGraph,
    courseAbilityMap,
    courseMappings: [],
    workflowStages,
    teachingModules,
    tasks,
    moduleMappings,
    impactPaths,
    meta: {
      generatedAt: new Date().toISOString(),
      model: "local-example",
      provider: "capability-map",
      source: "mock",
      warnings: [DATA_NOTICE, ...warnings]
    }
  };

  if (/数字媒体|视觉|新媒体|AIGC/i.test(`${course.majorDirection}${course.courseName}`)) {
    const defaults = processGraphSemanticDefaults(course);
    const processGraphFallback = expandProcessGraphsSemanticSkeleton(
      {
        industryChanges: defaults.industryChanges,
        industryKeywords: defaults.industryKeywords,
        regionalJobs: defaults.regionalJobs,
        majorAbilities: defaults.majorAbilities,
        coreCourses: readableCoreCourseSuggestions.map((suggestion) => ({
          isCurrentCourse: suggestion.isCurrentCourse,
          name: suggestion.name,
          position: suggestion.position,
          reason: suggestion.description
        }))
      },
      course,
      payload
    );
    payload.industryGraph = normalizeProcessGraphStageText(processGraphFallback.industryGraph as ProcessGraphStage);
    payload.regionalJobGraph = normalizeProcessGraphStageText(processGraphFallback.regionalJobGraph as ProcessGraphStage);
    payload.majorAbilityGraph = normalizeProcessGraphStageText(processGraphFallback.majorAbilityGraph as ProcessGraphStage);
  }

  return payload;
}

export { createMockCourseAbilityGraph };

function extractJsonText(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const source = fenced || trimmed;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("MODEL_JSON_NOT_FOUND");
  return source.slice(start, end + 1);
}

export function parseCourseAbilityGraphModelOutput(content: string): CourseAbilityGraphModelOutput {
  if (!content.trim()) throw new Error("MODEL_EMPTY_RESPONSE");
  return JSON.parse(extractJsonText(content)) as CourseAbilityGraphModelOutput;
}

export function parseCapabilityMapJson<T>(content: string): T {
  if (!content.trim()) throw new Error("MODEL_EMPTY_RESPONSE");
  return JSON.parse(extractJsonText(content)) as T;
}

function semanticId(prefix: string, text: string, index = 0) {
  const ascii = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  const hash = Array.from(text).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7).toString(36);
  return `${prefix}_${ascii || hash}_${index + 1}`;
}

function isLowQualitySemanticText(value: string) {
  return /模型背景|模型生成背景|由模型语义|模型骨架|占位|待补充|model\s*background|placeholder|相关内容/i.test(value);
}

function semanticTextArray(value: unknown, fallback: string[], max = 8, fillFromFallback = false) {
  const items = Array.isArray(value)
    ? value.map((item) => cleanDisplayText(item, "", 80)).filter((item) => Boolean(item) && !isLowQualitySemanticText(item))
    : [];
  const candidates = items.length ? (fillFromFallback ? [...items, ...fallback] : items) : fallback;
  const seen = new Set<string>();
  return candidates
    .map((item) => cleanDisplayText(item, "", 80))
    .filter((item) => {
      const key = canonicalDisplayName(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
}

function processGraphSemanticDefaults(input: CourseAbilityGraphInput) {
  const digitalVisualCourse = /数字媒体|视觉|新媒体|AIGC/i.test(`${input.majorDirection}${input.courseName}`);
  if (!digitalVisualCourse) {
    return {
      industryChanges: ["智能工具进入创意生产流程", "项目成果成为岗位评价的重要依据", "多平台内容交付要求提升"],
      industryKeywords: ["数字创意产业", "智能内容生产", "项目化内容交付", "新媒体传播"],
      majorAbilities: [
        { name: "创意策划能力", weight: 18, description: "能够把传播需求转化为可执行的创意主题和项目方案。" },
        { name: "智能工具应用能力", weight: 18, description: "能够选择并规范使用智能工具完成素材生产与优化。" },
        { name: "项目制作能力", weight: 18, description: "能够依据工作流程完成内容制作、修改和成果交付。" },
        { name: "成果展示与评价能力", weight: 14, description: "能够整理过程材料、展示作品并完成项目复盘。" }
      ],
      regionalJobs: [
        { name: "数字内容设计师", relevance: 90, description: "负责数字内容的创意设计、制作优化和成果交付。" },
        { name: "新媒体内容制作员", relevance: 86, description: "面向新媒体平台完成内容策划、视觉制作和发布适配。" },
        { name: "数字内容项目执行", relevance: 82, description: "负责项目排期、资源协同、成果检查与交付。" }
      ]
    };
  }

  return {
    industryChanges: [
      "AIGC工具进入视觉创意生产流程",
      "数字媒体艺术项目加速智能化升级",
      "短视频与新媒体强化动态视觉表达",
      "品牌视觉生产转向多平台内容协同",
      "数字内容运营更加重视持续迭代"
    ],
    industryKeywords: ["AIGC视觉内容生产", "数字媒体艺术产业升级", "短视频与新媒体视觉传播", "品牌视觉与数字内容运营"],
    regionalJobs: [
      { name: "AIGC视觉设计师", relevance: 94, description: "使用AIGC工具完成视觉概念生成、方案筛选、精修与项目交付。" },
      { name: "短视频视觉包装设计师", relevance: 90, description: "负责短视频栏目包装、动态版式、声音协同和平台适配。" },
      { name: "品牌数字美术设计师", relevance: 88, description: "面向品牌传播完成数字美术创意、视觉系统和多场景延展。" },
      { name: "新媒体美术设计师", relevance: 86, description: "负责新媒体图文、活动视觉和跨平台传播素材设计。" },
      { name: "数字内容项目执行", relevance: 82, description: "负责数字内容项目排期、协作生产、发布检查与成果复盘。" }
    ],
    majorAbilities: [
      { name: "AIGC图像生成与控制能力", weight: 20, description: "能够设计提示词与参数策略，控制生成图像的主题、构图和风格。" },
      { name: "视觉创意策划能力", weight: 18, description: "能够依据传播目标完成主题提炼、视觉概念和创意方案表达。" },
      { name: "数字图形与版式设计能力", weight: 16, description: "能够组织图形、字体、色彩和版式，形成清晰的视觉层级。" },
      { name: "短视频视觉包装能力", weight: 16, description: "能够完成动态版式、镜头节奏、声音配合和栏目包装。" },
      { name: "品牌视觉设计能力", weight: 15, description: "能够构建品牌视觉语言并完成多场景数字内容延展。" },
      { name: "新媒体传播设计能力", weight: 15, description: "能够面向不同平台完成内容适配、发布设计和传播效果复盘。" }
    ]
  };
}

function abilityElementTitle(abilityTitle: string) {
  if (/AIGC|图像生成/.test(abilityTitle)) return "提示词设计与生成控制";
  if (/创意策划/.test(abilityTitle)) return "传播主题与视觉概念策划";
  if (/图形|版式/.test(abilityTitle)) return "图形语言与版式编排";
  if (/短视频|包装/.test(abilityTitle)) return "动态版式与视听节奏";
  if (/品牌/.test(abilityTitle)) return "品牌视觉系统延展";
  if (/传播|新媒体/.test(abilityTitle)) return "跨平台内容适配";
  return `${abilityTitle}项目应用`;
}

function majorAbilitySemanticGroup(abilityTitle: string) {
  if (/(AIGC|AI).*(图像|视觉|生成|提示)|(图像|视觉|生成|提示).*(AIGC|AI)/i.test(abilityTitle)) return "aigc-image-control";
  if (/创意.*策划|策划.*创意/.test(abilityTitle)) return "visual-creative-planning";
  if (/图形|版式/.test(abilityTitle)) return "graphic-layout";
  if (/短视频|动态视觉|视觉包装/.test(abilityTitle)) return "short-video-packaging";
  if (/品牌.*视觉|视觉.*品牌/.test(abilityTitle)) return "brand-visual";
  if (/新媒体|传播设计|跨平台/.test(abilityTitle)) return "new-media-communication";
  return "";
}

function semanticPercent(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(100, Math.round(numeric))) : fallback;
}

function uniqueSemanticId(prefix: string, text: string, index: number, used: Set<string>) {
  let id = semanticId(prefix, text, index);
  let suffix = 2;
  while (used.has(id)) {
    id = `${semanticId(prefix, text, index)}_${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function stageMetaFromSkeleton(meta: Partial<CourseAbilityGraphMeta> | undefined, warnings: string[]): Partial<CourseAbilityGraphMeta> {
  return {
    ...(meta || {}),
    source: "model",
    warnings: Array.from(new Set([...(meta?.warnings || []), ...warnings]))
  };
}

export function expandProcessGraphsSemanticSkeleton(
  skeleton: ProcessGraphsSemanticSkeleton,
  input: CourseAbilityGraphInput,
  fallback: CourseAbilityGraphPayload
): CourseAbilityGraphModelOutput {
  const semanticDefaults = processGraphSemanticDefaults(input);
  const prioritizeDigitalVisualDefaults = /数字媒体|视觉|新媒体|AIGC/i.test(`${input.majorDirection}${input.courseName}`);
  const modelIndustryKeywords = semanticTextArray(skeleton.industryKeywords, [], 6);
  const industryKeywords = semanticTextArray(
    prioritizeDigitalVisualDefaults ? [...semanticDefaults.industryKeywords, ...modelIndustryKeywords] : [...modelIndustryKeywords, ...semanticDefaults.industryKeywords],
    semanticDefaults.industryKeywords,
    6
  );
  const industryChanges = semanticTextArray(skeleton.industryChanges, semanticDefaults.industryChanges, 6, true);
  const modelRegionalJobs = Array.isArray(skeleton.regionalJobs)
    ? skeleton.regionalJobs.filter((job) => {
        const name = cleanDisplayText(job.name, "", 60);
        return Boolean(name) && !isLowQualitySemanticText(name);
      })
    : [];
  const regionalJobNames = new Set<string>();
  const regionalJobs = (prioritizeDigitalVisualDefaults ? [...semanticDefaults.regionalJobs, ...modelRegionalJobs] : [...modelRegionalJobs, ...semanticDefaults.regionalJobs]).filter((job) => {
    const key = canonicalDisplayName(cleanDisplayText(job.name, "", 60));
    if (!key || regionalJobNames.has(key)) return false;
    regionalJobNames.add(key);
    return true;
  }).slice(0, 8);
  const modelMajorAbilities = Array.isArray(skeleton.majorAbilities)
    ? skeleton.majorAbilities.filter((ability) => {
      const name = cleanDisplayText(ability.name, "", 60);
        return (
          Boolean(name) &&
          !isLowQualitySemanticText(name) &&
          canonicalDisplayName(name) !== canonicalDisplayName(input.majorDirection) &&
          canonicalDisplayName(name) !== canonicalDisplayName(input.courseName)
        );
      })
    : [];
  const majorAbilityNames = new Set<string>();
  const majorAbilityGroups = new Set<string>();
  const majorAbilities = (prioritizeDigitalVisualDefaults ? [...semanticDefaults.majorAbilities, ...modelMajorAbilities] : [...modelMajorAbilities, ...semanticDefaults.majorAbilities]).filter((ability) => {
    const title = cleanDisplayText(ability.name, "", 60);
    const key = canonicalDisplayName(title);
    const group = majorAbilitySemanticGroup(title);
    if (!key || majorAbilityNames.has(key)) return false;
    if (group && majorAbilityGroups.has(group)) return false;
    majorAbilityNames.add(key);
    if (group) majorAbilityGroups.add(group);
    return true;
  }).slice(0, 7);
  const coreCourses = Array.isArray(skeleton.coreCourses) ? skeleton.coreCourses.filter((course) => cleanDisplayText(course.name, "", 80)) : [];
  if (!industryKeywords.length || !industryChanges.length || !regionalJobs.length || !majorAbilities.length || !coreCourses.length) {
    throw new Error("MODEL_OUTPUT_MISSING_CORE_FIELDS");
  }

  const industryNodes: ProcessGraphNode[] = industryKeywords.slice(0, 6).map((keyword, index) => ({
    id: semanticId("industry", keyword, index),
    type: "industry",
    title: keyword,
    subtitle: "产业关键词",
    description: `${keyword}正在改变${input.region}地区${input.majorDirection}专业的内容生产方式与岗位任务。`,
    level: 1,
    tags: ["课程建设依据"]
  }));
  const changeNodes: ProcessGraphNode[] = industryChanges.slice(0, 6).map((change, index) => ({
    id: semanticId("change", change, index),
    type: "trend",
    title: change,
    subtitle: "产业变化",
    description: `${change}需要转化为《${input.courseName}》中的项目任务、工具训练与成果评价要求。`,
    level: 2,
    relatedModuleIds: fallback.teachingModules.slice(index % 2, index % 2 + 2).map((module) => module.id)
  }));
  const impactNodes: ProcessGraphNode[] = [
    "调整课程内容",
    "强化项目化流程",
    "补充 AI 工具链",
    "强化作品展示评价"
  ].map((title, index) => ({
    id: semanticId("impact", title, index),
    type: "impact",
    title,
    subtitle: "课程影响",
    description: `${title}，并通过《${input.courseName}》课程能力图谱落到教学模块。`,
    level: 3,
    relatedModuleIds: fallback.teachingModules.map((module) => module.id).slice(0, index + 1)
  }));

  const industryGraph: ProcessGraphStage = {
    id: "industry",
    title: "产业图谱",
    lead: "从产业变化识别课程内容更新方向。",
    summary: `围绕${input.region}地区${input.majorDirection}产业变化，识别《${input.courseName}》的内容更新、项目流程与评价方向。`,
    notice: DATA_NOTICE,
    nodes: [...industryNodes, ...changeNodes, ...impactNodes],
    edges: [
      ...industryNodes.flatMap((source) => changeNodes.slice(0, 3).map((target) => ({ source: source.id, target: target.id, label: "影响" }))),
      ...changeNodes.map((source, index) => ({ source: source.id, target: impactNodes[index % impactNodes.length].id, label: "推导" }))
    ],
    keyItems: industryChanges.slice(0, 4).map((change) => ({
      title: change,
      description: `${change}将影响课程项目、工具应用和成果交付要求。`,
      metric: "产业变化"
    }))
  };

  const jobNodes: ProcessGraphNode[] = regionalJobs.slice(0, 8).map((job, index) => ({
    id: semanticId("job", cleanDisplayText(job.name, `数字内容岗位${index + 1}`, 60), index),
    type: "job",
    title: cleanDisplayText(job.name, `数字内容岗位${index + 1}`, 60),
    subtitle: `相关度 ${semanticPercent(job.relevance, 80)}%`,
    description: cleanDescription(job.description, `该岗位面向${input.region}地区数字内容生产，要求具备创意设计、工具应用和项目交付能力。`, 160),
    level: 2,
    weight: semanticPercent(job.relevance, 80),
    relatedModuleIds: fallback.teachingModules.slice(index % 3, index % 3 + 2).map((module) => module.id)
  }));
  const regionNodes: ProcessGraphNode[] = industryKeywords.slice(0, 4).map((keyword, index) => ({
    id: semanticId("region", keyword, index),
    type: "region",
    title: `${input.region}地区${keyword}`,
    subtitle: "区域方向",
    description: `面向${input.region}地区的${keyword}相关岗位需求。`,
    level: 1
  }));
  const regionalModuleNodes: ProcessGraphNode[] = fallback.teachingModules.map((module) => ({
    id: `regional_module_${module.id}`,
    type: "courseModule",
    title: module.name,
    subtitle: module.hours ? `${module.hours} 学时` : "课程模块",
    description: module.description || "",
    level: 3,
    relatedModuleIds: [module.id]
  }));
  const regionalJobGraph: ProcessGraphStage = {
    id: "regionalJobs",
    title: "区域岗位图谱",
    lead: "从区域岗位需求定位课程服务对象。",
    summary: `从${input.region}地区数字内容产业方向识别典型岗位，并说明岗位任务与《${input.courseName}》教学模块的关系。`,
    notice: DATA_NOTICE,
    nodes: [...regionNodes, ...jobNodes, ...regionalModuleNodes],
    edges: [
      ...regionNodes.flatMap((source) => jobNodes.slice(0, 4).map((target) => ({ source: source.id, target: target.id, label: "对应" }))),
      ...jobNodes.flatMap((job, index) =>
        fallback.teachingModules.slice(index % 3, index % 3 + 2).map((module) => ({ source: job.id, target: `regional_module_${module.id}`, label: "支撑" }))
      )
    ],
    keyItems: jobNodes.map((job) => ({ title: job.title, description: job.description, metric: job.subtitle }))
  };

  const abilityNodes: ProcessGraphNode[] = majorAbilities.slice(0, 8).map((ability, index) => ({
    id: semanticId("major_ability", cleanDisplayText(ability.name, `专业能力${index + 1}`, 60), index),
    type: "ability",
    title: cleanDisplayText(ability.name, `专业能力${index + 1}`, 60),
    subtitle: `权重 ${semanticPercent(ability.weight, 15)}%`,
    description: cleanDescription(ability.description, `该能力支撑${input.majorDirection}专业的创意策划、内容制作与成果交付。`, 160),
    level: 1,
    weight: semanticPercent(ability.weight, 15)
  }));
  const elementNodes: ProcessGraphNode[] = abilityNodes.map((ability, index) => {
    const title = abilityElementTitle(ability.title);
    return {
      id: `${ability.id}_element_1`,
      type: "element" as const,
      title,
      subtitle: "关键能力要素",
      description: `${title}用于把${ability.title}落实到课程项目任务和可评价成果。`,
      level: 2 as const,
      relatedModuleIds: [fallback.teachingModules[index % fallback.teachingModules.length]?.id].filter(Boolean)
    };
  });
  const majorModuleNodes: ProcessGraphNode[] = fallback.teachingModules.map((module) => ({
    id: `major_module_${module.id}`,
    type: "courseModule",
    title: module.name,
    subtitle: module.hours ? `${module.hours} 学时` : "课程模块",
    description: module.description || "",
    level: 3,
    relatedModuleIds: [module.id]
  }));
  const majorAbilityGraph: ProcessGraphStage = {
    id: "majorAbilities",
    title: "专业能力图谱",
    lead: "从岗位能力抽取专业能力结构。",
    summary: `从${input.region}地区岗位任务抽取${input.majorDirection}专业能力，并映射到《${input.courseName}》的关键训练要素与教学模块。`,
    notice: DATA_NOTICE,
    nodes: [...abilityNodes, ...elementNodes, ...majorModuleNodes],
    edges: [
      ...abilityNodes.flatMap((ability) => elementNodes.filter((element) => element.id.startsWith(`${ability.id}_`)).map((element) => ({ source: ability.id, target: element.id, label: "拆解" }))),
      ...elementNodes.map((element, index) => ({ source: element.id, target: majorModuleNodes[index % majorModuleNodes.length].id, label: "支撑" }))
    ],
    keyItems: abilityNodes.map((ability) => ({ title: ability.title, description: ability.description, metric: ability.subtitle }))
  };

  const coreCourseSuggestions: CoreCourseSuggestion[] = coreCourses.slice(0, 8).map((course, index) => {
    const name = cleanDisplayText(course.name, index === 0 ? input.courseName : `核心课程${index + 1}`, 80);
    const isCurrentCourse = Boolean(course.isCurrentCourse) || name === input.courseName || index === 0;
    return {
      id: isCurrentCourse ? "core_course_current" : semanticId("core_course", name, index),
      name: isCurrentCourse ? input.courseName : name,
      position: cleanDescription(course.position, cleanDescription(course.reason, `${name}承接专业能力体系中的专项训练和项目交付要求。`, 160), 180),
      supportedAbilityNames: abilityNodes.slice(0, 4).map((ability) => ability.title),
      relatedJobNames: jobNodes.slice(0, 4).map((job) => job.title),
      description: cleanDescription(course.reason, `${name}承接${input.majorDirection}专业能力结构中的关键训练任务。`, 160),
      isCurrentCourse,
      status: isCurrentCourse ? "available" : "placeholder"
    };
  });
  const coreCourseNodes = coreCourseSuggestions.map<ProcessGraphNode>((course, index) => ({
    id: course.id,
    type: "coreCourse",
    title: course.name,
    subtitle: course.isCurrentCourse ? "当前课程能力图谱入口" : "建议核心课程",
    description: course.description || course.position,
    level: 2,
    tags: course.supportedAbilityNames.slice(0, 3),
    weight: course.isCurrentCourse ? 100 : undefined
  }));
  const positionNodes = coreCourseSuggestions.map<ProcessGraphNode>((course) => ({
    id: `${course.id}_position`,
    type: "coursePosition",
    title: course.status === "available" ? "可查看课程能力图谱" : "后续可生成课程能力图谱",
    subtitle: "课程定位 / 支撑岗位",
    description: `${course.position} 支撑岗位：${course.relatedJobNames.join("、")}。`,
    level: 3,
    tags: course.relatedJobNames.slice(0, 2)
  }));
  const coreCourseGraph: ProcessGraphStage = {
    id: "coreCourses",
    title: "专业核心课程建设建议",
    lead: "从专业能力结构推导专业核心课程体系。",
    summary: `从${input.majorDirection}专业能力结构推导核心课程体系，并说明课程定位、支撑岗位和后续图谱生成状态。`,
    notice: DATA_NOTICE,
    nodes: [...abilityNodes.map((node) => ({ ...node, id: `core_${node.id}` })), ...coreCourseNodes, ...positionNodes],
    edges: [
      ...coreCourseNodes.flatMap((course, index) =>
        abilityNodes.slice(0, 3).map((ability) => ({ source: `core_${ability.id}`, target: course.id, label: index === 0 ? "重点支撑" : "支撑" }))
      ),
      ...coreCourseNodes.map((course) => ({ source: course.id, target: `${course.id}_position`, label: "定位" }))
    ],
    keyItems: coreCourseSuggestions.map((course) => ({ title: course.name, description: course.position, metric: course.status === "available" ? "可查看图谱" : "后续可生成" }))
  };

  return {
    industryGraph,
    regionalJobGraph,
    majorAbilityGraph,
    coreCourseSuggestions,
    coreCourseGraph,
    meta: stageMetaFromSkeleton(skeleton.meta, ["LOCAL_EXPANSION_PROCESS_GRAPHS"])
  };
}

export function expandCourseStructureSemanticSkeleton(
  skeleton: CourseStructureSemanticSkeleton,
  input: CourseAbilityGraphInput,
  fallback: CourseAbilityGraphPayload
): CourseAbilityGraphModelOutput {
  const stages = Array.isArray(skeleton.workflowStages)
    ? skeleton.workflowStages.filter((stage) => cleanDisplayText(stage.name, "", 60) && Array.isArray(stage.modules) && stage.modules.length)
    : [];
  if (!stages.length) throw new Error("MODEL_OUTPUT_MISSING_CORE_FIELDS");

  const usedStageIds = new Set<string>();
  const usedModuleIds = new Set<string>();
  const workflowStages: WorkflowStage[] = [];
  const teachingModules: TeachingModuleNode[] = [];
  const tasks: CourseTaskNode[] = [];
  let totalModuleCount = 0;

  stages.slice(0, 3).forEach((stage, stageIndex) => {
    const stageName = cleanDisplayText(stage.name, `工作流程${stageIndex + 1}`, 60);
    const stageId = uniqueSemanticId("stage", stageName, stageIndex, usedStageIds);
    const moduleIds: string[] = [];
    (stage.modules || []).slice(0, 5).forEach((module, moduleIndex) => {
      if (totalModuleCount >= 5) return;
      const moduleName = cleanDisplayText(module.name, `教学模块${moduleIndex + 1}`, 60);
      const moduleId = uniqueSemanticId("module", moduleName, moduleIndex, usedModuleIds);
      const moduleTasks = Array.isArray(module.tasks) && module.tasks.length ? module.tasks : [{ name: `${moduleName}任务`, description: module.description }];
      const taskIds = moduleTasks.slice(0, 4).map((taskItem, taskIndex) => `${moduleId}_task_${taskIndex + 1}`);
      totalModuleCount += 1;
      moduleIds.push(moduleId);
      teachingModules.push({
        id: moduleId,
        name: moduleName,
        hours: typeof module.hours === "number" && module.hours > 0 ? Math.round(module.hours) : fallback.teachingModules[moduleIndex % fallback.teachingModules.length]?.hours,
        description: cleanDescription(module.description, `${moduleName}围绕${input.courseName}课程项目展开。`, 160),
        workflowStageId: stageId,
        taskIds,
        relatedJobIds: fallback.relatedJobs.slice(0, 3).map((job) => job.id),
        evidenceSourceIds: fallback.evidenceSources.slice(0, 2).map((evidence) => evidence.id),
        trendIds: fallback.industryTrends.slice(0, 2).map((trend) => trend.id),
        teachingSuggestions: ["采用项目任务驱动教学", "要求提交过程记录与成果说明"],
        assessmentMethods: ["阶段成果评审", "过程记录检查", "作品质量评价"]
      });
      moduleTasks.slice(0, 4).forEach((taskItem, taskIndex) => {
        tasks.push({
          id: taskIds[taskIndex],
          name: cleanDisplayText(taskItem.name, `${moduleName}任务${taskIndex + 1}`, 60),
          description: cleanDescription(taskItem.description, `${moduleName}中的任务能力点。`, 160),
          moduleId,
          abilityTags: [moduleName, stageName],
          aiTools: ["AI辅助工具"],
          relatedJobIds: fallback.relatedJobs.slice(0, 3).map((job) => job.id),
          evidenceSourceIds: fallback.evidenceSources.slice(0, 2).map((evidence) => evidence.id),
          trendIds: fallback.industryTrends.slice(0, 2).map((trend) => trend.id),
          teachingSuggestions: ["以任务成果、过程记录和问题修订作为评价依据"],
          assessmentMethods: ["任务成果质量", "过程记录完整度", "课堂展示与答辩"]
        });
      });
    });
    workflowStages.push({
      id: stageId,
      name: stageName,
      description: cleanDescription(stage.description, `${stageName}支撑${input.courseName}课程项目实施。`, 160),
      moduleIds
    });
  });

  if (!workflowStages.length || !teachingModules.length || !tasks.length) throw new Error("MODEL_OUTPUT_MISSING_CORE_FIELDS");

  const rootNode: CourseRootNode = {
    id: "course_root",
    name: `课程：${cleanDisplayText(skeleton.courseName, input.courseName, 60)}`,
    weight: 100,
    description: `${input.courseName}是${input.majorDirection}专业面向${input.region}地区岗位能力建设的项目化课程。`,
    relatedJobIds: fallback.relatedJobs.map((job) => job.id),
    evidenceSourceIds: fallback.evidenceSources.slice(0, 2).map((evidence) => evidence.id),
    trendIds: fallback.industryTrends.map((trend) => trend.id),
    coreAbilityNodeIds: workflowStages.map((stage) => stage.id),
    x: 520,
    y: 330
  };
  const nodes: SkillNode[] = [
    ...workflowStages.map<SkillNode>((stage, index) => ({
      id: stage.id,
      name: stage.name,
      level: 1,
      parentId: rootNode.id,
      weight: Math.max(10, Math.round(100 / workflowStages.length)),
      description: stage.description || "",
      relatedJobIds: rootNode.relatedJobIds,
      evidenceSourceIds: rootNode.evidenceSourceIds,
      trendIds: rootNode.trendIds,
      teachingSuggestions: ["按工作流程组织项目任务", "要求学生提交阶段成果和过程记录"],
      assessmentMethods: ["流程完整度", "阶段成果评审", "项目复盘"],
      x: 240 + index * 280,
      y: 180
    })),
    ...tasks.map<SkillNode>((taskNode, index) => {
      const module = teachingModules.find((item) => item.id === taskNode.moduleId);
      return {
        id: taskNode.id,
        name: taskNode.name,
        level: 2,
        parentId: module?.workflowStageId || workflowStages[0].id,
        weight: 6 + (index % 4),
        description: taskNode.description || "",
        relatedJobIds: taskNode.relatedJobIds,
        evidenceSourceIds: taskNode.evidenceSourceIds,
        trendIds: taskNode.trendIds,
        teachingSuggestions: taskNode.teachingSuggestions,
        assessmentMethods: taskNode.assessmentMethods,
        x: 100 + (index % 7) * 130,
        y: 440 + Math.floor(index / 7) * 160
      };
    })
  ];

  return {
    workflowStages,
    teachingModules,
    tasks,
    courseAbilityMap: {
      rootNode,
      nodes,
      edges: buildEdges(rootNode, nodes)
    },
    meta: stageMetaFromSkeleton(skeleton.meta, ["LOCAL_EXPANSION_COURSE_GRAPH"])
  };
}

export function expandMappingAnalysisSemanticSkeleton(
  skeleton: MappingAnalysisSemanticSkeleton,
  input: CourseAbilityGraphInput,
  fallback: CourseAbilityGraphPayload,
  mappingModules?: MappingModuleReference[]
): CourseAbilityGraphModelOutput {
  const rawMappings = Array.isArray(skeleton.moduleMappings)
    ? skeleton.moduleMappings.filter((mapping) => cleanText(mapping.moduleId, "", 100) || cleanText(mapping.moduleName, "", 80))
    : [];
  const rawSkillWeights = Array.isArray(skeleton.skillWeights) ? skeleton.skillWeights.filter((skill) => cleanDisplayText(skill.name, "", 60)) : [];
  const rawRelatedJobs = Array.isArray(skeleton.relatedJobs) ? skeleton.relatedJobs.filter((job) => cleanDisplayText(job.title, "", 60)) : [];
  const rawSuggestions = Array.isArray(skeleton.updateSuggestions) ? skeleton.updateSuggestions.filter((suggestion) => cleanDisplayText(suggestion.title, "", 80)) : [];
  if (!rawMappings.length || !rawSkillWeights.length || !rawRelatedJobs.length || !rawSuggestions.length) throw new Error("MODEL_OUTPUT_MISSING_CORE_FIELDS");

  const finalModules = (mappingModules?.length
    ? mappingModules
    : fallback.teachingModules.map((module) => ({
        moduleId: module.id,
        moduleName: module.name,
        hours: module.hours
      }))
  ).filter((module) => module.moduleId && module.moduleName);
  if (!finalModules.length) throw new Error("MODEL_OUTPUT_MISSING_CORE_FIELDS");

  const dimensionKeyByTitle: Record<string, CourseMappingDimensionKey> = {
    核心工作任务: "coreTasks",
    标准工作流程: "standardWorkflow",
    核心职业能力: "coreOccupationalAbilities",
    可考核技能点: "assessableSkillPoints",
    支撑知识点: "supportingKnowledgePoints",
    考核评价方式: "assessmentMethods",
    对应企业标准或大赛证书要求: "enterpriseStandardsOrCertificates"
  };

  const moduleNameKey = (value: unknown) =>
    cleanDisplayText(value, "", 100)
      .toLowerCase()
      .replace(/[\s\-_·/／\\（）()《》<>“”"'‘’：:，,。.;；、|]+/g, "");
  const usedMappingIndexes = new Set<number>();
  let matchedById = 0;
  let matchedByName = 0;
  let placeholderCount = 0;
  const unmatchedModuleNames: string[] = [];

  const pickMappingForModule = (module: MappingModuleReference) => {
    const byId = rawMappings.findIndex((mapping, index) => !usedMappingIndexes.has(index) && cleanText(mapping.moduleId, "", 100) === module.moduleId);
    if (byId >= 0) {
      usedMappingIndexes.add(byId);
      matchedById += 1;
      return rawMappings[byId];
    }

    const byName = rawMappings.findIndex(
      (mapping, index) => !usedMappingIndexes.has(index) && cleanDisplayText(mapping.moduleName, "", 100) === module.moduleName
    );
    if (byName >= 0) {
      usedMappingIndexes.add(byName);
      matchedByName += 1;
      return rawMappings[byName];
    }

    const moduleKey = moduleNameKey(module.moduleName);
    const byNormalizedName = rawMappings.findIndex((mapping, index) => {
      if (usedMappingIndexes.has(index)) return false;
      const candidateKey = moduleNameKey(mapping.moduleName);
      return Boolean(candidateKey && moduleKey && (candidateKey === moduleKey || candidateKey.includes(moduleKey) || moduleKey.includes(candidateKey)));
    });
    if (byNormalizedName >= 0) {
      usedMappingIndexes.add(byNormalizedName);
      matchedByName += 1;
      return rawMappings[byNormalizedName];
    }

    placeholderCount += 1;
    unmatchedModuleNames.push(module.moduleName);
    return null;
  };

  const placeholderMapping = (module: MappingModuleReference): ModuleMapping =>
    createModuleMapping({
      moduleId: module.moduleId,
      moduleName: module.moduleName,
      hours: module.hours,
      typicalProjectName: `${module.moduleName}典型工作项目`,
      typicalProjectDescription: `面向${input.region}地区${input.majorDirection}岗位任务，完成${module.moduleName}相关项目交付。`,
      focus: module.moduleName,
      artifact: `${module.moduleName}项目成果`,
      workflow: ["接收任务", "分析需求", "制定方案", "完成制作", "检查修订", "提交成果"],
      skills: ["项目任务理解能力", "AI 工具辅助制作能力", "过程记录与问题修订能力", "成果展示与说明能力"],
      knowledge: ["课程模块知识", "工作流程规范", "成果质量标准", "工具使用边界"],
      assessment: ["过程记录检查", "阶段成果评审", "作品展示答辩"],
      standards: ["当前为占位映射，后续需接入真实企业标准、大赛证书或课程标准后校准"]
    });

  const moduleMappings: ModuleMapping[] = finalModules.map((module) => {
    const mapping = pickMappingForModule(module);
    if (!mapping) return placeholderMapping(module);

    const moduleId = module.moduleId;
    const moduleName = module.moduleName;
    return {
      moduleId,
      moduleName,
      hours: module.hours,
      typicalWorkProject: {
        id: `work_project_${moduleId}`,
        name: cleanDisplayText(mapping.typicalWorkProject, `${moduleName}典型工作项目`, 80),
        description: `${moduleName}对应典型工作项目，并从七个课程建设维度组织教学内容与评价要求。`
      },
      mappingDimensions: DIMENSION_ORDER.map((key) => {
        const title = DIMENSION_TITLES[key];
        const chineseKey = Object.entries(dimensionKeyByTitle).find(([, mappedKey]) => mappedKey === key)?.[0] || title;
        const items = semanticTextArray(mapping.dimensions?.[chineseKey as keyof NonNullable<typeof mapping.dimensions>], [`${moduleName}${title}`], 5);
        return dimensionItems(moduleId, key, items.map((text) => ({ text })));
      })
    };
  });
  const mappingWarnings = [
    "LOCAL_EXPANSION_MAPPING_ANALYSIS",
    matchedById ? "MODULE_MAPPING_MATCHED_BY_ID" : "",
    matchedByName ? "MODULE_MAPPING_MATCHED_BY_NAME" : "",
    placeholderCount === finalModules.length ? "MODULE_MAPPING_ALL_PLACEHOLDER_USED" : "",
    placeholderCount > 0 && placeholderCount < finalModules.length ? "MODULE_MAPPING_PARTIAL_PLACEHOLDER_USED" : "",
    placeholderCount ? `MODULE_MAPPING_UNMATCHED:${unmatchedModuleNames.join("、")}` : ""
  ].filter((warning): warning is string => Boolean(warning));

  const relatedJobs: CourseRelatedJob[] = rawRelatedJobs.slice(0, 8).map((job, index) => ({
    id: semanticId("job", cleanDisplayText(job.title, `岗位${index + 1}`, 60), index),
    title: cleanDisplayText(job.title, `岗位${index + 1}`, 60),
    relevance: semanticPercent(job.relevance, 80),
    reason: cleanDescription(job.description, "该岗位与课程项目流程、视觉创作工具和成果交付能力相关。", 160)
  }));
  const skillWeights: CourseSkillWeight[] = rawSkillWeights.slice(0, 8).map((skill) => ({
    skill: cleanDisplayText(skill.name, "课程技能", 60),
    weight: semanticPercent(skill.weight, 12),
    description: cleanDescription(skill.description, "该能力用于支撑课程项目实施、视觉成果优化和作品评价。", 160)
  }));
  const updateSuggestions: CourseUpdateSuggestion[] = rawSuggestions.slice(0, 6).map((suggestion) => ({
    title: cleanDisplayText(suggestion.title, "课程更新建议", 80),
    priority: suggestion.priority === "high" || suggestion.priority === "medium" || suggestion.priority === "low" ? suggestion.priority : "medium",
    reason: cleanDescription(suggestion.description, "根据产业、岗位和专业能力变化调整课程内容与项目任务。", 160),
    actions: [cleanDisplayText(suggestion.description, "结合课程建设继续细化实施动作。", 80)]
  }));

  return {
    moduleMappings,
    skillWeights,
    relatedJobs,
    salaryRanges: fallback.salaryRanges,
    evidenceSources: fallback.evidenceSources.map((source) => ({ ...source, url: null })),
    updateSuggestions,
    meta: stageMetaFromSkeleton(skeleton.meta, mappingWarnings)
  };
}

export function normalizeCourseAbilityGraphPayload(
  raw: CourseAbilityGraphModelOutput | null | undefined,
  input: CourseAbilityGraphInput = DEFAULT_INPUT
): CourseAbilityGraphPayload {
  const normalizedInput = normalizeInput(input);
  const fallback = createMockCourseAbilityGraph(normalizedInput);
  const rawGraph = isRecord(raw) ? raw : {};
  const warnings: string[] = [];
  let processGraphFallbackUsed = false;
  let courseGraphFallbackUsed = false;
  let moduleMappingPatched = false;

  const rawCourse: Record<string, unknown> = isRecord(rawGraph.course) ? rawGraph.course : {};
  const course = normalizeInput({
    courseName: cleanDisplayText(rawCourse["courseName"], normalizedInput.courseName, 60),
    majorDirection: cleanDisplayText(rawCourse["majorDirection"], normalizedInput.majorDirection, 40),
    region: cleanDisplayText(rawCourse["region"], normalizedInput.region, 40)
  });

  const useProcessStage = (field: "industryGraph" | "regionalJobGraph" | "majorAbilityGraph" | "coreCourseGraph", expectedId: ProcessGraphStageId) => {
    const value = rawGraph[field];
    if (validProcessGraphStage(value, expectedId)) return normalizeProcessGraphStageText(value as ProcessGraphStage);
    processGraphFallbackUsed = true;
    warnings.push(`缺少或无法识别 ${field}，已使用本地示例图谱兜底。`);
    return normalizeProcessGraphStageText(fallback[field]);
  };

  const industryGraph = useProcessStage("industryGraph", "industry");
  const regionalJobGraph = useProcessStage("regionalJobGraph", "regionalJobs");
  const majorAbilityGraph = useProcessStage("majorAbilityGraph", "majorAbilities");
  const rawCoreCourseGraph = useProcessStage("coreCourseGraph", "coreCourses");
  const coreCourseSuggestions = normalizeCoreCourseSuggestions(rawGraph.coreCourseSuggestions, fallback.coreCourseSuggestions, course, warnings);
  const coreCourseGraph = rebuildCoreCourseGraph(rawCoreCourseGraph, coreCourseSuggestions);

  const modelWorkflowStages = validArray<WorkflowStage>(rawGraph.workflowStages, validWorkflowStage)
    ? (rawGraph.workflowStages as WorkflowStage[])
    : null;
  const modelTeachingModules = validArray<TeachingModuleNode>(rawGraph.teachingModules, validTeachingModule)
    ? (rawGraph.teachingModules as TeachingModuleNode[])
    : null;
  const modelTasks = validArray<CourseTaskNode>(rawGraph.tasks, validCourseTask) ? (rawGraph.tasks as CourseTaskNode[]) : null;
  const modelCourseAbilityMap = validCourseAbilityMap(rawGraph.courseAbilityMap) ? (rawGraph.courseAbilityMap as CourseAbilityMap) : null;
  const courseStructureComplete = Boolean(modelWorkflowStages && modelTeachingModules && modelTasks && modelCourseAbilityMap);

  const teachingModuleIds = new Set((modelTeachingModules || []).map((module) => module.id));
  const workflowBindingsValid =
    Boolean(modelWorkflowStages && modelTeachingModules && modelTasks) &&
    modelWorkflowStages!.every((stage) => stage.moduleIds.every((moduleId) => teachingModuleIds.has(moduleId))) &&
    modelTasks!.every((task) => teachingModuleIds.has(task.moduleId));

  const workflowStagesSource = courseStructureComplete && workflowBindingsValid ? modelWorkflowStages! : fallback.workflowStages;
  const teachingModulesSource = courseStructureComplete && workflowBindingsValid ? modelTeachingModules! : fallback.teachingModules;
  const tasksSource = courseStructureComplete && workflowBindingsValid ? modelTasks! : fallback.tasks;
  const courseAbilityMapSource = courseStructureComplete && workflowBindingsValid ? modelCourseAbilityMap! : fallback.courseAbilityMap;
  const workflowStages = workflowStagesSource.map((stage, index) => ({
    ...stage,
    name: cleanDisplayText(stage.name, `工作流程${index + 1}`, 60),
    description: cleanDescription(stage.description, "围绕课程项目组织阶段任务、教学活动与成果评价。", 180)
  }));
  const teachingModules = teachingModulesSource.map((module, index) => ({
    ...module,
    name: cleanDisplayText(module.name, `教学模块${index + 1}`, 60),
    description: cleanDescription(module.description, "围绕典型工作任务组织知识、技能训练与项目成果。", 180)
  }));
  const tasks = tasksSource.map((task, index) => ({
    ...task,
    name: cleanDisplayText(task.name, `任务/能力点${index + 1}`, 70),
    abilityTags: uniqueDisplayStrings(task.abilityTags, []),
    aiTools: uniqueDisplayStrings(task.aiTools, []),
    description: cleanDescription(task.description, "完成对应工作任务，并形成可展示、可评价的过程成果。", 180)
  }));
  const courseAbilityMap: CourseAbilityMap = {
    ...courseAbilityMapSource,
    rootNode: {
      ...courseAbilityMapSource.rootNode,
      name: cleanDisplayText(courseAbilityMapSource.rootNode.name, `课程：${course.courseName}`, 90),
      description: cleanDescription(
        courseAbilityMapSource.rootNode.description,
        `面向${course.majorDirection}专业的${course.courseName}课程项目实践。`,
        200
      )
    },
    nodes: courseAbilityMapSource.nodes.map((node, index) => ({
      ...node,
      name: cleanDisplayText(node.name, `能力节点${index + 1}`, 80),
      description: cleanDescription(node.description, "围绕课程项目形成可执行、可评价的任务能力。", 180)
    }))
  };
  if (!courseStructureComplete || !workflowBindingsValid) {
    courseGraphFallbackUsed = true;
    warnings.push("课程能力图谱主结构不完整，已使用本地示例 workflowStages / teachingModules / tasks / courseAbilityMap 兜底。");
  }

  const alignedIndustryGraph = alignProcessStageWithTeachingModules(industryGraph, teachingModules);
  const alignedRegionalJobGraph = alignProcessStageWithTeachingModules(regionalJobGraph, teachingModules);
  const alignedMajorAbilityGraph = alignProcessStageWithTeachingModules(majorAbilityGraph, teachingModules);

  const moduleIdSet = new Set(teachingModules.map((module) => module.id));
  const rawModuleMappings = validArray<ModuleMapping>(rawGraph.moduleMappings, validModuleMapping)
    ? (rawGraph.moduleMappings as ModuleMapping[])
    : null;
  const validModuleMappings = rawModuleMappings?.filter((mapping) => moduleIdSet.has(mapping.moduleId)) || [];
  if (!rawModuleMappings) {
    moduleMappingPatched = true;
    warnings.push("缺少 moduleMappings，已使用本地示例课程映射兜底。");
  } else if (validModuleMappings.length !== rawModuleMappings.length) {
    moduleMappingPatched = true;
    warnings.push("NORMALIZE_MODULE_MAPPING_PATCHED");
    warnings.push("部分 moduleMappings 无法匹配 teachingModules.moduleId，已为缺失模块补充占位映射。");
  }
  const validMappingByModuleId = new Map(validModuleMappings.map((mapping) => [mapping.moduleId, mapping]));
  const fallbackMappingByModuleId = new Map(fallback.moduleMappings.filter((mapping) => moduleIdSet.has(mapping.moduleId)).map((mapping) => [mapping.moduleId, mapping]));
  const genericMappingByModuleId = new Map(buildGenericModuleMappings(course, teachingModules).map((mapping) => [mapping.moduleId, mapping]));
  const normalizedModuleMappings = teachingModules.map((module) => {
    const mapping = validMappingByModuleId.get(module.id) || fallbackMappingByModuleId.get(module.id) || genericMappingByModuleId.get(module.id);
    if (!validMappingByModuleId.has(module.id)) moduleMappingPatched = true;
    return mapping!;
  });
  if (rawModuleMappings && !validModuleMappings.length) {
    warnings.push("NORMALIZE_MODULE_MAPPING_PATCHED");
    warnings.push("moduleMappings 全部无效，已根据最终 teachingModules 生成占位课程映射兜底。");
  } else if (validModuleMappings.length && validModuleMappings.length < teachingModules.length) {
    warnings.push("NORMALIZE_MODULE_MAPPING_PATCHED");
    warnings.push("部分 teachingModules 缺少课程映射，已为缺失模块补充占位映射。");
  }
  if (moduleMappingPatched && !warnings.includes("NORMALIZE_MODULE_MAPPING_PATCHED")) warnings.push("NORMALIZE_MODULE_MAPPING_PATCHED");

  const evidenceSources = (
    validArray<CourseEvidenceSource>(rawGraph.evidenceSources, validEvidenceSource)
      ? (rawGraph.evidenceSources as CourseEvidenceSource[])
      : [fallbackEvidenceSource()]
  ).map((source) => ({
    ...source,
    title: cleanDisplayText(source.title, "待接入真实资料库", 80),
    summary: cleanDescription(source.summary, "当前仅保留占位状态，后续需接入真实资料库后人工校准。", 200),
    url: source.url || null
  }));
  if (!validArray<CourseEvidenceSource>(rawGraph.evidenceSources, validEvidenceSource)) {
    warnings.push("缺少 evidenceSources，已补充“待接入真实资料库”占位证据源。");
  }

  const courseProfile =
    isRecord(rawGraph.courseProfile) &&
    typeof rawGraph.courseProfile.positioning === "string" &&
    Array.isArray(rawGraph.courseProfile.targetJobIds) &&
    Array.isArray(rawGraph.courseProfile.coreAbilityStructure)
      ? {
          ...(rawGraph.courseProfile as CourseProfile),
          positioning: cleanDescription(
            (rawGraph.courseProfile as CourseProfile).positioning,
            courseAbilityMap.rootNode.description,
            200
          ),
          coreAbilityStructure: uniqueDisplayStrings(
            (rawGraph.courseProfile as CourseProfile).coreAbilityStructure,
            workflowStages.map((stage) => `${stage.name}（${stage.moduleIds.length} 个教学模块）`)
          ),
          mockNotice: DRAFT_EVIDENCE_NOTICE
        }
      : {
          positioning: courseAbilityMap.rootNode.description,
          targetJobIds: courseAbilityMap.rootNode.relatedJobIds,
          coreAbilityStructure: workflowStages.map((stage) => `${stage.name}（${stage.moduleIds.length} 个教学模块）`),
          mockNotice: DATA_NOTICE
        };
  if (!isRecord(rawGraph.courseProfile)) {
    warnings.push("缺少 courseProfile，已根据课程根节点和工作流程自动推导。");
  }

  const abilityTree = normalizeAbilityTreeDisplay(validOptionalArray<CourseAbilityTreeNode>(
    rawGraph.abilityTree,
    (item) => isRecord(item) && typeof item.id === "string" && typeof item.name === "string"
  )
    ? (rawGraph.abilityTree as CourseAbilityTreeNode[])
    : buildAbilityTree(courseAbilityMap.nodes));
  if (!Array.isArray(rawGraph.abilityTree)) {
    warnings.push("缺少 abilityTree，已根据 courseAbilityMap.nodes 自动推导。");
  }

  const skillWeights = (
    validArray<CourseSkillWeight>(rawGraph.skillWeights, (item) => isRecord(item) && typeof item.skill === "string")
      ? (rawGraph.skillWeights as CourseSkillWeight[])
      : fallback.skillWeights
  ).map((item, index) => ({
    ...item,
    skill: cleanDisplayText(item.skill, `专业能力${index + 1}`, 70),
    description: cleanDescription(item.description, "用于支撑课程项目实施和成果评价的关键专业能力。", 180)
  }));
  const relatedJobs = (
    validArray<CourseRelatedJob>(rawGraph.relatedJobs, (item) => hasStringId(item) && typeof (item as { title?: unknown }).title === "string")
      ? (rawGraph.relatedJobs as CourseRelatedJob[])
      : fallback.relatedJobs
  ).map((item, index) => ({
    ...item,
    title: cleanDisplayText(item.title, `相关岗位${index + 1}`, 70),
    reason: cleanDescription(item.reason, "该岗位与课程中的项目流程、工具应用和成果交付能力相关。", 180)
  }));
  const salaryRanges = (
    validArray<CourseSalaryRange>(rawGraph.salaryRanges, (item) => isRecord(item) && typeof item.jobTitle === "string")
      ? (rawGraph.salaryRanges as CourseSalaryRange[])
      : fallback.salaryRanges
  ).map((item, index) => ({
    ...item,
    jobTitle: cleanDisplayText(item.jobTitle, relatedJobs[index]?.title || `相关岗位${index + 1}`, 70),
    region: cleanDisplayText(item.region, course.region, 40),
    note: cleanDescription(item.note, "当前为待校准区间，后续需接入真实岗位资料进行人工核验。", 180)
  }));
  const updateSuggestions = (
    validArray<CourseUpdateSuggestion>(rawGraph.updateSuggestions, (item) => isRecord(item) && typeof item.title === "string")
      ? (rawGraph.updateSuggestions as CourseUpdateSuggestion[])
      : fallback.updateSuggestions
  ).map((item, index) => ({
    ...item,
    title: cleanDisplayText(item.title, `课程更新建议${index + 1}`, 80),
    reason: cleanDescription(item.reason, "根据产业、岗位和专业能力变化调整课程内容与项目任务。", 200),
    actions: uniqueDisplayStrings(item.actions, ["结合典型工作任务更新课程项目与评价要求"]).slice(0, 5)
  }));

  const industryTrends = (
    validArray<IndustryTrend>(rawGraph.industryTrends, hasStringId) ? (rawGraph.industryTrends as IndustryTrend[]) : fallback.industryTrends
  ).map((trend, index) => ({
    ...trend,
    name: cleanDisplayText(trend.name, `产业趋势${index + 1}`, 80),
    description: cleanDescription(trend.description, "该产业变化将影响课程项目、工具应用和成果交付要求。", 180)
  }));
  const regionalJobMap = (
    validArray<RegionalJob>(rawGraph.regionalJobMap, hasStringId) ? (rawGraph.regionalJobMap as RegionalJob[]) : fallback.regionalJobMap
  ).map((job, index) => ({
    ...job,
    title: cleanDisplayText(job.title, `区域岗位${index + 1}`, 80),
    region: cleanDisplayText(job.region, course.region, 40)
  }));
  const majorAbilityMap = (
    validArray<MajorAbility>(rawGraph.majorAbilityMap, hasStringId) ? (rawGraph.majorAbilityMap as MajorAbility[]) : fallback.majorAbilityMap
  ).map((ability, index) => ({
    ...ability,
    name: cleanDisplayText(ability.name, `专业能力${index + 1}`, 80),
    description: cleanDescription(ability.description, "该能力支撑课程项目实施、视觉成果优化和作品评价。", 180)
  }));
  const courseMappings = normalizeCourseMappingDisplay(
    validOptionalArray<CourseMapping>(rawGraph.courseMappings, (item) => isRecord(item) && typeof item.abilityId === "string")
      ? (rawGraph.courseMappings as CourseMapping[])
      : fallback.courseMappings
  );
  const impactPaths = (
    validArray<ImpactPath>(rawGraph.impactPaths, hasStringId) ? (rawGraph.impactPaths as ImpactPath[]) : fallback.impactPaths
  ).map((path) => ({
    ...path,
    industryTrend: cleanDisplayText(path.industryTrend, "产业变化", 80),
    affectedJobs: uniqueDisplayStrings(path.affectedJobs, ["相关岗位"]),
    majorAbilities: uniqueDisplayStrings(path.majorAbilities, ["专业能力"]),
    courseAbilities: uniqueDisplayStrings(path.courseAbilities, ["课程能力"]),
    teachingSuggestions: uniqueDisplayStrings(path.teachingSuggestions, ["结合典型工作任务组织项目教学"])
  }));

  const payload: CourseAbilityGraphPayload = {
    course,
    courseProfile,
    abilityTree,
    skillWeights,
    relatedJobs,
    salaryRanges,
    evidenceSources,
    updateSuggestions,
    industryTrends,
    regionalJobMap,
    majorAbilityMap,
    industryGraph: alignedIndustryGraph,
    regionalJobGraph: alignedRegionalJobGraph,
    majorAbilityGraph: alignedMajorAbilityGraph,
    coreCourseSuggestions,
    coreCourseGraph,
    courseAbilityMap,
    courseMappings,
    workflowStages,
    teachingModules,
    tasks,
    moduleMappings: normalizedModuleMappings,
    impactPaths,
    meta: normalizeMeta(
      rawGraph.meta,
      isRecord(raw) ? "model" : "mock",
      isRecord(raw)
        ? [
            ...(processGraphFallbackUsed || courseGraphFallbackUsed ? [courseAbilityDiagnosticWarning("NORMALIZE_FALLBACK_USED")] : []),
            ...(!processGraphFallbackUsed ? ["NORMALIZE_PROCESS_GRAPH_OK"] : []),
            ...(!courseGraphFallbackUsed ? ["NORMALIZE_COURSE_GRAPH_OK"] : []),
            ...warnings
          ]
        : warnings
    )
  };

  return payload;
}
