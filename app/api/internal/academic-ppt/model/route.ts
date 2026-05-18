import { NextResponse } from "next/server";

import { getAgentModelConfig } from "@/lib/agent/models";
import { isAgentProviderRequestError } from "@/lib/agent/router";
import type { AgentChatMessage, AgentProvider } from "@/lib/agent/types";
import {
  appendAcademicPptLog,
  updateAcademicPptTaskRecord
} from "@/lib/smart-tools/academic-ppt/server-task-store";
import type {
  AcademicPptModelBridgeAttemptStatus,
  AcademicPptModelBridgeStatus
} from "@/lib/smart-tools/academic-ppt/types";

export const runtime = "nodejs";

type ModelBridgeRequest = {
  taskId?: string;
  tool?: string;
  step?: string;
  modelPreference?: "primary" | "fallback";
  messages?: AgentChatMessage[];
  jsonMode?: boolean;
  stream?: boolean;
  strictVisualPipeline?: boolean;
  timeoutMs?: number;
  resumeContext?: Record<string, unknown>;
  debug?: {
    simulatePrimaryFailure?: boolean;
    simulatePrimaryTransientFailures?: number;
    simulatePrimarySuccessAfterTransient?: boolean;
    retryBackoffMs?: number;
  };
};

type AcademicPptBridgeEndpoint = {
  model: string;
  provider: AgentProvider;
};

type AcademicPptBridgeDiagnostics = {
  primaryModel: string;
  primaryStatus: AcademicPptModelBridgeAttemptStatus;
  fallbackModel: string;
  fallbackStatus: AcademicPptModelBridgeAttemptStatus;
  finalStatus: AcademicPptModelBridgeStatus;
  primaryAttempts: number;
  fallbackAttempts: number;
  errorSummary?: string;
};

class AcademicPptProviderCallError extends Error {
  kind: "server_timeout" | "provider_504" | "provider_error" | "network_error" | "bad_response";
  status?: number;
  elapsedMs: number;

  constructor({
    elapsedMs,
    kind,
    message,
    status
  }: {
    elapsedMs: number;
    kind: AcademicPptProviderCallError["kind"];
    message: string;
    status?: number;
  }) {
    super(message);
    this.name = "AcademicPptProviderCallError";
    this.kind = kind;
    this.status = status;
    this.elapsedMs = elapsedMs;
  }
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1"]);
const ACADEMIC_PPT_PRIMARY_MODEL_LABEL = "subrouter:gpt-5.4";
const ACADEMIC_PPT_FALLBACK_MODEL_LABEL = "moonshot:kimi-k2.5";
const ACADEMIC_PPT_STRICT_VISUAL_PIPELINE = readBooleanEnv("ACADEMIC_PPT_STRICT_VISUAL_PIPELINE", true);
const ACADEMIC_PPT_ALLOW_KIMI_FINAL_FALLBACK = readBooleanEnv("ACADEMIC_PPT_ALLOW_KIMI_FINAL_FALLBACK", false);
const STRATEGY_PRIMARY_MAX_ATTEMPTS = readPositiveIntEnv("ACADEMIC_PPT_MAX_PRIMARY_RETRIES_STRATEGY", 6);
const DEFAULT_PRIMARY_MAX_ATTEMPTS = readPositiveIntEnv("ACADEMIC_PPT_MAX_PRIMARY_RETRIES_DEFAULT", 4);
const PRIMARY_RETRY_BACKOFF_MS = [5000, 15000, 30000, 60000, 120000] as const;
const ACADEMIC_PPT_SYSTEM_INSTRUCTION =
  "You are the internal academic-ppt generation model. Follow the user's schema request exactly. Return concise, usable content for academic slide generation. Do not mention provider settings, keys, base URLs, or internal routing.";

function readBooleanEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function readPositiveIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function requestHost(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return forwarded || realIp || "127.0.0.1";
}

function sanitizeError(value: unknown) {
  const raw = value instanceof Error ? value.message : String(value || "Model call failed.");
  return stripHtmlProviderBody(raw)
    .replace(/[A-Za-z]:[\\/][^\s"'<>]+/g, "[local-path]")
    .replace(/\/(?:Users|home|var|tmp|mnt|opt|srv)\/[^\s"'<>]+/g, "[local-path]")
    .replace(/\bhttps?:\/\/[^\s"'<>]+/gi, "[provider-url]")
    .replace(/[A-Z0-9_]*(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*/gi, "[sensitive-config]")
    .replace(/\bAuthorization\b/gi, "[auth-header]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "[bearer-token]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function stripHtmlProviderBody(raw: string) {
  if (!/<\/?[a-z][\s\S]*>|<!doctype/i.test(raw)) return raw;
  const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const compact = title.replace(/\s+/g, " ").trim();
  if (/524|timeout|timed out/i.test(`${compact} ${raw}`)) return "provider timeout status=524";
  if (/504|gateway timeout/i.test(`${compact} ${raw}`)) return "provider timeout status=504";
  return compact ? `provider returned HTML error: ${compact}` : "provider returned HTML error body";
}

function modelLabel(endpoint: AcademicPptBridgeEndpoint) {
  return `${endpoint.provider}:${endpoint.model}`;
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function joinVersionedUrl(baseUrl: string, versionedPath: string, unversionedPath: string) {
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  return cleanBaseUrl.endsWith("/v1") ? joinUrl(cleanBaseUrl, unversionedPath) : joinUrl(cleanBaseUrl, versionedPath);
}

function getAcademicPptProviderConfig(provider: AgentProvider) {
  if (provider === "subrouter") {
    return {
      credential: process.env.AGENT_TASK_API_KEY || process.env.CLAUDECODER_API_KEY,
      url: joinVersionedUrl(process.env.AGENT_TASK_BASE_URL || "https://subrouter.ai/v1", "/v1/chat/completions", "/chat/completions")
    };
  }
  if (provider === "moonshot") {
    return {
      credential: process.env.MOONSHOT_API_KEY,
      url: joinUrl(process.env.MOONSHOT_BASE_URL || "https://api.moonshot.cn/v1", "/chat/completions")
    };
  }
  if (provider === "claudecoder") {
    return {
      credential: process.env.CLAUDECODER_API_KEY,
      url: joinVersionedUrl(process.env.CLAUDECODER_BASE_URL || "https://china.claudecoder.me/v1", "/v1/chat/completions", "/chat/completions")
    };
  }
  return {
    credential: process.env.XHEAI_API_KEY,
    url: joinVersionedUrl(process.env.XHEAI_BASE_URL || "https://api.xheai.cc", "/v1/chat/completions", "/chat/completions")
  };
}

function getAcademicPptModelEndpoints(): { primary: AcademicPptBridgeEndpoint; fallback: AcademicPptBridgeEndpoint } {
  const config = getAgentModelConfig();
  const [primaryProvider, primaryModel] = ACADEMIC_PPT_PRIMARY_MODEL_LABEL.split(":") as [AgentProvider, string];
  const [fallbackProvider] = ACADEMIC_PPT_FALLBACK_MODEL_LABEL.split(":") as [AgentProvider, string];
  return {
    primary: {
      provider: primaryProvider,
      model: primaryModel
    },
    fallback: {
      provider: fallbackProvider,
      model: config.taskFallback.model || "kimi-k2.5"
    }
  };
}

function classifyAcademicPptModelBridgeFailure(error: unknown, signal?: AbortSignal) {
  if (error instanceof AcademicPptProviderCallError) {
    const status = error.status ? ` status=${error.status}` : "";
    if (error.kind === "server_timeout") return `timeout${status}`;
    if (error.kind === "provider_504" || error.status === 504 || error.status === 524) return `provider timeout${status}`;
    if (error.status === 502 || error.status === 503) return `model provider unavailable${status}`;
    if (error.kind === "bad_response") return `model response parse failed${status}`;
    if (error.kind === "network_error") return `model provider unavailable${status}`;
    return `${error.kind}${status}`.trim();
  }
  if (isAgentProviderRequestError(error)) {
    const status = error.status ? ` status=${error.status}` : "";
    if (error.kind === "server_timeout") return `timeout${status}`;
    if (error.kind === "provider_504" || error.status === 504 || error.status === 524) return `provider timeout${status}`;
    if (error.status === 502 || error.status === 503) return `model provider unavailable${status}`;
    if (error.kind === "bad_response") return `model response parse failed${status}`;
    if (error.kind === "network_error") return `model provider unavailable${status}`;
    return `${error.kind}${status}`.trim();
  }
  const message = sanitizeError(error);
  const lower = message.toLowerCase();
  if (signal?.aborted || lower.includes("timeout") || lower.includes("aborterror")) return `timeout${message ? `: ${message}` : ""}`;
  if (lower.includes("econnrefused") || lower.includes("connection refused") || lower.includes("fetch failed")) return `connection refused: ${message}`;
  if (lower.includes("404") || lower.includes("not found")) return `wrong port or route unavailable: ${message}`;
  if (lower.includes("invalid model bridge request") || lower.includes("messages are empty")) return `route schema invalid: ${message}`;
  if (lower.includes("missing_agent_task") || lower.includes("missing_kimi") || lower.includes("missing_")) return `auth missing: ${message}`;
  if (lower.includes("provider_error_524") || lower.includes("provider_504")) return `provider timeout: ${message}`;
  if (lower.includes("provider_error")) return `model provider unavailable: ${message}`;
  if (lower.includes("json") || lower.includes("parse")) return `model response parse failed: ${message}`;
  if (lower.includes("unsupported") && lower.includes("json")) return `unsupported json mode: ${message}`;
  return message || "model provider unavailable";
}

function isRetryablePrimaryFailure(error: unknown, summary: string, signal: AbortSignal) {
  if (signal.aborted) return true;
  if (error instanceof AcademicPptProviderCallError) {
    return error.kind === "server_timeout" || error.kind === "provider_504" || [502, 503, 504, 524].includes(error.status || 0);
  }
  if (isAgentProviderRequestError(error)) {
    return error.kind === "server_timeout" || error.kind === "provider_504" || [502, 503, 504, 524].includes(error.status || 0);
  }
  return /524|504|502|503|timeout|provider_504|provider_error_524|gateway|temporar/i.test(summary);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeStageName(step: string | undefined) {
  return String(step || "generation").toLowerCase().replace(/^academic_ppt:/, "").replace(/^academic-ppt:/, "");
}

function isStrategyStage(stageName: string) {
  return /strategy|strategist|design[_-]?spec/.test(stageName);
}

function isKeyAcademicPptStage(stageName: string) {
  return /strategy|strategist|design[_-]?spec|generation|svg|visual[_-]?qa|repair|research|manuscript/.test(stageName);
}

function isStrictVisualStage(stageName: string) {
  return /strategy|strategist|design[_-]?spec|generation|svg|visual[_-]?qa|repair/.test(stageName);
}

function primaryMaxAttemptsForStage(stageName: string) {
  if (isStrategyStage(stageName)) return STRATEGY_PRIMARY_MAX_ATTEMPTS;
  if (isKeyAcademicPptStage(stageName)) return DEFAULT_PRIMARY_MAX_ATTEMPTS;
  return DEFAULT_PRIMARY_MAX_ATTEMPTS;
}

function primaryRetryBackoffMs(retryIndex: number) {
  const base = PRIMARY_RETRY_BACKOFF_MS[Math.min(retryIndex, PRIMARY_RETRY_BACKOFF_MS.length - 1)];
  const jitter = Math.round(base * 0.08 * Math.random());
  return base + jitter;
}

function primaryRetryBackoffMsForRequest(body: ModelBridgeRequest, retryIndex: number) {
  if (body.debug && typeof body.debug.retryBackoffMs === "number") {
    return Math.max(0, Math.min(Math.round(body.debug.retryBackoffMs), 1000));
  }
  return primaryRetryBackoffMs(retryIndex);
}

function diagnosticPatch(diagnostics: AcademicPptBridgeDiagnostics) {
  return {
    modelBridgeStatus: diagnostics.finalStatus,
    modelBridgePrimaryModel: diagnostics.primaryModel,
    modelBridgePrimaryStatus: diagnostics.primaryStatus,
    modelBridgeFallbackModel: diagnostics.fallbackModel,
    modelBridgeFallbackStatus: diagnostics.fallbackStatus,
    modelBridgeErrorSummary: diagnostics.errorSummary
  };
}

async function updateBridgeDiagnostics(taskId: string, diagnostics: AcademicPptBridgeDiagnostics) {
  await updateAcademicPptTaskRecord(taskId, diagnosticPatch(diagnostics)).catch(() => undefined);
}

function bridgeResponse(
  diagnostics: AcademicPptBridgeDiagnostics,
  extra?: { modelName?: string; content?: string; partial?: string }
) {
  return {
    status: diagnostics.finalStatus === "success" || diagnostics.finalStatus === "fallback_success" ? "success" : "failed",
    finalStatus: diagnostics.finalStatus,
    primaryModel: diagnostics.primaryModel,
    primaryStatus: diagnostics.primaryStatus,
    fallbackModel: diagnostics.fallbackModel,
    fallbackStatus: diagnostics.fallbackStatus,
    primaryAttempts: diagnostics.primaryAttempts,
    fallbackAttempts: diagnostics.fallbackAttempts,
    modelName: extra?.modelName,
    content: extra?.content,
    partial: extra?.partial,
    errorSummary: diagnostics.errorSummary
  };
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`academic_ppt_model_timeout:${ms}`)), ms);
  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timer)
  };
}

function normalizeMessages(messages: unknown): AgentChatMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message) => {
      const raw = message as Partial<AgentChatMessage>;
      const role = raw.role === "system" || raw.role === "assistant" || raw.role === "user" ? raw.role : "user";
      const content = typeof raw.content === "string" ? raw.content : "";
      return { role, content: content.slice(0, 60_000) };
    })
    .filter((message) => message.content.trim())
    .slice(-20);
}

function withAcademicPptSystemInstruction(messages: AgentChatMessage[]): AgentChatMessage[] {
  if (messages.some((message) => message.role === "system" && message.content.trim())) return messages;
  return [{ role: "system", content: ACADEMIC_PPT_SYSTEM_INSTRUCTION }, ...messages];
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

function extractProviderStreamDelta(value: unknown) {
  const payload = value as Record<string, unknown> | null;
  const choices = Array.isArray(payload?.choices) ? payload.choices as Array<Record<string, unknown>> : [];
  const firstChoice = choices[0] || null;
  const delta = firstChoice?.delta as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const content = delta?.content ?? message?.content ?? firstChoice?.text ?? payload?.content;
  if (typeof content === "string") return content;
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
      .join("");
  }
  if (typeof delta?.reasoning_content === "string") return delta.reasoning_content;
  if (typeof message?.reasoning_content === "string") return message.reasoning_content;
  return "";
}

async function readAcademicPptProviderStream(response: Response, signal: AbortSignal) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";

  const processLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) return false;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return data === "[DONE]";
    try {
      content += extractProviderStreamDelta(JSON.parse(data));
    } catch {
      // Keep-alive or non-JSON stream frames are ignored.
    }
    return false;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (signal.aborted) throw new Error("stream interrupted by timeout");
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (processLine(line)) return content.trim();
    }
    if (done) break;
  }

  if (buffer) processLine(buffer);
  return content.trim();
}

async function callAcademicPptProviderModel({
  endpoint,
  messages,
  signal,
  stage,
  stream,
  timeoutMs
}: {
  endpoint: AcademicPptBridgeEndpoint;
  messages: AgentChatMessage[];
  signal: AbortSignal;
  stage: string;
  stream: boolean;
  timeoutMs: number;
}) {
  const config = getAcademicPptProviderConfig(endpoint.provider);
  if (!config.credential) {
    if (endpoint.provider === "subrouter") throw new Error("MISSING_AGENT_TASK_API_KEY");
    if (endpoint.provider === "moonshot") throw new Error("MISSING_KIMI_API_KEY");
    throw new Error(`MISSING_${endpoint.provider.toUpperCase()}_API_KEY`);
  }

  const startedAt = Date.now();
  console.info(
    `[academic-ppt:model] provider=${endpoint.provider} model=${endpoint.model} stage=${stage} request_started stream=${stream} timeoutMs=${timeoutMs}`
  );
  let response: Response;
  try {
    response = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.credential}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: endpoint.model, messages: messages.slice(-20), stream }),
      signal
    });
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const summary = sanitizeError(error);
    const kind = signal.aborted || /timeout|abort/i.test(summary) ? "server_timeout" : "network_error";
    console.error(
      `[academic-ppt:model] provider=${endpoint.provider} model=${endpoint.model} stage=${stage} request_failed kind=${kind} elapsedMs=${elapsedMs} errorSummary=${summary}`
    );
    throw new AcademicPptProviderCallError({ elapsedMs, kind, message: summary });
  }

  const elapsedMs = Date.now() - startedAt;
  if (!response.ok) {
    const rawBody = await response.text().catch(() => "");
    const summary = sanitizeError(stripHtmlProviderBody(rawBody) || `PROVIDER_ERROR_${response.status}`);
    const kind = response.status === 504 || response.status === 524 ? "provider_504" : "provider_error";
    console.error(
      `[academic-ppt:model] provider=${endpoint.provider} model=${endpoint.model} status=${response.status} stage=${stage} kind=${kind} elapsedMs=${elapsedMs} errorSummary=${summary}`
    );
    throw new AcademicPptProviderCallError({
      elapsedMs,
      kind,
      message: `PROVIDER_ERROR_${response.status}: ${summary}`,
      status: response.status
    });
  }

  if (stream) {
    console.info(`[academic-ppt:model] provider=${endpoint.provider} model=${endpoint.model} stage=${stage} stream started.`);
    try {
      const content = await readAcademicPptProviderStream(response, signal);
      console.info(
        `[academic-ppt:model] provider=${endpoint.provider} model=${endpoint.model} stage=${stage} stream completed elapsedMs=${Date.now() - startedAt}.`
      );
      if (!content) {
        throw new AcademicPptProviderCallError({
          elapsedMs: Date.now() - startedAt,
          kind: "bad_response",
          message: "BAD_PROVIDER_STREAM_RESPONSE",
          status: response.status
        });
      }
      return content;
    } catch (error) {
      if (error instanceof AcademicPptProviderCallError) throw error;
      const streamElapsedMs = Date.now() - startedAt;
      const summary = sanitizeError(error);
      console.error(
        `[academic-ppt:model] provider=${endpoint.provider} model=${endpoint.model} stage=${stage} stream interrupted elapsedMs=${streamElapsedMs} errorSummary=${summary}.`
      );
      throw new AcademicPptProviderCallError({
        elapsedMs: streamElapsedMs,
        kind: signal.aborted ? "server_timeout" : "network_error",
        message: summary,
        status: response.status
      });
    }
  }

  const data = await response.json().catch(() => null);
  const content = extractProviderContent(data);
  if (!content) {
    throw new AcademicPptProviderCallError({
      elapsedMs,
      kind: "bad_response",
      message: "BAD_PROVIDER_RESPONSE",
      status: response.status
    });
  }
  console.info(
    `[academic-ppt:model] provider=${endpoint.provider} model=${endpoint.model} stage=${stage} request_succeeded elapsedMs=${Date.now() - startedAt}.`
  );
  return content;
}

function isRelayableModelFailure(message: string, signal: AbortSignal) {
  return signal.aborted || /timeout|PROVIDER_ERROR_5\d\d|gateway|temporar/i.test(message);
}

function formatAttemptFailureLog({
  endpoint,
  stage,
  status,
  summary
}: {
  endpoint: AcademicPptBridgeEndpoint;
  stage: string;
  status?: number;
  summary: string;
}) {
  const statusPart = status ? ` status=${status}` : "";
  return `provider=${endpoint.provider} model=${endpoint.model}${statusPart} stage=${stage} errorSummary=${summary}`;
}

function attemptStatusFromFailure(summary: string, signal: AbortSignal): AcademicPptModelBridgeAttemptStatus {
  return signal.aborted || /timeout|524|504|provider_504|provider_error_524/i.test(summary) ? "timeout" : "failed";
}

export async function POST(request: Request) {
  const host = requestHost(request);
  if (host && !LOCAL_HOSTS.has(host) && !host.startsWith("127.")) {
    return NextResponse.json({ status: "failed", errorSummary: "Internal model bridge only accepts local requests." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as ModelBridgeRequest | null;
  if (!body || body.tool !== "academic-ppt" || !body.taskId) {
    return NextResponse.json({ status: "failed", errorSummary: "Invalid model bridge request." }, { status: 400 });
  }
  const messages = withAcademicPptSystemInstruction(normalizeMessages(body.messages));
  if (!messages.length) {
    return NextResponse.json({ status: "failed", errorSummary: "Model bridge messages are empty." }, { status: 400 });
  }

  const endpoints = getAcademicPptModelEndpoints();
  const timeoutMs = Math.min(Math.max(Number(body.timeoutMs || 240_000), 30_000), 300_000);
  const stageName = normalizeStageName(body.step);
  const primaryMaxAttempts = primaryMaxAttemptsForStage(stageName);
  const strictVisualPipeline = body.strictVisualPipeline ?? ACADEMIC_PPT_STRICT_VISUAL_PIPELINE;
  const allowKimiFinalFallback = ACADEMIC_PPT_ALLOW_KIMI_FINAL_FALLBACK || !strictVisualPipeline || !isStrictVisualStage(stageName);
  const useProviderStream = body.stream !== false;
  const diagnostics: AcademicPptBridgeDiagnostics = {
    primaryModel: modelLabel(endpoints.primary),
    primaryStatus: body.modelPreference === "fallback" ? "skipped" : "not_started",
    fallbackModel: modelLabel(endpoints.fallback),
    fallbackStatus: "not_started",
    finalStatus: "started",
    primaryAttempts: 0,
    fallbackAttempts: 0
  };
  const stage = `academic_ppt:${stageName}`;

  await appendAcademicPptLog(body.taskId, "info", "Model bridge request started.");
  await updateBridgeDiagnostics(body.taskId, diagnostics);

  if (body.modelPreference !== "fallback") {
    for (let attempt = 1; attempt <= primaryMaxAttempts; attempt += 1) {
      const primaryTimeout = withTimeout(timeoutMs);
      diagnostics.primaryAttempts = attempt;
      diagnostics.primaryStatus = "started";
      await appendAcademicPptLog(
        body.taskId,
        "info",
        `Primary model attempt ${attempt}/${primaryMaxAttempts} started: ${diagnostics.primaryModel} stage=${stage}.`
      );
      await updateBridgeDiagnostics(body.taskId, diagnostics);
      try {
        if (body.debug?.simulatePrimaryFailure) {
          throw new Error("SIMULATED_PRIMARY_FAILURE");
        }
        if (attempt <= Number(body.debug?.simulatePrimaryTransientFailures || 0)) {
          throw new Error("PROVIDER_ERROR_524");
        }
        const content = body.debug?.simulatePrimarySuccessAfterTransient
          ? JSON.stringify({ title: "Academic PPT model bridge check", bullets: ["primary retry path verified"] })
          : await callAcademicPptProviderModel({
              endpoint: endpoints.primary,
              messages,
              signal: primaryTimeout.signal,
              stream: useProviderStream,
              stage,
              timeoutMs
            });
        diagnostics.primaryStatus = "success";
        diagnostics.finalStatus = "success";
        diagnostics.errorSummary = undefined;
        await appendAcademicPptLog(
          body.taskId,
          "info",
          `Primary model attempt ${attempt}/${primaryMaxAttempts} completed: ${diagnostics.primaryModel} stage=${stage}.`
        );
        await updateBridgeDiagnostics(body.taskId, diagnostics);
        return NextResponse.json(bridgeResponse(diagnostics, { modelName: endpoints.primary.model, content }));
      } catch (error) {
        const summary = classifyAcademicPptModelBridgeFailure(error, primaryTimeout.signal);
        const providerStatus = isAgentProviderRequestError(error) ? error.status : undefined;
        diagnostics.primaryStatus = attemptStatusFromFailure(summary, primaryTimeout.signal);
        diagnostics.errorSummary = `primary model unavailable: ${summary}`;
        await appendAcademicPptLog(
          body.taskId,
          "warn",
          `Primary model attempt ${attempt}/${primaryMaxAttempts} failed: ${formatAttemptFailureLog({
            endpoint: endpoints.primary,
            stage,
            status: providerStatus,
            summary
          })}.`
        );
        await updateBridgeDiagnostics(body.taskId, diagnostics);
        if (attempt < primaryMaxAttempts && isRetryablePrimaryFailure(error, summary, primaryTimeout.signal)) {
          const backoffMs = primaryRetryBackoffMsForRequest(body, attempt - 1);
          primaryTimeout.dispose();
          await appendAcademicPptLog(
            body.taskId,
            "info",
            `Retrying primary model attempt ${attempt + 1}/${primaryMaxAttempts} after ${Math.round(backoffMs / 1000)}s backoff.`
          );
          await sleep(backoffMs);
          continue;
        }
      } finally {
        primaryTimeout.dispose();
      }
      break;
    }
  }

  if (!allowKimiFinalFallback) {
    diagnostics.fallbackStatus = "skipped";
    diagnostics.finalStatus = "failed";
    diagnostics.errorSummary =
      "GPT-5.4 visual generation stage is temporarily unavailable; strict visual mode did not generate a low-quality fallback deck.";
    await appendAcademicPptLog(
      body.taskId,
      "error",
      `Kimi fallback disabled for strict visual stage=${stage}; final visual output requires ${diagnostics.primaryModel}.`
    );
    await appendAcademicPptLog(body.taskId, "error", "Model bridge final failed.");
    await updateBridgeDiagnostics(body.taskId, diagnostics);
    return NextResponse.json(bridgeResponse(diagnostics), { status: 503 });
  }

  const fallbackTimeout = withTimeout(timeoutMs);
  diagnostics.fallbackAttempts = 1;
  diagnostics.fallbackStatus = "started";
  if (body.modelPreference !== "fallback") {
    await appendAcademicPptLog(body.taskId, "warn", "Primary retries exhausted; starting fallback model.");
  }
  await appendAcademicPptLog(body.taskId, "info", `Fallback model started: ${diagnostics.fallbackModel} stage=${stage}.`);
  await updateBridgeDiagnostics(body.taskId, diagnostics);
  try {
    const content = await callAcademicPptProviderModel({
      endpoint: endpoints.fallback,
      messages,
      signal: fallbackTimeout.signal,
      stream: useProviderStream,
      stage: `${stage}:fallback`,
      timeoutMs
    });
    diagnostics.fallbackStatus = "success";
    diagnostics.finalStatus = body.modelPreference === "fallback" ? "success" : "fallback_success";
    diagnostics.errorSummary = diagnostics.primaryStatus === "success" ? undefined : diagnostics.errorSummary;
    await appendAcademicPptLog(body.taskId, "info", `Fallback model completed: ${diagnostics.fallbackModel}.`);
    await updateBridgeDiagnostics(body.taskId, diagnostics);
    return NextResponse.json(bridgeResponse(diagnostics, { modelName: endpoints.fallback.model, content }));
  } catch (fallbackError) {
    const fallbackSummary = classifyAcademicPptModelBridgeFailure(fallbackError, fallbackTimeout.signal);
    diagnostics.fallbackStatus = attemptStatusFromFailure(fallbackSummary, fallbackTimeout.signal);
    diagnostics.finalStatus = "failed";
    diagnostics.errorSummary = `fallback model unavailable: ${fallbackSummary}`;
    await appendAcademicPptLog(body.taskId, "error", `Fallback model failed: ${diagnostics.errorSummary}.`);
    await appendAcademicPptLog(body.taskId, "error", "Model bridge final failed.");
    await updateBridgeDiagnostics(body.taskId, diagnostics);
    return NextResponse.json(bridgeResponse(diagnostics), { status: isRelayableModelFailure(fallbackSummary, fallbackTimeout.signal) ? 503 : 200 });
  } finally {
    fallbackTimeout.dispose();
  }
}
