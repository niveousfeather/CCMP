"use client";

import { memo, useCallback } from "react";
import { CheckCircle2, Circle, FileUp, Loader2, Trash2, XCircle } from "lucide-react";
import type { ChangeEvent, KeyboardEvent, MouseEvent } from "react";

import { Card } from "@/components/ui/card";
import {
  ACADEMIC_PPT_RECENT_TASK_LIMIT,
  formatAcademicPptFileSize,
  inferAcademicPptFileType,
  initialAcademicPptPipeline
} from "@/lib/smart-tools/academic-ppt/task-api";
import type {
  AcademicPptPipelineStep,
  AcademicPptRecentTask,
  AcademicPptSourceFile,
  AcademicPptTaskStatus
} from "@/lib/smart-tools/academic-ppt/types";
import { cn } from "@/lib/utils";

function getStepIcon(status: AcademicPptPipelineStep["status"]) {
  if (status === "success") return CheckCircle2;
  if (status === "running") return Loader2;
  if (status === "failed") return XCircle;
  return Circle;
}

function getStatusText(status: AcademicPptTaskStatus) {
  const map: Record<AcademicPptTaskStatus, string> = {
    idle: "未开始",
    queued: "排队中",
    pending: "排队中",
    running: "生成中",
    success: "已完成",
    failed: "失败",
    cancelled: "已取消",
    missing: "不存在"
  };
  return map[status];
}

export const AcademicPptSourcePanel = memo(function AcademicPptSourcePanel({
  file,
  pipeline = initialAcademicPptPipeline,
  recentTasks = [],
  activeTaskId,
  onFileChange,
  onRecentTaskDismiss,
  onRecentTaskSelect
}: {
  file: AcademicPptSourceFile | null;
  pipeline?: AcademicPptPipelineStep[];
  recentTasks?: AcademicPptRecentTask[];
  activeTaskId?: string | null;
  onFileChange: (file: AcademicPptSourceFile | null, rawFile?: File) => void;
  onRecentTaskDismiss: (taskId: string) => void;
  onRecentTaskSelect: (taskId: string) => void;
}) {
  const handleFileInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selected = event.target.files?.[0] || null;
      if (!selected) return;
      onFileChange(
        {
          name: selected.name,
          sizeBytes: selected.size,
          type: inferAcademicPptFileType(selected.name),
          status: "ready"
        },
        selected
      );
    },
    [onFileChange]
  );
  const visibleRecentTasks = recentTasks.slice(0, ACADEMIC_PPT_RECENT_TASK_LIMIT);

  return (
    <aside className="grid min-h-0 w-full min-w-0 max-w-full content-start gap-2 overflow-hidden overflow-y-auto pr-1">
      <Card className="box-border w-full max-w-full overflow-hidden p-2.5">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">上传论文或资料</h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">.tex / .txt / .md / .pptx / .pdf</p>
          </div>
        </div>

        <label className="mt-2.5 flex w-full min-w-0 max-w-full cursor-pointer items-center gap-2 overflow-hidden rounded-lg border border-dashed border-blue-200 bg-gradient-to-br from-blue-50/70 to-white/50 px-2.5 py-2.5 transition hover:border-blue-300">
          <FileUp className="h-4 w-4 shrink-0 text-blue-600" />
          <span className="min-w-0 flex-1 overflow-hidden">
            <span className="block text-xs font-medium text-[var(--color-text)]">选择文件</span>
            <span className="mt-0.5 block truncate text-[11px] text-[var(--color-text-muted)]">
              支持 PDF、TXT、Markdown、PPTX 等资料
            </span>
          </span>
          <input className="sr-only" type="file" accept=".pdf,.ppt,.pptx,.tex,.txt,.md,.markdown" onChange={handleFileInput} />
        </label>

        {file ? (
          <div className="mt-3 box-border w-full max-w-full overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-2">
            <p className="truncate text-xs font-medium text-[var(--color-text)]">{file.name}</p>
            <div className="mt-1 flex min-w-0 max-w-full items-center gap-2 overflow-hidden text-[11px] text-[var(--color-text-muted)]">
              <span className="shrink-0">{file.type}</span>
              <span className="shrink-0">{formatAcademicPptFileSize(file.sizeBytes)}</span>
              <span className="min-w-0 truncate">{file.status === "ready" ? "已选择" : file.status}</span>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="box-border w-full max-w-full overflow-hidden p-2.5">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">流程监控</h2>
        <div className="mt-2.5 grid gap-1">
          {pipeline.map((step) => {
            const Icon = getStepIcon(step.status);
            return (
              <div key={step.id} className="flex h-7 items-center gap-2">
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-full border",
                    step.status === "success" && "border-emerald-200 bg-emerald-50 text-emerald-600",
                    step.status === "running" && "border-blue-200 bg-blue-50 text-blue-600",
                    step.status === "failed" && "border-red-200 bg-red-50 text-red-600",
                    step.status === "waiting" &&
                      "border-[color:var(--color-border)] bg-[var(--color-soft)] text-[var(--color-text-faint)]"
                  )}
                >
                  <Icon className={cn("h-2.5 w-2.5", step.status === "running" && "animate-spin")} />
                </span>
                <span className="text-xs text-[var(--color-text)]">{step.label}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="box-border w-full max-w-full overflow-hidden p-2.5">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">最近任务</h2>
        {visibleRecentTasks.length ? (
          <div className="mt-2.5 grid gap-1.5">
            {visibleRecentTasks.map((task) => (
              <div
                key={task.taskId}
                role="button"
                tabIndex={0}
                onClick={() => onRecentTaskSelect(task.taskId)}
                onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onRecentTaskSelect(task.taskId);
                  }
                }}
                className={cn(
                  "group box-border w-full max-w-full cursor-pointer overflow-hidden rounded-lg border bg-[var(--color-soft)] p-1.5 text-left transition hover:border-blue-200 hover:bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-100",
                  activeTaskId === task.taskId ? "border-blue-300 ring-1 ring-blue-100" : "border-[color:var(--color-border)]"
                )}
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--color-text)]">{task.sourceFileName}</p>
                  <button
                    type="button"
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[var(--color-text-faint)] opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-100 group-hover:opacity-100 group-focus-within:opacity-100"
                    aria-label={`从最近任务隐藏 ${task.sourceFileName}`}
                    title="从最近任务隐藏"
                    onClick={(event: MouseEvent<HTMLButtonElement>) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onRecentTaskDismiss(task.taskId);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-[11px] text-[var(--color-text-muted)]">
                  <span className="min-w-0 truncate">
                    {getStatusText(task.status)} · {task.slideCount ?? "-"} 页
                  </span>
                  <span className="shrink-0">{formatRecentTaskTime(task.completedAt || task.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-[color:var(--color-border)] p-3 text-xs text-[var(--color-text-muted)]">
            暂无生成记录
          </p>
        )}
      </Card>
    </aside>
  );
});

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
