"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Pause, Play, RotateCcw, Video, XCircle } from "lucide-react";

import { VideoTask, VideoTaskStatus } from "@/components/video-generation/video-data";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { getVideoModelDisplayName } from "@/lib/video/config";

const LEGACY_COMPLETED_STATUS = "\u5bb8\u63d2\u756c";
const LEGACY_FAILED_STATUS = "\u6fb6\u8fab\u89e6";

export function VideoPreviewPanel({
  task,
  playing,
  onTogglePlay,
  onDownload,
  onRetry
}: {
  task: VideoTask | null;
  playing: boolean;
  onTogglePlay: () => void;
  onDownload: (task: VideoTask) => void;
  onRetry?: () => void;
}) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const playerSrc = useMemo(
    () =>
      task?.videoUrl
        ? `/api/video/preview?taskId=${encodeURIComponent(task.taskId)}&url=${encodeURIComponent(task.videoUrl)}`
        : null,
    [task?.taskId, task?.videoUrl]
  );
  const downloadSrc = task?.videoUrl || null;

  useEffect(() => {
    setPreviewFailed(false);
  }, [task?.taskId, task?.videoUrl]);

  useEffect(() => {
    if (!task?.videoUrl) return;
    console.info("[video:player]", {
      taskId: task.taskId,
      playerSrc: playerSrc ? "/api/video/preview" : null,
      downloadSrc: "provider-or-signed-url",
      whetherSameSource: false
    });
  }, [downloadSrc, playerSrc, task?.taskId, task?.videoUrl]);

  return (
    <Card className="flex min-h-0 min-w-0 flex-1 flex-col p-5">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Badge>视频预览</Badge>
          <h1 className="mt-3 text-2xl font-semibold text-[var(--color-text)]">{task?.title || "视频生成"}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)]">
            {task?.prompt || "提交任务后，这里会展示视频状态与生成结果。"}
          </p>
        </div>
        {task ? (
          <div className="flex items-center gap-2">
            <StatusBadge status={task.status} />
            <Button type="button" variant="secondary" size="sm" disabled={!task.videoUrl} onClick={() => onDownload(task)}>
              <Download className="h-4 w-4" />
              下载
            </Button>
          </div>
        ) : null}
      </div>

      <div className="relative flex min-h-[360px] flex-1 items-center justify-center overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-neutral-950 p-0 md:min-h-[520px]">
        {task?.videoUrl && playerSrc && !previewFailed ? (
          <div className="relative flex h-full min-h-[360px] w-full items-center justify-center overflow-hidden bg-neutral-950 md:min-h-[520px]">
            <video
              key={playerSrc}
              src={playerSrc}
              poster={task.coverUrl || task.imageUrl || undefined}
              controls={playing}
              preload="metadata"
              playsInline
              className="h-full w-full bg-neutral-950 object-contain"
              onLoadedMetadata={() => setPreviewFailed(false)}
              onError={() => setPreviewFailed(true)}
            />
            {!playing ? (
              <button
                type="button"
                onClick={onTogglePlay}
                className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[color:var(--color-border-strong)] bg-[var(--color-panel)] text-[var(--color-text)] shadow-soft transition hover:bg-[var(--color-hover)]"
                aria-label="播放预览"
              >
                <Play className="ml-1 h-6 w-6" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onTogglePlay}
                className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-[color:var(--color-border-strong)] bg-[var(--color-panel)] text-[var(--color-text)] shadow-soft transition hover:bg-[var(--color-hover)]"
                aria-label="暂停预览"
              >
                <Pause className="h-5 w-5" />
              </button>
            )}
          </div>
        ) : previewFailed ? (
          <div className="mx-4 rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-bg-elevated)] px-6 py-6 shadow-soft sm:px-8 sm:py-7">
            <VideoUnavailableState task={task} onRetry={onRetry} />
          </div>
        ) : (
          <div className="mx-4 rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-bg-elevated)] px-6 py-6 shadow-soft sm:px-8 sm:py-7">
            <VideoEmptyState task={task} onRetry={onRetry} />
          </div>
        )}
      </div>

      {task ? (
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Info label="模型" value={getVideoModelDisplayName(task.model)} />
          <Info label="时长" value={task.duration} />
          <Info label="比例" value={task.ratio} />
          <Info label="分辨率" value={task.resolution} />
        </div>
      ) : null}
    </Card>
  );
}

function VideoUnavailableState({ task, onRetry }: { task: VideoTask | null; onRetry?: () => void }) {
  return (
    <div className="grid max-w-md place-items-center gap-4 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full border border-[color:var(--color-border)] bg-[var(--color-panel)] text-red-600">
        <XCircle className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--color-text)]">视频暂不可预览</p>
        <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
          视频文件已生成，但当前播放地址解析失败。可尝试下载原始 MP4，或重新生成以写入稳定存储。
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {task?.videoUrl ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => window.open(task.videoUrl || "", "_blank", "noopener,noreferrer")}>
            <Download className="h-4 w-4" />
            下载视频
          </Button>
        ) : null}
        {onRetry ? (
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            <RotateCcw className="h-4 w-4" />
            重新生成
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function VideoEmptyState({ task, onRetry }: { task: VideoTask | null; onRetry?: () => void }) {
  const failed = task ? isVideoFailed(task.status) : false;
  const processing = task ? isVideoProcessing(task.status) : false;
  const Icon = failed ? XCircle : processing ? Loader2 : Video;

  return (
    <div className="grid max-w-md place-items-center gap-4 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full border border-[color:var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text-muted)]">
        <Icon className={processing ? "h-5 w-5 animate-spin text-sky-600" : failed ? "h-5 w-5 text-red-600" : "h-5 w-5"} />
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--color-text)]">
          {failed ? "视频生成失败" : processing ? "视频正在生成" : "暂无视频结果"}
        </p>
        <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
          {failed
            ? task?.errorMessage || "任务未能完成，可以调整提示词或稍后重新生成。"
            : processing
              ? "任务已提交，完成后会自动更新预览和历史记录。"
              : "填写提示词并提交后，视频生成任务会显示在这里。"}
        </p>
      </div>
      {failed && onRetry ? (
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" />
          重新生成
        </Button>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: VideoTaskStatus | string }) {
  const isCompleted = isVideoCompleted(status);
  const isFailed = isVideoFailed(status);
  const tone = isCompleted
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
    : isFailed
      ? "border-red-500/30 bg-red-500/10 text-red-600"
      : "border-sky-500/30 bg-sky-500/10 text-sky-600";
  const label = isCompleted ? "已完成" : isFailed ? "生成失败" : "生成中";
  return <Badge className={`h-8 px-3 ${tone}`}>{label}</Badge>;
}

function isVideoCompleted(status: VideoTaskStatus | string) {
  const value = String(status);
  return value.includes("已完成") || value.includes(LEGACY_COMPLETED_STATUS);
}

function isVideoFailed(status: VideoTaskStatus | string) {
  const value = String(status);
  return value.includes("失败") || value.includes(LEGACY_FAILED_STATUS);
}

function isVideoProcessing(status: VideoTaskStatus | string) {
  return !isVideoCompleted(status) && !isVideoFailed(status);
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-3">
      <p className="text-xs text-[var(--color-text-faint)]">{label}</p>
      <p className="mt-2 text-sm font-medium text-[var(--color-text)]">{value}</p>
    </div>
  );
}
