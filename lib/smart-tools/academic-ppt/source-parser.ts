import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { getKimiFileContent, uploadKimiFile } from "@/lib/agent/skills/parse-document";
import { parseDocxPackage } from "@/lib/document/docx-package";
import type { AcademicPptTaskRecord } from "@/lib/smart-tools/academic-ppt/types";

export type AcademicPptSourceText = {
  title?: string;
  text: string;
  characterCount: number;
  sourceKind: "tex" | "text" | "markdown" | "pptx" | "pdf";
};

const SOURCE_PARSE_TIMEOUT_MS = 120_000;

function withTimeout(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`academic_ppt_source_parse_timeout:${timeoutMs}`)), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timer)
  };
}

function stripLatexComments(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|[^\\])%.*/, "$1"))
    .join("\n");
}

function extractLatexValue(input: string, command: string) {
  const pattern = new RegExp(`\\\\${command}\\s*\\{([\\s\\S]*?)\\}`, "i");
  const match = input.match(pattern);
  return match?.[1]?.replace(/\s+/g, " ").trim();
}

function cleanLatexText(input: string) {
  return stripLatexComments(input)
    .replace(/\\begin\{abstract\}/gi, "\nAbstract\n")
    .replace(/\\end\{abstract\}/gi, "\n")
    .replace(/\\(section|subsection|subsubsection)\*?\{([^{}]+)\}/gi, "\n\n$2\n")
    .replace(/\\(title|author|date)\{[^{}]*\}/gi, "\n")
    .replace(/\\(cite|ref|label|url|href)(\[[^\]]*])?\{([^{}]*)\}/gi, "$3")
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*])?/g, " ")
    .replace(/[{}$]/g, " ")
    .replace(/~|\\_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXmlText(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractPptxText(buffer: Buffer) {
  const pkg = parseDocxPackage(buffer);
  const slideEntries = pkg.entries
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.name))
    .sort((a, b) => {
      const ai = Number(a.name.match(/slide(\d+)\.xml/)?.[1] || 0);
      const bi = Number(b.name.match(/slide(\d+)\.xml/)?.[1] || 0);
      return ai - bi;
    });
  const slides = slideEntries
    .map((entry, index) => {
      const xml = entry.content.toString("utf8");
      const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
        .map((match) => decodeXmlText(match[1] || "").replace(/\s+/g, " ").trim())
        .filter(Boolean);
      return texts.length ? `Slide ${index + 1}: ${texts.join(" / ")}` : "";
    })
    .filter(Boolean);
  return slides.join("\n");
}

async function extractPdfTextWithKimi(record: AcademicPptTaskRecord) {
  const buffer = await readFile(record.inputFilePath);
  const file = new File([buffer], record.inputFileName, { type: "application/pdf" });
  const timeout = withTimeout(SOURCE_PARSE_TIMEOUT_MS);
  try {
    const fileId = await uploadKimiFile(file, "file-extract", timeout.signal);
    return await getKimiFileContent(fileId, timeout.signal);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "MISSING_KIMI_API_KEY") {
      throw new Error("PDF 解析需要复用现有 Kimi 文件理解能力，但当前未配置 Kimi API Key。");
    }
    throw new Error(`PDF 解析失败：${message}`);
  } finally {
    timeout.dispose();
  }
}

export async function extractAcademicPptSourceText(record: AcademicPptTaskRecord): Promise<AcademicPptSourceText> {
  const extension = path.extname(record.inputFileName).toLowerCase();
  if (extension === ".pdf") {
    const text = (await extractPdfTextWithKimi(record)).replace(/\s+/g, " ").trim().slice(0, 60_000);
    if (text.length < 80) {
      throw new Error("The PDF file did not contain enough extractable text to generate an academic presentation.");
    }
    return {
      title: undefined,
      text,
      characterCount: text.length,
      sourceKind: "pdf"
    };
  }
  if (extension === ".pptx") {
    const buffer = await readFile(record.inputFilePath);
    const text = extractPptxText(buffer).replace(/\s+/g, " ").trim().slice(0, 60_000);
    if (text.length < 80) {
      throw new Error("The PPTX file did not contain enough extractable slide text to generate an academic presentation.");
    }
    return {
      title: undefined,
      text,
      characterCount: text.length,
      sourceKind: "pptx"
    };
  }
  if (extension !== ".tex") {
    if (extension === ".txt" || extension === ".md" || extension === ".markdown") {
      const raw = await readFile(record.inputFilePath, "utf8");
      const text = raw.replace(/\s+/g, " ").trim().slice(0, 60_000);
      if (text.length < 80) {
        throw new Error("The source file did not contain enough readable text to generate an academic presentation.");
      }
      return {
        title: undefined,
        text,
        characterCount: text.length,
        sourceKind: extension === ".txt" ? "text" : "markdown"
      };
    }
    throw new Error("Unsupported academic PPT source file. Phase 3 supports TeX, TXT and Markdown source files.");
  }

  const raw = await readFile(record.inputFilePath, "utf8");
  const title = extractLatexValue(raw, "title");
  const text = cleanLatexText(raw).slice(0, 60_000);
  if (text.length < 80) {
    throw new Error("The TeX source did not contain enough readable text to generate an academic presentation.");
  }

  return {
    title,
    text,
    characterCount: text.length,
    sourceKind: "tex"
  };
}
