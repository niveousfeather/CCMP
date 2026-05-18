import type { PresentationDeck } from "@/lib/presentation/types";

export type PresentationImageStrategy = "web_search_first" | "generated_visual" | "none";

export type PresentationImagePlanItem = {
  slideIndex: number;
  title: string;
  query?: string;
  strategy: PresentationImageStrategy;
  fallbackProvider?: "jimeng";
  reason: string;
};

export type PresentationImagePolicyReport = {
  providerPriority: Array<"web_search" | "jimeng">;
  plan: PresentationImagePlanItem[];
};

function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function buildPresentationImagePolicy(deck: PresentationDeck): PresentationImagePolicyReport {
  const plan = deck.slides.map((slide, slideIndex): PresentationImagePlanItem => {
    const query = clean(slide.imageQuery || slide.visualBrief || slide.title);
    if (slide.visualAsset) {
      return {
        slideIndex,
        title: slide.title,
        strategy: "none",
        reason: "Slide already has a resolved visual asset."
      };
    }

    if (slide.imageQuery || slide.visualBrief) {
      return {
        slideIndex,
        title: slide.title,
        query,
        strategy: "web_search_first",
        fallbackProvider: "jimeng",
        reason: "Slide requested a concrete visual, so search first and generate if needed."
      };
    }

    if (slide.layoutPreset === "academic_cover" || slide.layoutPreset === "teaching_cover" || slide.layoutPreset === "section_divider") {
      return {
        slideIndex,
        title: slide.title,
        query: `${query} presentation visual`,
        strategy: "web_search_first",
        fallbackProvider: "jimeng",
        reason: "Cover and section slides benefit from strong visual context."
      };
    }

    return {
      slideIndex,
      title: slide.title,
      strategy: "none",
      reason: "This preset can be rendered with shapes and typography."
    };
  });

  return {
    providerPriority: ["web_search", "jimeng"],
    plan
  };
}
