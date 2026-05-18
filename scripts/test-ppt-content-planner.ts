import { buildRichPresentationDeck } from "../lib/presentation/v2/content-planner";
import { checkPresentationPlanV2 } from "../lib/presentation/v2/qa";
import type { ExtractedDocument, WebContextResult } from "../lib/agent/types";
import type { PresentationDeck, PresentationSlide } from "../lib/presentation/types";

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function slideText(slide: PresentationSlide) {
  return [
    slide.title,
    slide.subtitle,
    ...(slide.bullets || []),
    ...(slide.metrics || []).flatMap((metric) => [metric.label, metric.value, metric.detail]),
    slide.visualBrief,
    slide.imageQuery,
    slide.speakerNotes
  ]
    .filter(Boolean)
    .join(" ");
}

const documents: ExtractedDocument[] = [
  {
    fileName: "lesson-notes.md",
    fileId: "file-1",
    content:
      "Keyframes mark important poses in an animation timeline. Tweening fills the motion between keyframes. The graph editor changes acceleration and makes movement feel natural. A classroom activity should ask students to observe, mark, animate, and explain the motion curve.",
    extractedMarkdown:
      "Keyframes mark important poses in an animation timeline.\n\nTweening fills the motion between keyframes.\n\nThe graph editor changes acceleration and makes movement feel natural.\n\nA classroom activity should ask students to observe, mark, animate, and explain the motion curve."
  }
];

const webContext: WebContextResult = {
  provider: "nexus_self_hosted",
  query: "keyframe animation teaching references",
  summary: "Animation teaching references emphasize pose-to-pose planning, timing, spacing, easing, and immediate practice.",
  items: [
    {
      title: "Animation principles for classroom teaching",
      url: "https://example.com/animation-principles",
      snippet:
        "Pose-to-pose planning helps learners separate important poses from in-between motion. Timing and spacing explain why two motions with the same keyframes can feel different.",
      website: "example.com",
      type: "web_page"
    },
    {
      title: "Graph editor practice",
      url: "https://example.com/graph-editor",
      snippet:
        "Learners should compare linear interpolation with ease-in and ease-out curves, then describe how the curve changes speed and weight.",
      website: "example.com",
      type: "web_page"
    }
  ]
};

const thinDeck: PresentationDeck = {
  title: "Keyframe Animation Lesson",
  slides: [{ type: "cover", title: "Keyframe Animation Lesson" }]
};

const richDeck = buildRichPresentationDeck({
  title: "Keyframe Animation Lesson",
  request: "Create an 8-slide teaching PPT for a classroom lesson about keyframe animation.",
  deck: thinDeck,
  extractedDocuments: documents,
  webContext
});

assert(richDeck.slides.length >= 8, `Expected at least 8 slides, got ${richDeck.slides.length}`);
assert(richDeck.slides.some((slide) => slide.layoutPreset === "teaching_cover" || slide.type === "cover"), "Expected a teaching cover slide");
assert(richDeck.slides.some((slide) => slide.layoutPreset === "agenda_list" || slide.type === "agenda"), "Expected an agenda slide");
assert(richDeck.slides.some((slide) => slide.layoutPreset === "data_insight" || slide.metrics?.length), "Expected a data or evidence slide");
assert(richDeck.slides.some((slide) => slide.layoutPreset === "lesson_exercise"), "Expected a classroom exercise slide");

const allText = richDeck.slides.map(slideText).join(" ");
assert(allText.includes("Keyframes mark important poses"), "Expected uploaded file facts to appear in the deck");
assert(allText.includes("Pose-to-pose planning"), "Expected web research facts to appear in the deck");
assert(allText.includes("linear interpolation"), "Expected comparison details from research to appear in the deck");

const contentSlides = richDeck.slides.filter((slide) => !["cover", "section", "closing"].includes(slide.type));
for (const slide of contentSlides) {
  const hasDenseBullets = (slide.bullets || []).length >= 3;
  const hasDenseMetrics = (slide.metrics || []).length >= 2;
  const hasDenseTable = (slide.table || []).length >= 3;
  assert(hasDenseBullets || hasDenseMetrics || hasDenseTable, `Slide "${slide.title}" is too sparse`);
}

assert(
  richDeck.slides.filter((slide) => slide.visualBrief || slide.imageQuery).length >= 4,
  "Expected multiple slides to carry visual search/generation guidance"
);
assert(
  richDeck.slides.filter((slide) => (slide.speakerNotes || "").length >= 80).length >= 5,
  "Expected speaker notes on most content slides"
);

const qa = checkPresentationPlanV2(richDeck);
assert(qa.passed, `Expected rich deck to pass V2 plan QA: ${JSON.stringify(qa.findings)}`);
assert(
  !qa.findings.some((finding) => finding.rule === "low_content_density"),
  `Expected no content-density warnings: ${JSON.stringify(qa.findings)}`
);

const sixSlideDeck = buildRichPresentationDeck({
  title: "Keyframe Animation Lesson",
  request: "Create a 6-slide teaching PPT for a classroom lesson about keyframe animation.",
  deck: thinDeck,
  extractedDocuments: documents,
  webContext
});

assert(sixSlideDeck.slides.length === 6, `Expected explicit 6-slide request to produce 6 slides, got ${sixSlideDeck.slides.length}`);
assert(
  sixSlideDeck.slides.some((slide) => slide.layoutPreset === "lesson_exercise"),
  "Expected a 6-slide teaching deck to keep a classroom exercise slide"
);
assert(
  sixSlideDeck.slides.some((slide) => slide.layoutPreset === "process_steps"),
  "Expected a 6-slide teaching deck to keep a process workflow slide"
);
assert(
  sixSlideDeck.slides.filter((slide) => (slide.bullets || []).length >= 3 || (slide.metrics || []).length >= 2).length >= 4,
  "Expected explicit shorter decks to preserve rich content density"
);

console.log(JSON.stringify({ ok: true, slides: richDeck.slides.length }, null, 2));
