import { parseDocuments } from "@/lib/document-processing/parser";
import type { ExtractedDocument } from "@/lib/agent/types";
import type { ToolAdapter } from "@/lib/agent/runtime/tool-adapters/types";

const FILE_PARSE_FAILED_MESSAGE = "文件解析失败，请确认文件格式或重新上传。";

function toExtractedDocuments(files: Awaited<ReturnType<typeof parseDocuments>>["files"]): ExtractedDocument[] {
  return files
    .filter((file) => file.status === "parsed" && file.normalizedText)
    .map((file) => ({
      fileName: file.fileName,
      fileId: `document-processing-${file.fileName}`,
      content: file.normalizedText || file.text || "",
      extractedMarkdown: file.normalizedText || file.text || ""
    }));
}

function pickSummaryLines(text: string, limit: number) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 8)
    .slice(0, limit);
  if (lines.length) return lines;

  return normalized
    .split(/(?<=[。！？.!?])\s+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function buildLocalFileAnalysisAnswer(documents: ExtractedDocument[], userText: string) {
  const concise = /短一点|短些|简短|精简|一句话|brief|short/i.test(userText);
  const maxLinesPerFile = concise ? 3 : 6;
  const sections = documents.map((document) => {
    const lines = pickSummaryLines(document.content, maxLinesPerFile);
    const body = lines.length ? lines.map((line) => `- ${line.slice(0, 220)}`).join("\n") : `- ${document.content.slice(0, 220)}`;
    return `### ${document.fileName}\n${body}`;
  });

  return [
    `已解析 ${documents.length} 个文件。${concise ? "简短总结如下：" : "根据文件内容，摘要如下："}`,
    "",
    ...sections
  ].join("\n");
}

export const fileAnalysisAdapter: ToolAdapter = {
  id: "file-analysis-adapter",
  targetTool: "file-analysis",
  canHandle: (decision) => decision.targetTool === "file-analysis",
  validateInputs: (_decision, context) => {
    if (!context.files.length) {
      return { ok: false, missingInputs: ["file"], message: "请先上传需要分析的文件。" };
    }
    return { ok: true };
  },
  execute: async (_decision, context) => {
    const parsed = await parseDocuments({
      files: context.files,
      maxChars: 80_000
    });
    const extractedDocuments = toExtractedDocuments(parsed.files);
    if (!extractedDocuments.length) throw new Error("DOCUMENT_PARSE_FAILED");

    return {
      result: {
        content: buildLocalFileAnalysisAnswer(extractedDocuments, context.userText),
        modelUsed: "NexusAI Runtime V2",
        providerUsed: "xheai",
        routeReason: `runtime_v2:file-analysis-adapter:local_parse:${parsed.status}`,
        fallbackUsed: false,
        extractedDocuments,
        generatedFiles: [],
        pendingTask: null,
        defaultsApplied: ["document_processing_parser"]
      },
      runtimeMode: "adapter"
    };
  },
  getResultCard: () => null,
  failureToUserMessage: () => FILE_PARSE_FAILED_MESSAGE
};
