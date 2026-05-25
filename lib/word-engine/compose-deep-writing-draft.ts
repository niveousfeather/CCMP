import type { DeepWritingTaskMemory } from "@/lib/agent/runtime/deep-writing-memory";

export type DeepWritingDraftSection = {
  id: string;
  title: string;
  paragraphs: string[];
  keyPoints?: string[];
};

export type DeepWritingDraft = {
  title: string;
  sections: DeepWritingDraftSection[];
};

export type DeepWritingDraftInput = {
  memory: DeepWritingTaskMemory;
  sourceText?: string;
  conversationSummary?: string;
  adoptedSources?: DeepWritingTaskMemory["adoptedSources"];
};

const forbiddenDraftPattern = /我的推理|作为\s*AI|mock|placeholder|TODO|internal|provider|chain-of-thought|prompt/gi;

export function composeDeepWritingDraft(input: DeepWritingDraftInput): DeepWritingDraft {
  const source = cleanDraftText(input.sourceText || input.memory.sourceSummary || input.conversationSummary || "");
  const adoptedSources = input.adoptedSources || input.memory.adoptedSources || [];
  const sourceEvidence = adoptedSources.map((item) => item.summary).filter(Boolean).join("\n");
  const facts = uniqueFacts([
    ...extractSourceFacts(source),
    ...extractSourceFacts(sourceEvidence),
    ...adoptedSources.map((item) => cleanDraftText(item.summary).slice(0, 100))
  ]);

  const sections = input.memory.outline.map((outlineSection, index) => ({
    id: outlineSection.id || `section-${index + 1}`,
    title: outlineSection.title,
    paragraphs: paragraphsForSection({
      title: outlineSection.title,
      topic: input.memory.topic,
      documentKind: input.memory.documentKind,
      writingMode: input.memory.writingMode || "deep",
      facts,
      hasSource: Boolean(source || sourceEvidence),
      index
    }),
    keyPoints: facts.slice(0, 4)
  }));

  return {
    title: cleanDraftText(input.memory.topic || "深度写作文档"),
    sections
  };
}

function paragraphsForSection({
  title,
  topic,
  documentKind,
  writingMode,
  facts,
  hasSource,
  index
}: {
  title: string;
  topic: string;
  documentKind: DeepWritingTaskMemory["documentKind"];
  writingMode: "deep" | "light";
  facts: string[];
  hasSource: boolean;
  index: number;
}) {
  if (writingMode === "light") {
    return cleanParagraphs([
      `${title}围绕“${topic}”展开，先形成可直接使用的正文草稿，再交给 Word 渲染阶段排版成文档。`,
      index === 1
        ? `${topic}需要表达清楚对象、时间、事项、执行要求和后续反馈方式，语气保持正式、简明、可发布。`
        : `本节保持轻量写作节奏，避免把写作请求直接交给 deterministic Word composer 生成薄模板。`
    ]);
  }

  if (documentKind === "lesson_plan") {
    return lessonPlanParagraphs(title, topic);
  }

  const factSentence = facts.length
    ? `当前资料中的关键信息包括：${facts.slice(0, 6).join("、")}。`
    : `本节围绕“${topic}”展开，采用稳健、正式的写作口径，先搭建可继续扩展的章节草稿。`;
  const evidenceSentence = hasSource
    ? "这些信息会作为本章节的直接依据，优先转化为背景、问题、发现和建议，而不是停留在泛泛表述。"
    : "由于当前资料有限，本节先形成主题化草稿，后续补充资料后可继续扩展证据和案例。";

  if (/摘要|总体|概述|背景/.test(title)) {
    return cleanParagraphs([
      `${topic}需要先明确写作对象、资料范围和预期用途。${factSentence}`,
      `${evidenceSentence}本节先压缩主要背景和结论方向，方便后续章节逐步展开。`
    ]);
  }
  if (/来源|范围|方法/.test(title)) {
    return cleanParagraphs([
      `${topic}的资料范围需要说明来源、可靠性和可使用边界。${factSentence}`,
      `${evidenceSentence}资料整理阶段只展示可用于正文的摘要，不暴露内部运行事件或记忆对象。`
    ]);
  }
  if (/分析|现状|发现|关键|分类|核心|主要内容/.test(title)) {
    return cleanParagraphs([
      `围绕${topic}，资料显示出若干可整理的重点线索。${factSentence}`,
      "本节把零散材料整理为正式表述，突出事实、关系和可复用结论，避免直接堆叠原始文本。"
    ]);
  }
  if (/路径|流程|时间|风险|建议|成果|维护|结论|后续/.test(title)) {
    return cleanParagraphs([
      `${topic}后续落地应围绕目标拆解、责任安排、风险控制和反馈机制推进。${factSentence}`,
      `${evidenceSentence}建议先形成可执行清单，再根据实际资料补充时间节点和评价标准。`
    ]);
  }
  return cleanParagraphs([
    `${title}部分需要服务于${topic}的整体表达。${factSentence}`,
    `${evidenceSentence}本节保持正式、清晰的写法，并为下一步生成 Word 文档保留结构。`
  ]);
}

function lessonPlanParagraphs(title: string, topic: string) {
  const subject = topic.replace(/帮我写一个|帮我写一份|生成一份|Word|word|教案|，.*$/g, "").trim() || "三维动画课程";
  if (/课程基本信息/.test(title)) {
    return cleanParagraphs([
      `${subject}教案面向具备基础数字媒体认知的学习者，课程目标是帮助学生理解三维动画制作流程，并能完成基础建模、材质、灯光、动画和作品展示任务。`,
      "课程可按照导入、示范、实训、点评和拓展五个环节组织，授课中需要同步说明软件操作规范、项目文件管理和作品评价要求。"
    ]);
  }
  if (/学情分析/.test(title)) {
    return cleanParagraphs([
      "学生通常对三维动画成片效果兴趣较高，但对建模规范、关键帧逻辑、镜头节奏和渲染参数缺少系统认识，需要通过案例拆解建立完整流程意识。",
      "教学设计应兼顾零基础学生的操作门槛和进阶学生的创作需求，通过分层任务让学生既能完成规定动作，也能在角色、场景或镜头表现上形成个性化作品。"
    ]);
  }
  if (/教学目标/.test(title)) {
    return cleanParagraphs([
      "知识目标包括理解三维动画项目流程、常用工具模块、关键帧动画原理、材质灯光基础和作品输出规范。",
      "能力目标包括能够完成简单场景建模、材质赋予、灯光布置、关键帧设置、动画预览和最终渲染；素养目标包括形成审美表达、团队协作和持续迭代意识。"
    ]);
  }
  if (/重点|难点/.test(title)) {
    return cleanParagraphs([
      "教学重点是三维动画制作流程、关键帧动画规律、镜头运动设计和项目化作品输出，要求学生把单点操作串联为完整作品。",
      "教学难点是空间结构理解、动画节奏控制、参数调试和问题排查。教师应通过示范文件、分步任务和即时反馈降低学习阻力。"
    ]);
  }
  if (/教学过程/.test(title)) {
    return cleanParagraphs([
      "教学过程从优秀三维动画片段导入，先引导学生观察角色、场景、镜头和运动节奏，再拆解软件工程文件，让学生理解成片背后的制作链路。",
      "课堂主体采用教师示范、学生跟做、分组实训和作品点评。授课内容应覆盖项目创建、基础建模、材质灯光、关键帧动画、预览修正、渲染输出和作品说明。"
    ]);
  }
  if (/实训任务/.test(title)) {
    return cleanParagraphs([
      "实训任务要求学生围绕一个明确主题完成 10 至 20 秒三维动画短片，至少包含一个主体模型、一个场景环境、基础材质灯光、两组关键帧运动和片尾展示画面。",
      "任务提交物包括工程文件、渲染视频、作品说明和自评记录。教师根据过程记录、技术完成度、创意表达和修改质量进行综合评价。"
    ]);
  }
  if (/考核评价/.test(title)) {
    return cleanParagraphs([
      "考核评价采用过程性评价和终结性评价结合的方式，重点观察学生是否掌握完整制作流程、是否能解释关键参数选择，并能根据反馈修正作品。",
      "评价指标包括主题表达、模型规范、动画流畅度、镜头与节奏、材质灯光效果、文件管理和课堂协作表现，鼓励学生在展示环节进行互评和反思。"
    ]);
  }
  return cleanParagraphs([
    `${title}围绕${subject}教案展开，服务于完整授课内容和课堂实施。`,
    "本节保持课程教学语境，避免使用泛化文档模板替代真实教案正文。"
  ]);
}

function extractSourceFacts(sourceText: string) {
  const facts = new Set<string>();
  const normalized = cleanDraftText(sourceText);
  const names = normalized.match(/[\u4e00-\u9fa5]{2,4}(?=[,，\s]*(?:\d{1,3}|成绩|分数))/g) || [];
  names.forEach((item) => facts.add(item));
  const scores = normalized.match(/\b\d{1,3}\b/g) || [];
  scores.slice(0, 8).forEach((item) => facts.add(item));
  normalized
    .split(/\r?\n|[。；;]/)
    .map((line) => line.replace(/^说明[:：]\s*/, "").trim())
    .filter((line) => line.length >= 4 && line.length <= 80)
    .slice(0, 6)
    .forEach((line) => facts.add(line));
  return Array.from(facts).slice(0, 10);
}

function cleanParagraphs(paragraphs: string[]) {
  return paragraphs.map((paragraph) => cleanDraftText(paragraph)).filter((paragraph) => paragraph.length > 0);
}

function cleanDraftText(text: string) {
  return String(text || "")
    .replace(forbiddenDraftPattern, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueFacts(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, 12);
}
