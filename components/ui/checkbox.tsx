import { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        "h-4 w-4 rounded border border-[color:var(--color-border-strong)] bg-[var(--color-soft)] accent-[var(--color-primary)] outline-none transition focus:ring-2 focus:ring-[color:var(--color-border-strong)]",
        className
      )}
      {...props}
    />
  );
}
