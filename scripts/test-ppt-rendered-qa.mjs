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

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function compileLocalModule(entryPath, modules) {
  const absoluteEntry = resolve(process.cwd(), entryPath);
  const tempRoot = resolve(tmpdir(), `nexus-ppt-rendered-qa-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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
    writeFileSync(outputPath, rewritten);
  }

  return {
    entryUrl: pathToFileURL(resolve(tempRoot, entryPath.replace(/\.(ts|tsx)$/, ".mjs"))).href,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true })
  };
}

const qaCompile = compileLocalModule("lib/presentation/v2/rendered-qa.ts", [
  "lib/presentation/v2/rendered-qa.ts",
  "lib/presentation/types.ts"
]);

const providerCompile = compileLocalModule("lib/presentation/providers/local.ts", [
  "lib/presentation/providers/local.ts",
  "lib/presentation/types.ts"
]);

try {
  const { checkRenderedPresentationPptx } = await import(qaCompile.entryUrl);
  const { createLocalPresentationProvider } = await import(providerCompile.entryUrl);
  const provider = createLocalPresentationProvider();

  const goodDeck = await provider.generate({
    deck: {
      title: "Rendered QA Good Deck",
      theme: "clean_education",
      slides: [
        { type: "cover", layoutPreset: "academic_cover", title: "Academic Research Talk", subtitle: "Method, experiments, and findings" },
        { type: "agenda", layoutPreset: "agenda_list", title: "Session Agenda", bullets: ["Problem framing", "Core method", "Case walkthrough"] },
        { type: "cards", layoutPreset: "knowledge_cards", title: "Core Concepts", bullets: ["Observe", "Practice", "Explain"] },
        { type: "cards", layoutPreset: "lesson_exercise", title: "Class Exercise", bullets: ["Observe", "Practice", "Explain"] },
        { type: "closing", layoutPreset: "summary_closing", title: "Summary", bullets: ["Review", "Apply"] }
      ]
    }
  });
  const goodReport = checkRenderedPresentationPptx({
    buffer: goodDeck.buffer,
    expectedSlides: 5,
    requireV2PresetMarkers: true
  });

  assert(goodReport.passed, `Expected generated V2 deck to pass rendered QA: ${JSON.stringify(goodReport.findings)}`);
  assert(goodReport.slideCount === 5, "Rendered QA should count generated slides");
  assert(goodReport.findings.length === 0, "Rendered QA should not flag normal V2 deck XML");

  const allPresetSlides = [
    { type: "cover", layoutPreset: "academic_cover", marker: "V2 Academic Cover", title: "Academic Research Talk", subtitle: "Method and findings" },
    { type: "cover", layoutPreset: "teaching_cover", marker: "V2 Teaching Cover", title: "Classroom Lesson", subtitle: "Keyframes and motion" },
    { type: "section", layoutPreset: "section_divider", marker: "V2 Section Divider", title: "Background", subtitle: "Why it matters" },
    { type: "agenda", layoutPreset: "agenda_list", marker: "V2 Agenda List", title: "Agenda", bullets: ["Context", "Method", "Practice"] },
    { type: "imageText", layoutPreset: "image_explanation", marker: "V2 Image Explanation", title: "Visual Explanation", bullets: ["Observe", "Compare", "Apply"] },
    { type: "cards", layoutPreset: "knowledge_cards", marker: "V2 Knowledge Cards", title: "Core Concepts", bullets: ["Timing", "Spacing", "Ease"] },
    { type: "timeline", layoutPreset: "process_steps", marker: "V2 Process Steps", title: "Workflow", bullets: ["Plan", "Animate", "Review"] },
    { type: "comparison", layoutPreset: "comparison_matrix", marker: "V2 Comparison Matrix", title: "Comparison", bullets: ["Linear: mechanical", "Linear: predictable", "Ease: natural", "Ease: expressive"] },
    { type: "data", layoutPreset: "data_insight", marker: "V2 Data Insight", title: "Results", metrics: [{ label: "Clarity", value: "+32%" }, { label: "Practice", value: "4x" }] },
    { type: "cards", layoutPreset: "lesson_exercise", marker: "V2 Lesson Exercise", title: "Class Exercise", bullets: ["Observe", "Practice", "Explain"] },
    { type: "closing", layoutPreset: "summary_closing", marker: "V2 Summary Closing", title: "Summary", bullets: ["Review", "Apply"] }
  ];
  const allPresetDeck = await provider.generate({
    deck: {
      title: "All V2 Presets",
      theme: "clean_education",
      slides: allPresetSlides
    }
  });
  const allPresetReport = checkRenderedPresentationPptx({
    buffer: allPresetDeck.buffer,
    expectedSlides: allPresetSlides.length,
    requireV2PresetMarkers: true
  });
  const allPresetXml = String(allPresetDeck.buffer);

  assert(allPresetReport.passed, `Expected every V2 preset to pass rendered QA: ${JSON.stringify(allPresetReport.findings)}`);
  assert(
    countOccurrences(allPresetXml, "V2 Preset Rendered") === allPresetSlides.length,
    "Every V2 preset slide should include exactly one V2 rendered marker"
  );
  for (const slide of allPresetSlides) {
    assert(allPresetXml.includes(slide.marker), `All-preset deck should render marker ${slide.marker}`);
  }
  assert(
    countOccurrences(allPresetXml, "V2 Layout Rhythm Rail") >= 4,
    "Key V2 content slides should share a visible layout rhythm rail"
  );

  const badSlideXml = [
    '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
    '<p:cSld><p:spTree>',
    '<p:sp><p:nvSpPr><p:cNvPr id="1" name="Too Tight Text"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>',
    '<p:spPr><a:xfrm><a:off x="10000" y="20000"/><a:ext cx="300000" cy="120000"/></a:xfrm></p:spPr>',
    '<p:txBody><a:p><a:r><a:rPr sz="4200"/><a:t>This text is intentionally very long and should not fit in a tiny shape.</a:t></a:r></a:p></p:txBody>',
    '</p:sp>',
    '</p:spTree></p:cSld></p:sld>'
  ].join("");

  const badReport = checkRenderedPresentationPptx({
    entries: [{ name: "ppt/slides/slide1.xml", content: badSlideXml }],
    expectedSlides: 2,
    requireV2PresetMarkers: true
  });
  const rules = badReport.findings.map((finding) => finding.rule);

  assert(!badReport.passed, "Rendered QA should fail decks with hard rendered-layout issues");
  assert(rules.includes("slide_count_mismatch"), "Rendered QA should detect missing rendered slides");
  assert(rules.includes("missing_v2_marker"), "Rendered QA should detect slides that did not use V2 preset rendering");
  assert(rules.includes("edge_margin_risk"), "Rendered QA should detect content too close to slide edges");
  assert(rules.includes("rendered_text_overflow_risk"), "Rendered QA should detect tiny text boxes with long text");
} finally {
  qaCompile.cleanup();
  providerCompile.cleanup();
}

console.log(JSON.stringify({ ok: true }, null, 2));
