import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { parseDocxPackage } from "@/lib/document/docx-package";

const execFileAsync = promisify(execFile);

export type WordVisualPreviewStatus = "images" | "pdf_only" | "skipped" | "failed";

export type WordVisualPreviewFileResult = {
  docxPath: string;
  source: string;
  outputDir: string;
  status: WordVisualPreviewStatus;
  pdfPath?: string;
  imagePaths: string[];
  diagnostics: string[];
  structuralSummary: {
    bytes: number;
    commentsPart: boolean;
    footerReference: boolean;
    headerReference: boolean;
    heading1Count: number;
    mediaCount: number;
    pageField: boolean;
    platformSignature: boolean;
    tableCount: number;
    trackedChangeCount: number;
  };
};

type MinimalPlaywright = {
  chromium: {
    launch: (options: { executablePath?: string; headless: boolean }) => Promise<MinimalBrowser>;
  };
};

type MinimalBrowser = {
  close: () => Promise<void>;
  newPage: (options: { deviceScaleFactor: number; viewport: { height: number; width: number } }) => Promise<MinimalPage>;
};

type MinimalPage = {
  goto: (url: string, options: { timeout: number; waitUntil: "networkidle" }) => Promise<unknown>;
  screenshot: (options: { fullPage: boolean; path: string }) => Promise<unknown>;
};

export type WordVisualPreviewManifest = {
  generatedAt: string;
  outputDir: string;
  status: WordVisualPreviewStatus;
  tools: {
    imageConverter: string | null;
    imageConverterType: "pdftoppm" | "magick" | null;
    soffice: string | null;
  };
  results: WordVisualPreviewFileResult[];
};

export type WordVisualPreviewOptions = {
  docxPaths: string[];
  enableConversion?: boolean;
  outputDir: string;
};

type ToolLookupOptions = {
  commands: string[];
  envPath?: string;
  windowsPaths: string[];
};

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function existingPath(candidate: string | undefined) {
  return candidate && existsSync(candidate) ? candidate : null;
}

function windowsProgramPaths(relativePath: string) {
  return [
    join("C:\\Program Files", relativePath),
    join("C:\\Program Files (x86)", relativePath)
  ];
}

async function commandExists(command: string) {
  const lookup = process.platform === "win32" ? "where" : "which";
  try {
    await execFileAsync(lookup, [command], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function findToolCommand({ commands, envPath, windowsPaths }: ToolLookupOptions) {
  const configuredPath = existingPath(envPath);
  if (configuredPath) return configuredPath;

  for (const command of commands) {
    if (await commandExists(command)) return command;
  }

  if (process.platform === "win32") {
    for (const candidate of windowsPaths) {
      const fullPath = existingPath(candidate);
      if (fullPath) return fullPath;
    }
  }

  return null;
}

async function findSofficeCommand() {
  return findToolCommand({
    commands: ["soffice", "libreoffice"],
    envPath: process.env.LIBREOFFICE_PATH || process.env.SOFFICE_PATH,
    windowsPaths: [
      ...windowsProgramPaths(join("LibreOffice", "program", "soffice.com")),
      ...windowsProgramPaths(join("LibreOffice", "program", "soffice.exe"))
    ]
  });
}

async function findPdftoppmCommand() {
  const userProfile = process.env.USERPROFILE;
  const scoopPaths = userProfile ? [join(userProfile, "scoop", "apps", "poppler", "current", "Library", "bin", "pdftoppm.exe")] : [];
  return findToolCommand({
    commands: ["pdftoppm"],
    envPath: process.env.PDFTOPPM_PATH || process.env.POPPLER_PDFTOPPM_PATH,
    windowsPaths: [
      ...windowsProgramPaths(join("poppler", "Library", "bin", "pdftoppm.exe")),
      ...windowsProgramPaths(join("poppler", "bin", "pdftoppm.exe")),
      "C:\\ProgramData\\chocolatey\\bin\\pdftoppm.exe",
      ...scoopPaths
    ]
  });
}

async function findMagickCommand() {
  return findToolCommand({
    commands: ["magick"],
    envPath: process.env.MAGICK_PATH || process.env.IMAGEMAGICK_PATH,
    windowsPaths: [
      ...windowsProgramPaths(join("ImageMagick-7.1.1-Q16-HDRI", "magick.exe")),
      ...windowsProgramPaths(join("ImageMagick-7.1.1-Q16", "magick.exe")),
      ...windowsProgramPaths(join("ImageMagick-7.1.0-Q16-HDRI", "magick.exe")),
      ...windowsProgramPaths(join("ImageMagick-7.1.0-Q16", "magick.exe")),
      "C:\\ProgramData\\chocolatey\\bin\\magick.exe"
    ]
  });
}

function runtimeNodeModulePaths() {
  const explicit = process.env.WORD_VISUAL_PLAYWRIGHT_NODE_MODULES || process.env.PLAYWRIGHT_NODE_MODULES;
  const fromNodePath = process.env.NODE_PATH?.split(process.platform === "win32" ? ";" : ":").filter(Boolean) || [];
  const codexRuntime = process.env.USERPROFILE
    ? join(process.env.USERPROFILE, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules")
    : undefined;
  return [explicit, ...fromNodePath, codexRuntime].filter((path): path is string => Boolean(path));
}

function requirePlaywright(modulePath?: string): MinimalPlaywright {
  const require = createRequire(modulePath ? join(modulePath, "word-visual-preview.js") : import.meta.url);
  return require("playwright") as MinimalPlaywright;
}

async function loadPlaywright() {
  try {
    return requirePlaywright();
  } catch (initialError) {
    for (const modulePath of runtimeNodeModulePaths()) {
      try {
        return requirePlaywright(modulePath);
      } catch {
        // Try the next configured module path.
      }
    }
    throw initialError;
  }
}

function findLocalChromiumExecutable() {
  const configured = existingPath(process.env.WORD_VISUAL_CHROMIUM_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.CHROMIUM_EXECUTABLE_PATH);
  if (configured) return configured;
  if (process.platform !== "win32") return null;

  const localAppData = process.env.LOCALAPPDATA;
  const candidates = [
    join("C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
    join("C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
    join("C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe"),
    join("C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
    localAppData ? join(localAppData, "Google", "Chrome", "Application", "chrome.exe") : undefined,
    localAppData ? join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe") : undefined
  ];

  for (const candidate of candidates) {
    const fullPath = existingPath(candidate);
    if (fullPath) return fullPath;
  }
  return null;
}

function safeDirectoryName(value: string, index: number) {
  const base = basename(value, extname(value))
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${String(index + 1).padStart(2, "0")}-${base || "document"}`;
}

function isRemoteDocx(value: string) {
  return /^https?:\/\//i.test(value);
}

function sanitizeSource(value: string) {
  if (!isRemoteDocx(value)) return value;
  try {
    const parsed = new URL(value);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value.replace(/\?.*$/, "");
  }
}

function remoteFileName(value: string, index: number) {
  try {
    const parsed = new URL(value);
    const name = basename(parsed.pathname);
    if (/\.docx$/i.test(name)) return name;
  } catch {
    // Fall through to a generated name.
  }
  return `remote-document-${index + 1}.docx`;
}

async function ensureLocalDocx(input: string, outputDir: string, index: number) {
  if (!isRemoteDocx(input)) return resolve(input);
  const downloadDir = join(outputDir, "_downloads");
  mkdirSync(downloadDir, { recursive: true });
  const localPath = join(downloadDir, `${String(index + 1).padStart(2, "0")}-${remoteFileName(input, index)}`);
  const response = await fetch(input);
  if (!response.ok) throw new Error(`Failed to download DOCX ${response.status}: ${sanitizeSource(input)}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(localPath, buffer);
  return localPath;
}

function collectPngs(outputDir: string) {
  return readdirSync(outputDir)
    .filter((file) => /\.png$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((file) => join(outputDir, file));
}

function structuralSummary(docxPath: string): WordVisualPreviewFileResult["structuralSummary"] {
  const buffer = readFileSync(docxPath);
  const docx = parseDocxPackage(buffer);
  const documentXml = docx.getText("word/document.xml") || "";
  const footerXml = docx.entries
    .filter((entry) => /^word\/footer\d+\.xml$/i.test(entry.name))
    .map((entry) => entry.content.toString("utf8"))
    .join("\n");
  const text = documentXml.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

  return {
    bytes: buffer.length,
    commentsPart: docx.entries.some((entry) => /^word\/comments\d*\.xml$/i.test(entry.name)),
    footerReference: /<w:footerReference\b/.test(documentXml),
    headerReference: /<w:headerReference\b/.test(documentXml),
    heading1Count: (documentXml.match(/w:pStyle w:val="Heading1"/g) || []).length,
    mediaCount: docx.entries.filter((entry) => /^word\/media\//i.test(entry.name)).length,
    pageField: /PAGE/.test(footerXml),
    platformSignature: /NexusAI|Generated by NexusAI/i.test(text),
    tableCount: (documentXml.match(/<w:tbl>/g) || []).length,
    trackedChangeCount: (documentXml.match(/<w:(ins|del)\b/g) || []).length
  };
}

async function convertDocxToPdf(soffice: string, docxPath: string, outputDir: string) {
  const profileDir = join(outputDir, "lo-profile");
  mkdirSync(profileDir, { recursive: true });
  await execFileAsync(soffice, [
    `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
    "--headless",
    "--invisible",
    "--nologo",
    "--nofirststartwizard",
    "--nodefault",
    "--norestore",
    "--convert-to",
    "pdf",
    "--outdir",
    outputDir,
    docxPath
  ], {
    maxBuffer: 2_000_000,
    timeout: 60_000
  });
  const pdfPath = join(outputDir, `${basename(docxPath, extname(docxPath))}.pdf`);
  return existsSync(pdfPath) ? pdfPath : null;
}

async function convertPdfToPngs(
  pdfPath: string,
  outputDir: string,
  imageConverter: string,
  imageConverterType: "pdftoppm" | "magick"
) {
  if (imageConverterType === "pdftoppm") {
    await execFileAsync(imageConverter, ["-png", "-r", "144", pdfPath, join(outputDir, "page")], {
      maxBuffer: 2_000_000,
      timeout: 120_000
    });
  } else {
    await execFileAsync(imageConverter, ["-density", "144", pdfPath, join(outputDir, "page-%03d.png")], {
      maxBuffer: 2_000_000,
      timeout: 120_000
    });
  }
  return collectPngs(outputDir);
}

async function screenshotPdfWithChromium(pdfPath: string, outputDir: string) {
  let browser: MinimalBrowser | null = null;
  try {
    const playwright = await loadPlaywright();
    const executablePath = findLocalChromiumExecutable() || undefined;
    browser = await playwright.chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1100, height: 1500 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(pdfPath).href, { waitUntil: "networkidle", timeout: 45_000 });
    const imagePath = join(outputDir, "pdf-preview.png");
    await page.screenshot({ fullPage: true, path: imagePath });
    return existsSync(imagePath) ? [imagePath] : [];
  } finally {
    if (browser) await browser.close();
  }
}

function manifestStatus(results: WordVisualPreviewFileResult[]): WordVisualPreviewStatus {
  if (results.some((result) => result.status === "failed")) return "failed";
  if (results.some((result) => result.status === "images")) return "images";
  if (results.some((result) => result.status === "pdf_only")) return "pdf_only";
  return "skipped";
}

function writeManualChecklist(manifest: WordVisualPreviewManifest) {
  const lines = [
    "# Word Visual Preview Checklist",
    "",
    `Generated at: ${manifest.generatedAt}`,
    "",
    "## Converter Status",
    "",
    `- LibreOffice/soffice: ${manifest.tools.soffice || "not found"}`,
    `- PDF to PNG: ${manifest.tools.imageConverter || "not found"}`,
    "",
    "## Manual Review Points",
    "",
    "- Title area is natural and not a blank cover page.",
    "- Heading hierarchy is clear.",
    "- Paragraph spacing is readable.",
    "- Tables are not squeezed and headers are obvious.",
    "- Page numbers render in the footer when expected.",
    "- Section overview appears near the front for longer documents.",
    "- No platform signature or internal template marker is visible.",
    "- Uploaded DOCX revisions keep original headers, footers, images, and tables where present.",
    "",
    "## Files",
    ""
  ];

  for (const result of manifest.results) {
    lines.push(`### ${basename(result.docxPath)}`);
    lines.push("");
    lines.push(`- Source: ${result.source}`);
    lines.push(`- DOCX: ${result.docxPath}`);
    lines.push(`- Status: ${result.status}`);
    if (result.pdfPath) lines.push(`- PDF: ${result.pdfPath}`);
    if (result.imagePaths.length > 0) lines.push(`- PNG previews: ${result.imagePaths.join(", ")}`);
    lines.push(`- Tables: ${result.structuralSummary.tableCount}`);
    lines.push(`- Heading1: ${result.structuralSummary.heading1Count}`);
    lines.push(`- Footer/page field: ${result.structuralSummary.footerReference ? "footer" : "no footer"} / ${result.structuralSummary.pageField ? "PAGE" : "no PAGE"}`);
    lines.push(`- Header reference: ${result.structuralSummary.headerReference ? "yes" : "no"}`);
    lines.push(`- Media files: ${result.structuralSummary.mediaCount}`);
    lines.push(`- Tracked changes: ${result.structuralSummary.trackedChangeCount}`);
    lines.push(`- Comments part: ${result.structuralSummary.commentsPart ? "yes" : "no"}`);
    lines.push(`- Platform signature: ${result.structuralSummary.platformSignature ? "yes" : "no"}`);
    if (result.diagnostics.length > 0) lines.push(`- Diagnostics: ${result.diagnostics.join(" | ")}`);
    lines.push("");
  }

  writeFileSync(join(manifest.outputDir, "manual-review-checklist.md"), lines.join("\n"), "utf8");
}

export async function exportWordVisualPreviews(options: WordVisualPreviewOptions): Promise<WordVisualPreviewManifest> {
  const outputDir = resolve(options.outputDir);
  mkdirSync(outputDir, { recursive: true });
  const conversionEnabled = options.enableConversion ?? process.env.WORD_VISUAL_PREVIEW_STRUCTURAL_ONLY !== "1";

  const sources = options.docxPaths;
  const docxPaths = await Promise.all(sources.map((item, index) => ensureLocalDocx(item, outputDir, index)));
  assert(docxPaths.length > 0, "At least one DOCX path is required.");
  for (const docxPath of docxPaths) {
    assert(existsSync(docxPath), `DOCX not found: ${docxPath}`);
    assert(/\.docx$/i.test(docxPath), `Expected a .docx file: ${docxPath}`);
  }

  const soffice = conversionEnabled ? await findSofficeCommand() : null;
  const pdftoppm = conversionEnabled ? await findPdftoppmCommand() : null;
  const magick = conversionEnabled && !pdftoppm ? await findMagickCommand() : null;
  const imageConverter = pdftoppm || magick;
  const imageConverterType = pdftoppm ? "pdftoppm" : magick ? "magick" : null;
  const results: WordVisualPreviewFileResult[] = [];

  for (const [index, docxPath] of docxPaths.entries()) {
    const source = sanitizeSource(sources[index]);
    const fileOutputDir = join(outputDir, safeDirectoryName(source, index));
    mkdirSync(fileOutputDir, { recursive: true });
    const diagnostics: string[] = [];
    const summary = structuralSummary(docxPath);

    if (!conversionEnabled) {
      diagnostics.push("Visual conversion disabled; structural manifest and manual checklist generated.");
      results.push({ docxPath, source, outputDir: fileOutputDir, status: "skipped", imagePaths: [], diagnostics, structuralSummary: summary });
      continue;
    }

    if (!soffice) {
      diagnostics.push("LibreOffice/soffice command not found; DOCX to PDF/PNG preview skipped.");
      if (!imageConverter) diagnostics.push("Poppler pdftoppm or ImageMagick magick command not found; PDF to PNG preview unavailable.");
      results.push({ docxPath, source, outputDir: fileOutputDir, status: "skipped", imagePaths: [], diagnostics, structuralSummary: summary });
      continue;
    }

    let pdfPath: string | null = null;
    try {
      pdfPath = await convertDocxToPdf(soffice, docxPath, fileOutputDir);
      if (!pdfPath) {
        diagnostics.push("LibreOffice completed but no PDF was produced.");
        results.push({ docxPath, source, outputDir: fileOutputDir, status: "failed", imagePaths: [], diagnostics, structuralSummary: summary });
        continue;
      }
    } catch (error) {
      diagnostics.push(error instanceof Error ? error.message : "DOCX to PDF conversion failed.");
      results.push({ docxPath, source, outputDir: fileOutputDir, status: "failed", imagePaths: [], diagnostics, structuralSummary: summary });
      continue;
    }

    if (imageConverter && imageConverterType) {
      try {
        const imagePaths = await convertPdfToPngs(pdfPath, fileOutputDir, imageConverter, imageConverterType);
        if (imagePaths.length > 0) {
          diagnostics.push(`PNG preview generated for ${imagePaths.length} page(s).`);
          results.push({ docxPath, source, outputDir: fileOutputDir, status: "images", pdfPath, imagePaths, diagnostics, structuralSummary: summary });
          continue;
        }
        diagnostics.push("PDF to PNG conversion produced no images.");
      } catch (error) {
        diagnostics.push(error instanceof Error ? error.message : "PDF to PNG conversion failed.");
      }
    } else {
      diagnostics.push("Poppler pdftoppm or ImageMagick magick command not found; trying Chromium PDF screenshot fallback.");
    }

    try {
      const imagePaths = await screenshotPdfWithChromium(pdfPath, fileOutputDir);
      if (imagePaths.length > 0) {
        diagnostics.push("PNG preview generated through Chromium PDF screenshot fallback.");
        results.push({ docxPath, source, outputDir: fileOutputDir, status: "images", pdfPath, imagePaths, diagnostics, structuralSummary: summary });
        continue;
      }
      diagnostics.push("Chromium PDF screenshot fallback produced no images.");
    } catch (error) {
      diagnostics.push(error instanceof Error ? error.message : "Chromium PDF screenshot fallback failed.");
    }
    results.push({ docxPath, source, outputDir: fileOutputDir, status: "pdf_only", pdfPath, imagePaths: [], diagnostics, structuralSummary: summary });
  }

  const manifest: WordVisualPreviewManifest = {
    generatedAt: new Date().toISOString(),
    outputDir,
    status: manifestStatus(results),
    tools: { imageConverter, imageConverterType, soffice },
    results
  };
  writeFileSync(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  writeManualChecklist(manifest);
  return manifest;
}

function parseCliArgs(argv: string[]) {
  let outputDir = resolve(process.cwd(), "tmp", "word-visual-preview");
  let enableConversion = process.env.WORD_VISUAL_PREVIEW_STRUCTURAL_ONLY !== "1";
  const docxPaths: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--structural-only") {
      enableConversion = false;
      continue;
    }
    if (arg === "--out") {
      outputDir = resolve(argv[index + 1] || outputDir);
      index += 1;
      continue;
    }
    if (arg === "--list") {
      const listPath = resolve(argv[index + 1] || "");
      const listed = readFileSync(listPath, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      docxPaths.push(...listed);
      index += 1;
      continue;
    }
    docxPaths.push(arg);
  }

  return { docxPaths, enableConversion, outputDir };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const manifest = await exportWordVisualPreviews(options);
  console.log(JSON.stringify({
    ok: manifest.status !== "failed",
    outputDir: manifest.outputDir,
    status: manifest.status,
    tools: manifest.tools,
    files: manifest.results.map((result) => ({
      docxPath: result.docxPath,
      status: result.status,
      pdfPath: result.pdfPath,
      imageCount: result.imagePaths.length,
      diagnostics: result.diagnostics
    }))
  }, null, 2));
  if (manifest.status === "failed") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
