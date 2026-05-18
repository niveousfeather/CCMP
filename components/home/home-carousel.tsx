"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

const carouselImages = [
  "/home-carousel/slide-1.png",
  "/home-carousel/slide-2.png",
  "/home-carousel/slide-3.png",
  "/home-carousel/slide-4.png",
  "/home-carousel/slide-5.png"
] as const;

export function HomeCarousel({ showControls = true, variant = "stage" }: { showControls?: boolean; variant?: "stage" | "hero" } = {}) {
  const images = useMemo(() => carouselImages.filter(Boolean), []);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => getWrappedIndex(current + 1, images.length));
    }, 4600);
    return () => window.clearInterval(timer);
  }, [images.length]);

  if (!images.length) return null;

  const previousIndex = getWrappedIndex(activeIndex - 1, images.length);
  const nextIndex = getWrappedIndex(activeIndex + 1, images.length);
  const hasSidePreview = images.length > 1;

  const heroVariant = variant === "hero";

  return (
    <div className={cn("mx-auto w-full", heroVariant ? "h-full" : "mb-10 max-w-6xl")}>
      <div className={cn("relative flex items-center justify-center overflow-hidden", heroVariant ? "h-full min-h-[420px]" : "h-[220px] sm:h-[280px] lg:h-[340px]")}>
        {hasSidePreview && showControls ? (
          <>
            <PreviewImage src={images[previousIndex]} side="left" compact={heroVariant} />
            <PreviewImage src={images[nextIndex]} side="right" compact={heroVariant} />
          </>
        ) : null}

        <div className={cn("relative z-10 overflow-hidden", heroVariant ? "h-full min-h-[390px] w-full rounded-[2rem]" : "h-[190px] w-[88%] rounded-2xl border border-[color:var(--color-border-strong)] bg-[var(--color-panel)] shadow-soft sm:h-[250px] lg:h-[320px] lg:w-[76%]")}>
          {images.map((src, index) => (
            <img
              key={src}
              src={src}
              alt=""
              className={cn(
                "absolute inset-0 h-full w-full object-cover transition-all duration-700",
                index === activeIndex ? "scale-100 opacity-100" : "scale-105 opacity-0"
              )}
            />
          ))}
          <div className={cn("pointer-events-none absolute inset-0", heroVariant ? "bg-gradient-to-t from-black/14 via-transparent to-white/5" : "bg-gradient-to-t from-black/24 via-transparent to-white/10")} />
        </div>

        {hasSidePreview && showControls ? (
          <>
            <button
              type="button"
              aria-label="上一张"
              onClick={() => setActiveIndex(previousIndex)}
              className={cn("absolute z-20 grid h-10 w-10 place-items-center rounded-full border border-[color:var(--color-border)] bg-white/80 text-slate-700 shadow-soft backdrop-blur transition hover:bg-white", heroVariant ? "left-4" : "left-2 sm:left-6")}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="下一张"
              onClick={() => setActiveIndex(nextIndex)}
              className={cn("absolute z-20 grid h-10 w-10 place-items-center rounded-full border border-[color:var(--color-border)] bg-white/80 text-slate-700 shadow-soft backdrop-blur transition hover:bg-white", heroVariant ? "right-4" : "right-2 sm:right-6")}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : null}
      </div>

      {hasSidePreview ? (
        <div className={cn("flex items-center justify-center gap-2", heroVariant ? "absolute bottom-5 left-0 right-0 z-20" : "mt-4")}>
          {images.map((src, index) => (
            <button
              key={src}
              type="button"
              aria-label={`切换到第 ${index + 1} 张轮播图`}
              onClick={() => setActiveIndex(index)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                index === activeIndex
                  ? "w-8 bg-[var(--color-text)]"
                  : "w-1.5 bg-[var(--color-text-faint)] hover:bg-[var(--color-text-muted)]"
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PreviewImage({ src, side, compact = false }: { src: string; side: "left" | "right"; compact?: boolean }) {
  return (
    <div
      className={cn(
        "absolute hidden h-[70%] w-[32%] overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-panel)] opacity-45 blur-[1.5px] transition md:block",
        compact && "opacity-20 blur-[2.5px]",
        side === "left" ? "left-0 -translate-x-2" : "right-0 translate-x-2"
      )}
    >
      <img src={src} alt="" className="h-full w-full scale-105 object-cover" />
      <div className="absolute inset-0 bg-[var(--color-bg)]/28" />
    </div>
  );
}

function getWrappedIndex(index: number, length: number) {
  return (index + length) % length;
}
