import type { DeepWritingTaskMemory } from "@/lib/agent/runtime/deep-writing-memory";
import { extractDeepWritingTopicProfile } from "./topic-profile";

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
    if (/写作目标/.test(title)) {
      return cleanParagraphs([
        `${topic}需要先明确使用对象、主要场景、交付口径和可执行范围，正文应直接回应用户当前请求。`,
        "本稿采用轻量写作流程，先形成可发布或可继续扩写的正文，再进入 Word 排版与渲染阶段。"
      ]);
    }
    if (/正文草稿/.test(title)) {
      return cleanParagraphs([
        `${topic}的正文应说明背景、目标、关键安排、执行步骤和反馈方式，让读者能够据此开展后续工作。`,
        "内容表达保持正式、简明和可落地，避免只有标题框架，也避免用模板句替代具体事项。"
      ]);
    }
    if (/发布与使用建议/.test(title)) {
      return cleanParagraphs([
        `建议在发布${topic}前核对对象、时间、责任人、资源条件和验收方式，确保内容能被直接使用。`,
        "后续如需扩展为完整方案，可在此草稿基础上补充预算、排期、风险应对和评价指标。"
      ]);
    }
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

  if (!hasSource && !facts.length) {
    return noSourceParagraphsForSection(title, topic, index);
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

function noSourceParagraphsForSection(title: string, topic: string, index: number) {
  if (/研究背景|摘要|背景|总体|概述/.test(title)) {
    return cleanParagraphs([
      `${topic}需要先交代研究对象、应用场景和写作目的，明确本文档基于用户需求生成初稿。`,
      "本节重点建立阅读入口，说明后续章节将围绕现状、问题、趋势和建议展开。"
    ]);
  }
  if (/资料来源|范围|方法/.test(title)) {
    return cleanParagraphs([
      "当前未配置外部搜索来源，也没有上传资料，因此正文不伪造引用或外部链接。",
      `${topic}后续如补充资料，可继续把真实来源转化为证据、案例和数据说明。`
    ]);
  }
  if (/现状|分析|主要发现/.test(title)) {
    return cleanParagraphs([
      `${topic}的现状分析可从教学需求、工具使用、教师能力、学生体验和管理支持五个维度展开。`,
      "本节先形成分析框架，后续可用问卷、访谈、课堂记录或平台数据补充具体证据。"
    ]);
  }
  if (/趋势|判断/.test(title)) {
    return cleanParagraphs([
      `${topic}的趋势判断应关注智能备课、个性化学习、过程评价和教师专业发展之间的联动。`,
      "相关判断保持审慎表达，只给出可验证的方向，不把未经确认的信息写成外部事实。"
    ]);
  }
  if (/关键问题/.test(title)) {
    return cleanParagraphs([
      "关键问题可以围绕目标不清、资源差异、工具培训不足、课堂融合浅层化和评价标准缺失展开。",
      `${topic}需要把这些问题转化为可讨论、可分工、可跟进的改进任务。`
    ]);
  }
  if (/建议|结论|后续/.test(title)) {
    return cleanParagraphs([
      "建议部分应优先给出行动清单，包括试点范围、培训安排、资源建设、过程评价和复盘机制。",
      `${topic}的结论保持可执行和可扩展，为后续补充真实资料、形成正式版本留下空间。`
    ]);
  }
  return cleanParagraphs([
    `${title}作为第 ${index + 1} 个章节，应围绕${topic}补充与章节标题直接相关的正文。`,
    "当前先生成中性草稿，不使用任何具体学科或旧主题作为默认正文。"
  ]);
}

function lessonPlanParagraphs(title: string, topic: string) {
  const profile = extractDeepWritingTopicProfile(topic);
  const subject = profile.subject || "本课程";
  const grade = profile.grade || "学生";
  if (profile.domain === "primary_language") return primaryLanguageLessonParagraphs(title, profile.topic, grade);
  if (profile.domain === "primary_math") return primaryMathLessonParagraphs(title, profile.topic, grade);
  if (profile.domain === "chemistry_course") return chemistryLessonParagraphs(title, profile.topic, grade);
  if (profile.domain === "animation_course") return animationLessonParagraphs(title, profile.topic);
  return neutralLessonParagraphs(title, profile.topic, subject, grade);
}

function primaryLanguageLessonParagraphs(title: string, topic: string, grade: string) {
  if (/课程基本信息/.test(title)) {
    return cleanParagraphs([
      `${topic}教案面向${grade}学生，课程以课文学习为主线，围绕识字写字、朗读训练、阅读理解、语言积累和表达练习组织课堂。`,
      "课程可按照导入激趣、初读课文、随文识字、精读品悟、板书梳理、课堂练习和作业延伸等环节展开，帮助学生形成稳定的语文学习方法。"
    ]);
  }
  if (/学情分析/.test(title)) {
    return cleanParagraphs([
      `${grade}学生已经具备一定拼音、识字和朗读基础，但对课文关键词句、段落层次和情感表达的把握仍需要教师引导。`,
      "教学设计应兼顾基础识字、朗读兴趣和阅读方法，通过问题引导、同伴交流和板书提示，帮助学生把零散理解转化为清晰表达。"
    ]);
  }
  if (/教学目标/.test(title)) {
    return cleanParagraphs([
      "知识目标包括认识本课生字词，理解课文主要内容，积累重点词语和典型句式，能够借助上下文理解关键词句。",
      "能力目标包括正确、流利、有感情地朗读课文，提取段落要点，围绕问题进行阅读思考；素养目标包括培养阅读兴趣、语言表达习惯和认真完成作业的意识。"
    ]);
  }
  if (/重点|难点/.test(title)) {
    return cleanParagraphs([
      "教学重点是识字写字、朗读课文、理解重点词句和概括课文主要内容，要求学生在读中理解、在说中表达、在练中巩固。",
      "教学难点是把握课文情感和段落之间的关系。教师应通过范读、圈画批注、板书结构和分层提问降低阅读理解难度。"
    ]);
  }
  if (/教学过程/.test(title)) {
    return cleanParagraphs([
      "教学过程从生活情境或课题图片导入，先激发学生阅读兴趣，再组织初读课文，读准字音、读通句子，整体感知课文内容。",
      "课堂主体采用教师范读、学生朗读、随文识字、重点句品读、小组交流和板书总结。授课内容应覆盖生字词、课文朗读、段落理解、语言训练、课堂练习和作业布置。"
    ]);
  }
  if (/课堂练习/.test(title)) {
    return cleanParagraphs([
      "课堂练习包括认读生字词、分段朗读课文、圈画关键词句、回答阅读理解问题，并用自己的话概括课文主要内容。",
      "练习过程采用个人思考、同伴交流和全班反馈结合的方式，帮助学生把朗读感受、词句理解和语言表达连起来。"
    ]);
  }
  if (/作业设计/.test(title)) {
    return cleanParagraphs([
      "作业设计包括朗读课文、抄写并听写生字词、积累课文中的优美句子，以及完成一项与课文主题相关的阅读或表达练习。",
      "分层作业可设置基础识字、阅读理解和拓展表达三个层次，既巩固课堂学习，也照顾不同学生的语文基础。"
    ]);
  }
  if (/板书设计/.test(title)) {
    return cleanParagraphs([
      "板书设计以课文题目为中心，左侧呈现生字词和重点词语，中间梳理段落层次，右侧归纳阅读方法和情感理解。",
      "板书应帮助学生看见课文结构、关键词句和表达重点，便于课堂总结时回顾朗读、阅读理解和语言积累。"
    ]);
  }
  if (/教学反思/.test(title)) {
    return cleanParagraphs([
      "教学反思重点观察学生识字掌握、朗读流利度、阅读理解和课堂表达情况，判断哪些环节真正促进了课文理解。",
      "如果学生对重点词句理解不充分，后续可增加范读、情境朗读和板书支架；如果作业完成质量差异较大，可继续优化分层作业。"
    ]);
  }
  if (/考核评价/.test(title)) {
    return cleanParagraphs([
      "考核评价采用课堂观察、朗读展示、识字检测、阅读问答和作业检查相结合的方式，重点观察学生是否能读准、读通、读懂课文。",
      "评价指标包括识字掌握、朗读流利度、课文理解、表达完整性、板书要点迁移和作业质量，鼓励学生在同伴互评中改进朗读和表达。"
    ]);
  }
  return cleanParagraphs([
    `${title}围绕${topic}教案展开，服务于识字、朗读、阅读、表达、板书和作业等完整语文课堂实施。`,
    "本节保持小学语文教学语境，避免使用泛化文档模板替代真实教案正文。"
  ]);
}

function primaryMathLessonParagraphs(title: string, topic: string, grade: string) {
  if (/课程基本信息/.test(title)) {
    return cleanParagraphs([
      `${topic}教案面向${grade}学生，课程围绕概念理解、例题讲解、分层练习、计算推理和课堂检测组织教学。`,
      "教学资源包括情境问题、直观教具或课件、典型例题、练习单和课堂检测题，帮助学生经历从理解到应用的完整过程。"
    ]);
  }
  if (/学情分析/.test(title)) {
    return cleanParagraphs([
      `${grade}学生具备一定计算基础，但在抽象概念理解、数量关系表达和推理说明方面还需要具体情境与操作支撑。`,
      "教学中应通过生活情境、图示表达、例题拆解和同伴交流，帮助学生把直观经验转化为数学语言。"
    ]);
  }
  if (/教学目标/.test(title)) {
    return cleanParagraphs([
      "知识目标是理解本课核心概念和计算方法，能说明例题中的数量关系；能力目标是能够独立完成基础计算、变式练习和简单推理。",
      "素养目标是形成认真审题、规范书写、主动检查和用数学语言表达思路的习惯。"
    ]);
  }
  if (/重点|难点/.test(title)) {
    return cleanParagraphs([
      "教学重点是核心概念理解、例题讲解和基础计算方法的掌握，要求学生能把题目信息转化为算式或图示。",
      "教学难点是从具体情境中抽象数量关系，并能说明计算或推理过程。教师应通过分层练习和课堂检测及时反馈。"
    ]);
  }
  if (/教学过程/.test(title)) {
    return cleanParagraphs([
      "教学过程从生活情境导入，提出可计算、可比较的问题，引导学生观察信息、提出猜想并尝试列式。",
      "主体环节包括概念理解、例题讲解、方法归纳、分层练习、同伴讲解和课堂检测，确保学生经历理解、练习、应用和反馈。"
    ]);
  }
  if (/课堂练习/.test(title)) {
    return cleanParagraphs([
      "课堂练习分为基础题、变式题和提高题。基础题巩固计算方法，变式题训练审题和数量关系分析，提高题鼓励学生解释推理过程。",
      "练习后安排学生展示不同解法，教师围绕计算准确性、推理清晰度和书写规范进行点评。"
    ]);
  }
  if (/作业设计/.test(title)) {
    return cleanParagraphs([
      "作业包括基础计算、例题同类练习、一道生活应用题和一道思维拓展题，要求学生写清关键步骤。",
      "分层作业可为基础薄弱学生保留必要计算训练，为能力较强学生增加开放性推理或课堂活动延伸。"
    ]);
  }
  if (/板书设计/.test(title)) {
    return cleanParagraphs([
      "板书以核心概念为中心，呈现情境信息、例题算式、关键步骤、易错提醒和方法小结。",
      "板书应突出数量关系和推理路径，让学生能根据板书复述解题思路。"
    ]);
  }
  if (/教学反思/.test(title)) {
    return cleanParagraphs([
      "教学反思关注学生是否真正理解概念、能否独立完成例题迁移、计算错误集中在哪些环节。",
      "后续可根据课堂检测结果调整练习层次，增加口头表达、图示推理和错题再练。"
    ]);
  }
  return cleanParagraphs([`${title}围绕${topic}展开，服务于概念理解、例题讲解、练习巩固和课堂检测。`]);
}

function chemistryLessonParagraphs(title: string, topic: string, grade: string) {
  if (/课程基本信息/.test(title)) {
    return cleanParagraphs([
      `${topic}教案面向${grade}学生，课程围绕实验观察、反应现象、实验安全、概念建构和化学方程式组织教学。`,
      "教学资源包括实验器材、安全提示卡、现象记录表、微观示意图和课堂检测题。"
    ]);
  }
  if (/学情分析/.test(title)) {
    return cleanParagraphs([
      "学生对实验现象通常兴趣较高，但容易停留在表面观察，对现象背后的概念和化学方程式理解不足。",
      "教学应把安全规范、实验观察、证据记录和概念建构连起来，帮助学生形成基于证据解释反应的意识。"
    ]);
  }
  if (/教学目标/.test(title)) {
    return cleanParagraphs([
      "知识目标是理解本课相关概念、反应条件和化学方程式含义；能力目标是能够规范观察实验现象并用化学语言解释。",
      "素养目标是形成实验安全意识、证据意识和严谨记录习惯。"
    ]);
  }
  if (/重点|难点/.test(title)) {
    return cleanParagraphs([
      "教学重点是实验观察、反应现象描述、核心概念理解和化学方程式书写。",
      "教学难点是把宏观现象、微观解释和符号表达联系起来，避免只记结论不理解证据。"
    ]);
  }
  if (/教学过程/.test(title)) {
    return cleanParagraphs([
      "教学过程从问题情境导入，明确实验安全要求，再组织学生观察实验、记录反应现象、交流证据并建构概念。",
      "主体环节包括实验演示或分组观察、现象分析、化学方程式讲解、课堂练习和检测反馈。"
    ]);
  }
  if (/课堂练习/.test(title)) {
    return cleanParagraphs([
      "课堂练习包括实验现象判断、概念辨析、化学方程式配平或书写，以及安全操作情境判断。",
      "练习后通过同伴互评和教师讲评，纠正常见的现象描述不准确、符号表达不规范等问题。"
    ]);
  }
  if (/作业设计/.test(title)) {
    return cleanParagraphs([
      "作业包括整理实验观察记录、完成化学方程式练习、解释一个生活中的相关化学现象。",
      "拓展作业可要求学生画出宏观现象、微观粒子和符号表达之间的关系图。"
    ]);
  }
  if (/板书设计/.test(title)) {
    return cleanParagraphs([
      "板书以核心反应或概念为中心，依次呈现实验安全、反应现象、概念解释、化学方程式和易错提醒。",
      "板书应帮助学生把观察证据和符号表达对应起来。"
    ]);
  }
  if (/教学反思/.test(title)) {
    return cleanParagraphs([
      "教学反思关注学生实验观察是否准确、安全规范是否到位、化学方程式书写是否规范。",
      "如果学生只记住现象而不能解释原因，后续应增加微观示意和证据推理训练。"
    ]);
  }
  return cleanParagraphs([`${title}围绕${topic}展开，服务于实验观察、概念建构和化学方程式表达。`]);
}

function animationLessonParagraphs(title: string, topic: string) {
  if (/课程基本信息/.test(title)) {
    return cleanParagraphs([
      `${topic}教案面向具备基础数字媒体认知的学习者，课程目标是帮助学生理解三维动画制作流程，并能完成基础建模、材质、灯光、动画和作品展示任务。`,
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
  return cleanParagraphs([`${title}围绕${topic}教案展开，服务于完整授课内容和课堂实施。`]);
}

function neutralLessonParagraphs(title: string, topic: string, subject: string, grade: string) {
  if (/课程基本信息/.test(title)) {
    return cleanParagraphs([
      `${topic}教案面向${grade}，围绕${subject}的课程目标、学习任务和课堂活动形成完整授课安排。`,
      "课程可按照导入、讲解、练习、交流、评价和作业延伸组织，确保目标、过程和评价保持一致。"
    ]);
  }
  if (/学情分析/.test(title)) {
    return cleanParagraphs([
      `学生对${subject}已有一定经验，但在知识迁移、方法运用和完整表达方面仍需要教师搭建支架。`,
      "教学设计应结合学生基础设置分层任务，通过示范、练习和反馈帮助学生逐步完成学习目标。"
    ]);
  }
  if (/教学目标/.test(title)) {
    return cleanParagraphs([
      `知识目标是理解${subject}的核心概念和课堂任务要求，能力目标是能够按照步骤完成学习活动并表达结果。`,
      "素养目标是形成主动学习、合作交流和及时反思的意识。"
    ]);
  }
  if (/重点|难点/.test(title)) {
    return cleanParagraphs([
      `教学重点是${subject}的核心知识、关键方法和课堂练习任务。`,
      "教学难点是学生将知识理解转化为独立完成任务的能力，教师应通过分步提示和即时反馈进行支持。"
    ]);
  }
  if (/教学过程/.test(title)) {
    return cleanParagraphs([
      "教学过程从情境导入开始，随后明确学习目标，组织新知讲解、课堂练习、小组交流和总结评价。",
      "授课内容应覆盖目标说明、重点讲解、过程练习、成果展示、课堂反馈和作业布置，保证课堂结构完整。"
    ]);
  }
  if (/实训任务/.test(title)) {
    return cleanParagraphs([
      "课堂任务要求学生围绕本课目标完成可展示的练习成果，并说明完成思路、遇到的问题和改进方法。",
      "任务评价关注完成度、规范性、思考过程和课堂参与表现。"
    ]);
  }
  if (/考核评价/.test(title)) {
    return cleanParagraphs([
      "考核评价采用过程观察、课堂练习、成果展示和作业检查相结合的方式。",
      "评价指标包括目标达成、方法运用、表达质量、合作表现和课后巩固情况。"
    ]);
  }
  return cleanParagraphs([`${title}围绕${topic}展开，服务于完整课堂实施。`]);
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
