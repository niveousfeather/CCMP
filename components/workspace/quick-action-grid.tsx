import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { quickActions } from "@/components/workspace/workspace-data";
import { cn } from "@/lib/utils";

export function QuickActionGrid({ isAdmin }: { isAdmin: boolean }) {
  const visibleActions = quickActions.filter((action) => isAdmin || !action.adminOnly);

  return (
    <Card className="p-5">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-medium text-[var(--color-text)]">快捷入口</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">把常用能力放到同一排，直接进入下一步工作。</p>
        </div>
        <span className="text-xs text-[var(--color-text-faint)]">共 {visibleActions.length} 个入口</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visibleActions.map((action) => {
          const Icon = action.icon;
          const disabled = action.adminOnly && !isAdmin;
          const content = (
            <div
              className={cn(
                "group flex h-36 flex-col justify-between rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-4 transition hover:-translate-y-0.5 hover:border-[color:var(--color-border-strong)] hover:bg-[var(--color-hover)]",
                disabled && "cursor-not-allowed opacity-55 hover:border-[color:var(--color-border)] hover:bg-[var(--color-soft)]"
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="grid h-10 w-10 place-items-center rounded-lg border border-[color:var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text-muted)]">
                  <Icon className="h-5 w-5" />
                </div>
                {disabled ? <Lock className="h-4 w-4 text-[var(--color-text-faint)]" /> : null}
              </div>
              <div>
                <h3 className="truncate text-base font-medium text-[var(--color-text)]">{action.title}</h3>
                <p className="mt-1 line-clamp-1 text-sm leading-6 text-[var(--color-text-muted)]">
                  {disabled ? "仅管理员可进入用户管理。" : action.description}
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-[color:var(--color-border)] pt-3 text-xs">
                <span className="text-[var(--color-text-faint)]">{disabled ? "需要管理员" : action.actionLabel}</span>
                <ArrowRight className="h-3.5 w-3.5 text-[var(--color-text-faint)] transition group-hover:translate-x-0.5 group-hover:text-[var(--color-text)]" />
              </div>
            </div>
          );

          return disabled ? (
            <div key={action.id}>{content}</div>
          ) : (
            <Link key={action.id} href={action.href}>
              {content}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
