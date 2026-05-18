"use client";

import { Check, Clock3, History, Loader2, Trash2, Video, X } from "lucide-react";

import { VideoTask } from "@/components/video-generation/video-data";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { getVideoModelDisplayName } from "@/lib/video/config";

const LEGACY_COMPLETED_STATUS = "\u5bb8\u63d2\u756c";
const LEGACY_FAILED_STATUS = "\u6fb6\u8fab\u89e6";

export function VideoHistoryPanel({
  tasks,
  activeTaskId,
  onDelete,
  onSelect
}: {
  tasks: VideoTask[];
  activeTaskId: string | null;
  onDelete?: (task: VideoTask) => void;
  onSelect: (task: VideoTask) => void;
}) {
  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden p-4">
      <div className="mb-4 flex shrink-0 items-center gap-2">
        <History className="h-4 w-4 text-[var(--color-text-muted)]" />
        <div>
          <h2 className="text-base font-medium text-[var(--color-text)]">历史记录</h2>
          <p className="mt-1 text-xs text-[var(--color-text-faint)]">当前账号的视频生成任务</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {tasks.length ? (
          <div className="grid gap-2">
            {tasks.map((task) => {
              const active = task.taskId === activeTaskId;
              const failed = isVideoFailed(task.status);
              const processing = isVideoProcessing(task.status);

              return (
                <button
                  key={task.taskId}
                  type="button"
                  onClick={() => onSelect(task)}
                  className={cn(
                    "h-[116px] overflow-hidden rounded-lg border p-3 text-left transition",
                    active
                      ? "border-[color:var(--color-border-strong)] bg-[var(--color-soft)]"
                      : "border-[color:var(--color-border)] hover:bg-[var(--color-hover)]"
                  )}
                >
                  <div className="flex h-full gap-3">
                    <VideoThumbnail task={task} />
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
                            aria-label="删除视频历史记录"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 min-h-[40px] text-xs leading-5 text-[var(--color-text-muted)]">
                        {failed ? task.errorMessage || "视频生成失败，请稍后重试。" : task.prompt}
                      </p>
                      <div className="mt-auto flex h-6 items-center gap-2 overflow-hidden text-xs text-[var(--color-text-faint)]">
                        <StatusPill status={task.status} />
                        <span className="shrink-0">{task.duration}</span>
                        <span className="shrink-0">{task.ratio}</span>
                        <span className="shrink-0">{task.resolution}</span>
                        <span className="truncate">{getVideoModelDisplayName(task.model)}</span>
                        {processing ? <span className="truncate text-sky-600">正在生成</span> : null}
                        <span className="ml-auto inline-flex shrink-0 items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" />
                          {new Date(task.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={Video} title="暂无视频生成记录" description="提交视频生成后，任务会显示在这里。" className="py-16" />
        )}
      </div>
    </Card>
  );
}

function VideoThumbnail({ task }: { task: VideoTask }) {
  const failed = isVideoFailed(task.status);
  const processing = isVideoProcessing(task.status);

  return (
    <div className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] text-[var(--color-text-muted)]">
      {task.coverUrl || task.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={task.coverUrl || task.imageUrl || ""} alt={task.title} className="h-full w-full object-cover" />
      ) : processing ? (
        <div className="grid place-items-center gap-1 text-sky-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-[10px]">生成中</span>
        </div>
      ) : failed ? (
        <div className="grid place-items-center gap-1 text-red-600">
          <X className="h-5 w-5" />
          <span className="text-[10px]">失败</span>
        </div>
      ) : (
        <Video className="h-5 w-5" />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: VideoTask["status"] }) {
  const isCompleted = isVideoCompleted(status);
  const isFailed = isVideoFailed(status);
  const Icon = isCompleted ? Check : isFailed ? X : Loader2;
  const label = isCompleted ? "已完成" : isFailed ? "失败" : "生成中";

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

function isVideoCompleted(status: VideoTask["status"]) {
  const value = String(status);
  return value.includes("已完成") || value.includes(LEGACY_COMPLETED_STATUS);
}

function isVideoFailed(status: VideoTask["status"]) {
  const value = String(status);
  return value.includes("失败") || value.includes(LEGACY_FAILED_STATUS);
}

function isVideoProcessing(status: VideoTask["status"]) {
  return !isVideoCompleted(status) && !isVideoFailed(status);
}
