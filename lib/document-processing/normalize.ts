export function decodeTextBuffer(buffer: Buffer | Uint8Array | ArrayBuffer) {
  const bytes = toUint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return Buffer.from(bytes.subarray(2)).toString("utf16le");
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.alloc(bytes.length - 2);
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      swapped[index - 2] = bytes[index + 1];
      swapped[index - 1] = bytes[index];
    }
    return swapped.toString("utf16le");
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return Buffer.from(bytes.subarray(3)).toString("utf8");
  }

  const text = Buffer.from(bytes).toString("utf8");
  const nullCount = (text.match(/\u0000/g) || []).length;
  if (nullCount > text.length / 10) return Buffer.from(bytes).toString("utf16le");
  return text;
}

export function normalizeDocumentText(input: string) {
  const lines = String(input || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \f\v]+/g, " ")
        .replace(/[=_*~\-]{8,}/g, " ")
        .trim()
    )
    .filter((line) => !isNoiseLine(line));

  return lines
    .join("\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[·•]{6,}/g, " ")
    .trim();
}

export function truncateDocumentText(text: string, maxChars?: number) {
  if (!maxChars || text.length <= maxChars) return text;
  const candidate = text.slice(0, maxChars);
  const boundary = Math.max(candidate.lastIndexOf("\n\n"), candidate.lastIndexOf("。"), candidate.lastIndexOf("."));
  if (boundary > Math.floor(maxChars * 0.75)) return candidate.slice(0, boundary + 1).trim();
  return candidate.trim();
}

function isNoiseLine(line: string) {
  if (!line) return false;
  if (/^(第\s*)?\d+\s*(页|page)?$/i.test(line)) return true;
  if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(line)) return true;
  if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(line)) return true;
  if (/^[\-_=~*·•\s]{4,}$/.test(line)) return true;
  if (/^[©■□●○◆◇▲△▼▽]+$/.test(line)) return true;
  return false;
}

function toUint8Array(buffer: Buffer | Uint8Array | ArrayBuffer) {
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
