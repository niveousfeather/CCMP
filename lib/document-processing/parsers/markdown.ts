import { decodeTextBuffer } from "@/lib/document-processing/normalize";

export function parseMarkdownDocument(buffer: Buffer | Uint8Array | ArrayBuffer) {
  return {
    parser: "markdown" as const,
    text: decodeTextBuffer(buffer),
    warnings: []
  };
}

