import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
  action
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn("grid place-items-center px-6 py-14 text-center", className)}>
      <div className="grid max-w-sm place-items-center">
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] text-[var(--color-text-muted)]">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-base font-medium text-[var(--color-text)]">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}
