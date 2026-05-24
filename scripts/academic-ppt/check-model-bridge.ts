const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.ACADEMIC_PPT_TEST_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");

type BridgeResponse = {
  ok?: boolean;
  status?: string;
  finalStatus?: string;
  primaryModel?: string;
  primaryStatus?: string;
  fallbackModel?: string;
  fallbackStatus?: string;
  primaryAttempts?: number;
  fallbackAttempts?: number;
  modelName?: string;
  content?: string;
  errorSummary?: string;
  retryable?: boolean;
  errorType?: string;
  summary?: string;
  stage?: string;
};

function sanitize(value: unknown) {
  return String(value || "")
    .replace(/[A-Za-z]:[\\/][^\s"'<>]+/g, "[local-path]")
    .replace(/\/(?:Users|home|var|tmp|mnt|opt|srv)\/[^\s"'<>]+/g, "[local-path]")
    .replace(/[A-Z0-9_]*(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*/gi, "[sensitive-config]")
    .replace(/\bAuthorization\b/gi, "[auth-header]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "[bearer-token]")
    .replace(/\s+/g, " ")
    .trim();
}

function assertNoSensitiveOutput(value: string) {
  if (/api[_-]?key|authorization|bearer|base url|provider secret|[A-Za-z]:\\/i.test(value)) {
    throw new Error("model bridge returned sensitive-looking output");
  }
}

async function callBridge(
  label: string,
  debug?: {
    simulatePrimaryFailure?: boolean;
    simulatePrimaryTransientFailures?: number;
    simulatePrimaryStreamInterruptedFailures?: number;
    simulatePrimarySuccessAfterTransient?: boolean;
    simulateFallbackSuccess?: boolean;
    retryBackoffMs?: number;
  }
) {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/internal/academic-ppt/model`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "127.0.0.1"
      },
      body: JSON.stringify({
        taskId: "00000000-0000-4000-8000-000000000000",
        tool: "academic-ppt",
        step: label,
        modelPreference: "primary",
        messages: [
          {
            role: "user",
            content: "Return a JSON object with title and bullets."
          }
        ],
        jsonMode: true,
        timeoutMs: Number(process.env.ACADEMIC_PPT_MODEL_BRIDGE_CHECK_TIMEOUT_MS || 60000),
        debug
      })
    });
  } catch (error) {
    const cause = (error as Error & { cause?: { code?: string; port?: number; address?: string } }).cause;
    const reason =
      cause?.code === "ECONNREFUSED"
        ? "connection refused; check that Next.js is running on the expected port"
        : sanitize(error);
    throw new Error(`model bridge route unavailable: ${reason}`);
  }

  const data = (await response.json().catch(() => ({}))) as BridgeResponse;
  const summary = sanitize(data.errorSummary || "");
  const output = {
    label,
    httpStatus: response.status,
    ok: data.ok,
    primaryModel: data.primaryModel || "unknown",
    primaryStatus: data.primaryStatus || "unknown",
    fallbackModel: data.fallbackModel || "unknown",
    fallbackStatus: data.fallbackStatus || "unknown",
    primaryAttempts: data.primaryAttempts ?? 0,
    fallbackAttempts: data.fallbackAttempts ?? 0,
    finalStatus: data.finalStatus || data.status || "unknown",
    modelName: data.modelName || "none",
    retryable: data.retryable,
    errorType: data.errorType,
    summary: sanitize(data.summary || ""),
    stage: data.stage,
    errorSummary: summary || undefined
  };
  assertNoSensitiveOutput(JSON.stringify(output));
  console.log(JSON.stringify(output, null, 2));
  return { response, data, summary, output };
}

async function main() {
  console.log("academic-ppt model bridge check target=/api/internal/academic-ppt/model");

  const primary = await callBridge("check-primary");
  if (primary.data.primaryModel !== "subrouter:gpt-5.4") {
    throw new Error(`expected primaryModel=subrouter:gpt-5.4, got ${primary.data.primaryModel || "unknown"}`);
  }
  if ((primary.data.fallbackModel || "").toLowerCase() !== "moonshot:kimi-k2.5") {
    throw new Error(`expected fallbackModel=moonshot:kimi-k2.5, got ${primary.data.fallbackModel || "unknown"}`);
  }
  if (primary.data.status !== "success") {
    throw new Error(`model bridge unavailable: ${primary.summary || primary.response.status}`);
  }
  if (primary.data.primaryStatus !== "success") {
    console.warn(
      `primary model unavailable; fallback succeeded. primary=${primary.data.primaryModel} fallback=${primary.data.fallbackModel} reason=${
        primary.summary || "unknown"
      }`
    );
  }

  const fallback = await callBridge("check-fallback", { simulatePrimaryFailure: true, simulateFallbackSuccess: true });
  if (fallback.data.primaryStatus !== "failed") {
    throw new Error(`expected simulated primary failure, got ${fallback.data.primaryStatus || "unknown"}`);
  }
  if (fallback.data.fallbackStatus !== "success") {
    throw new Error(`model bridge fallback unavailable: ${fallback.summary || fallback.response.status}`);
  }

  const retry = await callBridge("check-primary-retry", {
    simulatePrimaryTransientFailures: 1,
    simulatePrimarySuccessAfterTransient: true,
    retryBackoffMs: 0
  });
  if (retry.data.primaryStatus !== "success") {
    throw new Error(`model bridge primary retry unavailable: ${retry.summary || retry.response.status}`);
  }
  if (retry.data.primaryAttempts !== 2) {
    throw new Error(`expected non-strategy retry to use 2 primary attempts, got ${retry.data.primaryAttempts || "unknown"}`);
  }
  if (retry.data.fallbackStatus !== "not_started") {
    throw new Error(`expected retry to avoid fallback, got fallbackStatus=${retry.data.fallbackStatus || "unknown"}`);
  }

  const generationRetry = await callBridge("generation", {
    simulatePrimaryTransientFailures: 2,
    simulatePrimarySuccessAfterTransient: true,
    retryBackoffMs: 0
  });
  if (generationRetry.data.primaryStatus !== "success" || generationRetry.data.primaryAttempts !== 3) {
    throw new Error(
      `expected generation stage to retry GPT-5.4 through 3 attempts, got status=${generationRetry.data.primaryStatus || "unknown"} attempts=${
        generationRetry.data.primaryAttempts || "unknown"
      }`
    );
  }
  if (generationRetry.data.fallbackStatus !== "not_started") {
    throw new Error(`expected generation retry to avoid fallback, got fallbackStatus=${generationRetry.data.fallbackStatus || "unknown"}`);
  }

  const strategyRetry = await callBridge("strategy", {
    simulatePrimaryTransientFailures: 3,
    simulatePrimarySuccessAfterTransient: true,
    retryBackoffMs: 0
  });
  if (strategyRetry.data.primaryStatus !== "success" || strategyRetry.data.primaryAttempts !== 4) {
    throw new Error(
      `expected strategy stage to retry GPT-5.4 through 4 attempts, got status=${strategyRetry.data.primaryStatus || "unknown"} attempts=${
        strategyRetry.data.primaryAttempts || "unknown"
      }`
    );
  }
  if (strategyRetry.data.fallbackStatus !== "not_started") {
    throw new Error(`expected strategy retry to avoid fallback, got fallbackStatus=${strategyRetry.data.fallbackStatus || "unknown"}`);
  }

  const streamInterruptedRetry = await callBridge("strategy", {
    simulatePrimaryStreamInterruptedFailures: 1,
    simulatePrimarySuccessAfterTransient: true,
    retryBackoffMs: 0
  });
  if (streamInterruptedRetry.data.primaryStatus !== "success" || streamInterruptedRetry.data.primaryAttempts !== 2) {
    throw new Error(
      `expected stream interrupted strategy retry to recover on GPT-5.4 attempt 2, got status=${
        streamInterruptedRetry.data.primaryStatus || "unknown"
      } attempts=${streamInterruptedRetry.data.primaryAttempts || "unknown"}`
    );
  }
  if (streamInterruptedRetry.data.fallbackStatus !== "not_started") {
    throw new Error(`expected stream interrupted retry to avoid Kimi fallback, got fallbackStatus=${streamInterruptedRetry.data.fallbackStatus || "unknown"}`);
  }

  const strictVisualBlockedFallback = await callBridge("strategy", {
    simulatePrimaryTransientFailures: 6,
    simulatePrimarySuccessAfterTransient: true,
    retryBackoffMs: 0
  });
  if (strictVisualBlockedFallback.response.status !== 503) {
    throw new Error(`expected strict visual exhausted strategy retry to return 503, got ${strictVisualBlockedFallback.response.status}`);
  }
  if (strictVisualBlockedFallback.data.primaryAttempts !== 6) {
    throw new Error(`expected strategy stage to exhaust 6 GPT-5.4 attempts, got ${strictVisualBlockedFallback.data.primaryAttempts || "unknown"}`);
  }
  if (strictVisualBlockedFallback.data.fallbackStatus !== "skipped" || strictVisualBlockedFallback.data.fallbackAttempts !== 0) {
    throw new Error(
      `expected strict visual strategy to skip Kimi final fallback, got status=${
        strictVisualBlockedFallback.data.fallbackStatus || "unknown"
      } attempts=${strictVisualBlockedFallback.data.fallbackAttempts || "unknown"}`
    );
  }
  if (strictVisualBlockedFallback.data.status !== "failed" || strictVisualBlockedFallback.data.finalStatus !== "failed") {
    throw new Error(
      `expected strict visual exhausted retry to fail without fallback deck, got status=${
        strictVisualBlockedFallback.data.status || "unknown"
      } final=${strictVisualBlockedFallback.data.finalStatus || "unknown"}`
    );
  }

  const streamInterruptedBlockedFallback = await callBridge("strategy", {
    simulatePrimaryStreamInterruptedFailures: 6,
    simulatePrimarySuccessAfterTransient: true,
    retryBackoffMs: 0
  });
  if (streamInterruptedBlockedFallback.response.status !== 503) {
    throw new Error(`expected exhausted stream interruption retries to return 503, got ${streamInterruptedBlockedFallback.response.status}`);
  }
  if (streamInterruptedBlockedFallback.data.primaryAttempts !== 6) {
    throw new Error(`expected stream interruption strategy to exhaust 6 GPT-5.4 attempts, got ${streamInterruptedBlockedFallback.data.primaryAttempts || "unknown"}`);
  }
  if (streamInterruptedBlockedFallback.data.retryable !== true || streamInterruptedBlockedFallback.data.errorType !== "stream_interrupted") {
    throw new Error(
      `expected structured stream_interrupted retryable error, got retryable=${String(streamInterruptedBlockedFallback.data.retryable)} errorType=${
        streamInterruptedBlockedFallback.data.errorType || "unknown"
      }`
    );
  }
  if (streamInterruptedBlockedFallback.data.ok !== false) {
    throw new Error(`expected structured stream interruption response to set ok=false, got ok=${String(streamInterruptedBlockedFallback.data.ok)}`);
  }
  if ((streamInterruptedBlockedFallback.data.summary || "") !== "model stream interrupted, retryable") {
    throw new Error(`expected safe stream interrupted summary, got ${streamInterruptedBlockedFallback.data.summary || "unknown"}`);
  }
  if (streamInterruptedBlockedFallback.data.fallbackStatus !== "skipped" || streamInterruptedBlockedFallback.data.fallbackAttempts !== 0) {
    throw new Error(
      `expected exhausted stream interruption retries to skip Kimi final fallback, got status=${
        streamInterruptedBlockedFallback.data.fallbackStatus || "unknown"
      } attempts=${streamInterruptedBlockedFallback.data.fallbackAttempts || "unknown"}`
    );
  }

  console.log("academic-ppt model bridge live check passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? sanitize(error.message) : "model bridge check failed");
  process.exit(1);
});
