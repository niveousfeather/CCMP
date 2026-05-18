import { Image, LucideIcon, MessageSquare, Users, Video } from "lucide-react";

import { Card } from "@/components/ui/card";

const icons: Record<string, LucideIcon> = {
  chat: MessageSquare,
  image: Image,
  video: Video,
  users: Users
};

export function MetricCard({
  id,
  label,
  value,
  change
}: {
  id: string;
  label: string;
  value: string;
  change: string;
}) {
  const Icon = icons[id] || MessageSquare;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--color-text-muted)]">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-[var(--color-text)]">{value}</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] text-[var(--color-text-muted)]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[color:var(--color-border)] pt-3">
        <span className="text-xs text-[var(--color-text-faint)]">统计口径</span>
        <span className="text-xs font-medium text-[var(--color-text)]">{change}</span>
      </div>
    </Card>
  );
}
