"use client";

import { useEffect, useState } from "react";
import { Check, Clock3, History, Image as ImageIcon, Loader2, Trash2, X } from "lucide-react";

import { ImageTask, ImageTaskStatus } from "@/components/image-generation/image-data";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getImageModelLabel } from "@/lib/image/config";

const LEGACY_COMPLETED_STATUS = "\u5bb8\u63d2\u756c";
const LEGACY_FAILED_STATUS = "\u6fb6\u8fab\u89e6";
const LEGACY_TIMEOUT_STATUS = "\u74d2\u546e\u6902";

export function ImageHistoryPanel({
  tasks,
  activeTaskId,
  loading = false,
  onDelete,
  onSelect
}: {
  tasks: ImageTask[];
  activeTaskId: string | null;
  loading?: boolean;
  onDelete?: (task: ImageTask) => void;
  onSelect: (task: ImageTask) => void;
}) {
  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden p-4">
      <div className="mb-4 flex shrink-0 items-center gap-2">
        <History className="h-4 w-4 text-[var(--color-text-muted)]" />
        <div>
          <h2 className="text-base font-medium text-[var(--color-text)]">历史记录</h2>
          <p className="mt-1 text-xs text-[var(--color-text-faint)]">成功和失败的图片任务都会保存在这里</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="grid gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-[116px] rounded-lg border border-[color:var(--color-border)] p-3">
                <div className="flex h-full gap-3">
                  <Skeleton className="h-20 w-20 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="mt-2 h-3 w-full" />
                    <Skeleton className="mt-2 h-3 w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : tasks.length ? (
          <div className="grid gap-2">
            {tasks.map((task) => {
              const active = task.taskId === activeTaskId;
              const thumb = task.images?.[0];
              const prompt = task.finalPrompt || task.prompt;
              const failed = isImageFailed(task.status);

              return (
                <button
                  key={task.taskId}
                  type="button"
                  onClick={() => onSelect(task)}
                  className={cn(
                    "h-[116px] overflow-hidden rounded-lg border p-3 text-left transition",
                    active ? "border-[color:var(--color-border-strong)] bg-[var(--color-soft)]" : "border-[color:var(--color-border)] hover:bg-[var(--color-hover)]"
                  )}
                >
                  <div className="flex h-full gap-3">
                    <HistoryThumbnail src={thumb} title={task.title} failed={failed} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex shrink-0 items-start gap-2">
                        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text)]">{task.title}</h3>
                        {onDelete ? (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              onDelete(task);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                onDelete(task);
                              }
                            }}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[var(--color-text-faint)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
                            aria-label="删除历史记录"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 min-h-[40px] text-xs leading-5 text-[var(--color-text-muted)]">
                        {failed ? task.failureReason || task.prompt : prompt}
                      </p>
                      <div className="mt-auto flex h-6 items-center gap-2 overflow-hidden text-xs text-[var(--color-text-faint)]">
                        <StatusPill status={task.status} />
                        <span className="shrink-0">{task.mode === "image-to-image" ? "图生图" : "文生图"}</span>
                        <span className="shrink-0">{task.ratio}</span>
                        <span className="shrink-0">{task.resolution || "1K"}</span>
                        <span className="truncate">{getImageModelLabel(task.model)}</span>
                        <span className="ml-auto inline-flex shrink-0 items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" />
                          {task.updatedAt}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={History} title="暂无历史记录" description="生成图片后，任务会按当前用户保存在这里。" className="py-16" />
        )}
      </div>
    </Card>
  );
}

function HistoryThumbnail({ src, title, failed }: { src?: string; title: string; failed: boolean }) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  return (
    <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] text-[var(--color-text-muted)]">
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={title} className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <div className="grid h-full w-full place-items-center px-1 text-center">
          <ImageIcon className="h-5 w-5" />
          {failed || broken ? <span className="mt-1 block text-[10px] leading-3">{failed ? "失败" : "失效"}</span> : null}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: ImageTaskStatus | string }) {
  const isCompleted = isImageCompleted(status);
  const isFailed = isImageFailed(status);
  const Icon = isCompleted ? Check : isFailed ? X : Loader2;
  const label = isCompleted ? "已完成" : isFailed ? (isImageTimeout(status) ? "超时" : "失败") : "生成中";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-4",
        isCompleted && "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
        isFailed && "border-red-500/30 bg-red-500/10 text-red-600",
        !isCompleted && !isFailed && "border-sky-500/30 bg-sky-500/10 text-sky-600"
      )}
    >
      <Icon className={cn("h-3 w-3", !isCompleted && !isFailed && "animate-spin")} />
      {label}
    </span>
  );
}

function isImageCompleted(status: ImageTaskStatus | string) {
  const value = String(status);
  return value.includes("已完成") || value.includes(LEGACY_COMPLETED_STATUS);
}

function isImageFailed(status: ImageTaskStatus | string) {
  const value = String(status);
  return value.includes("失败") || value.includes("超时") || value.includes(LEGACY_FAILED_STATUS) || value.includes(LEGACY_TIMEOUT_STATUS);
}

function isImageTimeout(status: ImageTaskStatus | string) {
  const value = String(status);
  return value.includes("超时") || value.includes(LEGACY_TIMEOUT_STATUS);
}
