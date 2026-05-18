"use client";

import { memo } from "react";
import { ChevronLeft, ChevronRight, Columns3, Maximize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import {
  ACADEMIC_PPT_THUMBNAIL_RENDER_LIMIT,
  sampleAcademicPptSlides
} from "@/lib/smart-tools/academic-ppt/task-api";
import type {
  AcademicPptExtendedSlideLayout,
  AcademicPptIconDecoration,
  AcademicPptPreviewManifest,
  AcademicPptSlidePreview,
  AcademicPptVisualType
} from "@/lib/smart-tools/academic-ppt/types";
import { cn } from "@/lib/utils";

type PreviewTheme = {
  primary: string;
  accent: string;
  secondary: string;
  surface: string;
  text: string;
  muted: string;
};

const previewThemes: Record<string, PreviewTheme> = {
  academic_defense: {
    primary: "#003366",
    accent: "#0066CC",
    secondary: "#CC0000",
    surface: "#E8F4FC",
    text: "#1F2937",
    muted: "#64748B"
  },
  tech_blue_business: {
    primary: "#0078D7",
    accent: "#4CA1E7",
    secondary: "#E60012",
    surface: "#F5F8FC",
    text: "#1F2937",
    muted: "#64748B"
  },
  google_style: {
    primary: "#4285F4",
    accent: "#34A853",
    secondary: "#EA4335",
    surface: "#F8F9FA",
    text: "#1A237E",
    muted: "#5F6368"
  },
  mckinsey: {
    primary: "#005587",
    accent: "#0076A8",
    secondary: "#F5A623",
    surface: "#ECF0F1",
    text: "#2C3E50",
    muted: "#5D6D7E"
  },
  chongqing_university: {
    primary: "#006BB7",
    accent: "#3A9BD9",
    secondary: "#D4A84B",
    surface: "#E3F2FD",
    text: "#1A2E44",
    muted: "#6B7B8C"
  }
};

const defaultPreviewTheme = previewThemes.tech_blue_business;

function getTheme(slide?: AcademicPptSlidePreview): PreviewTheme {
  return (slide?.templateId && previewThemes[slide.templateId]) || defaultPreviewTheme;
}

function layoutLabel(layout?: AcademicPptExtendedSlideLayout) {
  const labels: Record<AcademicPptExtendedSlideLayout, string> = {
    agenda: "Agenda",
    architecture: "Architecture",
    chart: "Chart",
    compare: "Compare",
    content: "Content",
    cover: "Cover",
    ending: "Ending",
    experiment: "Experiment",
    flow: "Flow",
    formula: "Formula",
    method: "Method",
    result: "Result",
    section: "Section",
    summary: "Summary",
    table: "Table",
    timeline: "Timeline",
    two_column: "Two column"
  };
  return layout ? labels[layout] : "Preview";
}

function visualLabel(visualType?: AcademicPptVisualType) {
  const labels: Record<AcademicPptVisualType, string> = {
    architecture: "Architecture",
    chart: "Chart",
    comparison: "Comparison",
    flow: "Flow",
    formula: "Formula",
    kpi: "KPI",
    matrix: "Matrix",
    none: "Text",
    process: "Process",
    swot: "SWOT",
    table: "Table",
    timeline: "Timeline"
  };
  return visualType ? labels[visualType] : "Visual";
}

function compactText(value: string | undefined, fallback = "") {
  return (value || fallback).replace(/\s+/g, " ").trim();
}

function clampText(value: string | undefined, fallback = "", max = 120) {
  const text = compactText(value, fallback);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function getPreviewBullets(slide: AcademicPptSlidePreview, limit = 5) {
  return (slide.bullets || []).map((bullet) => compactText(bullet)).filter(Boolean).slice(0, limit);
}

function inferVisualType(layout?: AcademicPptExtendedSlideLayout): AcademicPptVisualType {
  if (layout === "chart" || layout === "result" || layout === "summary") return "kpi";
  if (layout === "table") return "table";
  if (layout === "formula") return "formula";
  if (layout === "architecture") return "architecture";
  if (layout === "flow" || layout === "method") return "flow";
  if (layout === "timeline") return "timeline";
  if (layout === "compare" || layout === "two_column") return "comparison";
  return "none";
}

function iconGlyph(kind: AcademicPptIconDecoration["kind"]) {
  const glyphs: Record<AcademicPptIconDecoration["kind"], string> = {
    arrow: "->",
    chart: "CH",
    check: "OK",
    clock: "T",
    compare: "<>",
    database: "DB",
    flask: "EX",
    formula: "fx",
    gear: "*",
    module: "M",
    node: "N",
    star: "*",
    table: "TB"
  };
  return glyphs[kind];
}

function iconColor(decoration: AcademicPptIconDecoration, theme: PreviewTheme) {
  if (decoration.tone === "accent") return theme.accent;
  if (decoration.tone === "secondary") return theme.secondary;
  return theme.primary;
}

function IconDecorations({ slide, compact = false }: { slide: AcademicPptSlidePreview; compact?: boolean }) {
  const theme = getTheme(slide);
  const decorations = (slide.iconDecorations || []).slice(0, compact ? 2 : 3);
  if (!decorations.length) return null;
  return (
    <div className="pointer-events-none absolute right-4 top-4 z-10 flex gap-2">
      {decorations.map((decoration, index) => {
        const color = iconColor(decoration, theme);
        return (
          <span
            key={`${decoration.kind}-${index}`}
            className={cn(
              "grid place-items-center rounded-full border bg-white/85 font-semibold shadow-sm",
              compact ? "h-5 w-5 text-[9px]" : "h-8 w-8 text-xs"
            )}
            style={{ borderColor: `${color}33`, color }}
            title={decoration.label}
          >
            {iconGlyph(decoration.kind)}
          </span>
        );
      })}
    </div>
  );
}

function ThumbnailSketch({ slide }: { slide: AcademicPptSlidePreview }) {
  const theme = getTheme(slide);
  const visualType = slide.visualType || inferVisualType(slide.layout);
  return (
    <span className="relative flex h-full w-full flex-col justify-between rounded-[inherit] bg-white p-2">
      <IconDecorations slide={slide} compact />
      <span>
        <span className="block h-2 w-1/2 rounded-full" style={{ backgroundColor: theme.primary }} />
        <span className="mt-1.5 block h-1.5 w-5/6 rounded-full bg-slate-200" />
        <span className="mt-1 block h-1.5 w-2/3 rounded-full bg-slate-200" />
      </span>
      {visualType === "chart" || visualType === "kpi" ? (
        <span className="grid grid-cols-3 items-end gap-1">
          {[18, 26, 12].map((height, index) => (
            <span
              key={index}
              className="rounded-t"
              style={{ height, backgroundColor: index === 0 ? theme.primary : theme.accent }}
            />
          ))}
        </span>
      ) : visualType === "flow" || visualType === "process" || visualType === "timeline" ? (
        <span className="grid grid-cols-4 items-center gap-1">
          {[0, 1, 2, 3].map((index) => (
            <span key={index} className="h-5 rounded-full" style={{ backgroundColor: index === 0 ? theme.primary : theme.surface }} />
          ))}
        </span>
      ) : (
        <span className="block h-7 rounded" style={{ backgroundColor: theme.surface }} />
      )}
    </span>
  );
}

function SlideHeader({ slide, compact = false }: { slide: AcademicPptSlidePreview; compact?: boolean }) {
  const theme = getTheme(slide);
  return (
    <div className="relative z-20 min-w-0">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-1.5 w-12 rounded-full" style={{ backgroundColor: theme.primary }} />
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: theme.accent }}>
          {layoutLabel(slide.layout)}
        </span>
      </div>
      <h3
        className={cn("line-clamp-2 font-semibold leading-tight", compact ? "text-2xl" : "text-4xl")}
        style={{ color: theme.text }}
      >
        {clampText(slide.title, "Untitled slide", compact ? 96 : 120)}
      </h3>
      {slide.subtitle ? (
        <p className={cn("mt-2 line-clamp-2 leading-relaxed", compact ? "text-sm" : "text-lg")} style={{ color: theme.muted }}>
          {clampText(slide.subtitle, "", 110)}
        </p>
      ) : null}
    </div>
  );
}

function BulletList({ slide, limit = 5, columns = 1 }: { slide: AcademicPptSlidePreview; limit?: number; columns?: 1 | 2 }) {
  const theme = getTheme(slide);
  const bullets = getPreviewBullets(slide, limit);
  if (!bullets.length) {
    return <p className="text-sm text-slate-400">结构化占位预览，最终排版以下载后的 PPTX 为准。</p>;
  }
  return (
    <ul className={cn("grid min-h-0 gap-3", columns === 2 && "grid-cols-2")}>
      {bullets.map((bullet, index) => (
        <li key={`${bullet}-${index}`} className="flex min-w-0 gap-3 rounded-xl border border-slate-200 bg-white/85 p-3 shadow-sm">
          <span
            className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
            style={{ backgroundColor: index % 2 === 0 ? theme.primary : theme.accent }}
          >
            {index + 1}
          </span>
          <span className="line-clamp-3 text-sm leading-relaxed text-slate-700">{bullet}</span>
        </li>
      ))}
    </ul>
  );
}

function VisualPanel({ slide }: { slide: AcademicPptSlidePreview }) {
  const theme = getTheme(slide);
  const visualType = slide.visualType || inferVisualType(slide.layout);
  const hint = clampText(slide.visualHint, slide.templateIntent || slide.emphasis || "Structured visual area", 110);
  return (
    <div className="relative min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: theme.primary }}>
          {visualLabel(visualType)}
        </span>
        <span className="h-2 w-16 rounded-full" style={{ backgroundColor: theme.surface }} />
      </div>
      <div className="mt-5 grid h-[calc(100%-3rem)] min-h-28 place-items-center rounded-xl" style={{ backgroundColor: theme.surface }}>
        {visualType === "chart" || visualType === "kpi" ? (
          <div className="flex h-32 w-52 items-end justify-center gap-3">
            {[45, 92, 68, 116].map((height, index) => (
              <span
                key={index}
                className="w-8 rounded-t-lg"
                style={{ height, backgroundColor: index % 2 ? theme.accent : theme.primary }}
              />
            ))}
          </div>
        ) : visualType === "flow" || visualType === "process" || visualType === "timeline" ? (
          <div className="grid w-full grid-cols-4 items-center gap-3 px-5">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="flex items-center gap-2">
                <span
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
                  style={{ backgroundColor: index % 2 ? theme.accent : theme.primary }}
                >
                  {index + 1}
                </span>
                {index < 3 ? <span className="h-0.5 flex-1" style={{ backgroundColor: theme.accent }} /> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid w-72 grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((index) => (
              <span
                key={index}
                className="h-16 rounded-xl border border-white/70 shadow-sm"
                style={{ backgroundColor: index % 2 ? theme.accent : theme.primary, opacity: index < 2 ? 0.92 : 0.62 }}
              />
            ))}
          </div>
        )}
      </div>
      <p className="mt-4 line-clamp-2 text-xs leading-relaxed text-slate-500">{hint}</p>
    </div>
  );
}

function CoverSlide({ slide }: { slide: AcademicPptSlidePreview }) {
  const theme = getTheme(slide);
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-[inherit] p-2">
      <IconDecorations slide={slide} />
      <div className="absolute inset-x-0 top-0 h-2" style={{ background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})` }} />
      <div className="max-w-3xl pt-16">
        <SlideHeader slide={slide} />
        <p className="mt-8 max-w-2xl text-lg leading-relaxed" style={{ color: theme.muted }}>
          {clampText(slide.templateIntent || slide.emphasis, "基于学术资料自动生成可编辑 PPTX。", 180)}
        </p>
      </div>
      <div className="grid grid-cols-[1fr_220px] items-end gap-8">
        <div className="h-24 rounded-2xl" style={{ background: `linear-gradient(135deg, ${theme.surface}, #fff)` }} />
        <div className="rounded-2xl p-5 text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}>
          <div className="text-xs uppercase opacity-80">Editable deck</div>
          <div className="mt-2 text-2xl font-semibold">PPTX</div>
        </div>
      </div>
    </div>
  );
}

function AgendaSlide({ slide }: { slide: AcademicPptSlidePreview }) {
  const theme = getTheme(slide);
  const bullets = getPreviewBullets(slide, 6);
  return (
    <div className="relative flex h-full flex-col">
      <SlideHeader slide={slide} compact />
      <div className="mt-6 grid min-h-0 flex-1 gap-3">
        {(bullets.length ? bullets : ["Research background", "Method design", "Experiments", "Findings", "Conclusion"]).map((item, index) => (
          <div key={`${item}-${index}`} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <span className="text-3xl font-semibold tabular-nums" style={{ color: index % 2 ? theme.accent : theme.primary }}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="line-clamp-2 text-base font-medium text-slate-700">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionSlide({ slide }: { slide: AcademicPptSlidePreview }) {
  const theme = getTheme(slide);
  return (
    <div className="relative grid h-full place-items-center overflow-hidden rounded-[inherit]" style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}>
      <div className="absolute -right-10 -top-14 text-[190px] font-black leading-none text-white/10">
        {String(slide.index || 1).padStart(2, "0")}
      </div>
      <div className="relative z-10 max-w-3xl text-center text-white">
        <div className="mx-auto mb-6 h-1.5 w-20 rounded-full bg-white/80" />
        <h3 className="line-clamp-3 text-5xl font-semibold leading-tight">{clampText(slide.title, "Section", 120)}</h3>
        {slide.subtitle ? <p className="mt-5 line-clamp-2 text-lg text-white/80">{clampText(slide.subtitle, "", 140)}</p> : null}
      </div>
    </div>
  );
}

function CompareSlide({ slide }: { slide: AcademicPptSlidePreview }) {
  return (
    <div className="relative flex h-full flex-col">
      <IconDecorations slide={slide} />
      <SlideHeader slide={slide} compact />
      <div className="mt-6 grid min-h-0 flex-1 grid-cols-2 gap-5">
        <BulletList slide={slide} columns={1} limit={3} />
        <VisualPanel slide={{ ...slide, visualType: slide.visualType || "comparison" }} />
      </div>
    </div>
  );
}

function TimelineSlide({ slide }: { slide: AcademicPptSlidePreview }) {
  return (
    <div className="relative flex h-full flex-col">
      <IconDecorations slide={slide} />
      <SlideHeader slide={slide} compact />
      <div className="mt-6 grid min-h-0 flex-1 grid-rows-[150px_minmax(0,1fr)] gap-4">
        <VisualPanel slide={{ ...slide, visualType: slide.visualType || "timeline" }} />
        <BulletList slide={slide} columns={2} limit={4} />
      </div>
    </div>
  );
}

function ResultSummarySlide({ slide }: { slide: AcademicPptSlidePreview }) {
  const theme = getTheme(slide);
  const emphasis = clampText(slide.emphasis, getPreviewBullets(slide)[0] || "Key takeaway", 120);
  return (
    <div className="relative flex h-full flex-col">
      <IconDecorations slide={slide} />
      <SlideHeader slide={slide} compact />
      <div className="mt-6 grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] gap-5">
        <div className="rounded-2xl p-6 text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}>
          <div className="text-xs font-medium uppercase opacity-80">Takeaway</div>
          <p className="mt-5 line-clamp-6 text-2xl font-semibold leading-snug">{emphasis}</p>
        </div>
        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_260px] gap-4">
          <BulletList slide={slide} />
          <VisualPanel slide={{ ...slide, visualType: slide.visualType || "kpi" }} />
        </div>
      </div>
    </div>
  );
}

function ContentSlide({ slide }: { slide: AcademicPptSlidePreview }) {
  const hasVisual =
    Boolean(slide.visualType && slide.visualType !== "none") ||
    ["method", "experiment", "result", "table", "formula", "chart", "architecture", "flow"].includes(slide.layout || "");
  return hasVisual ? (
    <div className="relative flex h-full flex-col">
      <IconDecorations slide={slide} />
      <SlideHeader slide={slide} compact />
      <div className="mt-6 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_330px] gap-5">
        <BulletList slide={slide} columns={slide.layout === "two_column" ? 2 : 1} />
        <VisualPanel slide={{ ...slide, visualType: slide.visualType || inferVisualType(slide.layout) }} />
      </div>
    </div>
  ) : (
    <div className="relative flex h-full flex-col">
      <IconDecorations slide={slide} />
      <SlideHeader slide={slide} compact />
      <div className="mt-7 min-h-0 flex-1">
        <BulletList slide={slide} columns={slide.layout === "two_column" ? 2 : 1} />
      </div>
    </div>
  );
}

function MainSlidePreview({ slide }: { slide: AcademicPptSlidePreview }) {
  if (slide.layout === "cover") return <CoverSlide slide={slide} />;
  if (slide.layout === "agenda") return <AgendaSlide slide={slide} />;
  if (slide.layout === "section" || slide.layout === "ending") return <SectionSlide slide={slide} />;
  if (slide.layout === "compare" || slide.layout === "two_column") return <CompareSlide slide={slide} />;
  if (slide.layout === "timeline" || slide.layout === "flow") return <TimelineSlide slide={slide} />;
  if (slide.layout === "result" || slide.layout === "summary") return <ResultSummarySlide slide={slide} />;
  return <ContentSlide slide={slide} />;
}

function getPreviewSlideUrl(slide: AcademicPptPreviewManifest["slides"][number] | undefined) {
  return slide ? slide.publicUrl || slide.url || slide.imageUrl : undefined;
}

export const AcademicPptPreviewCanvas = memo(function AcademicPptPreviewCanvas({
  activeSlideIndex,
  nativePreview,
  onNativePreviewError,
  slides = sampleAcademicPptSlides,
  onSelectSlideIndex
}: {
  activeSlideIndex: number;
  nativePreview?: AcademicPptPreviewManifest;
  onNativePreviewError?: () => void;
  slides?: AcademicPptSlidePreview[];
  onSelectSlideIndex: (slideIndex: number) => void;
}) {
  const previewSlides = nativePreview?.slides || [];
  const nativePreviewCount = nativePreview?.available ? previewSlides.length : 0;
  const shouldUseNativeSlideList = nativePreviewCount > 0;
  const safeSlides = shouldUseNativeSlideList
    ? Array.from({ length: nativePreviewCount }, (_, index) => {
        const existing = slides[index];
        return (
          existing || {
            id: `native-preview-${index + 1}`,
            index: index + 1,
            title: `Slide ${index + 1}`,
            layout: "content" as const,
            visualType: "none" as const,
            templateId: slides[0]?.templateId || "tech_blue_business",
            status: "ready" as const
          }
        );
      })
    : slides.length
      ? slides
      : sampleAcademicPptSlides;
  const activeIndex = Math.min(Math.max(activeSlideIndex, 0), Math.max(safeSlides.length - 1, 0));
  const activeSlide = safeSlides[activeIndex] || safeSlides[0];
  const useNativePreview = Boolean(
    nativePreview?.available &&
      (nativePreview.type === "image" || nativePreview.type === "svg") &&
      nativePreview.slides.length
  );
  const visibleSlides = safeSlides.slice(0, useNativePreview ? safeSlides.length : ACADEMIC_PPT_THUMBNAIL_RENDER_LIMIT);
  const previewModeLabel = useNativePreview
    ? nativePreview?.source === "native_preview"
      ? "Native PPTX preview"
      : "Real SVG preview"
    : "结构化占位预览";
  const activeNativeSlide = previewSlides.find((slide) => slide.index === activeIndex || slide.pageNumber === activeIndex + 1);
  const activePreviewUrl = getPreviewSlideUrl(activeNativeSlide);

  function selectOffset(offset: number) {
    onSelectSlideIndex(Math.min(Math.max(activeIndex + offset, 0), safeSlides.length - 1));
  }

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-cols-[230px_minmax(0,1fr)] gap-2 overflow-hidden">
      <Card className="min-h-0 w-[230px] min-w-[230px] max-w-[230px] overflow-hidden p-0">
        <div className="box-border flex h-full min-h-0 flex-col">
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-[color:var(--color-border)] px-3">
            <h2 className="text-xs font-semibold text-[var(--color-text)]">Slides</h2>
            <Badge className="h-5 px-1.5 text-[10px]">{safeSlides.length}</Badge>
          </div>

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 py-2">
            <div className="grid gap-2">
              {visibleSlides.map((slide, index) => {
                const selected = activeIndex === index;
                const nativeSlide = previewSlides.find((previewSlide) => previewSlide.index === index || previewSlide.pageNumber === index + 1);
                const nativeSlideUrl = getPreviewSlideUrl(nativeSlide);
                const pageNumber = nativeSlide?.pageNumber || index + 1;
                return (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => onSelectSlideIndex(index)}
                    className="box-border flex w-full items-start gap-2 rounded-lg px-1 py-1 text-left transition hover:bg-[var(--color-hover)]"
                    aria-label={`选择第 ${index + 1} 页`}
                  >
                    <span
                      className={cn(
                        "mt-1 flex h-6 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-medium",
                        selected ? "bg-blue-600" : "text-[var(--color-text-muted)]"
                      )}
                      style={selected ? { color: "#fff" } : undefined}
                    >
                      {pageNumber}
                    </span>
                    <span
                      className={cn(
                        "block aspect-[16/9] min-w-0 flex-1 overflow-hidden rounded-md border shadow-sm",
                        selected ? "border-blue-500 ring-2 ring-blue-100" : "border-[color:var(--color-border)]"
                      )}
                    >
                      {useNativePreview && nativeSlideUrl ? (
                        <img
                          src={nativeSlideUrl}
                          alt={`Slide ${pageNumber} preview`}
                          className="h-full w-full object-contain"
                          loading="lazy"
                          onError={onNativePreviewError}
                        />
                      ) : (
                        <ThumbnailSketch slide={slide} />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden p-0">
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[color:var(--color-border)] px-3">
          <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <Columns3 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{previewModeLabel}</span>
            <span className="hidden truncate text-[11px] text-[var(--color-text-faint)] sm:inline">最终排版以下载后的 PPTX 为准。</span>
            {!useNativePreview ? (
              <Badge className="h-5 border-amber-200 bg-amber-50 px-1.5 text-[10px] text-amber-700">
                占位
              </Badge>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => selectOffset(-1)}
              disabled={activeIndex <= 0}
              aria-label="Previous slide"
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-14 text-center text-xs text-[var(--color-text-muted)]">
              {activeIndex + 1} / {safeSlides.length}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => selectOffset(1)}
              disabled={activeIndex >= safeSlides.length - 1}
              aria-label="Next slide"
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled className="h-8 px-2 text-xs">
              <Maximize2 className="h-3.5 w-3.5" />
              适配
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[linear-gradient(135deg,rgba(59,130,246,0.08),transparent_34%),var(--color-bg)] p-3">
          {activeSlide ? (
            <div className="aspect-video w-full max-w-[1400px] rounded-xl border border-blue-100 bg-white p-8 shadow-[0_18px_60px_rgba(37,99,235,0.14)]">
              {useNativePreview && activePreviewUrl ? (
                <div className="grid h-full place-items-center">
                  <img
                    src={activePreviewUrl}
                    alt={`Slide ${activeNativeSlide?.pageNumber || activeIndex + 1} real preview`}
                    className="max-h-full max-w-full object-contain"
                    onError={onNativePreviewError}
                  />
                </div>
              ) : (
                <div className="relative h-full">
                  <div className="absolute right-0 top-0 z-30 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                    结构化占位预览
                  </div>
                  <MainSlidePreview slide={activeSlide} />
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[color:var(--color-border)] p-10 text-center text-sm text-[var(--color-text-muted)]">
              正在准备真实预览；最终排版以下载后的 PPTX 为准。
            </div>
          )}
        </div>
      </Card>
    </section>
  );
});
