import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  generateSubrouterImage2,
  getImage2Config,
  getImage2KeyPoolSnapshot,
  resetImage2KeyPoolForTests
} from "@/lib/image/subrouter";

type SanitizedCallLog = {
  name: string;
  keyIndex: number | null;
  status: number;
  ok: boolean;
  elapsedMs: number;
  requestId: string | null;
  upstream: string | null;
  bodySummary: string;
};

function loadDotEnv(path = resolve(process.cwd(), ".env")) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    const value = rawValue.replace(/^["']|["']$/g, "");
    process.env[key] = value;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function getKeyIndexByToken(token: string) {
  for (const index of [1, 2, 3]) {
    if (process.env[`IMAGE2_API_KEY_${index}`]?.trim() === token) return index;
  }
  return null;
}

function getAuthToken(init?: RequestInit) {
  return String(new Headers(init?.headers).get("authorization") || "").replace(/^Bearer\s+/i, "");
}

async function summarizeBody(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return contentType || "non-json";
  const data = await response
    .clone()
    .json()
    .catch(() => null);
  if (!data || typeof data !== "object") return "empty-json";
  const payload = data as Record<string, unknown>;
  const error = payload.error as Record<string, unknown> | string | undefined;
  if (typeof error === "string") return `error=${error.slice(0, 120)}`;
  if (error && typeof error === "object") return `error=${String(error.message || error.code || "unknown").slice(0, 120)}`;
  const itemCount = Array.isArray(payload.data) ? payload.data.length : Array.isArray(payload.images) ? payload.images.length : 0;
  return `images=${itemCount} model=${String(payload.model || payload.result || "-").slice(0, 60)}`;
}

function createObservedFetch(namePrefix: string, logs: SanitizedCallLog[], maxInFlightByKey: Map<number, number>) {
  const inFlightByKey = new Map<number, number>();
  return async (url: string | URL | Request, init?: RequestInit) => {
    const token = getAuthToken(init);
    const keyIndex = getKeyIndexByToken(token);
    assert(keyIndex !== null, "Outgoing image2 request used an unknown API key.");
    assert(token !== process.env.AGENT_TASK_API_KEY, "Outgoing image2 request used AGENT_TASK_API_KEY.");

    const currentInFlight = (inFlightByKey.get(keyIndex) || 0) + 1;
    inFlightByKey.set(keyIndex, currentInFlight);
    maxInFlightByKey.set(keyIndex, Math.max(maxInFlightByKey.get(keyIndex) || 0, currentInFlight));
    const startedAt = Date.now();
    try {
      const response = await fetch(url, init);
      logs.push({
        name: `${namePrefix}-${logs.length + 1}`,
        keyIndex,
        status: response.status,
        ok: response.ok,
        elapsedMs: Date.now() - startedAt,
        requestId:
          response.headers.get("x-request-id") ||
          response.headers.get("x-subrouter-request-id") ||
          response.headers.get("cf-ray") ||
          null,
        upstream:
          response.headers.get("x-provider") ||
          response.headers.get("x-upstream-provider") ||
          response.headers.get("x-subrouter-provider") ||
          response.headers.get("server") ||
          null,
        bodySummary: await summarizeBody(response)
      });
      return response;
    } finally {
      inFlightByKey.set(keyIndex, Math.max(0, (inFlightByKey.get(keyIndex) || 1) - 1));
    }
  };
}

function jsonResponse(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "x-request-id": `synthetic-${status}` }
  });
}

async function runSyntheticFailover(status: number) {
  resetImage2KeyPoolForTests();
  let attempt = 0;
  const result = await generateSubrouterImage2(
    {
      generationId: `synthetic-${status}`,
      prompt: `synthetic failover status ${status}`,
      aspectRatio: "1:1",
      size: "1024x1024",
      imageSize: "1k",
      count: 1,
      image: null,
      signal: new AbortController().signal
    },
    {
      fetchImpl: async (_url, init) => {
        attempt += 1;
        const keyIndex = getKeyIndexByToken(getAuthToken(init));
        if (attempt === 1) return jsonResponse(status, { error: { message: `synthetic ${status}` } });
        return jsonResponse(200, { data: [{ url: `https://example.com/synthetic-${status}.png` }], keyIndex });
      }
    }
  );
  return { status, attempts: result.attempts, finalKeyIndex: result.keyIndex, ok: result.images.length === 1 };
}

async function main() {
  loadDotEnv();
  const config = getImage2Config();
  const keys = config.keys.map((item) => item.index);
  assert(config.provider === "subrouter", `Expected IMAGE2_PROVIDER=subrouter, got ${config.provider}`);
  assert(config.baseUrl === "https://subrouter.ai/v1", `Expected IMAGE2_BASE_URL=https://subrouter.ai/v1, got ${config.baseUrl}`);
  assert(config.model === "gpt-image-2", `Expected IMAGE2_MODEL=gpt-image-2, got ${config.model}`);
  assert(keys.length === 3, `Expected 3 IMAGE2 keys, got ${keys.length}`);
  assert(!keys.some((index) => process.env[`IMAGE2_API_KEY_${index}`] === process.env.AGENT_TASK_API_KEY), "An IMAGE2 key equals AGENT_TASK_API_KEY.");

  const originalMaxConcurrent = process.env.IMAGE2_MAX_CONCURRENT_PER_KEY;
  process.env.IMAGE2_MAX_CONCURRENT_PER_KEY = "1";
  resetImage2KeyPoolForTests();

  const realLogs: SanitizedCallLog[] = [];
  const maxInFlightByKey = new Map<number, number>();
  const observedFetch = createObservedFetch("real-parallel", realLogs, maxInFlightByKey);
  const startedAt = Date.now();
  const prompts = [
    "A simple clean product icon of a silver compass on a white background, minimal, no text",
    "A simple clean product icon of a blue notebook on a white background, minimal, no text",
    "A simple clean product icon of a green desk lamp on a white background, minimal, no text"
  ];

  const parallelResults = await Promise.all(
    prompts.map((prompt, index) =>
      generateSubrouterImage2(
        {
          generationId: `live-parallel-${index + 1}`,
          prompt,
          aspectRatio: "1:1",
          size: "1024x1024",
          imageSize: "1k",
          count: 1,
          image: null,
          signal: AbortSignal.timeout(config.requestTimeoutMs)
        },
        { fetchImpl: observedFetch }
      )
    )
  );
  const parallelElapsedMs = Date.now() - startedAt;
  const parallelKeyIndexes = parallelResults.map((result) => result.keyIndex).sort((a, b) => a - b);
  assert(parallelKeyIndexes.join(",") === "1,2,3", `Expected round-robin split across 1,2,3, got ${parallelKeyIndexes.join(",")}`);
  assert([...maxInFlightByKey.values()].every((value) => value <= 1), `Per-key concurrency limit failed: ${JSON.stringify(Object.fromEntries(maxInFlightByKey))}`);

  resetImage2KeyPoolForTests();
  const liveFailoverLogs: SanitizedCallLog[] = [];
  const failoverMaxInFlight = new Map<number, number>();
  const liveObservedFetch = createObservedFetch("real-after-524", liveFailoverLogs, failoverMaxInFlight);
  let failoverAttempt = 0;
  const failoverResult = await generateSubrouterImage2(
    {
      generationId: "live-failover-524",
      prompt: "A simple clean product icon of an orange safety helmet on a white background, minimal, no text",
      aspectRatio: "1:1",
      size: "1024x1024",
      imageSize: "1k",
      count: 1,
      image: null,
      signal: AbortSignal.timeout(config.requestTimeoutMs)
    },
    {
      fetchImpl: async (url, init) => {
        failoverAttempt += 1;
        if (failoverAttempt === 1) return jsonResponse(524, { error: { message: "synthetic first-hop 524 for failover validation" } });
        return liveObservedFetch(url, init);
      }
    }
  );

  const syntheticFailovers = [];
  for (const status of [429, 500, 524]) {
    syntheticFailovers.push(await runSyntheticFailover(status));
  }

  const summary = {
    ok: true,
    config: {
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      keyIndexes: keys,
      maxConcurrentPerKeyUsedForLiveSplit: 1
    },
    realParallel: {
      elapsedMs: parallelElapsedMs,
      keyIndexes: parallelResults.map((result) => result.keyIndex),
      imagesReturned: parallelResults.map((result) => result.images.length),
      maxInFlightByKey: Object.fromEntries(maxInFlightByKey),
      calls: realLogs
    },
    liveFailoverAfterSynthetic524: {
      attempts: failoverResult.attempts,
      finalKeyIndex: failoverResult.keyIndex,
      imagesReturned: failoverResult.images.length,
      calls: liveFailoverLogs,
      keyPool: getImage2KeyPoolSnapshot()
    },
    syntheticFailovers,
    agentTaskKeyMisuse: false
  };

  console.log(JSON.stringify(summary, null, 2));

  if (originalMaxConcurrent === undefined) delete process.env.IMAGE2_MAX_CONCURRENT_PER_KEY;
  else process.env.IMAGE2_MAX_CONCURRENT_PER_KEY = originalMaxConcurrent;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
