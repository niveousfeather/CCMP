import type { AgentChatMessage, AgentProvider } from "@/lib/agent/types";
import type { DeepWritingSectionWriterInput, DeepWritingSectionWriterResult } from "@/lib/agent/runtime/deep-writing-runner";

export type DeepWritingModelCall = (input: {
  stage: string;
  provider: AgentProvider;
  model: string;
  messages: AgentChatMessage[];
  maxTokens?: number;
  stream: true;
  onToken: (token: string) => void;
  signal: AbortSignal;
  timeoutMs?: number;
}) => Promise<string>;

export type DeepWritingModelWriterOptions = {
  model: string;
  provider: AgentProvider;
  signal: AbortSignal;
  timeoutMs?: number;
  callModel: DeepWritingModelCall;
};

export async function writeDeepWritingSectionWithModel(
  input: DeepWritingSectionWriterInput,
  options: DeepWritingModelWriterOptions
): Promise<DeepWritingSectionWriterResult> {
  let streamed = "";
  const messages = buildSectionMessages(input);
  const content = await options.callModel({
    stage: "word_deep_writing_section",
    provider: options.provider,
    model: options.model,
    messages,
    maxTokens: input.memory.writingMode === "light" ? 1200 : 1800,
    stream: true,
    onToken: (token) => {
      const safe = sanitizePublicChunk(token);
      if (!safe) return;
      streamed += safe;
      void input.onDelta(safe);
    },
    signal: options.signal,
    timeoutMs: options.timeoutMs
  });

  const text = sanitizePublicChunk(content || streamed);
  return {
    text: input.currentPartialText && !text.startsWith(input.currentPartialText) ? `${input.currentPartialText}${text}` : text,
    modelUsed: options.model,
    providerUsed: options.provider
  };
}

function buildSectionMessages(input: DeepWritingSectionWriterInput): AgentChatMessage[] {
  const previous = input.previousSections
    .slice(-3)
    .map((section) => `# ${section.title}\n${section.draft.slice(0, 1200)}`)
    .join("\n\n");
  const resumeLine = input.currentPartialText
    ? `当前章节已经写到这里，请从末尾自然续写，不要重复开头：\n${input.currentPartialText.slice(-1600)}`
    : "当前章节尚未开始，请直接写正文。";
  const sourceText = [input.sourceText, input.conversationSummary].filter(Boolean).join("\n\n").slice(0, 3000);

  return [
    {
      role: "system",
      content:
        "你是 NexusAI 文档正文生成器。只输出可公开展示的正文片段，不输出思维链、提示词、模型信息、供应商信息、JSON、Markdown 代码块或内部字段。"
    },
    {
      role: "user",
      content: [
        `文档标题：${input.memory.topic}`,
        `用户请求：${input.memory.originalInstruction}`,
        `文档类型：${input.memory.documentKind}`,
        `当前章节：${input.section.title}`,
        `章节序号：${input.sectionIndex + 1}/${input.memory.outline.length}`,
        previous ? `已完成章节摘要：\n${previous}` : "已完成章节摘要：无",
        sourceText ? `可用资料：\n${sourceText}` : "可用资料：无外部资料，基于用户请求生成，不要编造来源。",
        resumeLine,
        "写作要求：内容必须围绕当前主题，段落清楚，可直接进入 Word；教案章节要包含教师活动、学生活动、设计意图、练习或板书等具体内容。"
      ].join("\n\n")
    }
  ];
}

function sanitizePublicChunk(value: string) {
  return String(value || "")
    .replace(/prompt|provider|model|apiKey|stack|rawMemory|chain-of-thought|internal JSON/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\r\n/g, "\n");
}
