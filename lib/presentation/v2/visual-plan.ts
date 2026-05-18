import type { PresentationDeck, PresentationSlide } from "@/lib/presentation/types";
import type { PresentationVisualThemeName } from "@/lib/presentation/v2/themes";

export type VisualBlockKind =
  | "title"
  | "subtitle"
  | "text_card"
  | "callout_card"
  | "figure_panel"
  | "image_panel"
  | "comparison_table"
  | "process_diagram"
  | "timeline"
  | "bar_chart"
  | "metric_card"
  | "quote"
  | "takeaway"
  | "caption";

export type VisualBlock = {
  id: string;
  kind: VisualBlockKind;
  x: number;
  y: number;
  w: number;
  h: number;
  role?: string;
  title?: string;
  body?: string;
  bullets?: string[];
  caption?: string;
  accent?: "primary" | "secondary" | "accent" | "success" | "warning" | "danger";
  imageQuery?: string;
  imageUrl?: string;
  data?: any;
};

export type SlideVisualPlan = {
  slideIndex: number;
  layout:
    | "paper_cover"
    | "paper_overview"
    | "paper_split_explanation"
    | "paper_figure_explanation"
    | "paper_method_pipeline"
    | "paper_comparison"
    | "paper_experiment_results"
    | "paper_ablation"
    | "paper_summary"
    | "teaching_cards"
    | "business_insight";
  theme: PresentationVisualThemeName;
  blocks: VisualBlock[];
  speakerNotes?: string;
};

export type DeckVisualPlan = {
  theme: PresentationVisualThemeName;
  slides: SlideVisualPlan[];
};

export type BuildVisualPresentationPlanOptions = {
  theme?: PresentationVisualThemeName;
};

function cleanText(value: unknown, maxLength = 180) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function itemsOf(slide: PresentationSlide, fallback: string[] = []) {
  const items = slide.bullets?.length ? slide.bullets : fallback;
  return items.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 6);
}

const MAIN_VISUAL_BLOCK_KINDS = new Set<VisualBlockKind>(["figure_panel", "image_panel", "comparison_table", "process_diagram", "timeline", "bar_chart"]);

function metricItems(slide: PresentationSlide) {
  return (slide.metrics || [])
    .map((metric) => ({
      label: cleanText(metric.label, 42),
      value: cleanText(metric.value, 24),
      detail: cleanText(metric.detail, 76)
    }))
    .filter((metric) => metric.label || metric.value)
    .slice(0, 4);
}

function captionFor(slide: PresentationSlide, fallback = "Visual reference") {
  return cleanText(slide.visualBrief || slide.imageQuery || slide.subtitle || fallback, 120);
}

function titleOf(slide: PresentationSlide) {
  return cleanText(slide.title || "Research finding", 88);
}

export function inferVisualLayout(slide: any): SlideVisualPlan["layout"] {
  const preset = String(slide?.layoutPreset || "");
  if (preset === "academic_cover" || preset === "teaching_cover") return "paper_cover";
  if (preset === "agenda_list") return "paper_overview";
  if (preset === "image_explanation") return "paper_figure_explanation";
  if (preset === "knowledge_cards") return "paper_split_explanation";
  if (preset === "process_steps") return "paper_method_pipeline";
  if (preset === "comparison_matrix") return "paper_comparison";
  if (preset === "data_insight") return "paper_experiment_results";
  if (preset === "lesson_exercise") return "teaching_cards";
  if (preset === "summary_closing") return "paper_summary";
  if (String(slide?.type || "") === "timeline") return "paper_method_pipeline";
  if (String(slide?.type || "") === "comparison") return "paper_comparison";
  if (String(slide?.type || "") === "data") return "paper_experiment_results";
  if (String(slide?.type || "") === "closing") return "paper_summary";
  const semanticText = `${slide?.title || ""} ${(slide?.bullets || []).join(" ")} ${slide?.visualBrief || ""}`.toLowerCase();
  if (/\b(method|pipeline|algorithm|training|stage|step|workflow|procedure)\b|流程|方法|步骤/.test(semanticText)) return "paper_method_pipeline";
  if (/\b(comparison|baseline|ablation|versus|compare|trade-off|tradeoff)\b|对比|基线|消融/.test(semanticText)) return "paper_comparison";
  if (/\b(experiment|result|benchmark|accuracy|metric|dataset|top-1|throughput|latency)\b|实验|结果|指标/.test(semanticText)) {
    return "paper_experiment_results";
  }
  if (/\b(conclusion|takeaway|summary|q&a|future work)\b|结论|总结/.test(semanticText)) return "paper_summary";
  if (/\b(limitation|failure|risk|boundary|challenge)\b|局限|限制|风险/.test(semanticText)) return "paper_split_explanation";
  return "paper_split_explanation";
}

function pageNumberBlock(slideIndex: number): VisualBlock {
  return {
    id: `s${slideIndex}-page`,
    kind: "caption",
    role: "page_number",
    x: 1088,
    y: 638,
    w: 56,
    h: 20,
    caption: String(slideIndex + 1).padStart(2, "0")
  };
}

function titleBlocks(slide: PresentationSlide, slideIndex: number): VisualBlock[] {
  const blocks: VisualBlock[] = [
    {
      id: `s${slideIndex}-title`,
      kind: "title",
      x: 56,
      y: 38,
      w: 870,
      h: 58,
      title: cleanText(slide.title || `Slide ${slideIndex + 1}`, 88)
    }
  ];
  if (slide.subtitle) {
    blocks.push({
      id: `s${slideIndex}-subtitle`,
      kind: "subtitle",
      x: 58,
      y: 96,
      w: 760,
      h: 42,
      body: cleanText(slide.subtitle, 130)
    });
  }
  return blocks;
}

function textCards(slide: PresentationSlide, slideIndex: number, x: number, y: number, w: number, h: number, max = 3): VisualBlock[] {
  return itemsOf(slide, ["Problem framing", "Evidence summary", "Practical implication"])
    .slice(0, max)
    .map((item, index) => ({
      id: `s${slideIndex}-card-${index + 1}`,
      kind: index === 0 ? "callout_card" : "text_card",
      x,
      y: y + index * (h + 18),
      w,
      h,
      title: index === 0 ? "Key Point" : `Point ${index + 1}`,
      body: item,
      accent: index === 0 ? "accent" : index % 2 ? "secondary" : "primary"
    }));
}

function figureBlock(slide: PresentationSlide, slideIndex: number, x: number, y: number, w: number, h: number): VisualBlock[] {
  const query = cleanText(slide.imageQuery || slide.visualBrief || slide.title, 120);
  return [
    {
      id: `s${slideIndex}-figure`,
      kind: slide.visualAsset ? "image_panel" : "figure_panel",
      x,
      y,
      w,
      h,
      title: "Figure",
      caption: captionFor(slide, "Figure: structured visual explanation"),
      imageQuery: query,
      imageUrl: slide.visualAsset?.sourceUrl,
      accent: "primary"
    }
  ];
}

function buildBlocksForLayout(slide: PresentationSlide, slideIndex: number, layout: SlideVisualPlan["layout"]): VisualBlock[] {
  const blocks = [...titleBlocks(slide, slideIndex)];
  const bullets = itemsOf(slide);
  const metrics = metricItems(slide);

  switch (layout) {
    case "paper_cover":
      blocks.push(
        {
          id: `s${slideIndex}-abstract`,
          kind: "callout_card",
          role: "abstract",
          x: 56,
          y: 338,
          w: 500,
          h: 150,
          title: "Abstract",
          body: cleanText(slide.subtitle || bullets[0] || "Paper-style presentation overview", 150),
          accent: "accent"
        },
        {
          id: `s${slideIndex}-keywords`,
          kind: "text_card",
          role: "keywords",
          x: 56,
          y: 506,
          w: 500,
          h: 92,
          title: "Keywords",
          bullets: bullets.length ? bullets.slice(0, 3) : ["Method", "Evidence", "Findings"],
          accent: "primary"
        },
        ...figureBlock(slide, slideIndex, 590, 140, 510, 410)
      );
      break;
    case "paper_overview":
      blocks.push(
        {
          id: `s${slideIndex}-agenda`,
          kind: "timeline",
          role: "agenda",
          x: 70,
          y: 160,
          w: 520,
          h: 382,
          bullets: bullets.length ? bullets : ["Background", "Method", "Experiments", "Conclusion"],
          accent: "primary"
        },
        {
          id: `s${slideIndex}-questions`,
          kind: "callout_card",
          role: "research_questions",
          x: 650,
          y: 168,
          w: 420,
          h: 180,
          title: "Research Questions",
          bullets: bullets.slice(0, 3),
          accent: "accent"
        },
        {
          id: `s${slideIndex}-objectives`,
          kind: "takeaway",
          x: 650,
          y: 374,
          w: 420,
          h: 132,
          body: cleanText(slide.speakerNotes || bullets[0] || "Use the roadmap to connect evidence, method, and conclusion.", 150),
          accent: "secondary"
        }
      );
      break;
    case "paper_figure_explanation":
      blocks.push(...textCards(slide, slideIndex, 48, 138, 360, 116, 3), ...figureBlock(slide, slideIndex, 436, 128, 672, 424), {
        id: `s${slideIndex}-takeaway`,
        kind: "takeaway",
        x: 48,
        y: 566,
        w: 1060,
        h: 54,
        body: cleanText(bullets[0] || "Key takeaway from the visual evidence.", 150),
        accent: "accent"
      });
      break;
    case "paper_method_pipeline":
      blocks.push(
        {
          id: `s${slideIndex}-pipeline`,
          kind: "process_diagram",
          x: 48,
          y: 132,
          w: 1056,
          h: 394,
          bullets: bullets.length ? bullets.slice(0, 5) : ["Research input", "Feature processing", "Evidence synthesis", "Output decision"],
          accent: "primary"
        },
        {
          id: `s${slideIndex}-method-insight`,
          kind: "callout_card",
          x: 48,
          y: 540,
          w: 548,
          h: 78,
          title: "Method Insight",
          body: cleanText(bullets[0] || slide.visualBrief || "Each stage exposes a controlled input, transformation, and output.", 130),
          accent: "accent"
        },
        {
          id: `s${slideIndex}-caption`,
          kind: "caption",
          role: "figure_caption",
          x: 626,
          y: 552,
          w: 478,
          h: 28,
          caption: captionFor(slide, "Pipeline: method stages and evidence flow")
        }
      );
      break;
    case "paper_comparison":
      blocks.push(
        {
          id: `s${slideIndex}-comparison`,
          kind: "comparison_table",
          x: 48,
          y: 132,
          w: 1056,
          h: 440,
          bullets: bullets.length ? bullets : ["Baseline", "Proposed", "Trade-off"],
          caption: captionFor(slide, "Comparison matrix: mechanism, advantage, limitation, and use case"),
          accent: "primary"
        },
        {
          id: `s${slideIndex}-comparison-takeaway`,
          kind: "takeaway",
          x: 48,
          y: 586,
          w: 1056,
          h: 40,
          body: cleanText(bullets.at(-1) || "The comparison should make the trade-off explicit.", 140),
          accent: "accent"
        }
      );
      break;
    case "paper_experiment_results":
    case "paper_ablation":
      blocks.push(
        {
          id: `s${slideIndex}-metric-cards`,
          kind: "metric_card",
          x: 48,
          y: 132,
          w: 354,
          h: 414,
          data: metrics.length ? metrics : [{ label: "Result", value: "示意", detail: "Structured placeholder" }],
          accent: "accent"
        },
        {
          id: `s${slideIndex}-bar-chart`,
          kind: "bar_chart",
          x: 428,
          y: 128,
          w: 680,
          h: 420,
          data: metrics.length ? metrics : bullets.slice(0, 3),
          caption: metrics.length ? "Chart: metrics from slide data" : "Chart: illustrative structure when no numeric data is available",
          accent: "primary"
        },
        {
          id: `s${slideIndex}-result-caption`,
          kind: "caption",
          role: "figure_caption",
          x: 428,
          y: 554,
          w: 672,
          h: 28,
          caption: metrics.length ? "Result panel summarizes available metrics." : "示意：缺少真实数据时使用结构化图表占位。"
        },
        {
          id: `s${slideIndex}-result-takeaway`,
          kind: "takeaway",
          x: 48,
          y: 588,
          w: 1056,
          h: 42,
          body: cleanText(bullets[0] || slide.speakerNotes || "Result takeaway should explain what the metric means.", 150),
          accent: "secondary"
        }
      );
      break;
    case "teaching_cards":
      blocks.push(
        {
          id: `s${slideIndex}-teaching-cards`,
          kind: "process_diagram",
          x: 62,
          y: 166,
          w: 1010,
          h: 332,
          bullets: bullets.length ? bullets : ["Observe", "Practice", "Explain"],
          accent: "success"
        },
        {
          id: `s${slideIndex}-exercise-takeaway`,
          kind: "takeaway",
          x: 62,
          y: 532,
          w: 1010,
          h: 62,
          body: "Use the activity to make learners explain the evidence, not just repeat the answer.",
          accent: "accent"
        }
      );
      break;
    case "paper_summary":
      blocks.push(
        ...itemsOf(slide, ["Main contribution", "Boundary condition", "Next step"])
          .slice(0, 3)
          .map((item, index) => ({
            id: `s${slideIndex}-summary-${index + 1}`,
            kind: "takeaway" as const,
            x: 56,
            y: 148 + index * 118,
            w: 432,
            h: 98,
            title: `Takeaway ${index + 1}`,
            body: item,
            accent: (index === 0 ? "primary" : index === 1 ? "secondary" : "accent") as VisualBlock["accent"]
          })),
        {
          id: `s${slideIndex}-next-steps`,
          kind: "callout_card",
          role: "next_steps",
          x: 56,
          y: 516,
          w: 432,
          h: 82,
          title: "Next Steps / Q&A",
          body: cleanText(slide.speakerNotes || "Discuss how the conclusion changes the next experiment, lesson, or implementation.", 150),
          accent: "accent"
        },
        ...figureBlock(slide, slideIndex, 534, 146, 574, 396)
      );
      break;
    case "paper_split_explanation":
    default:
      blocks.push(...textCards(slide, slideIndex, 48, 132, 386, 122, 3), ...figureBlock(slide, slideIndex, 462, 128, 646, 424), {
        id: `s${slideIndex}-split-takeaway`,
        kind: "takeaway",
        x: 48,
        y: 566,
        w: 1060,
        h: 54,
        body: cleanText(bullets[0] || "Summarize the main implication of this slide.", 150),
        accent: "accent"
      });
      break;
  }

  blocks.push(pageNumberBlock(slideIndex));
  return blocks;
}

function fallbackSteps(slide: PresentationSlide) {
  const items = itemsOf(slide, ["Input evidence", "Feature transformation", "Controlled comparison", "Decision output"]);
  const steps = [...items];
  const defaults = ["Input evidence", "Feature transformation", "Controlled comparison", "Decision output"];
  for (const item of defaults) {
    if (steps.length >= 4) break;
    if (!steps.includes(item)) steps.push(item);
  }
  return steps.slice(0, 5);
}

function fallbackComparisonRows(slide: PresentationSlide) {
  const bullets = itemsOf(slide);
  return [
    "Mechanism: " + (bullets[0] || "compare how each block processes visual tokens"),
    "Advantage: " + (bullets[1] || "highlight accuracy, speed, or interpretability gain"),
    "Limitation: " + (bullets[2] || "make the boundary condition explicit"),
    "Use case: " + (bullets[3] || "connect the choice to the target task")
  ];
}

function fallbackMetrics(slide: PresentationSlide) {
  const metrics = metricItems(slide);
  if (metrics.length >= 3) return metrics;
  const title = titleOf(slide);
  return [
    ...metrics,
    { label: "Accuracy", value: "+0.8", detail: `${title} illustrative trend` },
    { label: "Throughput", value: "+18%", detail: "Relative efficiency signal" },
    { label: "Params", value: "-9%", detail: "Model budget indicator" }
  ].slice(0, 4);
}

function fallbackTakeaway(slide: PresentationSlide) {
  const bullets = itemsOf(slide);
  return cleanText(
    bullets[0] || slide.speakerNotes || `${titleOf(slide)} should be read as an evidence-backed claim with clear conditions.`,
    150
  );
}

function fallbackSpeakerNotes(slide: PresentationSlide, slidePlan: SlideVisualPlan) {
  const title = titleOf(slide);
  const bullets = itemsOf(slide).slice(0, 3);
  const evidence = bullets.length ? bullets.join(" ") : captionFor(slide, "the visual structure on this page");
  const layoutHint = slidePlan.layout.replace(/_/g, " ");
  return cleanText(
    `${title}: introduce the claim, then walk through the ${layoutHint} visual from left to right. Emphasize ${evidence}. Close by connecting the takeaway to the next slide.`,
    360
  );
}

function hasMainVisual(blocks: VisualBlock[]) {
  return blocks.some((block) => MAIN_VISUAL_BLOCK_KINDS.has(block.kind));
}

function hasCaption(blocks: VisualBlock[]) {
  return blocks.some((block) => block.kind === "caption" && cleanText(block.caption || block.body)) || blocks.some((block) => cleanText(block.caption));
}

function hasTakeaway(blocks: VisualBlock[]) {
  return blocks.some((block) => block.kind === "takeaway" || block.kind === "callout_card");
}

export function enrichVisualPlanSlide(slidePlan: SlideVisualPlan, sourceSlide: PresentationSlide): SlideVisualPlan {
  const blocks = slidePlan.blocks.map((block) => ({ ...block }));
  const slideIndex = slidePlan.slideIndex;

  if (!blocks.some((block) => block.kind === "title")) {
    blocks.unshift({ id: `s${slideIndex}-title-fallback`, kind: "title", x: 56, y: 38, w: 870, h: 58, title: titleOf(sourceSlide) });
  }

  for (const block of blocks) {
    if ((block.kind === "process_diagram" || block.kind === "timeline") && (!block.bullets || block.bullets.length < 3)) {
      block.bullets = fallbackSteps(sourceSlide);
    }
    if (block.kind === "comparison_table" && (!block.bullets || block.bullets.length < 4)) {
      block.bullets = fallbackComparisonRows(sourceSlide);
    }
    if ((block.kind === "bar_chart" || block.kind === "metric_card") && (!Array.isArray(block.data) || block.data.length < 3)) {
      block.data = fallbackMetrics(sourceSlide);
    }
    if ((block.kind === "figure_panel" || block.kind === "image_panel") && !cleanText(block.caption)) {
      block.caption = captionFor(sourceSlide, `Figure: ${titleOf(sourceSlide)}`);
    }
  }

  if (!hasMainVisual(blocks)) {
    const visualKind: VisualBlockKind =
      slidePlan.layout === "paper_comparison"
        ? "comparison_table"
        : slidePlan.layout === "paper_method_pipeline"
          ? "process_diagram"
          : slidePlan.layout === "paper_experiment_results" || slidePlan.layout === "paper_ablation"
            ? "bar_chart"
            : "figure_panel";
    blocks.push({
      id: `s${slideIndex}-main-visual-fallback`,
      kind: visualKind,
      x: 484,
      y: 140,
      w: 616,
      h: 400,
      title: "Visual Evidence",
      caption: captionFor(sourceSlide, `Figure: ${titleOf(sourceSlide)}`),
      bullets: visualKind === "process_diagram" ? fallbackSteps(sourceSlide) : visualKind === "comparison_table" ? fallbackComparisonRows(sourceSlide) : undefined,
      data: visualKind === "bar_chart" ? fallbackMetrics(sourceSlide) : undefined,
      imageQuery: cleanText(sourceSlide.imageQuery || sourceSlide.visualBrief || sourceSlide.title, 120),
      accent: "primary"
    });
  }

  if (!hasCaption(blocks)) {
    blocks.push({
      id: `s${slideIndex}-caption-fallback`,
      kind: "caption",
      role: "figure_caption",
      x: 484,
      y: 548,
      w: 616,
      h: 26,
      caption: captionFor(sourceSlide, `Figure: ${titleOf(sourceSlide)}`)
    });
  }

  if (!hasTakeaway(blocks)) {
    blocks.push({
      id: `s${slideIndex}-takeaway-fallback`,
      kind: "takeaway",
      x: 52,
      y: 560,
      w: 1048,
      h: 58,
      body: fallbackTakeaway(sourceSlide),
      accent: "accent"
    });
  }

  if (!blocks.some((block) => block.role === "page_number")) blocks.push(pageNumberBlock(slideIndex));

  const contentBlocks = blocks.filter((block) => !["title", "subtitle", "caption"].includes(block.kind));
  if (contentBlocks.length < 2) {
    blocks.push({
      id: `s${slideIndex}-content-fallback`,
      kind: "text_card",
      x: 52,
      y: 142,
      w: 380,
      h: 116,
      title: "Evidence Note",
      body: fallbackTakeaway(sourceSlide),
      accent: "secondary"
    });
  }

  return {
    ...slidePlan,
    blocks,
    speakerNotes: cleanText(slidePlan.speakerNotes || sourceSlide.speakerNotes, 60) ? slidePlan.speakerNotes || sourceSlide.speakerNotes : fallbackSpeakerNotes(sourceSlide, slidePlan)
  };
}

export function buildVisualPresentationPlan(deck: any, options: BuildVisualPresentationPlanOptions = {}): DeckVisualPlan {
  const theme = options.theme || (deck?.style === "teaching" ? "teaching_clean" : deck?.style === "business" ? "business_report" : "academic_paper");
  const slides = Array.isArray(deck?.slides) ? (deck.slides as PresentationSlide[]) : [];

  return {
    theme,
    slides: slides.map((slide, slideIndex) => {
      const layout = inferVisualLayout(slide);
      return enrichVisualPlanSlide({
        slideIndex,
        layout,
        theme,
        blocks: buildBlocksForLayout(slide, slideIndex, layout),
        speakerNotes: slide.speakerNotes
      }, slide);
    })
  };
}
