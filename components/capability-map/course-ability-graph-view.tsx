"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";

import type {
  CourseAbilityGraphPayload,
  CourseTaskNode,
  TeachingModuleNode,
  WorkflowStage
} from "@/lib/capability-map/course-ability-graph";
import { cn } from "@/lib/utils";

type NodeKind = "course" | "workflow" | "module" | "task";

const CANVAS_WIDTH = 1460;
const CANVAS_PADDING_TOP = 48;
const CANVAS_PADDING_BOTTOM = 48;
const COLUMN_X: Record<NodeKind, number> = {
  course: 165,
  workflow: 540,
  module: 860,
  task: 1200
};

const NODE_SIZE: Record<NodeKind, { width: number; height: number }> = {
  course: { width: 240, height: 128 },
  workflow: { width: 230, height: 88 },
  module: { width: 260, height: 104 },
  task: { width: 230, height: 50 }
};

const TASK_GAP = 8;
const MODULE_GAP = 26;
const STAGE_GAP = 46;
const MODULE_BLOCK_PAD_Y = 17;
const MIN_MODULE_BLOCK_HEIGHT = 150;
const EDGE_INSET = 8;
const DRAG_THRESHOLD = 4;
const FIT_PADDING = 28;
const MAX_ZOOM = 1.35;
const MIN_ZOOM = 0.25;
const ZOOM_STEP = 0.1;

type DisplayNode = {
  id: string;
  kind: NodeKind;
  title: string;
  subtitle: string;
  description?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  module?: TeachingModuleNode;
  stage?: WorkflowStage;
  task?: CourseTaskNode;
};

type DisplayEdge = {
  id: string;
  source: string;
  target: string;
};

type ModuleLayoutBlock = {
  height: number;
  module: TeachingModuleNode;
  tasks: CourseTaskNode[];
  y: number;
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

function shouldIgnoreCanvasDrag(target: EventTarget | null) {
  if (!(target instanceof Element)) return true;
  return Boolean(target.closest('[data-graph-node="true"], button, a, input, textarea, select, [role="button"]'));
}

function shouldIgnoreCanvasKeydown(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function taskStackHeight(taskCount: number) {
  if (taskCount <= 0) return 0;
  return taskCount * NODE_SIZE.task.height + Math.max(0, taskCount - 1) * TASK_GAP;
}

function moduleBlockHeight(taskCount: number) {
  return Math.max(
    MIN_MODULE_BLOCK_HEIGHT,
    NODE_SIZE.module.height + MODULE_BLOCK_PAD_Y * 2,
    taskStackHeight(taskCount) + MODULE_BLOCK_PAD_Y * 2
  );
}

function buildDisplay(graph: CourseAbilityGraphPayload) {
  const moduleById = new Map(graph.teachingModules.map((module) => [module.id, module]));
  const taskById = new Map(graph.tasks.map((task) => [task.id, task]));

  const stageLayouts = graph.workflowStages.map((stage) => {
    const moduleBlocks: ModuleLayoutBlock[] = stage.moduleIds
      .map((moduleId) => moduleById.get(moduleId))
      .filter((module): module is TeachingModuleNode => Boolean(module))
      .map((module) => {
        const orderedTasks = module.taskIds
          .map((taskId) => taskById.get(taskId))
          .filter((task): task is CourseTaskNode => Boolean(task));

        return {
          height: moduleBlockHeight(orderedTasks.length),
          module,
          tasks: orderedTasks,
          y: 0
        };
      });

    const height = moduleBlocks.reduce((sum, block) => sum + block.height, 0) + Math.max(0, moduleBlocks.length - 1) * MODULE_GAP;

    return {
      height,
      moduleBlocks,
      stage,
      y: 0
    };
  });

  let cursorY = CANVAS_PADDING_TOP;
  stageLayouts.forEach((stageLayout) => {
    stageLayout.y = cursorY + stageLayout.height / 2;

    let moduleCursorY = cursorY;
    stageLayout.moduleBlocks.forEach((block) => {
      block.y = moduleCursorY + block.height / 2;
      moduleCursorY += block.height + MODULE_GAP;
    });

    cursorY += stageLayout.height + STAGE_GAP;
  });

  const contentHeight = Math.max(0, cursorY - STAGE_GAP - CANVAS_PADDING_TOP);
  const canvasHeight = CANVAS_PADDING_TOP + contentHeight + CANVAS_PADDING_BOTTOM;
  const courseY = CANVAS_PADDING_TOP + contentHeight / 2;

  const nodes: DisplayNode[] = [
    {
      id: graph.courseAbilityMap.rootNode.id,
      kind: "course",
      title: `《${graph.course.courseName}》`,
      subtitle: "课程",
      description: graph.courseAbilityMap.rootNode.description,
      x: COLUMN_X.course,
      y: courseY,
      width: NODE_SIZE.course.width,
      height: NODE_SIZE.course.height
    },
    ...stageLayouts.map<DisplayNode>(({ stage, y }) => ({
      id: stage.id,
      kind: "workflow",
      title: stage.name,
      subtitle: "工作流程",
      description: stage.description,
      x: COLUMN_X.workflow,
      y,
      width: NODE_SIZE.workflow.width,
      height: NODE_SIZE.workflow.height,
      stage
    })),
    ...stageLayouts.flatMap(({ moduleBlocks }) =>
      moduleBlocks.flatMap<DisplayNode>((block) => {
        const taskStack = taskStackHeight(block.tasks.length);
        const taskStartY = block.y - taskStack / 2 + NODE_SIZE.task.height / 2;

        return [
          {
            id: block.module.id,
            kind: "module",
            title: block.module.name,
            subtitle: "教学模块",
            description: block.module.description,
            x: COLUMN_X.module,
            y: block.y,
            width: NODE_SIZE.module.width,
            height: NODE_SIZE.module.height,
            module: block.module
          },
          ...block.tasks.map<DisplayNode>((task, taskIndex) => ({
            id: task.id,
            kind: "task",
            title: task.name,
            subtitle: "任务/能力点",
            description: task.description,
            x: COLUMN_X.task,
            y: taskStartY + taskIndex * (NODE_SIZE.task.height + TASK_GAP),
            width: NODE_SIZE.task.width,
            height: NODE_SIZE.task.height,
            task
          }))
        ];
      })
    )
  ];

  const edges: DisplayEdge[] = [
    ...graph.workflowStages.map((stage) => ({ id: `course-${stage.id}`, source: graph.courseAbilityMap.rootNode.id, target: stage.id })),
    ...graph.teachingModules.map((module) => ({ id: `${module.workflowStageId}-${module.id}`, source: module.workflowStageId, target: module.id })),
    ...graph.tasks.map((task) => ({ id: `${task.moduleId}-${task.id}`, source: task.moduleId, target: task.id }))
  ];

  return { canvasHeight, edges, nodes };
}

function edgePath(source: DisplayNode, target: DisplayNode) {
  const startX = source.x + source.width / 2 + EDGE_INSET;
  const startY = source.y;
  const endX = target.x - target.width / 2 - EDGE_INSET;
  const endY = target.y;
  const distanceX = Math.abs(endX - startX);
  const controlOffset = Math.max(72, distanceX * 0.42);
  const controlAX = startX + controlOffset;
  const controlBX = endX - controlOffset;

  return `M ${startX} ${startY} C ${controlAX} ${startY}, ${controlBX} ${endY}, ${endX} ${endY}`;
}

function buildRelatedIds(graph: CourseAbilityGraphPayload, selectedNodeId: string) {
  const ids = new Set<string>();
  const rootId = graph.courseAbilityMap.rootNode.id;
  ids.add(rootId);
  ids.add(selectedNodeId);

  if (selectedNodeId === rootId) {
    graph.workflowStages.forEach((stage) => ids.add(stage.id));
    graph.teachingModules.forEach((module) => ids.add(module.id));
    graph.tasks.forEach((task) => ids.add(task.id));
    return ids;
  }

  const selectedStage = graph.workflowStages.find((stage) => stage.id === selectedNodeId);
  const selectedModule = graph.teachingModules.find((module) => module.id === selectedNodeId);
  const selectedTask = graph.tasks.find((task) => task.id === selectedNodeId);

  if (selectedStage) {
    selectedStage.moduleIds.forEach((moduleId) => {
      ids.add(moduleId);
      graph.tasks.filter((task) => task.moduleId === moduleId).forEach((task) => ids.add(task.id));
    });
  }

  if (selectedModule) {
    ids.add(selectedModule.workflowStageId);
    selectedModule.taskIds.forEach((taskId) => ids.add(taskId));
  }

  if (selectedTask) {
    const module = graph.teachingModules.find((item) => item.id === selectedTask.moduleId);
    if (module) {
      ids.add(module.id);
      ids.add(module.workflowStageId);
    }
  }

  return ids;
}

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function CourseAbilityGraphView({
  graph,
  mappableModuleIds = [],
  onOpenCourseMappingFromModule,
  onSelectNode,
  selectedNodeId
}: {
  graph: CourseAbilityGraphPayload;
  mappableModuleIds?: string[];
  onOpenCourseMappingFromModule?: (moduleId: string) => void;
  onSelectNode: (nodeId: string) => void;
  selectedNodeId: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<CanvasDragState | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [pan, setPan] = useState<CanvasPan>({ x: FIT_PADDING, y: FIT_PADDING });
  const [zoom, setZoom] = useState(1);
  const { canvasHeight, edges, nodes } = useMemo(() => buildDisplay(graph), [graph]);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const relatedNodeIds = buildRelatedIds(graph, selectedNodeId);
  const mappableModuleIdSet = new Set(mappableModuleIds);
  const rootId = graph.courseAbilityMap.rootNode.id;

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
      Math.min((canvasElement.clientWidth - FIT_PADDING) / CANVAS_WIDTH, (canvasElement.clientHeight - FIT_PADDING) / canvasHeight, 1)
    );

    setZoom(nextZoom);
    setPan({
      x: (canvasElement.clientWidth - CANVAS_WIDTH * nextZoom) / 2,
      y: (canvasElement.clientHeight - canvasHeight * nextZoom) / 2
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
    <div className="rounded-[28px] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-3">
      <div
        ref={scrollRef}
        data-capability-graph-canvas="true"
        tabIndex={0}
        onKeyDown={handleCanvasKeyDown}
        onPointerCancel={endCanvasDrag}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={endCanvasDrag}
        className={cn(
          "relative h-[720px] cursor-grab overflow-hidden rounded-[24px] border border-blue-100 bg-[length:auto,44px_44px,44px_44px] outline-none focus:ring-4 focus:ring-blue-200",
          isPanning && "cursor-grabbing select-none"
        )}
        style={{ backgroundImage: "var(--cap-graph-bg)" }}
      >
        <div className="absolute right-4 top-4 z-50 flex w-fit items-center gap-1 rounded-full border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur">
          <button
            type="button"
            aria-label="适应窗口"
            onClick={fitToView}
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

        <div className="absolute inset-0">
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              height: canvasHeight,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              width: CANVAS_WIDTH
            }}
          >
            <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" viewBox={`0 0 ${CANVAS_WIDTH} ${canvasHeight}`} aria-hidden="true">
              {edges.map((edge) => {
                const source = nodeMap.get(edge.source);
                const target = nodeMap.get(edge.target);
                if (!source || !target) return null;

                const rootSelected = selectedNodeId === rootId;
                const selected = !rootSelected && (selectedNodeId === source.id || selectedNodeId === target.id);
                const related = relatedNodeIds.has(source.id) && relatedNodeIds.has(target.id);
                return (
                  <path
                    key={edge.id}
                    d={edgePath(source, target)}
                    fill="none"
                    stroke={selected ? "rgba(37, 99, 235, 0.82)" : related ? (rootSelected ? "rgba(37, 99, 235, 0.24)" : "rgba(37, 99, 235, 0.4)") : "rgba(100, 116, 139, 0.16)"}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={selected ? 2.1 : related ? (rootSelected ? 1.1 : 1.45) : 1}
                  />
                );
              })}
            </svg>

            {nodes.map((node) => {
              const selected = selectedNodeId === node.id;
              const related = relatedNodeIds.has(node.id);
              const mappable = node.kind === "module" && mappableModuleIdSet.has(node.id);

              return (
                <div
                  key={node.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  data-graph-node="true"
                  style={{ left: node.x, top: node.y, zIndex: selected ? 40 : mappable ? 20 : 10 }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectNode(node.id)}
                    className={cn(
                      "flex h-full w-full flex-col justify-center border text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-200",
                      node.kind === "course" && "items-center rounded-[24px] border-blue-500 bg-blue-600 px-5 text-center text-white shadow-[0_20px_50px_rgba(37,99,235,0.28)]",
                      node.kind === "workflow" && "rounded-[22px] border-blue-200 bg-white px-5 text-slate-950",
                      node.kind === "module" && "rounded-[22px] border-blue-200 bg-blue-50 px-4 text-slate-950",
                      node.kind === "task" && "rounded-2xl border-slate-200 bg-white px-4 text-slate-900",
                      selected && "z-20 scale-[1.02] border-blue-500 ring-4 ring-blue-300 shadow-[0_22px_54px_rgba(37,99,235,0.24)]",
                      !selected && !related && selectedNodeId !== rootId && "opacity-35"
                    )}
                    style={{
                      height: node.height,
                      width: node.width
                    }}
                    title={node.description}
                  >
                    <span className={cn("text-[11px] font-bold", node.kind === "course" ? "text-blue-100" : "text-blue-700")}>{node.subtitle}</span>
                    <span
                      className={cn(
                        "mt-1 font-black leading-tight",
                        node.kind === "course" ? "text-lg" : node.kind === "task" ? "line-clamp-2 text-[13px]" : "line-clamp-2 text-sm"
                      )}
                    >
                      {node.kind === "course" ? `课程${node.title}` : node.title}
                    </span>
                    {node.kind === "module" && node.module?.hours ? (
                      <span className="mt-2 w-fit rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-blue-700">{node.module.hours} 学时</span>
                    ) : null}
                    {node.kind === "workflow" && node.stage ? (
                      <span className="mt-2 text-xs font-semibold text-slate-500">{node.stage.moduleIds.length} 个教学模块</span>
                    ) : null}
                  </button>
                  {mappable ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenCourseMappingFromModule?.(node.id);
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      className="absolute bottom-2 right-3 z-30 whitespace-nowrap rounded-full border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-black text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-200"
                      title={`查看${node.title}的课程映射`}
                    >
                      课程映射
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
