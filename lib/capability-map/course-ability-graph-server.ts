import { getAgentModelConfig } from "@/lib/agent/models";
import { callChatModel } from "@/lib/agent/router";
import type { AgentProvider } from "@/lib/agent/types";
import {
  createMockCourseAbilityGraph,
  expandCourseStructureSemanticSkeleton,
  expandMappingAnalysisSemanticSkeleton,
  expandProcessGraphsSemanticSkeleton,
  normalizeCourseAbilityGraphPayload,
  parseCapabilityMapJson,
  type CourseStructureSemanticSkeleton,
  type CourseAbilityGraphInput,
  type CourseAbilityGraphModelOutput,
  type CourseAbilityGraphPayload,
  type MappingModuleReference,
  type MappingAnalysisSemanticSkeleton,
  type ProcessGraphsSemanticSkeleton
} from "@/lib/capability-map/course-ability-graph";
import {
  courseAbilityDiagnosticCodeFromError,
  courseAbilityDiagnosticWarning,
  type CourseAbilityDiagnosticCode
} from "@/lib/capability-map/diagnostics";
import {
  buildCapabilityMapCourseGraphMessages,
  buildCapabilityMapMappingAnalysisMessages,
  buildCapabilityMapProcessGraphsMessages
} from "@/lib/capability-map/model-prompt";

type GenerateOptions = {
  signal?: AbortSignal;
};

const CAPABILITY_MAP_MODEL_STAGE = "course-ability-graph";
const CAPABILITY_MAP_PROCESS_GRAPHS_STAGE = "course-ability-graph-process-graphs";
const CAPABILITY_MAP_COURSE_GRAPH_STAGE = "course-ability-graph-course-graph";
const CAPABILITY_MAP_MAPPING_ANALYSIS_STAGE = "course-ability-graph-mapping-analysis";
const CAPABILITY_MAP_MINIMAL_TEST_STAGE = "course-ability-graph-minimal-test";
const CAPABILITY_MAP_RESPONSE_SHAPE_TEST_STAGE = "course-ability-graph-response-shape-test";
const CAPABILITY_MAP_MINIMAL_TEST_MAX_TOKENS = 500;
const CAPABILITY_MAP_MINIMAL_TEST_TIMEOUT_MS = 30_000;
const CAPABILITY_MAP_RESPONSE_SHAPE_TEST_MAX_TOKENS = 500;
const CAPABILITY_MAP_RESPONSE_SHAPE_TEST_TIMEOUT_MS = 30_000;
const PROCESS_GRAPHS_MAX_TOKENS = 2000;
const COURSE_GRAPH_MAX_TOKENS = 3500;
const MAPPING_ANALYSIS_MAX_TOKENS = 3000;
const STAGED_MODEL_TIMEOUT_MS = 35_000;

const STAGE_WARNINGS = {
  processGraphsFailed: "STAGE_1_SEMANTIC_SKELETON_FAILED",
  processGraphsUsedModel: "STAGE_1_SEMANTIC_SKELETON_USED_MODEL",
  courseGraphFailed: "STAGE_2_COURSE_STRUCTURE_FAILED",
  courseGraphUsedModel: "STAGE_2_COURSE_STRUCTURE_USED_MODEL",
  mappingAnalysisFailed: "STAGE_3_MAPPING_SKELETON_FAILED",
  mappingAnalysisUsedModel: "STAGE_3_MAPPING_SKELETON_USED_MODEL"
} as const;

export type CapabilityMapMinimalModelCallResult = {
  code?: string;
  content?: string;
  diagnostic?: CourseAbilityDiagnosticCode;
  elapsedMs: number;
  errorName?: string;
  maxTokens: number;
  message?: string;
  model: string;
  ok: boolean;
  provider: AgentProvider;
  stage: string;
  status?: string;
};

export type CapabilityMapProviderResponseShapeSummary = {
  choicesLength?: number;
  contentPreview?: string;
  contentType: string;
  errorKeys?: string[];
  errorMessagePreview?: string;
  firstChoiceKeys?: string[];
  hasContent: boolean;
  hasErrorField: boolean;
  httpStatus: number;
  isStreamLike: boolean;
  messageKeys?: string[];
  rawTextPreview: string;
  topLevelKeys: string[];
};

export type CapabilityMapProviderResponseShapeResult = {
  code?: string;
  diagnostic?: CourseAbilityDiagnosticCode;
  elapsedMs: number;
  errorName?: string;
  maxTokens: number;
  message?: string;
  model: string;
  ok: boolean;
  provider: AgentProvider;
  stage: string;
  summary?: CapabilityMapProviderResponseShapeSummary;
};

function redactCapabilityMapLogValue(value: unknown) {
  if (typeof value !== "string") return value;
  return value
    .replace(/https?:\/\/[^\s"'`]+/gi, "[redacted-url]")
    .replace(/endpoint=https?:\/\/\S+/gi, "endpoint=[redacted]")
    .replace(/base[_-]?url=https?:\/\/\S+/gi, "base_url=[redacted]")
    .replace(/headers?\s*[:=]\s*\{[\s\S]*$/gi, "headers=[redacted]")
    .replace(/body=\{[\s\S]*$/gi, "body=[redacted]")
    .replace(/(api[_-]?key|authorization|bearer|token|secret)\s*[:=]\s*\S+/gi, "$1=[redacted]");
}

function hasProviderApiKey(provider: AgentProvider) {
  if (provider === "xheai") return Boolean(process.env.XHEAI_API_KEY?.trim());
  if (provider === "moonshot") return Boolean(process.env.MOONSHOT_API_KEY?.trim());
  if (provider === "claudecoder") return Boolean(process.env.CLAUDECODER_API_KEY?.trim());
  return Boolean(process.env.AGENT_TASK_API_KEY?.trim() || process.env.CLAUDECODER_API_KEY?.trim());
}

function hasProviderBaseUrl(provider: AgentProvider) {
  if (provider === "xheai") return Boolean(process.env.XHEAI_BASE_URL?.trim() || "https://api.xheai.cc");
  if (provider === "moonshot") return Boolean(process.env.MOONSHOT_BASE_URL?.trim() || "https://api.moonshot.cn/v1");
  if (provider === "claudecoder") return Boolean(process.env.CLAUDECODER_BASE_URL?.trim() || "https://china.claudecoder.me/v1");
  return Boolean(process.env.AGENT_TASK_BASE_URL?.trim() || "https://subrouter.ai/v1");
}

function joinProviderUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function joinVersionedProviderUrl(baseUrl: string, versionedPath: string, unversionedPath: string) {
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  return cleanBaseUrl.endsWith("/v1") ? joinProviderUrl(cleanBaseUrl, unversionedPath) : joinProviderUrl(cleanBaseUrl, versionedPath);
}

function getCapabilityMapProviderDiagnosticConfig(provider: AgentProvider) {
  if (provider === "xheai") {
    return {
      apiKey: process.env.XHEAI_API_KEY,
      url: joinVersionedProviderUrl(process.env.XHEAI_BASE_URL || "https://api.xheai.cc", "/v1/chat/completions", "/chat/completions")
    };
  }
  if (provider === "moonshot") {
    return {
      apiKey: process.env.MOONSHOT_API_KEY,
      url: joinProviderUrl(process.env.MOONSHOT_BASE_URL || "https://api.moonshot.cn/v1", "/chat/completions")
    };
  }
  if (provider === "claudecoder") {
    return {
      apiKey: process.env.CLAUDECODER_API_KEY,
      url: joinVersionedProviderUrl(process.env.CLAUDECODER_BASE_URL || "https://china.claudecoder.me/v1", "/v1/chat/completions", "/chat/completions")
    };
  }
  return {
    apiKey: process.env.AGENT_TASK_API_KEY || process.env.CLAUDECODER_API_KEY,
    url: joinVersionedProviderUrl(process.env.AGENT_TASK_BASE_URL || "https://subrouter.ai/v1", "/v1/chat/completions", "/chat/completions")
  };
}

function readErrorField(error: unknown, field: "code" | "status") {
  if (!error || typeof error !== "object") return undefined;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" || typeof value === "number" ? String(value).slice(0, 80) : undefined;
}

function sanitizeCapabilityMapErrorMessage(message: string) {
  const redacted = String(redactCapabilityMapLogValue(message));
  return redacted
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function sanitizeCapabilityMapPreview(value: unknown, maxLength = 200) {
  return sanitizeCapabilityMapErrorMessage(typeof value === "string" ? value : String(value ?? "")).slice(0, maxLength);
}

function summarizeCapabilityMapModelError(error: unknown) {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error || "unknown");
  return {
    name: sanitizeCapabilityMapErrorMessage(name || "unknown"),
    code: readErrorField(error, "code") || "-",
    status: readErrorField(error, "status") || "-",
    message: sanitizeCapabilityMapErrorMessage(message || "unknown")
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecordKeys(value: unknown, limit = 12) {
  return isRecord(value) ? Object.keys(value).slice(0, limit) : [];
}

function extractErrorCandidateBody(error: unknown) {
  if (!isRecord(error)) return undefined;
  for (const key of ["body", "responseBody", "payload", "data"]) {
    const value = error[key];
    if (typeof value === "string" || isRecord(value)) return value;
  }
  const cause = error.cause;
  if (isRecord(cause)) {
    for (const key of ["body", "responseBody", "payload", "data"]) {
      const value = cause[key];
      if (typeof value === "string" || isRecord(value)) return value;
    }
  }
  return undefined;
}

function parseProviderResponseJson(rawText: string) {
  const trimmed = rawText.trim();
  if (trimmed.startsWith("data:")) {
    const firstPayload = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith("data:") && line.slice(5).trim() && line.slice(5).trim() !== "[DONE]")
      ?.slice(5)
      .trim();
    if (!firstPayload) return null;
    try {
      return JSON.parse(firstPayload) as unknown;
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function summarizeProviderResponseShape(rawText: string, httpStatus: number, contentType: string): CapabilityMapProviderResponseShapeSummary {
  const streamLike = /text\/event-stream|stream/i.test(contentType) || rawText.trim().startsWith("data:");
  const parsed = parseProviderResponseJson(rawText);
  const topLevelKeys = getRecordKeys(parsed);
  const choices = isRecord(parsed) && Array.isArray(parsed.choices) ? parsed.choices : undefined;
  const firstChoice = choices?.[0];
  const message = isRecord(firstChoice) ? firstChoice.message : undefined;
  const content = isRecord(message) ? message.content : undefined;
  const fallbackContent = isRecord(firstChoice) ? firstChoice.text : isRecord(parsed) ? parsed.content : undefined;
  const contentValue = content ?? fallbackContent;
  const errorValue = isRecord(parsed) ? parsed.error : undefined;
  const errorMessage = isRecord(errorValue) ? errorValue.message : isRecord(parsed) ? parsed.message : undefined;

  return {
    choicesLength: choices?.length,
    contentPreview:
      typeof contentValue === "string"
        ? sanitizeCapabilityMapPreview(contentValue)
        : Array.isArray(contentValue)
          ? sanitizeCapabilityMapPreview(JSON.stringify(contentValue).slice(0, 300))
          : undefined,
    contentType: sanitizeCapabilityMapPreview(contentType || "unknown", 120),
    errorKeys: getRecordKeys(errorValue, 8),
    errorMessagePreview: typeof errorMessage === "string" ? sanitizeCapabilityMapPreview(errorMessage) : undefined,
    firstChoiceKeys: getRecordKeys(firstChoice),
    hasContent:
      (typeof contentValue === "string" && Boolean(contentValue.trim())) ||
      (Array.isArray(contentValue) && contentValue.length > 0),
    hasErrorField: Boolean(errorValue),
    httpStatus,
    isStreamLike: streamLike,
    messageKeys: getRecordKeys(message),
    rawTextPreview: sanitizeCapabilityMapPreview(rawText),
    topLevelKeys
  };
}

function summarizeErrorResponseShape(error: unknown) {
  const candidate = extractErrorCandidateBody(error);
  if (typeof candidate === "string") return summarizeProviderResponseShape(candidate, Number(readErrorField(error, "status") || 0), "unknown");
  if (isRecord(candidate)) return summarizeProviderResponseShape(JSON.stringify(candidate), Number(readErrorField(error, "status") || 0), "unknown");
  return undefined;
}

function logCapabilityMapModelRequestSummary(provider: AgentProvider, model: string, stage = CAPABILITY_MAP_MODEL_STAGE, maxTokens?: number) {
  const maxTokensPart = typeof maxTokens === "number" ? ` maxTokens=${maxTokens}` : "";
  console.info(
    `[capability-map:model] request_start stage=${stage} provider=${provider} model=${model} hasApiKey=${hasProviderApiKey(provider)} hasBaseUrl=${hasProviderBaseUrl(provider)}${maxTokensPart}`
  );
}

function logCapabilityMapStreamStageSummary({
  accumulatedChars,
  diagnostic,
  elapsedMs,
  jsonExtracted,
  maxTokens,
  model,
  parseSuccess,
  provider,
  stage
}: {
  accumulatedChars: number;
  diagnostic: CourseAbilityDiagnosticCode | "OK";
  elapsedMs: number;
  jsonExtracted: boolean;
  maxTokens: number;
  model: string;
  parseSuccess: boolean;
  provider: AgentProvider;
  stage: string;
}) {
  console.info(
    `[capability-map:model] stream_stage stage=${stage} provider=${provider} model=${model} stream=true maxTokens=${maxTokens} elapsedMs=${elapsedMs} accumulatedChars=${accumulatedChars} jsonExtracted=${jsonExtracted} parseSuccess=${parseSuccess} diagnostic=${diagnostic}`
  );
}

function logCapabilityMapModelErrorSummary(
  error: unknown,
  diagnosticCode: CourseAbilityDiagnosticCode,
  stage = CAPABILITY_MAP_MODEL_STAGE,
  elapsedMs?: number
) {
  const summary = summarizeCapabilityMapModelError(error);
  const responseShape = summarizeErrorResponseShape(error);
  const elapsedPart = typeof elapsedMs === "number" ? ` elapsedMs=${elapsedMs}` : "";
  const responseShapePart = responseShape
    ? ` responseBodySummary=${JSON.stringify(responseShape)}`
    : " responseBodySummary=unavailable";
  console.warn(
    `[capability-map:model] call_failed stage=${stage} diagnostic=${diagnosticCode}${elapsedPart} errorName=${summary.name} status=${summary.status} errorCode=${summary.code} message=${summary.message}${responseShapePart}`
  );
}

async function withRedactedModelConsole<T>(operation: () => Promise<T>) {
  const originalDebug = console.debug;
  const originalInfo = console.info;
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const redactArgs = (args: unknown[]) => args.map(redactCapabilityMapLogValue);

  console.debug = (...args: unknown[]) => originalDebug(...redactArgs(args));
  console.info = (...args: unknown[]) => originalInfo(...redactArgs(args));
  console.log = (...args: unknown[]) => originalLog(...redactArgs(args));
  console.warn = (...args: unknown[]) => originalWarn(...redactArgs(args));
  console.error = (...args: unknown[]) => originalError(...redactArgs(args));

  try {
    return await operation();
  } finally {
    console.debug = originalDebug;
    console.info = originalInfo;
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

type CapabilityMapGenerationStage = {
  buildMessages: (input: CourseAbilityGraphInput, context: CapabilityMapGenerationContext) => Parameters<typeof callChatModel>[0]["messages"];
  expand: (
    raw: unknown,
    input: CourseAbilityGraphInput,
    fallback: CourseAbilityGraphPayload,
    context: CapabilityMapGenerationContext
  ) => CourseAbilityGraphModelOutput;
  fallbackWarning: string;
  maxTokens: number;
  stage: string;
  successWarning: string;
};

type CapabilityMapGenerationContext = {
  mappingModules?: MappingModuleReference[];
};

function mergeStageWarnings(metaWarnings: unknown, warning: string, diagnostic?: CourseAbilityDiagnosticCode) {
  const warnings = Array.isArray(metaWarnings) ? metaWarnings.filter((item): item is string => typeof item === "string") : [];
  if (diagnostic) warnings.push(courseAbilityDiagnosticWarning(diagnostic));
  warnings.push(warning);
  return Array.from(new Set(warnings));
}

function mergeModelOutput(base: CourseAbilityGraphModelOutput, next: CourseAbilityGraphModelOutput): CourseAbilityGraphModelOutput {
  return {
    ...base,
    ...next,
    meta: {
      ...(base.meta || {}),
      ...(next.meta || {}),
      warnings: Array.from(new Set([...(base.meta?.warnings || []), ...(next.meta?.warnings || [])]))
    }
  };
}

function mappingModuleNameKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_·/／\\（）()《》<>“”"'‘’：:，,。.;；、|]+/g, "");
}

function summarizeMappingAlignment(raw: unknown, mappingModules: MappingModuleReference[] | undefined, output: CourseAbilityGraphModelOutput) {
  const modules = mappingModules || [];
  const rawMappings = isRecord(raw) && Array.isArray(raw.moduleMappings)
    ? raw.moduleMappings.filter((mapping): mapping is Record<string, unknown> => isRecord(mapping))
    : [];
  const usedMappingIndexes = new Set<number>();
  let matchedById = 0;
  let matchedByName = 0;
  const unmatchedModuleNames: string[] = [];

  modules.forEach((module) => {
    const byId = rawMappings.findIndex((mapping, index) => !usedMappingIndexes.has(index) && mapping.moduleId === module.moduleId);
    if (byId >= 0) {
      usedMappingIndexes.add(byId);
      matchedById += 1;
      return;
    }

    const byName = rawMappings.findIndex((mapping, index) => !usedMappingIndexes.has(index) && mapping.moduleName === module.moduleName);
    if (byName >= 0) {
      usedMappingIndexes.add(byName);
      matchedByName += 1;
      return;
    }

    const moduleKey = mappingModuleNameKey(module.moduleName);
    const byNormalizedName = rawMappings.findIndex((mapping, index) => {
      if (usedMappingIndexes.has(index)) return false;
      const candidateKey = mappingModuleNameKey(mapping.moduleName);
      return Boolean(candidateKey && moduleKey && (candidateKey === moduleKey || candidateKey.includes(moduleKey) || moduleKey.includes(candidateKey)));
    });
    if (byNormalizedName >= 0) {
      usedMappingIndexes.add(byNormalizedName);
      matchedByName += 1;
      return;
    }

    unmatchedModuleNames.push(module.moduleName);
  });

  const outputMappings = Array.isArray(output.moduleMappings) ? output.moduleMappings : [];
  return {
    teachingModuleCount: modules.length,
    modelMappingCount: rawMappings.length,
    outputMappingCount: outputMappings.length,
    matchedById,
    matchedByName,
    placeholderCount: unmatchedModuleNames.length,
    unmatchedModuleNames
  };
}

function logMappingAlignmentSummary(summary: ReturnType<typeof summarizeMappingAlignment>) {
  console.info(
    `[capability-map:model] mapping_alignment teachingModuleCount=${summary.teachingModuleCount} modelMappingCount=${summary.modelMappingCount} outputMappingCount=${summary.outputMappingCount} matchedById=${summary.matchedById} matchedByName=${summary.matchedByName} placeholderCount=${summary.placeholderCount} unmatchedModuleNames=${sanitizeCapabilityMapPreview(summary.unmatchedModuleNames.join("、"), 180)}`
  );
}

function createStageAbortSignal(parentSignal: AbortSignal, stage: string, timeoutMs: number) {
  const controller = new AbortController();
  const abortFromParent = () => {
    controller.abort((parentSignal as AbortSignal & { reason?: unknown }).reason || new Error("client_abort"));
  };
  const timeout = setTimeout(() => {
    controller.abort(new Error(`stage_timeout:${stage}:${timeoutMs}`));
  }, timeoutMs);

  if (parentSignal.aborted) abortFromParent();
  else parentSignal.addEventListener("abort", abortFromParent, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      parentSignal.removeEventListener("abort", abortFromParent);
    }
  };
}

function pickProcessGraphFallback(fallback: CourseAbilityGraphPayload, warning: string, diagnostic: CourseAbilityDiagnosticCode): CourseAbilityGraphModelOutput {
  return {
    industryGraph: fallback.industryGraph,
    regionalJobGraph: fallback.regionalJobGraph,
    majorAbilityGraph: fallback.majorAbilityGraph,
    coreCourseSuggestions: fallback.coreCourseSuggestions,
    coreCourseGraph: fallback.coreCourseGraph,
    meta: {
      ...fallback.meta,
      source: "mock-fallback",
      warnings: mergeStageWarnings(fallback.meta.warnings, warning, diagnostic)
    }
  };
}

function pickCourseGraphFallback(fallback: CourseAbilityGraphPayload, warning: string, diagnostic: CourseAbilityDiagnosticCode): CourseAbilityGraphModelOutput {
  return {
    workflowStages: fallback.workflowStages,
    teachingModules: fallback.teachingModules,
    tasks: fallback.tasks,
    courseAbilityMap: fallback.courseAbilityMap,
    meta: {
      ...fallback.meta,
      source: "mock-fallback",
      warnings: mergeStageWarnings(fallback.meta.warnings, warning, diagnostic)
    }
  };
}

function pickMappingAnalysisFallback(fallback: CourseAbilityGraphPayload, warning: string, diagnostic: CourseAbilityDiagnosticCode): CourseAbilityGraphModelOutput {
  return {
    moduleMappings: fallback.moduleMappings,
    skillWeights: fallback.skillWeights,
    relatedJobs: fallback.relatedJobs,
    salaryRanges: fallback.salaryRanges,
    evidenceSources: fallback.evidenceSources,
    updateSuggestions: fallback.updateSuggestions,
    meta: {
      ...fallback.meta,
      source: "mock-fallback",
      warnings: mergeStageWarnings(fallback.meta.warnings, warning, diagnostic)
    }
  };
}

function stageFallbackPayload(
  stage: string,
  fallback: CourseAbilityGraphPayload,
  warning: string,
  diagnostic: CourseAbilityDiagnosticCode
): CourseAbilityGraphModelOutput {
  if (stage === CAPABILITY_MAP_PROCESS_GRAPHS_STAGE) return pickProcessGraphFallback(fallback, warning, diagnostic);
  if (stage === CAPABILITY_MAP_COURSE_GRAPH_STAGE) return pickCourseGraphFallback(fallback, warning, diagnostic);
  return pickMappingAnalysisFallback(fallback, warning, diagnostic);
}

function hasExtractableCapabilityMapJson(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const source = fenced || trimmed;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  return start >= 0 && end > start;
}

function extractCapabilityMapJsonCandidate(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const source = fenced || trimmed;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return "";
  return source.slice(start, end + 1);
}

function repairCourseGraphJsonCandidate(content: string) {
  const candidate = extractCapabilityMapJsonCandidate(content);
  if (!candidate) return null;
  const trimmed = content.trim();
  const lastBrace = trimmed.lastIndexOf("}");
  const lastBracket = trimmed.lastIndexOf("]");
  const lastStructuralChar = Math.max(lastBrace, lastBracket);
  const suffix = lastStructuralChar >= 0 ? trimmed.slice(lastStructuralChar + 1).trim() : "";
  const likelyTruncated = !candidate.trim().endsWith("}") || (suffix && !/^(```)?$/i.test(suffix));
  if (likelyTruncated) return null;
  return candidate
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function safeCourseGraphJsonPreview(value: string, length: number, fromTail = false) {
  const source = fromTail ? value.slice(-length) : value.slice(0, length);
  return sanitizeCapabilityMapPreview(source, length);
}

function logCourseGraphParseFailurePreview({
  accumulatedChars,
  content,
  error,
  jsonExtracted
}: {
  accumulatedChars: number;
  content: string;
  error: unknown;
  jsonExtracted: boolean;
}) {
  const candidate = extractCapabilityMapJsonCandidate(content);
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error || "unknown");
  console.warn(
    `[capability-map:model] course_graph_parse_failed accumulatedChars=${accumulatedChars} jsonExtracted=${jsonExtracted} extractedJsonPreview=${safeCourseGraphJsonPreview(candidate, 300)} extractedJsonTailPreview=${safeCourseGraphJsonPreview(candidate, 200, true)} parseErrorName=${sanitizeCapabilityMapErrorMessage(name || "unknown")} parseErrorMessage=${sanitizeCapabilityMapErrorMessage(message)}`
  );
}

function parseStageSkeletonWithRepair(stage: string, content: string, accumulatedChars: number): { repairWarnings: string[]; skeleton: unknown } {
  const jsonExtracted = hasExtractableCapabilityMapJson(content);
  try {
    return { repairWarnings: [], skeleton: parseCapabilityMapJson<unknown>(content) };
  } catch (error) {
    if (stage !== CAPABILITY_MAP_COURSE_GRAPH_STAGE) throw error;
    logCourseGraphParseFailurePreview({ accumulatedChars, content, error, jsonExtracted });
    const repairWarnings = ["STAGE_2_JSON_REPAIR_ATTEMPTED"];
    const repaired = repairCourseGraphJsonCandidate(content);
    if (!repaired) {
      repairWarnings.push("STAGE_2_JSON_REPAIR_FAILED");
      throw Object.assign(new Error("MODEL_JSON_NOT_FOUND"), { repairWarnings });
    }
    try {
      const skeleton = JSON.parse(repaired) as unknown;
      repairWarnings.push("STAGE_2_JSON_REPAIR_SUCCESS");
      return { repairWarnings, skeleton };
    } catch (repairError) {
      repairWarnings.push("STAGE_2_JSON_REPAIR_FAILED");
      throw Object.assign(repairError instanceof Error ? repairError : new Error("MODEL_JSON_NOT_FOUND"), { repairWarnings });
    }
  }
}

async function callCapabilityMapModelAsText({
  maxTokens,
  messages,
  modelConfig,
  signal,
  stage
}: {
  maxTokens: number;
  messages: Parameters<typeof callChatModel>[0]["messages"];
  modelConfig: ReturnType<typeof getAgentModelConfig>["chat"];
  signal: AbortSignal;
  stage: string;
}) {
  let streamedText = "";
  const returnedText = await withRedactedModelConsole(() =>
    callChatModel({
      stage,
      provider: modelConfig.provider,
      model: modelConfig.model,
      messages,
      maxTokens,
      stream: true,
      onToken: (token) => {
        if (token) streamedText += token;
      },
      signal,
      timeoutMs: STAGED_MODEL_TIMEOUT_MS
    })
  );
  const content = (streamedText.trim() || returnedText.trim()).trim();
  if (!content) throw new Error("MODEL_EMPTY_RESPONSE");
  return content;
}

async function runCapabilityMapGenerationStage(
  input: CourseAbilityGraphInput,
  stageConfig: CapabilityMapGenerationStage,
  modelConfig: ReturnType<typeof getAgentModelConfig>["chat"],
  fallback: CourseAbilityGraphPayload,
  context: CapabilityMapGenerationContext,
  signal: AbortSignal
): Promise<{ output: CourseAbilityGraphModelOutput; success: boolean }> {
  const startedAt = Date.now();
  const stageAbort = createStageAbortSignal(signal, stageConfig.stage, STAGED_MODEL_TIMEOUT_MS);
  console.info(
    `[capability-map:model] request_start stage=${stageConfig.stage} provider=${modelConfig.provider} model=${modelConfig.model} stream=true maxTokens=${stageConfig.maxTokens} hasApiKey=${hasProviderApiKey(modelConfig.provider)} hasBaseUrl=${hasProviderBaseUrl(modelConfig.provider)}`
  );
  let accumulatedChars = 0;
  let jsonExtracted = false;
  let parseSuccess = false;
  let repairWarnings: string[] = [];

  try {
    const content = await callCapabilityMapModelAsText({
      stage: stageConfig.stage,
      modelConfig,
      messages: stageConfig.buildMessages(input, context),
      maxTokens: stageConfig.maxTokens,
      signal: stageAbort.signal
    });
    accumulatedChars = content.length;
    jsonExtracted = hasExtractableCapabilityMapJson(content);
    const parsed = parseStageSkeletonWithRepair(stageConfig.stage, content, accumulatedChars);
    repairWarnings = parsed.repairWarnings;
    const skeleton = parsed.skeleton;
    parseSuccess = true;
    const expanded = stageConfig.expand(skeleton, input, fallback, context);
    if (stageConfig.stage === CAPABILITY_MAP_MAPPING_ANALYSIS_STAGE) {
      logMappingAlignmentSummary(summarizeMappingAlignment(skeleton, context.mappingModules, expanded));
    }
    const elapsedMs = Date.now() - startedAt;
    logCapabilityMapStreamStageSummary({
      accumulatedChars,
      diagnostic: "OK",
      elapsedMs,
      jsonExtracted,
      maxTokens: stageConfig.maxTokens,
      model: modelConfig.model,
      parseSuccess,
      provider: modelConfig.provider,
      stage: stageConfig.stage
    });
    return {
      output: {
        ...expanded,
        meta: {
          ...(expanded.meta || {}),
          model: modelConfig.model,
          provider: modelConfig.provider,
          source: "model",
          warnings: Array.from(new Set([...repairWarnings, ...mergeStageWarnings(expanded.meta?.warnings, stageConfig.successWarning)]))
        }
      },
      success: true
    };
  } catch (error) {
    if (signal.aborted) throw error;
    const elapsedMs = Date.now() - startedAt;
    const code = courseAbilityDiagnosticCodeFromError(error);
    const errorRepairWarnings = isRecord(error) && Array.isArray(error.repairWarnings)
      ? error.repairWarnings.filter((warning): warning is string => typeof warning === "string")
      : [];
    logCapabilityMapStreamStageSummary({
      accumulatedChars,
      diagnostic: code,
      elapsedMs,
      jsonExtracted,
      maxTokens: stageConfig.maxTokens,
      model: modelConfig.model,
      parseSuccess,
      provider: modelConfig.provider,
      stage: stageConfig.stage
    });
    console.warn(`[capability-map:model] stage_failed stage=${stageConfig.stage} fallback=stage_mock diagnostic=${code}`);
    const fallbackOutput = stageFallbackPayload(stageConfig.stage, fallback, stageConfig.fallbackWarning, code);
    return {
      output: {
        ...fallbackOutput,
        meta: {
          ...(fallbackOutput.meta || {}),
          warnings: Array.from(new Set([...errorRepairWarnings, ...(fallbackOutput.meta?.warnings || [])]))
        }
      },
      success: false
    };
  } finally {
    stageAbort.cleanup();
  }
}

export function createMockFallbackCourseAbilityGraph(
  input: CourseAbilityGraphInput,
  code: CourseAbilityDiagnosticCode
): CourseAbilityGraphPayload {
  const warnings = [courseAbilityDiagnosticWarning(code)];
  const graph = createMockCourseAbilityGraph(input, warnings);
  return {
    ...graph,
    meta: {
      ...graph.meta,
      source: "mock-fallback",
      warnings: Array.from(new Set([...graph.meta.warnings, ...warnings]))
    }
  };
}

export async function testCapabilityMapMinimalModelCall(): Promise<CapabilityMapMinimalModelCallResult> {
  const modelConfig = getAgentModelConfig().chat;
  const controller = new AbortController();
  const startedAt = Date.now();

  logCapabilityMapModelRequestSummary(
    modelConfig.provider,
    modelConfig.model,
    CAPABILITY_MAP_MINIMAL_TEST_STAGE,
    CAPABILITY_MAP_MINIMAL_TEST_MAX_TOKENS
  );

  try {
    const content = await withRedactedModelConsole(() =>
      callChatModel({
        stage: CAPABILITY_MAP_MINIMAL_TEST_STAGE,
        provider: modelConfig.provider,
        model: modelConfig.model,
        messages: [
          {
            role: "system",
            content: "你是一个 JSON 测试助手。"
          },
          {
            role: "user",
            content: '请只返回以下 JSON，不要 Markdown，不要解释：{"ok":true,"courseName":"AI动画全流程制作"}'
          }
        ],
        maxTokens: CAPABILITY_MAP_MINIMAL_TEST_MAX_TOKENS,
        signal: controller.signal,
        timeoutMs: CAPABILITY_MAP_MINIMAL_TEST_TIMEOUT_MS
      })
    );
    const elapsedMs = Date.now() - startedAt;
    console.info(
      `[capability-map:model] minimal_test_success stage=${CAPABILITY_MAP_MINIMAL_TEST_STAGE} provider=${modelConfig.provider} model=${modelConfig.model} elapsedMs=${elapsedMs} contentPreview=${sanitizeCapabilityMapErrorMessage(content).slice(0, 120)}`
    );
    return {
      content,
      elapsedMs,
      maxTokens: CAPABILITY_MAP_MINIMAL_TEST_MAX_TOKENS,
      model: modelConfig.model,
      ok: true,
      provider: modelConfig.provider,
      stage: CAPABILITY_MAP_MINIMAL_TEST_STAGE
    };
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const diagnostic = courseAbilityDiagnosticCodeFromError(error);
    const summary = summarizeCapabilityMapModelError(error);
    logCapabilityMapModelErrorSummary(error, diagnostic, CAPABILITY_MAP_MINIMAL_TEST_STAGE, elapsedMs);
    return {
      code: summary.code === "-" ? undefined : summary.code,
      diagnostic,
      elapsedMs,
      errorName: summary.name,
      maxTokens: CAPABILITY_MAP_MINIMAL_TEST_MAX_TOKENS,
      message: summary.message,
      model: modelConfig.model,
      ok: false,
      provider: modelConfig.provider,
      stage: CAPABILITY_MAP_MINIMAL_TEST_STAGE,
      status: summary.status === "-" ? undefined : summary.status
    };
  }
}

export async function testCapabilityMapProviderResponseShape(): Promise<CapabilityMapProviderResponseShapeResult> {
  const modelConfig = getAgentModelConfig().chat;
  const { apiKey, url } = getCapabilityMapProviderDiagnosticConfig(modelConfig.provider);
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`response_shape_timeout:${CAPABILITY_MAP_RESPONSE_SHAPE_TEST_TIMEOUT_MS}`));
  }, CAPABILITY_MAP_RESPONSE_SHAPE_TEST_TIMEOUT_MS);

  logCapabilityMapModelRequestSummary(
    modelConfig.provider,
    modelConfig.model,
    CAPABILITY_MAP_RESPONSE_SHAPE_TEST_STAGE,
    CAPABILITY_MAP_RESPONSE_SHAPE_TEST_MAX_TOKENS
  );

  try {
    if (!apiKey?.trim()) throw new Error("MISSING_MODEL_CONFIG");

    const response = await withRedactedModelConsole(() =>
      fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: modelConfig.model,
          messages: [
            {
              role: "system",
              content: "你是一个 JSON 测试助手。"
            },
            {
              role: "user",
              content: '请只返回以下 JSON，不要 Markdown，不要解释：{"ok":true,"courseName":"AI动画全流程制作"}'
            }
          ],
          stream: false,
          max_tokens: CAPABILITY_MAP_RESPONSE_SHAPE_TEST_MAX_TOKENS
        }),
        signal: controller.signal
      })
    );
    const rawText = await response.text().catch(() => "");
    const elapsedMs = Date.now() - startedAt;
    const summary = summarizeProviderResponseShape(rawText, response.status, response.headers.get("content-type") || "");
    console.info(
      `[capability-map:model] response_shape_summary stage=${CAPABILITY_MAP_RESPONSE_SHAPE_TEST_STAGE} provider=${modelConfig.provider} model=${modelConfig.model} elapsedMs=${elapsedMs} summary=${JSON.stringify(summary)}`
    );

    return {
      elapsedMs,
      maxTokens: CAPABILITY_MAP_RESPONSE_SHAPE_TEST_MAX_TOKENS,
      model: modelConfig.model,
      ok: response.ok && summary.hasContent,
      provider: modelConfig.provider,
      stage: CAPABILITY_MAP_RESPONSE_SHAPE_TEST_STAGE,
      summary
    };
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const diagnostic = courseAbilityDiagnosticCodeFromError(error);
    const summary = summarizeCapabilityMapModelError(error);
    logCapabilityMapModelErrorSummary(error, diagnostic, CAPABILITY_MAP_RESPONSE_SHAPE_TEST_STAGE, elapsedMs);
    return {
      code: summary.code === "-" ? undefined : summary.code,
      diagnostic,
      elapsedMs,
      errorName: summary.name,
      maxTokens: CAPABILITY_MAP_RESPONSE_SHAPE_TEST_MAX_TOKENS,
      message: summary.message,
      model: modelConfig.model,
      ok: false,
      provider: modelConfig.provider,
      stage: CAPABILITY_MAP_RESPONSE_SHAPE_TEST_STAGE
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateCourseAbilityGraph(input: CourseAbilityGraphInput, options: GenerateOptions = {}): Promise<CourseAbilityGraphPayload> {
  const modelConfig = getAgentModelConfig().chat;
  const fallback = createMockCourseAbilityGraph(input);
  const signal = options.signal || new AbortController().signal;
  const stages: CapabilityMapGenerationStage[] = [
    {
      buildMessages: (stageInput) => buildCapabilityMapProcessGraphsMessages(stageInput),
      expand: (raw, stageInput, stageFallback) =>
        expandProcessGraphsSemanticSkeleton(raw as ProcessGraphsSemanticSkeleton, stageInput, stageFallback),
      fallbackWarning: STAGE_WARNINGS.processGraphsFailed,
      maxTokens: PROCESS_GRAPHS_MAX_TOKENS,
      stage: CAPABILITY_MAP_PROCESS_GRAPHS_STAGE,
      successWarning: STAGE_WARNINGS.processGraphsUsedModel
    },
    {
      buildMessages: (stageInput) => buildCapabilityMapCourseGraphMessages(stageInput),
      expand: (raw, stageInput, stageFallback) =>
        expandCourseStructureSemanticSkeleton(raw as CourseStructureSemanticSkeleton, stageInput, stageFallback),
      fallbackWarning: STAGE_WARNINGS.courseGraphFailed,
      maxTokens: COURSE_GRAPH_MAX_TOKENS,
      stage: CAPABILITY_MAP_COURSE_GRAPH_STAGE,
      successWarning: STAGE_WARNINGS.courseGraphUsedModel
    },
    {
      buildMessages: (stageInput, context) => buildCapabilityMapMappingAnalysisMessages(stageInput, context.mappingModules),
      expand: (raw, stageInput, stageFallback, context) =>
        expandMappingAnalysisSemanticSkeleton(raw as MappingAnalysisSemanticSkeleton, stageInput, stageFallback, context.mappingModules),
      fallbackWarning: STAGE_WARNINGS.mappingAnalysisFailed,
      maxTokens: MAPPING_ANALYSIS_MAX_TOKENS,
      stage: CAPABILITY_MAP_MAPPING_ANALYSIS_STAGE,
      successWarning: STAGE_WARNINGS.mappingAnalysisUsedModel
    }
  ];

  try {
    let merged: CourseAbilityGraphModelOutput = {
      course: input,
      meta: {
        generatedAt: new Date().toISOString(),
        model: modelConfig.model,
        provider: modelConfig.provider,
        source: "model",
        warnings: []
      }
    };
    let successCount = 0;
    const context: CapabilityMapGenerationContext = {};

    for (const stageConfig of stages) {
      const stageResult = await runCapabilityMapGenerationStage(input, stageConfig, modelConfig, fallback, context, signal);
      merged = mergeModelOutput(merged, stageResult.output);
      if (stageResult.success) successCount += 1;
      if (Array.isArray(merged.teachingModules)) {
        const mappingModules: MappingModuleReference[] = [];
        merged.teachingModules.forEach((module) => {
          const name = (module as { name?: unknown }).name;
          const id = (module as { id?: unknown }).id;
          const hours = (module as { hours?: unknown }).hours;
          if (typeof id !== "string" || typeof name !== "string") return;
          mappingModules.push({
            moduleId: id,
            moduleName: name,
            ...(typeof hours === "number" ? { hours } : {}),
            taskNames: Array.isArray(merged.tasks)
              ? merged.tasks
                  .filter((task) => isRecord(task) && task.moduleId === id && typeof task.name === "string")
                  .map((task) => String((task as { name: string }).name))
                  .slice(0, 5)
              : []
          });
        });
        context.mappingModules = mappingModules;
      }
    }

    merged.meta = {
      ...(merged.meta || {}),
      generatedAt: new Date().toISOString(),
      model: modelConfig.model,
      provider: modelConfig.provider,
      source: successCount > 0 ? "model" : "mock-fallback",
      warnings: Array.from(new Set(merged.meta?.warnings || []))
    };

    return normalizeCourseAbilityGraphPayload(merged, input);
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    const code = courseAbilityDiagnosticCodeFromError(error);
    logCapabilityMapModelErrorSummary(error, code);
    console.warn(`[capability-map:model] generation_failed fallback=full_mock code=${code}`);
    return createMockFallbackCourseAbilityGraph(input, code);
  }
}
