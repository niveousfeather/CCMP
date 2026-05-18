import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function read(path) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function compileLocalModule(entryPath, modules) {
  const tempRoot = resolve(tmpdir(), `nexus-ppt-v2-preview-${Date.now()}`);
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
    if (!modules.includes(relative)) throw new Error(`Unexpected module import: ${relative}`);
    const source = read(relative);
    resolved.set(fullPath, source);
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const next = resolveImport(fullPath, match[1]);
      if (next) visit(next);
    }
  }

  visit(resolve(process.cwd(), entryPath));

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

const deck = {
  title: "Nexus PPT V2 Preview",
  style: "teaching",
  theme: "clean_education",
  slides: [
    { type: "cover", layoutPreset: "academic_cover", title: "Transformer Paper Talk", subtitle: "Method, experiments, and findings" },
    { type: "cover", layoutPreset: "teaching_cover", title: "3D Animation Lesson", subtitle: "Keyframes and motion principles" },
    { type: "section", layoutPreset: "section_divider", title: "Background and Motivation", subtitle: "From concepts to classroom practice" },
    { type: "agenda", layoutPreset: "agenda_list", title: "Lesson Agenda", bullets: ["Problem framing and goals", "Core method walkthrough", "Case comparison", "Practice and summary"] },
    { type: "imageText", layoutPreset: "image_explanation", title: "How Keyframes Shape Motion", bullets: ["Keyframes define start and end states", "Curves control speed changes", "Ease-in and ease-out improve natural motion"] },
    { type: "timeline", layoutPreset: "process_steps", title: "Practice Workflow", bullets: ["Collect references", "Break down motion phases", "Set keyframes", "Tune curves", "Review output"] },
    { type: "comparison", layoutPreset: "comparison_matrix", title: "Method Comparison", bullets: ["Traditional: simple structure", "Traditional: weaker transfer", "Improved: richer context", "Improved: more stable output"] },
    {
      type: "data",
      layoutPreset: "data_insight",
      title: "Experiment Highlights",
      metrics: [
        { label: "Accuracy", value: "+12.4%", detail: "Best validation split" },
        { label: "Generation Time", value: "-28%", detail: "Compared with baseline" },
        { label: "Case Coverage", value: "3 types", detail: "Paper, lesson, and report decks" }
      ]
    },
    { type: "cards", layoutPreset: "lesson_exercise", title: "Class Exercise", bullets: ["Observe takeoff, airtime, and landing", "Mark at least five keyframes", "Explain the curve setting for each phase"] }
  ]
};

const compiled = compileLocalModule("lib/presentation/v2/artifact-pipeline.ts", [
  "lib/presentation/providers/local.ts",
  "lib/presentation/types.ts",
  "lib/presentation/v2/artifact-pipeline.ts",
  "lib/presentation/v2/html-slide.ts",
  "lib/presentation/v2/image-policy.ts",
  "lib/presentation/v2/presets.ts",
  "lib/presentation/v2/preview.ts",
  "lib/presentation/v2/raster-qa.ts",
  "lib/presentation/v2/rendered-qa.ts",
  "lib/presentation/v2/themes.ts"
]);

try {
  const { preparePresentationArtifactV1 } = await import(compiled.entryUrl);
  const artifact = await preparePresentationArtifactV1({
    deck,
    preview: {
      outputDir: resolve(process.cwd(), "tmp/ppt-v2-preview"),
      enableNativeConversion: true
    }
  });

  const output = resolve(process.cwd(), "tmp/ppt-v2-preview.pptx");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, artifact.pptx.buffer);
  console.log(
    JSON.stringify(
      {
        ok: true,
        output,
        previewDir: artifact.preview.outputDir,
        previewStatus: artifact.preview.status,
        previewSlides: artifact.preview.slides.length,
        previewDiagnostics: artifact.preview.diagnostics,
        visualQaPassed: artifact.visualQa.passed,
        visualQaFindings: artifact.visualQa.findings.length,
        rasterQaStatus: artifact.rasterQa.status,
        rasterQaFindings: artifact.rasterQa.findings.length
      },
      null,
      2
    )
  );
} finally {
  compiled.cleanup();
}
