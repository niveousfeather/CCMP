import mammoth from "mammoth";

import type { DocumentParseWarning } from "@/lib/document-processing/types";

export async function parseDocxDocument(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });
  const warnings: DocumentParseWarning[] = result.messages.map((message) => ({
    code: "DOCUMENT_PARSER_WARNING",
    message: message.message
  }));

  return {
    parser: "docx" as const,
    text: result.value,
    warnings
  };
}

