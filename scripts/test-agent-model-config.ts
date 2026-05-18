import { getAgentModelConfig } from "@/lib/agent/models";

const originalTaskModel = process.env.AGENT_TASK_MODEL;
const originalFallbackModel = process.env.AGENT_TASK_FALLBACK_MODEL;
const originalChatModel = process.env.AGENT_CHAT_MODEL;
const originalTaskProvider = process.env.AGENT_TASK_PROVIDER;
const originalTaskTimeout = process.env.AGENT_TASK_TIMEOUT_MS;
const originalTaskPrimaryTimeout = process.env.AGENT_TASK_PRIMARY_TIMEOUT_MS;
const originalTaskFallbackTimeout = process.env.AGENT_TASK_FALLBACK_TIMEOUT_MS;
const originalWordTaskPrimaryTimeout = process.env.AGENT_WORD_TASK_PRIMARY_TIMEOUT_MS;
const originalWordTaskFallbackTimeout = process.env.AGENT_WORD_TASK_FALLBACK_TIMEOUT_MS;
const originalWordTaskRepairTimeout = process.env.AGENT_WORD_TASK_REPAIR_TIMEOUT_MS;

process.env.AGENT_CHAT_MODEL = "";
process.env.AGENT_TASK_PROVIDER = "";
process.env.AGENT_TASK_MODEL = "";
process.env.AGENT_TASK_FALLBACK_MODEL = "";
process.env.AGENT_TASK_TIMEOUT_MS = "";
process.env.AGENT_TASK_PRIMARY_TIMEOUT_MS = "";
process.env.AGENT_TASK_FALLBACK_TIMEOUT_MS = "";
process.env.AGENT_WORD_TASK_PRIMARY_TIMEOUT_MS = "";
process.env.AGENT_WORD_TASK_FALLBACK_TIMEOUT_MS = "";
process.env.AGENT_WORD_TASK_REPAIR_TIMEOUT_MS = "";

const defaults = getAgentModelConfig();
if (defaults.chat.model !== "gpt-5.4" || defaults.chat.provider !== "xheai") {
  throw new Error(`Unexpected chat model defaults: ${JSON.stringify(defaults.chat)}`);
}
if (defaults.taskPrimary.model !== "gpt-5.4" || defaults.taskPrimary.provider !== "subrouter") {
  throw new Error(`Unexpected task model defaults: ${JSON.stringify(defaults.taskPrimary)}`);
}
if (defaults.taskFallback.model !== "kimi-k2.5" || defaults.taskFallback.provider !== "moonshot") {
  throw new Error(`Unexpected fallback model defaults: ${JSON.stringify(defaults.taskFallback)}`);
}
if (process.env.AGENT_TASK_MODEL === "gemini-3-flash-preview") {
  throw new Error("AGENT_TASK_MODEL must not use the old Gemini default.");
}
if (defaults.taskPrimaryTimeoutMs > 20_000 || defaults.taskFallbackTimeoutMs > 18_000) {
  throw new Error(`Generic task fallbacks should not wait minutes by default: ${JSON.stringify(defaults)}`);
}
if (defaults.wordTaskPrimaryTimeoutMs < 180_000 || defaults.wordTaskFallbackTimeoutMs < 120_000 || defaults.wordTaskRepairTimeoutMs < 180_000) {
  throw new Error(`Word task timeouts should allow long document generation: ${JSON.stringify(defaults)}`);
}

process.env.AGENT_CHAT_MODEL = "gpt-5.4";
process.env.AGENT_TASK_PROVIDER = "subrouter";
process.env.AGENT_TASK_MODEL = "task-custom";
process.env.AGENT_TASK_FALLBACK_MODEL = "kimi-custom";
process.env.AGENT_TASK_PRIMARY_TIMEOUT_MS = "9000";
process.env.AGENT_TASK_FALLBACK_TIMEOUT_MS = "7000";
process.env.AGENT_WORD_TASK_PRIMARY_TIMEOUT_MS = "190000";
process.env.AGENT_WORD_TASK_FALLBACK_TIMEOUT_MS = "130000";
process.env.AGENT_WORD_TASK_REPAIR_TIMEOUT_MS = "200000";

const custom = getAgentModelConfig();
if (custom.taskPrimary.model !== "task-custom" || custom.taskPrimary.provider !== "subrouter" || custom.taskFallback.model !== "kimi-custom") {
  throw new Error(`Expected env overrides to apply: ${JSON.stringify(custom)}`);
}
if (custom.taskPrimaryTimeoutMs !== 9000 || custom.taskFallbackTimeoutMs !== 7000) {
  throw new Error(`Expected task timeout env overrides to apply: ${JSON.stringify(custom)}`);
}
if (custom.wordTaskPrimaryTimeoutMs !== 190000 || custom.wordTaskFallbackTimeoutMs !== 130000 || custom.wordTaskRepairTimeoutMs !== 200000) {
  throw new Error(`Expected Word timeout env overrides to apply: ${JSON.stringify(custom)}`);
}

if (originalChatModel === undefined) delete process.env.AGENT_CHAT_MODEL;
else process.env.AGENT_CHAT_MODEL = originalChatModel;
if (originalTaskProvider === undefined) delete process.env.AGENT_TASK_PROVIDER;
else process.env.AGENT_TASK_PROVIDER = originalTaskProvider;
if (originalTaskModel === undefined) delete process.env.AGENT_TASK_MODEL;
else process.env.AGENT_TASK_MODEL = originalTaskModel;
if (originalFallbackModel === undefined) delete process.env.AGENT_TASK_FALLBACK_MODEL;
else process.env.AGENT_TASK_FALLBACK_MODEL = originalFallbackModel;
if (originalTaskTimeout === undefined) delete process.env.AGENT_TASK_TIMEOUT_MS;
else process.env.AGENT_TASK_TIMEOUT_MS = originalTaskTimeout;
if (originalTaskPrimaryTimeout === undefined) delete process.env.AGENT_TASK_PRIMARY_TIMEOUT_MS;
else process.env.AGENT_TASK_PRIMARY_TIMEOUT_MS = originalTaskPrimaryTimeout;
if (originalTaskFallbackTimeout === undefined) delete process.env.AGENT_TASK_FALLBACK_TIMEOUT_MS;
else process.env.AGENT_TASK_FALLBACK_TIMEOUT_MS = originalTaskFallbackTimeout;
if (originalWordTaskPrimaryTimeout === undefined) delete process.env.AGENT_WORD_TASK_PRIMARY_TIMEOUT_MS;
else process.env.AGENT_WORD_TASK_PRIMARY_TIMEOUT_MS = originalWordTaskPrimaryTimeout;
if (originalWordTaskFallbackTimeout === undefined) delete process.env.AGENT_WORD_TASK_FALLBACK_TIMEOUT_MS;
else process.env.AGENT_WORD_TASK_FALLBACK_TIMEOUT_MS = originalWordTaskFallbackTimeout;
if (originalWordTaskRepairTimeout === undefined) delete process.env.AGENT_WORD_TASK_REPAIR_TIMEOUT_MS;
else process.env.AGENT_WORD_TASK_REPAIR_TIMEOUT_MS = originalWordTaskRepairTimeout;

console.log(JSON.stringify({ ok: true }, null, 2));
