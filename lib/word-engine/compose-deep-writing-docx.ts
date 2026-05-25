import type { DeepWritingTaskMemory } from "@/lib/agent/runtime/deep-writing-memory";
import { detectWordAttributes } from "./detect-word-attributes";
import type { WordContent, WordDocumentAttributes, WordRequest, WordSection, WordTable } from "./types";

const fallbackTitle = "\u6df1\u5ea6\u5199\u4f5c\u62a5\u544a";
const sourceHeading = "\u8d44\u6599\u6765\u6e90\u4e0e\u53c2\u8003\u6458\u8981";
const forbiddenDocxTerms =
  /deepWritingTaskMemory|wordTaskMemory|taskId|conversationId|currentStage|searchPlan|adoptedSources|section_delta|source_plan|mock|placeholder|TODO|prompt|provider|chain-of-thought|internal JSON/gi;

export function composeDeepWritingDocxContent(memory: DeepWritingTaskMemory): WordContent {
  const title = cleanText(memory.topic || memory.originalInstruction || fallbackTitle, 120);
  const sections = composeSections(memory);
  const sourceSection = composeSourceSection(memory);
  if (sourceSection) sections.push(sourceSection);

  return {
    title,
    subtitle: subtitleFor(memory),
    sections,
    tables: composeTables(memory),
    attributes: attributesFor(memory, title, sections)
  };
}

export function composeDeepWritingDocxRequest(memory: DeepWritingTaskMemory): WordRequest {
  return {
    taskId: memory.taskId,
    conversationId: memory.conversationId,
    title: cleanText(memory.topic || fallbackTitle, 120),
    instruction: cleanText(memory.originalInstruction || memory.topic, 500),
    contentOrigin: "generated_content",
    sourceText: cleanText([memory.sourceSummary, ...memory.adoptedSources.map((source) => source.summary)].join("\n"), 4000),
    sourceFiles: memory.sourceFileNames.map((fileName) => ({ fileName })),
    conversationSummary: cleanText(memory.sourceSummary, 1200),
    outputFileName: cleanFileBase(memory.topic || "deep-writing-report"),
    stylePreset: "formal",
    language: "zh-CN"
  };
}

function composeSections(memory: DeepWritingTaskMemory): WordSection[] {
  const completed = memory.outline.filter((section) => section.status === "completed" && section.draft?.trim());
  const sections = completed.map((section, index) => ({
    heading: cleanText(section.title, 80),
    paragraphs: paragraphsForFinalSection(section.title, section.draft || "", memory, index)
  }));

  if (!sections.length) {
    sections.push({
      heading: "\u6587\u6863\u6982\u8ff0",
      paragraphs: [cleanText(memory.sourceSummary || memory.originalInstruction || memory.topic, 600)]
    });
  }

  return sections.filter((section) => section.heading && section.paragraphs.length);
}

function paragraphsForFinalSection(title: string, draft: string, memory: DeepWritingTaskMemory, index: number) {
  const normalizedTitle = cleanText(title, 80);
  const sourceFacts = extractFacts(memory);
  const sourceNames = memory.sourceFileNames.length ? memory.sourceFileNames.join("\u3001") : "\u5f53\u524d\u5bf9\u8bdd\u548c\u5df2\u4e0a\u4f20\u8d44\u6599";
  const draftParagraphs = splitDraft(draft);
  const shortDraft = draftParagraphs.find((paragraph) => !hasRepeatedEvidencePattern(paragraph));

  const byRole: Array<[RegExp, string[]]> = [
    [
      /\u6458\u8981|\u603b\u4f53|\u6982\u8ff0|\u80cc\u666f/,
      [
        `${memory.topic}\u56f4\u7ed5${sourceNames}\u5f62\u6210\u6587\u6863\u6846\u67b6\uff0c\u91cd\u70b9\u8bf4\u660e\u5199\u4f5c\u76ee\u6807\u3001\u4f7f\u7528\u573a\u666f\u548c\u8d44\u6599\u8303\u56f4\u3002`,
        shortDraft || "\u672c\u7ae0\u4ee5\u6982\u62ec\u6027\u8868\u8ff0\u5efa\u7acb\u9605\u8bfb\u5165\u53e3\uff0c\u540e\u7eed\u7ae0\u8282\u518d\u5206\u522b\u5c55\u5f00\u4e8b\u5b9e\u3001\u5206\u6790\u548c\u5efa\u8bae\u3002"
      ]
    ],
    [
      /\u6765\u6e90|\u8303\u56f4|\u65b9\u6cd5/,
      [
        `\u672c\u6b21\u6574\u7406\u7684\u8d44\u6599\u8303\u56f4\u5305\u62ec${sourceNames}\uff0c\u5e76\u5c06\u5176\u8f6c\u5316\u4e3a\u7ae0\u8282\u8349\u7a3f\u548c\u6700\u7ec8 Word \u6587\u6863\u3002`,
        "\u8d44\u6599\u5904\u7406\u4ee5\u53ef\u5c55\u793a\u6458\u8981\u4e3a\u4e3b\uff0c\u4e0d\u5c55\u793a\u5185\u90e8\u8bb0\u5fc6\u5bf9\u8c61\u3001\u4e8b\u4ef6\u540d\u79f0\u6216\u8fd0\u884c\u65e5\u5fd7\u3002"
      ]
    ],
    [
      /\u5206\u6790|\u73b0\u72b6|\u53d1\u73b0|\u5173\u952e/,
      [
        sourceFacts
          ? `\u8d44\u6599\u5206\u6790\u663e\u793a\uff0c\u5f53\u524d\u6838\u5fc3\u4fe1\u606f\u5305\u62ec${sourceFacts}\uff0c\u53ef\u7528\u4e8e\u652f\u6491\u540e\u7eed\u5224\u65ad\u548c\u7ed3\u8bba\u3002`
          : `${memory.topic}\u7684\u5206\u6790\u90e8\u5206\u4e3b\u8981\u56f4\u7ed5\u8d44\u6599\u4e2d\u5df2\u786e\u8ba4\u7684\u4e8b\u5b9e\u3001\u5bf9\u8c61\u548c\u4f7f\u7528\u76ee\u6807\u5c55\u5f00\u3002`,
        "\u8be5\u90e8\u5206\u5c06\u539f\u59cb\u6587\u672c\u6574\u7406\u4e3a\u6b63\u5f0f\u53d9\u8ff0\uff0c\u907f\u514d\u76f4\u63a5\u5806\u653e CSV \u6216\u672a\u7ecf\u7ec4\u7ec7\u7684\u539f\u59cb\u7247\u6bb5\u3002"
      ]
    ],
    [
      /\u8d8b\u52bf|\u8def\u5f84|\u6d41\u7a0b|\u65f6\u95f4|\u98ce\u9669|\u6210\u679c/,
      [
        `${normalizedTitle}\u90e8\u5206\u805a\u7126\u4ece\u5206\u6790\u5230\u6267\u884c\u7684\u8f6c\u5316\uff0c\u5c06\u76ee\u6807\u62c6\u89e3\u4e3a\u53ef\u8ddf\u8fdb\u7684\u884c\u52a8\u548c\u8282\u70b9\u3002`,
        "\u5728\u540e\u7eed\u5b9e\u65bd\u4e2d\uff0c\u5efa\u8bae\u6309\u4f18\u5148\u7ea7\u68b3\u7406\u4efb\u52a1\uff0c\u540c\u65f6\u4fdd\u7559\u98ce\u9669\u8bc6\u522b\u3001\u6548\u679c\u590d\u76d8\u548c\u6301\u7eed\u6539\u8fdb\u673a\u5236\u3002"
      ]
    ],
    [
      /\u5efa\u8bae|\u7ed3\u8bba|\u540e\u7eed|\u7ef4\u62a4/,
      [
        "\u5efa\u8bae\u5148\u5f62\u6210\u7ed3\u6784\u5316\u6e05\u5355\uff0c\u660e\u786e\u8d23\u4efb\u4eba\u3001\u65f6\u95f4\u8282\u70b9\u548c\u9a8c\u6536\u65b9\u5f0f\uff0c\u518d\u7ed3\u5408\u5b9e\u9645\u53cd\u9988\u8fed\u4ee3\u6587\u6863\u5185\u5bb9\u3002",
        `${memory.topic}\u7684\u7ed3\u8bba\u5e94\u4fdd\u6301\u53ef\u6267\u884c\u3001\u53ef\u590d\u76d8\u548c\u53ef\u6269\u5c55\uff0c\u4e3a\u540e\u7eed Word \u5b9a\u7a3f\u548c\u4e1a\u52a1\u4f7f\u7528\u7559\u51fa\u660e\u786e\u63a5\u53e3\u3002`
      ]
    ]
  ];
  const selected = byRole.find(([pattern]) => pattern.test(normalizedTitle))?.[1] || [
    `${normalizedTitle}\u90e8\u5206\u670d\u52a1\u4e8e${memory.topic}\u7684\u6574\u4f53\u8868\u8fbe\uff0c\u8865\u5145\u4e0e\u672c\u7ae0\u76f4\u63a5\u76f8\u5173\u7684\u4fe1\u606f\u3002`,
    shortDraft || `\u672c\u7ae0\u4f5c\u4e3a\u7b2c ${index + 1} \u4e2a\u7ae0\u8282\uff0c\u4fdd\u6301\u6b63\u5f0f\u3001\u6e05\u6670\u7684\u5199\u6cd5\uff0c\u5e76\u907f\u514d\u4e0e\u5176\u4ed6\u7ae0\u8282\u91cd\u590d\u3002`
  ];

  return selected.map((paragraph) => cleanText(paragraph, 700)).filter(Boolean);
}

function composeSourceSection(memory: DeepWritingTaskMemory): WordSection | null {
  const sources = memory.adoptedSources.filter((source) => source.title && source.summary);
  if (!sources.length && !memory.sourceSummary) return null;

  const paragraphs = [
    memory.sourceSummary ? `\u5df2\u6574\u7406\u7684\u8d44\u6599\u6458\u8981\uff1a${cleanText(memory.sourceSummary, 700)}` : "",
    ...sources.map((source, index) => {
      const url = source.url ? `\u94fe\u63a5\uff1a${source.url}` : "";
      return `${index + 1}. ${cleanText(source.title, 80)}\uff1a${cleanText(source.summary, 500)}${url ? `\u3002${url}` : ""}`;
    })
  ].filter(Boolean);

  return {
    heading: sourceHeading,
    paragraphs
  };
}

function composeTables(memory: DeepWritingTaskMemory): WordTable[] {
  const rows = memory.adoptedSources
    .filter((source) => source.title && source.summary)
    .slice(0, 8)
    .map((source) => [cleanText(source.title, 60), source.sourceType || "\u8d44\u6599", cleanText(source.summary, 120)]);

  if (!rows.length) return [];
  return [
    {
      title: "\u8d44\u6599\u91c7\u7528\u6982\u89c8",
      headers: ["\u8d44\u6599", "\u7c7b\u578b", "\u6458\u8981"],
      rows
    }
  ];
}

function attributesFor(memory: DeepWritingTaskMemory, title: string, sections: WordSection[]): WordDocumentAttributes {
  const base = detectWordAttributes({
    title,
    instruction: memory.originalInstruction,
    sourceText: memory.sourceSummary
  }, { sectionCount: sections.length });
  const documentKind = mapDocumentKind(memory.documentKind);
  const formal = documentKind === "report" || documentKind === "plan" || documentKind === "training";
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
  if (memory.documentKind === "research") return "\u8c03\u7814\u62a5\u544a";
  if (memory.documentKind === "plan") return "\u5b8c\u6574\u65b9\u6848";
  if (memory.documentKind === "manual") return "\u57f9\u8bad\u624b\u518c";
  return "\u6df1\u5ea6\u5199\u4f5c\u6587\u6863";
}

function splitDraft(draft: string) {
  return draft
    .split(/\n{2,}|\r?\n/)
    .map((paragraph) => cleanText(paragraph, 900))
    .filter(Boolean);
}

function hasRepeatedEvidencePattern(value: string) {
  return /\u5f53\u524d\u8d44\u6599\u4e2d\u7684\u5173\u952e\u4fe1\u606f|\u8fd9\u4e9b\u4fe1\u606f\u4f1a\u4f5c\u4e3a|\u4f5c\u4e3a\u672c\u7ae0\u8282/.test(value);
}

function extractFacts(memory: DeepWritingTaskMemory) {
  const text = [memory.sourceSummary, ...memory.adoptedSources.map((source) => source.summary)].join(" ");
  const facts = ["\u5f20\u4e09", "\u674e\u56db", "90", "85", "AI \u6559\u80b2\u6d4b\u8bd5\u6570\u636e"].filter((term) => text.includes(term));
  return facts.length ? `\uff1a${facts.join("\u3001")}` : "";
}

function cleanText(value: string, maxLength: number) {
  return String(value || "")
    .replace(forbiddenDocxTerms, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanFileBase(value: string) {
  const cleaned = cleanText(value, 80).replace(/[\\/:*?"<>|]/g, "").trim();
  return cleaned || "deep-writing-report";
}
