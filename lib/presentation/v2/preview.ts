import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import type { PresentationDeck } from "@/lib/presentation/types";
import type { HtmlSlideDeck } from "@/lib/presentation/v2/html-slide";

const execFileAsync = promisify(execFile);

export type NativePreviewConverterInput = {
  pptxPath: string;
  outputDir: string;
  expectedSlides: number;
};

export type NativePreviewConverterResult = {
  ok: boolean;
  imagePaths: string[];
  diagnostics: string[];
};

export type NativePreviewConverter = (input: NativePreviewConverterInput) => Promise<NativePreviewConverterResult>;

export type HtmlPreviewRendererInput = {
  htmlPath: string;
  outputDir: string;
  expectedSlides: number;
};

export type HtmlPreviewRendererResult = NativePreviewConverterResult;

export type HtmlPreviewRenderer = (input: HtmlPreviewRendererInput) => Promise<HtmlPreviewRendererResult>;

type MinimalPlaywright = {
  chromium: {
    launch: (options: { headless: boolean; executablePath?: string }) => Promise<MinimalBrowser>;
  };
};

type MinimalBrowser = {
  newPage: (options: { viewport: { width: number; height: number }; deviceScaleFactor: number }) => Promise<MinimalPage>;
  close: () => Promise<void>;
};

type MinimalPage = {
  goto: (url: string, options: { waitUntil: "networkidle"; timeout: number }) => Promise<unknown>;
  addStyleTag: (options: { content: string }) => Promise<unknown>;
  locator: (selector: string) => MinimalLocator;
};

type MinimalLocator = {
  count: () => Promise<number>;
  nth: (index: number) => {
    screenshot: (options: { path: string }) => Promise<unknown>;
  };
};

export type PresentationPreviewOptions = {
  outputDir: string;
  enableNativeConversion?: boolean;
  nativeConverter?: NativePreviewConverter;
  enableHtmlPreviewFallback?: boolean;
  htmlPreviewRenderer?: HtmlPreviewRenderer;
};

export type PresentationPreviewSlide = {
  index: number;
  title: string;
  status: "svg_fallback" | "native_unavailable" | "native_image" | "html_image";
  svgPath?: string;
  imagePath?: string;
};

export type PresentationPreviewResult = {
  status: "xml_fallback" | "native_unavailable" | "native_images" | "html_images";
  outputDir: string;
  slides: PresentationPreviewSlide[];
  diagnostics: string[];
};

function escapeXml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgForSlide(title: string, subtitle: string | undefined, index: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" rx="0" fill="#f8fafc"/>
  <rect x="72" y="72" width="1136" height="576" rx="26" fill="#ffffff" stroke="#dbeafe" stroke-width="3"/>
  <rect x="112" y="118" width="140" height="12" fill="#2563eb"/>
  <text x="112" y="190" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#2563eb">Slide ${index + 1}</text>
  <text x="112" y="290" font-family="Arial, sans-serif" font-size="56" font-weight="700" fill="#0f172a">${escapeXml(title)}</text>
  <text x="112" y="352" font-family="Arial, sans-serif" font-size="26" fill="#64748b">${escapeXml(subtitle || "Generated presentation preview")}</text>
  <rect x="800" y="180" width="260" height="260" rx="36" fill="#e0f2fe"/>
  <rect x="850" y="250" width="220" height="26" rx="13" fill="#10b981"/>
  <rect x="850" y="306" width="160" height="26" rx="13" fill="#2563eb"/>
</svg>`;
}

type ToolLookupOptions = {
  envPath?: string;
  commands: string[];
  windowsPaths: string[];
};

async function commandExists(command: string) {
  const lookup = process.platform === "win32" ? "where" : "which";
  try {
    await execFileAsync(lookup, [command], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
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

function runtimeNodeModulePaths() {
  const explicit = process.env.PRESENTATION_PLAYWRIGHT_NODE_MODULES || process.env.PLAYWRIGHT_NODE_MODULES;
  const fromNodePath = process.env.NODE_PATH?.split(process.platform === "win32" ? ";" : ":").filter(Boolean) || [];
  const codexRuntime = process.env.USERPROFILE
    ? join(process.env.USERPROFILE, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules")
    : undefined;
  return [explicit, ...fromNodePath, codexRuntime].filter((path): path is string => Boolean(path));
}

function findLocalChromiumExecutable() {
  const configured = existingPath(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.CHROMIUM_EXECUTABLE_PATH);
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

function collectSiblingToolPaths(directory: string, executable: string) {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => [
        join(directory, entry.name, executable),
        join(directory, entry.name, "Library", "bin", executable),
        join(directory, entry.name, "bin", executable)
      ]);
  } catch {
    return [];
  }
}

async function findToolCommand({ envPath, commands, windowsPaths }: ToolLookupOptions) {
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
    envPath: process.env.LIBREOFFICE_PATH || process.env.SOFFICE_PATH,
    commands: ["soffice", "libreoffice"],
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
    envPath: process.env.PDFTOPPM_PATH || process.env.POPPLER_PDFTOPPM_PATH,
    commands: ["pdftoppm"],
    windowsPaths: [
      ...windowsProgramPaths(join("poppler", "Library", "bin", "pdftoppm.exe")),
      ...windowsProgramPaths(join("poppler", "bin", "pdftoppm.exe")),
      ...collectSiblingToolPaths("C:\\Program Files", "pdftoppm.exe"),
      ...collectSiblingToolPaths("C:\\Program Files (x86)", "pdftoppm.exe"),
      "C:\\ProgramData\\chocolatey\\bin\\pdftoppm.exe",
      ...scoopPaths
    ]
  });
}

function collectPngs(outputDir: string) {
  return readdirSync(outputDir)
    .filter((file) => /\.png$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((file) => join(outputDir, file));
}

export const defaultNativePreviewConverter: NativePreviewConverter = async ({ pptxPath, outputDir, expectedSlides }) => {
  const diagnostics: string[] = [];
  const soffice = await findSofficeCommand();
  const pdftoppm = await findPdftoppmCommand();

  if (!soffice) diagnostics.push("LibreOffice/soffice command not found.");
  if (!pdftoppm) diagnostics.push("Poppler pdftoppm command not found.");
  if (!soffice || !pdftoppm) return { ok: false, imagePaths: [], diagnostics };

  try {
    await execFileAsync(soffice, ["--headless", "--convert-to", "pdf", "--outdir", outputDir, pptxPath], { timeout: 60000 });
    const pdfPath = join(outputDir, `${basename(pptxPath).replace(/\.pptx$/i, "")}.pdf`);
    if (!existsSync(pdfPath)) {
      diagnostics.push(`Converted PDF not found: ${pdfPath}`);
      return { ok: false, imagePaths: [], diagnostics };
    }

    const prefix = join(outputDir, "native-slide");
    await execFileAsync(pdftoppm, ["-png", "-r", "144", pdfPath, prefix], { timeout: 60000 });
    const imagePaths = collectPngs(outputDir);
    if (imagePaths.length < expectedSlides) {
      diagnostics.push(`Native conversion produced ${imagePaths.length} images; expected ${expectedSlides}.`);
      return { ok: false, imagePaths, diagnostics };
    }

    diagnostics.push(`Native conversion produced ${imagePaths.length} PNG preview images.`);
    return { ok: true, imagePaths, diagnostics };
  } catch (error) {
    diagnostics.push(error instanceof Error ? error.message : "Native preview conversion failed.");
    return { ok: false, imagePaths: [], diagnostics };
  }
};

function requirePlaywright(modulePath?: string): MinimalPlaywright {
  const require = createRequire(modulePath ? join(modulePath, "presentation-preview.js") : import.meta.url);
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

export const defaultHtmlPreviewRenderer: HtmlPreviewRenderer = async ({ htmlPath, outputDir, expectedSlides }) => {
  const diagnostics: string[] = [];
  let browser: MinimalBrowser | null = null;

  try {
    const playwright = await loadPlaywright();
    const executablePath = findLocalChromiumExecutable() || undefined;
    browser = await playwright.chromium.launch({ headless: true, executablePath });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle", timeout: 30000 });
    await page.addStyleTag({
      content: `
        html,body{margin:0!important;padding:0!important;background:#fff!important}
        .nexus-html-deck{padding:0!important;gap:0!important;background:transparent!important}
        .nexus-slide{width:1280px!important;height:720px!important;box-shadow:none!important;border-radius:0!important}
      `
    });

    const slideLocator = page.locator(".nexus-slide");
    const renderedSlides = await slideLocator.count();
    if (renderedSlides < expectedSlides) {
      diagnostics.push(`HTML preview rendered ${renderedSlides} slides; expected ${expectedSlides}.`);
      return { ok: false, imagePaths: [], diagnostics };
    }

    const imagePaths: string[] = [];
    for (let index = 0; index < expectedSlides; index += 1) {
      const imagePath = join(outputDir, `html-slide-${String(index + 1).padStart(2, "0")}.png`);
      await slideLocator.nth(index).screenshot({ path: imagePath });
      imagePaths.push(imagePath);
    }

    diagnostics.push(`HTML preview renderer produced ${imagePaths.length} PNG preview images.`);
    return { ok: true, imagePaths, diagnostics };
  } catch (error) {
    diagnostics.push(error instanceof Error ? error.message : "HTML preview rendering failed.");
    return { ok: false, imagePaths: [], diagnostics };
  } finally {
    if (browser) await browser.close();
  }
};

export async function createPresentationPreviewArtifacts({
  deck,
  html,
  pptx,
  options
}: {
  deck: PresentationDeck;
  html: HtmlSlideDeck;
  pptx?: Buffer;
  options: PresentationPreviewOptions;
}): Promise<PresentationPreviewResult> {
  mkdirSync(options.outputDir, { recursive: true });
  const htmlPath = join(options.outputDir, "slides.html");
  writeFileSync(htmlPath, html.html, "utf8");
  const pptxPath = join(options.outputDir, "deck.pptx");
  if (pptx?.length) writeFileSync(pptxPath, pptx);

  const fallbackSlides = deck.slides.map((slide, index): PresentationPreviewSlide => {
    const svgPath = join(options.outputDir, `slide-${String(index + 1).padStart(2, "0")}.svg`);
    writeFileSync(svgPath, svgForSlide(slide.title, slide.subtitle, index), "utf8");
    return {
      index,
      title: slide.title,
      status: options.enableNativeConversion ? "native_unavailable" : "svg_fallback",
      svgPath
    };
  });

  const converter = options.nativeConverter || (options.enableNativeConversion ? defaultNativePreviewConverter : undefined);
  if (options.enableNativeConversion && converter && pptx?.length) {
    const native = await converter({
      pptxPath,
      outputDir: options.outputDir,
      expectedSlides: deck.slides.length
    });
    if (native.ok && native.imagePaths.length >= deck.slides.length) {
      return {
        status: "native_images",
        outputDir: options.outputDir,
        diagnostics: native.diagnostics,
        slides: deck.slides.map((slide, index) => ({
          index,
          title: slide.title,
          status: "native_image",
          imagePath: native.imagePaths[index],
          svgPath: fallbackSlides[index]?.svgPath
        }))
      };
    }

    const canUseHtmlFallback = options.enableHtmlPreviewFallback !== false;
    const htmlRenderer = options.htmlPreviewRenderer || (canUseHtmlFallback ? defaultHtmlPreviewRenderer : undefined);
    if (canUseHtmlFallback && htmlRenderer) {
      const htmlPreview = await htmlRenderer({
        htmlPath,
        outputDir: options.outputDir,
        expectedSlides: deck.slides.length
      });
      if (htmlPreview.ok && htmlPreview.imagePaths.length >= deck.slides.length) {
        return {
          status: "html_images",
          outputDir: options.outputDir,
          diagnostics: [...native.diagnostics, ...htmlPreview.diagnostics],
          slides: deck.slides.map((slide, index) => ({
            index,
            title: slide.title,
            status: "html_image",
            imagePath: htmlPreview.imagePaths[index],
            svgPath: fallbackSlides[index]?.svgPath
          }))
        };
      }
      native.diagnostics.push(...htmlPreview.diagnostics);
    }

    return {
      status: "xml_fallback",
      outputDir: options.outputDir,
      diagnostics: native.diagnostics.length ? native.diagnostics : ["Native preview conversion returned no images."],
      slides: fallbackSlides.map((slide) => ({ ...slide, status: "svg_fallback" }))
    };
  }

  return {
    status: "xml_fallback",
    outputDir: options.outputDir,
    diagnostics: options.enableNativeConversion ? ["Native preview converter is not configured."] : ["Native preview conversion disabled."],
    slides: fallbackSlides
  };
}
