export const COURSE_ABILITY_DIAGNOSTIC_CODES = [
  "MISSING_MODEL_CONFIG",
  "MODEL_EMPTY_RESPONSE",
  "MODEL_JSON_NOT_FOUND",
  "MODEL_TIMEOUT",
  "MODEL_CALL_FAILED",
  "NORMALIZE_FALLBACK_USED"
] as const;

export type CourseAbilityDiagnosticCode = (typeof COURSE_ABILITY_DIAGNOSTIC_CODES)[number];

const DIAGNOSTIC_LABELS: Record<CourseAbilityDiagnosticCode, string> = {
  MISSING_MODEL_CONFIG: "模型服务配置不可用",
  MODEL_EMPTY_RESPONSE: "模型返回内容为空",
  MODEL_JSON_NOT_FOUND: "模型返回内容不是合法 JSON",
  MODEL_TIMEOUT: "模型请求超时",
  MODEL_CALL_FAILED: "模型服务调用失败",
  NORMALIZE_FALLBACK_USED: "模型返回结构不完整，已使用本地示例兜底"
};

const SENSITIVE_PATTERN = /(api[_-]?key|authorization|bearer|token|secret|xheai[_-]?api[_-]?key|base[_-]?url|headers?|https?:\/\/)/i;

export function courseAbilityDiagnosticWarning(code: CourseAbilityDiagnosticCode) {
  return `生成失败原因：${code}`;
}

export function courseAbilityDiagnosticLabel(code: CourseAbilityDiagnosticCode) {
  return DIAGNOSTIC_LABELS[code];
}

export function courseAbilityDiagnosticCodeFromError(error: unknown): CourseAbilityDiagnosticCode {
  const message = error instanceof Error ? error.message : String(error || "unknown");
  const lowerMessage = message.toLowerCase();
  if (message.startsWith("MISSING_")) return "MISSING_MODEL_CONFIG";
  if (message === "MODEL_EMPTY_RESPONSE") return "MODEL_EMPTY_RESPONSE";
  if (message === "MODEL_JSON_NOT_FOUND" || error instanceof SyntaxError) return "MODEL_JSON_NOT_FOUND";
  if (message === "MODEL_OUTPUT_MISSING_CORE_FIELDS") return "NORMALIZE_FALLBACK_USED";
  if (lowerMessage.includes("timeout") || lowerMessage.includes("aborted") || lowerMessage.includes("abort")) return "MODEL_TIMEOUT";
  return "MODEL_CALL_FAILED";
}

export function extractCourseAbilityDiagnosticCodes(warnings: string[]) {
  const codeSet = new Set<CourseAbilityDiagnosticCode>();

  warnings.forEach((warning) => {
    COURSE_ABILITY_DIAGNOSTIC_CODES.forEach((code) => {
      if (warning.includes(code)) codeSet.add(code);
    });
  });

  return Array.from(codeSet);
}

export function sanitizeCourseAbilityWarning(warning: string) {
  const trimmed = warning.replace(/\s+/g, " ").trim();
  if (!trimmed || SENSITIVE_PATTERN.test(trimmed)) return null;
  return trimmed.length > 120 ? `${trimmed.slice(0, 120)}...` : trimmed;
}
