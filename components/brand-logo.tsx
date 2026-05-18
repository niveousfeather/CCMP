"use client";

import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  imageClassName,
  showText = true
}: {
  className?: string;
  imageClassName?: string;
  showText?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const src = resolvedTheme === "light" ? "/logo_b.png" : "/logo_w.png";

  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-[color:var(--color-border-strong)] bg-[var(--color-soft)] p-1.5">
        <img src={src} alt="NexusAI" className={cn("h-full w-full object-contain", imageClassName)} />
      </span>
      {showText ? (
        <span>
          <span className="block text-sm font-semibold tracking-[0.22em] text-[var(--color-text)]">NexusAI</span>
          <span className="block text-xs text-[var(--color-text-faint)]">AI 创作平台</span>
        </span>
      ) : null}
    </span>
  );
}
