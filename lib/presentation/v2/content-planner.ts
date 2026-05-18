import type { ExtractedDocument, ExtractedDocumentFactKind, WebContextResult } from "@/lib/agent/types";
import type { PresentationDeck, PresentationMetric, PresentationSlide, PresentationStyle } from "@/lib/presentation/types";
import { createPresentationPlanV2 } from "@/lib/presentation/v2/planner";

const MIN_RICH_SLIDES = 8;
const MAX_RICH_SLIDES = 12;
const MIN_EXPLICIT_SLIDES = 5;

export type RichPresentationDeckInput = {
  title: string;
  request: string;
  deck: PresentationDeck;
  extractedDocuments?: ExtractedDocument[];
  webContext?: WebContextResult | null;
};

function cleanText(value: unknown, maxLength = 140) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeText(value: unknown) {
  return String(value || "").toLowerCase();
}

function weightedLength(value: string) {
  let total = 0;
  for (const char of value) total += /^[\x00-\x7F]$/.test(char) ? 0.55 : 1;
  return total;
}

function splitSentences(value: string) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((item) => cleanText(item, 180))
    .filter((item) => weightedLength(item) >= 12);
}

function compactFacts(values: string[], fallback: string[]) {
  const seen = new Set<string>();
  const facts: string[] = [];
  for (const value of [...values, ...fallback]) {
    const fact = cleanText(value, 150);
    const key = normalizeText(fact).replace(/[^\p{L}\p{N}]+/gu, "");
    if (!fact || seen.has(key)) continue;
    seen.add(key);
    facts.push(fact);
  }
  return facts;
}

function requestLooksTeaching(request: string, deck: PresentationDeck) {
  const text = normalizeText(`${request} ${deck.title} ${deck.subtitle || ""}`);
  return /教学|上课|课堂|课程|课件|教案|老师|学生|练习|lesson|teaching|classroom|course|homework/.test(text);
}

function requestLooksAcademic(request: string, deck: PresentationDeck) {
  const text = normalizeText(`${request} ${deck.title} ${deck.subtitle || ""}`);
  return /学术|论文|研究|实验|文献|答辩|paper|academic|research|thesis|defense|seminar/.test(text);
}

function inferStyle(input: RichPresentationDeckInput): PresentationStyle {
  if (input.deck.style) return input.deck.style;
  if (requestLooksAcademic(input.request, input.deck)) return "academic";
  if (requestLooksTeaching(input.request, input.deck)) return "teaching";
  return "general";
}

function getRequestedSlideCount(request: string) {
  const normalized = String(request || "");
  const digitMatch = normalized.match(/(\d{1,2})\s*[-_ ]?\s*(?:slide|slides|页|頁|张|張|p)/i);
  if (digitMatch) return Math.max(MIN_EXPLICIT_SLIDES, Math.min(MAX_RICH_SLIDES, Number(digitMatch[1])));

  const zhDigits: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
  };
  const zhMatch = normalized.match(/([一二两三四五六七八九十])\s*(?:页|頁|张|張)/);
  if (zhMatch?.[1]) return Math.max(MIN_EXPLICIT_SLIDES, Math.min(MAX_RICH_SLIDES, zhDigits[zhMatch[1]] || MIN_RICH_SLIDES));
  return null;
}

function extractDocumentFacts(documents: ExtractedDocument[] = []) {
  return documents.flatMap((document) => {
    const structured = (document.structuredFacts || []).map((fact) => fact.text);
    const textFacts = splitSentences(document.extractedMarkdown || document.content).slice(0, 12);
    return compactFacts(structured, textFacts).slice(0, 16);
  });
}

function extractWebFacts(webContext?: WebContextResult | null) {
  if (!webContext) return [];
  return compactFacts(
    [
      ...splitSentences(webContext.summary).slice(0, 5),
      ...webContext.items.flatMap((item) => splitSentences(`${item.title}. ${item.snippet}`).slice(0, 2))
    ],
    []
  ).slice(0, 12);
}

type AcademicFactBuckets = Record<
  "title" | "abstract" | "background" | "problem" | "method" | "architecture" | "experiment" | "comparison" | "limitation" | "conclusion" | "metric" | "figure",
  string[]
>;

const EMPTY_ACADEMIC_BUCKETS: AcademicFactBuckets = {
  title: [],
  abstract: [],
  background: [],
  problem: [],
  method: [],
  architecture: [],
  experiment: [],
  comparison: [],
  limitation: [],
  conclusion: [],
  metric: [],
  figure: []
};

function emptyAcademicBuckets(): AcademicFactBuckets {
  return Object.fromEntries(Object.entries(EMPTY_ACADEMIC_BUCKETS).map(([key]) => [key, []])) as unknown as AcademicFactBuckets;
}

function normalizeFactKind(kind: ExtractedDocumentFactKind): keyof AcademicFactBuckets | null {
  if (kind === "source") return null;
  return kind;
}

function classifyAcademicFactText(value: string): keyof AcademicFactBuckets {
  const text = normalizeText(value);
  if (/\b(abstract|summary)\b|摘要/.test(text)) return "abstract";
  if (/\b(background|introduction|related work)\b|背景|引言/.test(text)) return "background";
  if (/\b(problem|research question|challenge|motivation|objective)\b|问题|挑战|动机|目标/.test(text)) return "problem";
  if (/\b(method|pipeline|algorithm|training|stage|step|input|output)\b|方法|流程|算法|训练|阶段/.test(text)) return "method";
  if (/\b(architecture|module|block|layer|network|backbone|encoder|decoder|mixer)\b|架构|模块|网络|机制/.test(text)) return "architecture";
  if (/\b(result|experiment|benchmark|dataset|accuracy|top-1|throughput|latency|params|flops|\d+(?:\.\d+)?\s*%)\b|实验|结果|指标|数据/.test(text)) return "experiment";
  if (/\b(compare|comparison|baseline|ablation|versus|trade-off|outperform)\b|对比|基线|消融|优于/.test(text)) return "comparison";
  if (/\b(limit|limitation|failure|risk|future work|boundary)\b|局限|限制|风险|未来/.test(text)) return "limitation";
  if (/\b(conclusion|takeaway|therefore|show that|demonstrate)\b|结论|总结|表明/.test(text)) return "conclusion";
  if (/\b(figure|table|chart|diagram)\b|图|表/.test(text)) return "figure";
  return "background";
}

function buildAcademicFactBuckets(documents: ExtractedDocument[] = [], facts: string[] = []): AcademicFactBuckets {
  const buckets = emptyAcademicBuckets();
  for (const document of documents) {
    for (const fact of document.structuredFacts || []) {
      const kind = normalizeFactKind(fact.kind);
      if (!kind) continue;
      buckets[kind].push(fact.text);
    }
  }
  for (const fact of facts) {
    buckets[classifyAcademicFactText(fact)].push(fact);
  }
  for (const key of Object.keys(buckets) as Array<keyof AcademicFactBuckets>) {
    buckets[key] = compactFacts(buckets[key], []).slice(0, 8);
  }
  return buckets;
}

function bucketFacts(buckets: AcademicFactBuckets | undefined, keys: Array<keyof AcademicFactBuckets>, fallback: string[], count = 4) {
  const values = keys.flatMap((key) => buckets?.[key] || []);
  return compactFacts(values, fallback).slice(0, count).map((item) => normalizeBullet(item, 115));
}

function academicNotes(title: string, bullets: string[]) {
  const evidence = bullets.slice(0, 3).join("; ");
  return cleanText(`Explain "${title}" as a paper presentation page. Start from the claim, point to the source-backed evidence, then connect it to the research question. Key evidence: ${evidence}.`, 320);
}

function buildAcademicMetricsFromBuckets(facts: string[], buckets?: AcademicFactBuckets): PresentationMetric[] {
  const candidates = bucketFacts(buckets, ["experiment", "metric"], facts, 6);
  const metrics: PresentationMetric[] = [];
  for (const fact of candidates) {
    const percent = fact.match(/\b\d+(?:\.\d+)?\s*%/);
    const signed = fact.match(/[+-]\d+(?:\.\d+)?\s*%?/);
    const number = percent?.[0] || signed?.[0] || fact.match(/\b\d+(?:\.\d+)?\b/)?.[0];
    if (!number) continue;
    metrics.push({
      label: cleanText(fact.replace(number, ""), 42) || "Reported result",
      value: number,
      detail: cleanText(fact, 76)
    });
    if (metrics.length >= 4) break;
  }
  return metrics.length >= 2 ? metrics : buildMetrics(facts, "academic");
}

function normalizeBullet(value: string, maxLength = 94) {
  return cleanText(value.replace(/^[-•*]\s*/, ""), maxLength);
}

function takeFacts(facts: string[], start: number, count: number, fallback: string[]) {
  const selected = facts.slice(start, start + count);
  return compactFacts(selected, fallback).slice(0, count).map((item) => normalizeBullet(item));
}

function makeSpeakerNotes(title: string, bullets: string[], role: string) {
  const points = bullets.slice(0, 4).join("；");
  return cleanText(`${role}：围绕“${title}”展开讲解。先说明本页结论，再结合资料依据解释关键概念，最后引导听众把要点应用到实际任务中。重点包括：${points}。`, 260);
}

function visualFor(title: string, topic: string, style: PresentationStyle) {
  if (style === "teaching") return `${title} classroom teaching diagram, ${topic}`;
  if (style === "academic") return `${title} academic presentation visual, ${topic}`;
  return `${title} presentation visual, ${topic}`;
}

function buildFallbackFacts(title: string, style: PresentationStyle) {
  if (style === "teaching") {
    return [
      `${title} 的学习目标需要拆成可观察、可练习、可解释的课堂任务。`,
      "先用直观案例建立概念，再通过步骤演示帮助学生形成操作路径。",
      "课堂练习要包含观察、模仿、独立完成和口头解释四个环节。",
      "教师讲解时应把概念、示例和评价标准放在同一页内形成闭环。",
      "总结页需要回扣学习目标，并给出课后继续练习的方向。"
    ];
  }

  if (style === "academic") {
    return [
      `${title} 的汇报需要交代研究背景、核心问题、方法路径、关键发现和局限。`,
      "每个观点应尽量配合证据、实验结果、案例或文献背景说明。",
      "方法页需要说明输入、过程、输出，以及相较基线方案的变化。",
      "结果页应突出核心指标，并解释这些指标对研究问题的意义。",
      "结论页需要给出贡献、适用边界和后续研究方向。"
    ];
  }

  return [
    `${title} 需要先说明背景和目标，再展开核心内容、执行路径和结果判断。`,
    "内容页应避免只列口号，需要给出事实、案例、动作或判断标准。",
    "流程页适合展示从资料整理到落地执行的关键步骤。",
    "对比页可以帮助听众理解不同方案的取舍和适用条件。",
    "总结页需要沉淀可执行的下一步行动。"
  ];
}

function mergeExistingFacts(deck: PresentationDeck) {
  return deck.slides.flatMap((slide) => [slide.title, slide.subtitle, ...(slide.bullets || [])].filter(Boolean).map((item) => cleanText(item, 150)));
}

function buildMetrics(facts: string[], style: PresentationStyle): PresentationMetric[] {
  if (style === "teaching") {
    return [
      { label: "概念理解", value: "3层", detail: "定义、示例、迁移应用" },
      { label: "课堂练习", value: "4步", detail: "观察、标记、制作、解释" },
      { label: "评价标准", value: "2类", detail: "过程表现与作品结果" }
    ];
  }

  if (style === "academic") {
    return [
      { label: "资料来源", value: `${Math.max(3, Math.min(9, facts.length))}项`, detail: "来自文件重点与联网资料" },
      { label: "分析层次", value: "4层", detail: "背景、方法、结果、启示" },
      { label: "输出目标", value: "1套", detail: "结构化汇报逻辑" }
    ];
  }

  return [
    { label: "核心主题", value: `${Math.max(3, Math.min(8, facts.length))}点`, detail: "用于支撑主要页面" },
    { label: "行动路径", value: "4步", detail: "从理解到落地执行" },
    { label: "交付结果", value: "PPT", detail: "可直接下载使用" }
  ];
}

function ensureSlideDensity(slide: PresentationSlide, facts: string[], index: number): PresentationSlide {
  if (slide.type === "cover" || slide.type === "section" || slide.type === "closing") return slide;

  const bullets = compactFacts(slide.bullets || [], takeFacts(facts, index * 2, 4, [])).slice(0, 5);
  if (slide.metrics?.length || slide.table?.length || bullets.length >= 3) {
    return {
      ...slide,
      bullets: bullets.length ? bullets : slide.bullets
    };
  }

  return {
    ...slide,
    bullets: compactFacts(bullets, [
      "说明本页核心概念和适用场景",
      "结合资料给出一个具体例子",
      "总结可执行的判断标准"
    ]).slice(0, 4)
  };
}

function buildTeachingDeck(title: string, request: string, facts: string[], sourceNames: string[]): PresentationDeck {
  const topic = cleanText(title || request, 60);
  const conceptFacts = takeFacts(facts, 0, 4, buildFallbackFacts(topic, "teaching"));
  const exampleFacts = takeFacts(facts, 2, 4, buildFallbackFacts(topic, "teaching"));
  const workflowFacts = takeFacts(facts, 4, 5, [
    "导入案例并提出观察问题",
    "拆解关键概念和操作步骤",
    "完成课堂练习并即时反馈",
    "用学生作品复盘常见问题",
    "布置课后迁移练习"
  ]);
  const sourceLabel = sourceNames.length ? `资料来源：${sourceNames.slice(0, 3).join("、")}` : "结合主题资料与课堂教学结构整理";

  const slides: PresentationSlide[] = [
    {
      type: "cover",
      title: topic,
      subtitle: `${sourceLabel}，整理为可上课使用的教学课件`,
      visualBrief: visualFor(topic, topic, "teaching")
    },
    {
      type: "agenda",
      title: "课程结构",
      bullets: ["学习目标与情境导入", "核心概念与案例讲解", "步骤演示与方法对比", "课堂练习与总结迁移"],
      speakerNotes: makeSpeakerNotes("课程结构", ["说明本节课的学习路径", "让学生知道每个环节的产出"], "导入")
    },
    {
      type: "section",
      title: "学习目标与背景",
      subtitle: conceptFacts[0],
      visualBrief: visualFor("学习目标与背景", topic, "teaching")
    },
    {
      type: "cards",
      title: "核心概念拆解",
      bullets: conceptFacts,
      visualBrief: visualFor("核心概念拆解", topic, "teaching"),
      speakerNotes: makeSpeakerNotes("核心概念拆解", conceptFacts, "讲解重点")
    },
    {
      type: "imageText",
      title: "案例观察与解释",
      bullets: exampleFacts,
      visualBrief: visualFor("案例观察与解释", topic, "teaching"),
      imageQuery: visualFor("案例观察与解释", topic, "teaching"),
      speakerNotes: makeSpeakerNotes("案例观察与解释", exampleFacts, "案例讲解")
    },
    {
      type: "timeline",
      title: "课堂操作流程",
      bullets: workflowFacts,
      speakerNotes: makeSpeakerNotes("课堂操作流程", workflowFacts, "步骤演示")
    },
    {
      type: "comparison",
      title: "常见做法对比",
      bullets: [
        "只看结果：学生容易记住结论但不会迁移",
        "只讲概念：课堂节奏完整但操作感不足",
        "案例加练习：能把概念、动作和反馈连起来",
        "练习后复盘：能暴露误区并形成评价标准"
      ],
      speakerNotes: makeSpeakerNotes("常见做法对比", ["比较不同教学方式的效果", "引导学生理解为什么要练习和复盘"], "对比讲解")
    },
    {
      type: "data",
      title: "教学重点与评价",
      metrics: buildMetrics(facts, "teaching"),
      bullets: ["用课堂表现观察概念理解", "用作品结果判断操作掌握", "用口头解释检查迁移能力"],
      speakerNotes: makeSpeakerNotes("教学重点与评价", ["说明评价标准", "让学生知道好作品的判断方式"], "评价说明")
    },
    {
      type: "cards",
      title: "课堂练习",
      bullets: ["观察一个案例并标出关键节点", "按步骤完成一次模仿练习", "解释每一步为什么这样做", "同伴互评并记录一个改进点"],
      speakerNotes: makeSpeakerNotes("课堂练习", ["明确练习产出", "强调解释和互评"], "练习组织")
    },
    {
      type: "closing",
      title: "总结与课后任务",
      bullets: ["复盘核心概念", "完成一次独立练习", "用三句话解释作品思路"],
      speakerNotes: makeSpeakerNotes("总结与课后任务", ["回扣学习目标", "布置迁移练习"], "收束")
    }
  ];

  return { title: topic, style: "teaching", slides };
}

function buildAcademicDeck(title: string, request: string, facts: string[], sourceNames: string[]): PresentationDeck {
  const topic = cleanText(title || request, 60);
  const background = takeFacts(facts, 0, 4, buildFallbackFacts(topic, "academic"));
  const method = takeFacts(facts, 3, 5, buildFallbackFacts(topic, "academic"));
  const evidence = takeFacts(facts, 6, 4, buildFallbackFacts(topic, "academic"));
  const sourceLabel = sourceNames.length ? `基于 ${sourceNames.slice(0, 3).join("、")} 整理` : "基于研究主题资料整理";

  const slides: PresentationSlide[] = [
    { type: "cover", title: topic, subtitle: `${sourceLabel}的学术汇报`, visualBrief: visualFor(topic, topic, "academic") },
    { type: "agenda", title: "汇报结构", bullets: ["研究背景", "问题与方法", "证据与结果", "结论与展望"], speakerNotes: makeSpeakerNotes("汇报结构", ["建立听众预期", "说明汇报逻辑"], "开场") },
    { type: "section", title: "背景与问题", subtitle: background[0], visualBrief: visualFor("背景与问题", topic, "academic") },
    { type: "cards", title: "研究背景", bullets: background, speakerNotes: makeSpeakerNotes("研究背景", background, "背景说明") },
    { type: "timeline", title: "方法路径", bullets: method, speakerNotes: makeSpeakerNotes("方法路径", method, "方法说明") },
    { type: "imageText", title: "关键证据", bullets: evidence, visualBrief: visualFor("关键证据", topic, "academic"), imageQuery: visualFor("关键证据", topic, "academic"), speakerNotes: makeSpeakerNotes("关键证据", evidence, "证据讲解") },
    { type: "comparison", title: "方案与基线对比", bullets: ["基线方案：结构简单但解释维度有限", "改进方案：整合背景、证据与应用场景", "优势：更容易支撑完整汇报叙事", "边界：仍需结合真实数据继续验证"], speakerNotes: makeSpeakerNotes("方案与基线对比", ["说明差异", "指出优势和边界"], "对比说明") },
    { type: "data", title: "结果与启示", metrics: buildMetrics(facts, "academic"), bullets: ["结果需要回到研究问题解释", "指标只保留与结论直接相关的部分", "启示要说明适用范围和限制"], speakerNotes: makeSpeakerNotes("结果与启示", ["解释结果意义", "说明适用边界"], "结果说明") },
    { type: "closing", title: "结论与后续工作", bullets: ["总结核心贡献", "指出方法边界", "提出后续验证方向"], speakerNotes: makeSpeakerNotes("结论与后续工作", ["收束贡献", "提出后续工作"], "结尾") }
  ];

  return { title: topic, style: "academic", slides };
}

function buildAcademicPaperDeck(title: string, request: string, facts: string[], sourceNames: string[], buckets?: AcademicFactBuckets): PresentationDeck {
  const topic = cleanText(title || request, 60);
  const fallback = buildFallbackFacts(topic, "academic");
  const abstractFacts = bucketFacts(buckets, ["abstract", "title"], facts, 3);
  const background = bucketFacts(buckets, ["background", "abstract"], takeFacts(facts, 0, 5, fallback), 5);
  const problem = bucketFacts(buckets, ["problem", "background"], takeFacts(facts, 1, 5, fallback), 4);
  const coreIdea = bucketFacts(buckets, ["architecture", "method"], takeFacts(facts, 2, 5, fallback), 4);
  const method = bucketFacts(buckets, ["method"], takeFacts(facts, 3, 5, fallback), 5);
  const architecture = bucketFacts(buckets, ["architecture", "figure"], takeFacts(facts, 4, 4, fallback), 4);
  const experiments = bucketFacts(buckets, ["experiment", "metric"], takeFacts(facts, 5, 5, fallback), 5);
  const comparison = bucketFacts(buckets, ["comparison"], takeFacts(facts, 6, 4, fallback), 4);
  const limitations = bucketFacts(buckets, ["limitation"], takeFacts(facts, 7, 4, fallback), 4);
  const conclusions = bucketFacts(buckets, ["conclusion", "abstract"], takeFacts(facts, 8, 4, fallback), 4);
  const sourceLabel = sourceNames.length ? `Based on ${sourceNames.slice(0, 3).join(", ")}` : "Based on uploaded research material";
  const metrics = buildAcademicMetricsFromBuckets(facts, buckets);

  const slides: PresentationSlide[] = [
    {
      type: "cover",
      title: topic,
      subtitle: `${sourceLabel}; ${abstractFacts[0] || "structured academic presentation from the uploaded document"}`,
      layoutPreset: "academic_cover",
      bullets: compactFacts(abstractFacts, [topic, "Research question", "Method", "Evidence"]).slice(0, 3),
      visualBrief: visualFor(topic, topic, "academic"),
      speakerNotes: academicNotes(topic, abstractFacts.length ? abstractFacts : background)
    },
    {
      type: "agenda",
      title: "Roadmap",
      layoutPreset: "agenda_list",
      bullets: ["Background", "Research Question", "Core Idea", "Method Pipeline", "Experiments and Comparison", "Limitations and Takeaways"],
      speakerNotes: academicNotes("Roadmap", ["Connect the uploaded document evidence to the talk structure", "Keep method, results, and limitations visible"])
    },
    {
      type: "cards",
      title: "Background and Motivation",
      layoutPreset: "knowledge_cards",
      bullets: background,
      visualBrief: visualFor("Background and Motivation", topic, "academic"),
      speakerNotes: academicNotes("Background and Motivation", background)
    },
    {
      type: "cards",
      title: "Problem / Research Question",
      layoutPreset: "knowledge_cards",
      bullets: problem,
      visualBrief: visualFor("Problem and Research Question", topic, "academic"),
      speakerNotes: academicNotes("Problem / Research Question", problem)
    },
    {
      type: "imageText",
      title: "Core Idea",
      layoutPreset: "image_explanation",
      bullets: coreIdea,
      visualBrief: visualFor("Core Idea", topic, "academic"),
      imageQuery: visualFor("Core Idea mechanism diagram", topic, "academic"),
      speakerNotes: academicNotes("Core Idea", coreIdea)
    },
    {
      type: "timeline",
      title: "Method Pipeline",
      layoutPreset: "process_steps",
      bullets: method,
      visualBrief: visualFor("Method Pipeline", topic, "academic"),
      speakerNotes: academicNotes("Method Pipeline", method)
    },
    {
      type: "imageText",
      title: "Architecture / Mechanism",
      layoutPreset: "image_explanation",
      bullets: architecture,
      visualBrief: visualFor("Architecture Mechanism", topic, "academic"),
      imageQuery: visualFor("Architecture mechanism diagram", topic, "academic"),
      speakerNotes: academicNotes("Architecture / Mechanism", architecture)
    },
    {
      type: "data",
      title: "Experiments / Results",
      layoutPreset: "data_insight",
      metrics,
      bullets: experiments,
      visualBrief: visualFor("Experiment Results", topic, "academic"),
      speakerNotes: academicNotes("Experiments / Results", experiments)
    },
    {
      type: "comparison",
      title: "Comparison / Baselines",
      layoutPreset: "comparison_matrix",
      bullets: compactFacts(comparison, [
        "Mechanism: compare how each method processes evidence",
        "Advantage: identify where the proposed direction improves the baseline",
        "Limitation: keep the boundary condition visible",
        "Use case: connect the choice to the target task"
      ]).slice(0, 4),
      speakerNotes: academicNotes("Comparison / Baselines", comparison)
    },
    {
      type: "cards",
      title: "Limitations / Failure Modes",
      layoutPreset: "knowledge_cards",
      bullets: limitations,
      visualBrief: visualFor("Limitations and Failure Modes", topic, "academic"),
      speakerNotes: academicNotes("Limitations / Failure Modes", limitations)
    },
    {
      type: "cards",
      title: "Takeaways",
      layoutPreset: "knowledge_cards",
      bullets: conclusions,
      visualBrief: visualFor("Takeaways", topic, "academic"),
      speakerNotes: academicNotes("Takeaways", conclusions)
    },
    {
      type: "closing",
      title: "Summary / Q&A",
      layoutPreset: "summary_closing",
      bullets: compactFacts(conclusions, limitations).slice(0, 4),
      speakerNotes: academicNotes("Summary / Q&A", compactFacts(conclusions, limitations).slice(0, 4))
    }
  ];

  return { title: topic, style: "academic", slides };
}

function buildGeneralDeck(title: string, request: string, facts: string[], sourceNames: string[]): PresentationDeck {
  const topic = cleanText(title || request, 60);
  const core = takeFacts(facts, 0, 4, buildFallbackFacts(topic, "general"));
  const action = takeFacts(facts, 3, 5, buildFallbackFacts(topic, "general"));
  const sourceLabel = sourceNames.length ? `资料来源：${sourceNames.slice(0, 3).join("、")}` : "结合任务主题整理";

  const slides: PresentationSlide[] = [
    { type: "cover", title: topic, subtitle: sourceLabel, visualBrief: visualFor(topic, topic, "general") },
    { type: "agenda", title: "内容结构", bullets: ["背景与目标", "核心发现", "执行路径", "总结建议"], speakerNotes: makeSpeakerNotes("内容结构", ["说明整体结构", "建立阅读路线"], "开场") },
    { type: "section", title: "背景与目标", subtitle: core[0], visualBrief: visualFor("背景与目标", topic, "general") },
    { type: "cards", title: "核心发现", bullets: core, speakerNotes: makeSpeakerNotes("核心发现", core, "重点说明") },
    { type: "imageText", title: "关键案例", bullets: takeFacts(facts, 2, 4, buildFallbackFacts(topic, "general")), visualBrief: visualFor("关键案例", topic, "general"), imageQuery: visualFor("关键案例", topic, "general"), speakerNotes: makeSpeakerNotes("关键案例", core, "案例讲解") },
    { type: "timeline", title: "执行路径", bullets: action, speakerNotes: makeSpeakerNotes("执行路径", action, "路径说明") },
    { type: "comparison", title: "方案取舍", bullets: ["当前做法：信息分散，难以直接交付", "优化方向：先整理资料，再规划页面", "收益：内容更完整，排版更稳定", "风险：资料不足时需要本地 fallback 补足结构"], speakerNotes: makeSpeakerNotes("方案取舍", ["说明取舍", "明确收益与风险"], "对比说明") },
    { type: "data", title: "交付检查", metrics: buildMetrics(facts, "general"), bullets: ["检查每页信息量", "检查视觉线索", "检查讲稿备注"], speakerNotes: makeSpeakerNotes("交付检查", ["说明质量标准", "确认交付条件"], "质量说明") },
    { type: "closing", title: "总结与下一步", bullets: ["沉淀关键结论", "明确下一步动作", "补充需要继续验证的资料"], speakerNotes: makeSpeakerNotes("总结与下一步", ["收束结论", "提出下一步"], "结尾") }
  ];

  return { title: topic, style: "general", slides };
}

function hasEnoughContent(deck: PresentationDeck) {
  if (deck.slides.length < MIN_RICH_SLIDES) return false;
  const contentSlides = deck.slides.filter((slide) => !["cover", "section", "closing"].includes(slide.type));
  if (contentSlides.length < 5) return false;
  return contentSlides.every((slide) => (slide.bullets || []).length >= 3 || (slide.metrics || []).length >= 2 || (slide.table || []).length >= 3);
}

function hasAcademicPaperStructure(deck: PresentationDeck) {
  if (deck.slides.length < 10) return false;
  const text = normalizeText(
    deck.slides
      .map((slide) => `${slide.type} ${slide.layoutPreset || ""} ${slide.title} ${(slide.bullets || []).join(" ")}`)
      .join(" ")
  );
  const hasMethod = /process_steps|timeline|method|pipeline|approach|algorithm/.test(text);
  const hasComparison = /comparison_matrix|comparison|baseline|ablation|versus/.test(text);
  const hasResult = /data_insight|experiment|result|benchmark|metric|accuracy|throughput/.test(text);
  const hasSummary = /summary_closing|summary|takeaway|conclusion|q&a/.test(text);
  return hasMethod && hasComparison && hasResult && hasSummary;
}

function compactDeckToSlideCount(deck: PresentationDeck, targetCount: number): PresentationDeck {
  if (deck.slides.length <= targetCount) return deck;

  const cover = deck.slides.find((slide) => slide.type === "cover") || deck.slides[0];
  const agenda = deck.slides.find((slide) => slide.type === "agenda");
  const exercise = deck.slides.find((slide) => slide.layoutPreset === "lesson_exercise" || /练习|practice|exercise/i.test(slide.title));
  const closing = deck.slides.find((slide) => slide.type === "closing") || deck.slides[deck.slides.length - 1];
  const timeline = deck.slides.find((slide) => slide.type === "timeline");
  const contentCandidates = deck.slides.filter((slide) => ![cover, agenda, exercise, closing].includes(slide));
  const priority = [
    ...contentCandidates.filter((slide) => slide === timeline),
    ...contentCandidates.filter((slide) => slide.type === "cards"),
    ...contentCandidates.filter((slide) => slide.type === "imageText"),
    ...contentCandidates.filter((slide) => slide.type === "timeline"),
    ...contentCandidates.filter((slide) => slide.type === "data"),
    ...contentCandidates.filter((slide) => slide.type === "comparison"),
    ...contentCandidates.filter((slide) => slide.type === "section"),
    ...contentCandidates
  ];
  const selected: PresentationSlide[] = [];
  const add = (slide?: PresentationSlide) => {
    if (!slide || selected.includes(slide) || selected.length >= targetCount) return;
    selected.push(slide);
  };

  add(cover);
  add(agenda);
  if (targetCount <= 6) {
    add(contentCandidates.find((slide) => slide.type === "cards") || contentCandidates[0]);
    add(timeline);
    add(exercise);
    add(closing);
    return {
      ...deck,
      slides: selected.slice(0, targetCount)
    };
  }
  for (const slide of priority) {
    if (selected.length >= targetCount - (exercise ? 2 : 1)) break;
    add(slide);
  }
  add(exercise);
  while (selected.length < targetCount - 1) add(priority.find((slide) => !selected.includes(slide)));
  add(closing);

  return {
    ...deck,
    slides: selected.slice(0, targetCount)
  };
}

function ensureVisualGuidance(slide: PresentationSlide, deckTitle: string, style: PresentationStyle): PresentationSlide {
  if (slide.visualBrief || slide.imageQuery || slide.visualAsset) return slide;
  if (!["cover", "section", "imageText", "cards", "timeline", "data"].includes(slide.type)) return slide;

  const brief = visualFor(slide.title, deckTitle, style);
  return {
    ...slide,
    visualBrief: brief,
    imageQuery: slide.type === "cover" || slide.type === "section" || slide.type === "imageText" ? brief : slide.imageQuery
  };
}

export function buildRichPresentationDeck(input: RichPresentationDeckInput): PresentationDeck {
  const style = inferStyle(input);
  const requestedSlideCount = getRequestedSlideCount(input.request);
  const sourceNames = [
    ...(input.extractedDocuments || []).map((document) => document.fileName),
    ...(input.webContext?.items || []).map((item) => item.website || item.title).filter(Boolean)
  ];
  const fallbackFacts = buildFallbackFacts(input.title || input.deck.title, style);
  const facts = compactFacts(
    [
      ...extractDocumentFacts(input.extractedDocuments),
      ...extractWebFacts(input.webContext),
      ...mergeExistingFacts(input.deck)
    ],
    fallbackFacts
  );
  const academicBuckets = style === "academic" ? buildAcademicFactBuckets(input.extractedDocuments, facts) : undefined;
  const shouldUseExistingDeck =
    hasEnoughContent(input.deck) &&
    !(style === "academic" && Boolean(input.extractedDocuments?.length) && !hasAcademicPaperStructure(input.deck));

  const baseDeck = shouldUseExistingDeck
    ? {
        ...input.deck,
        style,
        slides: input.deck.slides.map((slide, index) => ensureSlideDensity(slide, facts, index))
      }
    : style === "teaching"
      ? buildTeachingDeck(input.title || input.deck.title, input.request, facts, sourceNames)
      : style === "academic"
        ? buildAcademicPaperDeck(input.title || input.deck.title, input.request, facts, sourceNames, academicBuckets)
        : buildGeneralDeck(input.title || input.deck.title, input.request, facts, sourceNames);

  const outputDeck = requestedSlideCount ? compactDeckToSlideCount(baseDeck, requestedSlideCount) : baseDeck;
  const planned = createPresentationPlanV2({
    deck: {
      ...outputDeck,
      slides: outputDeck.slides.slice(0, MAX_RICH_SLIDES)
    },
    request: input.request,
    title: input.title
  });

  return {
    ...planned,
    slides: planned.slides.map((slide, index) => ensureVisualGuidance(ensureSlideDensity(slide, facts, index), planned.title, style))
  };
}
