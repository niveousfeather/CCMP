import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function read(path) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function compileLocalModule(entryPath, modules) {
  const tempRoot = resolve(tmpdir(), `nexus-ppt-v3-preview-${Date.now()}`);
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

const title = "MambaOut: Do We Really Need Mamba for Vision?";
const slides = [
  { type: "cover", layoutPreset: "academic_cover", title, subtitle: "Academic paper presentation demo", visualBrief: "Paper cover with model architecture and benchmark result cards", speakerNotes: "Open by framing the central question: whether Mamba-style sequence modeling is necessary for vision backbones. Point to the architecture visual and tell the audience that the talk will separate module novelty from controlled evidence." },
  { type: "agenda", layoutPreset: "agenda_list", title: "Presentation Roadmap", bullets: ["Problem and motivation", "Architecture intuition", "Method pipeline", "Experiments and ablations", "Takeaways"], visualBrief: "Roadmap links question, method, benchmark evidence, and discussion", speakerNotes: "Use this page to set expectations. The talk moves from motivation to mechanism, then to experiments, then to a decision-oriented summary." },
  { type: "section", layoutPreset: "section_divider", title: "Background", subtitle: "Why revisit Mamba-style sequence modeling for vision?", visualBrief: "Research context diagram for visual sequence modeling", speakerNotes: "Explain why this background matters: vision models already have strong local and hierarchical priors, so new sequence modules should be tested against strong baselines." },
  { type: "cards", layoutPreset: "knowledge_cards", title: "Research Question", bullets: ["Do vision backbones always need sequence state-space blocks?", "Which gains come from architecture design rather than Mamba itself?", "Can a simpler mixer retain accuracy with better efficiency?"], visualBrief: "Question-to-evidence mechanism diagram", speakerNotes: "Spend time on the three questions. They define what a convincing experiment must isolate: necessity, source of gains, and efficiency trade-off." },
  { type: "imageText", layoutPreset: "image_explanation", title: "Core Hypothesis", bullets: ["Many visual stages benefit more from local feature hierarchy than long sequence memory", "A controlled simplification can isolate the actual contribution", "The baseline must be strong enough before claiming module superiority"], visualBrief: "Architecture figure comparing Mamba block and simplified mixer", imageQuery: "MambaOut vision model architecture comparison paper figure", speakerNotes: "Walk from the left explanation cards to the right architecture diagram. The key hypothesis is not that Mamba is weak, but that its necessity is task-dependent." },
  { type: "timeline", layoutPreset: "process_steps", title: "Method Pipeline", bullets: ["Patch embedding builds visual tokens", "Feature mixer replaces complex state-space block", "Stage stacking controls scale and receptive field", "Classification head reports benchmark result"], visualBrief: "Large method pipeline from input tokens to benchmark output", speakerNotes: "Describe the method as a pipeline. Each stage should expose what changes and what stays controlled, so the comparison remains fair." },
  { type: "comparison", layoutPreset: "comparison_matrix", title: "Architecture Comparison", bullets: ["Mamba block: sequence modeling prior", "Mamba block: higher implementation complexity", "Simplified mixer: easier optimization", "Simplified mixer: competitive accuracy-speed trade-off"], visualBrief: "Comparison matrix with mechanism, advantage, limitation, and use case", speakerNotes: "Use the matrix to compare mechanism and trade-off, not just list pros and cons. The conclusion should help the audience decide which block fits which evidence." },
  { type: "data", layoutPreset: "data_insight", title: "Benchmark Snapshot", metrics: [{ label: "Top-1 Accuracy", value: "84.1%", detail: "Illustrative paper-style result" }, { label: "Throughput", value: "+18%", detail: "Relative to heavier block" }, { label: "Params", value: "-9%", detail: "Simplified module budget" }], visualBrief: "Experiment chart with accuracy, throughput, and parameter bars", speakerNotes: "Read the chart as a trade-off snapshot. Accuracy remains competitive while throughput and parameter budget move in a practical direction." },
  { type: "data", layoutPreset: "data_insight", title: "Ablation Study", metrics: [{ label: "Mixer only", value: "+0.6", detail: "Controlled gain" }, { label: "Depth scaling", value: "+1.1", detail: "Larger backbone" }, { label: "Regularization", value: "+0.4", detail: "Training recipe" }], bullets: ["Ablations separate architecture effect from training recipe", "The strongest result comes from combining efficient mixer and tuned depth"], visualBrief: "Ablation bar chart separating module, depth, and recipe effects", speakerNotes: "Explain that ablations prevent overclaiming. The audience should see which gain belongs to architecture and which comes from scaling or training recipe." },
  { type: "imageText", layoutPreset: "image_explanation", title: "Failure Modes and Limits", bullets: ["Simpler modules may miss global dependencies in dense prediction settings", "Benchmark choice affects whether sequence memory appears necessary", "Future work should test transfer beyond classification"], visualBrief: "Limitation diagram with dataset transfer and task boundary", speakerNotes: "Balance the claim by naming boundaries. Classification success does not automatically prove dense prediction or transfer settings behave the same way." },
  { type: "comparison", layoutPreset: "comparison_matrix", title: "When to Use Which Block", bullets: ["Use Mamba: long-range dependency evidence is strong", "Use Mamba: task needs sequence-like global context", "Use simpler mixer: classification and speed matter", "Use simpler mixer: deployment budget is constrained"], visualBrief: "Decision matrix for block selection under task and budget constraints", speakerNotes: "Turn the evidence into a decision rule. The point is not one block always wins, but that model choice should follow task evidence and deployment constraints." },
  { type: "cards", layoutPreset: "lesson_exercise", title: "Discussion Prompts", bullets: ["Which experiment best isolates the role of Mamba?", "What baseline would make the claim more convincing?", "How would you test transfer to detection or segmentation?"], visualBrief: "Discussion activity diagram with questions and evaluation path", speakerNotes: "Use these prompts to make the audience critique the experimental design. The best answers should propose a baseline, a controlled variable, and a transfer test." },
  { type: "closing", layoutPreset: "summary_closing", title: "Key Takeaways", bullets: ["Strong baselines matter before claiming new module necessity", "Visual tasks may not always need sequence state-space blocks", "Paper-style comparison should report accuracy, speed, and complexity together"], visualBrief: "Summary cards with Q&A close", speakerNotes: "Close with the three takeaways and invite questions about experimental controls, task transfer, and practical model selection." }
];

const providerCompile = compileLocalModule("lib/presentation/providers/local.ts", [
  "lib/presentation/providers/local.ts",
  "lib/presentation/types.ts"
]);
const planCompile = compileLocalModule("lib/presentation/v2/visual-plan.ts", [
  "lib/presentation/types.ts",
  "lib/presentation/v2/visual-plan.ts",
  "lib/presentation/v2/themes.ts",
  "lib/presentation/v2/presets.ts"
]);
const qaCompile = compileLocalModule("lib/presentation/v2/qa.ts", [
  "lib/presentation/types.ts",
  "lib/presentation/v2/qa.ts",
  "lib/presentation/v2/presets.ts",
  "lib/presentation/v2/visual-plan.ts"
]);

try {
  const { createLocalPresentationProvider, preparePresentationDeckV3 } = await import(providerCompile.entryUrl);
  const { buildVisualPresentationPlan } = await import(planCompile.entryUrl);
  const { evaluateVisualPlanQuality } = await import(qaCompile.entryUrl);

  const deck = { title, style: "academic", theme: "research_report", slides };
  const visualPlan = buildVisualPresentationPlan(deck, { theme: "academic_paper" });
  const visualQa = evaluateVisualPlanQuality(visualPlan);
  const preparedDeck = await preparePresentationDeckV3(deck, visualPlan, { fallbackToV2: true });
  const provider = createLocalPresentationProvider();
  const pptx = await provider.generate({ deck: preparedDeck });
  const output = resolve(process.cwd(), "tmp", "ppt-v3-academic-preview.pptx");

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, pptx.buffer);

  console.log(
    JSON.stringify(
      {
        ok: true,
        output,
        slides: slides.length,
        sizeBytes: pptx.buffer.length,
        visualQaScore: visualQa.score,
        visualQaIssues: visualQa.issues.length,
        visualQaIssueDetails: visualQa.issues.slice(0, 6),
        visualQaSlideMetrics: visualQa.slideMetrics?.slice(0, 6)
      },
      null,
      2
    )
  );
} finally {
  providerCompile.cleanup();
  planCompile.cleanup();
  qaCompile.cleanup();
}
