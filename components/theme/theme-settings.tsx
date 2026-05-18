"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ThemeMode, useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";

const options: Array<{
  value: ThemeMode;
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  { value: "dark", title: "深色模式", description: "延续当前黑白高对比工作台风格", icon: Moon },
  { value: "light", title: "浅色模式", description: "浅灰背景、白色卡片，保持克制质感", icon: Sun },
  { value: "system", title: "跟随系统", description: "根据系统外观自动切换", icon: Monitor }
];

export function ThemeSettings() {
  const { mode, setMode } = useTheme();

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {options.map((option) => {
        const Icon = option.icon;
        const active = mode === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setMode(option.value)}
            className={cn(
              "rounded-lg border p-4 text-left transition",
              active
                ? "border-[color:var(--color-border-strong)] bg-[var(--color-soft)]"
                : "border-[color:var(--color-border)] bg-transparent hover:bg-[var(--color-soft)]"
            )}
          >
            <Icon className="mb-4 h-5 w-5 text-[var(--color-text-muted)]" />
            <p className="text-sm font-medium text-[var(--color-text)]">{option.title}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">{option.description}</p>
          </button>
        );
      })}
    </div>
  );
}
