import type { PresentationDeck, PresentationSlide, PresentationStyle, PresentationThemeId } from "@/lib/presentation/types";
import { mapPresetToLegacySlideType, PRESENTATION_V2_DESIGN_SPECS, selectSlidePreset } from "@/lib/presentation/v2/presets";

export type PresentationPlanV2Input = {
  deck: PresentationDeck;
  request: string;
  title: string;
};

function normalizeText(value: unknown) {
  return String(value || "").toLowerCase();
}

export function selectPresentationStyle({ deck, request, title }: PresentationPlanV2Input): PresentationStyle {
  const text = normalizeText(`${request} ${title} ${deck.title} ${deck.subtitle || ""} ${deck.slides.map((slide) => `${slide.title} ${slide.subtitle || ""}`).join(" ")}`);
  if (/学术|论文|研究|实验|文献|答辩|paper|academic|research|thesis|defense|seminar/.test(text)) return "academic";
  if (/教学|上课|课堂|课程|课件|教案|老师|学生|练习|lesson|teaching|classroom|course|homework/.test(text)) return "teaching";
  if (/商业|汇报|产品|方案|市场|增长|融资|business|market|product|pitch|strategy/.test(text)) return "business";
  return "general";
}

function themeForStyle(style: PresentationStyle): PresentationThemeId {
  if (style === "academic") return "research_report";
  if (style === "teaching") return "clean_education";
  if (style === "business") return "modern_product";
  return "executive_dark";
}

function buildSpeakerNotes(slide: PresentationSlide, style: PresentationStyle) {
  const lead = style === "teaching" ? "讲解重点" : style === "academic" ? "汇报重点" : "表达重点";
  const points = slide.bullets?.slice(0, 3).join("；");
  return points ? `${lead}：${points}` : `${lead}：围绕“${slide.title}”展开说明。`;
}

function enrichSlide(slide: PresentationSlide, index: number, style: PresentationStyle): PresentationSlide {
  const layoutPreset = slide.layoutPreset || selectSlidePreset(slide, index, style);
  const type = mapPresetToLegacySlideType(layoutPreset, slide);
  const visualBrief =
    slide.visualBrief ||
    (layoutPreset === "academic_cover"
      ? `${slide.title} academic research presentation visual`
      : layoutPreset === "teaching_cover"
        ? `${slide.title} classroom teaching courseware visual`
        : slide.visualBrief);
  const imageQuery =
    slide.imageQuery ||
    (layoutPreset === "image_explanation" || layoutPreset === "academic_cover" || layoutPreset === "teaching_cover" || layoutPreset === "section_divider"
      ? visualBrief || `${slide.title} presentation visual`
      : undefined);

  return {
    ...slide,
    type,
    layoutPreset,
    visualBrief,
    imageQuery,
    speakerNotes: slide.speakerNotes || buildSpeakerNotes(slide, style)
  };
}

export function createPresentationPlanV2(input: PresentationPlanV2Input): PresentationDeck {
  const style = input.deck.style || selectPresentationStyle(input);
  const designSpec = input.deck.designSpec || PRESENTATION_V2_DESIGN_SPECS[style];
  const slides = input.deck.slides.map((slide, index) => enrichSlide(slide, index, style));

  return {
    ...input.deck,
    title: input.deck.title || input.title,
    style,
    theme: input.deck.theme || themeForStyle(style),
    designSpec,
    slides
  };
}
