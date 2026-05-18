import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SmartToolDefinition } from "@/components/smart-tools/smart-tools-data";

export function SmartToolCard({ tool }: { tool: SmartToolDefinition }) {
  const Icon = tool.icon;

  return (
    <Link
      href={tool.href}
      className="group flex min-h-[176px] flex-col justify-between rounded-xl border border-[color:var(--color-border)] bg-[var(--color-bg)] p-5 text-left transition hover:-translate-y-0.5 hover:border-[color:var(--color-border-strong)] hover:shadow-[var(--shadow-panel)]"
    >
      <span className="flex items-start justify-between gap-4">
        <span className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br", tool.accent)}>
          <Icon className="h-6 w-6" />
        </span>
        <Badge>{tool.status}</Badge>
      </span>

      <span className="mt-5 block min-w-0">
        <span className="block text-base font-semibold text-[var(--color-text)]">{tool.name}</span>
        <span className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--color-text-muted)]">{tool.summary}</span>
      </span>

      <span className="mt-5 inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 text-sm font-medium text-[var(--color-text)] transition group-hover:border-[color:var(--color-border-strong)] group-hover:bg-[var(--color-hover)]">
        进入工具
        <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}
