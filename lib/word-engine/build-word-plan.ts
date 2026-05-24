import type { WordPlan, WordRequest, WordSection, WordStylePreset } from "./types";

function compactLines(value: string) {
  return value
    .split(/\r?\n|[。；;]\s*/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function collectSourceLines(request: WordRequest) {
  const parts = [
    request.sourceText || "",
    request.conversationSummary || "",
    ...(request.sourceFiles || []).map((file) => file.text || "")
  ];
  return compactLines(parts.filter(Boolean).join("\n"));
}

function ensureSentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[。.!?！？]$/.test(trimmed) ? trimmed : `${trimmed}。`;
}

function sourceParagraphs(request: WordRequest) {
  const lines = collectSourceLines(request);
  if (lines.length) return lines.map(ensureSentence);
  return [
    `${request.title}可以从需求背景、内容安排、实施流程和效果评估四个方面展开。`,
    "正式使用前建议补充适用对象、时间安排、责任分工和验收标准。"
  ];
}

function section(heading: string, paragraphs: string[]): WordSection {
  return { heading, paragraphs: paragraphs.filter(Boolean) };
}

export function buildWordPlan(request: WordRequest): WordPlan {
  const stylePreset: WordStylePreset = request.stylePreset || "professional";
  const sourceLines = sourceParagraphs(request);
  const title = request.title.trim();

  const sections = [
    section("文档概述", [
      `${title}聚焦目标定位、主要内容和执行路径，便于后续形成正式材料。`,
      sourceLines[0] || `${title}需要围绕目标、对象、内容和执行方式展开。`
    ]),
    section("主要内容", sourceLines.slice(0, 5)),
    section("使用建议", [
      "建议先确认适用对象、实施周期和责任分工，再用于正式发布或内部流转。",
      "如需进一步完善，可补充数据、案例、时间表和验收标准。"
    ])
  ];

  return {
    title,
    subtitle: request.conversationSummary ? "基于当前对话内容整理" : undefined,
    sections,
    tables: [
      {
        title: "执行要点",
        headers: ["项目", "说明"],
        rows: [
          ["目标", `${title}的核心目标与预期结果`],
          ["内容", "围绕主要材料整理正式文档结构"],
          ["落地", "结合适用对象、时间安排和验收标准完善执行细节"]
        ]
      }
    ],
    metadata: {
      language: request.language || "zh-CN",
      stylePreset,
      sourceCount: collectSourceLines(request).length
    }
  };
}
