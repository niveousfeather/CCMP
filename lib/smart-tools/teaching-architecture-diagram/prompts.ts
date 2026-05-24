import {
  type TeachingArchitectureBlueprint,
  type TeachingArchitectureBlueprintFields,
  type TeachingArchitectureDiagramType,
  type TeachingArchitectureImageNode
} from "@/lib/smart-tools/teaching-architecture-diagram/types";

export type TeachingArchitectureVisualPreset =
  | "teaching-loop-model"
  | "symmetric-capability-framework"
  | "vertical-implementation-route"
  | "horizontal-research-framework";

export const TEACHING_ARCHITECTURE_FIELD_LABELS: Record<keyof TeachingArchitectureBlueprintFields, string> = {
  teachingReformBackground: "教学改革背景",
  coreProblems: "核心问题",
  constructionGoals: "建设目标",
  teachingResources: "教学资源",
  implementationPath: "实施路径",
  teachingMode: "教学模式",
  technicalSupport: "技术支撑",
  evaluationMechanism: "评价机制",
  outcomes: "成果输出",
  demonstrationPromotion: "示范推广"
};

const VISUAL_PRESET_KEYWORDS: Record<TeachingArchitectureVisualPreset, string[]> = {
  "teaching-loop-model": [
    "教学改革",
    "课程建设",
    "素养",
    "数字赋能",
    "教学评价",
    "学情分析",
    "闭环优化",
    "课堂",
    "教学设计",
    "资源整合"
  ],
  "symmetric-capability-framework": [
    "人才培养",
    "能力达成",
    "岗位能力",
    "培养体系",
    "评价体系",
    "能力提升",
    "课程体系",
    "实践能力"
  ],
  "vertical-implementation-route": [
    "实施路径",
    "治理",
    "修复",
    "监测",
    "保障机制",
    "预警",
    "风险控制",
    "生态",
    "项目实施"
  ],
  "horizontal-research-framework": [
    "工艺",
    "技术路线",
    "性能优化",
    "机制研究",
    "制备",
    "调控",
    "材料",
    "装备",
    "实验体系"
  ]
};

const VISUAL_PRESET_LAYOUT_PROMPTS: Record<TeachingArchitectureVisualPreset, string[]> = {
  "teaching-loop-model": [
    "Preset: teaching-loop-model.",
    "A formal Chinese academic teaching reform framework diagram.",
    "Top row contains 3 to 5 rounded rectangular stage modules.",
    "Center contains a large main rounded rectangle or stacked cylinder-like process modules.",
    "Left and right sides contain driving factors and outcome factors.",
    "Use circular arrows around the center to show feedback loop and continuous improvement.",
    "Bottom contains a thesis-style figure caption area.",
    "Use teal green as the primary color, orange/red as accent colors, light blue auxiliary blocks.",
    "High information density but clean alignment.",
    "中文重点：顶部阶段、中央核心、左右输入输出、闭环反馈、底部论文图题。"
  ],
  "symmetric-capability-framework": [
    "Preset: symmetric-capability-framework.",
    "A symmetrical Chinese academic talent cultivation framework diagram.",
    "Center contains a large circular core goal node.",
    "Left and right sides are balanced capability modules.",
    "Use large curved arrows to form a closed-loop cultivation logic.",
    "Top area shows framework or objectives.",
    "Bottom area shows practice scenarios or implementation evidence boxes.",
    "Use purple and blue as primary colors, red only for key emphasis.",
    "Formal thesis figure style, clean white background.",
    "中文重点：中央目标、左右能力模块、外侧闭环、上方目标、下方证据盒。"
  ],
  "vertical-implementation-route": [
    "Preset: vertical-implementation-route.",
    "A vertical implementation route framework diagram.",
    "Main process flows from top to bottom in the center.",
    "Left and right side panels show supporting systems, risk control, expert mechanism, and outcome guarantee.",
    "Use orthogonal arrows, dashed feedback arrows, circular nodes, and hexagonal emphasis nodes.",
    "Use muted blue, green, and red palette.",
    "White background, formal research project diagram.",
    "中文重点：中央纵向流程、左右支撑保障、直角箭头、虚线反馈、圆形/六边形节点。"
  ],
  "horizontal-research-framework": [
    "Preset: horizontal-research-framework.",
    "A horizontal scientific research framework diagram.",
    "Top has a dark blue title bar.",
    "Left and right sides contain large circular system diagrams.",
    "Center contains core challenge and breakthrough direction.",
    "Use thick horizontal arrows and circular process arrows.",
    "Use navy blue, light blue, gray, and red highlight.",
    "Add dashed outer border and thesis-style caption area.",
    "中文重点：深蓝标题条、左右圆环系统、中央突破、横向粗箭头、论文图题。"
  ]
};

const IMAGE_STYLE_RULES = [
  "Chinese academic research framework diagram.",
  "2D vector infographic.",
  "white background.",
  "formal thesis figure.",
  "project proposal architecture diagram.",
  "teaching reform framework diagram.",
  "clean image-output layout reference.",
  "clean geometric shapes.",
  "central core concept.",
  "surrounding modules.",
  "closed-loop arrows.",
  "hierarchical containers.",
  "large readable Chinese labels.",
  "limited color palette.",
  "This image is the primary PNG output and should be useful as a final academic diagram preview.",
  "Prioritize diagram structure, hierarchy, spacing, and academic visual grammar.",
  "Text should be short, large, and readable.",
  "Do not create long paragraphs.",
  "Use Chinese labels as much as possible.",
  "Avoid random English text."
];

const IMAGE_TYPOGRAPHY_RULES = [
  "Use bold, large, readable Chinese labels.",
  "Use short Chinese phrases, not dense paragraphs.",
  "Node titles should be 2 to 8 Chinese characters when possible.",
  "Keywords should be 2 to 6 Chinese characters when possible.",
  "Avoid tiny dense paragraphs.",
  "Avoid messy overlapping text.",
  "Keep text inside shapes with generous padding."
];

const IMAGE_NEGATIVE_CONSTRAINTS = [
  "no 3D rendering",
  "no realistic scene",
  "no cyberpunk",
  "no neon glow",
  "no sci-fi poster",
  "no anime",
  "no poster illustration",
  "no illustration poster",
  "no people illustration",
  "no random English",
  "no random English text",
  "no watermark",
  "no logo",
  "no tiny dense paragraphs",
  "no messy overlapping text",
  "no decorative background texture",
  "no photorealistic image",
  "no complex lighting effects"
];

const STRICT_VISUAL_PRESET_KEYWORDS: Record<TeachingArchitectureVisualPreset, string[]> = {
  "teaching-loop-model": [
    "教学改革",
    "课程建设",
    "素养",
    "数字赋能",
    "教学评价",
    "学情分析",
    "闭环优化",
    "课堂",
    "教学设计",
    "资源整合"
  ],
  "symmetric-capability-framework": [
    "人才培养",
    "能力达成",
    "岗位能力",
    "培养体系",
    "评价体系",
    "能力提升",
    "课程体系",
    "实践能力"
  ],
  "vertical-implementation-route": [
    "实施路径",
    "治理",
    "修复",
    "监测",
    "保障机制",
    "预警",
    "风险控制",
    "生态",
    "项目实施"
  ],
  "horizontal-research-framework": [
    "工艺",
    "技术路线",
    "性能优化",
    "机制研究",
    "制备",
    "调控",
    "材料",
    "装备",
    "实验体系"
  ]
};

const STRICT_VISUAL_PRESET_LAYOUT_PROMPTS: Record<TeachingArchitectureVisualPreset, string[]> = {
  "teaching-loop-model": [
    "Preset: teaching-loop-model.",
    "A formal Chinese academic teaching reform framework diagram.",
    "Top row contains 3 to 5 rounded rectangular stage modules.",
    "Center contains a large main rounded rectangle or stacked cylinder-like process modules.",
    "Left and right sides contain driving factors and outcome factors.",
    "Use circular arrows around the center to show feedback loop and continuous improvement.",
    "Bottom contains a thesis-style figure caption area.",
    "Use teal green as the primary color, orange/red as accent colors, light blue auxiliary blocks.",
    "High information density but clean alignment.",
    "中文视觉规则：顶部 3-5 个阶段模块；中央核心模型；左侧驱动因素/输入；右侧成果/输出；中间闭环箭头表示反馈优化；底部论文图题；主色青绿，橙红强调，浅蓝辅助。"
  ],
  "symmetric-capability-framework": [
    "Preset: symmetric-capability-framework.",
    "A symmetrical Chinese academic talent cultivation framework diagram.",
    "Center contains a large circular core goal node.",
    "Left and right sides are balanced capability modules.",
    "Use large curved arrows to form a closed-loop cultivation logic.",
    "Top area shows framework or objectives.",
    "Bottom area shows practice scenarios or implementation evidence boxes.",
    "Use purple and blue as primary colors, red only for key emphasis.",
    "Formal thesis figure style, clean white background.",
    "中文视觉规则：中央大圆为核心目标；左右对称能力模块；外侧大弧形箭头形成闭环；上方培养框架/总目标；下方实践场景/证据盒；紫色与蓝色为主，红色只强调关键目标。"
  ],
  "vertical-implementation-route": [
    "Preset: vertical-implementation-route.",
    "A vertical implementation route framework diagram.",
    "Main process flows from top to bottom in the center.",
    "Left and right side panels show supporting systems, risk control, expert mechanism, and outcome guarantee.",
    "Use orthogonal arrows, dashed feedback arrows, circular nodes, and hexagonal emphasis nodes.",
    "Use muted blue, green, and red palette.",
    "White background, formal research project diagram.",
    "中文视觉规则：中央自上而下主流程；左右为支撑系统、风险控制、专家机制、结果保障；使用直角箭头、虚线反馈箭头、圆形节点、六边形强调节点；蓝绿红低饱和配色。"
  ],
  "horizontal-research-framework": [
    "Preset: horizontal-research-framework.",
    "A horizontal scientific research framework diagram.",
    "Top has a dark blue title bar.",
    "Left and right sides contain large circular system diagrams.",
    "Center contains core challenge and breakthrough direction.",
    "Use thick horizontal arrows and circular process arrows.",
    "Use navy blue, light blue, gray, and red highlight.",
    "Add dashed outer border and thesis-style caption area.",
    "中文视觉规则：顶部深蓝标题条；左右大圆环系统；中央核心挑战/核心突破；横向粗箭头连接；环形箭头表示过程；添加虚线外框和论文式图题。"
  ]
};

const ACADEMIC_PAPER_FIGURE_STYLE_SPEC = [
  "STYLE PRESET: academic_paper_figure_svg.",
  "目标风格：标准学术论文插图、项目结题汇报框架图、中文研究示意图；不是产品海报，不是 dashboard infographic，不是网页模块图。",
  "背景必须是纯白或极浅灰白；禁止底纹、纹理、科技光效和复杂背景。",
  "整体像 SVG / PPT 矢量模板：几何规整、对称稳定、线条统一、边框清晰、箭头清楚、文字锐利。",
  "顶部只放一行居中的粗体黑色中文标题，标题像论文插图标题；不要彩色标题栏，不要渐变横幅，不要科技感头图，不要装饰性 banner。",
  "默认不要副标题；除非内容列表明确给出副标题，否则不要自动生成系统感副标题、说明性副标题或口号。",
  "标题必须直接来自材料主题或蓝图标题，不要写“架构材料架构图”“中文教学改革成果架构图”“教学模式结构图”等系统生成感标题。",
  "配色克制：全图不超过 3 个强调色系；主结构用蓝/深蓝，辅助关系少量橙色或青绿，文字统一黑色。",
  "同类节点必须同色；不要彩虹式杂色，不要产品风多彩卡片排布。",
  "文字必须使用清晰黑体/思源黑体/微软雅黑风格；一级节点大字号，短标签少量小字；所有中文像 PPT 矢量文本一样清晰。",
  "优先保证中文文字清晰，不要为了高密度牺牲可读性；节点数量宁少勿多，不要生成微小文字。",
  "模块之间留足空白，文字不要贴边、压线、重叠、被箭头穿过或被图标遮挡。",
  "图元只优先使用：圆、椭圆、圆角矩形、简单容器框、实线箭头、虚线箭头、环形箭头、分层线。",
  "线条使用统一细描边；主箭头可用蓝色，辅助线用浅蓝或灰色虚线；不要花式描边。",
  "默认禁用阴影；如必须表现层次，只允许极轻微浅灰阴影，不要立体投影、发光、玻璃质感。",
  "尽量不使用 icon；如果使用，只能作为极小辅助符号，不得成为主视觉，不得替代节点文本。",
  "NEGATIVE STRICT PAPER FIGURE MODE: 不要产品 UI 卡片感，不要 dashboard，不要网页模块风，不要大面积 icon 设计。",
  "NEGATIVE: 不要封面海报，不要宣传海报，不要产品运营长图，不要网页首页 hero 图，不要 PPT 模板封面。",
  "NEGATIVE: 不要装饰性副标题，不要科技感横幅，不要复杂背景纹理，不要人物大图，不要照片拼贴，不要无意义装饰线条。",
  "NEGATIVE: 不要炫彩渐变，不要厚阴影，不要 3D 立体，不要发光边框，不要玻璃拟态，不要 UI 化卡片堆叠。",
  "NEGATIVE: 不要可爱化、插画化、炫酷科技风；不要手机/电脑页面式布局。",
  "NEGATIVE: 不要伪中文、乱码、英文占位符、lorem ipsum、糊字、重影、锯齿字、文字压线或文字重叠。"
].join("\n");

const LAYOUT_SPECS: Record<Exclude<TeachingArchitectureDiagramType, "auto">, string[]> = {
  central_model: [
    "LAYOUT: central_model.",
    "固定结构：中心 1 个核心主题圆或椭圆，外围 5~6 个支撑节点均匀放射分布。",
    "中心节点置于画面几何中心，外围节点按圆周或规则多边形等间距排列；不走大环，不画连续闭环箭头。",
    "中心到每个外围节点使用直线或短箭头连接，线宽统一，形成“核心主题 + 支撑体系”。",
    "外围节点使用圆、椭圆或圆角矩形，尺寸统一；每个外围节点只放主标题和最多 2 个短标签。",
    "整体必须几何对称、规整、留白均匀；不要自由发散脑图，不要散乱卡片，不要 icon 主导。"
  ],
  closed_loop: [
    "LAYOUT: closed_loop.",
    "固定结构：中心 1 个核心主题圆，外围 5~6 个等间距圆形主节点。",
    "外围主节点围绕中心形成标准环状闭环；主箭头必须顺时针连续连接每个外围节点并回到起点。",
    "中心到外围节点可使用少量灰蓝色虚线辅助连接，但虚线不得穿过文字。",
    "闭环适合表达“需求-资源-实施-反馈-改进-成果”类逻辑，节点位置必须均匀、对称、规整。",
    "闭环必须一眼可见；不要画成散点卡片、自由脑图、dashboard 模块或多层装饰环。"
  ],
  three_layer: [
    "LAYOUT: three_layer.",
    "固定结构：上中下三层横向分层，优先使用三条清晰容器带。",
    "上层放目标/理念/需求类节点，中层放课堂实施/路径/模式类节点，下层放资源/平台/评价/保障类节点。",
    "每层模块数量有限，整图主节点总数控制在 5~6 个；层内节点左右均匀排列。",
    "层与层之间用垂直箭头或支撑线连接，体现自下而上支撑和自上而下牵引。",
    "不要做成产品功能卡片墙，不要多列 dashboard；必须像论文中的分层架构图。"
  ],
  left_center_right_flow: [
    "LAYOUT: left_center_right_flow.",
    "固定结构：左侧 1~2 个输入模块，中间 1 个核心过程模块或 2~3 个过程节点，右侧 1~2 个输出模块。",
    "主逻辑方向严格从左到右：左侧问题/需求 -> 中间实施/路径 -> 右侧成果/推广。",
    "使用水平主箭头连接三段，箭头粗细统一且不得穿过文字。",
    "底部可放一条细虚线反馈/持续改进回路，从右侧回到中间或左侧，但不要形成复杂装饰。",
    "适合表达“问题-目标-资源-产出”或“背景-实施-成果”；不要变成横向 dashboard 或 UI 卡片排版。"
  ],
  tree_module: [
    "LAYOUT: tree_module.",
    "固定结构：自上而下树状展开，顶层 1 个根节点，一级分支 3~5 个，二级分支少量短标签。",
    "根节点位于顶部居中或左侧起点，一级分支使用组织结构图式连接线，分支间距均匀。",
    "每个一级分支只放主标题和最多 2 个短标签，二级信息不得扩展成密集小字。",
    "分类关系必须清楚，连接线必须像组织结构图或指标体系图。",
    "适合表达体系、模块、资源、分类；不要自由发散脑图，不要装饰性树枝，不要 icon 堆砌。"
  ]
};

export function buildTeachingArchitectureAgentPrompt(blueprint: TeachingArchitectureBlueprint) {
  return [
    "你是教学改革材料分析 Agent。",
    "任务：从用户文字或文件解析结果中提取教学改革要素，输出 diagram_blueprint.json。",
    "必须提取字段：teachingReformBackground、coreProblems、constructionGoals、teachingResources、implementationPath、teachingMode、technicalSupport、evaluationMechanism、outcomes、demonstrationPromotion。",
    "每个字段输出 3~5 个中文短标签，优先 2~8 个汉字，不输出长段落。",
    "标题优先使用正文中的项目名称、成果名称、课题名称或模式名称；如果没有明确标题，再生成“xxx实施路径图 / xxx框架图 / xxx结构图”。",
    "禁止生成“架构材料架构图”“中文教学改革成果架构图”“教学模式结构图”等系统感标题。",
    "如果 diagramType 为 auto，请根据材料内容选择 recommendedType，可选 central_model、three_layer、left_center_right_flow、closed_loop、tree_module。",
    `用户选择 diagramType：${blueprint.diagramType}`,
    `原始输入来源摘要：${blueprint.source.sourceSummary}`,
    `提取文本长度：${blueprint.source.textLength}`,
    `核心主题：${blueprint.coreTheme}`,
    `图型选择原因：${blueprint.layoutIntent.reason}`,
    blueprint.source.warnings?.length ? `解析提醒：${blueprint.source.warnings.join("；")}` : "解析提醒：无",
    "输出必须是稳定 JSON，包含 sourceType、diagramType、title、coreTheme、fields、layoutIntent、visualPlan、imageNodes。",
    "不要输出 Markdown，不要输出解释文字。"
  ].join("\n\n");
}

export function chooseTeachingArchitectureVisualPreset(
  blueprint: TeachingArchitectureBlueprint
): TeachingArchitectureVisualPreset {
  const searchText = [
    blueprint.title,
    blueprint.coreTheme,
    blueprint.layoutIntent.reason,
    blueprint.layoutIntent.mainStructure,
    blueprint.layoutIntent.flowDirection,
    ...blueprint.layoutIntent.emphasisNodes,
    ...Object.values(blueprint.fields).flat(),
    ...blueprint.imageNodes.flatMap((node) => [node.title, ...node.shortTags, ...node.evidence])
  ].join(" ");

  const orderedPresets: TeachingArchitectureVisualPreset[] = [
    "teaching-loop-model",
    "symmetric-capability-framework",
    "vertical-implementation-route",
    "horizontal-research-framework"
  ];

  return orderedPresets.find((preset) => STRICT_VISUAL_PRESET_KEYWORDS[preset].some((keyword) => searchText.includes(keyword))) || "teaching-loop-model";
}

export function buildTeachingArchitectureImagePrompt(params: {
  blueprint: TeachingArchitectureBlueprint;
  visualPreset?: TeachingArchitectureVisualPreset;
}): string;
export function buildTeachingArchitectureImagePrompt(blueprint: TeachingArchitectureBlueprint): string;
export function buildTeachingArchitectureImagePrompt(
  input:
    | TeachingArchitectureBlueprint
    | {
        blueprint: TeachingArchitectureBlueprint;
        visualPreset?: TeachingArchitectureVisualPreset;
      }
) {
  const blueprint = "blueprint" in input ? input.blueprint : input;
  const visualPreset = "blueprint" in input && input.visualPreset ? input.visualPreset : chooseTeachingArchitectureVisualPreset(blueprint);
  const contentSpec = buildAcademicImageContentSpec(blueprint);
  const paletteSpec = buildVisualPresetPaletteSpec(visualPreset);

  return [
    "=== ROLE / STYLE ===",
    "You are an expert diagram designer for Chinese academic papers, research proposals, teaching reform reports, and PPT thesis figures.",
    "Create a Chinese academic research framework diagram, not a poster.",
    ...IMAGE_STYLE_RULES,
    "",
    "=== LAYOUT PRESET ===",
    ...STRICT_VISUAL_PRESET_LAYOUT_PROMPTS[visualPreset],
    `visualPreset: ${visualPreset}`,
    `canvasAspectRatio: ${blueprint.visualPlan.aspectRatio}`,
    `canvasSize: ${blueprint.visualPlan.size}`,
    `orientation: ${blueprint.visualPlan.orientation}`,
    "The layout should remain clean enough to archive as SVG later, but the PNG itself is the primary user-facing output.",
    "",
    "=== CONTENT ===",
    contentSpec,
    "",
    "=== VISUAL RULES ===",
    "Use a white background or extremely light background only.",
    "Use 2D flat vector style with clear outlines.",
    "Use clean geometric shapes: circles, rings, rounded rectangles, hexagons, arrows, dashed containers, and partition boxes.",
    "Keep a clear central core concept and surrounding modules.",
    "Use closed-loop arrows only where they clarify feedback and continuous improvement.",
    "Use hierarchical containers when grouping stages, mechanisms, supports, or evaluation systems.",
    "Keep information density high but alignment clean.",
    "Avoid decorative elements that weaken the formal academic framework diagram.",
    "",
    "=== TYPOGRAPHY ===",
    ...IMAGE_TYPOGRAPHY_RULES,
    "",
    "=== COLOR PALETTE ===",
    paletteSpec,
    "",
    "=== NEGATIVE CONSTRAINTS ===",
    ...IMAGE_NEGATIVE_CONSTRAINTS,
    "",
    "=== FINAL OUTPUT INTENT ===",
    "This output.png is the primary user-facing diagram preview.",
    "Do not try to write the full source document into the image.",
    "Prioritize layout, hierarchy, spacing, academic visual grammar, and large readable Chinese labels."
  ].join("\n");
}

export function buildTeachingArchitectureImageRevisionPrompt(params: {
  blueprint: TeachingArchitectureBlueprint;
  visualPreset?: TeachingArchitectureVisualPreset;
  instruction: string;
  previousPrompt?: string;
}) {
  const visualPreset = params.visualPreset || chooseTeachingArchitectureVisualPreset(params.blueprint);
  const contentSpec = buildAcademicImageContentSpec(params.blueprint);
  const revisionInstruction = sanitizeRevisionInstruction(params.instruction);

  return [
    "=== ROLE / STYLE ===",
    "You are editing an existing Chinese academic research framework diagram image.",
    "Keep the diagram as a formal thesis figure and project proposal architecture diagram.",
    "Keep the same 2D vector infographic style, white background, clean geometric shapes, central core concept, surrounding modules, closed-loop arrows, hierarchical containers, and limited color palette.",
    "",
    "=== IMAGE REVISION TASK ===",
    "Use the provided current output.png as the visual reference whenever an input image is available.",
    "Modify only the parts requested by the user instruction.",
    "Preserve the overall academic diagram layout, structure, arrows, module placement, spacing, and visual grammar.",
    "If the instruction asks to change Chinese text, replace the target text with large readable Chinese labels and keep it inside the original card/node area.",
    "Do not redesign the whole figure unless the instruction explicitly asks for a full redesign.",
    "",
    "=== USER EDIT INSTRUCTION ===",
    revisionInstruction,
    "",
    "=== LAYOUT PRESET TO PRESERVE ===",
    ...STRICT_VISUAL_PRESET_LAYOUT_PROMPTS[visualPreset],
    `visualPreset: ${visualPreset}`,
    "",
    "=== CONTENT BOUNDARY ===",
    contentSpec,
    "The source content above is only a boundary for terms and labels. Do not add long paragraphs.",
    "",
    "=== TYPOGRAPHY ===",
    ...IMAGE_TYPOGRAPHY_RULES,
    "After editing, all Chinese labels must remain large, sharp, readable, and aligned.",
    "",
    "=== COLOR PALETTE ===",
    buildVisualPresetPaletteSpec(visualPreset),
    "",
    "=== NEGATIVE CONSTRAINTS ===",
    ...IMAGE_NEGATIVE_CONSTRAINTS,
    "",
    "=== FINAL OUTPUT INTENT ===",
    "Return one updated PNG diagram image.",
    "This is image-level revision for the current diagram preview.",
    "No random English text. No watermark. No logo. No poster style."
  ].join("\n");
}

function buildGenerationConstraintSummary(
  blueprint: TeachingArchitectureBlueprint,
  concreteType: Exclude<TeachingArchitectureDiagramType, "auto">,
  nodes: TeachingArchitectureImageNode[]
) {
  return [
    "这是中文学术汇报架构图，目标是论文插图 / 结题汇报图。",
    "不是海报，不是 UI，不是 dashboard，不是网页模块，不是 PPT 封面。",
    "顶部黑色粗体单行中文标题；白底；无副标题；无彩色标题栏。",
    "结构必须规整、对称、清晰，必须严格使用固定 layout 模板。",
    `固定模板：${concreteType}；auto 图型时已经选择 recommendedType=${blueprint.layoutIntent.recommendedType}，必须套用该模板。`,
    `节点数量：${nodes.length} 个主节点；不得新增主节点；每个主节点最多 2 个短标签。`,
    "图元仅用圆、椭圆、圆角矩形、简单容器框、实线箭头、虚线箭头；减少 icon；默认无阴影。",
    "所有中文必须像 PPT 矢量文本一样清晰，节点宁少勿多，不要微小文字。"
  ].join("\n");
}

function buildAcademicImageContentSpec(blueprint: TeachingArchitectureBlueprint) {
  const modules = getPromptImageNodes(blueprint).slice(0, 6);
  const normalizedModules = modules.length ? modules : createAcademicReadableImageSections(blueprint.fields).slice(0, 6);

  return [
    `Title: ${compactPromptText(blueprint.title, 28)}`,
    `Core theme: ${compactPromptText(blueprint.coreTheme, 18)}`,
    "Primary modules, use only these short labels and keywords:",
    ...normalizedModules.map(formatAcademicImageModule),
    `Emphasis words: ${blueprint.layoutIntent.emphasisNodes.map((item) => compactPromptText(item, 10)).filter(Boolean).slice(0, 4).join(", ") || "none"}`,
    "Do not add a document summary. Do not add long paragraphs. Do not include extracted-content."
  ].join("\n");
}

function formatAcademicImageModule(node: TeachingArchitectureImageNode, index: number) {
  const title = compactPromptText(node.title, 10);
  const keywords = uniquePromptItems([...node.shortTags, ...node.evidence])
    .map((item) => compactPromptText(item, 10))
    .filter(Boolean)
    .slice(0, 4);
  return `${index + 1}. ${title}${keywords.length ? ` | keywords: ${keywords.join(", ")}` : ""}`;
}

function buildVisualPresetPaletteSpec(visualPreset: TeachingArchitectureVisualPreset) {
  const common = [
    "Use limited color palette.",
    "White background.",
    "Use restrained academic colors, not random rainbow colors.",
    "Use orange or red only as small accent color unless the preset says otherwise."
  ];

  const presetLines: Record<TeachingArchitectureVisualPreset, string[]> = {
    "teaching-loop-model": ["Primary: teal green. Auxiliary: light blue. Accent: orange/red."],
    "symmetric-capability-framework": ["Primary: purple and blue. Accent: red only for key emphasis."],
    "vertical-implementation-route": ["Primary: muted blue and green. Accent: muted red."],
    "horizontal-research-framework": ["Primary: navy blue and light blue. Auxiliary: gray. Accent: red highlight."]
  };

  return [...common, ...presetLines[visualPreset]].join("\n");
}

function buildContentSpec(blueprint: TeachingArchitectureBlueprint) {
  const nodes = getPromptImageNodes(blueprint);
  return [
    `title: ${blueprint.title}`,
    `coreTheme: ${blueprint.coreTheme}`,
    `diagramType: ${blueprint.diagramType}`,
    `recommendedType: ${blueprint.layoutIntent.recommendedType}`,
    blueprint.diagramType === "auto"
      ? `autoLayoutDecision: 使用 blueprint.layoutIntent.recommendedType=${blueprint.layoutIntent.recommendedType}，并严格套用对应 layout spec。`
      : `requestedLayout: 使用用户指定图型 ${blueprint.diagramType}。`,
    "imageNodes:",
    ...nodes.map(formatImageNode),
    `emphasisNodes: ${blueprint.layoutIntent.emphasisNodes.join("、") || "无"}`
  ].join("\n");
}

function getPromptImageNodes(blueprint: TeachingArchitectureBlueprint) {
  return (blueprint.imageNodes?.length ? blueprint.imageNodes : createAcademicReadableImageSections(blueprint.fields)).slice(0, 6);
}

function createAcademicReadableImageSections(fields: TeachingArchitectureBlueprintFields): TeachingArchitectureImageNode[] {
  const backgroundAndProblems = uniquePromptItems([...fields.teachingReformBackground, ...fields.coreProblems]).slice(0, 2);
  const technicalEvaluation = uniquePromptItems([...fields.technicalSupport, ...fields.evaluationMechanism]).slice(0, 2);
  const outcomesAndPromotion = uniquePromptItems([...fields.outcomes, ...fields.demonstrationPromotion]).slice(0, 2);

  return [
    {
      title: "背景问题",
      shortTags: backgroundAndProblems,
      category: "combined",
      evidence: backgroundAndProblems
    },
    {
      title: "建设目标",
      shortTags: fields.constructionGoals.slice(0, 2),
      category: "constructionGoals",
      evidence: fields.constructionGoals.slice(0, 2)
    },
    {
      title: "资源支撑",
      shortTags: fields.teachingResources.slice(0, 2),
      category: "teachingResources",
      evidence: fields.teachingResources.slice(0, 2)
    },
    {
      title: "实施路径",
      shortTags: fields.implementationPath.slice(0, 2),
      category: "implementationPath",
      evidence: fields.implementationPath.slice(0, 2)
    },
    {
      title: "教学模式",
      shortTags: fields.teachingMode.slice(0, 2),
      category: "teachingMode",
      evidence: fields.teachingMode.slice(0, 2)
    },
    {
      title: "技术评价",
      shortTags: technicalEvaluation,
      category: "combined",
      evidence: technicalEvaluation
    },
    {
      title: "成果推广",
      shortTags: outcomesAndPromotion,
      category: "combined",
      evidence: outcomesAndPromotion
    }
  ];
}

function formatImageNode(node: TeachingArchitectureImageNode, index: number) {
  const tags = node.shortTags.length ? `；短标签：${node.shortTags.join("、")}` : "";
  const evidence = node.evidence.length ? `；evidence：${node.evidence.join("、")}` : "";
  return `${index + 1}. ${node.title}${tags}${evidence}`;
}

function createReadableImageSections(fields: TeachingArchitectureBlueprintFields): TeachingArchitectureImageNode[] {
  const sections: TeachingArchitectureImageNode[] = [
    {
      title: "背景问题",
      shortTags: uniquePromptItems([...fields.teachingReformBackground, ...fields.coreProblems]).slice(0, 2),
      category: "combined",
      evidence: uniquePromptItems([...fields.teachingReformBackground, ...fields.coreProblems]).slice(0, 2)
    },
    {
      title: "建设目标",
      shortTags: fields.constructionGoals.slice(0, 2),
      category: "constructionGoals",
      evidence: fields.constructionGoals.slice(0, 2)
    },
    {
      title: "资源支撑",
      shortTags: fields.teachingResources.slice(0, 2),
      category: "teachingResources",
      evidence: fields.teachingResources.slice(0, 2)
    },
    {
      title: "实施路径",
      shortTags: fields.implementationPath.slice(0, 2),
      category: "implementationPath",
      evidence: fields.implementationPath.slice(0, 2)
    },
    {
      title: "教学模式",
      shortTags: fields.teachingMode.slice(0, 2),
      category: "teachingMode",
      evidence: fields.teachingMode.slice(0, 2)
    },
    {
      title: "技术评价",
      shortTags: uniquePromptItems([...fields.technicalSupport, ...fields.evaluationMechanism]).slice(0, 2),
      category: "combined",
      evidence: uniquePromptItems([...fields.technicalSupport, ...fields.evaluationMechanism]).slice(0, 2)
    },
    {
      title: "成果推广",
      shortTags: uniquePromptItems([...fields.outcomes, ...fields.demonstrationPromotion]).slice(0, 2),
      category: "combined",
      evidence: uniquePromptItems([...fields.outcomes, ...fields.demonstrationPromotion]).slice(0, 2)
    }
  ];
  return sections;
}

function uniquePromptItems(items: string[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function compactPromptText(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, "").replace(/[，。；：、,.!?！？;:]+$/g, "").trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function sanitizeRevisionInstruction(value: string) {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length > 1000 ? `${normalized.slice(0, 1000)}...` : normalized;
}

function resolveConcreteDiagramType(blueprint: TeachingArchitectureBlueprint): Exclude<TeachingArchitectureDiagramType, "auto"> {
  const type = blueprint.diagramType === "auto" ? blueprint.layoutIntent.recommendedType : blueprint.diagramType;
  return type === "auto" ? "central_model" : type;
}

export function buildTeachingArchitecturePromptBundle(
  blueprint: TeachingArchitectureBlueprint,
  visualPreset = chooseTeachingArchitectureVisualPreset(blueprint)
) {
  return [
    "# 原始输入来源摘要",
    blueprint.source.sourceSummary,
    "",
    "# 提取出的核心主题",
    blueprint.coreTheme,
    "",
    "# blueprint JSON 摘要",
    createBlueprintSummary(blueprint),
    "",
    "# 图型选择原因",
    blueprint.layoutIntent.reason,
    "",
    "# 视觉模板",
    visualPreset,
    "",
    "# Agent 分析 prompt",
    buildTeachingArchitectureAgentPrompt(blueprint),
    "",
    "# Image 生成 prompt",
    buildTeachingArchitectureImagePrompt({ blueprint, visualPreset })
  ].join("\n\n---\n\n");
}

function createBlueprintSummary(blueprint: TeachingArchitectureBlueprint) {
  const fields = Object.entries(blueprint.fields)
    .map(([key, values]) => `${TEACHING_ARCHITECTURE_FIELD_LABELS[key as keyof TeachingArchitectureBlueprintFields]}=${values.join("、")}`)
    .join("\n");

  const imageNodes = blueprint.imageNodes
    .map((node, index) => `${index + 1}. ${node.title}${node.shortTags.length ? `(${node.shortTags.join("、")})` : ""}`)
    .join("\n");

  return [
    `sourceType=${blueprint.sourceType}`,
    `sourceExtractionStatus=${blueprint.sourceExtractionStatus}`,
    `diagramType=${blueprint.diagramType}`,
    `recommendedType=${blueprint.layoutIntent.recommendedType}`,
    `stylePreset=${blueprint.visualPlan.stylePreset}`,
    `aspectRatio=${blueprint.visualPlan.aspectRatio}`,
    `size=${blueprint.visualPlan.size}`,
    `title=${blueprint.title}`,
    `coreTheme=${blueprint.coreTheme}`,
    fields,
    "imageNodes:",
    imageNodes
  ].join("\n");
}
