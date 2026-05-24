import { buildWorkbookBlueprintFromRequest, generateXlsxFile, modifyXlsxFile } from "@/lib/excel-engine";
import { parseDocuments } from "@/lib/document-processing/parser";
import type { GeneratedAgentFile } from "@/lib/agent/types";
import type { ConversationFileReference, ToolAdapter } from "@/lib/agent/runtime/tool-adapters/types";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DATA_REQUIRED_MESSAGE = "请提供要整理的数据，或上传文件后我再生成 Excel。";
const FILE_PARSE_FAILED_MESSAGE = "文件解析失败，请确认文件格式或重新上传。";
const EXCEL_FAILED_MESSAGE = "Excel 生成失败，请确认数据来源和操作要求后重试。";

function isSpreadsheetFile(file: File) {
  return /\.xlsx$/i.test(file.name) || /spreadsheetml\.sheet/i.test(file.type || "");
}

function isDocumentFile(file: File) {
  return /\.(txt|md|pdf|docx)$/i.test(file.name) || /text\/|pdf|wordprocessingml\.document/i.test(file.type || "");
}

function referencesCurrentFile(text: string) {
  return /这个文件|这份文件|上传文件|根据.*文件|file/i.test(text);
}

function modifiesSpreadsheet(text: string) {
  return /这个\s*excel|这份\s*excel|已有\s*excel|修改.*excel|excel.*增加|增加.*平均分|新增.*列|导出新版|xlsx/i.test(text);
}

function hasExplicitTemplateSchema(text: string) {
  return /模板|统计表|包含|字段|三张表|三个sheet|学生|成绩|销售|销售额|增长率/i.test(text);
}

function hasInlineData(text: string) {
  const source = text.split(/[:：]/).slice(1).join("：").trim();
  if (!source) return false;
  return /[;；\n]/.test(source) && /[,，、\t|]/.test(source);
}

function hasConversationFileText(files?: ConversationFileReference[]) {
  return Boolean(files?.some((file) => file.extractedText || file.textPreview));
}

function toConversationSources(files?: ConversationFileReference[]) {
  return (files || [])
    .filter((file) => file.extractedText || file.textPreview)
    .map((file) => ({
      fileName: file.fileName,
      mimeType: file.mimeType,
      extractedText: file.extractedText,
      textPreview: file.textPreview
    }));
}

function toGeneratedFile(result: Awaited<ReturnType<typeof generateXlsxFile>>): GeneratedAgentFile {
  return {
    fileName: result.fileName,
    mimeType: result.mimeType,
    sizeBytes: result.sizeBytes,
    objectKey: result.objectKey,
    url: result.downloadUrl
  };
}

async function parseUploadedDocuments(files: File[]) {
  const documentFiles = files.filter(isDocumentFile);
  if (!documentFiles.length) return [];
  const parsed = await parseDocuments({ files: documentFiles, maxChars: 80_000 });
  if (parsed.status !== "parsed" && parsed.status !== "partial") throw new Error("DOCUMENT_PARSE_FAILED");
  return parsed.files
    .filter((file) => file.status === "parsed" && file.normalizedText)
    .map((file) => ({
      fileName: file.fileName,
      mimeType: file.mimeType,
      extractedText: file.normalizedText || file.text || "",
      textPreview: (file.normalizedText || file.text || "").slice(0, 2_000)
    }));
}

export const excelAdapter: ToolAdapter = {
  id: "excel-adapter",
  targetTool: "excel",
  canHandle: (decision) => decision.targetTool === "excel",
  validateInputs: (decision, context) => {
    const text = context.userText;
    if (modifiesSpreadsheet(text) && !context.files.some(isSpreadsheetFile)) {
      return { ok: false, missingInputs: ["spreadsheet_file"], message: "请先上传需要修改的 Excel 文件。" };
    }
    if (referencesCurrentFile(text) && !context.files.length && !hasConversationFileText(context.conversationFiles)) {
      return { ok: false, missingInputs: ["file"], message: "请先上传需要整理的文件，然后我再生成 Excel。" };
    }
    if (decision.missingInputs.includes("data_source") && !hasInlineData(text) && !hasExplicitTemplateSchema(text)) {
      return { ok: false, missingInputs: ["data_source"], message: DATA_REQUIRED_MESSAGE };
    }
    if (!hasInlineData(text) && !hasExplicitTemplateSchema(text) && !context.files.length && !hasConversationFileText(context.conversationFiles)) {
      return { ok: false, missingInputs: ["data_source"], message: DATA_REQUIRED_MESSAGE };
    }
    return { ok: true };
  },
  execute: async (_decision, context) => {
    const spreadsheetFile = context.files.find(isSpreadsheetFile);
    const result = spreadsheetFile
      ? await modifyXlsxFile({
          request: context.userText,
          sourceFileName: spreadsheetFile.name,
          sourceBuffer: Buffer.from(await spreadsheetFile.arrayBuffer()),
          userId: context.userId
        })
      : await generateXlsxFile({
          blueprint: buildWorkbookBlueprintFromRequest({
            userText: context.userText,
            conversationFiles: [...toConversationSources(context.conversationFiles), ...(await parseUploadedDocuments(context.files))]
          }),
          userId: context.userId
        });

    const generatedFile = toGeneratedFile(result);
    return {
      result: {
        content: `已生成 Excel 文件：${result.fileName}`,
        modelUsed: "NexusAI Excel Engine",
        providerUsed: "xheai",
        routeReason: spreadsheetFile ? "runtime_v2:excel-adapter:modify_xlsx" : "runtime_v2:excel-adapter:generate_xlsx",
        fallbackUsed: false,
        extractedDocuments: [],
        generatedFiles: [generatedFile],
        pendingTask: null,
        defaultsApplied: ["excel_engine", result.metadata.stylePreset]
      },
      runtimeMode: "adapter",
      resultCard: {
        title: "Excel 文件",
        description: result.fileName,
        status: "completed",
        taskType: "excel",
        downloadUrl: result.downloadUrl,
        retryable: true
      }
    };
  },
  getResultCard: (result) => result.resultCard || null,
  failureToUserMessage: (error) => {
    if (error instanceof Error && error.message === "DOCUMENT_PARSE_FAILED") return FILE_PARSE_FAILED_MESSAGE;
    if (error instanceof Error && error.message === "EXCEL_DATA_REQUIRED") return DATA_REQUIRED_MESSAGE;
    return EXCEL_FAILED_MESSAGE;
  }
};
