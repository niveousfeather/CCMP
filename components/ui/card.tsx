import { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[color:var(--color-border)] bg-[var(--color-panel)] p-5 shadow-soft backdrop-blur",
        className
      )}
      {...props}
    />
  );
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md border border-[color:var(--color-border)] bg-[var(--color-soft)] px-2 text-xs text-[var(--color-text-muted)]",
        className
      )}
      {...props}
    />
  );
}
