import type { AgentProvider } from "@/lib/agent/types";

export type AgentModelEndpoint = {
  model: string;
  provider: AgentProvider;
};

export type AgentModelConfig = {
  chat: AgentModelEndpoint;
  fastChatTimeoutMs: number;
  taskFallback: AgentModelEndpoint;
  taskFallbackTimeoutMs: number;
  taskPrimary: AgentModelEndpoint;
  taskPrimaryTimeoutMs: number;
  taskTimeoutMs: number;
  wordTaskFallbackTimeoutMs: number;
  wordTaskPrimaryTimeoutMs: number;
  wordTaskRepairTimeoutMs: number;
};

function readEnv(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function readPositiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readProviderEnv(name: string, fallback: AgentProvider): AgentProvider {
  const value = process.env[name]?.trim();
  return value === "xheai" || value === "moonshot" || value === "claudecoder" || value === "subrouter" ? value : fallback;
}

export function getAgentModelConfig(): AgentModelConfig {
  return {
    chat: {
      model: readEnv("AGENT_CHAT_MODEL", "gpt-5.4"),
      provider: "xheai"
    },
    fastChatTimeoutMs: Math.max(readPositiveIntEnv("AGENT_FAST_CHAT_TIMEOUT_MS", 90_000), 60_000),
    taskPrimary: {
      model: readEnv("AGENT_TASK_MODEL", "gpt-5.4"),
      provider: readProviderEnv("AGENT_TASK_PROVIDER", "subrouter")
    },
    taskFallback: {
      model: readEnv("AGENT_TASK_FALLBACK_MODEL", "kimi-k2.5"),
      provider: "moonshot"
    },
    taskFallbackTimeoutMs: readPositiveIntEnv("AGENT_TASK_FALLBACK_TIMEOUT_MS", 10_000),
    taskPrimaryTimeoutMs: readPositiveIntEnv("AGENT_TASK_PRIMARY_TIMEOUT_MS", 15_000),
    taskTimeoutMs: readPositiveIntEnv("AGENT_TASK_TIMEOUT_MS", 240_000),
    wordTaskFallbackTimeoutMs: readPositiveIntEnv("AGENT_WORD_TASK_FALLBACK_TIMEOUT_MS", 240_000),
    wordTaskPrimaryTimeoutMs: readPositiveIntEnv("AGENT_WORD_TASK_PRIMARY_TIMEOUT_MS", 420_000),
    wordTaskRepairTimeoutMs: readPositiveIntEnv("AGENT_WORD_TASK_REPAIR_TIMEOUT_MS", 240_000)
  };
}
