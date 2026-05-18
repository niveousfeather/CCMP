import { evaluateDeckQuality } from "../lib/presentation/v2/qa";

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

const deck = {
  title: "Mixed Quality Deck",
  slides: [
    {
      type: "cover",
      layoutPreset: "academic_cover",
      title: "Research Report",
      subtitle: "Method, evidence, and implications",
      visualBrief: "Academic cover visual with research notes and charts",
      imageQuery: "academic research report charts",
      speakerNotes: "Open the presentation by framing the research question and previewing the evidence structure."
    },
    {
      type: "cards",
      layoutPreset: "knowledge_cards",
      title: "Things",
      bullets: ["Stuff"]
    },
    {
      type: "data",
      layoutPreset: "data_insight",
      title: "Evidence From Uploaded Notes",
      bullets: [
        "The uploaded notes describe three recurring classroom misconceptions about easing curves.",
        "Two practice rounds help learners compare linear interpolation with ease-in and ease-out timing.",
        "A final explanation step checks whether students can connect graph shape to perceived motion."
      ],
      metrics: [
        { label: "Practice rounds", value: "2", detail: "Observe then animate" },
        { label: "Reflection prompts", value: "3", detail: "Speed, weight, intention" }
      ],
      visualBrief: "Data card layout comparing practice rounds and reflection prompts",
      imageQuery: "classroom animation practice data insight chart",
      speakerNotes:
        "Use this evidence slide to connect uploaded lesson facts with the teaching design. Emphasize how practice rounds and reflection prompts make the concept measurable."
    }
  ]
};

const report = evaluateDeckQuality(deck);

assert(typeof report.totalScore === "number" && Number.isFinite(report.totalScore), "Expected numeric totalScore");
assert(report.slideScores.length === deck.slides.length, "Expected one score per slide");
assert(report.lowQualitySlides.includes(1), `Expected slide 1 to be marked low quality: ${JSON.stringify(report.lowQualitySlides)}`);
assert(report.shouldRepair, "Expected mixed deck to require repair");
assert(report.summary.length >= 1, "Expected report summary");

console.log(JSON.stringify({ ok: true, totalScore: report.totalScore, lowQualitySlides: report.lowQualitySlides }, null, 2));
