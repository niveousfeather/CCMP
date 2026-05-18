"use client";

import { models } from "@/components/chat/chat-data";

export function ChatModelSelector({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 text-sm text-[var(--color-text)] outline-none focus:border-[color:var(--color-border-strong)]"
    >
      {models.map((model) => (
        <option key={model} value={model}>
          {model}
        </option>
      ))}
    </select>
  );
}
