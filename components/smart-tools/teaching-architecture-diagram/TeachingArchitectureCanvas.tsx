"use client";

import { AlertCircle, ImageIcon, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";

import { Button } from "@/components/ui/button";
import type {
  TeachingArchitectureErrorCode,
  TeachingArchitectureTask,
  TeachingArchitectureTaskStage,
  TeachingArchitectureTaskStatus
} from "@/lib/smart-tools/teaching-architecture-diagram/types";
import { cn } from "@/lib/utils";

const MIN_SCALE = 0.25;
const MAX_SCALE = 3;

type PanPoint = {
  x: number;
  y: number;
};

export function TeachingArchitectureCanvas({
  currentStep,
  errorCode,
  errorMessage,
  onRetry,
  progress,
  retryable,
  stage,
  status,
  task
}: {
  currentStep: string;
  errorCode?: TeachingArchitectureErrorCode;
  errorMessage?: string;
  onRetry: () => void;
  progress: number;
  retryable: boolean;
  stage?: TeachingArchitectureTaskStage;
  status: TeachingArchitectureTaskStatus | "idle";
  task?: TeachingArchitectureTask;
}) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<PanPoint>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panStartRef = useRef<{ pointerId: number; x: number; y: number; pan: PanPoint } | null>(null);
  const canvasLabel = useMemo(() => getCanvasLabel(stage, currentStep), [currentStep, stage]);
  const imageUrl = task?.status === "completed" ? getTaskPreviewImageUrl(task) : undefined;
  const imageWidth = task?.image?.width || 1792;
  const imageHeight = task?.image?.height || 1024;

  const resetView = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!imageUrl) return;
      event.preventDefault();
      const viewport = viewportRef.current;
      if (!viewport) return;

      const rect = viewport.getBoundingClientRect();
      const pointer = {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2
      };
      const zoomFactor = Math.exp(-event.deltaY * 0.0015);

      setScale((currentScale) => {
        const nextScale = clamp(currentScale * zoomFactor, MIN_SCALE, MAX_SCALE);
        if (nextScale === currentScale) return currentScale;
        setPan((currentPan) => ({
          x: pointer.x - ((pointer.x - currentPan.x) / currentScale) * nextScale,
          y: pointer.y - ((pointer.y - currentPan.y) / currentScale) * nextScale
        }));
        return nextScale;
      });
    },
    [imageUrl]
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!imageUrl) return;
      const shouldPan = event.button === 1 || event.button === 0 || isSpacePressed;
      if (!shouldPan) return;

      event.preventDefault();
      panStartRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        pan
      };
      setIsPanning(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [imageUrl, isSpacePressed, pan]
  );

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const start = panStartRef.current;
    if (!start) return;
    event.preventDefault();
    setPan({
      x: start.pan.x + event.clientX - start.x,
      y: start.pan.y + event.clientY - start.y
    });
  }, []);

  const stopPanning = useCallback((event?: PointerEvent<HTMLDivElement>) => {
    const start = panStartRef.current;
    if (event && start && event.currentTarget.hasPointerCapture(start.pointerId)) {
      event.currentTarget.releasePointerCapture(start.pointerId);
    }
    panStartRef.current = null;
    setIsPanning(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isEditableTarget(event.target)) {
        event.preventDefault();
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setIsSpacePressed(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    resetView();
  }, [resetView, task?.taskId, task?.updatedAt]);

  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] flex-1 overflow-hidden bg-[#f5f7fb]">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.05)_1px,transparent_1px),linear-gradient(180deg,rgba(15,23,42,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />
      <div className="relative flex w-full items-center justify-center px-4 pb-40 pt-20 md:px-6">
        {status === "idle" ? <EmptyCanvas /> : null}
        {status === "pending" || status === "running" || status === "analyzing" || status === "generating" ? (
          <LoadingCanvas currentStep={canvasLabel} progress={progress} />
        ) : null}
        {status === "completed" && !imageUrl ? <LoadingCanvas currentStep="正在读取生成图片" progress={100} /> : null}
        {status === "failed" ? (
          <FailedCanvas errorCode={errorCode} errorMessage={errorMessage} onRetry={onRetry} retryable={retryable} />
        ) : null}
        {status === "completed" && imageUrl ? (
          <div
            ref={viewportRef}
            className={cn(
              "relative flex h-[calc(100vh-13rem)] w-full max-w-[calc(100vw-9rem)] items-center justify-center overflow-hidden",
              isPanning ? "cursor-grabbing" : "cursor-grab"
            )}
            onDoubleClick={(event) => {
              if (event.target === event.currentTarget) resetView();
            }}
            onPointerCancel={stopPanning}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopPanning}
            onWheel={handleWheel}
          >
            <div
              className="relative flex items-center justify-center bg-white p-2 shadow-[0_24px_90px_rgba(15,23,42,0.12)] md:p-3"
              style={{
                width: `${Math.round(imageWidth * scale)}px`,
                height: `${Math.round(imageHeight * scale)}px`,
                transform: `translate3d(${Math.round(pan.x)}px, ${Math.round(pan.y)}px, 0)`,
                transformOrigin: "center center"
              }}
            >
              <img
                alt="教学架构图 PNG 预览"
                className="h-full w-full select-none bg-white object-contain"
                draggable={false}
                src={imageUrl}
              />
            </div>
            <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-xs text-slate-500">
              <ImageIcon className="h-3.5 w-3.5" />
              当前显示 output.png，底部输入修改说明可重新生成图片
            </div>
            <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-xl border border-slate-200 bg-white/90 p-1 text-xs text-slate-500 shadow-sm backdrop-blur">
              <button
                type="button"
                className="rounded-lg px-2 py-1 transition hover:bg-slate-100 hover:text-slate-900"
                onClick={resetView}
              >
                重置
              </button>
              <span className="min-w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function EmptyCanvas() {
  return (
    <div className="grid h-72 w-full max-w-xl place-items-center rounded-lg border border-dashed border-slate-300 bg-white/75 p-8 text-center">
      <div>
        <p className="text-lg font-semibold text-slate-800">输入教学材料，生成架构图</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          生成完成后直接展示 PNG 图片；需要改字或局部调整时，在底部输入修改说明重新生成。
        </p>
      </div>
    </div>
  );
}

function LoadingCanvas({ currentStep, progress }: { currentStep: string; progress: number }) {
  return (
    <div className="grid h-80 w-full max-w-md place-items-center rounded-lg border border-slate-200 bg-white/80 p-8 text-center shadow-soft">
      <div className="w-full">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-blue-200 bg-blue-50 text-blue-700">
          <Loader2 className="h-7 w-7 animate-spin" />
        </span>
        <p className="mt-5 text-lg font-semibold text-slate-900">{currentStep}</p>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-700 transition-all" style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-500">{progress}%</p>
      </div>
    </div>
  );
}

function FailedCanvas({
  errorCode,
  errorMessage,
  onRetry,
  retryable
}: {
  errorCode?: TeachingArchitectureErrorCode;
  errorMessage?: string;
  onRetry: () => void;
  retryable: boolean;
}) {
  return (
    <div className="grid h-80 w-full max-w-md place-items-center rounded-lg border border-red-200 bg-white/85 p-8 text-center shadow-soft">
      <div>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-600">
          <AlertCircle className="h-5 w-5" />
        </span>
        <p className="mt-4 text-lg font-semibold text-slate-900">生成失败</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">{getFailureMessage(errorCode, errorMessage)}</p>
        {retryable ? (
          <Button type="button" className="mt-5" variant="secondary" onClick={onRetry}>
            <RotateCcw className="h-4 w-4" />
            重试生成
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function getCanvasLabel(stage?: TeachingArchitectureTaskStage, fallback?: string) {
  if (stage === "extracting") return "正在解析材料";
  if (stage === "analyzing") return "正在生成蓝图";
  if (stage === "building_prompt") return "正在构建图片提示词";
  if (stage === "rendering_svg") return "正在封存 SVG 备用文件";
  if (stage === "generating_image") return "正在生成图片";
  if (stage === "completed") return "正在准备图片预览";
  return fallback || "正在创建任务";
}

function getTaskPreviewImageUrl(task: TeachingArchitectureTask) {
  const hasPng = Boolean(task.output.pngFileName || task.image?.outputPng);
  const baseUrl = hasPng && task.downloadUrl ? task.downloadUrl : task.preview.imageUrl;
  if (!baseUrl) return undefined;
  const params = new URLSearchParams();
  if (hasPng) params.set("format", "png");
  params.set("preview", "1");
  params.set("v", task.updatedAt);
  return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${params.toString()}`;
}

function getFailureMessage(errorCode?: TeachingArchitectureErrorCode, fallback?: string) {
  if (errorCode === "IMAGE_PROVIDER_NOT_CONFIGURED") return "图片生成服务未配置，请检查环境变量。";
  if (errorCode === "IMAGE_PROVIDER_TIMEOUT" || errorCode === "MODEL_PROVIDER_TIMEOUT") {
    return "模型生成超时，请稍后重试或减少材料数量。";
  }
  if (errorCode === "IMAGE_PROVIDER_BAD_RESPONSE") return "图片生成服务未返回有效图片，请稍后重试。";
  return fallback || "任务生成失败，请检查输入材料或稍后重试。";
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
