import type { AgentChatMessage } from "@/lib/agent/types";
import type { CourseAbilityGraphInput, MappingModuleReference } from "@/lib/capability-map/course-ability-graph";

const JSON_ONLY_RULES = [
  "只返回一个合法 JSON 对象。",
  "不要 Markdown，不要代码块，不要解释性文字。",
  "所有 id 使用稳定英文 snake_case。",
  "不要提供真实网页链接；如有 evidenceSources，url 必须为 null。"
].join("\n");

function courseContext(input: CourseAbilityGraphInput) {
  return {
    courseName: input.courseName,
    majorDirection: input.majorDirection,
    region: input.region
  };
}

export function buildCourseAbilityGraphMessages(input: CourseAbilityGraphInput): AgentChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是 NexusAI 的课程能力图谱结构化生成器。",
        "只返回一个合法 JSON 对象，不要 Markdown，不要代码块，不要解释性文字。",
        "返回结构必须兼容 CourseAbilityGraphModelOutput，可缺少非关键字段，但应尽量完整生成。",
        "必须覆盖链路：产业图谱 -> 区域岗位图谱 -> 专业能力图谱 -> 核心课程建议 -> 课程能力图谱 -> 课程映射。",
        "禁止伪造真实政策、报告、论文、网页链接或招聘统计。当前未接 RAG、爬虫、Neo4j 或真实资料库。",
        "evidenceSources 如无真实来源，只能使用“待接入真实资料库”“模型归纳依据”“本地示例占位来源”等占位标题；url 必须为 null，publishDate 必须为 null。",
        "meta.source 必须为 model，meta.provider 必须为 xheai，meta.model 必须为 gpt-5.4。",
        "所有 id 使用稳定英文 snake_case；moduleMappings[].moduleId 必须匹配 teachingModules[].id；当前课程的 coreCourseSuggestions 项必须 isCurrentCourse=true 且 status='available'。",
        "课程能力图谱主结构必须包含 workflowStages、teachingModules、tasks、courseAbilityMap、moduleMappings。",
        "图谱阶段必须使用 id：industry、regionalJobs、majorAbilities、coreCourses。"
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "生成课程能力图谱 CourseAbilityGraphModelOutput JSON",
        course: input,
        requiredTopLevelFields: [
          "course",
          "industryGraph",
          "regionalJobGraph",
          "majorAbilityGraph",
          "coreCourseSuggestions",
          "coreCourseGraph",
          "workflowStages",
          "teachingModules",
          "tasks",
          "courseAbilityMap",
          "moduleMappings",
          "skillWeights",
          "relatedJobs",
          "salaryRanges",
          "evidenceSources",
          "updateSuggestions",
          "meta"
        ],
        schemaNotes: {
          processGraphStage:
            "每个图谱包含 id/title/lead/summary/notice/nodes/edges/keyItems。nodes 使用 level 1/2/3；edges 使用 source/target/label。",
          courseAbilityMap:
            "rootNode.id 固定 course_root；nodes 可包含工作流程和任务能力点；edges 连接 root/stage/task。",
          workflowStages: "每个 stage 包含 id/name/description/moduleIds。",
          teachingModules: "每个 module 包含 id/name/hours/description/workflowStageId/taskIds/relatedJobIds/evidenceSourceIds/trendIds/teachingSuggestions/assessmentMethods。",
          tasks: "每个 task 包含 id/name/description/moduleId/abilityTags/aiTools/relatedJobIds/evidenceSourceIds/trendIds/teachingSuggestions/assessmentMethods。",
          moduleMappings:
            "每个映射包含 moduleId/moduleName/hours/typicalWorkProject/mappingDimensions；mappingDimensions 使用七类 key：coreTasks, standardWorkflow, coreOccupationalAbilities, assessableSkillPoints, supportingKnowledgePoints, assessmentMethods, enterpriseStandardsOrCertificates。",
          evidence:
            "未接真实资料库，不允许真实 URL；url=null；summary 明确说明这是模型归纳或占位来源，不能正式引用。"
        },
        contentRequirements: [
          "围绕地区、专业方向和课程名称生成，不要泛泛而谈。",
          "课程能力图谱根据课程动态生成 3-5 个工作流程、4-8 个教学模块、每个模块 2-5 个任务能力点。",
          "核心课程建议中突出当前课程，并根据专业能力说明它在专业课程体系中的真实定位。",
          "所有 evidenceSourceIds 必须能在 evidenceSources 中找到。",
          "所有 relatedJobIds 应尽量能在 relatedJobs 或 regionalJobMap 中找到。"
        ]
      })
    }
  ];
}

export function buildCapabilityMapProcessGraphsMessages(input: CourseAbilityGraphInput): AgentChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是课程体系语义骨架生成助手。",
        JSON_ONLY_RULES,
        "本阶段只输出轻量字段：structureStrategy、industryKeywords、industryChanges、courseImpacts、regionalJobs、majorAbilities、coreCourses、meta。",
        "节点数量、名称、权重和关系必须根据本次地区、专业与课程动态推导，不得套用影视动画或任何固定母版。",
        "不要生成完整图谱节点、边、课程能力图谱或课程映射。"
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "生成课程体系前置推导语义骨架 JSON",
        course: courseContext(input),
        outputShape: {
          structureStrategy: {
            industryLogic: "为什么选择这些产业方向",
            jobLogic: "为什么选择这些区域岗位",
            abilityLogic: "专业能力如何从岗位任务中抽取",
            courseLogic: "核心课程体系如何承接专业能力"
          },
          industryKeywords: ["3-6 个产业关键词"],
          industryChanges: ["3-7 个产业变化或生产方式变化"],
          courseImpacts: ["3-6 个由产业变化推导出的课程建设影响"],
          regionalJobs: [{ name: "岗位名称", relevance: "1-100", description: "一句话岗位说明", industryKeywords: ["相关产业关键词"] }],
          majorAbilities: [{ name: "专业能力名称", weight: "1-100", description: "一句话能力说明", elements: ["2-4 个能力要素"], relatedJobNames: ["支撑岗位名称"] }],
          coreCourses: [{ name: "核心课程名称", position: "课程定位", reason: "推荐原因", isCurrentCourse: "当前课程 true/false", supportedAbilityNames: ["支撑能力名称"], relatedJobNames: ["相关岗位名称"] }],
          meta: { source: "model", provider: "xheai", model: "gpt-5.4" }
        },
        requirements: [
          "regionalJobs 生成 4-8 个，majorAbilities 生成 4-8 个，coreCourses 生成 4-8 门。",
          "当前课程必须且只能出现一次，并设置 isCurrentCourse=true。",
          "不同课程不得同义重复，课程体系要覆盖该专业不同能力方向。",
          "关系字段只能引用本次 JSON 中已经出现的名称。",
          "所有说明控制在 40 个中文字符内，关系数组每项最多引用 4 个名称。",
          "所有内容围绕地区、专业方向和课程名称，不得沿用无关专业母版。"
        ]
      })
    }
  ];
}

export function buildCapabilityMapCourseGraphMessages(input: CourseAbilityGraphInput): AgentChatMessage[] {
  const example = {
    courseName: input.courseName,
    workflowStages: [
      {
        name: "需求与方案阶段",
        description: "完成需求分析、方案设计和实施规划。",
        modules: [
          {
            name: "课程专属方案模块",
            hours: 12,
            description: "根据课程对象设计专属方案。",
            tasks: [
              { name: "需求分析", description: "识别对象、目标和成果要求。" },
              { name: "方案设计", description: "形成可执行的项目方案。" }
            ]
          }
        ]
      },
      { name: "实施阶段", description: "完成课程核心项目生产。", modules: [{ name: "课程专属制作模块A", hours: 20, description: "根据课程目标动态命名。", tasks: [{ name: "项目任务A", description: "形成可检查的阶段成果。" }, { name: "质量修订A", description: "根据标准完成成果修订。" }] }, { name: "课程专属制作模块B", hours: 20, description: "根据课程流程动态命名。", tasks: [{ name: "项目任务B", description: "完成另一类核心工作任务。" }, { name: "质量修订B", description: "根据反馈优化阶段成果。" }] }] },
      { name: "交付阶段", description: "完成成果交付、展示和复盘。", modules: [{ name: "成果交付与复盘", hours: 12, description: "完成发布、展示、评价和复盘。", tasks: [{ name: "成果发布", description: "按平台规范完成成果交付。" }, { name: "项目复盘", description: "总结流程、问题和改进方向。" }] }] }
    ],
    meta: { note: "course-structure-skeleton" }
  };
  return [
    {
      role: "system",
      content: [
        "你是课程结构语义骨架生成助手。",
        "只返回一个合法 JSON 对象。",
        "不要 Markdown，不要代码块，不要解释性文字。",
        "本阶段只能输出 courseName、workflowStages、meta。",
        "禁止输出 courseAbilityMap、moduleMappings、evidenceSources、teachingModules、tasks、节点坐标或边。",
        "workflowStages 根据课程动态生成 3-5 个；modules 总数根据课程复杂度生成 4-8 个；每个 module 的 tasks 为 2-5 个。",
        "模块名称必须紧扣本课程，不得套用与课程无关的动画剧本、动画模型等固定名称。",
        "每条 description 不超过 40 个中文字符。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `课程名称：${input.courseName}`,
        `专业方向：${input.majorDirection}`,
        `地区：${input.region}`,
        "请只返回一个 JSON 对象，字段只能有 courseName、workflowStages、meta。",
        "不要输出 courseAbilityMap、moduleMappings、evidenceSources、teachingModules、tasks。",
        "workflowStages 生成 3-5 个，modules 总数生成 4-8 个，每个 module 的 tasks 为 2-5 个。",
        "请根据课程真实工作流程决定数量、名称、学时和任务，不要机械复制示例。",
        "所有字符串必须使用英文双引号完整闭合；不要使用注释；不要使用尾随逗号。",
        "下面仅展示 JSON 字段形状，禁止照抄其中的名称和结构数量。",
        JSON.stringify(example)
      ].join("\n")
    }
  ];
}

export function buildCapabilityMapMappingAnalysisMessages(input: CourseAbilityGraphInput, mappingModules?: MappingModuleReference[]): AgentChatMessage[] {
  const resolvedModules = mappingModules?.length
    ? mappingModules
    : [
        { moduleId: "course_planning", moduleName: `${input.courseName}需求与方案`, hours: 12, taskNames: ["需求分析", "方案设计"] },
        { moduleId: "course_production", moduleName: `${input.courseName}核心项目制作`, hours: 24, taskNames: ["项目实施", "质量修订"] },
        { moduleId: "course_delivery", moduleName: `${input.courseName}成果交付与复盘`, hours: 12, taskNames: ["成果发布", "项目复盘"] }
      ];
  return [
    {
      role: "system",
      content: [
        "你是课程映射语义骨架生成助手。",
        JSON_ONLY_RULES,
        "本阶段只输出轻量字段：moduleMappings、skillWeights、relatedJobs、updateSuggestions、meta。",
        "不要生成薪资区间、证据来源、完整 mappingDimensions 或真实来源。",
        "moduleMappings 必须严格使用用户给定的 teachingModules；不允许新增模块、不允许改名、不允许省略模块。",
        "moduleMappings.length 必须等于 teachingModules.length；每个 moduleMapping 必须包含给定 moduleId 和 moduleName。",
        "每个模块的七维内容必须结合该模块的 taskNames 单独推导，禁止多个模块复用同一组套话。",
        "七个维度每类只返回 1-2 个短句，每个短句不超过 24 个中文字符。"
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "生成课程映射与辅助分析骨架 JSON",
        course: courseContext(input),
        teachingModules: resolvedModules,
        outputShape: {
          moduleMappings: [
            {
              moduleId: "必须来自 teachingModules[].moduleId",
              moduleName: "必须来自 teachingModules[].moduleName",
              typicalWorkProject: "典型工作项目名称",
              dimensions: {
                核心工作任务: ["短句"],
                标准工作流程: ["短句"],
                核心职业能力: ["短句"],
                可考核技能点: ["短句"],
                支撑知识点: ["短句"],
                考核评价方式: ["短句"],
                对应企业标准或大赛证书要求: ["短句"]
              }
            }
          ],
          skillWeights: [{ name: "技能名称", weight: "1-100", description: "一句话说明" }],
          relatedJobs: [{ title: "岗位名称", relevance: "1-100", description: "一句话说明" }],
          updateSuggestions: [{ title: "建议标题", priority: "high/medium/low", description: "一句话说明" }],
          meta: { source: "model", provider: "xheai", model: "gpt-5.4" }
        },
        requirements: [
          "moduleMappings 必须逐一覆盖 teachingModules，顺序尽量保持一致。",
          "只能使用 teachingModules 中给出的 moduleId 和 moduleName。",
          "七维内容必须体现各模块 taskNames 的差异，不能只替换模块名称。",
          "每个维度返回 1-2 条可执行、可评价的短句，控制整体 JSON 体量。",
          "不要输出 evidenceSources、salaryRanges 或 URL。"
        ]
      })
    }
  ];
}
