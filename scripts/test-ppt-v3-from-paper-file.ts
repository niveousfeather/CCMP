import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { ExtractedDocument } from "../lib/agent/types";
import { extractStructuredDocumentFacts } from "../lib/agent/skills/parse-document";
import { createLocalPresentationProvider, preparePresentationDeckV3 } from "../lib/presentation/providers/local";
import { buildRichPresentationDeck } from "../lib/presentation/v2/content-planner";
import { buildVisualPresentationPlan } from "../lib/presentation/v2/visual-plan";

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function listZipEntries(buffer: Buffer) {
  const entries: string[] = [];
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

const paperText = [
  "MambaOut: Do We Really Need Mamba for Vision?",
  "",
  "Abstract. MambaOut asks whether Mamba-style sequence modeling is necessary for vision backbones. The paper argues that strong convolutional and visual mixer baselines can explain much of the reported gain.",
  "",
  "Background. Vision backbones need to balance accuracy, throughput, parameter budget, and implementation complexity. Recent Mamba-style blocks introduce state-space sequence memory into visual stages.",
  "",
  "Problem. The research question is whether sequence memory itself improves vision recognition, or whether training recipe and baseline strength explain the result.",
  "",
  "Method. The method replaces complex state-space blocks with a simpler visual mixer, controls the training recipe, and evaluates matched backbone stages. The pipeline is: patch embedding, local visual mixing, stage stacking, classification head, and benchmark reporting.",
  "",
  "Architecture. MambaOut compares a Mamba-style sequence block, a convolutional baseline, and a simplified visual mixer. The simplified block removes recurrent sequence memory while preserving stage depth and normalization.",
  "",
  "Experiments. Benchmark results report 84.1% Top-1 accuracy on ImageNet, +18% throughput, and -9% parameters under a controlled recipe. The result suggests that simpler blocks can be competitive when the baseline is strong.",
  "",
  "Comparison. Against Mamba-style baselines, MambaOut lowers implementation complexity and improves throughput; against plain convolution, it keeps a stronger visual mixing path. The trade-off is less explicit sequence memory.",
  "",
  "Ablation. Removing the sequence memory changes latency more than accuracy in the tested classification setting. The training recipe and stage design account for much of the observed performance.",
  "",
  "Limitations. The paper notes that dense prediction transfer, long-range video tasks, and very high-resolution settings may still benefit from sequence memory. These boundaries require separate evaluation.",
  "",
  "Conclusion. The main takeaway is not that Mamba is useless, but that vision models need controlled baselines before adding sequence-state complexity."
].join("\n");

async function main() {
  const output = resolve(process.cwd(), "tmp", "ppt-v3-from-paper-file-test.pptx");
  rmSync(output, { force: true });

  const document: ExtractedDocument = {
    fileName: "mambaout-paper.txt",
    fileId: "local-paper-fixture",
    content: paperText,
    extractedMarkdown: `## mambaout-paper.txt\n\n${paperText}`,
    structuredFacts: extractStructuredDocumentFacts("mambaout-paper.txt", paperText)
  };

  const richDeck = buildRichPresentationDeck({
    title: "MambaOut Paper Talk",
    request: "Generate a 12 slide academic PPT from the uploaded paper file.",
    deck: {
      title: "MambaOut Paper Talk",
      style: "academic",
      theme: "research_report",
      slides: [{ type: "cover", title: "MambaOut Paper Talk" }]
    },
    extractedDocuments: [document],
    webContext: null
  });

  assert(richDeck.style === "academic", "Expected academic style deck");
  assert(richDeck.slides.length === 12, `Expected 12 slides, got ${richDeck.slides.length}`);

  const slideText = JSON.stringify(richDeck);
  for (const expected of ["84.1%", "+18%", "-9%", "simpler visual mixer", "dense prediction", "sequence memory"]) {
    assert(slideText.includes(expected), `Expected deck to include uploaded paper fact: ${expected}`);
  }

  const visualPlan = buildVisualPresentationPlan(richDeck, { theme: "academic_paper" });
  const layouts = new Set(visualPlan.slides.map((slide) => slide.layout));
  for (const layout of ["paper_method_pipeline", "paper_comparison", "paper_experiment_results", "paper_summary"]) {
    assert(layouts.has(layout as any), `Expected visual plan to include ${layout}`);
  }

  const preparedDeck = await preparePresentationDeckV3(richDeck, visualPlan, { fallbackToV2: true });
  const result = await createLocalPresentationProvider().generate({ deck: preparedDeck });
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, result.buffer);

  assert(existsSync(output), "Expected PPTX output file to exist");
  assert(result.buffer.subarray(0, 2).toString("utf8") === "PK", "Expected PPTX ZIP package");

  const entries = listZipEntries(result.buffer);
  assert(entries.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry)).length === 12, "Expected PPTX to preserve 12 slides");
  assert(entries.filter((entry) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(entry)).length === 12, "Expected speaker notes for every slide");

  const packageText = result.buffer.toString("utf8");
  for (const expected of ["84.1%", "+18%", "-9%", "simpler visual mixer", "dense prediction", "V3 Academic Paper Rendered"]) {
    assert(packageText.includes(expected), `Expected rendered PPTX to include ${expected}`);
  }
  assert(!packageText.includes("Generated by NexusAI"), "PPTX should not include English platform signature");
  assert(!packageText.includes("由 NexusAI 生成"), "PPTX should not include Chinese platform signature");
  assert(!packageText.includes("NexusAI 智能文档模块"), "PPTX should not include document module signature");

  console.log(JSON.stringify({ ok: true, output, slides: richDeck.slides.length, facts: document.structuredFacts?.length || 0 }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
