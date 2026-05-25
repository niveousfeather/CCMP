import { buildWordDocumentPlanFromIntent, extractWordGenerationIntent, type WordBlock, type WordDocumentPlan } from "@/lib/document/plan";
import type { WordContent, WordDocumentAttributes, WordRequest, WordSection, WordTable } from "./types";

const stageRows = [
  ["\u8bfe\u7a0b\u5bfc\u5165\u4e0e\u8f6f\u4ef6\u57fa\u7840", "8 \u8bfe\u65f6", "\u5efa\u7acb\u4e09\u7ef4\u52a8\u753b\u5b66\u4e60\u573a\u666f\uff0c\u719f\u6089\u8f6f\u4ef6\u754c\u9762\u3001\u57fa\u672c\u64cd\u4f5c\u548c\u9879\u76ee\u6587\u4ef6\u7ba1\u7406\u3002"],
  ["\u4e09\u7ef4\u5efa\u6a21\u57fa\u7840", "12 \u8bfe\u65f6", "\u638c\u63e1\u57fa\u7840\u51e0\u4f55\u5efa\u6a21\u3001\u7f16\u8f91\u5668\u4f7f\u7528\u548c\u89c4\u8303\u5316\u6a21\u578b\u5236\u4f5c\u65b9\u6cd5\u3002"],
  ["\u6750\u8d28\u3001\u706f\u5149\u4e0e\u6e32\u67d3", "10 \u8bfe\u65f6", "\u7406\u89e3\u6750\u8d28\u5c5e\u6027\u3001\u706f\u5149\u5e03\u7f6e\u548c\u57fa\u7840\u6e32\u67d3\u53c2\u6570\uff0c\u5f62\u6210\u53ef\u5c55\u793a\u753b\u9762\u3002"],
  ["\u52a8\u753b\u89c4\u5f8b\u4e0e\u5173\u952e\u5e27\u5236\u4f5c", "14 \u8bfe\u65f6", "\u56f4\u7ed5\u5173\u952e\u5e27\u3001\u8fd0\u52a8\u8282\u594f\u3001\u7f13\u5165\u7f13\u51fa\u548c\u6324\u538b\u62c9\u4f38\u7ec4\u7ec7\u793a\u8303\u4e0e\u7ec3\u4e60\u3002"],
  ["\u89d2\u8272/\u573a\u666f\u52a8\u753b\u7efc\u5408\u8bad\u7ec3", "12 \u8bfe\u65f6", "\u5c06\u5efa\u6a21\u3001\u6750\u8d28\u3001\u955c\u5934\u548c\u52a8\u753b\u89c4\u5f8b\u7ec4\u5408\u6210\u8fde\u7eed\u4efb\u52a1\u3002"],
  ["\u9879\u76ee\u4f5c\u54c1\u5236\u4f5c\u4e0e\u5c55\u793a\u8bc4\u4ef7", "8 \u8bfe\u65f6", "\u5b8c\u6210\u8bfe\u7a0b\u4f5c\u54c1\u3001\u8fc7\u7a0b\u8bf4\u660e\u3001\u5c55\u793a\u6c47\u62a5\u548c\u4fee\u6539\u53cd\u601d\u3002"]
];

export function composeLessonPlanContent(request: WordRequest, attributes: WordDocumentAttributes): WordContent {
  const documentPlan = composeLessonDocumentPlan(request);
  return {
    title: documentPlan.title,
    subtitle: documentPlan.subtitle,
    sections: documentPlan.sections.map(sectionFromDocumentSection),
    tables: tablesFromDocumentPlan(documentPlan),
    attributes: {
      ...attributes,
      documentKind: "lesson_plan",
      formality: "formal",
      needsHeaderFooter: true,
      needsTables: true,
      theme: "blue"
    }
  };
}

export function composeLessonDocumentPlan(request: WordRequest): WordDocumentPlan {
  const prompt = lessonPrompt(request);
  const intent = extractWordGenerationIntent(prompt);
  return ensureLessonEnhancements(buildWordDocumentPlanFromIntent(intent, "lesson_plan"), request);
}

function lessonPrompt(request: WordRequest) {
  return [request.instruction, request.title, request.sourceText, request.conversationSummary, ...(request.sourceFiles || []).map((file) => file.text || file.fileName)]
    .filter(Boolean)
    .join("\n");
}

function sectionFromDocumentSection(section: WordDocumentPlan["sections"][number]): WordSection {
  return {
    heading: section.heading,
    paragraphs: [section.intro || "", ...section.blocks.flatMap(textFromBlock)].filter(Boolean)
  };
}

function textFromBlock(block: WordBlock): string[] {
  if (block.type === "paragraph") return [block.text];
  if (block.type === "callout") return [block.title ? `${block.title}\uff1a${block.text}` : block.text];
  if (block.type === "bullet_list" || block.type === "numbered_list" || block.type === "checklist") return block.items;
  if (block.type === "table" || block.type === "timeline" || block.type === "rubric" || block.type === "responsibility_matrix") {
    return block.rows.map((row) => row.join("\uff1b"));
  }
  return [];
}

function tablesFromDocumentPlan(plan: WordDocumentPlan): WordTable[] {
  const tables: WordTable[] = [];
  for (const section of plan.sections) {
    for (const block of section.blocks) {
      if (block.type === "table" || block.type === "timeline" || block.type === "rubric" || block.type === "responsibility_matrix") {
        tables.push({
          title: section.heading,
          headers: block.headers,
          rows: block.rows
        });
      }
    }
  }
  return tables;
}

function ensureLessonEnhancements(plan: WordDocumentPlan, request: WordRequest): WordDocumentPlan {
  const prompt = lessonPrompt(request);
  const hasLongClassHours = /64\s*(?:个)?\s*(?:课时|学时)/.test(prompt);
  const sections = [...plan.sections];
  const processIndex = sections.findIndex((section) => section.heading.includes("\u6559\u5b66\u8fc7\u7a0b"));
  if (processIndex >= 0) sections[processIndex] = groundedTeachingProcessSection();

  if (!sections.some((section) => section.heading.includes("\u5b66\u60c5\u5206\u6790"))) {
    sections.splice(1, 0, {
      heading: "\u5b66\u60c5\u5206\u6790",
      level: 1,
      intro:
        "\u672c\u8bfe\u7a0b\u9762\u5411\u5177\u5907\u57fa\u7840\u8ba1\u7b97\u673a\u64cd\u4f5c\u80fd\u529b\u7684\u5b66\u751f\uff0c\u9700\u8981\u901a\u8fc7\u6848\u4f8b\u89c2\u5bdf\u3001\u64cd\u4f5c\u793a\u8303\u548c\u9636\u6bb5\u4f5c\u54c1\u53cd\u9988\uff0c\u9010\u6b65\u5efa\u7acb\u4e09\u7ef4\u52a8\u753b\u7684\u7a7a\u95f4\u601d\u7ef4\u4e0e\u8fd0\u52a8\u8868\u8fbe\u80fd\u529b\u3002",
      blocks: [
        {
          type: "paragraph",
          text:
            "\u5b66\u751f\u5bb9\u6613\u5728\u5efa\u6a21\u89c4\u8303\u3001\u5173\u952e\u5e27\u8282\u594f\u548c\u753b\u9762\u7ec6\u8282\u8c03\u6574\u4e0a\u51fa\u73b0\u65ad\u70b9\uff0c\u56e0\u6b64\u6559\u5b66\u5e94\u628a\u77e5\u8bc6\u8bb2\u89e3\u4e0e\u9879\u76ee\u5316\u7ec3\u4e60\u7ed3\u5408\u8d77\u6765\u3002"
        }
      ]
    });
  }

  if (!sections.some((section) => section.heading.includes("\u6559\u5b66\u5185\u5bb9\u4e0e\u8bfe\u65f6\u5b89\u6392") || section.heading.includes("\u8bfe\u7a0b\u5185\u5bb9\u4e0e\u8bfe\u65f6\u5b89\u6392"))) {
    sections.splice(Math.min(5, sections.length), 0, classHourSection(hasLongClassHours));
  } else if (hasLongClassHours) {
    const index = sections.findIndex((section) => section.heading.includes("\u6559\u5b66\u5185\u5bb9\u4e0e\u8bfe\u65f6\u5b89\u6392") || section.heading.includes("\u8bfe\u7a0b\u5185\u5bb9\u4e0e\u8bfe\u65f6\u5b89\u6392"));
    sections[index] = classHourSection(true);
  }

  if (!sections.some((section) => section.heading.includes("\u6559\u5b66\u8d44\u6e90"))) {
    sections.splice(Math.max(0, sections.length - 1), 0, {
      heading: "\u6559\u5b66\u8d44\u6e90",
      level: 1,
      intro:
        "\u6559\u5b66\u8d44\u6e90\u5e94\u5305\u62ec\u8f6f\u4ef6\u73af\u5883\u3001\u6848\u4f8b\u7d20\u6750\u3001\u8fc7\u7a0b\u6587\u4ef6\u3001\u4f18\u79c0\u4f5c\u54c1\u6837\u4f8b\u548c\u8bc4\u4ef7\u91cf\u8868\uff0c\u4fbf\u4e8e\u5b66\u751f\u5728\u8bfe\u5802\u7ec3\u4e60\u548c\u8bfe\u540e\u4fee\u6539\u4e2d\u53cd\u590d\u4f7f\u7528\u3002",
      blocks: [
        {
          type: "bullet_list",
          items: [
            "\u4e09\u7ef4\u5efa\u6a21\u4e0e\u52a8\u753b\u5236\u4f5c\u8f6f\u4ef6\u53ca\u57fa\u7840\u64cd\u4f5c\u6587\u6863",
            "\u5173\u952e\u5e27\u3001\u8fd0\u52a8\u89c4\u5f8b\u548c\u6e32\u67d3\u6548\u679c\u6848\u4f8b",
            "\u9636\u6bb5\u4f5c\u54c1\u63d0\u4ea4\u6a21\u677f\u548c\u8003\u6838\u8bc4\u4ef7\u91cf\u8868"
          ]
        }
      ]
    });
  }

  return { ...plan, sections };
}

function classHourSection(force64: boolean): WordDocumentPlan["sections"][number] {
  return {
    heading: "\u8bfe\u7a0b\u5185\u5bb9\u4e0e\u8bfe\u65f6\u5b89\u6392",
    level: 1,
    intro: force64
      ? "\u672c\u8bfe\u7a0b\u6309 64 \u8bfe\u65f6\u7edf\u7b79\u8bbe\u8ba1\uff0c\u91c7\u7528\u9636\u6bb5\u63a8\u8fdb\u65b9\u5f0f\uff0c\u4ece\u8f6f\u4ef6\u57fa\u7840\u3001\u5efa\u6a21\u4e0e\u6750\u8d28\u5230\u52a8\u753b\u89c4\u5f8b\u548c\u9879\u76ee\u4f5c\u54c1\u9010\u6b65\u5c55\u5f00\u3002"
      : "\u8bfe\u7a0b\u5185\u5bb9\u6309\u201c\u57fa\u7840\u8ba4\u77e5\u2014\u6280\u80fd\u8bad\u7ec3\u2014\u7efc\u5408\u9879\u76ee\u2014\u5c55\u793a\u8bc4\u4ef7\u201d\u7684\u903b\u8f91\u5c55\u5f00\uff0c\u53ef\u6839\u636e\u5b9e\u9645\u8bfe\u65f6\u8fdb\u884c\u5fae\u8c03\u3002",
    blocks: [
      {
        type: "timeline",
        headers: ["\u9636\u6bb5", "\u8bfe\u65f6\u5efa\u8bae", "\u9636\u6bb5\u76ee\u6807"],
        rows: stageRows
      }
    ]
  };
}

function groundedTeachingProcessSection(): WordDocumentPlan["sections"][number] {
  return {
    heading: "\u6559\u5b66\u8fc7\u7a0b\u8bbe\u8ba1",
    level: 1,
    intro:
      "\u6559\u5b66\u8fc7\u7a0b\u56f4\u7ed5\u4e09\u7ef4\u52a8\u753b\u8bfe\u7a0b\u7684\u5efa\u6a21\u3001\u6750\u8d28\u706f\u5149\u3001\u52a8\u753b\u89c4\u5f8b\u548c\u9879\u76ee\u4f5c\u54c1\u7ec4\u7ec7\uff0c\u901a\u8fc7\u793a\u8303\u3001\u7ec3\u4e60\u3001\u5c55\u793a\u548c\u53cd\u9988\u5f62\u6210\u8fde\u7eed\u5b66\u4e60\u95ed\u73af\u3002",
    blocks: [
      {
        type: "table",
        headers: ["\u6559\u5b66\u73af\u8282", "\u65f6\u95f4", "\u6559\u5e08\u6d3b\u52a8", "\u5b66\u751f\u6d3b\u52a8", "\u8bbe\u8ba1\u610f\u56fe"],
        rows: [
          [
            "\u8bfe\u7a0b\u5bfc\u5165",
            "10-15 \u5206\u949f",
            "\u5c55\u793a\u4e09\u7ef4\u52a8\u753b\u5b8c\u6574\u6848\u4f8b\uff0c\u5f15\u5bfc\u5b66\u751f\u89c2\u5bdf\u5efa\u6a21\u3001\u6750\u8d28\u3001\u706f\u5149\u548c\u52a8\u753b\u8282\u594f\u4e4b\u95f4\u7684\u5173\u7cfb\u3002",
            "\u8bb0\u5f55\u6848\u4f8b\u4e2d\u7684\u89d2\u8272\u52a8\u4f5c\u3001\u955c\u5934\u8fd0\u52a8\u548c\u753b\u9762\u6548\u679c\uff0c\u63d0\u51fa\u9700\u8981\u5b66\u4e60\u7684\u6280\u80fd\u95ee\u9898\u3002",
            "\u8ba9\u5b66\u751f\u5efa\u7acb\u8bfe\u7a0b\u603b\u4f53\u4efb\u52a1\u610f\u8bc6\uff0c\u660e\u786e\u4e09\u7ef4\u52a8\u753b\u5b66\u4e60\u4e0d\u53ea\u662f\u8f6f\u4ef6\u64cd\u4f5c\u3002"
          ],
          [
            "\u77e5\u8bc6\u8bb2\u89e3",
            "20-30 \u5206\u949f",
            "\u56f4\u7ed5\u4e09\u7ef4\u5efa\u6a21\u89c4\u8303\u3001\u5173\u952e\u5e27\u8bbe\u7f6e\u3001\u8fd0\u52a8\u89c4\u5f8b\u548c\u7f13\u5165\u7f13\u51fa\u8fdb\u884c\u5206\u6b65\u8bb2\u89e3\u3002",
            "\u5bf9\u7167\u793a\u4f8b\u6807\u6ce8\u5173\u952e\u5e27\u4f4d\u7f6e\u3001\u8fd0\u52a8\u8f68\u8ff9\u548c\u6324\u538b\u62c9\u4f38\u6548\u679c\u3002",
            "\u628a\u62bd\u8c61\u7684\u52a8\u753b\u89c4\u5f8b\u8f6c\u5316\u4e3a\u53ef\u89c2\u5bdf\u3001\u53ef\u64cd\u4f5c\u3001\u53ef\u8bc4\u4ef7\u7684\u5b66\u4e60\u8981\u70b9\u3002"
          ],
          [
            "\u793a\u8303\u64cd\u4f5c",
            "25-35 \u5206\u949f",
            "\u6f14\u793a\u4ece\u57fa\u7840\u6a21\u578b\u642d\u5efa\u5230\u52a8\u753b\u5173\u952e\u5e27\u8c03\u6574\u7684\u5b8c\u6574\u6d41\u7a0b\uff0c\u5f3a\u8c03\u547d\u540d\u3001\u5c42\u7ea7\u548c\u7248\u672c\u4fdd\u5b58\u3002",
            "\u8ddf\u968f\u793a\u8303\u5b8c\u6210\u4e00\u4e2a\u5c0f\u578b\u52a8\u753b\u7247\u6bb5\uff0c\u5e76\u8bb0\u5f55\u64cd\u4f5c\u4e2d\u51fa\u73b0\u7684\u8282\u594f\u6216\u753b\u9762\u95ee\u9898\u3002",
            "\u964d\u4f4e\u6280\u672f\u95e8\u69db\uff0c\u8ba9\u5b66\u751f\u83b7\u5f97\u53ef\u590d\u7528\u7684\u4e09\u7ef4\u52a8\u753b\u5236\u4f5c\u6d41\u7a0b\u3002"
          ],
          [
            "\u5b9e\u8bad\u4efb\u52a1",
            "40-60 \u5206\u949f",
            "\u5e03\u7f6e\u89d2\u8272\u6216\u573a\u666f\u52a8\u753b\u7ec3\u4e60\uff0c\u8981\u6c42\u4f5c\u54c1\u4f53\u73b0\u5173\u952e\u5e27\u8282\u594f\u3001\u8fd0\u52a8\u8f68\u8ff9\u548c\u753b\u9762\u8868\u73b0\u529b\u3002",
            "\u5206\u7ec4\u6216\u72ec\u7acb\u5b8c\u6210\u8bad\u7ec3\u4efb\u52a1\uff0c\u63d0\u4ea4\u6e90\u6587\u4ef6\u3001\u9884\u89c8\u89c6\u9891\u548c\u8fc7\u7a0b\u8bf4\u660e\u3002",
            "\u901a\u8fc7\u9879\u76ee\u4efb\u52a1\u628a\u77e5\u8bc6\u70b9\u8f6c\u5316\u4e3a\u53ef\u4ea4\u4ed8\u7684\u4f5c\u54c1\u6210\u679c\u3002"
          ],
          [
            "\u5c55\u793a\u8bc4\u4ef7",
            "15-20 \u5206\u949f",
            "\u7ec4\u7ec7\u4f5c\u54c1\u5c55\u793a\u3001\u540c\u4f34\u4e92\u8bc4\u548c\u6559\u5e08\u70b9\u8bc4\uff0c\u805a\u7126\u8fd0\u52a8\u89c4\u5f8b\u3001\u753b\u9762\u5b8c\u6210\u5ea6\u548c\u4fee\u6539\u65b9\u5411\u3002",
            "\u6839\u636e\u8bc4\u4ef7\u91cf\u8868\u8bf4\u660e\u4f5c\u54c1\u4f18\u52bf\u3001\u95ee\u9898\u548c\u4e0b\u4e00\u6b65\u4fee\u6539\u8ba1\u5212\u3002",
            "\u5f15\u5bfc\u5b66\u751f\u5c06\u53cd\u9988\u8f6c\u5316\u4e3a\u4f5c\u54c1\u4fee\u8ba2\u4e0e\u540e\u7eed\u5b66\u4e60\u4efb\u52a1\u3002"
          ]
        ]
      }
    ]
  };
}
