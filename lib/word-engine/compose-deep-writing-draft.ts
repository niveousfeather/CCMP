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
};

const titlesByKind: Record<DeepWritingTaskMemory["documentKind"], string[]> = {
  report: ["摘要", "背景与问题", "资料分析", "主要发现", "建议", "结论"],
  plan: ["项目背景", "目标定位", "实施路径", "时间安排", "风险与应对", "预期成果"],
  research: ["研究背景", "资料来源与范围", "现状分析", "趋势判断", "关键问题", "建议与结论"],
  manual: ["使用背景", "适用对象", "操作流程", "注意事项", "常见问题", "后续维护"],
  summary: ["总体概述", "关键要点", "分类整理", "后续建议"],
  general: ["文档概述", "背景与目标", "主要内容", "使用建议"]
};

const forbiddenDraftPattern = /我将思考|我的推理|作为\s*AI|mock|placeholder|TODO|internal|provider|chain-of-thought/gi;

export function composeDeepWritingDraft(input: DeepWritingDraftInput): DeepWritingDraft {
  const source = cleanDraftText(input.sourceText || input.memory.sourceSummary || input.conversationSummary || "");
  const facts = extractSourceFacts(source);
  const titles = titlesByKind[input.memory.documentKind] || titlesByKind.general;
  const sections = titles.map((title, index) => {
    const id = input.memory.outline[index]?.id || `section-${index + 1}`;
    return {
      id,
      title,
      paragraphs: paragraphsForSection({
        title,
        topic: input.memory.topic,
        documentKind: input.memory.documentKind,
        facts,
        hasSource: Boolean(source)
      }),
      keyPoints: facts.slice(0, 4)
    };
  });

  return {
    title: cleanDraftText(input.memory.topic || "深度写作文档"),
    sections
  };
}

function paragraphsForSection({
  title,
  topic,
  documentKind,
  facts,
  hasSource
}: {
  title: string;
  topic: string;
  documentKind: DeepWritingTaskMemory["documentKind"];
  facts: string[];
  hasSource: boolean;
}) {
  const factSentence = facts.length
    ? `当前资料中的关键信息包括：${facts.slice(0, 6).join("；")}。`
    : `本节围绕“${topic}”展开，采用稳健、正式的写作口径，先搭建可继续扩展的章节草稿。`;
  const evidenceSentence = hasSource
    ? `这些信息会作为本章节的直接依据，优先转化为背景、问题、发现和建议，而不是停留在泛泛表述。`
    : `由于当前资料有限，本节先形成主题化草稿，后续补充资料后可继续扩展证据和案例。`;

  if (/摘要|总体概述|文档概述/.test(title)) {
    return cleanParagraphs([
      `${topic}需要先明确写作对象、资料范围和预期用途。${factSentence}`,
      `${evidenceSentence}本节先压缩主要背景和结论方向，方便后续章节逐步展开。`
    ]);
  }
  if (/背景|问题|来源|范围|使用背景|项目背景/.test(title)) {
    return cleanParagraphs([
      `${topic}的背景可以从资料条件、使用场景和目标人群三个方面展开。${factSentence}`,
      `${evidenceSentence}在后续写作中，背景信息会服务于目标定义和行动建议。`
    ]);
  }
  if (/分析|现状|发现|关键|分类|核心|主要内容/.test(title)) {
    return cleanParagraphs([
      `围绕${topic}，资料显示出若干可整理的重点线索。${factSentence}`,
      `本节把零散材料整理为正式表述，突出事实、关系和可复用结论，避免直接堆砌原始文本。`
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

function extractSourceFacts(sourceText: string) {
  const facts = new Set<string>();
  const normalized = cleanDraftText(sourceText);
  const names = normalized.match(/[\u4e00-\u9fa5]{2,4}(?=[,，、\s]*(?:\d{1,3}|成绩|分数))/g) || [];
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
  return paragraphs
    .map((paragraph) => cleanDraftText(paragraph))
    .filter((paragraph) => paragraph.length > 0);
}

function cleanDraftText(text: string) {
  return String(text || "")
    .replace(forbiddenDraftPattern, "")
    .replace(/\s+/g, " ")
    .trim();
}
