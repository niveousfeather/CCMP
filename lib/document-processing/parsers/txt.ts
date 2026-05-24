import { decodeTextBuffer } from "@/lib/document-processing/normalize";

export function parseTxtDocument(buffer: Buffer | Uint8Array | ArrayBuffer) {
  return {
    parser: "txt" as const,
    text: decodeTextBuffer(buffer),
    warnings: []
  };
}

