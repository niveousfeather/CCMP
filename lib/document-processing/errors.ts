import type { DocumentParseErrorCode } from "@/lib/document-processing/types";

export class DocumentParseError extends Error {
  code: DocumentParseErrorCode;

  constructor(code: DocumentParseErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "DocumentParseError";
    this.code = code;
    this.cause = options?.cause;
  }
}

export function normalizeDocumentParseError(error: unknown, fallbackCode: DocumentParseErrorCode = "DOCUMENT_PARSE_FAILED") {
  if (error instanceof DocumentParseError) return error;

  const message = error instanceof Error ? error.message : String(error || "");
  const lowered = message.toLowerCase();
  if (/password|encrypted|incorrect password|no password/.test(lowered)) {
    return new DocumentParseError("DOCUMENT_PASSWORD_PROTECTED", "文档受密码保护，无法解析。", { cause: error });
  }
  if (/corrupt|corrupted|invalid|bad zip|end of central directory|formaterror|invalid pdf/.test(lowered)) {
    return new DocumentParseError("DOCUMENT_CORRUPTED", "文档损坏或格式异常，无法解析。", { cause: error });
  }
  if (/timeout|timed out|abort/.test(lowered)) {
    return new DocumentParseError("DOCUMENT_PARSE_TIMEOUT", "文档解析超时。", { cause: error });
  }

  return new DocumentParseError(fallbackCode, message || "文档解析失败。", { cause: error });
}

