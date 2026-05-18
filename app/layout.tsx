import type { Metadata } from "next";
import { ReactNode } from "react";

import "@/app/globals.css";
import { THEME_STORAGE_KEY } from "@/components/theme/theme-constants";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "NexusAI 创作平台",
  description: "一个统一的 AI 对话、图片与视频生成工作台",
  icons: {
    apple: "/favicon.png",
    icon: "/favicon.png",
    shortcut: "/favicon.png"
  }
};

const themeInitScript = `
(function() {
  try {
    var key = "${THEME_STORAGE_KEY}";
    var mode = localStorage.getItem(key) || "dark";
    if (mode !== "dark" && mode !== "light" && mode !== "system") mode = "dark";
    var systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = mode === "system" ? (systemDark ? "dark" : "light") : mode;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (error) {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.colorScheme = "dark";
  }
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
