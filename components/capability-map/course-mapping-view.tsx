"use client";

import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpenCheck,
  BriefcaseBusiness,
  Layers3,
  Link2,
  Maximize2,
  Minus,
  MousePointer2,
  PencilLine,
  Plus,
  RotateCcw,
  Save,
  X
} from "lucide-react";

import type {
  CourseMappingDimension,
  CourseMappingItem,
  ModuleMapping
} from "@/lib/capability-map/course-ability-graph";
import { cn } from "@/lib/utils";

const VIEW_WIDTH = 1320;
const LEFT_COLUMN_X = 150;
const PROJECT_X = 400;
const DIMENSION_X = 670;
const ITEM_X = 990;
const START_Y = 110;
const ITEM_STEP = 58;
const GROUP_GAP = 54;
const MIN_GROUP_HEIGHT = 128;
const DRAG_THRESHOLD = 4;
const FIT_PADDING = 28;
const MAX_ZOOM = 1.35;
const MIN_ZOOM = 0.25;
const ZOOM_STEP = 0.1;

type MappingNodeKind = "module" | "project" | "dimension" | "item";
type Selection =
  | { type: "project"; id: string }
  | { type: "dimension"; id: string }
  | { type: "item"; id: string }
  | null;
type MappingEditDraft =
  | { type: "project"; name: string; description: string }
  | { type: "dimension"; id: string; title: string }
  | { type: "item"; id: string; text: string; description: string }
  | null;

type MappingNode = {
  id: string;
  kind: MappingNodeKind;
  title: string;
  subtitle?: string;
  description?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dimension?: CourseMappingDimension;
  item?: CourseMappingItem;
  delay: number;
};

type MappingEdgeType = "module-project" | "project-dimension" | "dimension-item";
type MappingEdge = {
  id: string;
  source: string;
  target: string;
  type: MappingEdgeType;
  delay: number;
};

type MappingLayout = {
  height: number;
  nodes: MappingNode[];
  edges: MappingEdge[];
  itemMap: Map<string, CourseMappingItem>;
  itemToDimensionId: Map<string, string>;
  dimensionMap: Map<string, CourseMappingDimension>;
};

type MappingCanvasDragState = {
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

const moduleNodeId = "current-module";
const projectNodeId = "typical-project";

function shouldIgnoreCanvasDrag(target: EventTarget | null) {
  if (!(target instanceof Element)) return true;
  return Boolean(target.closest('[data-mapping-node="true"], button, a, input, textarea, select, [role="button"]'));
}

function shouldIgnoreCanvasKeydown(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function CourseMappingView({
  editMode = false,
  mapping,
  onUpdateMappingDimension,
  onUpdateMappingItem,
  onUpdateTypicalWorkProject,
  onBack
}: {
  editMode?: boolean;
  mapping: ModuleMapping;
  onUpdateMappingDimension?: (moduleId: string, dimensionKey: string, patch: { title: string }) => void;
  onUpdateMappingItem?: (moduleId: string, itemId: string, patch: { description: string; text: string }) => void;
  onUpdateTypicalWorkProject?: (moduleId: string, patch: { description: string; name: string }) => void;
  onBack: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<MappingCanvasDragState | null>(null);
  const suppressCanvasClickRef = useRef(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [editDraft, setEditDraft] = useState<MappingEditDraft>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [pan, setPan] = useState<CanvasPan>({ x: FIT_PADDING, y: FIT_PADDING });
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setSelection(null);
    setEditDraft(null);
  }, [mapping.moduleId]);

  useEffect(() => {
    setEditDraft(null);
  }, [editMode, selection?.id, selection?.type]);

  const layout = useMemo(() => buildMappingLayout(mapping), [mapping]);
  const active = useMemo(() => getActiveState(layout, selection), [layout, selection]);
  const selectedDetail = getSelectedDetail(mapping, layout, selection);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      fitToView();
    });

    return () => cancelAnimationFrame(frame);
  }, [layout.height, mapping.moduleId]);

  function clearSelection() {
    setSelection(null);
  }

  function handleCanvasPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || shouldIgnoreCanvasDrag(event.target)) return;

    const canvasElement = scrollRef.current;
    if (!canvasElement) return;

    dragStateRef.current = {
      moved: false,
      panX: pan.x,
      panY: pan.y,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };
    canvasElement.focus({ preventScroll: true });
    canvasElement.setPointerCapture(event.pointerId);
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
    suppressCanvasClickRef.current = true;
    setPan({ x: dragState.panX + deltaX, y: dragState.panY + deltaY });
  }

  function endCanvasDrag(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const canvasElement = scrollRef.current;
    if (canvasElement?.hasPointerCapture(event.pointerId)) {
      canvasElement.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setIsPanning(false);
  }

  function handleCanvasClick() {
    if (suppressCanvasClickRef.current) {
      suppressCanvasClickRef.current = false;
      return;
    }

    clearSelection();
  }

  function updateZoom(nextZoomValue: number) {
    const canvasElement = scrollRef.current;
    setZoom((currentZoom) => {
      const nextZoom = clampZoom(nextZoomValue);

      if (canvasElement) {
        const centerX = (canvasElement.clientWidth / 2 - pan.x) / currentZoom;
        const centerY = (canvasElement.clientHeight / 2 - pan.y) / currentZoom;
        setPan({
          x: canvasElement.clientWidth / 2 - centerX * nextZoom,
          y: canvasElement.clientHeight / 2 - centerY * nextZoom
        });
      }

      return nextZoom;
    });
  }

  function resetView() {
    setZoom(1);
    setPan({ x: FIT_PADDING, y: FIT_PADDING });
  }

  function fitToView() {
    const canvasElement = scrollRef.current;
    if (!canvasElement) return;

    const nextZoom = clampZoom(
      Math.min((canvasElement.clientWidth - FIT_PADDING) / VIEW_WIDTH, (canvasElement.clientHeight - FIT_PADDING) / layout.height, 1)
    );

    setZoom(nextZoom);
    setPan({
      x: (canvasElement.clientWidth - VIEW_WIDTH * nextZoom) / 2,
      y: (canvasElement.clientHeight - layout.height * nextZoom) / 2
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

  function beginEditingSelection() {
    if (selection?.type === "project") {
      setEditDraft({
        description: mapping.typicalWorkProject.description || "",
        name: mapping.typicalWorkProject.name,
        type: "project"
      });
    }

    if (selection?.type === "dimension") {
      const dimension = layout.dimensionMap.get(selection.id);
      if (!dimension) return;
      setEditDraft({ id: dimension.key, title: dimension.title, type: "dimension" });
    }

    if (selection?.type === "item") {
      const item = layout.itemMap.get(selection.id);
      if (!item) return;
      setEditDraft({ description: item.description || "", id: item.id, text: item.text, type: "item" });
    }
  }

  function saveMappingEdit() {
    if (editDraft?.type === "project") {
      onUpdateTypicalWorkProject?.(mapping.moduleId, {
        description: editDraft.description.trim(),
        name: editDraft.name.trim() || mapping.typicalWorkProject.name
      });
    }

    if (editDraft?.type === "dimension") {
      onUpdateMappingDimension?.(mapping.moduleId, editDraft.id, {
        title: editDraft.title.trim() || layout.dimensionMap.get(dimensionNodeId(editDraft.id))?.title || ""
      });
    }

    if (editDraft?.type === "item") {
      const existing = layout.itemMap.get(editDraft.id);
      onUpdateMappingItem?.(mapping.moduleId, editDraft.id, {
        description: editDraft.description.trim(),
        text: editDraft.text.trim() || existing?.text || ""
      });
    }

    setEditDraft(null);
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            返回课程能力图谱
          </button>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
            <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-blue-700">当前教学模块：{mapping.moduleName}</span>
            {mapping.hours ? <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{mapping.hours} 学时</span> : null}
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">典型工作项目：{mapping.typicalWorkProject.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold leading-6 text-slate-600 lg:max-w-[380px]">
          <MousePointer2 className="h-4 w-4 shrink-0 text-blue-700" />
          点击典型工作项目、维度或具体小点，查看它们如何支撑当前教学模块。
        </div>
      </div>

      <div
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={handleCanvasKeyDown}
        onPointerCancel={endCanvasDrag}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={endCanvasDrag}
        className={cn(
          "relative h-[760px] cursor-grab overflow-hidden rounded-[28px] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-3 outline-none focus:ring-4 focus:ring-blue-200",
          isPanning && "cursor-grabbing select-none"
        )}
      >
        <div className="absolute right-4 top-4 z-50 flex w-fit items-center gap-1 rounded-full border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur">
          <button
            type="button"
            aria-label="适应窗口"
            onClick={() => fitToView()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
            title="适应窗口"
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
        <div
          className="absolute inset-3 overflow-hidden rounded-[24px] border border-blue-100 bg-[length:auto,44px_44px,44px_44px]"
          onClick={handleCanvasClick}
          style={{
            backgroundImage: "var(--cap-graph-bg)"
          }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              height: layout.height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              width: VIEW_WIDTH
            }}
          >
            <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${VIEW_WIDTH} ${layout.height}`} aria-hidden="true">
              {layout.edges.map((edge) => {
                const source = layout.nodes.find((node) => node.id === edge.source);
                const target = layout.nodes.find((node) => node.id === edge.target);
                if (!source || !target) return null;
                const highlighted = isEdgeActive(edge, active, selection);

                return (
                  <path
                    key={edge.id}
                    className="cap-mapping-edge"
                    d={edgePath(source, target, edge.type)}
                    fill="none"
                    stroke={highlighted ? "rgba(37, 99, 235, 0.9)" : "rgba(100, 116, 139, 0.24)"}
                    strokeLinecap="round"
                    strokeWidth={highlighted ? 2.2 : 1.2}
                    style={{ animationDelay: `${edge.delay}ms` }}
                  />
                );
              })}
            </svg>

            {layout.nodes.map((node) => {
              const interactive = node.kind === "project" || node.kind === "dimension" || node.kind === "item";
              const highlighted = isNodeActive(node, active, selection);
              const selected = isNodeSelected(node, selection);

              return (
                <button
                  key={node.id}
                  type="button"
                  data-mapping-node="true"
                  disabled={!interactive}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!interactive) return;
                    setSelection(selectionForNode(node));
                  }}
                  className={cn(
                    "cap-mapping-node absolute overflow-hidden border text-left shadow-sm transition duration-200",
                    node.kind === "module" && "rounded-[30px] border-blue-500 bg-blue-600 p-5 text-white shadow-[0_20px_54px_rgba(37,99,235,0.26)]",
                    node.kind === "project" && "rounded-2xl border-blue-200 bg-blue-50 p-3",
                    node.kind === "dimension" && "rounded-2xl border-blue-200 bg-white p-3",
                    node.kind === "item" && "rounded-2xl border-slate-200 bg-white p-3",
                    interactive && "cursor-pointer hover:border-blue-400 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-200",
                    !interactive && "cursor-default",
                    selected && "z-20 border-blue-500 ring-4 ring-blue-200"
                  )}
                  style={{
                    height: node.height,
                    left: node.x,
                    opacity: highlighted ? 1 : 0.28,
                    top: node.y,
                    width: node.width,
                    zIndex: selected ? 30 : highlighted ? 10 : undefined,
                    animationDelay: `${node.delay}ms`
                  } as CSSProperties}
                >
                  <MappingNodeContent node={node} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-slate-950">
            {selectedDetail.icon}
            {selectedDetail.title}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{selectedDetail.description}</p>
          {selectedDetail.related.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedDetail.related.map((item) => (
                <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  {item}
                </span>
              ))}
            </div>
          ) : null}
          {editMode && selection ? (
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-3">
              {editDraft ? (
                <div className="grid gap-3">
                  {editDraft.type === "project" ? (
                    <>
                      <label className="grid gap-1.5 text-xs font-bold text-slate-600">
                        典型工作项目名称
                        <input
                          value={editDraft.name}
                          onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-blue-300"
                        />
                      </label>
                      <label className="grid gap-1.5 text-xs font-bold text-slate-600">
                        典型工作项目说明
                        <textarea
                          value={editDraft.description}
                          onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })}
                          className="min-h-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-950 outline-none focus:border-blue-300"
                        />
                      </label>
                    </>
                  ) : null}
                  {editDraft.type === "dimension" ? (
                    <label className="grid gap-1.5 text-xs font-bold text-slate-600">
                      维度名称
                      <input
                        value={editDraft.title}
                        onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-blue-300"
                      />
                    </label>
                  ) : null}
                  {editDraft.type === "item" ? (
                    <>
                      <label className="grid gap-1.5 text-xs font-bold text-slate-600">
                        小点文本
                        <input
                          value={editDraft.text}
                          onChange={(event) => setEditDraft({ ...editDraft, text: event.target.value })}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-blue-300"
                        />
                      </label>
                      <label className="grid gap-1.5 text-xs font-bold text-slate-600">
                        小点说明
                        <textarea
                          value={editDraft.description}
                          onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })}
                          className="min-h-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-950 outline-none focus:border-blue-300"
                        />
                      </label>
                    </>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={saveMappingEdit} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-black text-white">
                      <Save className="h-4 w-4" />
                      保存
                    </button>
                    <button type="button" onClick={() => setEditDraft(null)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700">
                      <X className="h-4 w-4" />
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={beginEditingSelection}
                  className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-black text-blue-700 transition hover:border-blue-300"
                >
                  <PencilLine className="h-4 w-4" />
                  编辑当前内容
                </button>
              )}
            </div>
          ) : editMode ? (
            <p className="mt-3 text-xs font-semibold text-slate-500">编辑模式已开启：请选择典型工作项目、维度或具体小点进行修改。</p>
          ) : null}
        </div>
        {selection ? (
          <button
            type="button"
            onClick={clearSelection}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
          >
            <RotateCcw className="h-4 w-4" />
            清除高亮
          </button>
        ) : null}
      </div>
    </div>
  );
}

function buildMappingLayout(mapping: ModuleMapping): MappingLayout {
  const itemMap = new Map(mapping.mappingDimensions.flatMap((dimension) => dimension.items.map((item) => [item.id, item] as const)));
  const dimensionMap = new Map(mapping.mappingDimensions.map((dimension) => [dimensionNodeId(dimension.key), dimension] as const));
  const itemToDimensionId = new Map<string, string>();
  const nodes: MappingNode[] = [
    {
      id: moduleNodeId,
      kind: "module",
      title: mapping.moduleName,
      subtitle: mapping.hours ? `当前教学模块 · ${mapping.hours} 学时` : "当前教学模块",
      description: "课程映射从当前教学模块展开，解释模块为什么这样设置。",
      x: LEFT_COLUMN_X,
      y: 540,
      width: 220,
      height: 118,
      delay: 0
    },
    {
      id: projectNodeId,
      kind: "project",
      title: mapping.typicalWorkProject.name,
      subtitle: "典型工作项目",
      description: mapping.typicalWorkProject.description,
      x: PROJECT_X,
      y: 540,
      width: 230,
      height: 106,
      delay: 90
    }
  ];
  const edges: MappingEdge[] = [
    { id: "module-to-project", source: moduleNodeId, target: projectNodeId, type: "module-project", delay: 120 }
  ];

  let cursorY = START_Y;
  mapping.mappingDimensions.forEach((dimension, dimensionIndex) => {
    const groupHeight = Math.max(MIN_GROUP_HEIGHT, dimension.items.length * ITEM_STEP);
    const dimensionY = cursorY + groupHeight / 2;
    const dimensionId = dimensionNodeId(dimension.key);

    nodes.push({
      id: dimensionId,
      kind: "dimension",
      title: dimension.title,
      subtitle: `维度 ${dimensionIndex + 1}`,
      description: `包含 ${dimension.items.length} 个具体小点`,
      x: DIMENSION_X,
      y: dimensionY,
      width: 210,
      height: 86,
      dimension,
      delay: 140 + dimensionIndex * 35
    });

    edges.push({
      id: `project-to-${dimensionId}`,
      source: projectNodeId,
      target: dimensionId,
      type: "project-dimension",
      delay: 170 + dimensionIndex * 30
    });

    const firstItemY = dimensionY - ((dimension.items.length - 1) * ITEM_STEP) / 2;
    dimension.items.forEach((item, itemIndex) => {
      const itemY = firstItemY + itemIndex * ITEM_STEP;
      const itemId = itemNodeId(item.id);
      itemToDimensionId.set(item.id, dimensionId);

      nodes.push({
        id: itemId,
        kind: "item",
        title: item.text,
        subtitle: "具体小点",
        description: item.description,
        x: ITEM_X,
        y: itemY,
        width: 285,
        height: 46,
        item,
        delay: 250 + dimensionIndex * 42 + itemIndex * 16
      });

      edges.push({
        id: `${dimensionId}-to-${itemId}`,
        source: dimensionId,
        target: itemId,
        type: "dimension-item",
        delay: 290 + dimensionIndex * 35 + itemIndex * 16
      });
    });

    cursorY += groupHeight + GROUP_GAP;
  });

  const height = Math.max(760, cursorY + 80);
  nodes[0].y = Math.min(height / 2, 620);
  nodes[1].y = nodes[0].y;

  return { edges, height, itemMap, itemToDimensionId, dimensionMap, nodes };
}

function dimensionNodeId(key: string) {
  return `dimension:${key}`;
}

function itemNodeId(id: string) {
  return `item:${id}`;
}

function edgePath(source: MappingNode, target: MappingNode, type: MappingEdgeType) {
  const startX = source.x + source.width / 2 + 8;
  const startY = source.y;
  const endX = target.x - target.width / 2 - 12;
  const endY = target.y;
  const distanceX = endX - startX;
  const curveStrength = type === "project-dimension" ? 0.62 : 0.48;
  const controlA = { x: startX + distanceX * curveStrength, y: startY };
  const controlB = { x: endX - distanceX * curveStrength, y: endY };

  return `M ${startX} ${startY} C ${controlA.x} ${controlA.y}, ${controlB.x} ${controlB.y}, ${endX} ${endY}`;
}

function getActiveState(layout: MappingLayout, selection: Selection) {
  const dimensionIds = new Set<string>();
  const itemIds = new Set<string>();

  if (!selection) {
    return { dimensionIds, itemIds };
  }

  if (selection.type === "dimension") {
    dimensionIds.add(selection.id);
    const dimension = layout.dimensionMap.get(selection.id);
    dimension?.items.forEach((item) => itemIds.add(itemNodeId(item.id)));
  }

  if (selection.type === "item") {
    itemIds.add(itemNodeId(selection.id));
    const dimensionId = layout.itemToDimensionId.get(selection.id);
    if (dimensionId) dimensionIds.add(dimensionId);
  }

  return { dimensionIds, itemIds };
}

function isNodeActive(node: MappingNode, active: ReturnType<typeof getActiveState>, selection: Selection) {
  if (!selection) return true;
  if (node.kind === "module" || node.kind === "project") return true;
  if (node.kind === "dimension") return active.dimensionIds.has(node.id);
  if (node.kind === "item") return active.itemIds.has(node.id);
  return false;
}

function isNodeSelected(node: MappingNode, selection: Selection) {
  if (!selection) return false;
  if (node.kind === "project" && selection.type === "project") return node.id === selection.id;
  if (node.kind === "dimension" && selection.type === "dimension") return node.id === selection.id;
  if (node.kind === "item" && selection.type === "item") return node.item?.id === selection.id;
  return false;
}

function isEdgeActive(edge: MappingEdge, active: ReturnType<typeof getActiveState>, selection: Selection) {
  if (!selection) return true;
  if (edge.type === "module-project") return true;
  if (edge.type === "project-dimension") return active.dimensionIds.has(edge.target);
  if (edge.type === "dimension-item") return active.dimensionIds.has(edge.source) && active.itemIds.has(edge.target);
  return false;
}

function selectionForNode(node: MappingNode): Selection {
  if (node.kind === "project") return { type: "project", id: node.id };
  if (node.kind === "dimension") return { type: "dimension", id: node.id };
  if (node.kind === "item" && node.item) return { type: "item", id: node.item.id };
  return null;
}

function MappingNodeContent({ node }: { node: MappingNode }) {
  if (node.kind === "module") {
    return (
      <span className="block text-center">
        <span className="block text-xs font-bold text-blue-100">{node.subtitle}</span>
        <span className="mt-1 block text-lg font-black leading-6">{node.title}</span>
      </span>
    );
  }

  if (node.kind === "project") {
    return (
      <span className="block">
        <span className="block text-[11px] font-bold text-blue-700">{node.subtitle}</span>
        <span className="mt-2 block break-words text-base font-black leading-5 text-slate-950">{node.title}</span>
      </span>
    );
  }

  if (node.kind === "dimension") {
    return (
      <span className="block">
        <span className="block text-[11px] font-bold text-blue-700">{node.subtitle}</span>
        <span className="mt-1 block break-words text-sm font-black leading-5 text-slate-950">{node.title}</span>
        <span className="mt-1 block text-[11px] font-semibold text-slate-500">{node.dimension?.items.length || 0} 个小点</span>
      </span>
    );
  }

  return (
    <span className="block">
      <span className="line-clamp-2 block text-sm font-black leading-5 text-slate-950">{node.title}</span>
    </span>
  );
}

function getSelectedDetail(mapping: ModuleMapping, layout: MappingLayout, selection: Selection) {
  if (!selection) {
    return {
      icon: <Layers3 className="h-4 w-4 text-blue-700" />,
      title: "课程映射关系",
      description: "当前画布展示教学模块、典型工作项目、七个映射维度和具体小点之间的连接关系。",
      related: ["教学模块解释课程设置", "典型工作项目承接岗位任务", "七个维度展开具体支撑小点"]
    };
  }

  if (selection.type === "project") {
    return {
      icon: <BriefcaseBusiness className="h-4 w-4 text-blue-700" />,
      title: mapping.typicalWorkProject.name,
      description: mapping.typicalWorkProject.description || "该典型工作项目解释当前教学模块对应的真实工作情境。",
      related: mapping.mappingDimensions.map((dimension) => dimension.title)
    };
  }

  if (selection.type === "dimension") {
    const dimension = layout.dimensionMap.get(selection.id);

    return {
      icon: <Layers3 className="h-4 w-4 text-blue-700" />,
      title: dimension?.title || "映射维度",
      description: `该维度下的 ${dimension?.items.length || 0} 个具体小点已经高亮，用于解释当前教学模块的设置依据。`,
      related: dimension?.items.map((item) => item.text) || []
    };
  }

  const item = layout.itemMap.get(selection.id);
  const dimensionId = layout.itemToDimensionId.get(selection.id);
  const dimension = dimensionId ? layout.dimensionMap.get(dimensionId) : null;
  return {
    icon: <Link2 className="h-4 w-4 text-blue-700" />,
    title: item?.text || "具体小点",
    description: item?.description || "该具体小点是当前教学模块内容设置的支撑依据之一。",
    related: [dimension?.title || "", mapping.moduleName].filter(Boolean)
  };
}
