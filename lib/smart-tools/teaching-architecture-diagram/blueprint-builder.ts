import "server-only";

import { callChatModel } from "@/lib/agent/router";
import { getAgentModelConfig } from "@/lib/agent/models";
import { getExtractionSourceStatus } from "@/lib/smart-tools/teaching-architecture-diagram/content-extractor";
import { TEACHING_ARCHITECTURE_FIELD_LABELS } from "@/lib/smart-tools/teaching-architecture-diagram/prompts";
import {
  AGENT_ANALYSIS_TIMEOUT_MS,
  TEACHING_ARCHITECTURE_STYLE_PRESET,
  type TeachingArchitectureBlueprint,
  type TeachingArchitectureBlueprintFieldKey,
  type TeachingArchitectureBlueprintFields,
  type TeachingArchitectureDiagramType,
  type TeachingArchitectureExtraction,
  type TeachingArchitectureGeneratedFallbacks,
  type TeachingArchitectureImageNode,
  type TeachingArchitectureVisualPlan
} from "@/lib/smart-tools/teaching-architecture-diagram/types";
import type { AgentProvider } from "@/lib/agent/types";

type FieldRule = {
  key: TeachingArchitectureBlueprintFieldKey;
  keywords: RegExp;
  fallback: string[];
};

const MAX_FIELD_LABELS = 2;
const MAX_NODE_LABEL_LENGTH = 8;
const MAX_SHORT_TAG_LENGTH = 6;
const MIN_IMAGE_NODES = 5;
const DEFAULT_IMAGE_NODES = 5;
const MAX_IMAGE_NODES = 6;
const TITLE_SUFFIXES = ["实施路径图", "机制图", "模式图", "框架图", "结构图"] as const;
const ACADEMIC_NODE_LABELS = [
  "产业需求",
  "问题导向",
  "目标引领",
  "资源支撑",
  "课堂实施",
  "实践平台",
  "成果转化",
  "数据监测",
  "评价反馈",
  "持续改进",
  "案例项目库",
  "协同育人",
  "项目牵引",
  "能力提升",
  "质量监测",
  "实践应用",
  "示范推广",
  "机制保障"
];
const COMMON_CONCEPT_PHRASES = [
  "产业需求",
  "问题导向",
  "目标引领",
  "资源支撑",
  "课堂实施",
  "实践平台",
  "成果转化",
  "数据监测",
  "评价反馈",
  "持续改进",
  "协同育人",
  "机制保障",
  "学生基础",
  "学生能力",
  "能力提升",
  "真实项目",
  "项目牵引",
  "课程资源",
  "案例项目库",
  "企业案例库",
  "案例项目",
  "实践平台",
  "实训平台",
  "数字工具",
  "课前诊断",
  "课堂实施",
  "课后评价",
  "反馈改进",
  "评价反馈",
  "反馈滞后",
  "过程评价",
  "质量监测",
  "数据监测",
  "需求分析",
  "项目设计",
  "协同实施",
  "导师协同",
  "项目孵化",
  "竞赛训练",
  "创业项目",
  "社会服务",
  "成果转化",
  "课程案例",
  "学生作品",
  "示范推广",
  "示范辐射",
  "区域示范",
  "创新创业",
  "质量提升",
  "工程实践",
  "课堂任务",
  "碎片化"
];

const FIELD_RULES: FieldRule[] = [
  {
    key: "teachingReformBackground",
    keywords: /背景|现状|痛点|改革|新工科|数字化|人才培养|产业|转型|需求/g,
    fallback: ["改革背景", "培养需求", "数字转型"]
  },
  {
    key: "coreProblems",
    keywords: /问题|不足|瓶颈|困难|挑战|偏差|脱节|薄弱|滞后/g,
    fallback: ["核心问题", "机制不足", "目标脱节"]
  },
  {
    key: "constructionGoals",
    keywords: /目标|建设|培养|提升|达成|预期|能力|素养|成效/g,
    fallback: ["建设目标", "能力提升", "成果达成"]
  },
  {
    key: "teachingResources",
    keywords: /课程|资源|平台|案例|数据库|教材|实训|项目库|素材/g,
    fallback: ["课程资源", "案例项目", "实践平台"]
  },
  {
    key: "implementationPath",
    keywords: /路径|实施|阶段|步骤|推进|落地|流程|任务|行动/g,
    fallback: ["实施路径", "分段推进", "落地执行"]
  },
  {
    key: "teachingMode",
    keywords: /模式|机制|方法|课堂|混合式|项目式|协同|探究|翻转/g,
    fallback: ["教学模式", "项目驱动", "协同课堂"]
  },
  {
    key: "technicalSupport",
    keywords: /AI|人工智能|数字化|平台|智能|技术|数据|工具|算法|画像/g,
    fallback: ["技术支撑", "数据驱动", "智能工具"]
  },
  {
    key: "evaluationMechanism",
    keywords: /评价|反馈|考核|诊断|监测|质量|评估|量规|闭环/g,
    fallback: ["评价机制", "过程反馈", "质量监测"]
  },
  {
    key: "outcomes",
    keywords: /成果|论文|课程|案例|获奖|推广|应用|作品|示范/g,
    fallback: ["成果输出", "课程案例", "应用成效"]
  },
  {
    key: "demonstrationPromotion",
    keywords: /示范|推广|辐射|共享|校际|区域|复制|交流|培训/g,
    fallback: ["示范推广", "区域辐射", "共享复制"]
  }
];

const DIAGRAM_RULES: Array<{
  type: Exclude<TeachingArchitectureDiagramType, "auto">;
  keywords: RegExp;
  reason: string;
}> = [
  {
    type: "closed_loop",
    keywords: /诊断|实施|评价|反馈|改进|闭环|循环|迭代|持续/g,
    reason: "材料强调诊断、实施、评价、反馈和持续改进，适合用闭环表达。"
  },
  {
    type: "three_layer",
    keywords: /基础层|实施层|评价层|支撑层|三层|层级|上层|中层|下层/g,
    reason: "材料强调分层建设和支撑关系，适合用三层架构表达。"
  },
  {
    type: "left_center_right_flow",
    keywords: /输入|过程|输出|前中后|左中右|流程|阶段|从.*到|协同推进/g,
    reason: "材料强调输入、过程、输出或阶段推进，适合用左中右流程表达。"
  },
  {
    type: "tree_module",
    keywords: /资源分类|模块体系|指标体系|模块|分类|体系|树状|矩阵/g,
    reason: "材料强调模块体系和分类结构，适合用树状模块表达。"
  },
  {
    type: "central_model",
    keywords: /核心目标|核心主题|多模块|支撑|驱动|中心|协同|融合/g,
    reason: "材料强调核心目标和多模块支撑，适合用中心模型表达。"
  }
];

export function buildTeachingArchitectureBlueprintFromExtraction(input: {
  extraction: TeachingArchitectureExtraction;
  diagramType: TeachingArchitectureDiagramType;
  generatedAt: string;
}): TeachingArchitectureBlueprint {
  const text = input.extraction.extractedText;
  const theme = extractCoreTheme(text, input.extraction.sourceSummary);
  const generatedFallback: TeachingArchitectureGeneratedFallbacks = {};
  const fields = FIELD_RULES.reduce((acc, rule) => {
    const values = extractFieldValues(text, rule);
    if (values.length) {
      acc[rule.key] = values;
    } else {
      acc[rule.key] = rule.fallback.slice(0, MAX_FIELD_LABELS).map((item) => fitNodeText(item));
      generatedFallback[rule.key] = true;
    }
    return acc;
  }, createEmptyFields());

  const recommendedType = input.diagramType === "auto" ? inferRecommendedType(text, fields) : input.diagramType;
  const layout = createLayoutIntent(recommendedType, input.diagramType, text, fields);
  const extractionStatus = getExtractionSourceStatus(input.extraction);
  const imageNodes = buildImageNodes(fields, theme);
  const visualPlan = createVisualPlan(recommendedType);
  const title = createAcademicFigureTitle(theme, text);

  return {
    version: 2,
    sourceType: input.extraction.sourceType,
    sourceExtractionStatus: extractionStatus,
    diagramType: input.diagramType,
    title,
    coreTheme: theme,
    fields,
    generatedFallback,
    layoutIntent: layout,
    visualPlan,
    imageNodes,
    generatedAt: input.generatedAt,
    source: {
      parser: "rule_based",
      sourceSummary: input.extraction.sourceSummary,
      textLength: input.extraction.textLength,
      files: input.extraction.files,
      warnings: input.extraction.warnings
    },
    sections: Object.entries(fields).map(([key, items]) => ({
      key: key as TeachingArchitectureBlueprintFieldKey,
      title: TEACHING_ARCHITECTURE_FIELD_LABELS[key as TeachingArchitectureBlueprintFieldKey],
      summary: `${TEACHING_ARCHITECTURE_FIELD_LABELS[key as TeachingArchitectureBlueprintFieldKey]}：${items.join("、")}`,
      items
    }))
  };
}

export async function buildTeachingArchitectureBlueprintWithModel(input: {
  extraction: TeachingArchitectureExtraction;
  diagramType: TeachingArchitectureDiagramType;
  generatedAt: string;
  signal: AbortSignal;
}): Promise<TeachingArchitectureBlueprint> {
  const localBlueprint = buildTeachingArchitectureBlueprintFromExtraction(input);
  const config = getAgentModelConfig();
  const primary = {
    model: process.env.TEACHING_ARCHITECTURE_ANALYSIS_MODEL?.trim() || config.taskPrimary.model,
    provider: readProvider(process.env.TEACHING_ARCHITECTURE_ANALYSIS_PROVIDER, config.taskPrimary.provider)
  };
  const fallback = {
    model: process.env.TEACHING_ARCHITECTURE_ANALYSIS_FALLBACK_MODEL?.trim() || config.taskFallback.model,
    provider: readProvider(process.env.TEACHING_ARCHITECTURE_ANALYSIS_FALLBACK_PROVIDER, config.taskFallback.provider)
  };

  const messages = buildTeachingArchitectureAnalysisMessages(input.extraction, input.diagramType, localBlueprint);
  try {
    const content = await callChatModel({
      stage: "teaching-architecture-analysis",
      provider: primary.provider,
      model: primary.model,
      messages,
      maxTokens: 2600,
      signal: input.signal,
      timeoutMs: AGENT_ANALYSIS_TIMEOUT_MS
    });
    return normalizeModelBlueprint(JSON.parse(extractJsonText(content)), localBlueprint, primary);
  } catch (primaryError) {
    if (input.signal.aborted) throw primaryError;
    console.warn(
      `[teaching-architecture-diagram:model] primary failed provider=${primary.provider} model=${primary.model} error=${primaryError instanceof Error ? primaryError.message : "unknown"}`
    );
  }

  try {
    const content = await callChatModel({
      stage: "teaching-architecture-analysis-fallback",
      provider: fallback.provider,
      model: fallback.model,
      messages,
      maxTokens: 2600,
      signal: input.signal,
      timeoutMs: AGENT_ANALYSIS_TIMEOUT_MS
    });
    return normalizeModelBlueprint(JSON.parse(extractJsonText(content)), localBlueprint, fallback);
  } catch (fallbackError) {
    if (input.signal.aborted) throw fallbackError;
    console.warn(
      `[teaching-architecture-diagram:model] fallback failed provider=${fallback.provider} model=${fallback.model} error=${fallbackError instanceof Error ? fallbackError.message : "unknown"}`
    );
    throw new Error(
      `AI_MODEL_ANALYSIS_FAILED: primary=${primary.provider}/${primary.model}; fallback=${fallback.provider}/${fallback.model}; ${fallbackError instanceof Error ? fallbackError.message : "unknown"}`
    );
  }

}

function buildTeachingArchitectureAnalysisMessages(
  extraction: TeachingArchitectureExtraction,
  diagramType: TeachingArchitectureDiagramType,
  localBlueprint: TeachingArchitectureBlueprint
) {
  const documentText = extraction.extractedText.slice(0, 28_000);
  return [
    {
      role: "system" as const,
      content: "你是教学改革材料分析专家。请真实阅读用户上传文档，提炼可用于生成教学架构图的结构化蓝图。只输出 JSON，不要 Markdown。"
    },
    {
      role: "user" as const,
      content: [
        "请基于以下文档内容生成教学架构图蓝图。",
        "",
        "必须输出 JSON，字段如下：",
        '{ "title": "12-24字中文标题", "coreTheme": "4-12字核心主题", "layoutIntent": { "recommendedType": "central_model|three_layer|left_center_right_flow|closed_loop|tree_module", "reason": "...", "mainStructure": "...", "flowDirection": "...", "emphasisNodes": ["..."] }, "fields": { "teachingReformBackground": ["..."], "coreProblems": ["..."], "constructionGoals": ["..."], "teachingResources": ["..."], "implementationPath": ["..."], "teachingMode": ["..."], "technicalSupport": ["..."], "evaluationMechanism": ["..."], "outcomes": ["..."], "demonstrationPromotion": ["..."] }, "imageNodes": [{ "title": "2-8字节点", "shortTags": ["2-6字", "2-6字"], "category": "combined", "evidence": ["文档依据"] }] }',
        "",
        "约束：",
        "- 每个字段给 2-3 个短中文标签，不要长句。",
        "- imageNodes 输出 5-6 个主节点，必须来自文档内容，不要泛化成空话。",
        "- 如果用户选择 auto，请自己选择 recommendedType；否则尊重用户选择。",
        "- 标题必须来自文档主题，禁止“教学架构图”“中文教学改革架构图”等套话。",
        "- 不要输出英文占位，不要输出乱码。",
        "",
        `用户选择图型：${diagramType}`,
        `本地初步标题：${localBlueprint.title}`,
        `本地初步核心主题：${localBlueprint.coreTheme}`,
        `文档摘要：${extraction.sourceSummary}`,
        "",
        "文档正文：",
        documentText
      ].join("\n")
    }
  ];
}

function normalizeModelBlueprint(
  raw: unknown,
  fallback: TeachingArchitectureBlueprint,
  modelInfo: { provider: AgentProvider; model: string }
): TeachingArchitectureBlueprint {
  const body = raw && typeof raw === "object" ? (raw as Partial<TeachingArchitectureBlueprint>) : {};
  const fields = normalizeModelFields(body.fields, fallback.fields);
  const recommendedType = normalizeDiagramType(
    body.layoutIntent?.recommendedType || fallback.layoutIntent.recommendedType,
    fallback.layoutIntent.recommendedType
  );
  const imageNodes = normalizeModelImageNodes(body.imageNodes, fields, fallback.imageNodes);
  const title = cleanShortText(body.title, 28) || fallback.title;
  const coreTheme = cleanShortText(body.coreTheme, 14) || fallback.coreTheme;
  const layoutIntent = {
    recommendedType,
    reason: cleanSentence(body.layoutIntent?.reason, 80) || fallback.layoutIntent.reason,
    mainStructure: cleanSentence(body.layoutIntent?.mainStructure, 80) || fallback.layoutIntent.mainStructure,
    flowDirection: cleanSentence(body.layoutIntent?.flowDirection, 80) || fallback.layoutIntent.flowDirection,
    emphasisNodes: normalizeStringArray(body.layoutIntent?.emphasisNodes, 6, 12, fallback.layoutIntent.emphasisNodes)
  };

  return {
    ...fallback,
    title,
    coreTheme,
    fields,
    generatedFallback: {},
    layoutIntent,
    visualPlan: createVisualPlan(recommendedType),
    imageNodes,
    source: {
      ...fallback.source,
      parser: "ai_model",
      provider: modelInfo.provider,
      model: modelInfo.model
    },
    sections: Object.entries(fields).map(([key, items]) => ({
      key: key as TeachingArchitectureBlueprintFieldKey,
      title: TEACHING_ARCHITECTURE_FIELD_LABELS[key as TeachingArchitectureBlueprintFieldKey],
      summary: `${TEACHING_ARCHITECTURE_FIELD_LABELS[key as TeachingArchitectureBlueprintFieldKey]}：${items.join("、")}`,
      items
    }))
  };
}

function normalizeModelFields(raw: unknown, fallback: TeachingArchitectureBlueprintFields): TeachingArchitectureBlueprintFields {
  const source = raw && typeof raw === "object" ? raw as Partial<Record<TeachingArchitectureBlueprintFieldKey, unknown>> : {};
  return (Object.keys(fallback) as TeachingArchitectureBlueprintFieldKey[]).reduce((acc, key) => {
    acc[key] = normalizeStringArray(source[key], 3, 10, fallback[key]).slice(0, 3);
    return acc;
  }, createEmptyFields());
}

function normalizeModelImageNodes(
  raw: unknown,
  fields: TeachingArchitectureBlueprintFields,
  fallback: TeachingArchitectureImageNode[]
): TeachingArchitectureImageNode[] {
  const nodes = Array.isArray(raw) ? raw : [];
  const normalized = nodes
    .map((node) => {
      if (!node || typeof node !== "object") return null;
      const value = node as Partial<TeachingArchitectureImageNode>;
      const title = cleanShortText(value.title, MAX_NODE_LABEL_LENGTH);
      if (!title) return null;
      return {
        title,
        shortTags: normalizeStringArray(value.shortTags, 2, MAX_SHORT_TAG_LENGTH, []).slice(0, 2),
        category: isBlueprintCategory(value.category) ? value.category : "combined",
        evidence: normalizeStringArray(value.evidence, 2, 28, [])
      };
    })
    .filter(Boolean) as TeachingArchitectureImageNode[];

  if (normalized.length >= MIN_IMAGE_NODES) return normalized.slice(0, MAX_IMAGE_NODES);
  const localNodes = buildImageNodes(fields, normalized[0]?.title || fallback[0]?.title || "教学改革");
  return [...normalized, ...localNodes].slice(0, MAX_IMAGE_NODES);
}

function normalizeStringArray(raw: unknown, maxItems: number, maxChars: number, fallback: string[]) {
  const values = Array.isArray(raw) ? raw : [];
  const cleaned = values
    .map((item) => cleanShortText(item, maxChars))
    .filter((item): item is string => Boolean(item));
  const fallbackValues = fallback.map((item) => cleanShortText(item, maxChars)).filter((item): item is string => Boolean(item));
  return (cleaned.length ? cleaned : fallbackValues).slice(0, maxItems);
}

function cleanShortText(value: unknown, maxChars: number) {
  if (typeof value !== "string") return "";
  return Array.from(value.replace(/[<>{}[\]`]/g, "").replace(/\s+/g, "").trim()).slice(0, maxChars).join("");
}

function cleanSentence(value: unknown, maxChars: number) {
  if (typeof value !== "string") return "";
  return Array.from(value.replace(/[<>`]/g, "").replace(/\s+/g, " ").trim()).slice(0, maxChars).join("");
}

function normalizeDiagramType(value: unknown, fallback: TeachingArchitectureDiagramType): Exclude<TeachingArchitectureDiagramType, "auto"> {
  if (
    value === "central_model" ||
    value === "three_layer" ||
    value === "left_center_right_flow" ||
    value === "closed_loop" ||
    value === "tree_module"
  ) {
    return value;
  }
  return fallback === "auto" ? "central_model" : fallback;
}

function isBlueprintCategory(value: unknown): value is TeachingArchitectureBlueprintFieldKey {
  return typeof value === "string" && value in createEmptyFields();
}

function readProvider(value: string | undefined, fallback: AgentProvider): AgentProvider {
  return value === "xheai" || value === "moonshot" || value === "claudecoder" || value === "subrouter" ? value : fallback;
}

function extractJsonText(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function createEmptyFields(): TeachingArchitectureBlueprintFields {
  return {
    teachingReformBackground: [],
    coreProblems: [],
    constructionGoals: [],
    teachingResources: [],
    implementationPath: [],
    teachingMode: [],
    technicalSupport: [],
    evaluationMechanism: [],
    outcomes: [],
    demonstrationPromotion: []
  };
}

function extractFieldValues(text: string, rule: FieldRule) {
  const segments = splitTextSegments(text);
  const candidates = segments
    .filter((segment) => {
      if (isTitleNoiseSegment(segment)) return false;
      rule.keywords.lastIndex = 0;
      return rule.keywords.test(segment);
    })
    .flatMap((segment) => extractShortPhrases(segment))
    .filter(Boolean)
    .map((phrase) => fitNodeText(phrase))
    .filter((phrase) => !isGenericOrNoisyLabel(phrase));

  return unique(candidates).slice(0, MAX_FIELD_LABELS);
}

function splitTextSegments(text: string) {
  return text
    .split(/[\n。；;！？!?、，,：:（）()【】\[\]<>《》]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 2);
}

function extractShortPhrases(segment: string) {
  const cleaned = segment
    .replace(/^[-*#\d.\s]+/, "")
    .replace(/`n|\\n/g, "")
    .replace(/^(通过|围绕|针对|基于|构建|推进|形成|实现|提升|建立|开展|面向|聚焦|依托)/, "")
    .trim();
  if (!cleaned) return [];
  if (isTitleNoiseSegment(cleaned)) return [];

  const commonMatches = COMMON_CONCEPT_PHRASES.filter((phrase) => cleaned.includes(phrase));
  if (commonMatches.length) return commonMatches.slice(0, 3);

  const parts = cleaned
    .split(/和|与|及|以及|并|、|，|,|；|;/)
    .map((part) => part.trim())
    .filter(Boolean);
  const compressed = parts.flatMap((part) => compressConceptPhrase(part));
  if (compressed.length) return compressed.slice(0, 3);

  if (cleaned.length <= 12) return [cleaned];
  const chunks = cleaned.match(/[\u4e00-\u9fa5A-Za-z0-9]{4,12}/g) || [];
  return chunks.length ? chunks.slice(0, 2) : [cleaned.slice(0, 12)];
}

function compressConceptPhrase(text: string) {
  const cleaned = text.replace(/^(输入端|过程端|输出端|背景|问题|目标|路径|资源)[：:]?/, "").trim();
  if (!cleaned) return [];
  if (COMMON_CONCEPT_PHRASES.includes(cleaned)) return [cleaned];
  const matches = Array.from(
    cleaned.matchAll(/[\u4e00-\u9fa5A-Za-z0-9]{0,6}(需求|能力|资源|平台|案例库|项目库|项目|诊断|实施|评价|反馈|改进|闭环|成果|推广|示范|路径|模式|机制|体系|课程|课堂|实训|监测|训练|孵化|服务|辐射|转化|工具|基础)/g)
  )
    .map((match) => match[0])
    .filter((item) => item.length >= 4 && item.length <= 10);
  if (matches.length) return matches;
  if (cleaned.length >= 4 && cleaned.length <= 10) return [cleaned];
  return [];
}

function fitNodeText(text: string, maxLength = MAX_NODE_LABEL_LENGTH) {
  const cleaned = text
    .replace(/^#+/, "")
    .replace(/\s+/g, "")
    .replace(/[`*_~|]+/g, "")
    .replace(/[，。；;,.!！?？:：]/g, "")
    .replace(/^(推动|推进|构建|建设|打造|形成|实施|开展|加强|完善|提升)/, "")
    .replace(/(机制|体系|模式|平台|资源|路径|成果)\1+/g, "$1")
    .trim();
  if (!cleaned) return "待完善";
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength);
}

function fitShortTag(text: string) {
  return fitNodeText(text, MAX_SHORT_TAG_LENGTH);
}

function normalizeNodeTitle(title: string) {
  const compact = fitNodeText(title, MAX_NODE_LABEL_LENGTH);
  const academic = ACADEMIC_NODE_LABELS.find((label) => compact.includes(label) || label.includes(compact));
  if (academic) return academic;
  return compact;
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeDedupeKey(value);
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function reduceRepeatedTerms(nodes: TeachingArchitectureImageNode[]) {
  const termCounts = new Map<string, number>();
  return nodes.map((node) => {
    const nextTags = node.shortTags.filter((tag) => {
      const key = normalizeDedupeKey(tag);
      if (!key) return false;
      const count = termCounts.get(key) || 0;
      termCounts.set(key, count + 1);
      return count < 2;
    });
    return {
      ...node,
      title: normalizeNodeTitle(node.title),
      shortTags: unique(nextTags).slice(0, 2),
      evidence: unique(node.evidence).slice(0, 2)
    };
  });
}

function haveSharedCoreTerm(left: string, right: string) {
  const leftKey = normalizeDedupeKey(left);
  const rightKey = normalizeDedupeKey(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey.length < 3 || rightKey.length < 3) return false;
  return leftKey.includes(rightKey) || rightKey.includes(leftKey);
}

function extractCoreTheme(text: string, fallback: string) {
  const explicitThemeMatch = text.match(/(?:项目名称|成果名称|课题名称|模式名称|项目主题|主题|题目)[：:\s]*([^\n。；;]{4,40})/);
  if (explicitThemeMatch?.[1]) {
    const candidate = normalizeThemeCandidate(explicitThemeMatch[1]);
    if (isChineseThemeCandidate(candidate)) return fitNodeText(candidate, 22);
  }

  const titleMatch = text.match(/(?:项目|课程|改革|成果|课题|模式)[：:\s]*([^\n。；;]{4,40})/);
  if (titleMatch?.[1]) {
    const candidate = normalizeThemeCandidate(titleMatch[1]);
    if (isChineseThemeCandidate(candidate)) return fitNodeText(candidate, 22);
  }

  const firstMeaningful = splitTextSegments(text)
    .map(normalizeThemeCandidate)
    .find((segment) => isChineseThemeCandidate(segment));
  if (firstMeaningful) return fitNodeText(firstMeaningful, 22);

  const fallbackTheme = normalizeThemeCandidate(fallback);
  if (isChineseThemeCandidate(fallbackTheme)) return fitNodeText(fallbackTheme, 22);
  return "教学改革路径与成果转化";
}

function normalizeThemeCandidate(text: string) {
  return text
    .replace(/【[^】]+】/g, "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/^#+/, "")
    .replace(/^(项目|成果|课题|模式)?(名称|主题|题目)\s*[：:]?/, "")
    .replace(/(架构材料架构图|中文教学改革成果架构图|教学模式结构图|架构图架构图|框架图框架图)/g, "")
    .replace(/\.(txt|md|pdf|docx|pptx)$/i, "")
    .trim();
}

function isChineseThemeCandidate(text: string) {
  return /[\u4e00-\u9fa5]/.test(text) && text.replace(/[^\u4e00-\u9fa5]/g, "").length >= 4;
}

function inferRecommendedType(
  text: string,
  fields: TeachingArchitectureBlueprintFields
): Exclude<TeachingArchitectureDiagramType, "auto"> {
  const scores = DIAGRAM_RULES.map((rule) => {
    const matches = text.match(rule.keywords)?.length || 0;
    const fieldBoost =
      rule.type === "central_model" && fields.technicalSupport.length + fields.teachingResources.length >= 6
        ? 2
        : rule.type === "closed_loop" && fields.evaluationMechanism.some((item) => /反馈|闭环|诊断|监测/.test(item))
          ? 2
          : 0;
    return { type: rule.type, score: matches + fieldBoost };
  });
  scores.sort((a, b) => b.score - a.score);
  return scores[0]?.score ? scores[0].type : "central_model";
}

function createLayoutIntent(
  recommendedType: TeachingArchitectureDiagramType,
  requestedType: TeachingArchitectureDiagramType,
  text: string,
  fields: TeachingArchitectureBlueprintFields
) {
  const concreteType = recommendedType === "auto" ? "central_model" : recommendedType;
  const matchedRule = DIAGRAM_RULES.find((rule) => rule.type === concreteType);
  const reason =
    requestedType === "auto"
      ? matchedRule?.reason || "材料强调核心主题与多模块支撑，适合用中心模型表达。"
      : "用户已指定图型，按指定结构组织架构图。";

  return {
    recommendedType,
    reason,
    mainStructure: getMainStructure(concreteType),
    flowDirection: getFlowDirection(concreteType),
    emphasisNodes: pickEmphasisNodes(fields, text)
  };
}

function pickEmphasisNodes(fields: TeachingArchitectureBlueprintFields, text: string) {
  const core = [
    fields.constructionGoals[0],
    fields.implementationPath[0],
    fields.evaluationMechanism[0],
    fields.outcomes[0]
  ].filter(Boolean);
  if (/AI|智能|数字化|数据/.test(text) && fields.technicalSupport[0]) core.splice(2, 0, fields.technicalSupport[0]);
  return unique(core).slice(0, 5);
}

function getMainStructure(diagramType: Exclude<TeachingArchitectureDiagramType, "auto">) {
  const map: Record<Exclude<TeachingArchitectureDiagramType, "auto">, string> = {
    central_model: "中央核心主题，周围组织背景、目标、资源、路径、评价、成果与推广模块。",
    three_layer: "上层目标与背景，中层实施路径和教学模式，下层资源、技术与评价支撑。",
    left_center_right_flow: "左侧输入与问题，中部路径与模式，右侧成果输出与示范推广。",
    closed_loop: "围绕核心主题形成诊断、实施、评价、反馈、改进的环形闭环。",
    tree_module: "核心主题向下分解为资源、模式、技术、评价、成果等模块体系。"
  };
  return map[diagramType];
}

function getFlowDirection(diagramType: Exclude<TeachingArchitectureDiagramType, "auto">) {
  const map: Record<Exclude<TeachingArchitectureDiagramType, "auto">, string> = {
    central_model: "中心向外辐射，多模块支撑核心目标，评价反馈回流。",
    three_layer: "自上而下分层推进，下层支撑中层，中层服务上层目标。",
    left_center_right_flow: "从左到右递进，评价反馈回到中部实施路径。",
    closed_loop: "顺时针闭环推进，评价反馈驱动持续改进。",
    tree_module: "自上而下展开模块，成果节点反向支撑推广。"
  };
  return map[diagramType];
}

function createAcademicFigureTitle(theme: string, text: string) {
  const normalized = stripTitleSuffix(normalizeThemeCandidate(theme));
  const sourceTitle = pickExplicitSourceTitle(text);
  const base = sourceTitle || normalized;
  const compact = compressTitleBase(base);
  if (!compact || compact === "待完善") return "教学改革实施路径图";
  if (TITLE_SUFFIXES.some((suffix) => base.endsWith(suffix) || compact.endsWith(suffix))) return compact;
  if (/(实施路径|推进路径)$/.test(compact)) return `${compact}图`;
  if (/(运行机制|提升机制)$/.test(compact)) return `${compact}图`;
  if (/(教学模式|改革模式)$/.test(compact)) return `${compact}图`;
  if (/(框架|体系)$/.test(compact)) return `${compact}图`;
  if (/路径|流程|闭环|实施/.test(text)) return `${compact}实施路径图`;
  if (/机制|协同|反馈|评价/.test(text)) return `${compact}机制图`;
  if (/模式|课堂|教学法/.test(text)) return `${compact}模式图`;
  if (/体系|模块|结构|框架/.test(text)) return `${compact}框架图`;
  return `${compact}结构图`;
}

function stripTitleSuffix(value: string) {
  let next = value
    .replace(/(架构材料架构图|中文教学改革成果架构图|教学模式结构图|架构图)+/g, "")
    .trim();
  for (const suffix of TITLE_SUFFIXES) {
    if (next.endsWith(suffix)) next = next.slice(0, -suffix.length);
  }
  return next.replace(/(图)+$/g, "").trim();
}

function compressTitleBase(value: string) {
  const normalized = stripTitleSuffix(value)
    .replace(/(研究|改革|材料|方案|设计|建设|应用)+$/g, "")
    .trim();
  const separators = /[、，,：:；;\s]+/;
  const parts = normalized
    .split(separators)
    .map((part) => stripTitleSuffix(part))
    .filter((part) => isChineseThemeCandidate(part));
  const preferred = parts.find((part) => part.length >= 8 && part.length <= 16) || parts[0] || normalized;
  if (preferred.length <= 16) return preferred;

  const phraseMatch = preferred.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,12}(课程群|智慧课堂|城市韧性治理|协同育人|风险预警|评价反馈|持续改进|项目化教学|项目式教学|创新创业|质量提升|智能制造|产教融合|教学改革|治理机制|预警机制|闭环机制|教学模式)/);
  if (phraseMatch?.[0] && phraseMatch[0].length <= 16) return phraseMatch[0];

  return preferred.slice(0, 16).replace(/(教|改|研|机|模|路|结|结?构|框)$/g, "");
}

function pickExplicitSourceTitle(text: string) {
  const patterns = [
    /(?:项目名称|成果名称|课题名称|模式名称)[：:\s]*([^\n。；;]{4,40})/,
    /^#{1,3}\s*([^\n]{4,40})/m,
    /《([^》]{4,40})》/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const candidate = normalizeThemeCandidate(match[1]);
      if (isChineseThemeCandidate(candidate)) return candidate;
    }
  }
  return "";
}

function buildImageNodes(fields: TeachingArchitectureBlueprintFields, theme: string): TeachingArchitectureImageNode[] {
  const groups: Array<{
    category: TeachingArchitectureImageNode["category"];
    title: string;
    evidence: string[];
  }> = [
    {
      category: "combined",
      title: "问题导向",
      evidence: [...fields.teachingReformBackground, ...fields.coreProblems]
    },
    {
      category: "constructionGoals",
      title: "目标引领",
      evidence: fields.constructionGoals
    },
    {
      category: "teachingResources",
      title: "资源支撑",
      evidence: fields.teachingResources
    },
    {
      category: "implementationPath",
      title: "路径实施",
      evidence: fields.implementationPath
    },
    {
      category: "teachingMode",
      title: "模式创新",
      evidence: fields.teachingMode
    },
    {
      category: "combined",
      title: "技术评价",
      evidence: [...fields.technicalSupport, ...fields.evaluationMechanism]
    },
    {
      category: "combined",
      title: "成果推广",
      evidence: [...fields.outcomes, ...fields.demonstrationPromotion]
    }
  ];

  const nodes = groups
    .map((group) => createImageNode(group.title, group.category, group.evidence, theme))
    .filter((node) => node.evidence.length || node.shortTags.length);

  return enforceImageNodeCount(uniqueImageNodes(mergeRepeatedSemanticNodes(nodes)));
}

function createImageNode(
  title: string,
  category: TeachingArchitectureImageNode["category"],
  evidence: string[],
  theme: string
): TeachingArchitectureImageNode {
  const normalizedEvidence = unique(
    evidence
      .flatMap((item) => extractShortPhrases(item))
      .map((item) => fitNodeText(item, MAX_NODE_LABEL_LENGTH))
      .filter((item) => item && !isGenericOrNoisyLabel(item) && !isThemeLikeLabel(item, theme))
  ).slice(0, 3);
  const preferredTitle = selectNodeTitle(title, normalizedEvidence);
  const shortTags = unique(
    normalizedEvidence
      .filter((item) => item !== preferredTitle)
      .map((item) => fitShortTag(item))
      .filter((item) => !isGenericOrNoisyLabel(item))
  ).slice(0, 2);
  return {
    title: fitNodeText(preferredTitle, MAX_NODE_LABEL_LENGTH),
    shortTags,
    category,
    evidence: normalizedEvidence.slice(0, 2)
  };
}

function selectNodeTitle(fallbackTitle: string, evidence: string[]) {
  const academic = evidence.find((item) => ACADEMIC_NODE_LABELS.includes(item));
  if (academic) return academic;
  const strong = evidence.find((item) => item.length >= 4 && item.length <= MAX_NODE_LABEL_LENGTH && !isGenericOrNoisyLabel(item));
  return normalizeNodeTitle(strong || fallbackTitle);
}

function uniqueImageNodes(nodes: TeachingArchitectureImageNode[]) {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    const key = normalizeDedupeKey(node.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeRepeatedSemanticNodes(nodes: TeachingArchitectureImageNode[]) {
  const merged: TeachingArchitectureImageNode[] = [];
  for (const node of nodes) {
    const key = normalizeDedupeKey(node.title);
    const existing = merged.find((item) => normalizeDedupeKey(item.title) === key || haveSharedCoreTerm(item.title, node.title));
    if (existing) {
      existing.shortTags = unique([...existing.shortTags, ...node.shortTags]).slice(0, 2);
      existing.evidence = unique([...existing.evidence, ...node.evidence]).slice(0, 2);
    } else {
      merged.push({
        ...node,
        title: normalizeNodeTitle(node.title),
        shortTags: unique(node.shortTags.map(fitShortTag)).slice(0, 2)
      });
    }
  }
  return reduceRepeatedTerms(merged);
}

function enforceImageNodeCount(nodes: TeachingArchitectureImageNode[]) {
  const defaults: TeachingArchitectureImageNode[] = [
    { title: "问题导向", shortTags: ["需求牵引"], category: "combined", evidence: ["问题导向"] },
    { title: "目标引领", shortTags: ["能力提升"], category: "constructionGoals", evidence: ["目标引领"] },
    { title: "资源支撑", shortTags: ["课程资源"], category: "teachingResources", evidence: ["资源支撑"] },
    { title: "路径实施", shortTags: ["分段推进"], category: "implementationPath", evidence: ["路径实施"] },
    { title: "评价改进", shortTags: ["反馈闭环"], category: "evaluationMechanism", evidence: ["评价改进"] },
    { title: "成果推广", shortTags: ["示范应用"], category: "combined", evidence: ["成果推广"] }
  ];
  const result = [...nodes];
  for (const item of defaults) {
    if (result.length >= MIN_IMAGE_NODES) break;
    if (!result.some((node) => normalizeDedupeKey(node.title) === normalizeDedupeKey(item.title))) result.push(item);
  }
  const complexEnough = result.filter((node) => node.evidence.length || node.shortTags.length).length > DEFAULT_IMAGE_NODES;
  const limit = complexEnough ? MAX_IMAGE_NODES : DEFAULT_IMAGE_NODES;
  return reduceRepeatedTerms(result).slice(0, limit);
}

function createVisualPlan(recommendedType: TeachingArchitectureDiagramType): TeachingArchitectureVisualPlan {
  const concreteType = recommendedType === "auto" ? "central_model" : recommendedType;
  const portrait = concreteType === "central_model" || concreteType === "closed_loop";
  const tree = concreteType === "tree_module";
  return {
    canvasRatio: portrait ? "3:4" : tree ? "4:3" : "16:9",
    aspectRatio: portrait ? "3:4" : tree ? "4:3" : "16:9",
    size: portrait ? "1024x1536" : tree ? "1536x1024" : "1792x1024",
    orientation: portrait ? "portrait" : "landscape",
    background: "white",
    primaryColor: "deep_blue",
    accentColor: "orange_or_teal",
    stylePreset: TEACHING_ARCHITECTURE_STYLE_PRESET,
    density: "academic_readable"
  };
}

function normalizeDedupeKey(value: string) {
  return value
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "")
    .replace(/(教学|课程|资源|建设|改革|模式|机制|体系|平台|路径|成果|评价)/g, "")
    .trim();
}

function isGenericOrNoisyLabel(value: string) {
  if (!value || value.length < 2) return true;
  if (/^(教学改革|课堂教学|智慧课堂|建设课程|课程资源|核心问题|建设目标|实施路径|教学模式|成果名称|项目名称|课题名称|模式名称|背景|问题|目标|路径|资源)$/.test(value)) return true;
  if (/(教学改革模式|改革模式|教学实施路径|实施路径)$/.test(value) && value.length > 6) return true;
  if (/^\d+$/.test(value)) return true;
  if (/(不足不足|资源资源|课堂课堂|改革改革|架构架构)/.test(value)) return true;
  return false;
}

function isTitleNoiseSegment(value: string) {
  return /^(项目名称|成果名称|课题名称|模式名称|项目主题|主题|题目)$/.test(value.trim());
}

function isThemeLikeLabel(label: string, theme: string) {
  const labelKey = normalizeDedupeKey(label);
  const themeKey = normalizeDedupeKey(theme);
  if (!labelKey || !themeKey) return false;
  if (labelKey.length < 4) return false;
  return themeKey.includes(labelKey) || labelKey.includes(themeKey.slice(0, Math.min(themeKey.length, 8)));
}
