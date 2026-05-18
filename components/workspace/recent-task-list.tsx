import { CheckCircle2, Image, Loader2, Video, XCircle } from "lucide-react";
import Link from "next/link";

import type { DashboardStats } from "@/lib/dashboard-stats";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

function getVideoStatusMeta(status: string) {
  const normalized = status.toLowerCase();
  if (["completed", "success", "succeeded", "已完成", "成功"].includes(normalized)) {
    return { label: "成功", icon: CheckCircle2, className: "text-emerald-600" };
  }
  if (["failed", "error", "失败"].includes(normalized)) {
    return { label: "失败", icon: XCircle, className: "text-red-500" };
  }
  return { label: "生成中", icon: Loader2, className: "text-blue-500", spin: true };
}

export function RecentTaskList({ stats }: { stats: DashboardStats | null }) {
  return (
    <div className="grid gap-4">
      <Card className="p-5">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-[var(--color-text)]">最近图片</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              展示当前账号最近生成的图片记录。
            </p>
          </div>
          <Link href="/history">
            <Button variant="ghost" size="sm">
              查看全部
            </Button>
          </Link>
        </div>

        {stats?.recentImages?.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {stats.recentImages.map((item) => (
              <Link
                key={item.id}
                href="/history"
                className="group grid h-[236px] overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] transition hover:border-[color:var(--color-border-strong)] hover:bg-[var(--color-hover)]"
              >
                <div className="h-32 overflow-hidden bg-[var(--color-panel)]">
                  {item.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.thumbnailUrl} alt={item.title} className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-[var(--color-text-muted)]">
                      <Image className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="flex min-h-0 flex-col p-3">
                  <p className="truncate text-sm font-medium text-[var(--color-text)]">{item.title}</p>
                  <p className="mt-1 line-clamp-1 text-xs leading-5 text-[var(--color-text-muted)]">{item.prompt}</p>
                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-[color:var(--color-border)] pt-3 text-xs text-[var(--color-text-faint)]">
                    <span className="truncate">{item.model}</span>
                    <span className="shrink-0">{item.createdAt}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Image}
            title="暂无最近生成图片"
            description="生成图片后会显示在这里。"
            className="py-10"
          />
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-[var(--color-text)]">最近视频</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              展示当前账号最近提交的视频生成记录。
            </p>
          </div>
          <Link href="/video">
            <Button variant="ghost" size="sm">
              进入视频生成
            </Button>
          </Link>
        </div>

        {stats?.recentVideos?.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {stats.recentVideos.map((item) => {
              const status = getVideoStatusMeta(item.status);
              const StatusIcon = status.icon;
              return (
                <Link
                  key={item.id}
                  href={`/video?taskId=${encodeURIComponent(item.id)}`}
                  className="group flex h-[148px] gap-3 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-3 transition hover:border-[color:var(--color-border-strong)] hover:bg-[var(--color-hover)]"
                >
                  <div className="relative grid h-full w-28 shrink-0 place-items-center overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text-muted)]">
                    {item.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.thumbnailUrl} alt={item.title} className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
                    ) : (
                      <Video className="h-5 w-5" />
                    )}
                    <span className="absolute bottom-2 left-2 rounded-md bg-[var(--color-panel)]/88 px-1.5 py-1 text-[10px] text-[var(--color-text-muted)] shadow-soft">
                      720P
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="truncate text-sm font-medium text-[var(--color-text)]">{item.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-text-muted)]">{item.prompt}</p>
                    <div className="mt-auto flex items-center justify-between gap-3 border-t border-[color:var(--color-border)] pt-3 text-xs">
                      <span className="truncate text-[var(--color-text-faint)]">{item.model}</span>
                      <span className={`inline-flex shrink-0 items-center gap-1 ${status.className}`}>
                        <StatusIcon className={`h-3.5 w-3.5 ${status.spin ? "animate-spin" : ""}`} />
                        {status.label}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Video}
            title="暂无最近视频生成"
            description="提交视频任务后会显示在这里。"
            className="py-10"
          />
        )}
      </Card>
    </div>
  );
}
