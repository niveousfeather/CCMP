import { makeZip } from "./zip";
import { inflateRawSync } from "node:zlib";

export type DocxEntry = {
  name: string;
  content: Buffer;
};

export type DocxPackage = {
  entries: DocxEntry[];
  getText(name: string): string | null;
  getBuffer(name: string): Buffer | null;
  setText(name: string, content: string): void;
  remove(name: string): void;
  toBuffer(): Buffer;
};

function readUInt16(buffer: Buffer, offset: number) {
  if (offset + 2 > buffer.length) throw new Error("DOCX_ZIP_CORRUPT");
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer: Buffer, offset: number) {
  if (offset + 4 > buffer.length) throw new Error("DOCX_ZIP_CORRUPT");
  return buffer.readUInt32LE(offset);
}

export function parseDocxPackage(buffer: Buffer): DocxPackage {
  if (buffer.length < 4 || readUInt32(buffer, 0) !== 0x04034b50) {
    throw new Error("DOCX_INVALID_ZIP");
  }

  const entries: DocxEntry[] = [];

  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (readUInt32(buffer, offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset < 0) throw new Error("DOCX_ZIP_CORRUPT");

  const entryCount = readUInt16(buffer, eocdOffset + 10);
  let centralOffset = readUInt32(buffer, eocdOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32(buffer, centralOffset) !== 0x02014b50) throw new Error("DOCX_ZIP_CORRUPT");

    const compression = readUInt16(buffer, centralOffset + 10);
    const compressedSize = readUInt32(buffer, centralOffset + 20);
    const uncompressedSize = readUInt32(buffer, centralOffset + 24);
    const nameLength = readUInt16(buffer, centralOffset + 28);
    const extraLength = readUInt16(buffer, centralOffset + 30);
    const commentLength = readUInt16(buffer, centralOffset + 32);
    const localOffset = readUInt32(buffer, centralOffset + 42);
    const name = buffer.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString("utf8");

    if (readUInt32(buffer, localOffset) !== 0x04034b50) throw new Error("DOCX_ZIP_CORRUPT");
    if (compression !== 0 && compression !== 8) throw new Error("DOCX_ZIP_COMPRESSION_UNSUPPORTED");

    const localNameLength = readUInt16(buffer, localOffset + 26);
    const localExtraLength = readUInt16(buffer, localOffset + 28);
    const contentStart = localOffset + 30 + localNameLength + localExtraLength;
    const contentEnd = contentStart + compressedSize;
    if (contentEnd > buffer.length) throw new Error("DOCX_ZIP_CORRUPT");

    const rawContent = buffer.subarray(contentStart, contentEnd);
    const content = compression === 8 ? inflateRawSync(rawContent) : Buffer.from(rawContent);
    if (content.length !== uncompressedSize) throw new Error("DOCX_ZIP_CORRUPT");
    entries.push({ name, content });
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }

  const entryMap = new Map(entries.map((entry) => [entry.name, entry]));

  return {
    entries,
    getText(name: string) {
      return entryMap.get(name)?.content.toString("utf8") || null;
    },
    getBuffer(name: string) {
      const content = entryMap.get(name)?.content;
      return content ? Buffer.from(content) : null;
    },
    setText(name: string, content: string) {
      const existing = entryMap.get(name);
      const next = Buffer.from(content, "utf8");
      if (existing) {
        existing.content = next;
        return;
      }
      const entry = { name, content: next };
      entries.push(entry);
      entryMap.set(name, entry);
    },
    remove(name: string) {
      const index = entries.findIndex((entry) => entry.name === name);
      if (index >= 0) entries.splice(index, 1);
      entryMap.delete(name);
    },
    toBuffer() {
      return makeZip(entries.map((entry) => ({ name: entry.name, content: entry.content })));
    }
  };
}
