"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type TeachingArchitectureEditDraft = {
  label: string;
  value: string;
  maxChars: number;
  position: {
    x: number;
    y: number;
  };
};

export function TeachingArchitectureTextEditPopover({
  draft,
  onCancel,
  onConfirm
}: {
  draft: TeachingArchitectureEditDraft;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(draft.value);
  const length = Array.from(value.trim()).length;
  const isTooLong = length > draft.maxChars;
  const isEmpty = !value.trim();

  useEffect(() => {
    setValue(draft.value);
  }, [draft]);

  return (
    <div
      className="fixed z-50 w-80 rounded-lg border border-[color:var(--color-border-strong)] bg-[var(--color-panel)] p-3 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
      style={{
        left: draft.position.x + 12,
        top: draft.position.y + 12
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--color-text)]">{draft.label}</p>
        <p className={isTooLong ? "text-xs text-[var(--color-danger)]" : "text-xs text-[var(--color-text-faint)]"}>
          {length}/{draft.maxChars}
        </p>
      </div>
      <Input
        autoFocus
        className="mt-3"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !isTooLong && !isEmpty) onConfirm(value);
          if (event.key === "Escape") onCancel();
        }}
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          取消
        </Button>
        <Button type="button" size="sm" variant="primary" disabled={isTooLong || isEmpty} onClick={() => onConfirm(value)}>
          确认
        </Button>
      </div>
    </div>
  );
}
