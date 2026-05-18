import { lookup } from "node:dns/promises";
import type { AgentChatMessage, WebContextResult } from "@/lib/agent/types";
import { callKimiChat, getKimiSummaryModel } from "@/lib/agent/skills/parse-document";

const DEFAULT_WEB_SEARCH_ENDPOINT = "https://qianfan.baidubce.com/v2/ai_search/web_search";
const DEFAULT_CHAT_COMPLETIONS_ENDPOINT = "https://qianfan.baidubce.com/v2/ai_search/chat/completions";
const DEFAULT_QIANFAN_MODEL = "ernie-4.5-turbo-32k";
const DEFAULT_QIANFAN_SEARCH_SOURCE = "baidu_search_v2";
const DEFAULT_SEARXNG_ENDPOINT = "http://127.0.0.1:8080/search";
const DEFAULT_USER_AGENT = "NexusAI-WebContext/1.0";
const QIANFAN_TIMEOUT_MS = 12_000;
const ROBOTS_TIMEOUT_MS = 3000;

type SearchMode = "web_search" | "chat_completions";
type PrimaryProvider = "self_hosted" | "baidu_qianfan";

type QianfanRequestOptions = {
  query: string;
  mode?: SearchMode;
  model?: string;
  searchSource?: string;
  topK?: number;
};

type WebContextError = {
  status?: number;
  requestId?: string;
  code?: string;
  message: string;
};

type WebContextUsage = NonNullable<NonNullable<WebContextResult["rawMeta"]>["usage"]>;

type SelfHostedConfig = {
  enabled: boolean;
  endpoint: string;
  endpointValid: boolean;
  topK: number;
  maxPages: number;
  timeoutMs: number;
  maxBytes: number;
  snippetChars: number;
  respectRobots: boolean;
  userAgent: string;
};

type SearchItem = WebContextResult["items"][number];
type SearchDepth = {
  level: "light" | "standard" | "deep";
  topK: number;
  maxPages: number;
  contextItems: number;
};

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/i
];

function withTimeout(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, clear: () => clearTimeout(timer) };
}

function getSearchMode(value?: string): SearchMode {
  return value === "chat_completions" ? "chat_completions" : "web_search";
}

function getPrimaryProvider(value?: string): PrimaryProvider {
  return value === "baidu_qianfan" || value === "baidu" ? "baidu_qianfan" : "self_hosted";
}

function getBoundedInt(value: string | number | undefined, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getDefaultEndpoint(mode: SearchMode) {
  return mode === "chat_completions" ? DEFAULT_CHAT_COMPLETIONS_ENDPOINT : DEFAULT_WEB_SEARCH_ENDPOINT;
}

function getEndpointForMode(mode: SearchMode) {
  const configuredEndpoint = process.env.AGENT_WEB_SEARCH_ENDPOINT;
  if (!configuredEndpoint) return getDefaultEndpoint(mode);
  if (mode === "web_search" && configuredEndpoint.includes("/chat/completions")) return DEFAULT_WEB_SEARCH_ENDPOINT;
  if (mode === "chat_completions" && configuredEndpoint.includes("/web_search")) return DEFAULT_CHAT_COMPLETIONS_ENDPOINT;
  return configuredEndpoint;
}

function isValidHttpEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getQianfanConfig() {
  const mode = getSearchMode(process.env.AGENT_WEB_SEARCH_MODE);
  return {
    mode,
    apiKey: process.env.AGENT_WEB_SEARCH_API_KEY,
    endpoint: getEndpointForMode(mode),
    model: process.env.AGENT_WEB_SEARCH_MODEL || DEFAULT_QIANFAN_MODEL,
    searchSource: process.env.AGENT_WEB_SEARCH_SOURCE || DEFAULT_QIANFAN_SEARCH_SOURCE,
    topK: getBoundedInt(process.env.AGENT_WEB_SEARCH_TOP_K, 5, 1, 10)
  };
}

function getSelfHostedConfig(): SelfHostedConfig {
  const endpoint = process.env.AGENT_SEARXNG_ENDPOINT || DEFAULT_SEARXNG_ENDPOINT;
  const enabled = process.env.AGENT_WEB_SELF_HOSTED_ENABLED !== "false";
  return {
    enabled,
    endpoint,
    endpointValid: isValidHttpEndpoint(endpoint),
    topK: getBoundedInt(process.env.AGENT_WEB_FETCH_MAX_RESULTS, 12, 1, 20),
    maxPages: getBoundedInt(process.env.AGENT_WEB_FETCH_MAX_PAGES, 5, 0, 8),
    timeoutMs: getBoundedInt(process.env.AGENT_WEB_FETCH_TIMEOUT_MS, 8000, 2500, 20_000),
    maxBytes: getBoundedInt(process.env.AGENT_WEB_PAGE_MAX_BYTES, 2_000_000, 128_000, 4_000_000),
    snippetChars: getBoundedInt(process.env.AGENT_WEB_PAGE_SNIPPET_CHARS, 1800, 500, 4000),
    respectRobots: process.env.AGENT_WEB_RESPECT_ROBOTS !== "false",
    userAgent: process.env.AGENT_WEB_USER_AGENT || DEFAULT_USER_AGENT
  };
}

function getSearchDepth(query: string, config: SelfHostedConfig): SearchDepth {
  const normalized = query.toLowerCase().replace(/\s+/g, "");
  const deepSignals = [
    "对比",
    "比较",
    "调研",
    "报告",
    "方案",
    "行业",
    "市场",
    "趋势",
    "资料",
    "参考",
    "课程标准",
    "政策",
    "工具",
    "推荐",
    "排行",
    "最佳",
    "生成教案",
    "生成ppt",
    "写一份",
    "整理一份"
  ];
  const lightSignals = ["天气", "温度", "气温", "今天", "明天", "现在", "当前"];
  const wantsDeep = deepSignals.some((signal) => normalized.includes(signal.toLowerCase().replace(/\s+/g, "")));
  const wantsLight = lightSignals.some((signal) => normalized.includes(signal.toLowerCase().replace(/\s+/g, ""))) && !wantsDeep;

  if (wantsDeep) {
    return {
      level: "deep",
      topK: Math.min(Math.max(config.topK, 12), 20),
      maxPages: Math.min(Math.max(config.maxPages, 5), 8),
      contextItems: 8
    };
  }

  if (wantsLight) {
    return {
      level: "light",
      topK: Math.min(config.topK, 6),
      maxPages: Math.min(config.maxPages, 3),
      contextItems: 5
    };
  }

  return {
    level: "standard",
    topK: Math.min(Math.max(config.topK, 8), 12),
    maxPages: Math.min(Math.max(config.maxPages, 4), 6),
    contextItems: 6
  };
}

export function getWebSearchConfig() {
  const qianfan = getQianfanConfig();
  const selfHosted = getSelfHostedConfig();
  const primary = getPrimaryProvider(process.env.AGENT_WEB_PRIMARY);
  return {
    primary,
    mode: qianfan.mode,
    hasApiKey: Boolean(qianfan.apiKey),
    endpoint: primary === "self_hosted" ? selfHosted.endpoint : qianfan.endpoint,
    endpointValid: primary === "self_hosted" ? selfHosted.endpointValid : isValidHttpEndpoint(qianfan.endpoint),
    selfHostedEndpoint: selfHosted.endpoint,
    selfHostedEnabled: selfHosted.enabled,
    selfHostedEndpointValid: selfHosted.endpointValid,
    qianfanEndpoint: qianfan.endpoint,
    qianfanEndpointValid: isValidHttpEndpoint(qianfan.endpoint),
    model: qianfan.model,
    searchSource: qianfan.searchSource,
    topK: primary === "self_hosted" ? selfHosted.topK : qianfan.topK
  };
}

function getRequestId(data: unknown, headers?: Headers) {
  const body = getObject(data);
  return (
    getString(body.request_Id) ||
    getString(body.requestId) ||
    getString(body.request_id) ||
    headers?.get("x-bce-request-id") ||
    headers?.get("x-request-id") ||
    undefined
  );
}

function getUsage(data: unknown): WebContextUsage | undefined {
  const usage = getObject(getObject(data).usage);
  const promptTokens = Number(usage.prompt_tokens ?? usage.promptTokens);
  const completionTokens = Number(usage.completion_tokens ?? usage.completionTokens);
  const totalTokens = Number(usage.total_tokens ?? usage.totalTokens);

  if (![promptTokens, completionTokens, totalTokens].some(Number.isFinite)) return undefined;
  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : undefined,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : undefined,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : undefined
  };
}

function getBusinessError(data: unknown, status?: number, headers?: Headers): WebContextError | null {
  const body = getObject(data);
  const error = getObject(body.error);
  const code = getString(body.code) || getString(body.error_code) || getString(error.code) || getString(error.type);
  const message = getString(body.message) || getString(body.error_msg) || getString(error.message);

  if (!code && (!status || status < 400)) return null;
  return {
    status,
    requestId: getRequestId(data, headers),
    code: code || (status ? `HTTP_${status}` : "QIANFAN_ERROR"),
    message: message || "Baidu Qianfan search request failed."
  };
}

function isAccountOverdue(error: WebContextError | null) {
  const text = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return text.includes("account_overdue") || text.includes("overdue") || text.includes("欠费");
}

function logWebContextError(label: string, error: WebContextError) {
  console.error(
    `[agent:web] ${label} status=${error.status || "-"} requestId=${error.requestId || "-"} code=${error.code || "-"} message=${error.message}`
  );
  if (isAccountOverdue(error)) {
    console.error(
      `[agent:web] account_overdue means Baidu Cloud billing/account status needs attention; it is not an API key format issue. requestId=${error.requestId || "-"}`
    );
  }
}

export function shouldUseWebContext(text: string) {
  const normalized = text.toLowerCase().replace(/\s+/g, "");
  return [
    "联网",
    "搜索",
    "网上",
    "今天",
    "今日",
    "明天",
    "当前",
    "现在",
    "最新",
    "近期",
    "实时",
    "天气",
    "温度",
    "气温",
    "降雨",
    "新闻",
    "课程标准",
    "课标",
    "政策",
    "行业数据",
    "市场数据",
    "数据",
    "外部资料",
    "模板",
    "参考资料",
    "查一下",
    "帮我查"
  ].some((keyword) => normalized.includes(keyword.toLowerCase()));
}

export function buildBaiduQianfanSearchRequest({
  query,
  mode = "web_search",
  model = DEFAULT_QIANFAN_MODEL,
  searchSource = DEFAULT_QIANFAN_SEARCH_SOURCE,
  topK = 5
}: QianfanRequestOptions) {
  const base = {
    messages: [{ role: "user", content: query.trim() }],
    search_source: searchSource,
    resource_type_filter: [{ type: "web", top_k: getBoundedInt(topK, 5, 1, 10) }]
  };

  if (mode === "chat_completions") return { ...base, model, stream: false };
  return base;
}

function parseReference(reference: unknown, index: number): SearchItem {
  const item = getObject(reference);
  return {
    id: getString(item.id) || getString(item.doc_id) || String(index + 1),
    title: getString(item.title) || getString(item.name) || `搜索结果 ${index + 1}`,
    url: getString(item.url) || getString(item.link),
    snippet: getString(item.content) || getString(item.snippet) || getString(item.summary),
    website: getString(item.website) || getString(item.site_name) || getString(item.site),
    date: getString(item.date) || getString(item.publish_time) || getString(item.time),
    type: getString(item.type) || getString(item.resource_type)
  };
}

function getReferences(data: unknown) {
  const body = getObject(data);
  const choices = getArray(body.choices);
  const firstChoice = getObject(choices[0]);
  const message = getObject(firstChoice.message);
  const candidates = [body.references, body.results, body.items, body.data, message.references];

  for (const candidate of candidates) {
    const values = getArray(candidate);
    if (values.length) return values;
  }

  return [];
}

export function parseBaiduQianfanSearchResponse(data: unknown, query: string): WebContextResult {
  const references = getReferences(data);
  const items = references.map(parseReference).filter((item) => item.title || item.url || item.snippet).slice(0, 10);

  return {
    provider: "baidu_qianfan",
    query,
    summary: "",
    items,
    rawMeta: {
      requestId: getRequestId(data),
      usage: getUsage(data)
    }
  };
}

async function requestQianfanSearch({
  endpoint,
  apiKey,
  body,
  signal
}: {
  endpoint: string;
  apiKey: string;
  body: unknown;
  signal: AbortSignal;
}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal
  });
  const data = await response.json().catch(() => null);
  const error = getBusinessError(data, response.status, response.headers);

  if (!response.ok || error) {
    throw error || { status: response.status, requestId: getRequestId(data, response.headers), message: "Qianfan search failed." };
  }

  return data;
}

export async function fetchBaiduWebSearch(query: string): Promise<WebContextResult> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return { provider: "baidu_qianfan", query, summary: "联网搜索查询为空，未执行外部检索。", items: [] };
  }

  const config = getQianfanConfig();
  console.info(`[agent:web] baidu config hasApiKey=${Boolean(config.apiKey)} endpoint=${config.endpoint} mode=${config.mode} topK=${config.topK}`);

  if (!isValidHttpEndpoint(config.endpoint)) {
    console.error(`[agent:web] invalid baidu endpoint endpoint=${config.endpoint}`);
    return { provider: "baidu_qianfan", query: trimmedQuery, summary: "联网搜索配置错误：AGENT_WEB_SEARCH_ENDPOINT 必须是合法 http/https URL。", items: [] };
  }

  if (!config.apiKey) {
    console.warn(`[agent:web] missing AGENT_WEB_SEARCH_API_KEY endpoint=${config.endpoint}`);
    return { provider: "baidu_qianfan", query: trimmedQuery, summary: "百度千帆兜底搜索未配置 AGENT_WEB_SEARCH_API_KEY。", items: [] };
  }

  const body = buildBaiduQianfanSearchRequest({
    query: trimmedQuery,
    mode: config.mode,
    model: config.model,
    searchSource: config.searchSource,
    topK: config.topK
  });
  const { controller, clear } = withTimeout(QIANFAN_TIMEOUT_MS);

  try {
    console.info(`[agent:web] baidu request started mode=${config.mode} endpoint=${config.endpoint} topK=${config.topK}`);
    const data = await requestQianfanSearch({ endpoint: config.endpoint, apiKey: config.apiKey, body, signal: controller.signal });
    const result = parseBaiduQianfanSearchResponse(data, trimmedQuery);
    console.info(`[agent:web] baidu request succeeded requestId=${result.rawMeta?.requestId || "-"} items=${result.items.length}`);
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logWebContextError("baidu search timeout", { code: "TIMEOUT", message: "Qianfan search timeout." });
    } else {
      logWebContextError("baidu search failed", error as WebContextError);
    }

    return {
      provider: "baidu_qianfan",
      query: trimmedQuery,
      summary: isAccountOverdue(error as WebContextError)
        ? "百度千帆联网搜索返回 account_overdue。请检查百度云后台计费、账号主体或服务开通状态，这不是 API Key 格式问题。"
        : "百度千帆兜底搜索暂时不可用。请基于已有上下文继续处理，并说明联网资料未能获取。",
      items: [],
      rawMeta: { requestId: (error as WebContextError)?.requestId }
    };
  } finally {
    clear();
  }
}

function parseSearxngResult(value: unknown, index: number): SearchItem {
  const item = getObject(value);
  const parsedUrl = getString(item.url);
  let website = getString(item.engine) || getString(item.category);
  try {
    website = new URL(parsedUrl).hostname || website;
  } catch {
    // Keep search engine/category when URL is unavailable.
  }

  return {
    id: String(index + 1),
    title: getString(item.title) || `搜索结果 ${index + 1}`,
    url: parsedUrl,
    snippet: getString(item.content) || getString(item.snippet),
    website,
    date: getString(item.publishedDate) || getString(item.published_date),
    type: "web"
  };
}

async function fetchSearxngResults(query: string, config: SelfHostedConfig, depth: SearchDepth) {
  const url = new URL(config.endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "zh-CN");
  url.searchParams.set("safesearch", "1");

  const { controller, clear } = withTimeout(config.timeoutMs);
  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": config.userAgent
      },
      signal: controller.signal,
      cache: "no-store"
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw { status: response.status, code: `HTTP_${response.status}`, message: "SearXNG search failed." } satisfies WebContextError;
    }
    return getArray(getObject(data).results).map(parseSearxngResult).filter((item) => item.url).slice(0, depth.topK);
  } finally {
    clear();
  }
}

function isPrivateOrLocalHost(hostname: string) {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function isPrivateAddress(address: string) {
  return (
    /^127\./.test(address) ||
    /^10\./.test(address) ||
    /^192\.168\./.test(address) ||
    /^169\.254\./.test(address) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(address) ||
    address === "0.0.0.0" ||
    address === "::1" ||
    /^fc/i.test(address) ||
    /^fd/i.test(address) ||
    /^fe80:/i.test(address)
  );
}

async function assertPublicHttpUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("UNSUPPORTED_PROTOCOL");
  if (isPrivateOrLocalHost(url.hostname)) throw new Error("PRIVATE_HOST_BLOCKED");

  const records = await lookup(url.hostname, { all: true }).catch(() => []);
  if (records.some((record) => isPrivateAddress(record.address))) throw new Error("PRIVATE_DNS_BLOCKED");
  return url;
}

function getPathForRobots(url: URL) {
  return `${url.pathname || "/"}${url.search || ""}`;
}

function parseRobotsAllows(robots: string, path: string) {
  const lines = robots.split(/\r?\n/);
  let active = false;
  const rules: Array<{ type: "allow" | "disallow"; value: string }> = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const [rawKey, ...rawValue] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rawValue.join(":").trim();

    if (key === "user-agent") {
      const agent = value.toLowerCase();
      active = agent === "*" || agent.includes("nexusai");
      continue;
    }
    if (!active) continue;
    if (key === "allow" || key === "disallow") rules.push({ type: key, value });
  }

  const matching = rules
    .filter((rule) => rule.value && path.startsWith(rule.value))
    .sort((left, right) => right.value.length - left.value.length)[0];
  return !matching || matching.type === "allow";
}

async function isAllowedByRobots(url: URL, config: SelfHostedConfig) {
  if (!config.respectRobots) return true;

  const robotsUrl = new URL("/robots.txt", url.origin);
  const { controller, clear } = withTimeout(ROBOTS_TIMEOUT_MS);
  try {
    const response = await fetch(robotsUrl.toString(), {
      headers: { "User-Agent": config.userAgent },
      signal: controller.signal,
      cache: "no-store"
    });
    if (!response.ok) return true;
    const text = await response.text();
    return parseRobotsAllows(text, getPathForRobots(url));
  } catch {
    return true;
  } finally {
    clear();
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function stripHtml(html: string) {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ");
  const candidate =
    withoutNoise.match(/<article[\s\S]*?<\/article>/i)?.[0] ||
    withoutNoise.match(/<main[\s\S]*?<\/main>/i)?.[0] ||
    withoutNoise.match(/<body[\s\S]*?<\/body>/i)?.[0] ||
    withoutNoise;

  return decodeHtmlEntities(
    candidate
      .replace(/<(h[1-6]|p|li|br|tr|div|section)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function extractTitleFromHtml(html: string, fallback: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  return title ? stripHtml(title).replace(/\s+/g, " ").trim().slice(0, 120) || fallback : fallback;
}

async function fetchReadablePage(item: SearchItem, config: SelfHostedConfig): Promise<SearchItem> {
  const url = await assertPublicHttpUrl(item.url);
  const robotsAllowed = await isAllowedByRobots(url, config);
  if (!robotsAllowed) {
    return {
      ...item,
      snippet: item.snippet || "该网页 robots.txt 不允许抓取正文，已仅保留搜索结果摘要和链接。"
    };
  }

  const { controller, clear } = withTimeout(config.timeoutMs);
  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "User-Agent": config.userAgent
      },
      signal: controller.signal,
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);

    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) throw new Error("UNSUPPORTED_CONTENT_TYPE");

    const contentLength = Number(response.headers.get("content-length") || "0");
    if (contentLength > config.maxBytes) throw new Error("PAGE_TOO_LARGE");

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > config.maxBytes) throw new Error("PAGE_TOO_LARGE");
    const html = Buffer.from(bytes).toString("utf8");
    const text = contentType.includes("text/plain") ? html : stripHtml(html);
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, config.snippetChars);
    if (snippet.length < 80) throw new Error("CONTENT_TOO_SHORT");

    return {
      ...item,
      title: extractTitleFromHtml(html, item.title),
      snippet,
      website: url.hostname,
      type: "web_page"
    };
  } finally {
    clear();
  }
}

async function enrichSearchItems(items: SearchItem[], config: SelfHostedConfig, depth: SearchDepth) {
  if (depth.maxPages <= 0) return items;

  const enriched: SearchItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.url || seen.has(item.url)) continue;
    seen.add(item.url);
    if (enriched.length >= depth.maxPages) break;
    try {
      const enrichedItem = await fetchReadablePage(item, config);
      enriched.push(enrichedItem);
      console.info(`[agent:web:self] page fetched host=${enrichedItem.website || "-"} chars=${enrichedItem.snippet.length}`);
    } catch (error) {
      console.info(`[agent:web:self] page skipped url=${item.url.slice(0, 120)} reason=${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  const enrichedByUrl = new Map(enriched.map((item) => [item.url, item]));
  return items.map((item) => enrichedByUrl.get(item.url) || item);
}

export async function fetchSelfHostedWebSearch(query: string): Promise<WebContextResult> {
  const trimmedQuery = query.trim();
  const config = getSelfHostedConfig();
  if (!trimmedQuery) {
    return { provider: "nexus_self_hosted", query, summary: "联网搜索查询为空，未执行外部检索。", items: [] };
  }
  if (!config.enabled) {
    return { provider: "nexus_self_hosted", query: trimmedQuery, summary: "自建联网搜索未启用。", items: [] };
  }
  if (!config.endpointValid) {
    return { provider: "nexus_self_hosted", query: trimmedQuery, summary: "自建搜索配置错误：AGENT_SEARXNG_ENDPOINT 必须是合法 http/https URL。", items: [] };
  }

  try {
    const depth = getSearchDepth(trimmedQuery, config);
    console.info(`[agent:web:self] search started endpoint=${config.endpoint} depth=${depth.level} topK=${depth.topK} maxPages=${depth.maxPages}`);
    const searchItems = await fetchSearxngResults(trimmedQuery, config, depth);
    const items = await enrichSearchItems(searchItems, config, depth);
    console.info(`[agent:web:self] search succeeded items=${items.length} enriched=${items.filter((item) => item.type === "web_page").length}`);
    return {
      provider: "nexus_self_hosted",
      query: trimmedQuery,
      summary: items.length
        ? "已通过自建 SearXNG 搜索并读取公开网页摘要。"
        : "自建搜索没有返回可用结果。",
      items,
      rawMeta: {
        source: "searxng",
        fetchedPages: items.filter((item) => item.type === "web_page").length,
        searchDepth: depth.level
      }
    };
  } catch (error) {
    const webError = error instanceof Error
      ? { code: error.name || "SELF_HOSTED_SEARCH_FAILED", message: error.message }
      : ({ code: "SELF_HOSTED_SEARCH_FAILED", message: "Self hosted search failed." } satisfies WebContextError);
    logWebContextError("self hosted search failed", webError);
    return {
      provider: "nexus_self_hosted",
      query: trimmedQuery,
      summary: `自建搜索暂时不可用：${webError.message}`,
      items: []
    };
  }
}

async function fetchUnifiedWebSearch(query: string): Promise<WebContextResult> {
  const primary = getPrimaryProvider(process.env.AGENT_WEB_PRIMARY);
  if (primary === "baidu_qianfan") return fetchBaiduWebSearch(query);

  const primaryResult = await fetchSelfHostedWebSearch(query);
  if (primaryResult.items.length > 0) return primaryResult;

  console.warn("[agent:web] self hosted search returned no usable items; trying Baidu Qianfan fallback.");
  const fallback = await fetchBaiduWebSearch(query);
  if (fallback.items.length > 0) {
    return {
      ...fallback,
      summary: `自建搜索不可用或无结果，已使用百度千帆兜底。${fallback.summary || ""}`.trim(),
      rawMeta: {
        ...fallback.rawMeta,
        fallbackUsed: true,
        fallbackFrom: "nexus_self_hosted"
      }
    };
  }

  return {
    provider: "nexus_self_hosted",
    query: primaryResult.query,
    summary: `${primaryResult.summary} 百度千帆兜底也未返回可用结果。`.trim(),
    items: [],
    rawMeta: { fallbackUsed: true, fallbackFrom: "nexus_self_hosted", requestId: fallback.rawMeta?.requestId }
  };
}

function formatWebContext(result: WebContextResult) {
  const providerLabel = result.provider === "nexus_self_hosted" ? "自建联网搜索" : "百度千帆 web_search";
  const contextLimit = result.rawMeta?.searchDepth === "deep" ? 8 : result.rawMeta?.searchDepth === "standard" ? 6 : 5;
  const items = result.items
    .slice(0, contextLimit)
    .map((item, index) => {
      const meta = [item.website, item.date, item.type].filter(Boolean).join(" / ");
      return [
        `${index + 1}. ${item.title}`,
        item.snippet ? `摘要：${item.snippet.slice(0, 900)}` : "",
        item.url ? `链接：${item.url}` : "",
        meta ? `来源：${meta}` : ""
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return [
    result.items.length
      ? `联网检索已成功，资料来源：${providerLabel}。请把这些公开网页资料作为内部依据融入回答；除非用户明确要求“列出来源、参考链接、参考资料”，不要在正文主动添加参考来源、来源列表、URL，或“根据检索到的资料”这类引导语。`
      : `联网检索未取得可用资料，来源：${providerLabel}。请基于已有上下文回答，并说明联网资料不足。`,
    result.summary ? `检索状态：${result.summary.slice(0, 600)}` : "检索状态：已执行搜索，摘要将由 NexusAI 主模型基于条目自行整理。",
    items ? `搜索结果：\n${items}` : "搜索结果：暂无可用条目。"
  ].join("\n\n");
}

async function summarizeWebContextWithKimi(result: WebContextResult, query: string) {
  if (!result.items.length) return result;

  try {
    const sourceText = result.items
      .slice(0, 10)
      .map((item, index) =>
        [
          `#${index + 1} ${item.title}`,
          item.website ? `网站：${item.website}` : "",
          item.date ? `日期：${item.date}` : "",
          item.url ? `链接：${item.url}` : "",
          item.snippet ? `内容：${item.snippet.slice(0, 1200)}` : ""
        ]
          .filter(Boolean)
          .join("\n")
      )
      .join("\n\n---\n\n");
    const summary = await callKimiChat({
      model: process.env.AGENT_KIMI_WEB_SUMMARY_MODEL || getKimiSummaryModel(),
      signal: AbortSignal.timeout(10_000),
      messages: [
        {
          role: "system",
          content:
            "你是 Nexus Agent 的联网资料压缩工具层。请只根据给定搜索结果提取可靠事实，不要编造。输出要短、结构清晰，方便最终主模型继续回答。"
        },
        {
          role: "user",
          content: [
            `用户问题：${query}`,
            "",
            "请输出：",
            "1. 3-6 条关键事实。",
            "2. 如有冲突或不确定，单独标注。",
            "3. 不要写长篇回答，不要替用户完成最终创作。",
            "",
            "搜索结果：",
            sourceText
          ].join("\n")
        }
      ]
    });

    return {
      ...result,
      summary: summary.slice(0, 1600),
      rawMeta: {
        ...result.rawMeta,
        source: result.rawMeta?.source ? `${result.rawMeta.source}+kimi_summary` : "kimi_summary"
      }
    };
  } catch (error) {
    console.warn(`[agent:web:kimi] summary failed error=${error instanceof Error ? error.message : "unknown"}`);
    return result;
  }
}

export async function fetchWebContext(query: string, options: { summarize?: boolean } = {}): Promise<AgentChatMessage[]> {
  const result =
    options.summarize === false
      ? await fetchUnifiedWebSearch(query)
      : await summarizeWebContextWithKimi(await fetchUnifiedWebSearch(query), query);
  return [{ role: "system", content: formatWebContext(result) }];
}

export async function fetchWebContextResult(
  query: string,
  options: { summarize?: boolean } = {}
): Promise<{
  messages: AgentChatMessage[];
  result: WebContextResult;
}> {
  const result =
    options.summarize === false
      ? await fetchUnifiedWebSearch(query)
      : await summarizeWebContextWithKimi(await fetchUnifiedWebSearch(query), query);
  return {
    messages: [{ role: "system", content: formatWebContext(result) }],
    result
  };
}
