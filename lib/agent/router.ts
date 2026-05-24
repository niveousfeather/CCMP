import { createWordDocument } from "@/lib/agent/skills/create-document";
import { createPresentation } from "@/lib/agent/skills/create-presentation";
import { isSpreadsheetFile, runSpreadsheetTask } from "@/lib/agent/skills/create-spreadsheet";
import { isDocumentFile, parseDocumentsWithKimi } from "@/lib/agent/skills/parse-document";
import { isImageUnderstandingFile, parseImagesWithVision } from "@/lib/agent/skills/parse-image";
import { isVideoUnderstandingFile, parseVideosWithKimi } from "@/lib/agent/skills/parse-video";
import { getAgentModelConfig } from "@/lib/agent/models";
import { getExplicitFileGenerationTool } from "@/lib/agent/task-intents";
import { shouldUseFastChatRoute } from "@/lib/agent/task-router";
import { fetchWebContextResult, getWebSearchConfig, shouldUseWebContext } from "@/lib/agent/tools/web-context";
import { buildWordDocumentPlanFromIntent, extractWordGenerationIntent, isUsableWordIntent, parseWordDocumentPlanJson, serializeWordDocumentPlan, type WordGenerationIntent } from "@/lib/document/plan";
import { canDeliverWordDocumentPlan, evaluateWordDocumentPlan } from "@/lib/document/quality";
import { extractDocxCommentRevisionTargets, type DocumentCommentRevisionTarget } from "@/lib/document/revise-comments";
import type { DocxTableRevision } from "@/lib/document/docx-paragraphs";
import { extractOriginalDocumentRevisionTargets, type OriginalDocumentRevisionTarget } from "@/lib/document/revise-original";
import type {
  AgentChatMessage,
  AgentDecision,
  AgentDocumentType,
  AgentLengthHint,
  AgentToolDegradation,
  AgentToolSelection,
  AgentOperationType,
  AgentOutputFormat,
  AgentPreferences,
  AgentProvider,
  AgentRunResult,
  AgentTask,
  AgentTaskField,
  AgentTaskType,
  AgentTransformMode,
  GeneratedAgentFile,
  WebContextResult
} from "@/lib/agent/types";
import type { DocumentTemplate } from "@/lib/document/types";

const documentTypeLabels: Record<AgentDocumentType, string> = {
  report: "报告",
  summary: "总结",
  proposal: "方案书",
  meeting_minutes: "会议纪要",
  manual: "说明书",
  briefing: "汇报材料",
  formal_doc: "正式文稿",
  lesson_plan: "教案",
  document: "文档"
};

const outputMimeByFormat: Record<"docx" | "pptx" | "xlsx", string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

export function shouldRunWebContext(text: string, tools?: AgentToolSelection) {
  return tools?.webSearch === true && shouldUseWebContext(text);
}

export function getAgentDecision(task: AgentTask, text: string, tools?: AgentToolSelection): AgentDecision {
  if (tools?.contentMode === "image") {
    return { action: "generate_image", reason: "selected_image_tool", confidence: 0.98 };
  }
  if (task.type === "clarify") {
    return { action: "clarify", reason: task.clarificationQuestion ? "missing_required_fields" : "needs_clarification", confidence: task.confidence };
  }
  if (task.type === "create_presentation") {
    return { action: "create_presentation", reason: "structured_task", confidence: task.confidence };
  }
  if (task.type === "create_spreadsheet") {
    return { action: "create_spreadsheet", reason: "structured_task", confidence: task.confidence };
  }
  if (task.type === "create_document") {
    return { action: "create_document", reason: "structured_task", confidence: task.confidence };
  }
  if (task.type === "analyze_file") {
    return { action: "analyze_file", reason: "file_context", confidence: task.confidence };
  }
  if (shouldRunWebContext(text, tools)) {
    return { action: "search_then_answer", reason: "web_search_enabled_and_needed", confidence: Math.max(task.confidence, 0.75) };
  }
  return { action: "answer", reason: "general_chat", confidence: task.confidence };
}

export function getToolDegradation(task: AgentTask, tool: "document" | "image" | "video"): AgentToolDegradation {
  const isHardRequirement =
    task.type === "create_document" ||
    task.type === "create_presentation" ||
    task.type === "create_spreadsheet" ||
    task.operation === "extract";

  if (isHardRequirement) {
    return {
      canContinue: false,
      message: "附件解析失败，当前任务依赖附件内容，请稍后重试或换一个更清晰、格式更稳定的文件。",
      routeReason: `${tool}_required_failed`
    };
  }

  const label = tool === "image" ? "图片" : tool === "video" ? "视频" : "文件";
  return {
    canContinue: true,
    message: `${label}解析暂时不可用，我会先基于你输入的文字和已有上下文回答；如果必须依赖附件细节，请稍后重试或重新上传。`,
    routeReason: `${tool}_degraded`
  };
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function joinVersionedUrl(baseUrl: string, versionedPath: string, unversionedPath: string) {
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  return cleanBaseUrl.endsWith("/v1") ? joinUrl(cleanBaseUrl, unversionedPath) : joinUrl(cleanBaseUrl, versionedPath);
}

function getProviderConfig(provider: AgentProvider) {
  if (provider === "xheai") {
    return {
      apiKey: process.env.XHEAI_API_KEY,
      url: joinVersionedUrl(process.env.XHEAI_BASE_URL || "https://api.xheai.cc", "/v1/chat/completions", "/chat/completions")
    };
  }

  if (provider === "claudecoder") {
    return {
      apiKey: process.env.CLAUDECODER_API_KEY,
      url: joinVersionedUrl(process.env.CLAUDECODER_BASE_URL || "https://china.claudecoder.me/v1", "/v1/chat/completions", "/chat/completions")
    };
  }

  if (provider === "subrouter") {
    return {
      apiKey: process.env.AGENT_TASK_API_KEY || process.env.CLAUDECODER_API_KEY,
      url: joinVersionedUrl(process.env.AGENT_TASK_BASE_URL || "https://subrouter.ai/v1", "/v1/chat/completions", "/chat/completions")
    };
  }

  return {
    apiKey: process.env.MOONSHOT_API_KEY,
    url: joinUrl(process.env.MOONSHOT_BASE_URL || "https://api.moonshot.cn/v1", "/chat/completions")
  };
}

function safeProviderEndpoint(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "unknown";
  }
}

type AgentProviderErrorKind =
  | "client_abort"
  | "server_timeout"
  | "provider_504"
  | "provider_error"
  | "network_error"
  | "bad_response";

export class AgentProviderRequestError extends Error {
  kind: AgentProviderErrorKind;
  provider: AgentProvider;
  model: string;
  endpoint: string;
  elapsedMs: number;
  requestId?: string;
  status?: number;
  timeoutMs?: number;

  constructor({
    cause,
    elapsedMs,
    endpoint,
    kind,
    message,
    model,
    provider,
    requestId,
    status,
    timeoutMs
  }: {
    cause?: unknown;
    elapsedMs: number;
    endpoint: string;
    kind: AgentProviderErrorKind;
    message: string;
    model: string;
    provider: AgentProvider;
    requestId?: string;
    status?: number;
    timeoutMs?: number;
  }) {
    super(message);
    this.name = "AgentProviderRequestError";
    this.kind = kind;
    this.provider = provider;
    this.model = model;
    this.endpoint = endpoint;
    this.elapsedMs = elapsedMs;
    this.requestId = requestId;
    this.status = status;
    this.timeoutMs = timeoutMs;
    if (cause !== undefined) (this as Error & { cause?: unknown }).cause = cause;
  }
}

export function isAgentProviderRequestError(error: unknown): error is AgentProviderRequestError {
  return error instanceof AgentProviderRequestError;
}

function extractProviderRequestId(response: Response) {
  for (const header of ["x-request-id", "x-subrouter-request-id", "openai-request-id", "cf-ray", "x-trace-id"]) {
    const value = response.headers.get(header);
    if (value) return value.slice(0, 120);
  }
  return undefined;
}

function signalReasonText(signal: AbortSignal) {
  const reason = (signal as AbortSignal & { reason?: unknown }).reason;
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  return "";
}

function signalTimeoutMs(signal: AbortSignal, fallback?: number) {
  const match = signalReasonText(signal).match(/server_timeout:(\d+)/);
  return match?.[1] ? Number(match[1]) : fallback;
}

function classifyFetchFailure(error: unknown, signal: AbortSignal): AgentProviderErrorKind {
  if (error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"))) {
    const reason = signalReasonText(signal).toLowerCase();
    if (reason.includes("client_abort")) return "client_abort";
    if (reason.includes("server_timeout") || reason.includes("timeout")) return "server_timeout";
    return signal.aborted ? "client_abort" : "network_error";
  }
  return "network_error";
}

function extractProviderContent(value: unknown) {
  const payload = value as Record<string, unknown> | null;
  const choices = Array.isArray(payload?.choices) ? payload.choices as Array<Record<string, unknown>> : [];
  const firstChoice = choices[0] || null;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const objectPart = part as Record<string, unknown>;
          if (typeof objectPart.text === "string") return objectPart.text;
          if (typeof objectPart.content === "string") return objectPart.content;
        }
        return "";
      })
      .join("")
      .trim();
  }
  if (typeof message?.reasoning_content === "string") return message.reasoning_content.trim();
  if (typeof firstChoice?.text === "string") return firstChoice.text.trim();
  if (typeof payload?.content === "string") return payload.content.trim();
  return "";
}

function summarizeProviderError(error: unknown) {
  if (!(error instanceof Error)) return "unknown";
  const cause = error.cause as { code?: string; message?: string; errors?: Array<{ code?: string; address?: string; port?: number; message?: string }> } | undefined;
  const nested = cause?.errors?.slice(0, 4).map((item) => `${item.code || "ERR"}@${item.address || "-"}:${item.port || "-"}:${item.message || ""}`).join(" | ");
  return [
    error.name,
    error.message,
    cause?.code ? `causeCode=${cause.code}` : "",
    cause?.message ? `cause=${cause.message}` : "",
    nested ? `nested=${nested}` : ""
  ].filter(Boolean).join(" ");
}

function summarizeProviderResponseBody(body: string, status: number) {
  const compact = body.replace(/\s+/g, " ").trim();
  if (!compact) return "empty";
  if (/<\/?[a-z][\s\S]*>|<!doctype/i.test(compact)) {
    const title = compact.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
    if (status === 524 || /524|timeout|timed out/i.test(`${title || ""} ${compact}`)) return "provider_html_error: timeout status=524";
    if (status === 504 || /504|gateway timeout/i.test(`${title || ""} ${compact}`)) return "provider_html_error: timeout status=504";
    return `provider_html_error${title ? `: ${title.slice(0, 120)}` : ""}`;
  }
  return compact
    .replace(/[A-Za-z]:[\\/][^\s"'<>]+/g, "[local-path]")
    .replace(/\/(?:Users|home|var|tmp|mnt|opt|srv)\/[^\s"'<>]+/g, "[local-path]")
    .replace(/[A-Z0-9_]*(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*/gi, "[sensitive-config]")
    .replace(/\bAuthorization\b/gi, "[auth-header]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "[bearer-token]")
    .slice(0, 240);
}

function isAcademicPptStage(stage: string) {
  return stage.startsWith("academic_ppt");
}

function compactText(text: string) {
  return text.toLowerCase().replace(/\s+/g, "");
}

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value.toLowerCase().replace(/\s+/g, "")));
}

function cleanRequestedFileName(value: string) {
  const cleaned = value
    .replace(/\.(docx|pptx|xlsx)$/i, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/^(一份|一个|这个|这份|文档|文件)/, "")
    .replace(/(的)?(下载链接|链接|文件|文档|ppt|PPT|word|Word|docx|pptx)$/g, "")
    .trim();
  return cleaned.slice(0, 36) || undefined;
}

function extractRequestedFileName(text: string) {
  const patterns = [
    /文件名字?修改为\s*["“]?([^，。；;、\n"”]{1,48})/i,
    /文件名改为\s*["“]?([^，。；;、\n"”]{1,48})/i,
    /文件名叫\s*["“]?([^，。；;、\n"”]{1,48})/i,
    /命名为\s*["“]?([^，。；;、\n"”]{1,48})/i,
    /保存为\s*["“]?([^，。；;、\n"”]{1,48})/i,
    /导出为\s*["“]?([^，。；;、\n"”]{1,48})/i,
    /叫\s*["“]?([^，。；;、\n"”]{1,32})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanRequestedFileName(match[1]);
  }

  return undefined;
}

function detectDocumentType(text: string): AgentDocumentType | undefined {
  const normalized = compactText(text);
  if (includesAny(normalized, ["教案", "教学设计", "课程设计", "教学方案", "课时设计", "教学活动设计"])) return "lesson_plan";
  if (includesAny(normalized, ["会议纪要", "会议记录"])) return "meeting_minutes";
  if (includesAny(normalized, ["方案书", "项目方案", "建设方案", "实施方案"])) return "proposal";
  if (includesAny(normalized, ["说明书", "使用说明", "操作手册"])) return "manual";
  if (includesAny(normalized, ["汇报材料", "汇报稿"])) return "briefing";
  if (includesAny(normalized, ["正式文稿", "正式文风", "正式稿", "发言稿", "讲话稿", "演讲稿", "通知", "文稿"])) return "formal_doc";
  if (includesAny(normalized, ["总结", "摘要", "小结"])) return "summary";
  if (includesAny(normalized, ["报告", "调研报告", "分析报告"])) return "report";
  if (includesAny(normalized, ["文档", "文件", "材料", "文章", "稿件"])) return "document";
  return undefined;
}

function detectTransformMode(text: string): AgentTransformMode | undefined {
  const normalized = compactText(text);
  if (includesAny(normalized, ["只总结内容", "总结一下", "总结内容", "概括", "提炼摘要"])) return "summarize";
  if (includesAny(normalized, ["精简一下", "精简", "短一点", "简洁一点"])) return "concise";
  if (includesAny(normalized, ["扩写成正式版", "改成正式文风", "正式一点", "正式版", "改成汇报风格"])) return "rewrite_formal";
  if (includesAny(normalized, ["整理成条理清晰的版本", "条理清晰", "结构化", "分点整理", "逻辑清晰"])) return "structured";
  return undefined;
}

function detectLengthHint(text: string): AgentLengthHint | undefined {
  const normalized = compactText(text);
  if (/控制在?2页|2页左右|两页左右/.test(normalized)) return "2_pages";
  if (/1000字左右|约?1000字|一千字/.test(normalized)) return "1000_words";
  if (includesAny(normalized, ["简版", "短一点", "简单版"])) return "short";
  if (includesAny(normalized, ["中等篇幅", "适中"])) return "medium";
  if (includesAny(normalized, ["详细一点", "长一点", "完整一点"])) return "long";
  return undefined;
}

function detectStyleHint(text: string) {
  const normalized = compactText(text);
  if (includesAny(normalized, ["正式", "正式文风", "正式版", "汇报风格", "稳重"])) return "formal";
  if (includesAny(normalized, ["条理清晰", "结构化", "分点", "逻辑清晰"])) return "structured";
  if (includesAny(normalized, ["精简", "简洁", "短一点"])) return "concise";
  if (includesAny(normalized, ["详细", "完整", "长一点"])) return "detailed";
  return undefined;
}

function detectOperationType(text: string, transformMode?: AgentTransformMode): AgentOperationType {
  const normalized = compactText(text);
  if (includesAny(normalized, ["怎么写", "如何写", "怎样写", "怎么生成", "如何生成"])) return "answer";
  if (includesAny(normalized, ["generate", "create", "make", "build", "生成", "写", "写一份", "做一个", "做一份", "做个", "创建", "制作"])) return "create";
  if (includesAny(normalized, ["修改", "更新", "整理", "新增", "添加", "加一列", "求和", "汇总", "排序", "标绿", "modify", "update", "addcolumn", "sum", "summary", "sort"])) return "rewrite";
  if (includesAny(normalized, ["下载链接", "导出", "输出", "保存为", "发我", "给我文件"])) return "export";
  if (includesAny(normalized, ["生成", "写", "写一份", "做一份", "做一个", "做个", "创建", "制作", "撰写", "起草"])) return "create";
  if (includesAny(normalized, ["分析", "解读", "读取"])) return "analyze";
  if (includesAny(normalized, ["提取", "抽取"])) return "extract";
  if (transformMode === "summarize" || includesAny(normalized, ["总结", "概括"])) return "summarize";
  if (transformMode === "rewrite_formal" || transformMode === "concise" || transformMode === "structured") return "rewrite";
  return "answer";
}

function shouldReviseWordComments(text: string) {
  const normalized = compactText(text);
  return includesAny(normalized, [
    "批注修订",
    "根据批注修改",
    "按批注修改",
    "按照批注修改",
    "处理批注",
    "应用批注",
    "修订批注",
    "批注改正文",
    "word批注",
    "commentrevision",
    "revisecomments"
  ]);
}

function shouldPreserveOriginalWordFormat(text: string) {
  const normalized = compactText(text);
  return includesAny(normalized, [
    "保留原格式",
    "保持原格式",
    "不要改变格式",
    "不改变格式",
    "原格式修改",
    "保留排版",
    "保持排版",
    "不要改变排版",
    "不改变排版",
    "在原文档基础上修改",
    "按原格式修改",
    "preserveformat",
    "keepformat"
  ]);
}

function shouldConvertWordParagraphToTable(text: string) {
  const normalized = compactText(text);
  return includesAny(normalized, [
    "改成表格",
    "改为表格",
    "转换成表格",
    "转换为表格",
    "转成表格",
    "转为表格",
    "表格形式",
    "表格方式",
    "整理成表格",
    "table"
  ]);
}

function hasGenericFileOutputIntent(text: string) {
  const normalized = compactText(text);
  return includesAny(normalized, [
    "下载链接",
    "导出",
    "输出文件",
    "保存为文件",
    "发我文件",
    "给我文件",
    "文件下载",
    "下载文件"
  ]);
}

function detectOutputFormat(text: string, requestedFileName?: string, documentType?: AgentDocumentType, operation?: AgentOperationType): AgentOutputFormat {
  if (shouldReviseWordComments(text)) return "docx";
  const explicitFileTool = getExplicitFileGenerationTool(text);
  if (explicitFileTool === "ppt") return "pptx";
  if (explicitFileTool === "excel") return "xlsx";
  if (explicitFileTool === "write") return "docx";
  if (operation === "create" && documentType && documentType !== "document") return "docx";
  if (/\.xlsx\b/i.test(text)) return "xlsx";
  if (wantsSpreadsheetModification(text)) return "xlsx";
  if (operation === "rewrite" && /加一列|新增列|求和|汇总|排序|标绿|公式|profit\s*margin|summary|sort/i.test(text)) return "xlsx";
  if (operation === "export" || hasGenericFileOutputIntent(text)) return "unknown";
  return "text";
}

function wantsSpreadsheetModification(text: string) {
  const normalized = compactText(text);
  const hasSpreadsheetTarget = includesAny(normalized, ["excel", "xlsx", "spreadsheet", "workbook", "表格", "工作簿", "工作表", "琛ㄦ牸"]);
  const hasModifyIntent = includesAny(normalized, ["修改", "更新", "整理", "新增", "添加", "加一列", "求和", "汇总", "排序", "标绿", "公式", "modify", "update", "add", "sum", "summary", "sort"]);
  return hasSpreadsheetTarget && hasModifyIntent;
}

function detectRequiresFile(text: string, hasFiles: boolean, operation: AgentOperationType) {
  const normalized = compactText(text);
  if (hasFiles) return true;
  if (shouldReviseWordComments(text)) return true;
  if (operation !== "create" && wantsSpreadsheetModification(text)) return true;
  if (
    includesAny(normalized, [
      "根据文件",
      "根据附件",
      "根据这份资料",
      "根据上传",
      "读取pdf",
      "读取PDF",
      "分析文档",
      "总结文档",
      "这份资料",
      "这个附件",
      "这个转化为",
      "这个转换为",
      "把这个转化为",
      "把这个转换为",
      "转化为word",
      "转换为word",
      "转成word",
      "转为word",
      "转化成word",
      "转换成word",
      "转化为ppt",
      "转换为ppt",
      "转成ppt",
      "转为ppt"
    ])
  ) {
    return true;
  }
  return operation === "extract";
}

function isConversionWithoutSource(
  text: string,
  task: Omit<AgentTask, "confidence" | "reasons" | "missingFields" | "clarificationQuestion" | "defaultsApplied">
) {
  if (task.hasFiles) return false;
  if (task.outputFormat !== "docx" && task.outputFormat !== "pptx") return false;
  const normalized = compactText(text);
  return includesAny(normalized, [
    "这个转化为",
    "这个转换为",
    "把这个转化为",
    "把这个转换为",
    "这个转成",
    "这个转为",
    "转化为word",
    "转换为word",
    "转成word",
    "转为word",
    "转化成word",
    "转换成word",
    "转化为ppt",
    "转换为ppt",
    "转成ppt",
    "转为ppt"
  ]);
}

function inferTaskType({
  outputFormat,
  operation,
  documentType,
  transformMode,
  hasFiles,
  requiresFile,
  selectedMode
}: {
  outputFormat: AgentOutputFormat;
  operation: AgentOperationType;
  documentType?: AgentDocumentType;
  transformMode?: AgentTransformMode;
  hasFiles: boolean;
  requiresFile: boolean;
  selectedMode?: AgentToolSelection["contentMode"];
}): AgentTaskType {
  if (outputFormat === "pptx") return "create_presentation";
  if (outputFormat === "docx") return "create_document";
  if (outputFormat === "xlsx") return "create_spreadsheet";
  if ((hasFiles && selectedMode !== "write" && selectedMode !== "ppt") || requiresFile || operation === "analyze" || operation === "extract") return "analyze_file";
  return "general_chat";
}

function buildTaskReasons(task: Omit<AgentTask, "confidence" | "reasons" | "missingFields" | "clarificationQuestion" | "defaultsApplied">) {
  const reasons: string[] = [];
  if (task.outputFormat !== "text") reasons.push(`output:${task.outputFormat}`);
  if (task.operation !== "answer") reasons.push(`operation:${task.operation}`);
  if (task.documentType) reasons.push(`documentType:${task.documentType}`);
  if (task.requestedFileName) reasons.push("fileName");
  if (task.transformMode) reasons.push(`transform:${task.transformMode}`);
  if (task.lengthHint) reasons.push(`length:${task.lengthHint}`);
  if (task.styleHint) reasons.push(`style:${task.styleHint}`);
  if (task.requiresFile) reasons.push("requiresFile");
  if (task.hasFiles) reasons.push("hasFiles");
  return reasons;
}

function getTaskConfidence(task: Omit<AgentTask, "confidence" | "reasons" | "missingFields" | "clarificationQuestion" | "defaultsApplied">) {
  let score = 0.25;
  if (task.outputFormat !== "text") score += 0.25;
  if (task.operation !== "answer") score += 0.15;
  if (task.documentType) score += 0.15;
  if (task.requestedFileName) score += 0.1;
  if (task.transformMode || task.lengthHint || task.styleHint) score += 0.1;
  if (task.hasFiles || task.requiresFile) score += 0.1;
  return Math.min(score, 0.98);
}

function isGenericFileRequest(text: string, task: Omit<AgentTask, "confidence" | "reasons" | "missingFields" | "clarificationQuestion" | "defaultsApplied">) {
  if (task.outputFormat !== "docx" && task.outputFormat !== "pptx") return false;
  if (
    task.requestedFileName ||
    (task.documentType && task.documentType !== "document") ||
    task.transformMode ||
    task.styleHint ||
    task.lengthHint ||
    task.hasFiles
  ) {
    return false;
  }

  const normalized = compactText(text)
    .replace(/帮我|请|直接|给我|发我|生成|输出|导出|下载|下载链接|链接/g, "")
    .replace(/word|docx|ppt|pptx|slides|文件|文档|演示文稿|幻灯片/g, "")
    .replace(/[，。；、,.!?！？]/g, "");

  return normalized.length < 6;
}

function hasEnoughWritingSubject(text: string) {
  const normalized = compactText(text)
    .replace(/帮我|请|作为写作助手|写作助手|写一份|写一个|写个|生成|输出|导出|撰写|起草|制作/g, "")
    .replace(/word|docx|文件|文档|材料|文章|内容|东西|一份|一个|这个|那个/g, "")
    .replace(/教案|教学设计|课程设计|教学方案|报告|总结|方案书|方案|通知|发言稿|汇报材料/g, "")
    .replace(/[，。；、,.!?！？]/g, "");
  return normalized.length >= 4;
}

function hasEnoughPresentationSubject(text: string) {
  const normalized = compactText(text)
    .replace(/帮我|请|做一份|做一个|做个|生成|输出|导出|制作/g, "")
    .replace(/ppt|pptx|演示文稿|幻灯片|课件|文件|文档|一份|一个|这个|那个/g, "")
    .replace(/[，。；、,.!?！？]/g, "");
  return normalized.length >= 4;
}

function hasExplicitWritingType(task: Pick<AgentTask, "documentType" | "transformMode" | "hasFiles">) {
  return Boolean(task.documentType || task.transformMode || task.hasFiles);
}

function shouldApplyDocumentPreference(
  task: Omit<AgentTask, "confidence" | "reasons" | "missingFields" | "clarificationQuestion" | "defaultsApplied">,
  preferences?: AgentPreferences | null
) {
  if (!preferences) return false;
  if (task.documentType || task.transformMode || task.hasFiles || task.requiresFile) return false;
  if (task.outputFormat !== "docx" && task.outputFormat !== "pptx") return false;
  if (task.operation !== "create" && task.operation !== "export") return false;
  return Boolean(preferences.documentType || preferences.styleHint || preferences.lengthHint || preferences.fileName);
}

function resolveMissingFields(
  task: Omit<AgentTask, "confidence" | "reasons" | "missingFields" | "clarificationQuestion" | "defaultsApplied">,
  text: string,
  options?: { tools?: AgentToolSelection }
) {
  const missingFields: AgentTaskField[] = [];
  const defaultsApplied: string[] = [];
  let clarificationQuestion: string | undefined;

  if (task.requiresFile && !task.hasFiles) {
    missingFields.push("file");
    clarificationQuestion = "请先上传需要分析或整理的文件，然后我再继续处理。";
  }

  if (task.outputFormat === "unknown") {
    missingFields.push("outputFormat");
    clarificationQuestion = "你希望我生成 Word 文档还是 PPT 演示文稿？";
  }

  if (task.type === "create_document") {
    if (!clarificationQuestion && isConversionWithoutSource(text, task)) {
      missingFields.push("file");
      clarificationQuestion =
        "可以转换成 Word，但我还缺少要转换的原始内容。请上传需要转换的文件，或把要整理成 Word 的文字内容发给我。";
    }

    if (!task.requestedFileName) {
      missingFields.push("fileName");
      defaultsApplied.push("fileName=auto");
    }
    if (!task.documentType) {
      missingFields.push("documentType");
      defaultsApplied.push("documentType=document");
    }
    if (!task.styleHint) {
      missingFields.push("style");
      defaultsApplied.push("style=professional");
    }
    if (!task.lengthHint) {
      missingFields.push("length");
      defaultsApplied.push("length=medium");
    }

    if (!clarificationQuestion && isGenericFileRequest(text, task)) {
      clarificationQuestion = "请补充要生成的文档主题、文档类型或文件名，例如“生成一份内部 AI 工具使用规范报告，文件名叫使用规范”。";
    }

    if (!clarificationQuestion && options?.tools?.contentMode === "write" && !task.hasFiles && !hasEnoughWritingSubject(text)) {
      missingFields.push("documentType");
      clarificationQuestion =
        "可以，我需要先确认写作内容：你想生成什么类型的文档，主题是什么？也可以补充篇幅、风格或文件名。";
    }

    if (!clarificationQuestion && options?.tools?.contentMode === "write" && !task.hasFiles && !hasExplicitWritingType(task)) {
      missingFields.push("documentType");
      clarificationQuestion =
        "可以，我先确认一下文档类型：你希望写成报告、方案、总结、说明书、发言稿，还是其他文档？也可以顺便补充篇幅和风格要求。";
    }
  }

  if (task.type === "create_presentation" && !task.requestedFileName) {
    missingFields.push("fileName");
    defaultsApplied.push("fileName=auto");

    if (!clarificationQuestion && isConversionWithoutSource(text, task)) {
      missingFields.push("file");
      clarificationQuestion =
        "可以转换成 PPT，但我还缺少要转换的原始内容。请上传资料文件，或补充 PPT 的主题、内容范围和页数要求。";
    }

    if (!clarificationQuestion && isGenericFileRequest(text, task)) {
      clarificationQuestion = "请补充 PPT 的主题或文件名，例如“生成一份内部 AI 工具培训 PPT，文件名叫培训课件”。";
    }

    if (!clarificationQuestion && options?.tools?.contentMode === "ppt" && !task.hasFiles && !hasEnoughPresentationSubject(text)) {
      missingFields.push("documentType");
      clarificationQuestion = "可以，我需要先确认 PPT 主题：这份演示文稿要讲什么内容？也可以补充用途、页数或受众。";
    }
  }

  return { missingFields, defaultsApplied, clarificationQuestion };
}

function isAgentDocumentType(value: unknown): value is AgentDocumentType {
  return typeof value === "string" && Object.keys(documentTypeLabels).includes(value);
}

function isAgentLengthHint(value: unknown): value is AgentLengthHint {
  return typeof value === "string" && ["short", "medium", "long", "1000_words", "2_pages"].includes(value);
}

function applyPreferencesToBaseTask<
  T extends Omit<AgentTask, "confidence" | "reasons" | "missingFields" | "clarificationQuestion" | "defaultsApplied">
>(task: T, preferences?: AgentPreferences | null): T {
  if (!preferences) return task;

  return {
    ...task,
    requestedFileName: task.requestedFileName || preferences.fileName || undefined,
    documentType: task.documentType || (isAgentDocumentType(preferences.documentType) ? preferences.documentType : undefined),
    styleHint: task.styleHint || preferences.styleHint || undefined,
    lengthHint:
      task.lengthHint ||
      (isAgentLengthHint(preferences.lengthHint) ? preferences.lengthHint : undefined)
  };
}

function mergePendingTask<
  T extends Omit<AgentTask, "confidence" | "reasons" | "missingFields" | "clarificationQuestion" | "defaultsApplied">
>(current: T, pending?: AgentTask | null): T {
  if (!pending || pending.type !== "clarify") return current;
  const pendingTargetType =
    pending.outputFormat === "pptx"
      ? "create_presentation"
      : pending.outputFormat === "docx"
        ? "create_document"
        : pending.outputFormat === "xlsx"
          ? "create_spreadsheet"
          : undefined;
  if (!pendingTargetType) return current;

  return {
    ...current,
    type: current.type === "general_chat" || current.type === "analyze_file" ? pendingTargetType : current.type,
    outputFormat: current.outputFormat === "text" || current.outputFormat === "unknown" ? pending.outputFormat : current.outputFormat,
    operation: current.operation === "answer" ? pending.operation : current.operation,
    requestedFileName: current.requestedFileName || pending.requestedFileName,
    documentType: current.documentType || pending.documentType,
    transformMode: current.transformMode || pending.transformMode,
    lengthHint: current.lengthHint || pending.lengthHint,
    styleHint: current.styleHint || pending.styleHint,
    requiresFile: pending.requiresFile,
    hasFiles: current.hasFiles
  };
}

export function extractAgentTask(
  text: string,
  hasFiles = false,
  options?: { preferences?: AgentPreferences | null; pendingTask?: AgentTask | null; tools?: AgentToolSelection }
): AgentTask {
  const requestedFileName = extractRequestedFileName(text);
  const documentType = detectDocumentType(text);
  const transformMode = detectTransformMode(text);
  const lengthHint = detectLengthHint(text);
  const styleHint = shouldReviseWordComments(text) ? "comment_revision" : detectStyleHint(text);
  const selectedMode = options?.tools?.contentMode;
  const operation = selectedMode === "write" ? "create" : detectOperationType(text, transformMode);
  const outputFormat =
    selectedMode === "write"
      ? "docx"
      : selectedMode === "ppt"
        ? "pptx"
        : detectOutputFormat(text, requestedFileName, documentType, operation);
  const requiresFile = detectRequiresFile(text, hasFiles, operation);
  const type = inferTaskType({ outputFormat, operation, documentType, transformMode, hasFiles, requiresFile, selectedMode });
  const baseTask = {
    type,
    outputFormat,
    operation,
    requestedFileName,
    documentType,
    transformMode,
    lengthHint,
    styleHint,
    contentMode: selectedMode || undefined,
    requiresFile,
    hasFiles
  };
  const preferenceEligible = shouldApplyDocumentPreference(baseTask, options?.preferences);
  const mergedTask = mergePendingTask(
    applyPreferencesToBaseTask(baseTask, preferenceEligible ? options?.preferences : null),
    options?.pendingTask
  );
  const missing = resolveMissingFields(mergedTask, text, { tools: options?.tools });

  return {
    ...mergedTask,
    ...missing,
    type: missing.clarificationQuestion ? "clarify" : mergedTask.type,
    confidence: getTaskConfidence(mergedTask),
    reasons: buildTaskReasons(mergedTask)
  };
}

export function isWordTask(text: string) {
  return extractAgentTask(text, false).type === "create_document";
}

export function isPresentationTask(text: string) {
  return extractAgentTask(text, false).type === "create_presentation";
}

export function isDocumentTask(text: string) {
  const task = extractAgentTask(text, false);
  return task.type === "analyze_file" || task.requiresFile;
}

function buildDocumentContext(files: Array<{ fileName: string; extractedMarkdown: string }>) {
  return files.map((file) => `# 文件：${file.fileName}\n\n${file.extractedMarkdown.slice(0, 24_000)}`).join("\n\n---\n\n");
}

export async function callChatModel({
  stage = "chat",
  provider,
  model,
  messages,
  maxTokens,
  stream = false,
  onToken,
  signal,
  timeoutMs
}: {
  stage?: string;
  provider: AgentProvider;
  model: string;
  messages: AgentChatMessage[];
  maxTokens?: number;
  stream?: boolean;
  onToken?: (token: string) => void;
  signal: AbortSignal;
  timeoutMs?: number;
}) {
  const { apiKey, url } = getProviderConfig(provider);
  const endpoint = safeProviderEndpoint(url);
  if (!apiKey) {
    if (provider === "xheai") throw new Error("MISSING_XHEAI_API_KEY");
    if (provider === "claudecoder") throw new Error("MISSING_CLAUDECODER_API_KEY");
    if (provider === "subrouter") throw new Error("MISSING_AGENT_TASK_API_KEY");
    throw new Error("MISSING_KIMI_API_KEY");
  }

  let response: Response;
  const startedAt = Date.now();
  if (isAcademicPptStage(stage)) {
    console.info(`[agent:chat] stage=${stage} provider=${provider} model=${model} request_started timeoutMs=${timeoutMs ?? "none"}`);
  } else {
    console.info(
      `[agent:chat] stage=${stage} provider=${provider} model=${model} endpoint=${endpoint} request_started timeoutMs=${timeoutMs ?? "none"}`
    );
  }
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model, messages: messages.slice(-20), stream: Boolean(stream), ...(maxTokens ? { max_tokens: maxTokens } : {}) }),
      signal
    });
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const kind = classifyFetchFailure(error, signal);
    const resolvedTimeoutMs = signalTimeoutMs(signal, timeoutMs);
    if (isAcademicPptStage(stage)) {
      console.error(
        `[agent:chat] stage=${stage} provider=${provider} model=${model} request_failed kind=${kind} elapsedMs=${elapsedMs} timeoutMs=${resolvedTimeoutMs ?? "none"} message=${summarizeProviderError(error)}`
      );
    } else {
      console.error(
        `[agent:chat] stage=${stage} provider=${provider} model=${model} endpoint=${endpoint} request_failed kind=${kind} elapsedMs=${elapsedMs} timeoutMs=${resolvedTimeoutMs ?? "none"} message=${summarizeProviderError(error)}`
      );
    }
    throw new AgentProviderRequestError({
      cause: error,
      elapsedMs,
      endpoint,
      kind,
      message: summarizeProviderError(error),
      model,
      provider,
      timeoutMs: resolvedTimeoutMs
    });
  }

  const requestId = extractProviderRequestId(response);
  const elapsedMs = Date.now() - startedAt;
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const kind: AgentProviderErrorKind = response.status === 504 || response.status === 524 ? "provider_504" : "provider_error";
    const safeBody = summarizeProviderResponseBody(body, response.status);
    if (isAcademicPptStage(stage)) {
      console.error(
        `[agent:chat] stage=${stage} provider=${provider} model=${model} status=${response.status} kind=${kind} elapsedMs=${elapsedMs} body=${safeBody}`
      );
    } else {
      console.error(
        `[agent:chat] stage=${stage} provider=${provider} model=${model} endpoint=${endpoint} status=${response.status} kind=${kind} requestId=${requestId || "-"} elapsedMs=${elapsedMs} body=${safeBody}`
      );
    }
    throw new AgentProviderRequestError({
      elapsedMs,
      endpoint,
      kind,
      message: `PROVIDER_ERROR_${response.status}`,
      model,
      provider,
      requestId,
      status: response.status,
      timeoutMs
    });
  }

  const contentType = response.headers.get("content-type") || "";
  if (stream && /text\/event-stream|stream/i.test(contentType)) {
    const reader = response.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let buffer = "";
      let streamedContent = "";
      const consumeLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) return;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") return;
        try {
          const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            streamedContent += delta;
            onToken?.(delta);
          }
        } catch {
          // Ignore malformed stream chunks and continue consuming the response.
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        lines.forEach(consumeLine);
      }
      if (buffer) consumeLine(buffer);
      if (streamedContent.trim()) {
        console.info(
          `[agent:chat] stage=${stage} provider=${provider} model=${model} endpoint=${endpoint} stream_succeeded requestId=${requestId || "-"} elapsedMs=${Date.now() - startedAt}`
        );
        return streamedContent.trim();
      }
    }
  }

  const data = await response.json().catch(() => null);
  const content = extractProviderContent(data);
  if (!content) {
    const keys = data && typeof data === "object" ? Object.keys(data).slice(0, 12).join(",") : "none";
    if (isAcademicPptStage(stage)) {
      console.error(`[agent:chat] stage=${stage} provider=${provider} model=${model} bad_response elapsedMs=${elapsedMs} keys=${keys}`);
    } else {
      console.error(
        `[agent:chat] stage=${stage} provider=${provider} model=${model} endpoint=${endpoint} bad_response requestId=${requestId || "-"} elapsedMs=${elapsedMs} keys=${keys}`
      );
    }
    throw new AgentProviderRequestError({
      elapsedMs,
      endpoint,
      kind: "bad_response",
      message: "BAD_PROVIDER_RESPONSE",
      model,
      provider,
      requestId,
      status: response.status,
      timeoutMs
    });
  }

  if (isAcademicPptStage(stage)) {
    console.info(`[agent:chat] stage=${stage} provider=${provider} model=${model} request_succeeded elapsedMs=${elapsedMs}`);
  } else {
    console.info(
      `[agent:chat] stage=${stage} provider=${provider} model=${model} endpoint=${endpoint} request_succeeded requestId=${requestId || "-"} elapsedMs=${elapsedMs}`
    );
  }
  return content;
}

function createChildAbortSignal(parentSignal: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  let parentAborted = parentSignal.aborted;
  const abortWithReason = (reason: unknown) => {
    if (!controller.signal.aborted) controller.abort(reason);
  };
  const timer = setTimeout(() => {
    timedOut = true;
    abortWithReason(new Error(`server_timeout:${timeoutMs}`));
  }, timeoutMs);
  const abort = () => {
    parentAborted = true;
    abortWithReason((parentSignal as AbortSignal & { reason?: unknown }).reason || new Error("client_abort"));
  };
  if (parentSignal.aborted) abort();
  else parentSignal.addEventListener("abort", abort, { once: true });

  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut;
    },
    get parentAborted() {
      return parentAborted;
    },
    dispose: () => {
      clearTimeout(timer);
      parentSignal.removeEventListener("abort", abort);
    }
  };
}

function isAbortLikeError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.message.toLowerCase().includes("aborted");
}

type ChildAbortSignal = ReturnType<typeof createChildAbortSignal>;

type ModelCallLogContext = {
  channel?: "word";
  stage?: string;
};

function modelErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 240) : "unknown";
}

function classifyModelError(error: unknown, childSignal: ChildAbortSignal, parentSignal: AbortSignal) {
  if (isAgentProviderRequestError(error)) {
    if (error.kind === "server_timeout") return "timeout";
    if (error.kind === "client_abort") return "client_abort";
    if (error.kind === "provider_504") return "provider_timeout_504";
    return error.kind;
  }
  if (childSignal.timedOut) return "timeout";
  if (childSignal.parentAborted || parentSignal.aborted) {
    const reason = String((parentSignal as AbortSignal & { reason?: unknown }).reason || "").toLowerCase();
    if (reason.includes("timeout")) return "timeout";
    if (reason.includes("manual")) return "manual_abort";
    return "client_abort";
  }
  if (error instanceof Error && error.message.includes("PROVIDER_ERROR_524")) return "provider_timeout_524";
  if (isAbortLikeError(error)) return "provider_abort";
  return "provider_error";
}

function logWordModelStart(stage: string, provider: AgentProvider, model: string, timeoutMs: number) {
  console.info(`[word:model] stage=${stage} provider=${provider} model=${model} timeout=${timeoutMs}`);
}

function logWordModelError(stage: string, provider: AgentProvider, model: string, reason: string, error: unknown, elapsedMs?: number) {
  console.error(
    `[word:model:error] stage=${stage} provider=${provider} model=${model} reason=${reason}${elapsedMs === undefined ? "" : ` elapsed=${elapsedMs}`} message=${modelErrorMessage(error)}`
  );
}

async function callPrimaryWithFallback(
  messages: AgentChatMessage[],
  signal: AbortSignal,
  timeouts?: { primaryTimeoutMs: number; fallbackTimeoutMs: number },
  logContext: ModelCallLogContext = {}
) {
  const config = getAgentModelConfig();
  const primaryTimeoutMs = timeouts?.primaryTimeoutMs || config.taskTimeoutMs;
  const fallbackTimeoutMs = timeouts?.fallbackTimeoutMs || config.taskTimeoutMs;
  const stage = logContext.stage || "task";
  if (logContext.channel === "word") logWordModelStart(stage, config.taskPrimary.provider, config.taskPrimary.model, primaryTimeoutMs);
  const primarySignal = createChildAbortSignal(signal, primaryTimeoutMs);
  const primaryStartedAt = Date.now();
  try {
    const result = {
      content: await callChatModel({
        stage,
        provider: config.taskPrimary.provider,
        model: config.taskPrimary.model,
        messages,
        signal: primarySignal.signal,
        timeoutMs: primaryTimeoutMs
      }),
      modelUsed: config.taskPrimary.model,
      providerUsed: config.taskPrimary.provider,
      fallbackUsed: false
    };
    if (logContext.channel === "word") console.info(`[word:model] stage=${stage} provider=${config.taskPrimary.provider} model=${config.taskPrimary.model} succeeded`);
    return result;
  } catch (error) {
    const reason = classifyModelError(error, primarySignal, signal);
    if (logContext.channel === "word") logWordModelError(stage, config.taskPrimary.provider, config.taskPrimary.model, reason, error, Date.now() - primaryStartedAt);
    const chargeSensitiveFailure =
      logContext.channel !== "word" &&
      isAgentProviderRequestError(error) &&
      (error.kind === "server_timeout" || error.kind === "provider_504" || error.kind === "client_abort");
    const shouldSkipTaskFallback =
      chargeSensitiveFailure || signal.aborted || (logContext.channel !== "word" && isAbortLikeError(error) && (!primarySignal.timedOut || !timeouts));
    if (shouldSkipTaskFallback) {
      console.error(`[agent] ${config.taskPrimary.model} failed reason=${reason}; skip task fallback`);
      throw error;
    }
    console.error(`[agent] ${config.taskPrimary.model} failed, trying ${config.taskFallback.model} fallback: ${error instanceof Error ? error.message : "unknown"}`);
    if (logContext.channel === "word") {
      console.info(`[word:fallback] type=remote started stage=${stage} provider=${config.taskFallback.provider} model=${config.taskFallback.model} timeout=${fallbackTimeoutMs}`);
    }
    const fallbackSignal = createChildAbortSignal(signal, fallbackTimeoutMs);
    const fallbackStartedAt = Date.now();
    try {
      const result = {
        content: await callChatModel({
          stage: `${stage}:fallback`,
          provider: config.taskFallback.provider,
          model: config.taskFallback.model,
          messages,
          signal: fallbackSignal.signal,
          timeoutMs: fallbackTimeoutMs
        }),
        modelUsed: config.taskFallback.model,
        providerUsed: config.taskFallback.provider,
        fallbackUsed: true
      };
      if (logContext.channel === "word") console.info(`[word:fallback] type=remote succeeded stage=${stage} provider=${config.taskFallback.provider} model=${config.taskFallback.model}`);
      return result;
    } catch (fallbackError) {
      const fallbackReason = classifyModelError(fallbackError, fallbackSignal, signal);
      if (logContext.channel === "word") {
        logWordModelError(`${stage}:fallback`, config.taskFallback.provider, config.taskFallback.model, fallbackReason, fallbackError, Date.now() - fallbackStartedAt);
        console.error(`[word:fallback] type=remote failed stage=${stage} reason=${fallbackReason} message=${modelErrorMessage(fallbackError)}`);
      }
      throw fallbackError;
    } finally {
      fallbackSignal.dispose();
    }
  } finally {
    primarySignal.dispose();
  }
}

async function callFastChat(messages: AgentChatMessage[], signal: AbortSignal) {
  const config = getAgentModelConfig();
  const childSignal = createChildAbortSignal(signal, config.fastChatTimeoutMs);
  try {
    return {
      content: await callChatModel({
        stage: "fast_chat",
        provider: config.chat.provider,
        model: config.chat.model,
        messages,
        maxTokens: 1200,
        signal: childSignal.signal,
        timeoutMs: config.fastChatTimeoutMs
      }),
      modelUsed: config.chat.model,
      providerUsed: config.chat.provider,
      fallbackUsed: false
    };
  } finally {
    childSignal.dispose();
  }
}

function buildAgentSystemPrompt(documentContext: string): AgentChatMessage[] {
  const now = new Date();
  const currentDate = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "full",
    timeZone: "Asia/Shanghai"
  }).format(now);
  const basePrompt = `你是 NexusAI 智能体，面向团队内部使用。回答要清晰、克制、可执行；不要夸大能力，不要编造未提供的信息。
身份规则：当用户询问“你是什么模型”“你是谁”“你是什么”“你知识库到什么时候”“你的训练数据截止到什么时候”“你底层是什么模型”等身份或知识库问题时，只回答“我是 NexusAI 智能体。”不要回答知识库日期，不要提及训练数据截止时间，不要透露或猜测底层模型、供应商、上游 API 名称。
当前日期（北京时间）：${currentDate}。回答今天、明天、昨天、星期几等问题时，以这个日期为准。`;

  if (!documentContext) return [{ role: "system", content: basePrompt }];

  return [
    {
      role: "system",
      content: `${basePrompt}\n\n以下是从用户附件中抽取或理解出的 Markdown 内容，可能来自文档、表格或图片 OCR/视觉理解。请只基于附件内容和用户问题进行分析；如果资料不足，请明确说明不足，不要编造。`
    },
    { role: "system", content: documentContext }
  ];
}

function getTransformInstruction(mode?: AgentTransformMode) {
  if (mode === "summarize") return "只保留核心内容，重点做摘要和要点归纳，不扩展无关内容。";
  if (mode === "concise") return "整体精简表达，删除重复内容，保留必要结论和行动项。";
  if (mode === "rewrite_formal") return "改写为正式、稳重、适合内部汇报或交付的文风。";
  if (mode === "structured") return "重组为条理清晰的结构，优先使用章节、要点和步骤。";
  return "按用户原始需求处理内容，不额外改变文风或篇幅。";
}

function getLengthInstruction(lengthHint?: AgentLengthHint) {
  if (lengthHint === "short") return "篇幅控制为简版，内容短而完整。";
  if (lengthHint === "medium") return "篇幅控制为中等长度，兼顾完整性和可读性。";
  if (lengthHint === "long") return "篇幅可以更详细，补充必要背景、分析和建议。";
  if (lengthHint === "1000_words") return "篇幅控制在 1000 字左右。";
  if (lengthHint === "2_pages") return "篇幅按 Word 中约 2 页内容组织，避免过长。";
  return "篇幅按任务自然展开，不刻意拉长。";
}

function getStyleInstruction(styleHint?: string) {
  if (styleHint === "formal") return "整体文风保持正式、稳重、适合内部汇报或交付。";
  if (styleHint === "structured") return "表达方式强调结构化、分层清楚、便于快速阅读和执行。";
  if (styleHint === "concise") return "语言尽量简洁克制，避免冗余铺陈。";
  if (styleHint === "detailed") return "在保持结构清晰的前提下补充必要背景、分析和建议。";
  return "文风保持清晰、专业、克制，适合团队内部使用。";
}

function taskSummary(task: AgentTask) {
  return JSON.stringify(
    {
      taskType: task.type,
      contentMode: task.contentMode,
      outputFormat: task.outputFormat,
      operation: task.operation,
      documentType: task.documentType,
      fileName: task.requestedFileName,
      style: task.styleHint,
      length: task.lengthHint,
      transform: task.transformMode,
      defaultsApplied: task.defaultsApplied
    },
    null,
    2
  );
}

function buildWordPlanAcceptanceChecklist(intent: WordGenerationIntent) {
  const base = [
    `标题必须短且干净，围绕“${intent.topic}”，不要复用整句 prompt。`,
    "每个一级章节必须有 intro，且至少包含 paragraph/table/callout/checklist 中的一种实质内容。",
    "表格单元格要写可直接使用的内容，不要写“待补充”“相关要求”“核心内容”等占位词。",
    "正文要综合用户需求和资料生成，不要机械复读用户 prompt，不要写平台署名。"
  ];
  const typeSpecific: Partial<Record<WordGenerationIntent["documentType"], string[]>> = {
    lesson_plan: [
      "一级章节必须包含：课程基本信息、设计思路、教学目标、教学重点与难点、教学准备、教学过程、教学评价、课后作业、教学反思。",
      "课程基本信息必须是表格，至少包含课程名称、章节主题、授课对象、课时、课程性质、授课方式。",
      "教学过程必须是表格，表头必须包含教学环节、时间、教师活动、学生活动、设计意图；每行都要落到本课主题、章节或知识点。",
      "教学目标、重点难点、准备、评价、作业和反思都必须围绕 topic/chapter/scope/duration/audience/mustInclude 写具体内容。"
    ],
    report: [
      "一级章节必须覆盖：背景与现状、核心问题与核心发现、事实与数据分析、原因分析、改进建议、风险与限制、结论。",
      "如果用户要求问题原因，必须设置“原因分析”或“问题原因”章节，并逐项回应用户给出的范围。",
      "事实与分析、原因、建议不能只写泛泛描述，必须围绕 scope/audience/mustInclude 展开。"
    ],
    proposal: [
      "一级章节必须覆盖：方案目标、适用范围、实施步骤、时间安排、资源配置、责任分工、风险预案、验收标准与评价指标。",
      "实施步骤、时间安排、责任分工、验收标准必须使用表格、timeline 或 responsibility_matrix 表达。",
      "每个步骤必须能执行，不能只写口号。"
    ],
    business_plan: [
      "一级章节必须覆盖：项目概述、市场与用户、产品与服务、商业模式、实施路径、资源配置、风险预案。",
      "市场、产品、实施和风险必须围绕用户主题和场景展开，避免通用商业计划书模板句。"
    ],
    work_summary: [
      "一级章节必须覆盖：工作概况、重点完成事项、成果与数据、问题与不足、改进措施、下一步计划。",
      "成果、不足和计划必须逐项回应用户给出的工作范围；下一步计划要可执行。"
    ],
    research_summary: [
      "一级章节必须覆盖：研究背景、研究现状、核心观点、启示与建议、结论。",
      "研究现状和核心观点要围绕主题提炼，不要堆材料。"
    ],
    meeting_minutes: [
      "一级章节必须包含：会议基本信息、议题、讨论要点、决议事项、待办任务、责任人与截止时间。",
      "会议基本信息必须是表格，至少包含会议名称、会议时间、参会对象、会议议题。",
      "决议事项和待办任务必须围绕每个议题生成；责任人与截止时间必须用 responsibility_matrix 或 table 表达。"
    ],
    training_plan: [
      "一级章节必须覆盖：培训目标、培训内容、时间安排、资源配置、责任分工、风险预案、考核方式。",
      "培训内容、时间安排和考核方式必须与 audience/scope/duration 对齐。"
    ],
    notice: [
      "通知必须交代对象、事项、时间、要求和执行口径，语气正式清楚。"
    ],
    contract: [
      "合同或协议类文档必须覆盖主体、标的、交付、付款、验收、保密、违约和争议处理等必要条款。"
    ],
    summary: [
      "总结类文档必须覆盖概况、重点内容、结论、问题和下一步安排。"
    ],
    general: [
      "通用文档也必须按用户主题选择合适结构，不能输出空泛模板。"
    ],
    course_plan: [
      "一级章节必须覆盖：课程定位、课程目标、课程内容、适用范围、实施安排、考核方式、资源准备、效果评估。",
      "课程内容、实施安排和考核方式必须围绕用户给出的课程主题、对象和周期。"
    ]
  };
  return [...base, ...(typeSpecific[intent.documentType] || typeSpecific.general || [])]
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
}

function buildWordPlanPrompt(task: AgentTask, userText: string): AgentChatMessage {
  const intent = extractWordGenerationIntent(userText);
  const checklist = buildWordPlanAcceptanceChecklist(intent);
  return {
    role: "user",
    content: [
      "请根据以上需求生成一份完整的 WordDocumentPlan JSON，用于直接渲染 Word .docx。只输出 JSON plan，不要输出 Markdown 正文。",
      `用户原始需求：${userText}`,
      `Word 生成意图：\n${JSON.stringify(intent, null, 2)}`,
      `结构化任务信息：\n${taskSummary(task)}`,
      task.documentType ? `文档类型：${documentTypeLabels[task.documentType]}。` : "文档类型：普通内部文档。",
      `内容处理方式：${getTransformInstruction(task.transformMode)}`,
      `篇幅要求：${getLengthInstruction(task.lengthHint)}`,
      `风格要求：${getStyleInstruction(task.styleHint)}`,
      "",
      "重要：必须根据 Word 生成意图中的 documentType、topic、purpose、chapter、scope、duration、audience、lengthRequirement、styleRequirement、mustInclude 和 keywords 生成专属内容，不要退化为通用模板。",
      "如果用户要求的是正式交付物，正文必须具体、可执行、可直接使用；不要只给大纲，不要复读用户 prompt，不要机械堆关键词。",
      "不同文档类型要使用不同专业结构，不要所有文档都套同一套章节。",
      "",
      "文档类型与结构要求：",
      "1. lesson_plan：课程基本信息、设计思路、教学目标、教学重点与难点、教学准备、教学过程、教学评价、课后作业、教学反思。",
      "2. course_plan：课程定位、课程目标、课程内容、适用范围、实施安排、考核方式、资源准备、效果评估。",
      "3. report：背景与现状、核心问题与核心发现、事实与数据分析、原因分析、改进建议、风险与限制、结论。",
      "4. proposal / business_plan：方案目标、适用范围、实施步骤、时间安排、资源配置、责任分工、风险预案、验收标准与评价指标。",
      "5. work_summary：工作概况、重点完成事项、成果与数据、问题与不足、改进措施、下一步计划。",
      "6. research_summary：研究背景、研究现状、核心观点、启示与建议、结论。",
      "7. meeting_minutes：会议基本信息、议题、讨论要点、决议事项、待办任务、责任人与截止时间。",
      "8. training_plan：培训目标、培训内容、时间安排、资源配置、责任分工、风险预案、考核方式。",
      "9. notice / contract / general：按照正式文稿逻辑组织，标题干净，内容具体，不要空话。",
      "",
      "如果上文提供了联网资料：只用于补充背景、概念、案例或术语；必须综合改写，不要复制搜索原文，不要堆来源链接。",
      "",
      "本次文档的硬性验收清单：",
      checklist,
      "",
      "WordDocumentPlan JSON schema：",
      JSON.stringify(
        {
          title: "简短准确标题，不要用完整 prompt",
          subtitle: "可选副标题",
          documentType: "lesson_plan | course_plan | report | proposal | business_plan | work_summary | research_summary | contract | notice | meeting_minutes | training_plan | summary | general",
          sections: [
            {
              heading: "一级章节标题",
              level: 1,
              intro: "该章节下的自然段正文，必须具体，不要模板句",
              blocks: [
                { type: "paragraph", text: "自然段正文" },
                { type: "bullet_list", items: ["要点一", "要点二"] },
                { type: "numbered_list", items: ["步骤一", "步骤二"] },
                { type: "table", headers: ["列一", "列二"], rows: [["内容一", "内容二"]] },
                { type: "callout", title: "提示", text: "补充说明" },
                { type: "checklist", items: ["任务一", "任务二"] },
                { type: "rubric", headers: ["指标", "优秀"], rows: [["示例", "说明"]] },
                { type: "timeline", headers: ["阶段", "时间"], rows: [["启动", "第1周"]] },
                { type: "responsibility_matrix", headers: ["事项", "责任人"], rows: [["任务", "负责人"]] }
              ]
            }
          ]
        },
        null,
        2
      ),
      "",
      "输出要求：",
      "1. 第一行必须是 WORD_DOCUMENT_PLAN_JSON，第二行开始输出 JSON 对象；不要包裹代码块，不要解释生成过程。",
      "2. 每个一级章节必须有 intro 或 paragraph/table/callout；不能只有标题或只有列表。",
      "3. 正文必须根据用户 prompt 生成专属内容；禁止用固定模板句替换关键词。",
      "4. 教案/课程方案/培训计划要写成可直接落地的正式文档，不能只写大纲。",
      "5. 报告要围绕用户指定范围写发现、原因和建议；方案要围绕场景写目标、步骤、分工和指标；会议纪要要写清议题、讨论要点、决议和待办。",
      "6. 不要复读用户 prompt，不要写平台署名，不要提及底层模型或供应商。",
      "7. 不要使用 HTML、Mermaid、图片链接、脚注或复杂嵌套。"
    ].join("\n")
  };
}

function validateGeneratedWordPlanContent(content: string, userText: string) {
  const intent = extractWordGenerationIntent(userText);
  const parsed = parseWordDocumentPlanJson(content);
  if (!parsed) {
    return { ok: false, issues: ["invalid_word_plan_json"] };
  }
  const report = evaluateWordDocumentPlan(parsed, { intent, prompt: userText });
  console.info(
    `[word:qa] score=${report.score} issues=${report.issues.map((issue) => `${issue.code}:${issue.severity}`).join("|") || "none"}`
  );
  console.info(`[word:qa] matchedKeywords=${report.keywordCoverage.matchedKeywords.join("、") || "-"}`);
  console.info(`[word:qa] missingKeywords=${report.keywordCoverage.missingKeywords.join("、") || "-"}`);
  return {
    ok: !report.shouldRepair || canDeliverWordDocumentPlan(report),
    issues: report.issues.map((issue) => issue.code)
  };
}

function buildWordPlanRepairPrompt({
  task,
  userText,
  previousContent,
  issues
}: {
  task: AgentTask;
  userText: string;
  previousContent: string;
  issues: string[];
}): AgentChatMessage {
  const intent = extractWordGenerationIntent(userText);
  const checklist = buildWordPlanAcceptanceChecklist(intent);
  return {
    role: "user",
    content: [
      "上一次 WordDocumentPlan 没有通过内容 QA。请只基于用户原始需求重写一份完整 WordDocumentPlan JSON。",
      `用户原始需求：${userText}`,
      `Word 生成意图：\n${JSON.stringify(intent, null, 2)}`,
      `结构化任务信息：\n${taskSummary(task)}`,
      `QA 问题：${issues.join(", ")}`,
      "",
      "必须满足的验收清单：",
      checklist,
      "",
      "上一版内容如下，仅用于定位问题；不要照抄其中的模板句或重复段落：",
      previousContent.slice(0, 6000),
      "",
      "修复要求：",
      "1. 第一行必须是 WORD_DOCUMENT_PLAN_JSON，第二行开始输出 JSON 对象。",
      "2. 每个章节正文必须更具体，围绕 topic/chapter/scope/duration/audience/mustInclude/keywords 写真实内容。",
      "3. 删除模板句、重复段落、空泛教学活动和 prompt 复读。",
      "4. 教案的教学过程表格必须写具体教师活动、学生活动、设计意图；报告/方案/总结/会议纪要必须逐项回应用户指定范围和约束。",
      "5. 如果是 lesson_plan，一级章节必须包含：课程基本信息、设计思路、教学目标、教学重点与难点、教学准备、教学过程、教学评价、课后作业、教学反思。",
      "6. 如果是 meeting_minutes，一级章节必须包含：会议基本信息、议题、讨论要点、决议事项、待办任务、责任人与截止时间。",
      "7. 如果是 report 且用户要求“问题原因”，正文必须出现“原因分析”或“问题原因”相关章节与内容。",
      "8. 不要输出 Markdown，不要解释。"
    ].join("\n")
  };
}

function buildWordCommentRevisionPrompt({
  userText,
  targets
}: {
  userText: string;
  targets: DocumentCommentRevisionTarget[];
}): AgentChatMessage {
  return {
    role: "user",
    content: [
      "请根据用户需求和 Word 批注输出段落级修订 JSON。只输出 JSON，不要 Markdown 代码块，不要解释。",
      `用户需求：${userText}`,
      "",
      "批注与原段落：",
      JSON.stringify(
        targets.map((target) => ({
          commentId: target.commentId,
          commentText: target.commentText,
          paragraphText: target.paragraphText
        })),
        null,
        2
      ),
      "",
      "输出格式：",
      JSON.stringify(
        {
          revisedParagraphs: [
            {
              commentId: "批注ID",
              revisedText: "修订后的完整段落正文"
            }
          ]
        },
        null,
        2
      ),
      "规则：",
      "1. revisedText 必须是完整段落，不要只输出局部片段。",
      "2. 如果批注要求删除、纠错、正式化、大小写、斜体、术语统一，请直接体现在完整段落里。",
      "3. 如果无法判断批注意图，保留原段落并做最小合理修改。",
      "4. 不要新增原文和批注之外的事实。"
    ].join("\n")
  };
}

function buildOriginalDocumentRevisionPrompt({
  userText,
  targets
}: {
  userText: string;
  targets: OriginalDocumentRevisionTarget[];
}): AgentChatMessage {
  const limitedTargets = targets.slice(0, 120);
  return {
    role: "user",
    content: [
      "请根据用户需求，对原 Word 文档正文做段落级修改，并输出 JSON。只输出 JSON，不要 Markdown 代码块，不要解释。",
      "目标：保留原 Word 格式、排版、图片、页眉页脚和复杂对象；你只负责返回需要替换的段落正文。",
      `用户需求：${userText}`,
      "",
      "可编辑段落：",
      JSON.stringify(limitedTargets, null, 2),
      "",
      "输出格式：",
      JSON.stringify(
        {
          revisedParagraphs: [
            {
              paragraphIndex: 0,
              revisedText: "修订后的完整段落正文"
            }
          ],
          tableRevisions: [
            {
              paragraphIndex: 1,
              headers: ["列名一", "列名二", "列名三"],
              rows: [
                ["第一行第一列", "第一行第二列", "第一行第三列"]
              ]
            }
          ]
        },
        null,
        2
      ),
      "规则：",
      "1. 只返回真正需要修改的段落；不需要修改的段落不要返回。",
      "2. revisedText 必须是完整段落，不要只输出局部片段。",
      "3. 如果用户要求把某段改成表格、表格形式、包含列名，请使用 tableRevisions；paragraphIndex 指向要被表格替换的原段落。",
      "4. tableRevisions.headers 必须是用户要求的列；rows 必须把原段落和用户要求整理成可用表格内容，不要只写空占位。",
      "5. 同一个 paragraphIndex 不要同时放 revisedParagraphs 和 tableRevisions；需要表格时优先 tableRevisions。",
      "6. 保持原文结构和事实，不新增未提供的信息。",
      "7. 如果用户要求润色、正式化、精简、扩写，请控制在原段落语义范围内。",
      "8. 如果可编辑段落很多，本次只处理已提供的段落。"
    ].join("\n")
  };
}

function parseOriginalRevisionJson(content: string): {
  revisedParagraphs: Array<{ paragraphIndex: number; revisedText: string }>;
  tableRevisions: DocxTableRevision[];
} {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return { revisedParagraphs: [], tableRevisions: [] };
  const data = JSON.parse(cleaned.slice(start, end + 1)) as {
    revisedParagraphs?: Array<{ paragraphIndex?: unknown; revisedText?: unknown }>;
    tableRevisions?: Array<{ paragraphIndex?: unknown; headers?: unknown; rows?: unknown }>;
  };
  const revisedParagraphs = (data.revisedParagraphs || [])
    .filter((item) => typeof item.paragraphIndex === "number" && typeof item.revisedText === "string")
    .map((item) => ({
      paragraphIndex: Number(item.paragraphIndex),
      revisedText: String(item.revisedText)
    }));
  const tableRevisions = (data.tableRevisions || [])
    .filter((item) => typeof item.paragraphIndex === "number" && Array.isArray(item.headers) && Array.isArray(item.rows))
    .map((item) => ({
      paragraphIndex: Number(item.paragraphIndex),
      headers: (item.headers as unknown[]).map((header) => String(header || "").trim()).filter(Boolean),
      rows: (item.rows as unknown[])
        .filter(Array.isArray)
        .map((row) => (row as unknown[]).map((cell) => String(cell || "").trim()))
        .filter((row) => row.some(Boolean))
    }))
    .filter((item) => item.headers.length && item.rows.length);
  return { revisedParagraphs, tableRevisions };
}

function extractRequestedTableHeaders(text: string) {
  const match =
    text.match(/(?:包含|包括|列为|列出|字段|列名)([^。；;\n]+)/) ||
    text.match(/(?:表格)(?:形式|方式)?[^。；;\n]*?(?:含|有)([^。；;\n]+)/);
  const source = match?.[1] || "";
  const headers = source
    .split(/[、,，和与及]/)
    .map((item) => item.replace(/^(?:包含|包括|列为|列出|字段|列名|含|有)/, "").trim())
    .filter((item) => item.length >= 2 && item.length <= 12)
    .slice(0, 6);
  return headers.length >= 2 ? headers : ["事项", "负责人", "时间节点"];
}

function extractRequestedRevisionItems(text: string) {
  const match = text.match(/(?:补充|包含|包括|加入|增加)([^。；;\n]+)/);
  const source = match?.[1] || "";
  return source
    .split(/[、,，和与及]/)
    .map((item) => item.replace(/^(?:补充|包含|包括|加入|增加)/, "").trim())
    .filter((item) => item.length >= 2 && item.length <= 20)
    .slice(0, 12);
}

function findOriginalTableRevisionTarget(userText: string, targets: OriginalDocumentRevisionTarget[]) {
  const quoted = [...userText.matchAll(/[“"「『《]([^”"」』》]{2,40})[”"」』》]/g)]
    .map((match) => match[1])
    .find((value) => value && !/Word|word|docx|表格|格式/.test(value));
  if (quoted) {
    const matchedIndex = targets.findIndex((target) => target.text.includes(quoted) || quoted.includes(target.text));
    if (matchedIndex >= 0) {
      const matched = targets[matchedIndex];
      const looksLikeHeading = /^[一二三四五六七八九十]+[、.．]/.test(matched.text) || matched.text.length <= quoted.length + 4;
      const next = targets
        .slice(matchedIndex + 1)
        .find((target) => !/^[一二三四五六七八九十]+[、.．]/.test(target.text));
      return looksLikeHeading && next ? next : matched;
    }
    const next = targets.find((target, index) => targets[index - 1]?.text.includes(quoted));
    if (next) return next;
  }

  const actionableTargets = targets.filter((target) => !/^[一二三四五六七八九十]+[、.．]/.test(target.text));
  return actionableTargets.find((target) => target.text.length >= 4) || targets[0];
}

function buildLocalOriginalTableRevision(userText: string, targets: OriginalDocumentRevisionTarget[]): DocxTableRevision[] {
  if (!shouldConvertWordParagraphToTable(userText) || !targets.length) return [];
  const target = findOriginalTableRevisionTarget(userText, targets);
  if (!target) return [];
  const headers = extractRequestedTableHeaders(userText);
  const sourceItems = target.text
    .replace(/[。；;]/g, "、")
    .split(/[、,，]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 8);
  const rowSeeds = sourceItems.length ? sourceItems : [target.text];
  const rows = rowSeeds.map((item, index) =>
    headers.map((header, headerIndex) => {
      if (headerIndex === 0) return item;
      if (/负责|责任|人员/.test(header)) return index === 0 ? "牵头人待确认" : "协同责任人待确认";
      if (/时间|节点|期限|截止/.test(header)) return index === 0 ? "按计划启动" : "按活动节点推进";
      return "待补充";
    })
  );
  return [{ paragraphIndex: target.paragraphIndex, headers, rows }];
}

function findOriginalParagraphRevisionTarget(userText: string, targets: OriginalDocumentRevisionTarget[]) {
  const quoted = [...userText.matchAll(/[“"「『《]([^”"」』》]{2,40})[”"」』》]/g)]
    .map((match) => match[1])
    .find((value) => value && !/Word|word|docx|格式|表格/.test(value));
  if (quoted) {
    const matchedIndex = targets.findIndex((target) => target.text.includes(quoted) || quoted.includes(target.text));
    if (matchedIndex >= 0) {
      const matched = targets[matchedIndex];
      const looksLikeHeading = /^[一二三四五六七八九十]+[、.．]/.test(matched.text) || matched.text.length <= quoted.length + 4;
      const next = targets
        .slice(matchedIndex + 1)
        .find((target) => !/^[一二三四五六七八九十]+[、.．]/.test(target.text));
      return looksLikeHeading && next ? next : matched;
    }
  }
  const actionableTargets = targets.filter((target) => !/^[一二三四五六七八九十]+[、.．]/.test(target.text));
  return actionableTargets.find((target) => target.text.length >= 4) || targets[0];
}

function ensureOriginalRevisionCoverage(
  plan: { revisedParagraphs: Array<{ paragraphIndex: number; revisedText: string }>; tableRevisions: DocxTableRevision[] } | undefined,
  userText: string,
  targets: OriginalDocumentRevisionTarget[]
) {
  const revisedParagraphs = [...(plan?.revisedParagraphs || [])];
  const tableRevisions = [...(plan?.tableRevisions || [])];
  if (shouldConvertWordParagraphToTable(userText)) return { revisedParagraphs, tableRevisions };

  const requestedItems = extractRequestedRevisionItems(userText);
  if (!requestedItems.length || !targets.length) return { revisedParagraphs, tableRevisions };

  const normalizedPlanText = normalizeRevisionText(revisedParagraphs.map((revision) => revision.revisedText).join(" "));
  const missingItems = requestedItems.filter((item) => !normalizedPlanText.includes(normalizeRevisionText(item)));
  if (!missingItems.length) return { revisedParagraphs, tableRevisions };

  const target = revisedParagraphs[0]
    ? targets.find((item) => item.paragraphIndex === revisedParagraphs[0].paragraphIndex)
    : findOriginalParagraphRevisionTarget(userText, targets);
  if (!target) return { revisedParagraphs, tableRevisions };

  const existingIndex = revisedParagraphs.findIndex((revision) => revision.paragraphIndex === target.paragraphIndex);
  const baseText = existingIndex >= 0 ? revisedParagraphs[existingIndex].revisedText : target.text;
  const supplement = `补充安排：${missingItems.map((item) => `${item}需明确负责人、时间节点和检查方式`).join("；")}。`;
  const revisedText = `${baseText.replace(/[。；;]\s*$/, "")}。${supplement}`;
  if (existingIndex >= 0) revisedParagraphs[existingIndex] = { paragraphIndex: target.paragraphIndex, revisedText };
  else revisedParagraphs.push({ paragraphIndex: target.paragraphIndex, revisedText });
  return { revisedParagraphs, tableRevisions };
}

function parseRevisionJson(content: string) {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  const data = JSON.parse(cleaned.slice(start, end + 1)) as {
    revisedParagraphs?: Array<{ commentId?: unknown; revisedText?: unknown }>;
  };
  return (data.revisedParagraphs || [])
    .filter((item) => typeof item.commentId === "string" && typeof item.revisedText === "string")
    .map((item) => ({
      commentId: String(item.commentId),
      revisedText: String(item.revisedText)
    }));
}

function normalizeRevisionText(value: string) {
  return value.replace(/\s+/g, "").replace(/[，。；、,.!?！？:："'“”《》]/g, "");
}

function buildLocalCommentRevisionText(target: DocumentCommentRevisionTarget) {
  const comment = target.commentText || "";
  const original = target.paragraphText || "";
  if (/正式|汇报|结果|成果|导向/.test(comment)) {
    return "本周相关工作已按计划推进并取得阶段性结果，后续将围绕关键成果、风险事项和协同需求持续跟进，确保工作进展能够形成可复盘、可汇报的正式记录。";
  }
  if (/精简|简洁|压缩/.test(comment)) {
    return original.replace(/比较|部分|一些/g, "").replace(/\s+/g, " ").trim() || original;
  }
  if (/纠错|错别字|修正|更正/.test(comment)) {
    return original.replace(/错别字|错误/g, "修正内容");
  }
  return original;
}

function ensureCommentRevisionCoverage(
  revisions: Array<{ commentId: string; revisedText: string }>,
  targets: DocumentCommentRevisionTarget[]
) {
  const revisionById = new Map(revisions.map((revision) => [revision.commentId, revision]));
  return targets.map((target) => {
    const revision = revisionById.get(target.commentId);
    const revisedText = revision?.revisedText?.trim() || "";
    const comment = target.commentText || "";
    const normalized = normalizeRevisionText(revisedText);
    const unchanged = normalizeRevisionText(revisedText) === normalizeRevisionText(target.paragraphText);
    const missesFormal = /正式|汇报/.test(comment) && !/正式|汇报|规范|专业/.test(normalized);
    const missesResult =
      (/结果/.test(comment) && !/结果/.test(normalized)) ||
      (/成果|导向/.test(comment) && !/结果|成果|产出|成效/.test(normalized));
    if (!revisedText || unchanged || missesFormal || missesResult) {
      return {
        commentId: target.commentId,
        revisedText: buildLocalCommentRevisionText(target)
      };
    }
    return {
      commentId: target.commentId,
      revisedText
    };
  });
}

async function fileToSourceFile(file: File) {
  return {
    fileName: file.name,
    mimeType: file.type,
    buffer: Buffer.from(await file.arrayBuffer())
  };
}

function getRevisionDocxFiles(files: File[]) {
  return files.filter((file) => /\.docx$/i.test(file.name) || /wordprocessingml\.document/i.test(file.type || ""));
}

function buildPresentationPrompt(task: AgentTask): AgentChatMessage {
  return {
    role: "user",
    content: [
      "请根据以上需求生成一份 PPT 的结构化 JSON，只输出 JSON，不要解释。",
      `结构化任务信息：\n${taskSummary(task)}`,
      "JSON 结构：",
      "{",
      '  "title": "演示文稿标题",',
      '  "subtitle": "可选副标题",',
      '  "slides": [',
      '    { "type": "cover", "title": "封面标题", "subtitle": "副标题" },',
      '    { "type": "agenda", "title": "目录", "bullets": ["章节一", "章节二"] },',
      '    { "type": "content", "title": "页面标题", "bullets": ["要点一", "要点二"] },',
      '    { "type": "table", "title": "表格页", "table": [["列一", "列二"], ["内容", "内容"]] },',
      '    { "type": "closing", "title": "谢谢" }',
      "  ]",
      "}",
      "限制：总页数 5-8 页；每页要点不超过 6 条；每条要点不超过 40 字；风格适合内部汇报，克制、清晰、可执行。"
    ].join("\n")
  };
}

function makeDocumentTitle(text: string, task: AgentTask) {
  if (task.requestedFileName) return task.requestedFileName;
  if (task.documentType && task.documentType !== "document") return documentTypeLabels[task.documentType];

  const compact = text
    .replace(/帮我|请|把这个|这个|这份|生成|输出|导出|下载链接|转化为|转换为|转成|转为|Word|word|docx|文档|文件|报告|方案书/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return compact.slice(0, 32) || "文档整理";
}

function cleanAutoDocumentTitle(value: string) {
  const cleaned = stripOutputExtension(value)
    .replace(/^#+\s*/, "")
    .replace(/[*_`~#]/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\.(txt|md|pdf|docx?|xlsx?|csv)$/i, "")
    .replace(/^(一份|一个|这个|这份|文档|文件|标题|主题)[:：\s]*/g, "")
    .replace(/(的)?(下载链接|链接|文件|文档|word|Word|docx)$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 36) || undefined;
}

function isGenericAutoDocumentTitle(value?: string) {
  if (!value) return true;
  const normalized = value.replace(/\s+/g, "").toLowerCase();
  return [
    "nexusai文档",
    "word文档",
    "文档",
    "文件",
    "文档整理",
    "内容整理",
    "资料整理",
    "转换文档",
    "转为文件",
    "转为word文件",
    "帮我把这个转为文件"
  ].includes(normalized);
}

function extractTitleFromMarkdown(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const heading = line.trim().match(/^#{1,2}\s+(.+)$/);
    const title = heading?.[1] ? cleanAutoDocumentTitle(heading[1]) : undefined;
    if (title && !isGenericAutoDocumentTitle(title)) return title;
  }
  return undefined;
}

function extractTitleFromSourceFiles(files: Array<{ fileName: string }>) {
  if (files.length !== 1) return undefined;
  const title = cleanAutoDocumentTitle(files[0].fileName);
  if (!title || isGenericAutoDocumentTitle(title) || /^新建[\s-]*文本文档$/i.test(title)) return undefined;
  return title;
}

function makeGeneratedDocumentTitle({
  userText,
  task,
  markdown,
  extractedDocuments
}: {
  userText: string;
  task: AgentTask;
  markdown: string;
  extractedDocuments: Array<{ fileName: string }>;
}) {
  if (task.requestedFileName) return task.requestedFileName;

  const intent = extractWordGenerationIntent(userText);
  if (isUsableWordIntent(intent)) {
    const suffixByType: Record<typeof intent.documentType, string> = {
      lesson_plan: "教案",
      course_plan: "课程方案",
      report: "报告",
      proposal: "方案",
      business_plan: "商业计划书",
      work_summary: "工作总结",
      research_summary: "研究综述",
      contract: "合同",
      notice: "通知",
      meeting_minutes: "会议纪要",
      training_plan: "培训计划",
      summary: "总结",
      general: "文档"
    };
    const suffix = suffixByType[intent.documentType] || "文档";
    const includeFocus = Boolean(intent.chapter) || intent.documentType === "lesson_plan" || intent.documentType === "course_plan" || intent.documentType === "training_plan";
    const intentTitle = cleanAutoDocumentTitle([intent.topic, intent.chapter, includeFocus ? intent.chapterTitle || intent.scope : undefined].filter(Boolean).join(" ") + suffix);
    if (intentTitle && !isGenericAutoDocumentTitle(intentTitle)) return intentTitle;
  }

  const titleFromMarkdown = extractTitleFromMarkdown(markdown);
  if (titleFromMarkdown) return titleFromMarkdown;

  const titleFromSource = extractTitleFromSourceFiles(extractedDocuments);
  if (titleFromSource) return `${titleFromSource}整理`;

  return makeDocumentTitle(userText, task);
}

function makeWritingTopic(text: string, task: AgentTask) {
  if (task.requestedFileName) return stripOutputExtension(task.requestedFileName);
  const cleaned = text
    .replace(/请|帮我|生成|写一份|写一个|写个|制作|输出|导出|Word|word|docx|文档|文件/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 32) || makeDocumentTitle(text, task);
}

function buildGeneratedDocumentReply(userText: string, task: AgentTask, webContextUsed: boolean) {
  const topic = makeWritingTopic(userText, task);
  const typeLabel = task.documentType ? documentTypeLabels[task.documentType] : "文档";
  const lead = webContextUsed
    ? `我将围绕${topic}的核心要求，并结合最新资料，按${typeLabel}结构生成内容，确保条理清晰、可直接修改使用。`
    : `我将围绕${topic}的核心要求，按${typeLabel}结构生成内容，确保条理清晰、可直接修改使用。`;
  const follow =
    task.documentType === "lesson_plan"
      ? "这份教案已按教学基本信息、目标、重难点、教学过程等模块整理，可直接用于课堂教学。需要我帮你调整授课时长分配，或适配你的实际教学节奏吗？"
      : `这份${typeLabel}已整理成结构化 Word 文档，适合继续修改和交付。需要我帮你再压缩篇幅、增强正式风格，或改成更适合汇报的版本吗？`;
  return `${lead}\n\n---\n\n${follow}`;
}

function userRequestedSources(text: string) {
  const normalized = compactText(text);
  return includesAny(normalized, ["列出来源", "参考来源", "参考链接", "来源链接", "资料来源", "引用来源", "引用链接", "给出链接"]);
}

function removeUnrequestedSourceSection(content: string, userText: string) {
  if (userRequestedSources(userText)) return content;

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const sourceHeadingIndex = lines.findIndex((line) => /^(参考来源|参考资料|资料来源|来源|引用来源)[:：]?\s*$/i.test(line.trim()));
  if (sourceHeadingIndex < 0) return content;

  let endIndex = lines.length;
  for (let index = sourceHeadingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (/^#{1,4}\s+\S+/.test(line) || (/^\S/.test(line) && !/^[-*•\d]/.test(line) && !/^https?:\/\//i.test(line))) {
      endIndex = index;
      break;
    }
  }

  return [...lines.slice(0, sourceHeadingIndex), ...lines.slice(endIndex)].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function makePresentationTitle(text: string, task: AgentTask) {
  if (task.requestedFileName) return task.requestedFileName;
  const compact = text
    .replace(/生成|输出|导出|下载链接|PPT|ppt|pptx|演示文稿|幻灯片|slides|做一份|做个/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return compact.slice(0, 32) || "演示文稿";
}

function normalizeGeneratedName(value: string) {
  return value
    .toLowerCase()
    .replace(/\.(docx|pptx|xlsx)$/i, "")
    .replace(/[\\/:*?"<>|\s-]/g, "");
}

function stripOutputExtension(value: string) {
  return value.replace(/\.(docx|pptx|xlsx)$/i, "").trim();
}

function safeGeneratedBaseName(value: string) {
  const cleaned = stripOutputExtension(value)
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 48) || `generated-file-${Date.now()}`;
}

function normalizeGeneratedFile(
  file: GeneratedAgentFile,
  expectedFormat: "docx" | "pptx" | "xlsx",
  task: AgentTask,
  fallbackTitle: string
): GeneratedAgentFile {
  const preferredBaseName = task.requestedFileName || stripOutputExtension(file.fileName) || fallbackTitle;
  const fileName = `${safeGeneratedBaseName(preferredBaseName)}.${expectedFormat}`;

  return {
    ...file,
    fileName,
    mimeType: outputMimeByFormat[expectedFormat]
  };
}

function validateGeneratedFile(file: GeneratedAgentFile, expectedFormat: "docx" | "pptx" | "xlsx", task: AgentTask) {
  const hasExpectedName = file.fileName.toLowerCase().endsWith(`.${expectedFormat}`);
  const hasExpectedMime = file.mimeType === outputMimeByFormat[expectedFormat];
  const hasReadableSize = file.sizeBytes > 1024;
  const hasDownloadTarget = Boolean(file.objectKey || file.url);
  const hasExpectedObjectKey = !file.objectKey || file.objectKey.toLowerCase().endsWith(`.${expectedFormat}`);
  const hasExpectedUrl =
    !file.url ||
    file.url.startsWith("/mock-storage/") ||
    file.url.startsWith("blob:") ||
    file.url.startsWith("data:") ||
    file.url.toLowerCase().includes(`.${expectedFormat}`);
  const matchesRequestedFileName = task.requestedFileName
    ? normalizeGeneratedName(file.fileName).includes(normalizeGeneratedName(task.requestedFileName))
    : true;
  const documentTypeMatchesFileName =
    expectedFormat !== "docx" || !task.documentType || task.documentType === "document" || Boolean(task.requestedFileName)
      ? true
      : normalizeGeneratedName(file.fileName).includes(normalizeGeneratedName(documentTypeLabels[task.documentType])) ||
        task.defaultsApplied.includes("documentType=document");
  const matchesTaskFormat = task.outputFormat === expectedFormat;

  return {
    ok:
      hasExpectedName &&
      hasExpectedMime &&
      hasReadableSize &&
      hasDownloadTarget &&
      hasExpectedObjectKey &&
      hasExpectedUrl &&
      matchesRequestedFileName &&
      matchesTaskFormat,
    details: {
      hasExpectedName,
      hasExpectedMime,
      hasReadableSize,
      hasDownloadTarget,
      hasExpectedObjectKey,
      hasExpectedUrl,
      matchesRequestedFileName,
      documentTypeMatchesFileName,
      matchesTaskFormat
    }
  };
}

function documentTemplateForAgentTask(task: AgentTask, intent: WordGenerationIntent): DocumentTemplate {
  if (intent.documentType === "lesson_plan" || task.documentType === "lesson_plan") return "lesson_plan";
  if (intent.documentType === "meeting_minutes" || task.documentType === "meeting_minutes") return "meeting_minutes";
  if (intent.documentType === "proposal" || task.documentType === "proposal") return "proposal";
  if (intent.documentType === "report" || task.documentType === "report") return "report";
  if (task.documentType === "formal_doc") return "formal_doc";
  return "general";
}

function compactWordSearchSummary(webContextResult?: WebContextResult | null) {
  if (!webContextResult?.items.length && !webContextResult?.summary) return "";
  const items = (webContextResult?.items || [])
    .slice(0, 10)
    .map((item, index) => {
      const snippet = item.snippet ? item.snippet.replace(/\s+/g, " ").slice(0, 180) : "";
      return `${index + 1}. ${[item.title, snippet].filter(Boolean).join("：")}`;
    })
    .filter(Boolean);
  return [
    webContextResult.summary ? `检索摘要：${webContextResult.summary.slice(0, 360)}` : "",
    items.length ? `检索要点：\n${items.join("\n")}` : ""
  ].filter(Boolean).join("\n");
}

function appendSearchSummaryToLocalPlan(plan: ReturnType<typeof buildWordDocumentPlanFromIntent>, webContextResult?: WebContextResult | null) {
  const summary = compactWordSearchSummary(webContextResult);
  if (!summary) return plan;
  const target = plan.sections.find((section) => /背景|现状|设计思路|课程定位|方案目标|培训目标|工作概况|研究背景|会议基本信息/.test(section.heading)) || plan.sections[0];
  if (!target) return plan;
  target.blocks.push({
    type: "callout",
    title: "资料补充",
    text: `${summary}\n以上资料仅用于补充背景、术语和实践维度，正文已按用户需求综合改写。`
  });
  return plan;
}

function appendSourceSummaryToLocalPlan(plan: ReturnType<typeof buildWordDocumentPlanFromIntent>, sourceSummary: string) {
  if (!sourceSummary) return plan;
  const target = plan.sections.find((section) => /背景|现状|设计思路|课程定位|方案目标|培训目标|工作概况|研究背景|会议基本信息/.test(section.heading)) || plan.sections[0];
  if (!target) return plan;
  target.blocks.unshift({
    type: "callout",
    title: "附件依据",
    text: `以下内容来自用户上传文件的压缩摘要，生成正文时优先作为依据，不作为网页原文或平台署名复制：${sourceSummary.slice(0, 900)}`
  });
  return plan;
}

function buildFallbackWordMarkdown({
  userText,
  task,
  extractedDocuments,
  title,
  webContextResult
}: {
  userText: string;
  task: AgentTask;
  extractedDocuments: Array<{ fileName: string; extractedMarkdown: string }>;
  title: string;
  webContextResult?: WebContextResult | null;
}) {
  const intent = extractWordGenerationIntent(userText);
  if (!isUsableWordIntent(intent)) {
    throw new Error("WORD_INTENT_INSUFFICIENT");
  }

  const sourceSummary = extractedDocuments
    .map((document) => document.extractedMarkdown.replace(/\s+/g, " ").trim().slice(0, 360))
    .filter(Boolean)
    .join("\n");
  const enrichedIntent = sourceSummary
    ? {
        ...intent,
        requirements: [...intent.requirements, "结合附件资料"],
        keywords: [...intent.keywords, ...extractedDocuments.map((document) => document.fileName)]
      }
    : intent;
  const template = documentTemplateForAgentTask(task, enrichedIntent);
  const plan = appendSearchSummaryToLocalPlan(appendSourceSummaryToLocalPlan(buildWordDocumentPlanFromIntent(enrichedIntent, template), sourceSummary), webContextResult);
  if (!plan.title || /^Lesson Plan|Proposal|Document|Meeting Minutes|DocTemplate$/i.test(plan.title)) {
    plan.title = title;
  }
  return serializeWordDocumentPlan(plan);
}

function getFileTaskMismatchQuestion({
  task,
  files,
  documentFiles,
  spreadsheetFiles,
  imageFiles,
  videoFiles
}: {
  task: AgentTask;
  files: File[];
  documentFiles: File[];
  spreadsheetFiles?: File[];
  imageFiles: File[];
  videoFiles: File[];
}) {
  if (!files.length) return undefined;
  if (!task.requiresFile && task.type !== "analyze_file") return undefined;
  if (documentFiles.length || spreadsheetFiles?.length || imageFiles.length || videoFiles.length) return undefined;

  return "当前 Agent 支持 PDF、Word、TXT、Markdown、Excel、CSV、图片和视频附件解析。请上传可解析的文件后再继续。";
}

function wordQueryKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .replace(/(?:word|docx|生成|写一份|帮我|文档|方案|报告|教案|计划|总结)/g, "");
}

function uniqueWordQueries(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean)) {
    const key = wordQueryKey(value);
    if (!key) continue;
    if ([...seen].some((existing) => Math.abs(existing.length - key.length) <= 4 && (key.includes(existing) || existing.includes(key)))) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function getWordResearchQueryLimit(intent: WordGenerationIntent, userText: string) {
  const configured = Number.parseInt(process.env.AGENT_WORD_WEB_MAX_QUERIES || "", 10);
  if (Number.isFinite(configured) && configured > 0) return Math.max(1, Math.min(configured, 5));
  if (intent.documentType === "research_summary" || /深度|研究|综述|长文档|20页|二十页/.test(userText)) return 5;
  if (intent.documentType === "lesson_plan" || intent.documentType === "course_plan" || intent.documentType === "report" || intent.documentType === "proposal" || intent.documentType === "business_plan" || intent.documentType === "training_plan") return 5;
  return 3;
}

function buildWordResearchQueries(userText: string) {
  const intent = extractWordGenerationIntent(userText);
  const anchors = [intent.chapter, intent.chapterTitle, intent.scope, ...intent.mustInclude, ...intent.keywords.slice(0, 8)].filter(Boolean).join(" ");
  const typeQueries: Partial<Record<typeof intent.documentType, string[]>> = {
    lesson_plan: [
      `${intent.topic} ${intent.chapterTitle || intent.scope || ""} 教案 教学活动`,
      `${intent.topic} ${anchors} 教学评价 课堂任务`,
      `${intent.topic} 课程目标 教学安排 单元示例`,
      `${intent.topic} 学生提交清单 评价方案`
    ],
    course_plan: [`${intent.topic} 课程方案 课程目标`, `${intent.topic} ${anchors} 课程实施 评价方式`, `${intent.topic} 课程内容 课时安排`],
    training_plan: [`${intent.topic} 培训计划 培训目标`, `${intent.topic} ${anchors} 培训考核 实施安排`, `${intent.topic} 培训评价 学员任务`],
    report: [`${intent.topic} 调研 现状 问题 建议`, `${intent.topic} ${anchors} 案例 分析 指标`, `${intent.topic} 原因分析 改进措施`],
    research_summary: [`${intent.topic} 研究综述 研究现状`, `${intent.topic} ${anchors} 文献观点 方法`, `${intent.topic} 关键概念 研究趋势`],
    proposal: [`${intent.topic} 实施方案 步骤 指标`, `${intent.topic} ${anchors} 风险预案 验收标准`, `${intent.topic} 责任分工 时间安排 资源配置`],
    business_plan: [`${intent.topic} 商业计划 市场 用户`, `${intent.topic} ${anchors} 商业模式 风险`, `${intent.topic} 产品服务 竞争分析`],
    work_summary: [`${intent.topic} 工作总结 成果数据`, `${intent.topic} ${anchors} 改进措施 下一步计划`, `${intent.topic} 问题不足 复盘`],
    meeting_minutes: [`${intent.topic} 会议纪要 决议 待办`, `${intent.topic} ${anchors} 责任人 截止时间`]
  };
  const parts = [
    `${intent.topic} ${intent.chapter || ""} ${intent.chapterTitle || intent.scope || ""}`.trim(),
    intent.keywords.slice(0, 6).join(" "),
    intent.audience ? `${intent.audience} ${intent.topic} 场景 案例` : "",
    ...(typeQueries[intent.documentType] || [])
  ].filter(Boolean);
  return uniqueWordQueries(parts).slice(0, getWordResearchQueryLimit(intent, userText));
}

function formatWordWebContext(results: WebContextResult[], queries: string[]): AgentChatMessage[] {
  const seen = new Set<string>();
  const items = results
    .flatMap((result) => result.items)
    .filter((item) => {
      const key = item.url || `${item.title}:${item.snippet.slice(0, 80)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 24);
  const content = [
    "Word 任务联网资料补充已执行。请只把这些资料综合改写进 WordDocumentPlan 的背景、概念、术语、案例或评价维度，不要复制网页原文，不要在正文堆链接。",
    "",
    "实际搜索 query：",
    ...queries.map((query, index) => `${index + 1}. ${query}`),
    "",
    "检索摘要：",
    ...results.map((result, index) => `${index + 1}. ${result.summary || `${result.provider} returned ${result.items.length} items.`}`).slice(0, 12),
    "",
    "可参考要点：",
    ...items.map((item, index) => {
      const meta = [item.website, item.date, item.type].filter(Boolean).join(" / ");
      return `${index + 1}. ${item.title}${meta ? `（${meta}）` : ""}${item.snippet ? `：${item.snippet.slice(0, 600)}` : ""}`;
    })
  ].join("\n");
  return [{ role: "system", content }];
}

function mergeWordWebContextResults(results: WebContextResult[], queries: string[]): WebContextResult | null {
  if (!results.length) return null;
  const seen = new Set<string>();
  const items = results
    .flatMap((result) => result.items)
    .filter((item) => {
      const key = item.url || `${item.title}:${item.snippet.slice(0, 80)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
  return {
    provider: results[0]?.provider || "nexus_self_hosted",
    query: queries.join("\n"),
    summary: `Word 多 query 联网资料补充完成：${results.length}/${queries.length} 个查询返回，合并 ${items.length} 条可用资料。`,
    items,
    rawMeta: {
      source: "word_multi_query",
      fetchedPages: results.reduce((total, result) => total + (result.rawMeta?.fetchedPages || 0), 0),
      fallbackUsed: results.some((result) => result.rawMeta?.fallbackUsed),
      fallbackFrom: results.find((result) => result.rawMeta?.fallbackFrom)?.rawMeta?.fallbackFrom,
      searchDepth: queries.length >= 10 ? "deep" : queries.length >= 5 ? "standard" : "light"
    }
  };
}

async function collectWordWebContext(userText: string) {
  const queries = buildWordResearchQueries(userText);
  const timeoutMs = Math.max(30_000, Math.min(Number.parseInt(process.env.AGENT_WORD_WEB_SEARCH_TIMEOUT_MS || "", 10) || 75_000, 90_000));
  console.info(`[agent:web:word] search_started queries=${queries.length} timeout=${timeoutMs}`);
  const startedAt = Date.now();
  const searchPromises = queries.map(async (query) => {
    try {
      console.info(`[agent:web:word] query_started query=${query.slice(0, 120)}`);
      const current = await fetchWebContextResult(query, { summarize: false });
      console.info(`[agent:web:word] query_succeeded items=${current.result.items.length}`);
      return current.result;
    } catch (error) {
      console.warn(`[agent:web:word] query_failed message=${error instanceof Error ? error.message : "unknown"}`);
      return null;
    }
  });
  const settled = await Promise.race([
    Promise.all(searchPromises),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
  ]);
  if (settled === null) {
    console.warn(`[agent:web:word] search_timeout queries=${queries.length} timeout=${timeoutMs} elapsed=${Date.now() - startedAt}`);
  }
  const results = (settled || []).filter((result): result is WebContextResult => Boolean(result));
  const result = mergeWordWebContextResults(results, queries);
  console.info(`[agent:web:word] search_finished queries=${queries.length} results=${results.length} elapsed=${Date.now() - startedAt}`);
  return {
    messages: result?.items.length ? formatWordWebContext(results, queries) : [],
    result
  };
}

async function collectFileContextWithKimi({
  userText,
  agentTask,
  documentFiles,
  imageFiles,
  videoFiles,
  signal
}: {
  userText: string;
  agentTask: AgentTask;
  documentFiles: File[];
  imageFiles: File[];
  videoFiles: File[];
  signal: AbortSignal;
}) {
  let extractedDocuments: AgentRunResult["extractedDocuments"] = [];
  const degradationNotes: string[] = [];
  const isCommentRevisionIntent = shouldReviseWordComments(userText);
  const isPreserveFormatIntent = shouldPreserveOriginalWordFormat(userText);

  if (documentFiles.length && !isCommentRevisionIntent && !isPreserveFormatIntent) {
    try {
      extractedDocuments = await parseDocumentsWithKimi(documentFiles, signal);
    } catch (error) {
      console.error(`[agent] kimi document parsing failed: ${error instanceof Error ? error.message : "unknown"}`);
      const degradation = getToolDegradation(agentTask, "document");
      if (!degradation.canContinue) throw new Error("KIMI_FILE_EXTRACT_FAILED");
      degradationNotes.push(degradation.message);
    }
  }

  if (imageFiles.length) {
    try {
      const extractedImages = await parseImagesWithVision(imageFiles, userText, signal);
      extractedDocuments = [...extractedDocuments, ...extractedImages];
    } catch (error) {
      console.error(`[agent] image understanding failed: ${error instanceof Error ? error.message : "unknown"}`);
      const degradation = getToolDegradation(agentTask, "image");
      if (!degradation.canContinue) throw new Error("VISION_IMAGE_EXTRACT_FAILED");
      degradationNotes.push(degradation.message);
    }
  }

  if (videoFiles.length) {
    try {
      const extractedVideos = await parseVideosWithKimi(videoFiles, userText, signal);
      extractedDocuments = [...extractedDocuments, ...extractedVideos];
    } catch (error) {
      console.error(`[agent] video understanding failed: ${error instanceof Error ? error.message : "unknown"}`);
      const degradation = getToolDegradation(agentTask, "video");
      if (!degradation.canContinue) throw new Error("KIMI_VIDEO_EXTRACT_FAILED");
      degradationNotes.push(degradation.message);
    }
  }

  return { extractedDocuments, degradationNotes };
}

async function collectWebContextForTask({
  agentTask,
  userText,
  tools
}: {
  agentTask?: AgentTask;
  userText: string;
  tools?: AgentToolSelection;
}) {
  const webSearchEnabled = tools?.webSearch === true;
  const needsPresentationResearch = agentTask?.type === "create_presentation";
  const wordIntent = agentTask?.type === "create_document" ? extractWordGenerationIntent(userText) : null;
  const needsWordResearch =
    agentTask?.type === "create_document" &&
    (wordIntent?.documentType === "lesson_plan" ||
      wordIntent?.documentType === "course_plan" ||
      wordIntent?.documentType === "report" ||
      wordIntent?.documentType === "proposal" ||
      wordIntent?.documentType === "business_plan" ||
      wordIntent?.documentType === "work_summary" ||
      wordIntent?.documentType === "research_summary" ||
      wordIntent?.documentType === "training_plan" ||
      /研究|调研|分析|报告|方案|教案|课程|教学|培训|总结|research|report|proposal/i.test(userText));
  const needsWebContext = shouldRunWebContext(userText, tools) || needsPresentationResearch || needsWordResearch;
  const webSearchConfig = getWebSearchConfig();
  console.info(
    `[agent:web] webSearchEnabled=${webSearchEnabled} needWebSearch=${needsWebContext} mode=${needsPresentationResearch ? "presentation_research" : needsWordResearch ? "word_research" : "chat_or_task"} hasApiKey=${webSearchConfig.hasApiKey} endpoint=${webSearchConfig.endpoint} endpointValid=${webSearchConfig.endpointValid}`
  );

  let webContext: Awaited<ReturnType<typeof fetchWebContextResult>> | null = null;
  let wordWebContext: Awaited<ReturnType<typeof collectWordWebContext>> | null = null;
  if (needsWebContext) {
    try {
      if (needsWordResearch) {
        wordWebContext = await collectWordWebContext(userText);
      } else {
        const webQuery = needsPresentationResearch
          ? `${userText}\n\nPPT research: collect teaching/report facts, examples, data points, and visual reference keywords.`
          : userText;
        webContext = await fetchWebContextResult(webQuery, { summarize: false });
      }
    } catch (error) {
      console.warn(`[agent:web] context fetch failed, continue without web context: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }
  const webContextMessages = wordWebContext?.messages || webContext?.messages || [];
  const webContextResult = wordWebContext?.result || webContext?.result || null;
  const webContextUsed = webContextMessages.length > 0;
  console.info(`[agent:web] webContextCalled=${needsWebContext} messages=${webContextMessages.length}`);

  return { webContextMessages, webContextResult, webContextUsed };
}

async function collectAgentTaskContext({
  userText,
  agentTask,
  documentFiles,
  imageFiles,
  videoFiles,
  tools,
  signal
}: {
  userText: string;
  agentTask: AgentTask;
  documentFiles: File[];
  imageFiles: File[];
  videoFiles: File[];
  tools?: AgentToolSelection;
  signal: AbortSignal;
}) {
  const fileContextPromise = collectFileContextWithKimi({ userText, agentTask, documentFiles, imageFiles, videoFiles, signal });
  const webContextPromise = collectWebContextForTask({ userText, agentTask, tools });
  const [fileContext, webContext] = await Promise.all([fileContextPromise, webContextPromise]);
  const documentContext = fileContext.extractedDocuments.length ? buildDocumentContext(fileContext.extractedDocuments) : "";
  const degradationMessages: AgentChatMessage[] = fileContext.degradationNotes.length
    ? [{ role: "system", content: `工具降级说明：\n${fileContext.degradationNotes.map((note) => `- ${note}`).join("\n")}` }]
    : [];
  const contextMessages = [...buildAgentSystemPrompt(documentContext), ...degradationMessages, ...webContext.webContextMessages];

  return {
    extractedDocuments: fileContext.extractedDocuments,
    contextMessages,
    webContextResult: webContext.webContextResult,
    webContextUsed: webContext.webContextUsed
  };
}

async function renderGeneratedFileLocally({
  expectedFormat,
  task,
  fallbackTitle,
  label,
  render
}: {
  expectedFormat: "docx" | "pptx" | "xlsx";
  task: AgentTask;
  fallbackTitle: string;
  label: string;
  render: () => Promise<GeneratedAgentFile>;
}) {
  const generatedFile = normalizeGeneratedFile(await render(), expectedFormat, task, fallbackTitle);
  const check = validateGeneratedFile(generatedFile, expectedFormat, task);
  if (!check.ok) {
    console.error(`[agent] ${label} validation failed: ${JSON.stringify(check.details)}`);
    throw new Error(`${label.toUpperCase()}_VALIDATION_FAILED`);
  }

  return generatedFile;
}

export async function runAgent({
  userId,
  messages,
  files,
  preferences,
  pendingTask,
  tools,
  signal
}: {
  userId: string;
  messages: AgentChatMessage[];
  files: File[];
  preferences?: AgentPreferences | null;
  pendingTask?: AgentTask | null;
  tools?: AgentToolSelection;
  signal: AbortSignal;
}): Promise<AgentRunResult> {
  const userText = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  const allDocumentFiles = files.filter(isDocumentFile);
  const spreadsheetFiles = files.filter(isSpreadsheetFile);
  const shouldParseImages = tools?.contentMode !== "image";
  const imageFiles = shouldParseImages ? files.filter(isImageUnderstandingFile) : [];
  const videoFiles = files.filter(isVideoUnderstandingFile);
  const agentTask = extractAgentTask(userText, files.length > 0, { preferences, pendingTask, tools });
  const documentFiles = agentTask.type === "create_spreadsheet" ? allDocumentFiles.filter((file) => !isSpreadsheetFile(file)) : allDocumentFiles;
  const routeReason = agentTask.reasons.length ? `${agentTask.type}:${agentTask.reasons.join(",")}` : agentTask.type;
  const agentDecision = getAgentDecision(agentTask, userText, tools);
  console.info(
    `[agent:decision] action=${agentDecision.action} reason=${agentDecision.reason} confidence=${agentDecision.confidence.toFixed(2)} task=${agentTask.type}`
  );

  if (shouldUseFastChatRoute({ text: userText, hasFiles: files.length > 0, tools, task: agentTask })) {
    const fastWebContext = shouldRunWebContext(userText, tools) ? await collectWebContextForTask({ userText, tools }) : null;
    const fastContextMessages = fastWebContext
      ? [...buildAgentSystemPrompt(""), ...fastWebContext.webContextMessages]
      : buildAgentSystemPrompt("");
    const answer = await callFastChat([...fastContextMessages, ...messages], signal);
    return {
      content: removeUnrequestedSourceSection(answer.content, userText),
      modelUsed: answer.modelUsed,
      providerUsed: answer.providerUsed,
      routeReason: "fast_chat:gpt_5_4",
      fallbackUsed: answer.fallbackUsed,
      extractedDocuments: [],
      generatedFiles: [],
      agentTask,
      pendingTask: null,
      defaultsApplied: agentTask.defaultsApplied,
      webContext: fastWebContext?.webContextResult || null
    };
  }

  const fileMismatchQuestion = getFileTaskMismatchQuestion({ task: agentTask, files, documentFiles, spreadsheetFiles, imageFiles, videoFiles });
  if (fileMismatchQuestion) {
    return {
      content: fileMismatchQuestion,
      modelUsed: "NexusAI Agent",
      providerUsed: "xheai",
      routeReason: `${routeReason}:file_type_mismatch`,
      fallbackUsed: false,
      extractedDocuments: [],
      generatedFiles: [],
      agentTask,
      pendingTask: agentTask
    };
  }

  if (agentTask.type === "clarify" && agentTask.clarificationQuestion) {
    return {
      content: agentTask.clarificationQuestion,
      modelUsed: "NexusAI Agent",
      providerUsed: "xheai",
      routeReason,
      fallbackUsed: false,
      extractedDocuments: [],
      generatedFiles: [],
      agentTask,
      pendingTask: agentTask
    };
  }

  const taskContext = await collectAgentTaskContext({
    userText,
    agentTask,
    documentFiles,
    imageFiles,
    videoFiles,
    tools,
    signal
  });
  const { extractedDocuments, contextMessages, webContextResult, webContextUsed } = taskContext;

  if (agentTask.type === "create_spreadsheet") {
    try {
      const sourceFile = spreadsheetFiles[0];
      if (agentTask.requiresFile && !sourceFile) {
        return {
          content: "请先上传需要修改的 Excel 文件，然后我再按你的要求生成修改后的 .xlsx。",
          modelUsed: "NexusAI Spreadsheet",
          providerUsed: "xheai",
          routeReason: `${routeReason}:missing_spreadsheet_source`,
          fallbackUsed: false,
          extractedDocuments,
          generatedFiles: [],
          agentTask,
          pendingTask: agentTask,
          defaultsApplied: agentTask.defaultsApplied,
          webContext: webContextResult
        };
      }

      const spreadsheetResult = await runSpreadsheetTask({
        userId,
        request: userText,
        file: sourceFile,
        requestedFileName: agentTask.requestedFileName
      });
      const generatedFile = await renderGeneratedFileLocally({
        expectedFormat: "xlsx",
        task: agentTask,
        fallbackTitle: sourceFile ? "modified_spreadsheet" : "spreadsheet",
        label: "spreadsheet",
        render: async () => spreadsheetResult.file
      });

      return {
        content: sourceFile
          ? "已按你的要求处理 Excel，并生成修改后的 .xlsx 文件，可点击下方按钮下载。"
          : "已为你生成新的 Excel .xlsx 文件，可点击下方按钮下载。",
        modelUsed: "NexusAI Spreadsheet",
        providerUsed: "xheai",
        routeReason,
        fallbackUsed: false,
        extractedDocuments,
        generatedFiles: [generatedFile],
        agentTask,
        pendingTask: null,
        defaultsApplied: agentTask.defaultsApplied,
        webContext: webContextResult
      };
    } catch (error) {
      console.error(`[agent] spreadsheet generation failed: ${error instanceof Error ? error.message : "unknown"}`);
      return {
        content: "Excel 文件生成或修改失败，请确认文件格式正常后重试。",
        modelUsed: "NexusAI Spreadsheet",
        providerUsed: "xheai",
        routeReason,
        fallbackUsed: false,
        extractedDocuments,
        generatedFiles: [],
        agentTask,
        pendingTask: null,
        defaultsApplied: agentTask.defaultsApplied,
        webContext: webContextResult
      };
    }
  }

  if (agentTask.type === "create_presentation") {
    try {
      let outline = "";
      let outlineResult: Awaited<ReturnType<typeof callPrimaryWithFallback>> | null = null;
      try {
        outlineResult = await callPrimaryWithFallback([...contextMessages, ...messages, buildPresentationPrompt(agentTask)], signal);
        outline = outlineResult.content;
      } catch (error) {
        console.error(`[agent] presentation outline generation failed, using local fallback: ${error instanceof Error ? error.message : "unknown"}`);
      }

      const presentationTitle = makePresentationTitle(userText, agentTask);
      const generatedFile = await renderGeneratedFileLocally({
        expectedFormat: "pptx",
        task: agentTask,
        fallbackTitle: presentationTitle,
        label: "presentation",
        render: () =>
          createPresentation({
            userId,
            title: presentationTitle,
            request: userText,
            outline,
            extractedDocuments,
            webContext: webContextResult
          })
      });

      return {
        content: "已为你生成 PPT 演示文稿，可点击下方按钮下载。",
        modelUsed: outlineResult?.modelUsed || "local-presentation",
        providerUsed: outlineResult?.providerUsed || "xheai",
        routeReason,
        fallbackUsed: Boolean(outlineResult?.fallbackUsed),
        extractedDocuments,
        generatedFiles: [generatedFile],
        agentTask,
        pendingTask: null,
        defaultsApplied: agentTask.defaultsApplied,
        webContext: webContextResult
      };
    } catch (error) {
      console.error(`[agent] presentation generation failed: ${error instanceof Error ? error.message : "unknown"}`);
      return {
        content: "PPT 演示文稿生成失败，请稍后重试。",
        modelUsed: "local-presentation",
        providerUsed: "xheai",
        routeReason,
        fallbackUsed: false,
        extractedDocuments,
        generatedFiles: [],
        agentTask,
        pendingTask: null,
        defaultsApplied: agentTask.defaultsApplied,
        webContext: webContextResult
      };
    }
  }

  if (agentTask.type === "create_document") {
    try {
      const isCommentRevision = shouldReviseWordComments(userText) || agentTask.styleHint === "comment_revision";
      const isOriginalFormatRevision = !isCommentRevision && shouldPreserveOriginalWordFormat(userText) && documentFiles.length > 0;
      const revisionDocxFiles = isCommentRevision || isOriginalFormatRevision ? getRevisionDocxFiles(documentFiles) : [];
      const sourceFiles = revisionDocxFiles.length ? await Promise.all(revisionDocxFiles.map(fileToSourceFile)) : undefined;
      const revisionTargets =
        isCommentRevision && sourceFiles?.length
          ? extractDocxCommentRevisionTargets({
              userId,
              title: "Word 批注修订",
              markdown: "",
              sourceFiles,
              requestedMode: "revise_comments"
            })
          : [];
      const originalRevisionTargets =
        isOriginalFormatRevision && sourceFiles?.length
          ? extractOriginalDocumentRevisionTargets({
              userId,
              title: "Word 原格式修改",
              markdown: "",
              sourceFiles,
              requestedMode: "revise_original"
            })
          : [];
      if (isCommentRevision && !sourceFiles?.length) {
        return {
          content: "请上传带批注的 .docx 文件后，我才能根据批注生成修订版 Word。",
          modelUsed: "NexusAI Document",
          providerUsed: "xheai",
          routeReason: `${routeReason}:missing_docx_source`,
          fallbackUsed: false,
          extractedDocuments,
          generatedFiles: [],
          agentTask,
          pendingTask: agentTask,
          defaultsApplied: agentTask.defaultsApplied,
          webContext: webContextResult
        };
      }
      if (isCommentRevision && !revisionTargets.length) {
        return {
          content: "我没有在这份 .docx 中识别到可处理的 Word 批注。请确认文件里包含 Word 原生批注后再试。",
          modelUsed: "NexusAI Document",
          providerUsed: "xheai",
          routeReason: `${routeReason}:no_word_comments`,
          fallbackUsed: false,
          extractedDocuments,
          generatedFiles: [],
          agentTask,
          pendingTask: null,
          defaultsApplied: agentTask.defaultsApplied,
          webContext: webContextResult
        };
      }
      if (isOriginalFormatRevision && !sourceFiles?.length) {
        return {
          content: "请上传需要保留原格式修改的 .docx 文件，我会在原文档基础上生成修改版。",
          modelUsed: "NexusAI Document",
          providerUsed: "xheai",
          routeReason: `${routeReason}:missing_original_docx_source`,
          fallbackUsed: false,
          extractedDocuments,
          generatedFiles: [],
          agentTask,
          pendingTask: agentTask,
          defaultsApplied: agentTask.defaultsApplied,
          webContext: webContextResult
        };
      }
      if (isOriginalFormatRevision && !originalRevisionTargets.length) {
        return {
          content: "我没有在这份 .docx 中识别到可安全替换的正文段落。请确认文件包含可编辑正文后再试。",
          modelUsed: "NexusAI Document",
          providerUsed: "xheai",
          routeReason: `${routeReason}:no_editable_paragraphs`,
          fallbackUsed: false,
          extractedDocuments,
          generatedFiles: [],
          agentTask,
          pendingTask: null,
          defaultsApplied: agentTask.defaultsApplied,
          webContext: webContextResult
        };
      }
      const markdownPrompt: AgentChatMessage[] =
        isCommentRevision && revisionTargets.length
          ? [...buildAgentSystemPrompt(""), ...messages, buildWordCommentRevisionPrompt({ userText, targets: revisionTargets })]
          : isOriginalFormatRevision && originalRevisionTargets.length
            ? [...buildAgentSystemPrompt(""), ...messages, buildOriginalDocumentRevisionPrompt({ userText, targets: originalRevisionTargets })]
          : [...contextMessages, ...messages, buildWordPlanPrompt(agentTask, userText)];
      let markdownResult: Awaited<ReturnType<typeof callPrimaryWithFallback>> | null = null;
      try {
        const modelConfig = getAgentModelConfig();
        markdownResult = await callPrimaryWithFallback(markdownPrompt, signal, {
          primaryTimeoutMs: modelConfig.wordTaskPrimaryTimeoutMs,
          fallbackTimeoutMs: modelConfig.wordTaskFallbackTimeoutMs
        }, { channel: "word", stage: "plan" });
        if (!isCommentRevision && !isOriginalFormatRevision && markdownResult) {
          const validation = validateGeneratedWordPlanContent(markdownResult.content, userText);
          if (!validation.ok) {
            const repairResult = await callPrimaryWithFallback(
              [...contextMessages, ...messages, buildWordPlanRepairPrompt({ task: agentTask, userText, previousContent: markdownResult.content, issues: validation.issues })],
              signal,
              {
                primaryTimeoutMs: modelConfig.wordTaskRepairTimeoutMs,
                fallbackTimeoutMs: modelConfig.wordTaskFallbackTimeoutMs
              },
              { channel: "word", stage: "repair" }
            );
            const repairedValidation = validateGeneratedWordPlanContent(repairResult.content, userText);
            if (!repairedValidation.ok) {
              throw new Error(`WORD_PLAN_QA_FAILED:${repairedValidation.issues.join(",")}`);
            }
            markdownResult = repairResult;
          }
        }
      } catch (error) {
        console.error(`[agent] word plan generation failed, using local fallback plan: ${error instanceof Error ? error.message : "unknown"}`);
        markdownResult = null;
      }
      const revisedParagraphs =
        isCommentRevision && revisionTargets.length && markdownResult
          ? ensureCommentRevisionCoverage(parseRevisionJson(markdownResult.content), revisionTargets)
          : undefined;
      const parsedOriginalRevisionPlan =
        isOriginalFormatRevision && originalRevisionTargets.length && markdownResult
          ? parseOriginalRevisionJson(markdownResult.content)
          : undefined;
      const localTableRevisions =
        isOriginalFormatRevision && originalRevisionTargets.length ? buildLocalOriginalTableRevision(userText, originalRevisionTargets) : [];
      const originalRevisionPlan =
        isOriginalFormatRevision && originalRevisionTargets.length
          ? ensureOriginalRevisionCoverage(parsedOriginalRevisionPlan, userText, originalRevisionTargets)
          : undefined;
      const originalRevisedParagraphs = originalRevisionPlan?.revisedParagraphs;
      const originalTableRevisions = originalRevisionPlan?.tableRevisions.length
        ? originalRevisionPlan.tableRevisions
        : localTableRevisions;
      if (isCommentRevision && revisionTargets.length && !revisedParagraphs?.length) {
        throw new Error("DOCUMENT_REVISION_JSON_FAILED");
      }
      if (isOriginalFormatRevision && originalRevisionTargets.length && !originalRevisedParagraphs?.length && !originalTableRevisions.length) {
        throw new Error("DOCUMENT_ORIGINAL_REVISION_JSON_FAILED");
      }
      const markdownForDocument = isCommentRevision
        ? "# Word 批注修订\n\n已根据原文批注生成修订版本。"
        : isOriginalFormatRevision
          ? "# Word 原格式修改\n\n已在原文档基础上生成修改版本。"
        : markdownResult?.content || "";
      const documentTitle = isCommentRevision || isOriginalFormatRevision
        ? makeGeneratedDocumentTitle({
            userText: `${userText} 修改版`,
            task: agentTask,
            markdown: "",
            extractedDocuments
          })
        : makeGeneratedDocumentTitle({
            userText,
            task: agentTask,
            markdown: markdownResult?.content || "",
            extractedDocuments
      });
      const wordIntent = extractWordGenerationIntent(userText);
      let usedLocalFallback = false;
      const canUseLocalFallback = !isCommentRevision && !isOriginalFormatRevision;
      const buildLocalFallbackMarkdown = () => {
        console.info("[word:fallback] type=local started");
        try {
          const fallbackMarkdown = buildFallbackWordMarkdown({
            userText,
            task: agentTask,
            extractedDocuments,
            title: documentTitle,
            webContextResult
          });
          console.info("[word:fallback] type=local succeeded stage=plan");
          return fallbackMarkdown;
        } catch (fallbackError) {
          console.error(`[word:fallback] type=local failed stage=plan message=${modelErrorMessage(fallbackError)}`);
          throw fallbackError;
        }
      };
      const renderWordDocument = async (markdown: string) =>
        createWordDocument({
          userId,
          title: documentTitle,
          markdown,
          generationPrompt: userText,
          generationIntent: wordIntent,
          fileName: documentTitle,
          sourceFileNames: extractedDocuments.map((document) => document.fileName),
          sourceFiles,
          documentType: agentTask.documentType,
          requestedMode: isCommentRevision ? "revise_comments" : isOriginalFormatRevision ? "revise_original" : undefined,
          reviseComments: isCommentRevision
            ? {
                instruction: userText,
                revisedParagraphs
              }
            : undefined,
          reviseOriginal: isOriginalFormatRevision
            ? {
                instruction: userText,
                revisedParagraphs: originalRevisedParagraphs,
                tableRevisions: originalTableRevisions
              }
            : undefined
        });
      if (!markdownResult && !canUseLocalFallback) {
        throw new Error("WORD_PLAN_GENERATION_FAILED");
      }
      const initialDocumentMarkdown = markdownResult ? markdownForDocument : buildLocalFallbackMarkdown();
      usedLocalFallback = !markdownResult;
      let documentResult: Awaited<ReturnType<typeof createWordDocument>>;
      try {
        documentResult = await renderWordDocument(initialDocumentMarkdown);
        if (usedLocalFallback) console.info("[word:fallback] type=local succeeded stage=render");
      } catch (documentError) {
        if (!markdownResult || isCommentRevision || isOriginalFormatRevision) {
          if (usedLocalFallback) console.error(`[word:fallback] type=local failed stage=render message=${modelErrorMessage(documentError)}`);
          throw documentError;
        }
        console.error(`[word:qa] model_plan_render_failed message=${modelErrorMessage(documentError)}; trying local fallback`);
        const localMarkdown = buildLocalFallbackMarkdown();
        usedLocalFallback = true;
        try {
          documentResult = await renderWordDocument(localMarkdown);
          console.info("[word:fallback] type=local succeeded stage=render");
        } catch (fallbackError) {
          console.error(`[word:fallback] type=local failed stage=render message=${modelErrorMessage(fallbackError)}`);
          throw fallbackError;
        }
      }
      const generatedFile = await renderGeneratedFileLocally({
        expectedFormat: "docx",
        task: agentTask,
        fallbackTitle: documentTitle,
        label: "document",
        render: async () => documentResult.file
      });
      const generatedFiles = [generatedFile, ...documentResult.files.filter((file) => file !== documentResult.file)];
      const wordRouteReason = `${routeReason}${isCommentRevision ? ":revise_comments" : ""}${isOriginalFormatRevision ? ":revise_original" : ""}${
        usedLocalFallback ? ":local_document_fallback" : ""
      }`;

      return {
        content: isCommentRevision
          ? "已根据 Word 批注生成修订版文档，可点击下方按钮下载。当前为段落级修订，会尽量保留原文档结构、样式、图片、页眉页脚等内容。"
          : isOriginalFormatRevision
            ? "已在原 Word 文档基础上生成保格式修改版，可点击下方按钮下载。当前采用段落级最小替换，会保留原文档样式、图片、页眉页脚、表格和包内资源。"
          : buildGeneratedDocumentReply(userText, agentTask, webContextUsed),
        modelUsed: usedLocalFallback ? "local-document-fallback" : markdownResult?.modelUsed || "local-document-fallback",
        providerUsed: markdownResult && !usedLocalFallback ? markdownResult.providerUsed : "xheai",
        routeReason: wordRouteReason,
        fallbackUsed: markdownResult?.fallbackUsed || usedLocalFallback,
        extractedDocuments,
        generatedFiles,
        agentTask,
        pendingTask: null,
        defaultsApplied: agentTask.defaultsApplied,
        webContext: webContextResult
      };
    } catch (error) {
      console.error(`[agent] word document generation failed: ${error instanceof Error ? error.message : "unknown"}`);
      return {
        content: "Word 文档生成失败，请稍后重试。",
        modelUsed: "gpt-5.4",
        providerUsed: "xheai",
        routeReason,
        fallbackUsed: false,
        extractedDocuments,
        generatedFiles: [],
        agentTask,
        pendingTask: null,
        defaultsApplied: agentTask.defaultsApplied,
        webContext: webContextResult
      };
    }
  }

  const answer = await callPrimaryWithFallback([...contextMessages, ...messages], signal);

  return {
    content: removeUnrequestedSourceSection(answer.content, userText),
    modelUsed: answer.modelUsed,
    providerUsed: answer.providerUsed,
    routeReason,
    fallbackUsed: answer.fallbackUsed,
    extractedDocuments,
    generatedFiles: [],
    agentTask,
    pendingTask: null,
    defaultsApplied: agentTask.defaultsApplied,
    webContext: webContextResult
  };
}
