import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function assertIncludes(source: string, needle: string, label: string) {
  if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}

function assertMatches(source: string, pattern: RegExp, label: string) {
  if (!pattern.test(source)) throw new Error(`${label}: missing ${pattern}`);
}

const chatRoute = read("app/api/ai/chat/route.ts");
const agentRouter = read("lib/agent/router.ts");
const modelConfig = read("lib/agent/models.ts");

assertIncludes(agentRouter, "class AgentProviderRequestError", "agent router should expose structured provider errors");
assertIncludes(agentRouter, "requestId", "agent router should capture provider request ids");
assertIncludes(agentRouter, "elapsedMs", "agent router should log elapsed provider time");
assertIncludes(agentRouter, "provider_504", "agent router should classify provider 504 errors");
assertIncludes(agentRouter, "server_timeout", "agent router should classify local server timeouts");
assertIncludes(agentRouter, "network_error", "agent router should classify network failures");
assertIncludes(agentRouter, "client_abort", "agent router should classify client aborts");
assertIncludes(agentRouter, "server_timeout:${timeoutMs}", "child abort signals should preserve timeout source");
assertIncludes(agentRouter, "extractProviderRequestId", "agent router should read request id headers");
assertIncludes(agentRouter, "chargeSensitiveFailure", "agent router should avoid duplicate fallback calls after charged timeouts");
assertIncludes(agentRouter, "skip task fallback", "agent router should log when it avoids duplicate fallback calls");

assertMatches(
  modelConfig,
  /AGENT_FAST_CHAT_TIMEOUT_MS",\s*(60_000|90_000|120_000)/,
  "fast chat default timeout should not be the old 15s value"
);
assertMatches(
  chatRoute,
  /const CHAT_AGENT_FAST_TIMEOUT_MS = (60_000|90_000|120_000);/,
  "route-level fast chat timeout should not be the old 20s value"
);
assertIncludes(chatRoute, "saveAssistantErrorMessage", "chat route should persist assistant errors after provider calls fail");
assertIncludes(chatRoute, "getChatErrorInfo", "chat route should map provider errors to frontend-safe errors");
assertIncludes(chatRoute, "providerRequest", "chat route should persist provider error metadata");
assertIncludes(chatRoute, "server_timeout", "chat route should preserve timeout source in logs and metadata");
assertIncludes(chatRoute, "requestId", "chat route should include provider request ids in logs and metadata");
assertIncludes(chatRoute, "[ai:chat:error]", "chat route should log structured chat failures");

console.log(JSON.stringify({ ok: true }, null, 2));
