import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

import type {
  AcademicPptIconDecoration,
  AcademicPptOutline,
  AcademicPptPipelineStep,
  AcademicPptSettings,
  AcademicPptLogLevel,
  AcademicPptNativePreviewSlide,
  AcademicPptPreviewManifest,
  AcademicPptQualityReport,
  AcademicPptRecentTask,
  AcademicPptSlidePreview,
  AcademicPptSourceFileType,
  AcademicPptTaskRequestSnapshot,
  AcademicPptTaskLog,
  AcademicPptTaskRecord,
  AcademicPptTaskStatus,
  AcademicPptTaskStep
} from "@/lib/smart-tools/academic-ppt/types";
import { getAcademicPptTemplateForSettings } from "@/lib/smart-tools/academic-ppt/template-registry";
import { normalizeAcademicPptSettings } from "@/lib/smart-tools/academic-ppt/task-api";
import { planAcademicPptIconDecorations } from "@/lib/smart-tools/academic-ppt/icon-decoration";

const ACADEMIC_PPT_ROOT = path.join(process.cwd(), "data", "academic-ppt");
const MAX_LOGS_PER_TASK = 500;
const MAX_PREVIEW_BULLETS = 5;
const MAX_PREVIEW_SLIDES = 60;
const ACADEMIC_PPT_TASK_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACADEMIC_PPT_PLACEHOLDER_TASK_IDS = new Set(["00000000-0000-4000-8000-000000000000"]);
const BUILTIN_SCHOOL_ACADEMIC_TEMPLATE_ID = "school_academic_report";
const ACADEMIC_PPT_PIPELINE_LABELS: Array<{ id: AcademicPptPipelineStep["id"]; label: string }> = [
  { id: "parse_paper", label: "解析论文" },
  { id: "research_analysis", label: "研究分析" },
  { id: "structure_planning", label: "结构规划" },
  { id: "slide_generation", label: "生成页面" },
  { id: "visual_check", label: "视觉检查" },
  { id: "post_process", label: "后处理" },
  { id: "export_file", label: "导出文件" }
];
const STEP_TO_PIPELINE_INDEX: Partial<Record<AcademicPptTaskStep, number>> = {
  upload_received: 0,
  parsing_source: 0,
  source_parsed: 0,
  research_enhancement: 1,
  research_ready: 1,
  planning_outline: 2,
  outline_generated: 2,
  running_critic: 4,
  repairing_outline: 5,
  outline_ready: 5,
  generating_slides: 3,
  visual_qa: 4,
  repairing_slides: 5,
  exporting_pptx: 6,
  pptx_exported: 6,
  rendering_preview: 6,
  completed: 6,
  cancelled: 6
};

export const ACADEMIC_PPT_UPLOAD_LIMIT_BYTES = 50 * 1024 * 1024;
export const ACADEMIC_PPT_ALLOWED_EXTENSIONS = new Set([".pdf", ".pptx", ".tex", ".txt", ".md", ".markdown"]);

export function createAcademicPptTaskId() {
  return randomUUID();
}

export function assertAcademicPptTaskId(taskId: string) {
  if (!ACADEMIC_PPT_TASK_ID_PATTERN.test(taskId) || isAcademicPptPlaceholderTaskId(taskId)) {
    throw new Error("Invalid academic-ppt task id.");
  }
}

export function isAcademicPptPlaceholderTaskId(taskId: string) {
  return ACADEMIC_PPT_PLACEHOLDER_TASK_IDS.has(String(taskId || "").toLowerCase());
}

function isPathInsideDirectory(targetPath: string, directoryPath: string) {
  const relative = path.relative(path.resolve(directoryPath), path.resolve(targetPath));
  return relative === "" || (relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative));
}

export function sanitizeAcademicPptFileName(fileName: string) {
  const baseName = path.basename(fileName || "source");
  const cleaned = baseName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
  return cleaned || "source";
}

export function getAcademicPptFileExtension(fileName: string) {
  return path.extname(fileName || "").toLowerCase();
}

export function inferAcademicPptSourceFileType(fileName: string): AcademicPptSourceFileType {
  const extension = getAcademicPptFileExtension(fileName);
  if (extension === ".pdf") return "PDF";
  if (extension === ".pptx") return "PPTX";
  if (extension === ".txt") return "Text";
  if (extension === ".md" || extension === ".markdown") return "Markdown";
  return "TeX";
}

export function assertAcademicPptFileAllowed(fileName: string, size: number) {
  const extension = getAcademicPptFileExtension(fileName);
  if (!ACADEMIC_PPT_ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("仅支持 PDF、PPTX、TeX、TXT 或 Markdown 文件。");
  }
  if (size <= 0) {
    throw new Error("上传文件为空。");
  }
  if (size > ACADEMIC_PPT_UPLOAD_LIMIT_BYTES) {
    throw new Error("文件大小超过 50MB 限制。");
  }
}

export function getAcademicPptTaskDir(taskId: string) {
  assertAcademicPptTaskId(taskId);
  return path.join(ACADEMIC_PPT_ROOT, "tasks", taskId);
}

export function getAcademicPptUploadDir(taskId: string) {
  return path.join(getAcademicPptTaskDir(taskId), "uploads");
}

export function getAcademicPptOutputDir(taskId: string) {
  return path.join(getAcademicPptTaskDir(taskId), "outputs");
}

export function getAcademicPptPreviewDir(taskId: string) {
  return path.join(getAcademicPptTaskDir(taskId), "previews");
}

export function getAcademicPptCheckpointDir(taskId: string) {
  return path.join(getAcademicPptTaskDir(taskId), "checkpoints");
}

function getTaskRecordPath(taskId: string) {
  return path.join(getAcademicPptTaskDir(taskId), "task.json");
}

function getTaskLogsPath(taskId: string) {
  return path.join(getAcademicPptTaskDir(taskId), "logs.json");
}

function getTaskQualityReportPath(taskId: string) {
  return path.join(getAcademicPptTaskDir(taskId), "quality-report.json");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeJsonFileAtomic(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await rename(tempPath, filePath);
}

async function readJsonFileWithRetry<T>(filePath: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return JSON.parse(await readFile(filePath, "utf8")) as T;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await delay(35 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("JSON file could not be read.");
}

type AcademicPptZipEntry = {
  name: string;
  content: Buffer;
};

const ACADEMIC_PPT_CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function academicPptCrc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = ACADEMIC_PPT_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function academicPptDosTimeDate(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

function findAcademicPptZipEnd(buffer: Buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("PPTX zip end record was not found.");
}

function readAcademicPptZipEntries(buffer: Buffer): AcademicPptZipEntry[] {
  const endOffset = findAcademicPptZipEnd(buffer);
  const totalEntries = buffer.readUInt16LE(endOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);
  const entries: AcademicPptZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("PPTX central directory is invalid.");
    }
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8");

    if (!name.endsWith("/")) {
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error(`PPTX local header is invalid: ${name}`);
      }
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const contentStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const contentEnd = contentStart + compressedSize;
      const compressed = buffer.subarray(contentStart, contentEnd);
      let content: Buffer;
      if (compression === 0) {
        content = Buffer.from(compressed);
      } else if (compression === 8) {
        content = inflateRawSync(compressed);
      } else {
        throw new Error(`PPTX entry uses unsupported compression ${compression}: ${name}`);
      }
      if (uncompressedSize && content.length !== uncompressedSize) {
        throw new Error(`PPTX entry has invalid size: ${name}`);
      }
      entries.push({ name, content });
    }

    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
}

function writeAcademicPptZipEntries(entries: AcademicPptZipEntry[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  const { time, date } = academicPptDosTimeDate();
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const content = entry.content;
    const crc = academicPptCrc32(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function academicPptRelationshipsPart(xmlName: string) {
  const directory = path.posix.dirname(xmlName);
  const base = path.posix.basename(xmlName);
  return directory === "." ? `_rels/${base}.rels` : `${directory}/_rels/${base}.rels`;
}

function academicPptResolveRelationshipTarget(relsName: string, target: string) {
  const trimmed = target.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  const relsDirectory = path.posix.dirname(relsName);
  const sourceDirectory =
    relsDirectory.endsWith("/_rels")
      ? relsDirectory.slice(0, -"/_rels".length)
      : relsDirectory === "_rels"
        ? ""
        : relsDirectory;
  return path.posix.normalize(path.posix.join(sourceDirectory, trimmed)).replace(/^\/+/, "");
}

function academicPptRelationshipIds(relsXml: string) {
  return new Set(Array.from(relsXml.matchAll(/\bId=(["'])(.*?)\1/g), (match) => match[2]).filter(Boolean));
}

function academicPptRelationshipAttributes(xml: string) {
  return Array.from(xml.matchAll(/\br:(?:id|embed|link)=(["'])(.*?)\1/g), (match) => match[2]).filter(Boolean);
}

function academicPptRelationshipElements(xml: string) {
  const elements: Array<{ xml: string; target: string; type: string; targetMode: string }> = [];
  const relationshipPattern = /<Relationship\b[^>]*(?:\/>|>[\s\S]*?<\/Relationship>)/g;
  for (const match of xml.matchAll(relationshipPattern)) {
    const element = match[0];
    const target = element.match(/\bTarget=(["'])(.*?)\1/)?.[2] || "";
    const type = element.match(/\bType=(["'])(.*?)\1/)?.[2] || "";
    const targetMode = element.match(/\bTargetMode=(["'])(.*?)\1/)?.[2] || "";
    elements.push({ xml: element, target, type, targetMode });
  }
  return elements;
}

function isAcademicPptRemovedOpenXmlPart(name: string) {
  return (
    name === "ppt/fontTable.xml" ||
    name.startsWith("ppt/notesSlides/") ||
    name.startsWith("ppt/notesMasters/") ||
    name.startsWith("ppt/fonts/")
  );
}

function sanitizeAcademicPptPresentationXml(xml: string) {
  let next = xml;
  let nodesRemoved = 0;
  let attributesRemoved = 0;
  next = next.replace(/\s+(?:embedTrueTypeFonts|saveSubsetFonts)=(["']).*?\1/g, () => {
    attributesRemoved += 1;
    return "";
  });
  for (const nodeName of ["notesMasterIdLst", "embeddedFontLst"]) {
    const pattern = new RegExp(`<(?:[A-Za-z0-9_]+:)?${nodeName}\\b[\\s\\S]*?<\\/(?:[A-Za-z0-9_]+:)?${nodeName}>`, "g");
    next = next.replace(pattern, () => {
      nodesRemoved += 1;
      return "";
    });
  }
  return { xml: next, nodesRemoved, attributesRemoved };
}

function sanitizeAcademicPptRelationshipsXml(relsName: string, xml: string) {
  let entriesRemoved = 0;
  const next = xml.replace(/<Relationship\b[^>]*(?:\/>|>[\s\S]*?<\/Relationship>)/g, (element) => {
    const target = element.match(/\bTarget=(["'])(.*?)\1/)?.[2] || "";
    const type = element.match(/\bType=(["'])(.*?)\1/)?.[2] || "";
    const targetMode = element.match(/\bTargetMode=(["'])(.*?)\1/)?.[2] || "";
    const relType = type.toLowerCase();
    const resolvedTarget = academicPptResolveRelationshipTarget(relsName, target);
    const shouldRemove =
      targetMode.toLowerCase() !== "external" &&
      (relType.includes("notesslide") ||
        relType.includes("notesmaster") ||
        relType.includes("font") ||
        isAcademicPptRemovedOpenXmlPart(resolvedTarget));
    if (!shouldRemove) return element;
    entriesRemoved += 1;
    return "";
  });
  return { xml: next, entriesRemoved };
}

function sanitizeAcademicPptContentTypesXml(xml: string) {
  let entriesRemoved = 0;
  const overridePattern = /<Override\b[^>]*(?:\/>|>[\s\S]*?<\/Override>)/g;
  const defaultPattern = /<Default\b[^>]*(?:\/>|>[\s\S]*?<\/Default>)/g;
  let next = xml.replace(overridePattern, (element) => {
    const partName = (element.match(/\bPartName=(["'])(.*?)\1/)?.[2] || "").replace(/^\/+/, "");
    const contentType = (element.match(/\bContentType=(["'])(.*?)\1/)?.[2] || "").toLowerCase();
    const shouldRemove =
      isAcademicPptRemovedOpenXmlPart(partName) ||
      contentType.includes("notesmaster") ||
      contentType.includes("notesslide") ||
      contentType.includes("font");
    if (!shouldRemove) return element;
    entriesRemoved += 1;
    return "";
  });
  next = next.replace(defaultPattern, (element) => {
    const extension = (element.match(/\bExtension=(["'])(.*?)\1/)?.[2] || "").toLowerCase();
    const contentType = (element.match(/\bContentType=(["'])(.*?)\1/)?.[2] || "").toLowerCase();
    const shouldRemove = extension === "odttf" || contentType.includes("font");
    if (!shouldRemove) return element;
    entriesRemoved += 1;
    return "";
  });
  return { xml: next, entriesRemoved };
}

async function sanitizeAcademicPptPptxOpenXml(pptxPath: string) {
  const entries = readAcademicPptZipEntries(await readFile(pptxPath));
  const stats = {
    presentationNodesRemoved: 0,
    presentationAttributesRemoved: 0,
    relationshipEntriesRemoved: 0,
    contentTypeEntriesRemoved: 0,
    packagePartsRemoved: 0
  };
  const nextEntries: AcademicPptZipEntry[] = [];

  for (const entry of entries) {
    if (isAcademicPptRemovedOpenXmlPart(entry.name)) {
      stats.packagePartsRemoved += 1;
      continue;
    }
    let content = entry.content;
    const text = content.toString("utf8");
    if (entry.name === "ppt/presentation.xml") {
      const sanitized = sanitizeAcademicPptPresentationXml(text);
      stats.presentationNodesRemoved += sanitized.nodesRemoved;
      stats.presentationAttributesRemoved += sanitized.attributesRemoved;
      content = Buffer.from(sanitized.xml, "utf8");
    } else if (entry.name.endsWith(".rels")) {
      const sanitized = sanitizeAcademicPptRelationshipsXml(entry.name, text);
      stats.relationshipEntriesRemoved += sanitized.entriesRemoved;
      content = Buffer.from(sanitized.xml, "utf8");
    } else if (entry.name === "[Content_Types].xml") {
      const sanitized = sanitizeAcademicPptContentTypesXml(text);
      stats.contentTypeEntriesRemoved += sanitized.entriesRemoved;
      content = Buffer.from(sanitized.xml, "utf8");
    }
    nextEntries.push({ name: entry.name, content });
  }

  if (Object.values(stats).some((value) => value > 0)) {
    const tempPath = `${pptxPath}.${process.pid}.${randomUUID()}.openxml.tmp`;
    await writeFile(tempPath, writeAcademicPptZipEntries(nextEntries));
    await rename(tempPath, pptxPath);
  }

  return stats;
}

async function validateAcademicPptPptxOpenXml(pptxPath: string) {
  const errors: string[] = [];
  let entries: AcademicPptZipEntry[];
  try {
    entries = readAcademicPptZipEntries(await readFile(pptxPath));
  } catch (error) {
    return [`PPTX zip container could not be opened: ${error instanceof Error ? error.message : "unknown error"}`];
  }

  const entryMap = new Map(entries.map((entry) => [entry.name, entry.content]));
  const names = new Set(entryMap.keys());
  const relIdsByPart = new Map<string, Set<string>>();

  for (const entry of entries) {
    if (!entry.name.endsWith(".rels")) continue;
    const xml = entry.content.toString("utf8");
    relIdsByPart.set(entry.name, academicPptRelationshipIds(xml));
    for (const rel of academicPptRelationshipElements(xml)) {
      if (rel.targetMode.toLowerCase() === "external") continue;
      const resolvedTarget = academicPptResolveRelationshipTarget(entry.name, rel.target);
      if (!resolvedTarget) {
        errors.push(`${entry.name}: empty relationship target`);
      } else if (!names.has(resolvedTarget)) {
        errors.push(`${entry.name}: missing relationship target ${resolvedTarget}`);
      }
    }
  }

  for (const entry of entries) {
    if (!entry.name.endsWith(".xml")) continue;
    const xml = entry.content.toString("utf8");
    const relIds = relIdsByPart.get(academicPptRelationshipsPart(entry.name)) || new Set<string>();
    for (const relId of academicPptRelationshipAttributes(xml)) {
      if (!relIds.has(relId)) errors.push(`${entry.name}: unresolved relationship id ${relId}`);
    }
    if (entry.name === "ppt/presentation.xml") {
      if (/<(?:[A-Za-z0-9_]+:)?notesMasterIdLst\b/.test(xml)) {
        errors.push("ppt/presentation.xml: unexpected notesMasterIdLst remained after sanitization");
      }
      if (/<(?:[A-Za-z0-9_]+:)?embeddedFontLst\b/.test(xml)) {
        errors.push("ppt/presentation.xml: unexpected embeddedFontLst remained after sanitization");
      }
      if (/\bembedTrueTypeFonts=(["'])1\1/.test(xml)) {
        errors.push("ppt/presentation.xml: embedTrueTypeFonts remained enabled");
      }
      if (/\bsaveSubsetFonts=(["'])1\1/.test(xml)) {
        errors.push("ppt/presentation.xml: saveSubsetFonts remained enabled");
      }
    }
  }

  return errors;
}

export async function ensureAcademicPptPptxDownloadable(pptxPath: string) {
  await sanitizeAcademicPptPptxOpenXml(pptxPath);
  const errors = await validateAcademicPptPptxOpenXml(pptxPath);
  if (errors.length) {
    throw new Error(`PPTX OpenXML validation failed: ${errors.slice(0, 8).join("; ")}`);
  }
}

function getTaskPreviewManifestPath(taskId: string) {
  return path.join(getAcademicPptPreviewDir(taskId), "manifest.json");
}

function getLegacyTaskPreviewManifestPath(taskId: string) {
  return path.join(getAcademicPptPreviewDir(taskId), "preview.json");
}

function isSvgFileName(fileName: string) {
  return fileName.toLowerCase().endsWith(".svg");
}

export async function findAcademicPptSvgFinalFiles(taskId: string) {
  const paperWorkspacesDir = path.join(getAcademicPptCheckpointDir(taskId), "paper-workspaces");
  const workspaces = await readdir(paperWorkspacesDir, { withFileTypes: true }).catch(() => []);
  const candidates: Array<{ directoryPath: string; modifiedAt: number }> = [];

  for (const workspace of workspaces) {
    if (!workspace.isDirectory()) continue;
    const svgFinalDir = path.join(paperWorkspacesDir, workspace.name, "svg_final");
    const files = await readdir(svgFinalDir, { withFileTypes: true }).catch(() => []);
    if (!files.some((file) => file.isFile() && isSvgFileName(file.name))) continue;
    const dirStat = await stat(svgFinalDir).catch(() => undefined);
    candidates.push({ directoryPath: svgFinalDir, modifiedAt: dirStat?.mtimeMs || 0 });
  }

  const latest = candidates.sort((a, b) => b.modifiedAt - a.modifiedAt)[0];
  if (!latest) return [];
  const files = await readdir(latest.directoryPath, { withFileTypes: true }).catch(() => []);
  return files
    .filter((file) => file.isFile() && isSvgFileName(file.name))
    .map((file) => path.join(latest.directoryPath, file.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true }));
}

function previewAssetPath(pageNumber: number, type: string) {
  const extension = type === "svg" ? "svg" : "png";
  return `previews/slide-${String(pageNumber).padStart(3, "0")}.${extension}`;
}

function previewAssetUrl(taskId: string, pageNumber: number) {
  return `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/preview/${pageNumber}`;
}

function normalizePreviewSlide(
  taskId: string,
  slide: Partial<AcademicPptNativePreviewSlide>,
  position: number,
  source: AcademicPptPreviewManifest["source"],
  type: AcademicPptPreviewManifest["type"]
): AcademicPptNativePreviewSlide {
  const legacyIndex = Number(slide.index);
  const explicitPageNumber = Number(slide.pageNumber);
  const pageNumber =
    Number.isInteger(explicitPageNumber) && explicitPageNumber > 0
      ? explicitPageNumber
      : Number.isInteger(legacyIndex) && legacyIndex > 0
        ? legacyIndex
        : position + 1;
  const normalizedIndex =
    Number.isInteger(legacyIndex) && legacyIndex >= 0 && slide.pageNumber
      ? legacyIndex
      : pageNumber - 1;
  const url = slide.publicUrl || slide.url || slide.imageUrl || previewAssetUrl(taskId, pageNumber);
  return {
    index: normalizedIndex,
    pageNumber,
    url,
    imageUrl: url,
    assetPath: slide.assetPath || previewAssetPath(pageNumber, type),
    source: slide.source || source,
    publicUrl: slide.publicUrl,
    storageKey: slide.storageKey,
    storageProvider: slide.storageProvider || "local",
    width: slide.width,
    height: slide.height,
    fileSizeBytes: slide.fileSizeBytes
  };
}

function normalizePreviewManifest(
  taskId: string,
  manifest: Partial<AcademicPptPreviewManifest>,
  fallback: { updatedAt: string; slideCount?: number }
): AcademicPptPreviewManifest {
  const type = manifest.type || "outline";
  const source =
    manifest.source ||
    (manifest.available && type === "svg"
      ? "svg_final"
      : manifest.available && (type === "image" || type === "pdf")
        ? "native_preview"
        : "structured_placeholder");
  const slides = (manifest.slides || []).map((slide, index) => normalizePreviewSlide(taskId, slide, index, source, type));
  const slideCount = manifest.slideCount ?? fallback.slideCount ?? slides.length;
  const previewCount = manifest.previewCount ?? (manifest.available ? slides.length : 0);
  const now = manifest.updatedAt || manifest.generatedAt || fallback.updatedAt;
  return {
    taskId,
    status: manifest.status || (manifest.available ? "ready" : "unavailable"),
    available: Boolean(manifest.available),
    type,
    source,
    slideCount,
    previewCount,
    slides,
    pptxUrl: manifest.pptxUrl || `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/download`,
    finalPptxPath: manifest.finalPptxPath,
    finalPptxSha256: manifest.finalPptxSha256,
    finalPptxFileSize: manifest.finalPptxFileSize,
    previewManifestUrl: manifest.previewManifestUrl || `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/preview`,
    previewStoragePrefix: manifest.previewStoragePrefix || `academic-ppt/tasks/${taskId}/previews`,
    storageProvider: manifest.storageProvider || "local",
    fallbackReason: manifest.fallbackReason,
    previewOutdated: Boolean(manifest.previewOutdated),
    diagnostics: manifest.diagnostics,
    createdAt: manifest.createdAt || manifest.generatedAt || fallback.updatedAt,
    updatedAt: now,
    generatedAt: manifest.generatedAt || fallback.updatedAt
  };
}

async function sha256File(filePath: string) {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}

function toTaskRelativePath(taskId: string, filePath: string) {
  const taskDir = path.resolve(getAcademicPptTaskDir(taskId));
  const resolved = path.resolve(filePath);
  if (!isPathInsideDirectory(resolved, taskDir)) return undefined;
  const relative = path.relative(taskDir, resolved);
  return relative && !relative.startsWith("..") ? relative.replace(/\\/g, "/") : undefined;
}

function resolveTaskRelativePath(taskId: string, relativePath: string | undefined) {
  if (!relativePath) return undefined;
  const taskDir = path.resolve(getAcademicPptTaskDir(taskId));
  const resolved = path.resolve(taskDir, relativePath);
  return isPathInsideDirectory(resolved, taskDir) ? resolved : undefined;
}

function buildPreviewOutdatedManifest(
  taskId: string,
  record: AcademicPptTaskRecord,
  currentOutputPath: string,
  currentSha256: string,
  fallbackReason: string
) {
  return normalizePreviewManifest(
    taskId,
    {
      taskId,
      status: "unavailable",
      available: false,
      type: "outline",
      source: "structured_placeholder",
      slideCount: record.previewSlideCount || record.slideCount || record.slidesPreview?.length || 0,
      previewCount: 0,
      slides: [],
      pptxUrl: `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/download`,
      finalPptxPath: toTaskRelativePath(taskId, currentOutputPath),
      finalPptxSha256: currentSha256,
      finalPptxFileSize: record.outputFileSize,
      previewManifestUrl: `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/preview`,
      previewStoragePrefix: `academic-ppt/tasks/${taskId}/previews`,
      storageProvider: "local",
      fallbackReason,
      previewOutdated: true,
      generatedAt: record.previewUpdatedAt || record.updatedAt,
    },
    {
      updatedAt: record.previewUpdatedAt || record.updatedAt,
      slideCount: record.previewSlideCount || record.slideCount || record.slidesPreview?.length || 0,
    }
  );
}

function buildSvgFinalPreviewManifest(
  taskId: string,
  svgFinalFiles: string[],
  record: AcademicPptTaskRecord
): AcademicPptPreviewManifest {
  const slides: AcademicPptNativePreviewSlide[] = svgFinalFiles.map((_, index) => ({
    index,
    pageNumber: index + 1,
    url: previewAssetUrl(taskId, index + 1),
    imageUrl: previewAssetUrl(taskId, index + 1),
    assetPath: previewAssetPath(index + 1, "svg"),
    source: "svg_final",
    storageProvider: "local"
  }));
  return {
    available: true,
    type: "svg",
    source: "svg_final",
    slideCount: svgFinalFiles.length,
    previewCount: svgFinalFiles.length,
    slides,
    pptxUrl: `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/download`,
    previewManifestUrl: `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/preview`,
    previewStoragePrefix: `academic-ppt/tasks/${taskId}/previews`,
    storageProvider: "local",
    status: "ready",
    taskId,
    createdAt: record.previewUpdatedAt || record.updatedAt,
    updatedAt: record.previewUpdatedAt || record.updatedAt,
    generatedAt: record.previewUpdatedAt || record.updatedAt
  };
}

async function readStoredAcademicPptPreviewManifest(
  taskId: string,
  record: AcademicPptTaskRecord
): Promise<AcademicPptPreviewManifest | undefined> {
  const manifestPath = record.previewManifestPath || getTaskPreviewManifestPath(taskId);
  const resolvedManifest = path.resolve(manifestPath);
  const resolvedTaskDir = path.resolve(getAcademicPptTaskDir(taskId));
  if (!isPathInsideDirectory(resolvedManifest, resolvedTaskDir)) {
    throw new Error("棰勮鍏冩暟鎹矾寰勬棤鏁堛€?");
  }
  const manifestText = await readFile(resolvedManifest, "utf8").catch(async (error) => {
    if (record.previewManifestPath) throw error;
    return readFile(getLegacyTaskPreviewManifestPath(taskId), "utf8").catch(() => undefined);
  });
  if (!manifestText) return undefined;
  const manifest = JSON.parse(manifestText) as Partial<AcademicPptPreviewManifest>;
  const normalized = normalizePreviewManifest(taskId, manifest, {
    updatedAt: record.previewUpdatedAt || record.updatedAt,
    slideCount: record.previewSlideCount || record.slideCount || record.slidesPreview?.length || 0
  });
  if (!record.outputFilePath) return normalized;

  const resolvedOutput = path.resolve(record.outputFilePath);
  if (!isPathInsideDirectory(resolvedOutput, resolvedTaskDir)) {
    throw new Error("Invalid academic-ppt output path.");
  }
  await stat(resolvedOutput).catch(() => undefined);
  await ensureAcademicPptPptxDownloadable(resolvedOutput).catch(() => undefined);
  const outputSha256 = await sha256File(resolvedOutput).catch(() => undefined);
  if (!outputSha256) return normalized;

  const manifestOutputPath = resolveTaskRelativePath(taskId, normalized.finalPptxPath);
  if (manifestOutputPath && path.resolve(manifestOutputPath) !== resolvedOutput) {
    return buildPreviewOutdatedManifest(taskId, record, resolvedOutput, outputSha256, "preview_outdated");
  }
  if (normalized.finalPptxSha256 && normalized.finalPptxSha256 !== outputSha256) {
    return buildPreviewOutdatedManifest(taskId, record, resolvedOutput, outputSha256, "preview_outdated");
  }
  if (record.status === "success" && normalized.source === "svg_final") {
    return buildPreviewOutdatedManifest(taskId, record, resolvedOutput, outputSha256, "preview_outdated");
  }

  return normalizePreviewManifest(
    taskId,
    {
      ...normalized,
      finalPptxPath: normalized.finalPptxPath || toTaskRelativePath(taskId, resolvedOutput),
      finalPptxSha256: normalized.finalPptxSha256 || outputSha256,
      finalPptxFileSize: normalized.finalPptxFileSize || record.outputFileSize,
    },
    {
      updatedAt: normalized.updatedAt || record.previewUpdatedAt || record.updatedAt,
      slideCount: normalized.slideCount,
    }
  );
}

export async function ensureAcademicPptStorage() {
  await Promise.all([
    mkdir(path.join(ACADEMIC_PPT_ROOT, "uploads"), { recursive: true }),
    mkdir(path.join(ACADEMIC_PPT_ROOT, "outputs"), { recursive: true }),
    mkdir(path.join(ACADEMIC_PPT_ROOT, "logs"), { recursive: true }),
    mkdir(path.join(ACADEMIC_PPT_ROOT, "tasks"), { recursive: true })
  ]);
}

export async function ensureAcademicPptTaskDirs(taskId: string) {
  await Promise.all([
    mkdir(getAcademicPptTaskDir(taskId), { recursive: true }),
    mkdir(getAcademicPptUploadDir(taskId), { recursive: true }),
    mkdir(getAcademicPptCheckpointDir(taskId), { recursive: true }),
    mkdir(getAcademicPptOutputDir(taskId), { recursive: true }),
    mkdir(getAcademicPptPreviewDir(taskId), { recursive: true })
  ]);
}

export async function listAcademicPptTaskRecords(): Promise<Array<AcademicPptTaskRecord & { settings?: AcademicPptSettings }>> {
  await ensureAcademicPptStorage();
  const taskRoot = path.join(ACADEMIC_PPT_ROOT, "tasks");
  const entries = await readdir(taskRoot, { withFileTypes: true }).catch(() => []);
  const records: Array<AcademicPptTaskRecord & { settings?: AcademicPptSettings }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !ACADEMIC_PPT_TASK_ID_PATTERN.test(entry.name) || isAcademicPptPlaceholderTaskId(entry.name)) continue;
    const taskRecordPath = path.join(taskRoot, entry.name, "task.json");
    if (!(await stat(taskRecordPath).then((fileStat) => fileStat.isFile()).catch(() => false))) continue;
    try {
      records.push(await readAcademicPptTaskRecord(entry.name));
    } catch (error) {
      console.warn(
        `[academic-ppt] skip invalid task ${entry.name}: ${error instanceof Error ? error.message : "unknown"}`
      );
    }
  }

  return records;
}

function toRecentAcademicPptTask(record: AcademicPptTaskRecord): AcademicPptRecentTask {
  return {
    taskId: record.taskId,
    sourceFileName: record.inputFileName,
    status: record.status,
    slideCount: record.slideCount,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    modelSource: record.modelSource,
    generatorSource: record.generatorSource,
    qualityScore: record.qualityScore
  };
}

function buildAcademicPptRequestSnapshot(
  settings: AcademicPptSettings,
  templateId: string
): AcademicPptTaskRequestSnapshot {
  return {
    slideCount: settings.targetSlides,
    templateId,
    language: settings.outputLanguage,
    deepResearchEnabled: settings.enableDeepResearch,
    externalResearchEnabled: settings.enableExternalResearch,
    webSearchEnabled: settings.webSearchEnabled ?? settings.enableExternalResearch,
    visualQaEnabled: settings.enableVisualQa,
    iconDecorationEnabled: settings.enableIconDecoration,
    searchProvider: "nexus-searxng",
    generatorPreference: "paper-ppt-agent"
  };
}

export async function listRecentAcademicPptTasks(limit = 10): Promise<AcademicPptRecentTask[]> {
  const records = await listAcademicPptTaskRecords();

  return records
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt))
    .slice(0, Math.min(Math.max(limit, 1), 10))
    .map(toRecentAcademicPptTask);
}

export async function createAcademicPptTaskRecord({
  taskId,
  inputFileName,
  inputFilePath,
  settings
}: {
  taskId: string;
  inputFileName: string;
  inputFilePath: string;
  settings: AcademicPptSettings;
}) {
  const now = new Date().toISOString();
  await ensureAcademicPptTaskDirs(taskId);
  const normalizedSettings = normalizeAcademicPptSettings(settings);
  const template = getAcademicPptTemplateForSettings(normalizedSettings);
  const record: AcademicPptTaskRecord & { settings: AcademicPptSettings } = {
    taskId,
    status: "queued",
    progress: 5,
    currentStep: "upload_received",
    currentStage: "upload_received",
    lastSuccessfulStage: "upload_received",
    lastCompletedStep: "upload_received",
    resumable: false,
    retryCount: 0,
    maxRetries: 2,
    timeoutAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    inputFileName,
    inputFilePath,
    templateId: template.id,
    templateName: template.name,
    templateStyle: normalizedSettings.templateStyle,
    sourceFileType: inferAcademicPptSourceFileType(inputFileName),
    visualQaEnabled: normalizedSettings.enableVisualQa,
    iconDecorationEnabled: normalizedSettings.enableIconDecoration,
    researchEnabled: normalizedSettings.enableDeepResearch,
    externalResearchEnabled: normalizedSettings.enableExternalResearch,
    researchStatus: normalizedSettings.enableDeepResearch || normalizedSettings.enableExternalResearch ? "skipped" : "skipped",
    researchSourcesCount: 0,
    modelCriticEnabled: normalizedSettings.enableVisualQa,
    modelCriticStatus: normalizedSettings.enableVisualQa ? "skipped" : "skipped",
    generatorSource: "tools-engine",
    outputStorageProvider: "local",
    previewStoragePrefix: `academic-ppt/tasks/${taskId}/previews`,
    previewAssetsReady: false,
    requestSnapshot: buildAcademicPptRequestSnapshot(normalizedSettings, template.id),
    deepResearchEnabled: normalizedSettings.enableDeepResearch,
    webSearchEnabled: normalizedSettings.webSearchEnabled ?? normalizedSettings.enableExternalResearch,
    searchEnabled: normalizedSettings.webSearchEnabled ?? normalizedSettings.enableExternalResearch,
    searchProvider: "nexus-searxng",
    searchStatus: (normalizedSettings.webSearchEnabled ?? normalizedSettings.enableExternalResearch) ? "enabled" : "disabled",
    modelCriticRounds: 0,
    autoRepairRounds: 0,
    autoRepairApplied: false,
    createdAt: now,
    startedAt: now,
    updatedAt: now,
    settings: normalizedSettings
  };
  await writeJsonFileAtomic(getTaskRecordPath(taskId), record);
  await writeJsonFileAtomic(getTaskLogsPath(taskId), []);
  return record;
}

export async function readAcademicPptTaskRecord(taskId: string) {
  return readJsonFileWithRetry<AcademicPptTaskRecord & { settings?: AcademicPptSettings }>(getTaskRecordPath(taskId));
}

type AcademicPptTaskRecordPatch = Partial<AcademicPptTaskRecord>;

export async function updateAcademicPptTaskRecord(
  taskId: string,
  patch: AcademicPptTaskRecordPatch
) {
  const current = await readAcademicPptTaskRecord(taskId);
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  await writeJsonFileAtomic(getTaskRecordPath(taskId), next);
  return next;
}

function buildAcademicPptProgressState(record: AcademicPptTaskRecord) {
  const lastCompletedIndex = STEP_TO_PIPELINE_INDEX[record.lastSuccessfulStage || record.lastCompletedStep || "upload_received"] ?? -1;
  const rawCurrentStep = record.currentStage || record.currentStep;
  const failedStage = record.failedStage || (record.status === "failed" ? inferAcademicPptFailedStage(record) || rawCurrentStep : undefined);
  const activeIndex =
    record.status === "failed"
      ? STEP_TO_PIPELINE_INDEX[failedStage || record.lastSuccessfulStage || record.lastCompletedStep || "generating_slides"] ?? lastCompletedIndex
      : STEP_TO_PIPELINE_INDEX[rawCurrentStep] ?? Math.max(lastCompletedIndex, 0);
  const errorText = record.status === "failed" ? record.errorSummary || record.error : undefined;
  const steps = ACADEMIC_PPT_PIPELINE_LABELS.map((step, index): AcademicPptPipelineStep => {
    if (record.status === "success") return { ...step, status: "success" };
    if (record.status === "cancelled") return { ...step, status: index <= lastCompletedIndex ? "success" : "waiting" };
    if (record.status === "failed") {
      if (index < activeIndex || index <= lastCompletedIndex) return { ...step, status: "success" };
      if (index === activeIndex) return { ...step, status: "failed", error: errorText };
      return { ...step, status: "waiting" };
    }
    if (record.status === "queued" || record.status === "pending" || record.status === "running") {
      if (index < activeIndex || index <= lastCompletedIndex) return { ...step, status: "success" };
      if (index === activeIndex) return { ...step, status: "running" };
    }
    return { ...step, status: "waiting" };
  });
  return { steps };
}

function inferAcademicPptFailedStage(record: AcademicPptTaskRecord): AcademicPptTaskStep | undefined {
  if (record.failedStage) return record.failedStage;
  if (record.currentStep && record.currentStep !== "failed" && record.currentStep !== "completed") return record.currentStep;
  const failureText = `${record.errorSummary || ""} ${record.error || ""} ${record.fallbackReason || ""}`.toLowerCase();
  if (/visual composition|visual[_ -]?qa|quality gate|svg pages|preview/.test(failureText)) return "visual_qa";
  if (/repair/.test(failureText)) return "repairing_slides";
  if (/export|pptx|openxml|powerpoint/.test(failureText)) return "exporting_pptx";
  if (/research|search/.test(failureText)) return "research_enhancement";
  if (/outline|strategy|plan/.test(failureText)) return "planning_outline";
  if (/parse|source|upload/.test(failureText)) return "parsing_source";
  if (record.previousFailedStage && record.previousFailedStage !== "completed") return record.previousFailedStage;
  if (record.resumeFromStep && record.resumeFromStep !== "completed") return record.resumeFromStep;
  const fallbackStage = record.lastSuccessfulStage || record.lastCompletedStep;
  return fallbackStage && fallbackStage !== "completed" ? fallbackStage : undefined;
}

export async function appendAcademicPptLog(taskId: string, level: AcademicPptLogLevel, message: string) {
  if (isAcademicPptPlaceholderTaskId(taskId)) return;
  try {
    const logs = await readAcademicPptLogs(taskId, MAX_LOGS_PER_TASK).catch(() => []);
    const next = [
      ...logs,
      {
        time: new Date().toISOString(),
        level,
        message
      }
    ].slice(-MAX_LOGS_PER_TASK);
    await writeJsonFileAtomic(getTaskLogsPath(taskId), next);
  } catch (error) {
    console.warn(
      `[academic-ppt] log append failed for task ${taskId}: ${error instanceof Error ? error.message : "unknown"}`
    );
  }
}

export async function writeAcademicPptQualityReport(taskId: string, report: AcademicPptQualityReport) {
  const reportPath = getTaskQualityReportPath(taskId);
  await writeJsonFileAtomic(reportPath, report);
  return reportPath;
}

export async function writeAcademicPptPreviewManifest(taskId: string, manifest: AcademicPptPreviewManifest) {
  const previewDir = getAcademicPptPreviewDir(taskId);
  await mkdir(previewDir, { recursive: true });
  const manifestPath = getTaskPreviewManifestPath(taskId);
  const normalizedManifest = normalizePreviewManifest(taskId, manifest, { updatedAt: manifest.generatedAt });
  await writeJsonFileAtomic(manifestPath, normalizedManifest);
  return manifestPath;
}

export async function readAcademicPptPreviewManifest(taskId: string): Promise<AcademicPptPreviewManifest> {
  const record = await readAcademicPptTaskRecord(taskId);
  const storedManifest = await readStoredAcademicPptPreviewManifest(taskId, record);
  if (
    storedManifest &&
    (storedManifest.available ||
      storedManifest.status === "pending" ||
      storedManifest.previewOutdated ||
      !record.previewAvailable ||
      record.status === "success")
  ) {
    return storedManifest;
  }
  const svgFinalFiles = await findAcademicPptSvgFinalFiles(taskId);
  if (svgFinalFiles.length && record.status !== "success") {
    return buildSvgFinalPreviewManifest(taskId, svgFinalFiles, record);
  }
  if (storedManifest) {
    return storedManifest;
  }
  const previewPending = record.status === "queued" || record.status === "pending" || record.status === "running";
  return {
    taskId,
    status: previewPending ? "pending" : "unavailable",
    available: false,
    type: "outline",
    source: "structured_placeholder",
    slideCount: record.slideCount || record.slidesPreview?.length || 0,
    previewCount: 0,
    slides: [],
    pptxUrl: `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/download`,
    previewManifestUrl: `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(taskId)}/preview`,
    previewStoragePrefix: `academic-ppt/tasks/${taskId}/previews`,
    storageProvider: "local",
    fallbackReason: record.previewFallbackReason || "预览尚未生成。",
    generatedAt: record.previewUpdatedAt || record.updatedAt
  };
}
export async function getAcademicPptPreviewImageInfo(taskId: string, slideIndex: number) {
  const manifest = await readAcademicPptPreviewManifest(taskId);
  const slide = manifest.slides.find((item) => item.pageNumber === slideIndex || item.index === slideIndex - 1);
  if (!(slide?.url || slide?.imageUrl || slide?.assetPath) || !manifest.available || (manifest.type !== "image" && manifest.type !== "svg")) {
    return undefined;
  }
  const extension = manifest.type === "svg" ? "svg" : "png";
  const filePath = slide.assetPath
    ? path.join(getAcademicPptTaskDir(taskId), slide.assetPath)
    : path.join(getAcademicPptPreviewDir(taskId), `slide-${String(slideIndex).padStart(3, "0")}.${extension}`);
  const resolvedFile = path.resolve(filePath);
  const resolvedTaskDir = path.resolve(getAcademicPptTaskDir(taskId));
  if (!isPathInsideDirectory(resolvedFile, resolvedTaskDir)) {
    throw new Error("预览图路径无效。");
  }
  if (manifest.type === "svg") {
    const resolvedSvg = await stat(resolvedFile)
      .then(() => resolvedFile)
      .catch(async () => {
        const svgFinalFiles = await findAcademicPptSvgFinalFiles(taskId);
        return svgFinalFiles[slideIndex - 1] ? path.resolve(svgFinalFiles[slideIndex - 1]) : undefined;
      });
    if (!resolvedSvg) return undefined;
    if (!isPathInsideDirectory(resolvedSvg, resolvedTaskDir)) {
      throw new Error("Invalid preview image path.");
    }
    await stat(resolvedSvg);
    return { filePath: resolvedSvg, contentType: "image/svg+xml; charset=utf-8" };
  }
  await stat(resolvedFile);
  return { filePath: resolvedFile, contentType: "image/png" };
}

function truncatePreviewText(value: string | undefined, maxLength: number) {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

export function buildAcademicPptSlidesPreview(outline: AcademicPptOutline, settings?: AcademicPptSettings): AcademicPptSlidePreview[] {
  const normalizedSettings = settings ? normalizeAcademicPptSettings(settings) : undefined;
  const template = normalizedSettings ? getAcademicPptTemplateForSettings(normalizedSettings) : undefined;
  return outline.slides.slice(0, MAX_PREVIEW_SLIDES).map((slide, index) => ({
    id: `generated-${index + 1}`,
    index: index + 1,
    title: truncatePreviewText(slide.title, 96) || `Slide ${index + 1}`,
    subtitle: slide.subtitle ? truncatePreviewText(slide.subtitle, 120) : undefined,
    layout: slide.layout,
    visualType: slide.visualType,
    templateIntent: slide.templateIntent ? truncatePreviewText(slide.templateIntent, 160) : undefined,
    templateId: template?.id,
    bullets: slide.bullets
      .slice(0, MAX_PREVIEW_BULLETS)
      .map((bullet) => truncatePreviewText(bullet, 150))
      .filter(Boolean),
    visualHint: slide.visualHint ? truncatePreviewText(slide.visualHint, 180) : undefined,
    emphasis: slide.emphasis ? truncatePreviewText(slide.emphasis, 140) : undefined,
    iconDecorations:
      normalizedSettings?.enableIconDecoration && template
        ? planAcademicPptIconDecorations({ slide, slideIndex: index + 1, templateId: template.id }).map(
            (decoration): AcademicPptIconDecoration => ({
              kind: decoration.kind,
              label: decoration.label,
              tone: decoration.tone
            })
          )
        : undefined,
    status: "ready"
  }));
}

export function buildAcademicPptPreviewManifestForSnapshot(record: AcademicPptTaskRecord): AcademicPptPreviewManifest | undefined {
  if (!record.previewType) return undefined;
  const slides: AcademicPptNativePreviewSlide[] =
    record.previewAssetsReady && (record.previewType === "image" || record.previewType === "svg") && record.previewAvailable
      ? Array.from({ length: record.previewSlideCount || 0 }, (_, index) => ({
          index,
          pageNumber: index + 1,
          url: previewAssetUrl(record.taskId, index + 1),
          imageUrl: previewAssetUrl(record.taskId, index + 1),
          assetPath: previewAssetPath(index + 1, record.previewType || "image"),
          source:
            record.previewAvailable && record.previewType === "svg"
              ? "svg_final"
              : record.previewAvailable && (record.previewType === "image" || record.previewType === "pdf")
                ? "native_preview"
                : "structured_placeholder",
          storageProvider: "local"
        }))
      : [];
  return {
    available: Boolean(record.previewAssetsReady && record.previewAvailable),
    type: record.previewType,
    source:
      record.previewAvailable && record.previewType === "svg"
        ? "svg_final"
        : record.previewAvailable && (record.previewType === "image" || record.previewType === "pdf")
          ? "native_preview"
          : "structured_placeholder",
    slideCount: record.previewSlideCount || record.slideCount || record.slidesPreview?.length || 0,
    previewCount: slides.length,
    slides,
    taskId: record.taskId,
    status:
      record.previewAssetsReady && record.previewAvailable
        ? "ready"
        : record.status === "queued" || record.status === "pending" || record.status === "running"
          ? "pending"
          : "unavailable",
    pptxUrl: record.pptxUrl || `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(record.taskId)}/download`,
    finalPptxPath: record.outputFilePath ? toTaskRelativePath(record.taskId, record.outputFilePath) : undefined,
    previewManifestUrl: record.previewManifestUrl || `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(record.taskId)}/preview`,
    previewStoragePrefix: record.previewStoragePrefix || `academic-ppt/tasks/${record.taskId}/previews`,
    storageProvider: record.outputStorageProvider || "local",
    fallbackReason: record.previewFallbackReason,
    createdAt: record.previewUpdatedAt || record.updatedAt,
    updatedAt: record.previewUpdatedAt || record.updatedAt,
    generatedAt: record.previewUpdatedAt || record.updatedAt
  };
}

export async function readAcademicPptLogs(taskId: string, limit = 100) {
  const raw = await readFile(getTaskLogsPath(taskId), "utf8");
  const logs = JSON.parse(raw) as AcademicPptTaskLog[];
  return logs.slice(-Math.min(Math.max(limit, 1), 100));
}

export async function writeAcademicPptUploadedFile(taskId: string, file: File) {
  const safeName = sanitizeAcademicPptFileName(file.name);
  const uploadDir = getAcademicPptUploadDir(taskId);
  await mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, safeName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, bytes);
  return { safeName, filePath, size: bytes.byteLength };
}

export async function getAcademicPptDownloadInfo(taskId: string) {
  const record = await readAcademicPptTaskRecord(taskId);
  if (record.status !== "success") {
    return { status: record.status as AcademicPptTaskStatus, filePath: undefined, sha256: undefined, fileSize: undefined };
  }
  if (!record.outputFilePath) {
    return { status: record.status as AcademicPptTaskStatus, filePath: undefined, sha256: undefined, fileSize: undefined };
  }
  const resolvedOutput = path.resolve(record.outputFilePath);
  const resolvedTaskDir = path.resolve(getAcademicPptTaskDir(taskId));
  if (!isPathInsideDirectory(resolvedOutput, resolvedTaskDir)) {
    throw new Error("下载路径无效。");
  }
  await ensureAcademicPptPptxDownloadable(resolvedOutput);
  const fileStat = await stat(resolvedOutput);
  return {
    status: record.status as AcademicPptTaskStatus,
    filePath: resolvedOutput,
    sha256: await sha256File(resolvedOutput),
    fileSize: fileStat.size
  };
}

export function toAcademicPptSnapshot(record: AcademicPptTaskRecord) {
  const currentStage = record.currentStage || record.currentStep;
  const snapshotFailedStage = record.failedStage || (record.status === "failed" ? inferAcademicPptFailedStage(record) : undefined);
  const snapshotPreviousFailedStage =
    record.previousFailedStage === "completed" ? inferAcademicPptFailedStage(record) : record.previousFailedStage;
  const errorSummary = record.errorSummary || record.error;
  const progressState = record.progressState || buildAcademicPptProgressState(record);
  return {
    taskId: record.taskId,
    status: record.status,
    progress: record.progress,
    currentStep: record.currentStep,
    currentStage,
    failedStage: snapshotFailedStage,
    errorSummary,
    errorDetails: record.errorDetails,
    lastSuccessfulStage: record.lastSuccessfulStage || record.lastCompletedStep,
    isResumed: record.isResumed,
    resumedAt: record.resumedAt,
    resumedFromStage: record.resumedFromStage,
    previousFailedStage: snapshotPreviousFailedStage,
    progressState,
    error: record.error,
    outputStorageProvider: record.outputStorageProvider,
    pptxUrl: record.pptxUrl,
    previewManifestUrl: record.previewManifestUrl,
    previewStoragePrefix: record.previewStoragePrefix,
    previewAssetsReady: record.previewAssetsReady,
    resumable: record.resumable,
    resumeFromStep: record.resumeFromStep,
    lastCompletedStep: record.lastCompletedStep,
    retryCount: record.retryCount,
    maxRetries: record.maxRetries,
    timeoutAt: record.timeoutAt,
    modelSource: record.modelSource,
    modelName: record.modelName,
    fallbackReason: record.fallbackReason,
    generationMode: record.generationMode,
    visualPipelineStatus: record.visualPipelineStatus,
    generatorSource: record.generatorSource,
    requestSnapshot: record.requestSnapshot,
    modelBridgeStatus: record.modelBridgeStatus,
    modelBridgePrimaryModel: record.modelBridgePrimaryModel,
    modelBridgePrimaryStatus: record.modelBridgePrimaryStatus,
    modelBridgeFallbackModel: record.modelBridgeFallbackModel,
    modelBridgeFallbackStatus: record.modelBridgeFallbackStatus,
    modelBridgeErrorSummary: record.modelBridgeErrorSummary,
    modelBridgeUrlSource: record.modelBridgeUrlSource,
    slideCount: record.slideCount,
    outputFileSize: record.outputFileSize,
    templateId: record.templateId,
    templateName: record.templateName,
    templateStyle: record.templateStyle,
    sourceFileType: record.sourceFileType,
    extractedTextLength: record.extractedTextLength,
    outlineTitle: record.outlineTitle,
    completedAt: record.completedAt,
    startedAt: record.startedAt,
    failedAt: record.failedAt,
    cancelledAt: record.cancelledAt,
    qualityScore: record.qualityScore,
    qualityLevel: record.qualityLevel,
    qualityIssuesCount: record.qualityIssuesCount,
    repairRounds: record.repairRounds,
    slidesPreview: record.slidesPreview,
    previewUpdatedAt: record.previewUpdatedAt,
    nativePreview: buildAcademicPptPreviewManifestForSnapshot(record),
    previewAvailable: record.previewAvailable,
    previewType: record.previewType,
    previewSlideCount: record.previewSlideCount,
    previewFallbackReason: record.previewFallbackReason,
    selectedVariants: record.selectedVariants,
    roleMapping: record.roleMapping,
    visualQaScore: record.visualQaScore,
    visualQaLevel: record.visualQaLevel,
    visualQaIssuesCount: record.visualQaIssuesCount,
    visualQaEnabled: record.visualQaEnabled,
    visualQaSummary: record.visualQaSummary,
    visualQaPreviewType: record.visualQaPreviewType,
    iconDecorationEnabled: record.iconDecorationEnabled,
    researchEnabled: record.researchEnabled,
    externalResearchEnabled: record.externalResearchEnabled,
    deepResearchEnabled: record.deepResearchEnabled,
    webSearchEnabled: record.webSearchEnabled,
    searchEnabled: record.searchEnabled,
    searchProvider: record.searchProvider,
    searchStatus: record.searchStatus,
    researchStatus: record.researchStatus,
    researchSourcesCount: record.researchSourcesCount,
    researchFallbackReason: record.researchFallbackReason,
    researchBriefUpdatedAt: record.researchBriefUpdatedAt,
    modelCriticEnabled: record.modelCriticEnabled,
    modelCriticStatus: record.modelCriticStatus,
    modelCriticScore: record.modelCriticScore,
    modelCriticLevel: record.modelCriticLevel,
    modelCriticIssuesCount: record.modelCriticIssuesCount,
    modelCriticRounds: record.modelCriticRounds,
    modelCriticFallbackReason: record.modelCriticFallbackReason,
    autoRepairFallbackReason: record.autoRepairFallbackReason,
    autoRepairRounds: record.autoRepairRounds,
    autoRepairApplied: record.autoRepairApplied,
    finalQualityScore: record.finalQualityScore,
    finalVisualQaScore: record.finalVisualQaScore,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    downloadUrl:
      record.status === "success"
        ? record.pptxUrl || `/api/smart-tools/academic-ppt/tasks/${encodeURIComponent(record.taskId)}/download`
        : undefined
  };
}

export async function markAcademicPptFailed(taskId: string, message: string) {
  const record = await readAcademicPptTaskRecord(taskId).catch(() => null);
  const failedStage = record?.currentStage || (record?.currentStep !== "failed" ? record?.currentStep : undefined) || record?.resumeFromStep || "generating_slides";
  const details = message ? { message } : undefined;
  await updateAcademicPptTaskRecord(taskId, {
    status: "failed",
    progress: 100,
    currentStep: "failed",
    currentStage: "failed",
    failedStage,
    errorSummary: message,
    errorDetails: details ? JSON.stringify(details).slice(0, 2000) : undefined,
    error: message,
    resumable: Boolean(record?.lastCompletedStep),
    failedAt: new Date().toISOString()
  });
  await appendAcademicPptLog(
    taskId,
    "error",
    `Task failed. taskId=${taskId} failedStage=${failedStage} errorSummary=${message}`
  );
}

export async function requestAcademicPptTaskCancellation(taskId: string) {
  const record = await readAcademicPptTaskRecord(taskId);
  if (record.status === "success" || record.status === "failed" || record.status === "cancelled") {
    return record;
  }
  const { requestAcademicPptToolsEngineCancellation } = await import("@/lib/smart-tools/academic-ppt/tools-engine-client");
  await requestAcademicPptToolsEngineCancellation(taskId).catch(() => undefined);
  const isQueued = record.status === "queued" || record.status === "pending";
  const next = await updateAcademicPptTaskRecord(taskId, {
    status: "cancelled",
    progress: isQueued ? 100 : record.progress,
    currentStep: "cancelled",
    currentStage: "cancelled",
    cancelRequested: true,
    resumable: false,
    error: "用户请求取消任务。",
    cancelledAt: new Date().toISOString()
  });
  await appendAcademicPptLog(taskId, "warn", "用户请求取消任务。");
  return next;
}

export async function assertAcademicPptTaskNotCancelled(taskId: string) {
  const record = await readAcademicPptTaskRecord(taskId);
  if (record.cancelRequested || record.status === "cancelled") {
    throw new Error("任务已取消。");
  }
}

export async function updateAcademicPptStep(
  taskId: string,
  currentStep: AcademicPptTaskStep,
  progress: number,
  message: string,
  lastCompletedStep?: AcademicPptTaskStep
) {
  await assertAcademicPptTaskNotCancelled(taskId);
  const isAlreadyFailed = currentStep === "failed";
  await updateAcademicPptTaskRecord(taskId, {
    status: currentStep === "completed" ? "success" : "running",
    currentStep,
    currentStage: currentStep,
    progress,
    ...(isAlreadyFailed ? {} : { error: undefined, errorSummary: undefined, errorDetails: undefined, failedStage: undefined }),
    ...(lastCompletedStep ? { lastSuccessfulStage: lastCompletedStep } : {}),
    ...(lastCompletedStep ? { lastCompletedStep } : {}),
    ...(currentStep === "completed"
      ? {
          completedAt: new Date().toISOString(),
          resumable: false,
          lastSuccessfulStage: "completed",
          failedStage: undefined,
          errorSummary: undefined,
          errorDetails: undefined,
          error: undefined
        }
      : {})
  });
  await appendAcademicPptLog(taskId, "info", message);
}
