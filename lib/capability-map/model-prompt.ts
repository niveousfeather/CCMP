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
          "课程能力图谱默认生成 3 个工作流程、5 个教学模块、每个模块 2-4 个任务能力点。",
          "核心课程建议中突出当前课程，并说明它承接 AI 工具链 + 动画全流程项目实践。",
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
        "本阶段只输出轻量字段：industryKeywords、industryChanges、regionalJobs、majorAbilities、coreCourses、meta。",
        "不要生成完整图谱节点、边、课程能力图谱或课程映射。"
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "生成课程体系前置推导语义骨架 JSON",
        course: courseContext(input),
        outputShape: {
          industryKeywords: ["3-5 个产业关键词"],
          industryChanges: ["4-6 个产业变化或生产方式变化"],
          regionalJobs: [{ name: "岗位名称", relevance: "1-100", description: "一句话岗位说明" }],
          majorAbilities: [{ name: "专业能力名称", weight: "1-100", description: "一句话能力说明" }],
          coreCourses: [{ name: "核心课程名称", position: "课程定位", reason: "推荐原因", isCurrentCourse: "当前课程 true/false" }],
          meta: { source: "model", provider: "xheai", model: "gpt-5.4" }
        },
        requirements: ["coreCourses 至少 6 门，当前课程必须 isCurrentCourse=true。", "所有内容围绕地区、专业方向和课程名称。"]
      })
    }
  ];
}

export function buildCapabilityMapCourseGraphMessages(input: CourseAbilityGraphInput): AgentChatMessage[] {
  const example = {
    courseName: input.courseName,
    workflowStages: [
      {
        name: "前期策划阶段",
        description: "完成主题、剧本、分镜和视觉设定。",
        modules: [
          {
            name: "动画剧本设定",
            hours: 16,
            description: "完成剧本、分镜、原画和场景设定。",
            tasks: [
              { name: "动画剧本撰写", description: "完成主题、人物关系和剧情结构。" },
              { name: "动画分镜设计", description: "完成镜头脚本与画面调度设计。" }
            ]
          }
        ]
      },
      {
        name: "资产制作阶段",
        description: "完成角色、道具和场景资产制作。",
        modules: [
          {
            name: "动画模型制作",
            hours: 20,
            description: "完成角色、道具和基础模型资产。",
            tasks: [
              { name: "角色模型生成", description: "完成角色模型生成与结构检查。" },
              { name: "模型资产优化", description: "完成模型修正、命名和资产整理。" }
            ]
          },
          {
            name: "动画场景搭建",
            hours: 16,
            description: "完成场景空间、灯光和材质设定。",
            tasks: [
              { name: "场景空间搭建", description: "完成镜头所需场景空间组织。" },
              { name: "灯光材质设置", description: "完成视觉风格和渲染基础设置。" }
            ]
          }
        ]
      },
      {
        name: "动画输出阶段",
        description: "完成镜头动画、合成、渲染和展示。",
        modules: [
          {
            name: "动画制作",
            hours: 24,
            description: "完成镜头动作、节奏和动画表现。",
            tasks: [
              { name: "镜头动画制作", description: "完成关键镜头动作与节奏控制。" },
              { name: "动画效果修订", description: "根据反馈优化动作和镜头衔接。" }
            ]
          },
          {
            name: "动画渲染输出",
            hours: 16,
            description: "完成合成、渲染、剪辑和作品展示。",
            tasks: [
              { name: "渲染合成输出", description: "完成画面合成、渲染和文件输出。" },
              { name: "作品展示复盘", description: "完成作品展示、评价和修改记录。" }
            ]
          }
        ]
      }
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
        "workflowStages 必须正好 3 个；modules 总数必须为 5 个；每个 module 的 tasks 为 2-4 个。",
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
        "workflowStages 正好 3 个，modules 总数正好 5 个，每个 module 的 tasks 为 2-4 个。",
        "所有字符串必须使用英文双引号完整闭合；不要使用注释；不要使用尾随逗号。",
        "如果不确定如何生成，请直接按下面示例结构返回，并只做必要的课程名称替换。",
        JSON.stringify(example)
      ].join("\n")
    }
  ];
}

export function buildCapabilityMapMappingAnalysisMessages(input: CourseAbilityGraphInput, mappingModules?: MappingModuleReference[]): AgentChatMessage[] {
  const resolvedModules = mappingModules?.length
    ? mappingModules
    : [
        { moduleId: "script_design", moduleName: "动画剧本设定", hours: 16 },
        { moduleId: "model_generation", moduleName: "动画模型制作", hours: 20 },
        { moduleId: "animation_production", moduleName: "动画制作", hours: 24 },
        { moduleId: "scene_building", moduleName: "动画场景搭建", hours: 16 },
        { moduleId: "render_output", moduleName: "动画渲染输出", hours: 12 }
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
        "moduleMappings.length 必须等于 teachingModules.length；每个 moduleMapping 必须包含给定 moduleId 和 moduleName。"
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
          "不要输出 evidenceSources、salaryRanges 或 URL。"
        ]
      })
    }
  ];
}
