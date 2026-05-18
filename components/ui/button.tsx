import { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
};

export function Button({
  className,
  variant = "secondary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg border text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "border-[color:var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-text)] hover:opacity-90",
        variant === "secondary" &&
          "border-[color:var(--color-border)] bg-[var(--color-soft)] text-[var(--color-text)] hover:border-[color:var(--color-border-strong)] hover:bg-[var(--color-hover)]",
        variant === "ghost" &&
          "border-transparent bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]",
        variant === "danger" &&
          "border-red-400/30 bg-[var(--color-danger-bg)] text-[var(--color-danger)] hover:opacity-90",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4",
        size === "lg" && "h-12 px-5 text-[15px]",
        size === "icon" && "h-10 w-10 px-0",
        className
      )}
      {...props}
    />
  );
}
