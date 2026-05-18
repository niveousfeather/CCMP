import type { PresentationDeck, PresentationProviderOutput } from "@/lib/presentation/types";
import { createLocalPresentationProvider } from "@/lib/presentation/providers/local";
import { renderHtmlSlideDeck, type HtmlSlideDeck } from "@/lib/presentation/v2/html-slide";
import { buildPresentationImagePolicy, type PresentationImagePolicyReport } from "@/lib/presentation/v2/image-policy";
import {
  createPresentationPreviewArtifacts,
  type NativePreviewConverter,
  type PresentationPreviewOptions,
  type PresentationPreviewResult
} from "@/lib/presentation/v2/preview";
import { checkRasterPreviewImages, type RasterPreviewQaReport } from "@/lib/presentation/v2/raster-qa";
import { checkRenderedPresentationPptx, type RenderedPresentationQaReport } from "@/lib/presentation/v2/rendered-qa";
import { getPresentationThemeV2, type PresentationThemeV2 } from "@/lib/presentation/v2/themes";

export type PresentationArtifactV1Input = {
  deck: PresentationDeck;
  preview: PresentationPreviewOptions;
};

export type PresentationArtifactV1Result = {
  pptx: PresentationProviderOutput;
  html: HtmlSlideDeck;
  imagePolicy: PresentationImagePolicyReport;
  preview: PresentationPreviewResult;
  rasterQa: RasterPreviewQaReport;
  theme: PresentationThemeV2;
  visualQa: RenderedPresentationQaReport;
};

export async function preparePresentationArtifactV1(input: PresentationArtifactV1Input): Promise<PresentationArtifactV1Result> {
  const theme = getPresentationThemeV2(input.deck.style || "general");
  const html = renderHtmlSlideDeck(input.deck, theme);
  const imagePolicy = buildPresentationImagePolicy(input.deck);
  const provider = createLocalPresentationProvider();
  const pptx = await provider.generate({ deck: input.deck });
  const visualQa = checkRenderedPresentationPptx({
    buffer: pptx.buffer,
    expectedSlides: input.deck.slides.length,
    requireV2PresetMarkers: Boolean(input.deck.slides.some((slide) => slide.layoutPreset))
  });
  const preview = await createPresentationPreviewArtifacts({
    deck: input.deck,
    html,
    pptx: pptx.buffer,
    options: input.preview
  });
  const rasterQa = checkRasterPreviewImages(preview);

  return {
    pptx,
    html,
    imagePolicy,
    preview,
    rasterQa,
    theme,
    visualQa
  };
}

export { checkRasterPreviewImages, createPresentationPreviewArtifacts, type NativePreviewConverter };
