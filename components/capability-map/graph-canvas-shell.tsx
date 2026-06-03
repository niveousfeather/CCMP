"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";

export type GraphCanvasBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
};

type CanvasDragState = {
  moved: boolean;
  panX: number;
  panY: number;
  pointerId: number;
  startX: number;
  startY: number;
};

type CanvasPan = {
  x: number;
  y: number;
};

const DRAG_THRESHOLD = 4;
const DEFAULT_FIT_PADDING = 48;
const MAX_ZOOM = 1.35;
const MIN_ZOOM = 0.25;
const ZOOM_STEP = 0.1;

function shouldIgnoreCanvasDrag(target: EventTarget | null) {
  if (!(target instanceof Element)) return true;
  return Boolean(target.closest('[data-graph-node="true"], button, a, input, textarea, select, [role="button"]'));
}

function shouldIgnoreCanvasKeydown(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function normalizedBounds(bounds: GraphCanvasBounds | undefined, contentWidth: number, contentHeight: number) {
  if (!bounds) {
    return {
      maxX: contentWidth,
      maxY: contentHeight,
      minX: 0,
      minY: 0
    };
  }

  return {
    maxX: Math.max(bounds.maxX, bounds.minX + 1),
    maxY: Math.max(bounds.maxY, bounds.minY + 1),
    minX: bounds.minX,
    minY: bounds.minY
  };
}

export function GraphCanvasShell({
  bounds,
  children,
  className,
  contentHeight,
  contentWidth,
  fitKey,
  fitPadding = DEFAULT_FIT_PADDING,
  viewportClassName = "h-[600px]"
}: {
  bounds?: GraphCanvasBounds;
  children: ReactNode;
  className?: string;
  contentHeight: number;
  contentWidth: number;
  fitKey?: string | number;
  fitPadding?: number;
  viewportClassName?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<CanvasDragState | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [pan, setPan] = useState<CanvasPan>({ x: fitPadding, y: fitPadding });
  const [zoom, setZoom] = useState(1);
  const activeBounds = normalizedBounds(bounds, contentWidth, contentHeight);

  function fitToView() {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const boundsWidth = Math.max(1, activeBounds.maxX - activeBounds.minX);
    const boundsHeight = Math.max(1, activeBounds.maxY - activeBounds.minY);
    const nextZoom = clampZoom(
      Math.min(
        (viewport.clientWidth - fitPadding * 2) / boundsWidth,
        (viewport.clientHeight - fitPadding * 2) / boundsHeight,
        MAX_ZOOM
      )
    );

    setZoom(nextZoom);
    setPan({
      x: (viewport.clientWidth - boundsWidth * nextZoom) / 2 - activeBounds.minX * nextZoom,
      y: (viewport.clientHeight - boundsHeight * nextZoom) / 2 - activeBounds.minY * nextZoom
    });
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      fitToView();
    });

    return () => cancelAnimationFrame(frame);
    // fitKey intentionally forces a fresh fit when a different graph stage is shown.
  }, [
    activeBounds.maxX,
    activeBounds.maxY,
    activeBounds.minX,
    activeBounds.minY,
    contentHeight,
    contentWidth,
    fitKey,
    fitPadding
  ]);

  function handleCanvasPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || shouldIgnoreCanvasDrag(event.target)) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    dragStateRef.current = {
      moved: false,
      panX: pan.x,
      panY: pan.y,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };
    viewport.focus({ preventScroll: true });
    viewport.setPointerCapture(event.pointerId);
    setIsPanning(true);
  }

  function handleCanvasPointerMove(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD) {
      dragState.moved = true;
    }

    if (!dragState.moved) return;

    event.preventDefault();
    setPan({ x: dragState.panX + deltaX, y: dragState.panY + deltaY });
  }

  function endCanvasDrag(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setIsPanning(false);
  }

  function updateZoom(nextZoomValue: number) {
    const viewport = viewportRef.current;
    setZoom((currentZoom) => {
      const nextZoom = clampZoom(nextZoomValue);

      if (viewport) {
        const centerX = (viewport.clientWidth / 2 - pan.x) / currentZoom;
        const centerY = (viewport.clientHeight / 2 - pan.y) / currentZoom;
        setPan({
          x: viewport.clientWidth / 2 - centerX * nextZoom,
          y: viewport.clientHeight / 2 - centerY * nextZoom
        });
      }

      return nextZoom;
    });
  }

  function resetView() {
    setZoom(1);
    setPan({
      x: fitPadding - activeBounds.minX,
      y: fitPadding - activeBounds.minY
    });
  }

  function handleCanvasKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (shouldIgnoreCanvasKeydown(event.target)) return;

    const key = event.key.toLowerCase();
    if (key === "+" || key === "=") {
      event.preventDefault();
      updateZoom(zoom + ZOOM_STEP);
    }
    if (key === "-" || key === "_") {
      event.preventDefault();
      updateZoom(zoom - ZOOM_STEP);
    }
    if (key === "0") {
      event.preventDefault();
      resetView();
    }
    if (key === "f") {
      event.preventDefault();
      fitToView();
    }
  }

  return (
    <div className={cn("overflow-hidden rounded-[28px] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-3", className)}>
      <div
        ref={viewportRef}
        data-capability-graph-canvas="true"
        tabIndex={0}
        onKeyDown={handleCanvasKeyDown}
        onPointerCancel={endCanvasDrag}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={endCanvasDrag}
        className={cn(
          "relative cursor-grab overflow-hidden rounded-[24px] border border-blue-100 bg-[length:auto,44px_44px,44px_44px] outline-none focus:ring-4 focus:ring-blue-200",
          viewportClassName,
          isPanning && "cursor-grabbing select-none"
        )}
        style={{ backgroundImage: "var(--cap-graph-bg)" }}
      >
        <div className="absolute right-4 top-4 z-50 flex w-fit items-center gap-1 rounded-full border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur">
          <button
            type="button"
            aria-label="适应视图"
            onClick={fitToView}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
            title="适应视图"
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="缩小"
            onClick={() => updateZoom(zoom - ZOOM_STEP)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
            title="缩小"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="min-w-12 text-center text-xs font-black text-slate-600">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label="放大"
            onClick={() => updateZoom(zoom + ZOOM_STEP)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
            title="放大"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="重置视图"
            onClick={resetView}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
            title="重置视图"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              height: contentHeight,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              width: contentWidth
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
