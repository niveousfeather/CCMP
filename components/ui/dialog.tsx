"use client";

import { X } from "lucide-react";
import { ReactNode, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Dialog({
  open,
  title,
  children,
  onClose,
  className,
  showHeader = true
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  showHeader?: boolean;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[var(--color-overlay)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={cn(
          "max-h-[calc(100vh-32px)] w-full max-w-xl overflow-y-auto rounded-xl border border-[color:var(--color-border-strong)] bg-[var(--color-panel)] p-5 shadow-soft",
          className
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {showHeader ? (
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
