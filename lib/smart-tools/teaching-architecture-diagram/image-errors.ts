import type { TeachingArchitectureErrorCode } from "@/lib/smart-tools/teaching-architecture-diagram/types";

export class TeachingArchitectureImageError extends Error {
  readonly code: TeachingArchitectureErrorCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    code: TeachingArchitectureErrorCode,
    message: string,
    options: {
      retryable: boolean;
      status?: number;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = "TeachingArchitectureImageError";
    this.code = code;
    this.retryable = options.retryable;
    this.status = options.status;
    this.cause = options.cause;
  }
}

export function summarizeImageError(error: unknown) {
  if (error instanceof TeachingArchitectureImageError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      status: error.status
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  if (isTimeoutMessage(message)) {
    return {
      code: "IMAGE_PROVIDER_TIMEOUT" as const,
      message: "模型生成超时，请稍后重试或减少材料数量。",
      retryable: true
    };
  }

  if (message.includes("IMAGE2_API_KEYS_MISSING") || message.includes("IMAGE2_PROVIDER_UNSUPPORTED")) {
    return {
      code: "IMAGE_PROVIDER_NOT_CONFIGURED" as const,
      message: "图片生成服务未配置，请检查环境变量。",
      retryable: false
    };
  }

  return {
    code: "IMAGE_PROVIDER_FAILED" as const,
    message: "图片生成服务调用失败，请稍后重试。",
    retryable: true
  };
}

export function isTimeoutMessage(message: string) {
  return /timeout|timed out|abort|504|524/i.test(message);
}
