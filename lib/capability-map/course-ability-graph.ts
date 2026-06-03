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

export type ProcessGraphStageId = "industry" | "regionalJobs" | "majorAbilities";

export type ProcessGraphNodeType = "industry" | "trend" | "impact" | "region" | "job" | "ability" | "element" | "courseModule";

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
  source: "model" | "mock";
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
  courseAbilityMap: CourseAbilityMap;
  courseMappings: CourseMapping[];
  workflowStages: WorkflowStage[];
  teachingModules: TeachingModuleNode[];
  tasks: CourseTaskNode[];
  moduleMappings: ModuleMapping[];
  impactPaths: ImpactPath[];
  meta: CourseAbilityGraphMeta;
};

type GenerateOptions = {
  signal?: AbortSignal;
};

const DEFAULT_INPUT: CourseAbilityGraphInput = {
  courseName: "AI动画全流程制作",
  majorDirection: "影视动画",
  region: "重庆"
};

const DATA_NOTICE = "当前为本地示例数据，未接入真实资料库，不能作为正式引用。";

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

function cleanText(value: unknown, fallback = "", maxLength = 120) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function normalizeInput(input: CourseAbilityGraphInput): CourseAbilityGraphInput {
  return {
    courseName: cleanText(input.courseName, DEFAULT_INPUT.courseName, 60),
    majorDirection: cleanText(input.majorDirection, DEFAULT_INPUT.majorDirection, 40),
    region: cleanText(input.region, DEFAULT_INPUT.region, 40)
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

  return {
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
      { jobTitle: "AI动画制作员", min: 7000, max: 15000, unit: "CNY/month", region: course.region, note: "本地示例区间，后续应接入真实招聘数据校准。" },
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
    industryGraph,
    regionalJobGraph,
    majorAbilityGraph,
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
}

export { createMockCourseAbilityGraph };

export async function generateCourseAbilityGraph(input: CourseAbilityGraphInput, _options: GenerateOptions = {}): Promise<CourseAbilityGraphPayload> {
  return createMockCourseAbilityGraph(input);
}
