import { evaluateSlideQuality } from "../lib/presentation/v2/qa";

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

const thinSlide = {
  type: "cards",
  layoutPreset: "knowledge_cards",
  title: "Overview",
  bullets: ["Important points"]
};

const thinScore = evaluateSlideQuality(thinSlide, 0);
const thinIssues = thinScore.issues.map((issue) => issue.code);

assert(thinScore.score < 70, `Expected thin slide score below 70, got ${thinScore.score}`);
assert(thinScore.shouldRewrite, "Expected thin slide to request rewrite");
assert(thinIssues.includes("low_content_density"), "Expected low_content_density issue");
assert(thinIssues.includes("missing_speaker_notes"), "Expected missing_speaker_notes issue");
assert(thinIssues.includes("missing_visual_brief"), "Expected missing_visual_brief issue");

const richSlide = {
  type: "imageText",
  layoutPreset: "image_explanation",
  title: "Keyframe Animation: Timing, Spacing, and Easing",
  subtitle: "A teaching slide grounded in uploaded lesson notes",
  bullets: [
    "Keyframes mark important poses in an animation timeline and define the motion endpoints.",
    "Tweening fills the frames between key poses so learners can compare pose-to-pose motion.",
    "Graph editor curves change acceleration, making motion feel natural instead of mechanical.",
    "Classroom activity: students observe, mark, animate, and explain one motion curve."
  ],
  visualBrief: "Annotated animation timeline showing keyframes, tweened frames, and graph editor easing curve",
  imageQuery: "keyframe animation timeline graph editor easing classroom example",
  speakerNotes:
    "Explain how keyframes define the important poses first, then show how tweening and graph editor curves change the perceived speed and weight of the animation."
};

const richScore = evaluateSlideQuality(richSlide, 1);

assert(richScore.score >= 70, `Expected rich slide score at least 70, got ${richScore.score}`);
assert(!richScore.shouldRewrite, "Expected rich slide to pass without rewrite");

console.log(JSON.stringify({ ok: true, thinScore: thinScore.score, richScore: richScore.score }, null, 2));
