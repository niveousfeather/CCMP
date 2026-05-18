"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { ThemeMode, useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";

const order: ThemeMode[] = ["dark", "light", "system"];

const labels: Record<ThemeMode, string> = {
  dark: "深色模式",
  light: "浅色模式",
  system: "跟随系统"
};

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const nextMode = order[(order.indexOf(mode) + 1) % order.length];
  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setMode(nextMode)}
      title={`当前：${labels[mode]}，点击切换到${labels[nextMode]}`}
      aria-label={`切换主题，当前为${labels[mode]}`}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
