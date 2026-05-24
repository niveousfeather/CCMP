import type { ExtractedDocument, ExtractedDocumentFact, ExtractedDocumentFactKind } from "@/lib/agent/types";
import { parseDocuments } from "@/lib/document-processing/parser";

const documentExtensions = new Set(["pdf", "txt", "md", "doc", "docx", "xls", "xlsx", "csv"]);
const publicParserExtensions = new Set(["pdf", "txt", "md", "docx", "pptx"]);

export type KimiFilePurpose = "file-extract" | "image" | "video";

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

export function isDocumentFile(file: File) {
  return documentExtensions.has(getExtension(file.name));
}

function canUsePublicDocumentParser(file: File) {
  return publicParserExtensions.has(getExtension(file.name));
}

export function getKimiBaseUrl() {
  return process.env.AGENT_KIMI_BASE_URL || process.env.MOONSHOT_BASE_URL || "https://api.moonshot.cn/v1";
}

export function getKimiApiKey() {
  return process.env.AGENT_KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
}

export function getKimiSummaryModel() {
  return process.env.AGENT_KIMI_SUMMARY_MODEL || process.env.AGENT_KIMI_FILE_MODEL || "kimi-k2.5";
}

function getErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const body = data as Record<string, unknown>;
  const error = body.error && typeof body.error === "object" ? (body.error as Record<string, unknown>) : null;
  return String(body.message || body.error_msg || error?.message || "");
}

export async function uploadKimiFile(file: File, purpose: KimiFilePurpose, signal: AbortSignal) {
  const apiKey = getKimiApiKey();
  if (!apiKey) throw new Error("MISSING_KIMI_API_KEY");

  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("purpose", purpose);

  const response = await fetch(joinUrl(getKimiBaseUrl(), "/files"), {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.error(`[agent:kimi-file] upload failed purpose=${purpose} status=${response.status} message=${getErrorMessage(data) || "-"}`);
    throw new Error("KIMI_FILE_UPLOAD_FAILED");
  }

  if (typeof data?.id !== "string" || !data.id) {
    console.error(`[agent:kimi-file] upload response missing id purpose=${purpose}`);
    throw new Error("BAD_PROVIDER_RESPONSE");
  }

  return data.id as string;
}

export async function getKimiFileContent(fileId: string, signal: AbortSignal) {
  const apiKey = getKimiApiKey();
  if (!apiKey) throw new Error("MISSING_KIMI_API_KEY");

  const response = await fetch(joinUrl(getKimiBaseUrl(), `/files/${fileId}/content`), {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal
  });

  const content = await response.text();
  if (!response.ok) {
    console.error(`[agent:kimi-file] content failed status=${response.status}`);
    throw new Error("KIMI_FILE_EXTRACT_FAILED");
  }

  if (!content.trim()) {
    console.error("[agent:kimi-file] empty extracted content");
    throw new Error("KIMI_FILE_EXTRACT_FAILED");
  }

  return content;
}

function toMarkdown(fileName: string, content: string) {
  return [`## ${fileName}`, "", content.trim()].join("\n");
}

function cleanFactText(value: unknown, maxLength = 220) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\[[^\]]{0,40}\]/g, "")
    .trim()
    .slice(0, maxLength);
}

function splitDocumentUnits(content: string) {
  return String(content || "")
    .replace(/\r/g, "\n")
    .split(/\n{2,}|(?<=[.!?。！？])\s+/)
    .map((item) => cleanFactText(item, 260))
    .filter((item) => item.length >= 18 && !/^(references|acknowledg(e)?ments)$/i.test(item));
}

function inferSectionKind(text: string): ExtractedDocumentFactKind | null {
  const value = text.toLowerCase();
  if (/^(abstract|summary|摘要)\b/.test(value)) return "abstract";
  if (/^(introduction|background|related work|背景|引言)\b/.test(value)) return "background";
  if (/^(problem|research question|motivation|挑战|问题)\b/.test(value)) return "problem";
  if (/^(method|methodology|approach|pipeline|方法|算法|流程)\b/.test(value)) return "method";
  if (/^(architecture|model|framework|机制|架构|模型)\b/.test(value)) return "architecture";
  if (/^(experiment|evaluation|result|benchmark|实验|结果|评估)\b/.test(value)) return "experiment";
  if (/^(comparison|baseline|ablation|对比|基线|消融)\b/.test(value)) return "comparison";
  if (/^(limitation|failure|discussion|局限|限制|讨论)\b/.test(value)) return "limitation";
  if (/^(conclusion|takeaway|future work|结论|总结|展望)\b/.test(value)) return "conclusion";
  return null;
}

function classifyFact(text: string, section: ExtractedDocumentFactKind | null): ExtractedDocumentFactKind {
  const value = text.toLowerCase();
  if (/\b(accuracy|top-1|f1|auc|throughput|latency|params|flops|benchmark|dataset|imagenet|cifar|\d+(?:\.\d+)?\s*%)\b|实验|指标|结果|数据/.test(value)) return "experiment";
  if (/\b(ablation|baseline|compare|comparison|versus|outperform|trade-off|tradeoff)\b|对比|基线|消融|优于|劣于/.test(value)) return "comparison";
  if (/\b(method|pipeline|stage|step|algorithm|training|input|output|optimi[sz]e)\b|方法|流程|步骤|阶段|训练/.test(value)) return "method";
  if (/\b(architecture|module|block|layer|network|encoder|decoder|backbone|mixer)\b|架构|模块|网络|层|机制/.test(value)) return "architecture";
  if (/\b(problem|question|challenge|motivation|need|why)\b|问题|挑战|动机|目标/.test(value)) return "problem";
  if (/\b(limit|limitation|failure|future work|risk|boundary)\b|局限|限制|失败|风险|未来/.test(value)) return "limitation";
  if (/\b(conclude|conclusion|therefore|takeaway|summary|show that)\b|结论|总结|表明|说明/.test(value)) return "conclusion";
  if (/\b(figure|table|chart|diagram)\b|图|表/.test(value)) return "figure";
  return section || "source";
}

function factScore(kind: ExtractedDocumentFactKind, text: string) {
  let score = 1;
  if (kind !== "source") score += 1;
  if (/\d/.test(text)) score += 1;
  if (/[A-Z][A-Za-z0-9-]{3,}/.test(text)) score += 0.5;
  if (text.length > 80) score += 0.5;
  return score;
}

export function extractStructuredDocumentFacts(fileName: string, content: string): ExtractedDocumentFact[] {
  const units = splitDocumentUnits(content);
  const facts: ExtractedDocumentFact[] = [];
  const seen = new Set<string>();
  let currentSection: ExtractedDocumentFactKind | null = null;

  const firstTitle = units.find((unit) => unit.length >= 8 && unit.length <= 140);
  if (firstTitle) {
    facts.push({ kind: "title", text: firstTitle, source: fileName, score: 3 });
  }

  for (const unit of units.slice(0, 80)) {
    const section = inferSectionKind(unit);
    if (section) currentSection = section;
    const kind = section || classifyFact(unit, currentSection);
    const text = cleanFactText(unit.replace(/^(abstract|summary|introduction|background|methodology?|approach|experiment|evaluation|results?|discussion|limitations?|conclusion|future work)[:：\s-]*/i, ""));
    const key = `${kind}:${text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "")}`;
    if (!text || seen.has(key)) continue;
    seen.add(key);
    facts.push({ kind, text, source: fileName, score: factScore(kind, text) });
  }

  return facts
    .sort((left, right) => (right.score || 0) - (left.score || 0))
    .slice(0, 48);
}

function shouldUseLocalFileParseForTest() {
  return process.env.NODE_ENV === "test" && process.env.AGENT_TEST_LOCAL_FILE_PARSE === "true";
}

async function parseDocumentsLocallyForTest(files: File[]): Promise<ExtractedDocument[]> {
  const documents: ExtractedDocument[] = [];
  for (const file of files.filter(isDocumentFile)) {
    const content = await file.text();
    documents.push({
      fileName: file.name,
      fileId: `local-test-${file.name}`,
      content,
      extractedMarkdown: toMarkdown(file.name, content),
      structuredFacts: extractStructuredDocumentFacts(file.name, content)
    });
  }
  return documents;
}

async function parseDocumentsWithPublicParser(files: File[]): Promise<ExtractedDocument[] | null> {
  const supportedFiles = files.filter((file) => isDocumentFile(file) && canUsePublicDocumentParser(file));
  if (!supportedFiles.length || supportedFiles.length !== files.filter(isDocumentFile).length) return null;

  const parsed = await parseDocuments({
    files: supportedFiles,
    maxChars: 80_000
  });
  if (parsed.status !== "parsed" && parsed.status !== "partial") return null;

  const documents = parsed.files
    .filter((file) => file.status === "parsed" && file.normalizedText)
    .map((file) => ({
      fileName: file.fileName,
      fileId: `document-processing-${file.fileName}`,
      content: file.normalizedText || file.text || "",
      extractedMarkdown: toMarkdown(file.fileName, file.normalizedText || file.text || ""),
      structuredFacts: extractStructuredDocumentFacts(file.fileName, file.normalizedText || file.text || "")
    }));
  return documents.length ? documents : null;
}

export async function callKimiChat({
  messages,
  model = getKimiSummaryModel(),
  signal
}: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }>;
  model?: string;
  signal: AbortSignal;
}) {
  const apiKey = getKimiApiKey();
  if (!apiKey) throw new Error("MISSING_KIMI_API_KEY");

  const response = await fetch(joinUrl(getKimiBaseUrl(), "/chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false
    }),
    signal
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.error(`[agent:kimi-chat] status=${response.status} model=${model} message=${getErrorMessage(data) || "-"}`);
    throw new Error("KIMI_CHAT_FAILED");
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    console.error(`[agent:kimi-chat] bad response model=${model}`);
    throw new Error("BAD_PROVIDER_RESPONSE");
  }

  return content.trim();
}

export async function parseDocumentsWithKimi(files: File[], signal: AbortSignal): Promise<ExtractedDocument[]> {
  if (shouldUseLocalFileParseForTest()) return parseDocumentsLocallyForTest(files);

  const publicParsed = await parseDocumentsWithPublicParser(files).catch((error) => {
    console.warn(`[agent:document-processing] public parser failed, falling back to Kimi error=${error instanceof Error ? error.message : "unknown"}`);
    return null;
  });
  if (publicParsed) return publicParsed;

  const documents: ExtractedDocument[] = [];
  for (const file of files.filter(isDocumentFile)) {
    const fileId = await uploadKimiFile(file, "file-extract", signal);
    const content = await getKimiFileContent(fileId, signal);
    documents.push({
      fileName: file.name,
      fileId,
      content,
      extractedMarkdown: toMarkdown(file.name, content),
      structuredFacts: extractStructuredDocumentFacts(file.name, content)
    });
  }

  return documents;
}
