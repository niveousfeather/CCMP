"use client";

import { CheckCircle2, Clock3, Loader2, RefreshCw, Trash2, XCircle } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";

import type { TeachingArchitectureTask, TeachingArchitectureTaskStatus } from "@/lib/smart-tools/teaching-architecture-diagram/types";
import { cn } from "@/lib/utils";

export function TeachingArchitectureHistoryPanel({
  activeTaskId,
  loading,
  tasks,
  onRefresh,
  onDeleteTask,
  onSelectTask
}: {
  activeTaskId?: string | null;
  loading: boolean;
  tasks: TeachingArchitectureTask[];
  onRefresh: () => void;
  onDeleteTask: (taskId: string) => void;
  onSelectTask: (taskId: string) => void;
}) {
  return (
    <aside className="absolute right-4 top-20 z-20 hidden w-52 min-w-0 md:block lg:right-6">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2 px-1">
        <p className="truncate text-xs font-semibold text-slate-500">历史记录</p>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 text-[11px] text-slate-400 transition hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
          onClick={onRefresh}
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          {loading ? "读取中" : "刷新"}
        </button>
      </div>

      <div className="relative max-h-[320px] min-w-0 overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-gradient-to-b from-[#f5f7fb] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-5 bg-gradient-to-t from-[#f5f7fb] to-transparent" />
        <div className="grid max-h-[320px] min-w-0 gap-1.5 overflow-y-auto overflow-x-hidden py-1 pr-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tasks.length ? (
            tasks.map((task) => (
              <HistoryItem
                key={task.taskId}
                active={activeTaskId === task.taskId}
                task={task}
                onDeleteTask={onDeleteTask}
                onSelectTask={onSelectTask}
              />
            ))
          ) : (
            <div className="min-w-0 rounded-xl bg-white/55 px-3 py-3 text-xs text-slate-400 shadow-sm backdrop-blur">
              暂无生成记录
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function HistoryItem({
  active,
  task,
  onDeleteTask,
  onSelectTask
}: {
  active: boolean;
  task: TeachingArchitectureTask;
  onDeleteTask: (taskId: string) => void;
  onSelectTask: (taskId: string) => void;
}) {
  const title = getTaskTitle(task);
  const status = getStatusMeta(task.status);
  const Icon = status.icon;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectTask(task.taskId);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "group relative min-w-0 overflow-hidden rounded-xl bg-white/66 px-2.5 py-2 pr-8 text-left shadow-sm backdrop-blur transition hover:bg-white/90 hover:shadow-[0_12px_34px_rgba(15,23,42,0.08)] focus:outline-none focus:ring-2 focus:ring-blue-100",
        active && "bg-white/95 ring-1 ring-blue-200"
      )}
      onClick={() => onSelectTask(task.taskId)}
      onKeyDown={handleKeyDown}
    >
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full", status.className)}>
          <Icon className={cn("h-3 w-3", task.status !== "completed" && task.status !== "failed" && "animate-spin")} />
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate text-xs font-semibold text-slate-700 group-hover:text-blue-700">{title}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {status.label} · {formatRecentTaskTime(task.completedAt || task.updatedAt || task.createdAt)}
          </p>
        </div>
      </div>

      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full transition-all", status.barClassName)}
          style={{ width: `${Math.min(Math.max(task.progress || 0, 0), 100)}%` }}
        />
      </div>

      <button
        type="button"
        className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
        aria-label={`删除 ${title}`}
        title="删除历史"
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          onDeleteTask(task.taskId);
        }}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function getTaskTitle(task: TeachingArchitectureTask) {
  const fileName = task.files?.[0]?.originalName;
  if (fileName) return fileName;
  const prompt = task.textPrompt?.replace(/\s+/g, " ").trim();
  if (prompt) return prompt.length > 24 ? `${prompt.slice(0, 24)}...` : prompt;
  return task.taskId.slice(0, 12);
}

function getStatusMeta(status: TeachingArchitectureTaskStatus): {
  label: string;
  icon: typeof CheckCircle2;
  className: string;
  barClassName: string;
} {
  if (status === "completed") {
    return {
      label: "已完成",
      icon: CheckCircle2,
      className: "bg-emerald-50 text-emerald-600",
      barClassName: "bg-emerald-500"
    };
  }
  if (status === "failed") {
    return {
      label: "失败",
      icon: XCircle,
      className: "bg-red-50 text-red-600",
      barClassName: "bg-red-400"
    };
  }
  if (status === "pending") {
    return {
      label: "排队中",
      icon: Clock3,
      className: "bg-slate-100 text-slate-500",
      barClassName: "bg-slate-400"
    };
  }
  return {
    label: "生成中",
    icon: Loader2,
    className: "bg-blue-50 text-blue-600",
    barClassName: "bg-blue-500"
  };
}

function formatRecentTaskTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
