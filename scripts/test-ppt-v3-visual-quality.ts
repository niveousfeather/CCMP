import { evaluateVisualPlanQuality } from "../lib/presentation/v2/qa";
import type { DeckVisualPlan } from "../lib/presentation/v2/visual-plan";

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

const lowQualityPlan: DeckVisualPlan = {
  theme: "academic_paper",
  slides: [
    {
      slideIndex: 0,
      layout: "paper_split_explanation",
      theme: "academic_paper",
      blocks: [
        { id: "title", kind: "title", x: 48, y: 34, w: 840, h: 52, title: "Plain Slide" },
        { id: "body", kind: "text_card", x: 48, y: 110, w: 760, h: 420, bullets: ["One bullet", "Another bullet"] }
      ]
    }
  ]
};

const lowReport = evaluateVisualPlanQuality(lowQualityPlan);
const lowIssueCodes = lowReport.issues.map((issue) => issue.code);

assert(lowReport.score < 70, `Expected low quality visual plan below 70, got ${lowReport.score}`);
assert(
  lowIssueCodes.includes("missing_visual_block") || lowIssueCodes.includes("layout_too_plain"),
  `Expected visual block/plain layout issue, got ${JSON.stringify(lowIssueCodes)}`
);

const highQualityPlan: DeckVisualPlan = {
  theme: "academic_paper",
  slides: [
    {
      slideIndex: 0,
      layout: "paper_figure_explanation",
      theme: "academic_paper",
      speakerNotes: "Explain the main observation, then use the figure panel and takeaway to connect method and result.",
      blocks: [
        { id: "title", kind: "title", x: 48, y: 34, w: 840, h: 52, title: "Core Observation" },
        { id: "card-1", kind: "text_card", x: 58, y: 122, w: 330, h: 130, title: "Motivation", body: "Simpler visual mixers can remain competitive under controlled comparison." },
        { id: "figure", kind: "figure_panel", x: 430, y: 122, w: 470, h: 300, title: "Architecture Figure", caption: "Figure: controlled method comparison", imageQuery: "academic model comparison figure" },
        { id: "caption", kind: "caption", x: 430, y: 432, w: 470, h: 34, caption: "Source-style caption for the figure panel" },
        { id: "takeaway", kind: "takeaway", x: 58, y: 478, w: 842, h: 70, body: "Takeaway: compare the simple baseline before adding expensive sequence modules." },
        { id: "page", kind: "caption", role: "page_number", x: 860, y: 628, w: 54, h: 18, caption: "01" }
      ]
    }
  ]
};

const highReport = evaluateVisualPlanQuality(highQualityPlan);

assert(highReport.score >= 70, `Expected high quality visual plan at least 70, got ${highReport.score}`);

console.log(JSON.stringify({ ok: true, lowScore: lowReport.score, highScore: highReport.score }, null, 2));
