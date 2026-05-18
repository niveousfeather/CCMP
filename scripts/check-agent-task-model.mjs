import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(filePath) {
  const values = {};
  let text = "";
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return values;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const name = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    values[name] = value;
  }
  return values;
}

function joinVersionedUrl(baseUrl) {
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  return cleanBaseUrl.endsWith("/v1") ? `${cleanBaseUrl}/chat/completions` : `${cleanBaseUrl}/v1/chat/completions`;
}

function normalizeContent(value, data, firstChoice, message) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        if (typeof part?.content === "string") return part.content;
        return "";
      })
      .join("")
      .trim();
  }
  if (typeof message?.reasoning_content === "string" && message.reasoning_content.trim()) return message.reasoning_content;
  if (typeof firstChoice?.text === "string") return firstChoice.text;
  if (typeof data?.content === "string") return data.content;
  if (Array.isArray(data?.content)) {
    return data.content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

function summarizeProviderResponse(value) {
  const choice = Array.isArray(value?.choices) ? value.choices[0] : null;
  const choiceMessage = choice?.message;
  return {
    topLevelKeys: value && typeof value === "object" ? Object.keys(value).slice(0, 12) : [],
    choiceKeys: choice && typeof choice === "object" ? Object.keys(choice).slice(0, 12) : [],
    messageKeys: choiceMessage && typeof choiceMessage === "object" ? Object.keys(choiceMessage).slice(0, 12) : [],
    contentType: Array.isArray(choiceMessage?.content) ? "array" : typeof choiceMessage?.content,
    finishReason: choice?.finish_reason,
    errorMessage: value?.error?.message || value?.message
  };
}

const env = {
  ...loadEnvFile(resolve(process.cwd(), ".env")),
  ...loadEnvFile(resolve(process.cwd(), ".env.local")),
  ...process.env
};
const provider = env.AGENT_TASK_PROVIDER?.trim() || "subrouter";
const apiKeySource = env.AGENT_TASK_API_KEY?.trim()
  ? "AGENT_TASK_API_KEY"
  : env.CLAUDECODER_API_KEY?.trim()
    ? "CLAUDECODER_API_KEY"
    : "missing";
const apiKey = apiKeySource === "AGENT_TASK_API_KEY" ? env.AGENT_TASK_API_KEY.trim() : apiKeySource === "CLAUDECODER_API_KEY" ? env.CLAUDECODER_API_KEY.trim() : "";
const baseUrl = env.AGENT_TASK_BASE_URL?.trim() || "https://subrouter.ai/v1";
const model = env.AGENT_TASK_MODEL?.trim() || "gpt-5.4";

if (!apiKey) {
  console.error("MISSING_AGENT_TASK_API_KEY: please set AGENT_TASK_API_KEY in .env before testing.");
  process.exit(1);
}

if (provider !== "subrouter") {
  console.error(JSON.stringify({
    ok: false,
    provider,
    expectedProvider: "subrouter",
    model,
    baseUrl,
    message: "AGENT_TASK_PROVIDER should be subrouter for background task model checks."
  }, null, 2));
  process.exit(1);
}

if (baseUrl.replace(/\/$/, "") !== "https://subrouter.ai/v1") {
  console.error(JSON.stringify({
    ok: false,
    provider,
    model,
    baseUrl,
    expectedBaseUrl: "https://subrouter.ai/v1",
    message: "AGENT_TASK_BASE_URL should point at the Subrouter OpenAI-compatible v1 endpoint."
  }, null, 2));
  process.exit(1);
}

const startedAt = Date.now();
let response;
try {
  response = await fetch(joinVersionedUrl(baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Please reply with OK only." }],
      stream: false,
      max_tokens: 16
    })
  });
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    provider,
    model,
    baseUrl,
    apiKeySource,
    elapsedMs: Date.now() - startedAt,
    status: null,
    message: error instanceof Error ? error.message : "fetch failed",
    cause: error?.cause?.code || error?.cause?.name || undefined
  }, null, 2));
  process.exit(1);
}

const elapsedMs = Date.now() - startedAt;
const data = await response.json().catch(() => null);
const firstChoice = Array.isArray(data?.choices) ? data.choices[0] : null;
const message = firstChoice?.message;
const rawContent = message?.content;
const content = normalizeContent(rawContent, data, firstChoice, message);

if (!response.ok || typeof content !== "string" || !content.trim()) {
  console.error(JSON.stringify({
    ok: false,
    provider,
    model,
    baseUrl,
    apiKeySource,
    elapsedMs,
    status: response.status,
    message: data?.error?.message || data?.message || "Bad provider response",
    bodySummary: JSON.stringify(data || {}).slice(0, 600),
    contentLength: typeof rawContent === "string" ? rawContent.length : null,
    responseShape: summarizeProviderResponse(data)
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  provider,
  model,
  baseUrl,
  apiKeySource,
  elapsedMs,
  content: content.trim().slice(0, 80)
}, null, 2));
