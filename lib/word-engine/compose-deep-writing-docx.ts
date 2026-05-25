import type { DeepWritingTaskMemory } from "@/lib/agent/runtime/deep-writing-memory";
import { detectWordAttributes } from "./detect-word-attributes";
import { normalizeDocumentFileBase, normalizeDocumentTitle } from "./normalize-document-title";
import { extractDeepWritingTopicProfile } from "./topic-profile";
import type { WordContent, WordDocumentAttributes, WordRequest, WordSection, WordTable } from "./types";

const fallbackTitle = "深度写作报告";
const sourceHeading = "资料来源与参考摘要";
const forbiddenDocxTerms =
  /deepWritingTaskMemory|wordTaskMemory|taskId|conversationId|currentStage|searchPlan|adoptedSources|section_delta|source_plan|mock|placeholder|TODO|prompt|provider|chain-of-thought|internal JSON/gi;

export { extractDeepWritingTopicProfile };

export function composeDeepWritingDocxContent(memory: DeepWritingTaskMemory): WordContent {
  const title = normalizeDocumentTitle({
    title: memory.topic,
    instruction: memory.originalInstruction,
    documentKind: memory.documentKind,
    fallback: fallbackTitle
  });
  const sections = composeSections(memory);
  const sourceSection = composeSourceSection(memory);
  if (sourceSection) sections.push(sourceSection);

  return {
    title,
    subtitle: subtitleFor(memory),
    sections,
    tables: composeTables(memory, title),
    attributes: attributesFor(memory, title, sections)
  };
}

export function composeDeepWritingDocxRequest(memory: DeepWritingTaskMemory): WordRequest {
  const title = normalizeDocumentTitle({
    title: memory.topic,
    instruction: memory.originalInstruction,
    documentKind: memory.documentKind,
    fallback: fallbackTitle
  });
  return {
    taskId: memory.taskId,
    conversationId: memory.conversationId,
    title,
    instruction: cleanText(memory.originalInstruction || memory.topic, 500),
    contentOrigin: "generated_content",
    sourceText: cleanText([memory.sourceSummary, ...memory.adoptedSources.map((source) => source.summary)].join("\n"), 4000),
    sourceFiles: memory.sourceFileNames.map((fileName) => ({ fileName })),
    conversationSummary: cleanText(memory.sourceSummary, 1200),
    outputFileName: normalizeDocumentFileBase({
      title,
      instruction: memory.originalInstruction,
      documentKind: memory.documentKind,
      fallback: "Word 文档"
    }),
    stylePreset: "formal",
    language: "zh-CN"
  };
}

function normalizeSectionHeading(title: string, memory: DeepWritingTaskMemory) {
  if (memory.documentKind !== "lesson_plan") return cleanText(title, 80);
  if (/教学过程/.test(title)) return "教学过程设计";
  if (/课后作业|作业/.test(title)) return "作业设计";
  if (/板书/.test(title)) return "板书设计";
  if (/反思/.test(title)) return "教学反思";
  if (/重点|难点/.test(title)) return "教学重点与难点";
  if (/练习/.test(title)) return "课堂练习";
  return cleanText(title, 80);
}

function composeSections(memory: DeepWritingTaskMemory): WordSection[] {
  const completed = memory.outline.filter((section) => section.status === "completed" && section.draft?.trim());
  const sections = completed.map((section, index) => ({
    heading: normalizeSectionHeading(section.title, memory),
    paragraphs: paragraphsForFinalSection(section.title, section.draft || "", memory, index)
  }));

  if (!sections.length) {
    sections.push({
      heading: "文档概述",
      paragraphs: [cleanText(memory.sourceSummary || memory.originalInstruction || memory.topic, 600)]
    });
  }

  return sections.filter((section) => section.heading && section.paragraphs.length);
}

function paragraphsForFinalSection(title: string, draft: string, memory: DeepWritingTaskMemory, index: number) {
  const normalizedTitle = cleanText(title, 80);
  const draftParagraphs = splitDraft(draft).filter((paragraph) => !hasRepeatedEvidencePattern(paragraph));
  const selected = draftParagraphs.length
    ? draftParagraphs
    : [`${normalizedTitle}部分服务于${memory.topic}的整体表达，作为第 ${index + 1} 个章节保留当前写作阶段已完成的正文。`];
  return selected.map((paragraph) => cleanText(paragraph, 900)).filter(Boolean);
}

function composeSourceSection(memory: DeepWritingTaskMemory): WordSection | null {
  const sources = memory.adoptedSources.filter((source) => source.title && source.summary);
  if (!sources.length && !memory.sourceSummary) return null;

  const paragraphs = [
    memory.sourceSummary ? `已整理的资料摘要：${cleanText(memory.sourceSummary, 700)}` : "",
    ...sources.map((source, index) => {
      const url = source.url ? `链接：${source.url}` : "";
      return `${index + 1}. ${cleanText(source.title, 80)}：${cleanText(source.summary, 500)}${url ? `。${url}` : ""}`;
    })
  ].filter(Boolean);

  return {
    heading: sourceHeading,
    paragraphs
  };
}

function composeLessonInfoTable(memory: DeepWritingTaskMemory, title: string): WordTable {
  return {
    title: "教案基础信息表",
    headers: ["项目", "内容"],
    rows: [
      ["课程名称", title.replace(/教案$/, "") || memory.topic],
      ["授课对象", memory.grade || "按实际班级填写"],
      ["课时安排", /(\d+\s*(?:课时|学时))/.exec(memory.originalInstruction)?.[1] || "按教学安排"],
      ["教材 / 内容", memory.topic],
      ["教学资源", memory.sourceFileNames.length ? memory.sourceFileNames.join("、") : "课件、练习单、板书与课堂活动材料"]
    ]
  };
}

function composeLessonProcessTable(memory: DeepWritingTaskMemory): WordTable | null {
  const process = memory.outline.find((section) => /教学过程/.test(section.title) && section.draft?.trim());
  if (!process?.draft) return null;
  const profile = extractDeepWritingTopicProfile(`${memory.topic}\n${memory.originalInstruction}`);
  const isChemistry = profile.domain === "chemistry_course";
  const isMath = profile.domain === "primary_math";
  const isLanguage = profile.domain === "primary_language";
  const isAnimation = profile.domain === "animation_course";
  const rows = isChemistry
    ? [
        ["导入新课", "提出实验问题，强调实验安全和观察任务", "阅读安全提示，预测反应现象", "建立安全意识和证据意识", "5 分钟"],
        ["实验观察", "演示或组织实验，提示记录颜色、气体、沉淀等现象", "规范观察并填写现象记录表", "用真实现象支撑概念建构", "15 分钟"],
        ["概念建构", "引导分析反应现象，书写或解释化学方程式", "交流证据，修正符号表达", "连接宏观现象、微观解释和符号表达", "15 分钟"],
        ["检测反馈", "布置现象判断和方程式练习，讲评易错点", "完成练习并订正", "巩固安全、概念和表达规范", "5 分钟"]
      ]
    : isMath
      ? [
          ["情境导入", "呈现生活问题，引导学生提取数量关系", "观察信息，尝试列式表达", "激活经验并形成计算需求", "5 分钟"],
          ["例题讲解", "分步讲解例题，板书关键算式和推理过程", "跟随思考，说明解题依据", "建立概念理解和方法模型", "15 分钟"],
          ["分层练习", "组织基础题、变式题和提高题并巡视反馈", "独立计算，小组交流不同解法", "巩固计算、推理和表达", "15 分钟"],
          ["课堂检测", "快速检测并讲评典型错误", "完成检测，订正错题", "判断目标达成并安排后续巩固", "5 分钟"]
        ]
      : isLanguage
        ? [
            ["朗读导入", "范读课文，提出朗读和阅读问题", "听读、标注生字词和疑问", "进入文本情境并明确学习任务", "5 分钟"],
            ["随文识字", "指导认读生字词，联系语境理解词句", "朗读词句，交流理解", "夯实识字和词语积累", "12 分钟"],
            ["阅读理解", "组织分段朗读、圈画关键词句和问题讨论", "朗读课文，回答阅读问题", "提升文本理解和表达能力", "18 分钟"],
            ["总结练习", "归纳板书要点，布置朗读和表达练习", "复述内容，记录作业", "巩固语言积累和阅读方法", "5 分钟"]
          ]
        : isAnimation
          ? [
              ["项目导入", "展示案例，明确建模、材质、灯光和关键帧任务", "分析作品要求，确认交付物", "建立项目目标和评价标准", "5 分钟"],
              ["技能示范", "演示建模流程、材质设置和灯光布置", "跟随操作并记录关键参数", "掌握核心工具链", "15 分钟"],
              ["实训创作", "巡视指导关键帧调整、渲染输出和问题修正", "完成项目作品并保存过程文件", "形成可展示的动画成果", "15 分钟"],
              ["展示评价", "组织作品展示和同伴互评", "展示作品，说明修改思路", "促进作品表达和复盘改进", "5 分钟"]
            ]
          : [
              ["导入新课", "创设情境并提出学习问题", "观察材料，明确学习任务", "激活经验，形成学习期待", "5 分钟"],
              ["新知建构", "讲解重点内容并组织案例分析", "倾听、记录、回答问题", "建立概念和方法", "15 分钟"],
              ["练习反馈", "组织课堂练习并及时讲评", "完成练习，交流思路", "巩固方法并暴露问题", "15 分钟"],
              ["总结提升", "归纳本课重点并布置作业", "复述要点，记录作业", "形成结构化理解", "5 分钟"]
            ];
  return {
    title: "教学过程设计表",
    headers: ["教学环节", "教师活动", "学生活动", "设计意图", "时间安排"],
    rows
  };
}

function composeTables(memory: DeepWritingTaskMemory, title: string): WordTable[] {
  const lessonTables = memory.documentKind === "lesson_plan"
    ? [composeLessonInfoTable(memory, title), composeLessonProcessTable(memory)].filter((table): table is WordTable => Boolean(table))
    : [];
  const rows = memory.adoptedSources
    .filter((source) => source.title && source.summary)
    .slice(0, 8)
    .map((source) => [cleanText(source.title, 60), source.sourceType || "资料", cleanText(source.summary, 120)]);

  if (!rows.length) return lessonTables;
  return [
    ...lessonTables,
    {
      title: "资料采用概览",
      headers: ["资料", "类型", "摘要"],
      rows
    }
  ];
}

function attributesFor(memory: DeepWritingTaskMemory, title: string, sections: WordSection[]): WordDocumentAttributes {
  const base = detectWordAttributes(
    {
      title,
      instruction: memory.originalInstruction,
      sourceText: memory.sourceSummary
    },
    { sectionCount: sections.length }
  );
  const documentKind = mapDocumentKind(memory.documentKind);
  const formal = documentKind === "report" || documentKind === "plan" || documentKind === "training" || documentKind === "lesson_plan";
  return {
    ...base,
    documentKind,
    formality: formal ? "formal" : base.formality,
    needsToc: documentKind !== "summary" && (formal || sections.length >= 5 || base.needsToc),
    needsHeaderFooter: formal || base.needsHeaderFooter,
    needsTables: memory.adoptedSources.length > 0 || base.needsTables
  };
}

function mapDocumentKind(kind: DeepWritingTaskMemory["documentKind"]): WordDocumentAttributes["documentKind"] {
  if (kind === "lesson_plan") return "lesson_plan";
  if (kind === "research") return "report";
  if (kind === "manual") return "training";
  if (kind === "plan" || kind === "report" || kind === "summary") return kind;
  return "general";
}

function subtitleFor(memory: DeepWritingTaskMemory) {
  if (memory.documentKind === "lesson_plan") return "课程教案";
  if (memory.documentKind === "research") return "调研报告";
  if (memory.documentKind === "plan") return "完整方案";
  if (memory.documentKind === "manual") return "培训手册";
  return "深度写作文档";
}

function splitDraft(draft: string) {
  return draft
    .split(/\n{2,}|\r?\n/)
    .map((paragraph) => cleanText(paragraph, 900))
    .filter(Boolean);
}

function hasRepeatedEvidencePattern(value: string) {
  return /当前资料中的关键信息|这些信息会作为|作为本章节/.test(value);
}

function cleanText(value: string, maxLength: number) {
  return String(value || "")
    .replace(forbiddenDocxTerms, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
