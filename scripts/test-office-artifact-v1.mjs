import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function read(path) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function makePreviewPng(width = 1280, height = 720) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  const chunk = (type, data) => {
    const buffer = Buffer.alloc(12 + data.length);
    buffer.writeUInt32BE(data.length, 0);
    buffer.write(type, 4, 4, "ascii");
    data.copy(buffer, 8);
    return buffer;
  };
  return Buffer.concat([signature, chunk("IHDR", ihdrData), chunk("IDAT", Buffer.alloc(4096, 127)), chunk("IEND", Buffer.alloc(0))]);
}

function compileLocalModule(entryPath, modules) {
  const absoluteEntry = resolve(process.cwd(), entryPath);
  const tempRoot = resolve(tmpdir(), `nexus-office-artifact-v1-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const resolved = new Map();

  function resolveImport(fromPath, specifier) {
    if (specifier.startsWith("@/")) return resolve(process.cwd(), specifier.slice(2));
    if (specifier.startsWith(".")) return resolve(dirname(fromPath), specifier);
    return null;
  }

  function resolveTsPath(pathWithoutExtension) {
    for (const candidate of [pathWithoutExtension, `${pathWithoutExtension}.ts`, `${pathWithoutExtension}.tsx`]) {
      if (modules.some((modulePath) => resolve(process.cwd(), modulePath) === candidate)) return candidate;
    }
    return null;
  }

  function visit(filePath) {
    const fullPath = filePath.endsWith(".ts") || filePath.endsWith(".tsx") ? filePath : resolveTsPath(filePath);
    if (!fullPath || resolved.has(fullPath)) return;
    const relative = fullPath.slice(process.cwd().length + 1).replace(/\\/g, "/");
    assert(modules.includes(relative), `Unexpected module import in local compile: ${relative}`);
    const source = read(relative);
    resolved.set(fullPath, source);
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const next = resolveImport(fullPath, match[1]);
      if (next) visit(next);
    }
  }

  visit(absoluteEntry);

  for (const [sourcePath, source] of resolved) {
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
        moduleResolution: ts.ModuleResolutionKind.Bundler
      }
    }).outputText;
    const relative = sourcePath.slice(process.cwd().length + 1).replace(/\\/g, "/").replace(/\.(ts|tsx)$/, ".mjs");
    const outputPath = resolve(tempRoot, relative);
    mkdirSync(dirname(outputPath), { recursive: true });
    let rewritten = output;
    for (const modulePath of modules) {
      const tsPath = modulePath.replace(/\\/g, "/");
      const withoutExt = tsPath.replace(/\.(ts|tsx)$/, "");
      const mjsPath = `/${withoutExt}.mjs`;
      rewritten = rewritten
        .replaceAll(`"@/${withoutExt}"`, `"${pathToFileURL(resolve(tempRoot, mjsPath.slice(1))).href}"`)
        .replaceAll(`'@/${withoutExt}'`, `'${pathToFileURL(resolve(tempRoot, mjsPath.slice(1))).href}'`);
    }
    rewritten = rewritten.replace(/from\s+["'](\.{1,2}\/[^"']+)["']/g, (full, specifier) => {
      if (specifier.endsWith(".mjs")) return full;
      const target = resolve(dirname(sourcePath), specifier);
      const targetTs = resolveTsPath(target);
      if (!targetTs) return full;
      return full.replace(specifier, `${specifier}.mjs`);
    });
    writeFileSync(outputPath, rewritten);
  }

  return {
    entryUrl: pathToFileURL(resolve(tempRoot, entryPath.replace(/\.(ts|tsx)$/, ".mjs"))).href,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true })
  };
}

const presentationCompile = compileLocalModule("lib/presentation/v2/artifact-pipeline.ts", [
  "lib/presentation/types.ts",
  "lib/presentation/v2/artifact-pipeline.ts",
  "lib/presentation/v2/html-slide.ts",
  "lib/presentation/v2/image-policy.ts",
  "lib/presentation/v2/preview.ts",
  "lib/presentation/v2/presets.ts",
  "lib/presentation/v2/raster-qa.ts",
  "lib/presentation/v2/rendered-qa.ts",
  "lib/presentation/v2/themes.ts",
  "lib/presentation/providers/local.ts"
]);

const documentCompile = compileLocalModule("lib/document/create.ts", [
  "lib/document/create.ts",
  "lib/document/markdown.ts",
  "lib/document/plan.ts",
  "lib/document/quality.ts",
  "lib/document/templates.ts",
  "lib/document/types.ts",
  "lib/document/zip.ts"
]);

try {
  const { preparePresentationArtifactV1 } = await import(presentationCompile.entryUrl);
  const { createPresentationPreviewArtifacts } = await import(presentationCompile.entryUrl);
  const { checkRasterPreviewImages } = await import(presentationCompile.entryUrl);
  const { createDocxBuffer, markdownToDocumentXml } = await import(documentCompile.entryUrl);

  const result = await preparePresentationArtifactV1({
    deck: {
      title: "Academic Teaching Deck",
      style: "teaching",
      theme: "clean_education",
      slides: [
        { type: "cover", layoutPreset: "teaching_cover", title: "Motion Design Lesson", subtitle: "Keyframes and timing", imageQuery: "animation classroom visual" },
        { type: "agenda", layoutPreset: "agenda_list", title: "Agenda", bullets: ["Concept", "Example", "Practice"] },
        { type: "imageText", layoutPreset: "image_explanation", title: "Visual Explanation", bullets: ["Observe", "Compare", "Apply"], imageQuery: "animation keyframe curve" }
      ]
    },
    preview: {
      outputDir: resolve(process.cwd(), "tmp/office-artifact-v1-test"),
      enableNativeConversion: false
    }
  });

  assert(result.pptx.buffer.length > 1024, "Artifact V1 should generate a PPTX buffer");
  assert(result.preview.status === "xml_fallback", "Artifact V1 preview should degrade to XML fallback without native conversion");
  assert(result.preview.slides.length === 3, "Artifact V1 should expose one preview record per slide");
  assert(result.preview.slides[0].svgPath?.endsWith(".svg"), "Artifact V1 should write SVG fallback previews");
  assert(result.rasterQa.status === "skipped", "Artifact V1 raster QA should skip when native PNG images are unavailable");
  assert(result.visualQa.passed, `Artifact V1 visual QA should pass the generated deck: ${JSON.stringify(result.visualQa.findings)}`);
  assert(result.html.slides.length === 3, "Artifact V1 should render HTML slides");
  assert(result.html.html.includes("slide--teaching-cover"), "Artifact V1 HTML should include preset-specific classes");
  assert(result.html.html.includes("visual-stage"), "Artifact V1 HTML should include designed visual-stage markup");
  assert(result.html.html.includes("teaching-chip-row"), "Artifact V1 HTML should include teaching-specific cover chips");
  assert(result.html.html.includes("explanation-stack"), "Artifact V1 HTML should include image explanation layout markup");
  assert(result.theme.name.includes("Teaching"), "Artifact V1 should select a teaching theme");
  assert(result.imagePolicy.plan.some((item) => item.strategy === "web_search_first"), "Artifact V1 should prefer web search for requested visuals");
  assert(result.imagePolicy.plan.some((item) => item.fallbackProvider === "jimeng"), "Artifact V1 should keep Jimeng as generated image fallback");

  const visualArtifact = await preparePresentationArtifactV1({
    deck: {
      title: "Visual Fusion Deck",
      style: "teaching",
      slides: [
        {
          type: "cover",
          layoutPreset: "teaching_cover",
          title: "Visual Fusion",
          visualAsset: {
            buffer: makePreviewPng(),
            mimeType: "image/png",
            extension: "png",
            source: "web_search",
            alt: "classroom reference visual",
            sourceUrl: "https://example.com/classroom.png"
          }
        }
      ]
    },
    preview: {
      outputDir: resolve(process.cwd(), "tmp/office-artifact-v1-visual-fusion-test"),
      enableNativeConversion: false
    }
  });
  assert(visualArtifact.html.html.includes("data:image/png;base64,"), "Artifact V1 HTML previews should embed resolved visual assets");
  assert(visualArtifact.html.html.includes("visual-source--web-search"), "Artifact V1 HTML previews should mark searched visual assets for styling");

  const nativePreview = await createPresentationPreviewArtifacts({
    deck: {
      title: "Native Preview Deck",
      slides: [
        { type: "cover", layoutPreset: "teaching_cover", title: "Native Preview" },
        { type: "agenda", layoutPreset: "agenda_list", title: "Agenda" }
      ]
    },
    html: result.html,
    pptx: result.pptx.buffer,
    options: {
      outputDir: resolve(process.cwd(), "tmp/office-artifact-v1-native-test"),
      enableNativeConversion: true,
      nativeConverter: async ({ outputDir, expectedSlides }) => {
        const png = makePreviewPng();
        const imagePaths = Array.from({ length: expectedSlides }, (_, index) => {
          const path = resolve(outputDir, `native-${index + 1}.png`);
          writeFileSync(path, png);
          return path;
        });
        return {
          ok: true,
          imagePaths,
          diagnostics: ["fake native converter"]
        };
      }
    }
  });
  assert(nativePreview.status === "native_images", "Preview V2 should expose native image status when converter succeeds");
  assert(nativePreview.slides.every((slide) => slide.status === "native_image" && slide.imagePath?.endsWith(".png")), "Preview V2 should attach native image paths");

  const nativeRasterQa = checkRasterPreviewImages(nativePreview);
  assert(nativeRasterQa.status === "passed", `Raster QA should pass valid 16:9 PNG previews: ${JSON.stringify(nativeRasterQa.findings)}`);
  assert(nativeRasterQa.checkedSlides === 2, "Raster QA should count checked native preview images");

  const failedNativePreview = await createPresentationPreviewArtifacts({
    deck: { title: "Failed Native Preview Deck", slides: [{ type: "cover", layoutPreset: "teaching_cover", title: "Fallback Preview" }] },
    html: result.html,
    pptx: result.pptx.buffer,
    options: {
      outputDir: resolve(process.cwd(), "tmp/office-artifact-v1-native-fallback-test"),
      enableNativeConversion: true,
      enableHtmlPreviewFallback: false,
      nativeConverter: async () => ({
        ok: false,
        imagePaths: [],
        diagnostics: ["missing soffice"]
      })
    }
  });
  assert(failedNativePreview.status === "xml_fallback", "Preview V2 should fall back when native converter is unavailable");
  assert(failedNativePreview.diagnostics.some((item) => item.includes("missing soffice")), "Preview V2 should preserve converter diagnostics");
  assert(failedNativePreview.slides[0].svgPath?.endsWith(".svg"), "Preview V2 fallback should still write SVG previews");

  const htmlFallbackPreview = await createPresentationPreviewArtifacts({
    deck: { title: "HTML Preview Deck", slides: [{ type: "cover", layoutPreset: "teaching_cover", title: "HTML Preview" }] },
    html: result.html,
    pptx: result.pptx.buffer,
    options: {
      outputDir: resolve(process.cwd(), "tmp/office-artifact-v1-html-fallback-test"),
      enableNativeConversion: true,
      nativeConverter: async () => ({
        ok: false,
        imagePaths: [],
        diagnostics: ["missing native converter"]
      }),
      htmlPreviewRenderer: async ({ outputDir, expectedSlides }) => {
        const png = makePreviewPng();
        const imagePaths = Array.from({ length: expectedSlides }, (_, index) => {
          const path = resolve(outputDir, `html-${index + 1}.png`);
          writeFileSync(path, png);
          return path;
        });
        return {
          ok: true,
          imagePaths,
          diagnostics: ["fake html renderer"]
        };
      }
    }
  });
  assert(htmlFallbackPreview.status === "html_images", "Preview V2 should use HTML screenshots when native conversion fails");
  assert(htmlFallbackPreview.slides.every((slide) => slide.status === "html_image" && slide.imagePath?.endsWith(".png")), "Preview V2 should attach HTML fallback PNG paths");
  const htmlFallbackRasterQa = checkRasterPreviewImages(htmlFallbackPreview);
  assert(htmlFallbackRasterQa.status === "passed", `Raster QA should pass valid HTML fallback PNG previews: ${JSON.stringify(htmlFallbackRasterQa.findings)}`);

  const missingRasterQa = checkRasterPreviewImages({
    ...nativePreview,
    slides: nativePreview.slides.map((slide, index) => (index === 0 ? { ...slide, imagePath: resolve(process.cwd(), "tmp/missing-preview.png") } : slide))
  });
  assert(missingRasterQa.status === "warning", "Raster QA should warn when a native preview image is missing");
  assert(missingRasterQa.findings.some((finding) => finding.rule === "missing_preview_image"), "Raster QA should report missing preview images");

  const lessonXml = markdownToDocumentXml({
    title: "Lesson Plan",
    template: "lesson_plan",
    markdown: "# Lesson Plan\n\n## Objectives\n\n- Understand keyframes\n- Practice timing"
  });
  assert(!lessonXml.includes("DocTemplate"), "Word template V1 should not expose internal template markers");

  const reportBuffer = createDocxBuffer({
    title: "Research Report",
    template: "report",
    markdown: "# Research Report\n\n## Findings\n\n| Metric | Value |\n| --- | --- |\n| Accuracy | 92% |"
  });
  const reportXml = String(reportBuffer);
  assert(!reportXml.includes("DocTemplate"), "Word template V1 should not expose internal template markers");
  assert(reportXml.includes("word/styles.xml"), "Word template V1 should preserve normal DOCX package structure");
} finally {
  presentationCompile.cleanup();
  documentCompile.cleanup();
}

console.log(JSON.stringify({ ok: true }, null, 2));
