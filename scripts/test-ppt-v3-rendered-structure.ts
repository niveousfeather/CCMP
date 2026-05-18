import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createLocalPresentationProvider, preparePresentationDeckV3 } from "../lib/presentation/providers/local";
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

function readZipEntry(buffer: Buffer, entryName: string) {
  for (let offset = 0; offset <= buffer.length - 30; offset += 1) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) continue;
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8");
    const contentStart = nameEnd + extraLength;
    const contentEnd = contentStart + compressedSize;
    if (name === entryName) return buffer.subarray(contentStart, contentEnd).toString("utf8");
    offset = contentEnd - 1;
  }
  return "";
}

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length || 0;
}

const title = "MambaOut: Do We Really Need Mamba for Vision?";
const slides = [
  { type: "cover" as const, layoutPreset: "academic_cover" as const, title, subtitle: "Academic paper presentation demo", visualBrief: "Paper cover with model architecture and benchmark result cards" },
  { type: "agenda" as const, layoutPreset: "agenda_list" as const, title: "Presentation Roadmap", bullets: ["Problem and motivation", "Architecture intuition", "Method pipeline", "Experiments and ablations", "Takeaways"] },
  { type: "cards" as const, layoutPreset: "knowledge_cards" as const, title: "Research Question", bullets: ["Do vision backbones always need sequence state-space blocks?", "Which gains come from architecture design rather than Mamba itself?", "Can a simpler mixer retain accuracy with better efficiency?"] },
  { type: "imageText" as const, layoutPreset: "image_explanation" as const, title: "Core Hypothesis", bullets: ["Many visual stages benefit more from local feature hierarchy than long sequence memory", "A controlled simplification can isolate the actual contribution", "The baseline must be strong enough before claiming module superiority"], visualBrief: "Architecture figure comparing Mamba block and simplified mixer" },
  { type: "timeline" as const, layoutPreset: "process_steps" as const, title: "Method Pipeline", bullets: ["Patch embedding builds visual tokens", "Feature mixer replaces complex state-space block", "Stage stacking controls scale and receptive field", "Classification head reports benchmark result"] },
  { type: "comparison" as const, layoutPreset: "comparison_matrix" as const, title: "Architecture Comparison", bullets: ["Mamba block: sequence modeling prior", "Mamba block: higher implementation complexity", "Simplified mixer: easier optimization", "Simplified mixer: competitive accuracy-speed trade-off"] },
  { type: "data" as const, layoutPreset: "data_insight" as const, title: "Benchmark Snapshot", metrics: [{ label: "Top-1 Accuracy", value: "84.1%", detail: "Illustrative paper-style result" }, { label: "Throughput", value: "+18%", detail: "Relative to heavier block" }, { label: "Params", value: "-9%", detail: "Simplified module budget" }] },
  { type: "closing" as const, layoutPreset: "summary_closing" as const, title: "Key Takeaways", bullets: ["Strong baselines matter before claiming new module necessity", "Visual tasks may not always need sequence state-space blocks", "Paper-style comparison should report accuracy, speed, and complexity together"] }
];

async function main() {
  const deck = { title, style: "academic" as const, theme: "research_report", slides };
  const visualPlan = buildVisualPresentationPlan(deck, { theme: "academic_paper" });
  const preparedDeck = await preparePresentationDeckV3(deck, visualPlan, { fallbackToV2: true });
  const result = await createLocalPresentationProvider().generate({ deck: preparedDeck });
  const output = resolve(process.cwd(), "tmp", "ppt-v3-rendered-structure-test.pptx");

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, result.buffer);

  const entries = listZipEntries(result.buffer);
  const slideEntries = entries.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry));
  const noteEntries = entries.filter((entry) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(entry));
  assert(slideEntries.length === slides.length, `Expected ${slides.length} slide XML files, got ${slideEntries.length}`);
  assert(noteEntries.length > 0, "Expected notesSlides to be present");
  assert(entries.includes("ppt/slideLayouts/slideLayout7.xml"), "Expected Office-compatible blank slide layout");

  const presentationRels = readZipEntry(result.buffer, "ppt/_rels/presentation.xml.rels");
  const presentationXml = readZipEntry(result.buffer, "ppt/presentation.xml");
  const slideMasterRels = readZipEntry(result.buffer, "ppt/slideMasters/_rels/slideMaster1.xml.rels");
  const firstSlideRels = readZipEntry(result.buffer, "ppt/slides/_rels/slide1.xml.rels");
  const notesMasterRelId = presentationXml.match(/<p:notesMasterId r:id="([^"]+)"/)?.[1] || "";
  assert(presentationRels.includes("/theme"), "Expected presentation relationships to include theme relationship");
  assert(new RegExp(`Id="${notesMasterRelId}"[^>]+notesMaster`).test(presentationRels), "Expected notes master id to match presentation relationship");
  assert(slideMasterRels.includes("slideLayout7.xml"), "Expected slide master to reference Office blank layout");
  assert(firstSlideRels.includes("../slideLayouts/slideLayout7.xml"), "Expected slides to use Office blank layout");

  slideEntries.forEach((entry, index) => {
    const xml = readZipEntry(result.buffer, entry);
    const shapes = countMatches(xml, /<p:sp>/g) + countMatches(xml, /<p:pic>/g) + countMatches(xml, /<p:graphicFrame>/g);
    const textBoxes = countMatches(xml, /<p:cNvSpPr txBox="1"\/>/g);
    const corePage = index >= 2 && index <= 6;
    assert(shapes >= 8, `Slide ${index + 1} should have at least 8 shapes, got ${shapes}`);
    if (corePage) assert(shapes >= 12, `Core slide ${index + 1} should have at least 12 shapes, got ${shapes}`);
    assert(textBoxes >= 4, `Slide ${index + 1} should have multiple text boxes, got ${textBoxes}`);
    assert(/Caption|Figure|Result|Pipeline|Comparison|Takeaway/.test(xml), `Slide ${index + 1} should contain caption or visual explanation text`);
    assert(new RegExp(`>${String(index + 1).padStart(2, "0")}<|>${index + 1}<`).test(xml), `Slide ${index + 1} should contain a page number`);
  });

  const packageText = result.buffer.toString("utf8");
  assert(!packageText.includes("Generated by NexusAI"), "PPTX should not contain English platform signature");
  assert(!packageText.includes("由 NexusAI 生成"), "PPTX should not contain Chinese platform signature");
  assert(!packageText.includes("NexusAI 智能文档模块"), "PPTX should not contain document module signature");

  console.log(JSON.stringify({ ok: true, output, slides: slideEntries.length, notesSlides: noteEntries.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
