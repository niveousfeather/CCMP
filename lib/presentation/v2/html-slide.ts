import type { PresentationDeck, PresentationMetric, PresentationSlide } from "@/lib/presentation/types";
import { getPresentationThemeCss, type PresentationThemeV2 } from "@/lib/presentation/v2/themes";

export type HtmlSlide = {
  index: number;
  preset: string;
  title: string;
  html: string;
};

export type HtmlSlideDeck = {
  html: string;
  slides: HtmlSlide[];
};

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function classNameForPreset(slide: PresentationSlide) {
  return `slide--${String(slide.layoutPreset || slide.type || "content").replace(/_/g, "-")}`;
}

function itemsOf(slide: PresentationSlide, fallback: string[] = []) {
  const items = slide.bullets?.length ? slide.bullets : fallback;
  return items.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6);
}

function visualLabel(slide: PresentationSlide) {
  return slide.visualAsset?.alt || slide.imageQuery || slide.visualBrief || "Visual reference";
}

function visualDataUri(slide: PresentationSlide) {
  const asset = slide.visualAsset;
  if (!asset?.buffer?.length) return null;
  const prefix = asset.mimeType === "image/png" ? "data:image/png;base64," : "data:image/jpeg;base64,";
  return `${prefix}${asset.buffer.toString("base64")}`;
}

function themeLabel(slide: PresentationSlide, theme: PresentationThemeV2) {
  if (slide.layoutPreset === "academic_cover") return "Academic Research";
  if (slide.layoutPreset === "teaching_cover") return "Teaching Courseware";
  return theme.style === "academic" ? "Academic Research" : theme.style === "teaching" ? "Teaching Courseware" : theme.name;
}

function badge(text: string, className = "eyebrow") {
  return `<p class="${className}">${escapeHtml(text)}</p>`;
}

function slideHeader(slide: PresentationSlide, theme: PresentationThemeV2, titleClass = "") {
  return `<header>${badge(themeLabel(slide, theme))}<h1 class="${titleClass}">${escapeHtml(slide.title)}</h1>${
    slide.subtitle ? `<h2>${escapeHtml(slide.subtitle)}</h2>` : ""
  }</header>`;
}

function visualStage(slide: PresentationSlide, variant = "") {
  const dataUri = visualDataUri(slide);
  const sourceClass = slide.visualAsset ? `visual-source--${slide.visualAsset.source.replace(/_/g, "-")}` : "visual-source--placeholder";
  return `<aside class="visual-stage ${variant} ${sourceClass}">
    <div class="visual-frame">
      ${
        dataUri
          ? `<img src="${dataUri}" alt="${escapeHtml(visualLabel(slide))}" />`
          : `<span>${escapeHtml(visualLabel(slide))}</span>`
      }
    </div>
    <div class="visual-ribbon"></div>
  </aside>`;
}

function renderCoverBody(slide: PresentationSlide, theme: PresentationThemeV2) {
  const isTeaching = slide.layoutPreset === "teaching_cover";
  const chips = isTeaching ? ["目标清晰", "步骤讲解", "课堂练习"] : ["Method", "Evidence", "Findings"];

  return `<main class="cover-layout">
    <section class="cover-copy">
      ${slideHeader(slide, theme, "display-title")}
      <div class="${isTeaching ? "teaching-chip-row" : "paper-chip-row"}">${chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("")}</div>
    </section>
    ${visualStage(slide, isTeaching ? "visual-stage--teaching" : "visual-stage--paper")}
  </main>`;
}

function renderSectionBody(slide: PresentationSlide, theme: PresentationThemeV2, index: number) {
  return `<main class="section-layout">
    <section class="section-copy">
      ${badge(`Section ${String(index + 1).padStart(2, "0")}`)}
      <h1 class="display-title">${escapeHtml(slide.title)}</h1>
      ${slide.subtitle ? `<h2>${escapeHtml(slide.subtitle)}</h2>` : ""}
    </section>
    ${visualStage(slide, "visual-stage--section")}
  </main>`;
}

function renderAgendaBody(slide: PresentationSlide, theme: PresentationThemeV2) {
  const items = itemsOf(slide, ["Problem framing and goals", "Core method walkthrough", "Case comparison", "Practice and summary"]);
  return `<main class="agenda-layout">
    ${slideHeader(slide, theme)}
    <ol class="agenda-stack">${items
      .map(
        (item, index) =>
          `<li><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(item)}</strong><i></i></li>`
      )
      .join("")}</ol>
  </main>`;
}

function renderImageExplanationBody(slide: PresentationSlide, theme: PresentationThemeV2) {
  const items = itemsOf(slide, ["Key idea", "Why it matters", "How to apply it"]).slice(0, 4);
  return `<main class="image-explanation-layout">
    <section>
      ${slideHeader(slide, theme)}
      ${visualStage(slide)}
    </section>
    <ol class="explanation-stack">${items
      .map((item, index) => `<li><span>${index + 1}</span><p>${escapeHtml(item)}</p></li>`)
      .join("")}</ol>
  </main>`;
}

function renderProcessBody(slide: PresentationSlide, theme: PresentationThemeV2) {
  const steps = itemsOf(slide, ["Collect evidence", "Analyze patterns", "Design response", "Review outcome"]).slice(0, 5);
  return `<main class="process-layout">
    ${slideHeader(slide, theme)}
    <ol class="process-track">${steps
      .map((step, index) => `<li><span>${index + 1}</span><strong>${escapeHtml(step)}</strong></li>`)
      .join("")}</ol>
  </main>`;
}

function renderComparisonBody(slide: PresentationSlide, theme: PresentationThemeV2) {
  const items = itemsOf(slide, ["Baseline: simple but limited", "Baseline: weaker transfer", "Proposed: richer context", "Proposed: stronger outcomes"]);
  const splitIndex = Math.ceil(items.length / 2);
  const columns = [
    { label: "Baseline", items: items.slice(0, splitIndex), tone: "primary" },
    { label: "Improved Plan", items: items.slice(splitIndex), tone: "accent" }
  ];

  return `<main class="comparison-layout">
    ${slideHeader(slide, theme)}
    <div class="comparison-grid">${columns
      .map(
        (column) => `<section class="comparison-column comparison-column--${column.tone}">
          <h3>${escapeHtml(column.label)}</h3>
          ${column.items.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
        </section>`
      )
      .join("")}</div>
  </main>`;
}

function metricFallback(slide: PresentationSlide): PresentationMetric[] {
  return itemsOf(slide, ["Accuracy: +12.4%", "Latency: -28%", "Coverage: 3 cases"]).map((item) => {
    const [label, ...rest] = item.split(":");
    return { label: label || "Metric", value: rest.join(":").trim() || item };
  });
}

function renderDataBody(slide: PresentationSlide, theme: PresentationThemeV2) {
  const metrics = (slide.metrics?.length ? slide.metrics : metricFallback(slide)).slice(0, 4);
  const [primary, ...rest] = metrics;
  return `<main class="data-layout">
    ${slideHeader(slide, theme)}
    <section class="metric-hero">
      <strong>${escapeHtml(primary?.value || "Ready")}</strong>
      <h3>${escapeHtml(primary?.label || "Key result")}</h3>
      ${primary?.detail ? `<p>${escapeHtml(primary.detail)}</p>` : ""}
    </section>
    <div class="metric-side">${rest
      .map(
        (metric) => `<figure><strong>${escapeHtml(metric.value)}</strong><figcaption>${escapeHtml(metric.label)}</figcaption>${
          metric.detail ? `<small>${escapeHtml(metric.detail)}</small>` : ""
        }</figure>`
      )
      .join("")}</div>
  </main>`;
}

function renderLessonExerciseBody(slide: PresentationSlide, theme: PresentationThemeV2) {
  const items = itemsOf(slide, ["Observe", "Practice", "Explain"]).slice(0, 5);
  return `<main class="exercise-layout">
    <section class="exercise-panel">
      ${badge("Class Task")}
      <h1>${escapeHtml(slide.title)}</h1>
      <p>观察、动手、说明</p>
    </section>
    <ol class="exercise-steps">${items.map((item, index) => `<li><span>${index + 1}</span>${escapeHtml(item)}</li>`).join("")}</ol>
  </main>`;
}

function renderKnowledgeCardsBody(slide: PresentationSlide, theme: PresentationThemeV2) {
  const items = itemsOf(slide, ["Clarify the objective", "Summarize the key context", "Define the next action"]).slice(0, 4);
  return `<main class="cards-layout">
    ${slideHeader(slide, theme)}
    <div class="knowledge-grid">${items.map((item, index) => `<article><span>${index + 1}</span><p>${escapeHtml(item)}</p></article>`).join("")}</div>
  </main>`;
}

function renderSlideBody(slide: PresentationSlide, index: number, theme: PresentationThemeV2) {
  switch (slide.layoutPreset) {
    case "academic_cover":
    case "teaching_cover":
      return renderCoverBody(slide, theme);
    case "section_divider":
      return renderSectionBody(slide, theme, index);
    case "agenda_list":
      return renderAgendaBody(slide, theme);
    case "image_explanation":
      return renderImageExplanationBody(slide, theme);
    case "process_steps":
      return renderProcessBody(slide, theme);
    case "comparison_matrix":
      return renderComparisonBody(slide, theme);
    case "data_insight":
      return renderDataBody(slide, theme);
    case "lesson_exercise":
      return renderLessonExerciseBody(slide, theme);
    case "knowledge_cards":
    default:
      return renderKnowledgeCardsBody(slide, theme);
  }
}

function renderSlide(slide: PresentationSlide, index: number, theme: PresentationThemeV2): HtmlSlide {
  const presetClass = classNameForPreset(slide);
  const html = [
    `<section class="nexus-slide ${theme.slideCssClass} ${presetClass}" data-index="${index + 1}" data-preset="${escapeHtml(slide.layoutPreset || slide.type)}">`,
    `<div class="slide-bg"></div>`,
    `<div class="slide-rule slide-rule--one"></div>`,
    `<div class="slide-rule slide-rule--two"></div>`,
    renderSlideBody(slide, index, theme),
    `</section>`
  ].join("");

  return {
    index,
    preset: slide.layoutPreset || slide.type,
    title: slide.title,
    html
  };
}

export function renderHtmlSlideDeck(deck: PresentationDeck, theme: PresentationThemeV2): HtmlSlideDeck {
  const slides = deck.slides.map((slide, index) => renderSlide(slide, index, theme));
  const css = `
    <style>
      .nexus-html-deck{${getPresentationThemeCss(theme)};display:grid;gap:24px;font-family:var(--ppt-body-font),sans-serif;color:var(--ppt-body);background:#e8edf3;padding:24px}
      .nexus-slide{position:relative;aspect-ratio:16/9;overflow:hidden;background:var(--ppt-bg);border-radius:8px;box-shadow:0 18px 45px rgba(15,23,42,.16)}
      .nexus-slide *{box-sizing:border-box}
      .slide-bg{position:absolute;inset:0;background:
        linear-gradient(135deg,rgba(255,255,255,.96),rgba(255,255,255,.72)),
        linear-gradient(110deg,transparent 0 62%,color-mix(in srgb,var(--ppt-primary) 7%,transparent) 62% 100%),
        linear-gradient(0deg,color-mix(in srgb,var(--ppt-accent) 5%,transparent),transparent 46%)}
      .slide-rule{position:absolute;height:1px;background:color-mix(in srgb,var(--ppt-primary) 16%,transparent);transform:rotate(-18deg);transform-origin:left center}
      .slide-rule--one{width:520px;right:-120px;top:96px}
      .slide-rule--two{width:420px;right:70px;bottom:88px;background:color-mix(in srgb,var(--ppt-accent) 20%,transparent)}
      .nexus-slide main{position:absolute;inset:6.7% 7%;z-index:1}
      .eyebrow{margin:0 0 16px;color:var(--ppt-accent);font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:0}
      h1{margin:0;color:var(--ppt-primary);font-family:var(--ppt-heading-font),serif;font-size:46px;line-height:1.05;letter-spacing:0}
      .display-title{font-size:56px;line-height:1.02;max-width:720px}
      h2{margin:20px 0 0;max-width:610px;color:var(--ppt-muted);font-size:21px;line-height:1.42;font-weight:500}
      .cover-layout{display:grid;grid-template-columns:1.08fr .92fr;gap:54px;align-items:center}
      .cover-copy{padding:24px 0}
      .teaching-chip-row,.paper-chip-row{display:flex;gap:14px;flex-wrap:wrap;margin-top:44px}
      .teaching-chip-row span,.paper-chip-row span{display:inline-flex;align-items:center;min-height:38px;padding:0 18px;border-radius:999px;background:var(--ppt-surface);border:1px solid color-mix(in srgb,var(--ppt-primary) 16%,transparent);color:var(--ppt-primary);font-weight:800;font-size:15px}
      .visual-stage{position:relative;min-height:420px;border-radius:28px;background:linear-gradient(135deg,var(--ppt-surface),color-mix(in srgb,var(--ppt-primary) 8%,white));border:1px solid color-mix(in srgb,var(--ppt-primary) 16%,transparent);box-shadow:0 22px 55px rgba(15,23,42,.12);overflow:hidden}
      .visual-stage:before{content:"";position:absolute;inset:38px;border:1px solid color-mix(in srgb,var(--ppt-accent) 30%,transparent);border-radius:22px}
      .visual-frame{position:absolute;inset:74px 50px 74px 50px;display:grid;place-items:center;text-align:center;border-radius:20px;background:linear-gradient(135deg,color-mix(in srgb,var(--ppt-primary) 10%,white),color-mix(in srgb,var(--ppt-accent) 10%,white));color:var(--ppt-muted);font-weight:700;padding:26px;overflow:hidden}
      .visual-frame img{width:100%;height:100%;object-fit:cover;border-radius:14px;display:block}
      .visual-source--web-search .visual-frame{padding:0}
      .visual-source--generated .visual-frame{padding:0}
      .visual-ribbon{position:absolute;left:0;right:0;bottom:0;height:18px;background:linear-gradient(90deg,var(--ppt-primary),var(--ppt-accent))}
      .visual-stage--paper{border-radius:8px}
      .visual-stage--teaching{transform:rotate(1deg)}
      .section-layout{display:grid;grid-template-columns:1.06fr .94fr;gap:56px;align-items:center}
      .section-copy{padding:56px 0 56px 44px;border-left:12px solid var(--ppt-primary)}
      .agenda-layout,.process-layout,.comparison-layout,.data-layout,.cards-layout{display:grid;grid-template-rows:auto 1fr;gap:34px}
      .agenda-stack{margin:0;padding:0;list-style:none;display:grid;gap:14px}
      .agenda-stack li{height:76px;display:grid;grid-template-columns:74px 1fr 26px;align-items:center;gap:20px;background:var(--ppt-surface);border:1px solid color-mix(in srgb,var(--ppt-primary) 12%,transparent);border-radius:16px;padding:0 28px;box-shadow:0 12px 30px rgba(15,23,42,.06)}
      .agenda-stack span{display:grid;place-items:center;width:44px;height:44px;border-radius:999px;background:var(--ppt-primary);color:white;font-weight:900}
      .agenda-stack strong{font-size:21px;color:var(--ppt-body)}
      .agenda-stack i{width:13px;height:13px;border-radius:999px;background:var(--ppt-accent)}
      .image-explanation-layout{display:grid;grid-template-columns:1.08fr .92fr;gap:48px;align-items:center}
      .image-explanation-layout .visual-stage{min-height:270px;margin-top:34px}
      .explanation-stack{margin:0;padding:0;list-style:none;display:grid;gap:18px}
      .explanation-stack li{display:grid;grid-template-columns:48px 1fr;gap:16px;align-items:center;background:var(--ppt-surface);border-radius:16px;padding:18px 20px;border:1px solid color-mix(in srgb,var(--ppt-primary) 12%,transparent)}
      .explanation-stack span{display:grid;place-items:center;width:40px;height:40px;border-radius:999px;background:var(--ppt-accent);color:white;font-weight:900}
      .explanation-stack p{margin:0;font-size:20px;line-height:1.35}
      .process-track{position:relative;align-self:start;margin:26px 0 0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:18px;align-items:start}
      .process-track:before{content:"";position:absolute;left:8%;right:8%;top:86px;height:5px;border-radius:999px;background:color-mix(in srgb,var(--ppt-primary) 18%,white)}
      .process-track li{position:relative;min-height:232px;padding:30px 18px 24px;border-radius:20px;background:var(--ppt-surface);border:1px solid color-mix(in srgb,var(--ppt-primary) 12%,transparent);text-align:center;box-shadow:0 16px 34px rgba(15,23,42,.07)}
      .process-track span{display:grid;place-items:center;margin:0 auto 34px;width:64px;height:64px;border-radius:999px;background:var(--ppt-primary);color:white;font-weight:900;font-size:24px}
      .process-track strong{font-size:18px;line-height:1.28;color:var(--ppt-body)}
      .comparison-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-self:start;align-items:start}
      .comparison-column{overflow:hidden;border-radius:18px;background:var(--ppt-surface);border:1px solid color-mix(in srgb,var(--ppt-primary) 13%,transparent);box-shadow:0 16px 38px rgba(15,23,42,.08)}
      .comparison-column h3{margin:0;padding:20px 24px;background:var(--ppt-primary);color:white;font-size:21px}
      .comparison-column--accent h3{background:var(--ppt-accent)}
      .comparison-column p{margin:0;padding:20px 24px;min-height:72px;border-top:1px solid color-mix(in srgb,var(--ppt-primary) 10%,transparent);font-size:18px;line-height:1.35}
      .data-layout{grid-template-columns:1.05fr .95fr;grid-template-rows:auto 1fr;column-gap:26px}
      .data-layout header{grid-column:1 / -1}
      .metric-hero{display:grid;align-content:center;min-height:300px;border-radius:22px;background:var(--ppt-surface);border:1px solid color-mix(in srgb,var(--ppt-primary) 12%,transparent);padding:34px;box-shadow:0 18px 44px rgba(15,23,42,.08)}
      .metric-hero strong{display:block;color:var(--ppt-accent);font-size:62px;font-family:var(--ppt-heading-font),serif;line-height:1}
      .metric-hero h3{margin:14px 0 0;color:var(--ppt-primary);font-size:24px}
      .metric-hero p{margin:8px 0 0;color:var(--ppt-muted);font-size:17px}
      .metric-side{display:grid;gap:16px}
      .metric-side figure{margin:0;border-radius:18px;background:var(--ppt-surface);border:1px solid color-mix(in srgb,var(--ppt-primary) 10%,transparent);padding:24px}
      .metric-side strong{color:var(--ppt-primary);font-size:34px}
      .metric-side figcaption{margin-top:4px;color:var(--ppt-body);font-weight:800}
      .metric-side small{display:block;margin-top:6px;color:var(--ppt-muted)}
      .exercise-layout{display:grid;grid-template-columns:.82fr 1.18fr;gap:34px;align-items:center}
      .exercise-panel{min-height:370px;border-radius:24px;background:linear-gradient(135deg,var(--ppt-primary),color-mix(in srgb,var(--ppt-primary) 60%,var(--ppt-accent)));color:white;padding:42px}
      .exercise-panel .eyebrow,.exercise-panel h1,.exercise-panel p{color:white}
      .exercise-panel h1{font-size:44px}
      .exercise-panel p{font-size:20px;margin-top:24px}
      .exercise-steps{margin:0;padding:0;list-style:none;display:grid;gap:14px}
      .exercise-steps li{display:grid;grid-template-columns:42px 1fr;gap:16px;align-items:center;min-height:66px;border-radius:15px;background:var(--ppt-surface);padding:14px 18px;font-size:19px;font-weight:700}
      .exercise-steps span{display:grid;place-items:center;width:36px;height:36px;border-radius:999px;background:var(--ppt-accent);color:white}
      .knowledge-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
      .knowledge-grid article{min-height:150px;border-radius:18px;background:var(--ppt-surface);border:1px solid color-mix(in srgb,var(--ppt-primary) 12%,transparent);padding:24px}
      .knowledge-grid span{display:grid;place-items:center;width:38px;height:38px;border-radius:999px;background:var(--ppt-primary);color:white;font-weight:900}
      .knowledge-grid p{margin:18px 0 0;font-size:20px;line-height:1.35;font-weight:700}
    </style>`;
  return {
    slides,
    html: `${css}<div class="nexus-html-deck">${slides.map((slide) => slide.html).join("")}</div>`
  };
}
