import type { WordRequest, WordValidationResult } from "./types";

const sensitiveKeyPattern = /api[_-]?key|token|secret|password|authorization|provider|runtime[_-]?trace|stack/i;

function hasMeaningfulText(value?: string) {
  return Boolean(value && value.trim().length >= 2);
}

function hasSpecificInstruction(request: WordRequest) {
  const compact = `${request.title || ""}${request.instruction || ""}`.replace(/\s+/g, "");
  return compact.length >= 8;
}

function includesSensitiveKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveKeyPattern.test(key)) return true;
    if (Array.isArray(nestedValue)) {
      if (nestedValue.some((item) => includesSensitiveKey(item))) return true;
    } else if (nestedValue && typeof nestedValue === "object" && includesSensitiveKey(nestedValue)) {
      return true;
    }
  }
  return false;
}

export function validateWordRequest(request: WordRequest): WordValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!hasMeaningfulText(request.title)) errors.push("请提供 Word 文档标题。");
  if (!hasMeaningfulText(request.instruction)) errors.push("请提供 Word 文档生成要求。");
  if (includesSensitiveKey(request)) errors.push("请求中包含内部调试字段或敏感配置，请移除后重试。");

  const hasSourceText = hasMeaningfulText(request.sourceText);
  const hasConversationSummary = hasMeaningfulText(request.conversationSummary);
  const hasSourceFiles = Boolean(request.sourceFiles?.some((file) => hasMeaningfulText(file.text)));
  if (!hasSourceText && !hasConversationSummary && !hasSourceFiles) {
    if (!hasSpecificInstruction(request)) errors.push("请提供要写入 Word 的正文材料、对话总结或明确主题。");
    else warnings.push("未提供外部材料，已按明确主题生成基础 Word 文档。");
  }

  if (errors.length) return { ok: false, errors, warnings };
  return { ok: true, warnings };
}
