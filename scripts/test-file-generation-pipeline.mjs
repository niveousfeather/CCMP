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

function assertIncludes(source, needle, label) {
  assert(source.includes(needle), `${label}: missing ${needle}`);
}

function assertNotIncludes(source, needle, label) {
  assert(!source.includes(needle), `${label}: should not include ${needle}`);
}

function compileLocalModule(entryPath, modules) {
  const absoluteEntry = resolve(process.cwd(), entryPath);
  const tempRoot = resolve(tmpdir(), `nexus-pipeline-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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

function listZipEntries(buffer) {
  const entries = [];
  for (let offset = 0; offset <= buffer.length - 46; offset += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) break;
    entries.push(buffer.subarray(nameStart, nameEnd).toString("utf8"));
    offset = nameEnd + extraLength + commentLength - 1;
  }
  return entries;
}

const router = read("lib/agent/router.ts");
const asyncTasks = read("lib/agent/async-tasks.ts");
const taskRoute = read("app/api/ai/chat/tasks/[id]/route.ts");
const conversationRoute = read("app/api/ai/chat/conversations/[id]/route.ts");
const downloadRoute = read("app/api/ai/chat/attachments/[id]/download/route.ts");
const chatPage = read("components/chat/chat-page.tsx");
const chatMessage = read("components/chat/chat-message.tsx");
const documentStorage = read("lib/document/storage.ts");
const presentationSkill = read("lib/agent/skills/create-presentation.ts");
const presentationLocalProvider = read("lib/presentation/providers/local.ts");
const presentationVisualAssets = read("lib/presentation/visual-assets.ts");
const presentationTypes = read("lib/presentation/types.ts");
const presentationArtifactPipeline = read("lib/presentation/v2/artifact-pipeline.ts");
const presentationHtmlSlide = read("lib/presentation/v2/html-slide.ts");
const presentationImagePolicy = read("lib/presentation/v2/image-policy.ts");
const presentationV2Planner = read("lib/presentation/v2/planner.ts");
const presentationPreview = read("lib/presentation/v2/preview.ts");
const presentationRasterQa = read("lib/presentation/v2/raster-qa.ts");
const presentationV2Qa = read("lib/presentation/v2/qa.ts");
const presentationRenderedQa = read("lib/presentation/v2/rendered-qa.ts");
const presentationV2Presets = read("lib/presentation/v2/presets.ts");
const presentationV2Pipeline = read("lib/presentation/v2/pipeline.ts");
const presentationThemes = read("lib/presentation/v2/themes.ts");
const documentTemplates = read("lib/document/templates.ts");
const agentModels = read("lib/agent/models.ts");

assertIncludes(router, "buildFallbackWordMarkdown", "Word generation should have a deterministic local markdown fallback");
assertIncludes(router, "using local fallback plan", "Word generation should log model fallback before local document rendering");
assertIncludes(router, "local-document-fallback", "Word generation should mark local fallback model usage");
assertIncludes(router, "renderGeneratedFileLocally", "Agent router should validate generated file metadata before returning");
assertIncludes(asyncTasks, "completed = requiresGeneratedFile ? result.generatedFiles.length > 0", "Async task should complete file jobs only when files exist");
assertIncludes(asyncTasks, "status: completed ? \"completed\" : \"failed\"", "Async task should persist failed status for empty file jobs");
assertIncludes(taskRoute, "normalizeAsyncStatus", "Task polling should normalize impossible async states");
assertIncludes(taskRoute, "value === \"completed\" && (!requiresGeneratedFile || hasAttachments)", "Completed file tasks should require attachments");
assertIncludes(downloadRoute, "DOWNLOAD_URL_NOT_FOUND", "Download route should fail clearly when storage target is missing");
assertIncludes(downloadRoute, "DOWNLOAD_URL_NOT_ALLOWED", "Download route should block unsafe attachment URLs");
assertIncludes(chatPage, "生成失败，请重新输入后重试。", "Frontend polling should show simple generation failure");
assertIncludes(chatMessage, "生成失败，请重新输入后重试。", "Pending cards should show simple generation failure");
assertNotIncludes(conversationRoute, "Nexus 文件", "Conversation reload should not expose platform-branded pending file names");
assertNotIncludes(taskRoute, "Nexus 文件", "Task polling should not expose platform-branded pending file names");
assertIncludes(documentStorage, "createMockStorage().uploadBuffer", "Word document storage should fall back to local mock storage");
assertIncludes(presentationSkill, "createMockStorage().uploadBuffer", "PPT storage should fall back to local mock storage");
assertIncludes(presentationSkill, "theme: normalizeTheme", "PPT parser should preserve deck themes");
assertIncludes(presentationSkill, "metrics: normalizeMetrics", "PPT parser should preserve metric-card data");
assertIncludes(presentationSkill, "visualBrief", "PPT parser should preserve visual briefs");
assertIncludes(presentationSkill, "imageQuery", "PPT parser should preserve image search hints");
assertIncludes(presentationSkill, "type: \"cards\"", "Fallback PPT deck should use card layouts");
assertIncludes(presentationSkill, "type: \"timeline\"", "Fallback PPT deck should use timeline layouts");
assertIncludes(presentationSkill, "enrichPresentationDeckVisuals", "PPT generation should enrich visual assets before rendering");
assertIncludes(presentationVisualAssets, "fetchSearchedVisualAsset", "PPT visual assets should search images before generation");
assertIncludes(presentationVisualAssets, "generateVisualAsset", "PPT visual assets should fall back to image generation");
assertIncludes(presentationVisualAssets, "\"jimeng-image-2.1\"", "PPT visual asset generation should default to Jimeng");
assert(presentationVisualAssets.indexOf("fetchSearchedVisualAsset") < presentationVisualAssets.indexOf("generateVisualAsset"), "PPT visual asset priority should be web search before image generation");
assertIncludes(presentationVisualAssets, "PRESENTATION_IMAGE_SEARCH_MAX_CANDIDATES", "PPT visual search should expose configurable candidate count");
assertIncludes(presentationVisualAssets, "PRESENTATION_IMAGE_SEARCH_RETRIES", "PPT visual search should expose configurable retry count");
assertIncludes(presentationLocalProvider, "ppt/media/", "PPTX should package image assets into media entries");
assertIncludes(presentationLocalProvider, "relationships/image", "PPTX should connect slide image relationships");
assertIncludes(presentationTypes, "academic", "PPT V2 should support academic style hints");
assertIncludes(presentationTypes, "teaching", "PPT V2 should support teaching style hints");
assertIncludes(presentationV2Planner, "createPresentationPlanV2", "PPT V2 should build an explicit planning layer");
assertIncludes(presentationV2Planner, "selectPresentationStyle", "PPT V2 should select academic or teaching styles from the request");
assertIncludes(presentationV2Presets, "academic_cover", "PPT V2 should include academic cover preset");
assertIncludes(presentationV2Presets, "teaching_cover", "PPT V2 should include teaching cover preset");
assertIncludes(presentationV2Presets, "lesson_exercise", "PPT V2 should include teaching exercise preset");
assertIncludes(presentationV2Qa, "checkPresentationPlanV2", "PPT V2 should include static QA checks");
assertIncludes(presentationV2Qa, "text_overflow_risk", "PPT V2 QA should detect text overflow risk");
assertIncludes(presentationRenderedQa, "checkRenderedPresentationPptx", "PPT V2 should include rendered PPTX QA checks");
assertIncludes(presentationRenderedQa, "rendered_text_overflow_risk", "Rendered PPTX QA should detect text box overflow risks");
assertIncludes(presentationRenderedQa, "edge_margin_risk", "Rendered PPTX QA should detect edge margin risks");
assertIncludes(presentationArtifactPipeline, "preparePresentationArtifactV1", "PPT V2 should expose an artifact pipeline");
assertIncludes(presentationHtmlSlide, "renderHtmlSlideDeck", "PPT V2 should render HTML slide previews");
assertIncludes(presentationHtmlSlide, "visual-stage", "PPT V2 HTML previews should render a designed visual stage");
assertIncludes(presentationHtmlSlide, "data:image", "PPT V2 HTML previews should embed resolved slide visuals");
assertIncludes(presentationHtmlSlide, "visual-source--", "PPT V2 HTML previews should mark visual source for styling");
assertIncludes(presentationHtmlSlide, "process-track", "PPT V2 HTML previews should render process slides as a timeline");
assertIncludes(presentationHtmlSlide, "comparison-grid", "PPT V2 HTML previews should render comparison slides as a matrix");
assertIncludes(presentationHtmlSlide, "metric-hero", "PPT V2 HTML previews should emphasize a primary data insight");
assertIncludes(presentationImagePolicy, "web_search_first", "PPT V2 should keep image search before generation");
assertIncludes(presentationImagePolicy, "jimeng", "PPT V2 should keep Jimeng as generated image fallback");
assertIncludes(presentationPreview, "createPresentationPreviewArtifacts", "PPT V2 should create preview artifacts");
assertIncludes(presentationPreview, "defaultNativePreviewConverter", "PPT V2 should provide a native PPTX preview converter");
assertIncludes(presentationPreview, "defaultHtmlPreviewRenderer", "PPT V2 should provide an HTML screenshot preview fallback");
assertIncludes(presentationPreview, "htmlPreviewRenderer", "PPT V2 preview options should support an injectable HTML renderer");
assertIncludes(presentationPreview, "pdftoppm", "Native PPTX preview should support Poppler conversion");
assertIncludes(presentationPreview, "--convert-to", "Native PPTX preview should support LibreOffice PDF conversion");
assertIncludes(presentationRasterQa, "checkRasterPreviewImages", "PPT V2 should score native raster preview images");
assertIncludes(presentationRasterQa, "aspect_ratio_mismatch", "Raster preview QA should detect aspect ratio issues");
assertIncludes(presentationRasterQa, "blank_image_risk", "Raster preview QA should detect blank-looking preview images");
assertIncludes(presentationThemes, "getPresentationThemeV2", "PPT V2 should centralize theme templates");
assert(!documentTemplates.includes("DocTemplate"), "Word output should not expose internal template markers");
assertIncludes(presentationV2Pipeline, "preparePresentationDeckV2", "PPT generation should prepare decks through the V2 pipeline");
assertIncludes(presentationSkill, "preparePresentationDeckV2", "PPT generation should call the V2 planning pipeline");
assertIncludes(presentationSkill, "checkRenderedPresentationPptx", "PPT generation should run rendered PPTX QA after generation");
assertIncludes(agentModels, "gpt-5.4", "Task primary model should default to Subrouter GPT-5.4");
assertNotIncludes(agentModels, "gemini-3-flash-preview", "Task primary model should not default to Gemini");
assertIncludes(agentModels, "kimi-k2.5", "Task fallback model should remain Kimi by default");

const docCompile = compileLocalModule("lib/document/create.ts", [
  "lib/document/create.ts",
  "lib/document/markdown.ts",
  "lib/document/plan.ts",
  "lib/document/quality.ts",
  "lib/document/templates.ts",
  "lib/document/types.ts",
  "lib/document/zip.ts"
]);
try {
  const { createDocxBuffer } = await import(docCompile.entryUrl);
  const buffer = createDocxBuffer({
    title: "三维动画课程教案",
    template: "lesson_plan",
    markdown: [
      "# 三维动画课程教案",
      "",
      "## 教学目标",
      "",
      "- 理解三维动画基础规律",
      "- 能完成基础运动节奏分析",
      "",
      "## 教学过程",
      "",
      "| 环节 | 内容 | 时间 |",
      "| --- | --- | --- |",
      "| 导入 | 案例观察 | 10 分钟 |"
    ].join("\n")
  });
  const entries = listZipEntries(buffer);
  const docXml = String(buffer);
  assert(buffer.length > 1024, "DOCX buffer should be non-empty");
  assert(entries.includes("word/document.xml"), "DOCX should contain word/document.xml");
  assert(entries.includes("word/styles.xml"), "DOCX should contain word/styles.xml");
  assert(entries.includes("word/numbering.xml"), "DOCX should contain word/numbering.xml");
  assert(!docXml.includes("DocTemplate"), "DOCX should not expose internal template markers");
} finally {
  docCompile.cleanup();
}

const pptV2Compile = compileLocalModule("lib/presentation/v2/pipeline.ts", [
  "lib/presentation/types.ts",
  "lib/presentation/v2/planner.ts",
  "lib/presentation/v2/presets.ts",
  "lib/presentation/v2/qa.ts",
  "lib/presentation/v2/pipeline.ts"
]);
try {
  const { preparePresentationDeckV2 } = await import(pptV2Compile.entryUrl);
  const plannedTeachingDeck = preparePresentationDeckV2({
    deck: {
      title: "三维动画课堂教学",
      slides: [
        { type: "cover", title: "三维动画课堂教学", subtitle: "第一课：关键帧与运动规律" },
        { type: "content", title: "学习目标", bullets: ["理解关键帧的作用", "掌握缓入缓出曲线", "完成课堂练习"] },
        { type: "closing", title: "课后练习" }
      ]
    },
    request: "生成一份三维动画上课教学用的精美课件，包含课堂练习",
    title: "三维动画课堂教学"
  });
  assert(plannedTeachingDeck.style === "teaching", "PPT V2 should classify lesson requests as teaching style");
  assert(plannedTeachingDeck.designSpec.themeId === "teaching_light", "PPT V2 should select a teaching design spec");
  assert(plannedTeachingDeck.slides.some((slide) => slide.layoutPreset === "lesson_exercise"), "PPT V2 should map exercise-like teaching slides to lesson exercise preset");
  assert(plannedTeachingDeck.qa.passed, "PPT V2 planning QA should pass normal teaching decks");

  const plannedAcademicDeck = preparePresentationDeckV2({
    deck: {
      title: "Transformer 论文汇报",
      slides: [
        { type: "cover", title: "Transformer 论文汇报", subtitle: "方法、实验与结论" },
        { type: "content", title: "核心贡献", bullets: ["提出自注意力结构", "提升长序列建模效率"] }
      ]
    },
    request: "生成一份学术风论文汇报PPT",
    title: "Transformer 论文汇报"
  });
  assert(plannedAcademicDeck.style === "academic", "PPT V2 should classify paper report requests as academic style");
  assert(plannedAcademicDeck.designSpec.themeId === "academic_blue", "PPT V2 should select an academic design spec");
} finally {
  pptV2Compile.cleanup();
}

const pptRenderedQaCompile = compileLocalModule("lib/presentation/v2/rendered-qa.ts", [
  "lib/presentation/types.ts",
  "lib/presentation/v2/rendered-qa.ts"
]);
try {
  const { checkRenderedPresentationPptx } = await import(pptRenderedQaCompile.entryUrl);
  const qaReport = checkRenderedPresentationPptx({
    entries: [
      {
        name: "ppt/slides/slide1.xml",
        content:
          '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="1" name="Tiny Text"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="10000" y="20000"/><a:ext cx="300000" cy="120000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:rPr sz="4200"/><a:t>This text is intentionally long enough to overflow a tiny text box.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
      }
    ],
    expectedSlides: 2,
    requireV2PresetMarkers: true
  });
  assert(!qaReport.passed, "Rendered PPTX QA should fail hard rendered-layout issues");
  assert(qaReport.findings.some((finding) => finding.rule === "slide_count_mismatch"), "Rendered PPTX QA should detect missing slides");
  assert(qaReport.findings.some((finding) => finding.rule === "rendered_text_overflow_risk"), "Rendered PPTX QA should detect overflowing text boxes");
  assert(qaReport.findings.some((finding) => finding.rule === "edge_margin_risk"), "Rendered PPTX QA should detect edge margin risks");
} finally {
  pptRenderedQaCompile.cleanup();
}

const pptArtifactCompile = compileLocalModule("lib/presentation/v2/artifact-pipeline.ts", [
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
  const { preparePresentationArtifactV1 } = await import(pptArtifactCompile.entryUrl);
  const artifact = await preparePresentationArtifactV1({
    deck: {
      title: "Artifact Pipeline Deck",
      style: "teaching",
      theme: "clean_education",
      slides: [
        { type: "cover", layoutPreset: "teaching_cover", title: "Teaching Cover", imageQuery: "classroom visual" },
        { type: "agenda", layoutPreset: "agenda_list", title: "Agenda", bullets: ["One", "Two"] }
      ]
    },
    preview: { outputDir: resolve(process.cwd(), "tmp/ppt-artifact-v1-test"), enableNativeConversion: false }
  });
  assert(artifact.pptx.buffer.length > 1024, "Artifact V1 should generate a PPTX buffer");
  assert(artifact.html.html.includes("slide--teaching-cover"), "Artifact V1 should generate preset-specific HTML");
  assert(artifact.preview.slides.length === 2, "Artifact V1 should generate preview records");
  assert(artifact.rasterQa.status === "skipped", "Artifact V1 should skip raster QA when native images are unavailable");
  assert(artifact.imagePolicy.plan.some((item) => item.fallbackProvider === "jimeng"), "Artifact V1 should keep Jimeng fallback");
  assert(artifact.visualQa.passed, "Artifact V1 rendered QA should pass generated deck");
} finally {
  pptArtifactCompile.cleanup();
}

const pptCompile = compileLocalModule("lib/presentation/providers/local.ts", [
  "lib/presentation/providers/local.ts",
  "lib/presentation/types.ts"
]);
try {
  const { createLocalPresentationProvider } = await import(pptCompile.entryUrl);
  const provider = createLocalPresentationProvider();
  const generated = await provider.generate({
    deck: {
      title: "三维动画商务汇报",
      slides: [
        { type: "cover", title: "三维动画商务汇报", subtitle: "项目阶段成果" },
        { type: "agenda", title: "目录", bullets: ["项目背景", "核心进展", "下一步计划"] },
        { type: "content", title: "核心进展", bullets: ["资产规范建立", "动作流程优化", "渲染效率提升"] },
        { type: "closing", title: "谢谢" }
      ]
    }
  });
  const entries = listZipEntries(generated.buffer);
  assert(generated.buffer.length > 1024, "PPTX buffer should be non-empty");
  assert(entries.includes("ppt/presentation.xml"), "PPTX should contain presentation.xml");
  assert(entries.includes("ppt/slides/slide1.xml"), "PPTX should contain at least one slide");
  assert(entries.includes("ppt/slides/_rels/slide1.xml.rels"), "PPTX should contain slide relationships");

  const highQuality = await provider.generate({
    deck: {
      title: "High Quality Business Deck",
      theme: "executive_dark",
      slides: [
        { type: "cover", title: "High Quality Business Deck", subtitle: "Stage Review", visualBrief: "executive presentation" },
        { type: "agenda", title: "Agenda", bullets: ["Context", "Progress", "Next steps"] },
        { type: "cards", title: "Progress", bullets: ["Asset standards", "Workflow optimization", "Rendering efficiency"] },
        { type: "timeline", title: "Roadmap", bullets: ["Prepare", "Produce", "Deliver"] },
        { type: "data", title: "Metrics", metrics: [{ label: "Completion", value: "82%" }, { label: "Rework Down", value: "31%" }] },
        { type: "closing", title: "Thank You" }
      ]
    }
  });
  const highQualityXml = String(highQuality.buffer);
  assert(highQuality.buffer.length > generated.buffer.length, "High quality PPTX should contain richer layout XML");
  assert(highQualityXml.includes("Nexus Theme Background"), "PPTX should render themed backgrounds");
  assert(highQualityXml.includes("Visual Motif"), "PPTX should render visual motifs or image placeholders");
  assert(highQualityXml.includes("Metric Card"), "PPTX should render metric cards");
  assert(highQualityXml.includes("Timeline Node"), "PPTX should render timeline nodes");
  assert(highQualityXml.includes("Agenda Card"), "PPTX should render agenda cards");
  assert(highQualityXml.includes("Layout Accent Bar"), "PPTX should use restrained layout accents");
  assert(highQualityXml.includes("Hero Visual Frame"), "PPTX should use large hero visual framing");
  assert(highQualityXml.includes("Readable Content"), "PPTX should render readable body content");
  assert(!highQualityXml.includes('name="Slide Number"'), "PPTX should not render visible page-number clutter");
  assert(!highQualityXml.includes('cx="190000" cy="6858000"'), "PPTX should not render heavy full-height side rails");
  assert(!highQualityXml.includes('cx="1050000" cy="1050000"'), "PPTX should not render repeated large decorative corner dots");
  assert(!highQualityXml.includes("Lorem"), "PPTX should not contain placeholder lorem text");

  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
  const adaptiveDeck = await provider.generate({
    deck: {
      title: "Adaptive Layout Deck",
      theme: "clean_education",
      slides: [
        { type: "content", title: "Short Focus", bullets: ["One core idea", "One supporting idea"] },
        { type: "content", title: "Dense Concepts", bullets: ["Concept A", "Concept B", "Concept C", "Concept D", "Concept E"] },
        {
          type: "imageText",
          title: "Visual Explanation",
          bullets: ["The explanation stays readable", "The visual gets enough space"],
          visualAsset: {
            buffer: onePixelPng,
            mimeType: "image/png",
            extension: "png",
            source: "web_search",
            alt: "adaptive visual",
            sourceUrl: "https://example.com/adaptive.png"
          }
        },
        { type: "content", title: "Production Flow", bullets: ["Plan the scene", "Build assets", "Animate shots", "Render and review"] }
      ]
    }
  });
  const adaptiveXml = String(adaptiveDeck.buffer);
  assert(adaptiveXml.includes("Adaptive Focus Layout"), "Sparse content slides should render a focus layout");
  assert(adaptiveXml.includes("Adaptive Card Grid"), "Dense content slides should render a card-grid layout");
  assert(adaptiveXml.includes("Adaptive Split Layout"), "Image/text content slides should render a split layout");
  assert(adaptiveXml.includes("Adaptive Timeline Layout"), "Process-like content slides should render a timeline layout");
  assert(adaptiveXml.includes("Visual Explanation"), "Adaptive decks should preserve slide titles");
  assert(!adaptiveXml.includes('name="Slide Number"'), "Adaptive decks should avoid visible page-number clutter");

  const v2PresetDeck = await provider.generate({
    deck: {
      title: "V2 Preset Deck",
      theme: "clean_education",
      slides: [
        { type: "cover", layoutPreset: "academic_cover", title: "Academic Research Talk", subtitle: "Method, experiments, and findings" },
        { type: "cover", layoutPreset: "teaching_cover", title: "Classroom Lesson", subtitle: "Keyframes and motion principles" },
        { type: "section", layoutPreset: "section_divider", title: "Background and Motivation", subtitle: "Why this topic matters" },
        { type: "agenda", layoutPreset: "agenda_list", title: "Session Agenda", bullets: ["Problem framing", "Core method", "Case walkthrough", "Practice and summary"] },
        { type: "imageText", layoutPreset: "image_explanation", title: "Visual Explanation", bullets: ["Core concept", "Example interpretation"] },
        { type: "timeline", layoutPreset: "process_steps", title: "Research Workflow", bullets: ["Collect evidence", "Build baseline", "Compare variants", "Report findings"] },
        { type: "comparison", layoutPreset: "comparison_matrix", title: "Method Comparison", bullets: ["Baseline: fast but shallow", "Baseline: limited transfer", "Proposed: richer context", "Proposed: better generalization"] },
        { type: "data", layoutPreset: "data_insight", title: "Experiment Highlights", metrics: [{ label: "Accuracy", value: "+12.4%", detail: "Best validation split" }, { label: "Latency", value: "-28%", detail: "Compared with baseline" }] },
        { type: "cards", layoutPreset: "lesson_exercise", title: "Class Exercise", bullets: ["Observe the motion", "Mark keyframes", "Explain the curve"] }
      ]
    }
  });
  const v2PresetXml = String(v2PresetDeck.buffer);
  assert(v2PresetXml.includes("V2 Academic Cover"), "PPTX should render the academic cover preset");
  assert(v2PresetXml.includes("V2 Teaching Cover"), "PPTX should render the teaching cover preset");
  assert(v2PresetXml.includes("V2 Section Divider"), "PPTX should render the section divider preset");
  assert(v2PresetXml.includes("V2 Agenda List"), "PPTX should render the agenda list preset");
  assert(v2PresetXml.includes("V2 Image Explanation"), "PPTX should render the image explanation preset");
  assert(v2PresetXml.includes("V2 Process Steps"), "PPTX should render the process steps preset");
  assert(v2PresetXml.includes("V2 Comparison Matrix"), "PPTX should render the comparison matrix preset");
  assert(v2PresetXml.includes("V2 Data Insight"), "PPTX should render the data insight preset");
  assert(v2PresetXml.includes("V2 Lesson Exercise"), "PPTX should render the lesson exercise preset");
  assert(v2PresetXml.includes("V2 Preset Rendered"), "PPTX should mark slides rendered by V2 preset renderer");
  assert(v2PresetXml.includes("V2 Visual Stage"), "PPTX should render the designed visual-stage motif");
  assert(v2PresetXml.includes("V2 Process Track"), "PPTX should render process slides with a track motif");
  assert(v2PresetXml.includes("V2 Comparison Grid"), "PPTX should render comparison slides with a grid motif");
  assert(v2PresetXml.includes("V2 Metric Hero"), "PPTX should render data slides with a primary metric hero");

  const mediaDeck = await provider.generate({
    deck: {
      title: "Visual Asset Deck",
      slides: [
        {
          type: "cover",
          title: "Visual Asset Deck",
          visualAsset: {
            buffer: onePixelPng,
            mimeType: "image/png",
            extension: "png",
            source: "web_search",
            alt: "demo visual",
            sourceUrl: "https://example.com/demo.png"
          }
        }
      ]
    }
  });
  const mediaEntries = listZipEntries(mediaDeck.buffer);
  const mediaXml = String(mediaDeck.buffer);
  assert(mediaEntries.includes("ppt/media/visual-1.png"), "PPTX should include downloaded visual assets in ppt/media");
  assert(mediaXml.includes("Searched Visual Asset"), "PPTX should render searched visual assets");
  assert(mediaXml.includes("relationships/image"), "PPTX should include image relationships");
} finally {
  pptCompile.cleanup();
}

console.log(JSON.stringify({ ok: true }, null, 2));
