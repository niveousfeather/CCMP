"use client";

import { FileText, Network, ShieldCheck } from "lucide-react";

import { GraphCanvasShell, type GraphCanvasBounds } from "@/components/capability-map/graph-canvas-shell";
import type { ProcessGraphNode, ProcessGraphStage } from "@/lib/capability-map/course-ability-graph";
import { cn } from "@/lib/utils";

const LEVELS = [1, 2, 3] as const;
const CANVAS_PAD_X = 56;
const CANVAS_PAD_TOP = 34;
const CANVAS_PAD_BOTTOM = 74;
const COLUMN_GAP = 110;
const COLUMN_HEADER_HEIGHT = 42;
const COLUMN_HEADER_GAP = 34;
const NODE_GAP = 24;
const EDGE_INSET = 16;
const COLUMN_HEADER_WIDTH = 176;
const NODE_WIDTH: Record<ProcessGraphNode["level"], number> = {
  1: 230,
  2: 250,
  3: 240
};

const TYPE_LABEL: Record<ProcessGraphNode["type"], string> = {
  ability: "专业能力",
  courseModule: "课程模块",
  coreCourse: "核心课程",
  coursePosition: "课程定位",
  element: "能力要素",
  impact: "课程影响",
  industry: "产业领域",
  job: "典型岗位",
  region: "区域方向",
  trend: "生产变化"
};

const TYPE_CLASS: Record<ProcessGraphNode["type"], string> = {
  ability: "border-violet-200 bg-violet-50 text-violet-800",
  courseModule: "border-blue-200 bg-blue-50 text-blue-800",
  coreCourse: "border-blue-200 bg-blue-50 text-blue-800",
  coursePosition: "border-cyan-200 bg-cyan-50 text-cyan-800",
  element: "border-indigo-200 bg-indigo-50 text-indigo-800",
  impact: "border-rose-200 bg-rose-50 text-rose-800",
  industry: "border-emerald-200 bg-emerald-50 text-emerald-800",
  job: "border-amber-200 bg-amber-50 text-amber-800",
  region: "border-teal-200 bg-teal-50 text-teal-800",
  trend: "border-sky-200 bg-sky-50 text-sky-800"
};

const COLUMN_LABELS: Record<ProcessGraphStage["id"], Record<ProcessGraphNode["level"], string>> = {
  industry: {
    1: "产业领域",
    2: "技术趋势 / 生产变化",
    3: "对课程的影响"
  },
  regionalJobs: {
    1: "区域产业方向",
    2: "典型岗位",
    3: "对应课程模块"
  },
  majorAbilities: {
    1: "专业能力类别",
    2: "能力要素",
    3: "对应课程模块"
  },
  coreCourses: {
    1: "专业能力类别",
    2: "建议核心课程",
    3: "课程定位 / 支撑岗位"
  }
};

type LayoutNode = ProcessGraphNode & {
  height: number;
  width: number;
  x: number;
  y: number;
};

function textLength(text: string) {
  return Array.from(text).length;
}

function lineCount(text: string | undefined, charsPerLine: number, maxLines: number) {
  if (!text) return 0;
  return Math.min(maxLines, Math.max(1, Math.ceil(textLength(text) / charsPerLine)));
}

function measureNode(node: ProcessGraphNode) {
  const width = NODE_WIDTH[node.level];
  const charsPerLine = Math.max(8, Math.floor((width - 36) / 14));
  const titleLines = lineCount(node.title, charsPerLine, 2);
  const subtitleLines = lineCount(node.subtitle, charsPerLine + 4, 1);
  const descriptionLines = lineCount(node.description, charsPerLine + 2, node.type === "coreCourse" ? 1 : 2);
  const hasTags = node.type !== "coreCourse" && Boolean(node.tags?.length);
  const actionSpace = node.type === "coreCourse" ? 28 : 0;

  return {
    height: Math.max(118, 52 + titleLines * 21 + subtitleLines * 16 + descriptionLines * 18 + (hasTags ? 24 : 0) + actionSpace),
    width
  };
}

function groupByLevel(nodes: ProcessGraphNode[], level: ProcessGraphNode["level"]) {
  return nodes.filter((node) => node.level === level);
}

function columnHeight(nodes: LayoutNode[]) {
  if (!nodes.length) return 0;
  return nodes.reduce((sum, node) => sum + node.height, 0) + Math.max(0, nodes.length - 1) * NODE_GAP;
}

function buildColumnCenters() {
  let cursorX = CANVAS_PAD_X;
  const centers = {} as Record<ProcessGraphNode["level"], number>;

  LEVELS.forEach((level, index) => {
    const width = NODE_WIDTH[level];
    centers[level] = cursorX + width / 2;
    cursorX += width + (index < LEVELS.length - 1 ? COLUMN_GAP : 0);
  });

  return {
    centers,
    contentWidth: cursorX + CANVAS_PAD_X
  };
}

function buildLayout(nodes: ProcessGraphNode[]) {
  const { centers, contentWidth } = buildColumnCenters();
  const columns = {
    1: groupByLevel(nodes, 1).map((node) => ({ ...node, ...measureNode(node), x: centers[1], y: 0 })),
    2: groupByLevel(nodes, 2).map((node) => ({ ...node, ...measureNode(node), x: centers[2], y: 0 })),
    3: groupByLevel(nodes, 3).map((node) => ({ ...node, ...measureNode(node), x: centers[3], y: 0 }))
  } satisfies Record<ProcessGraphNode["level"], LayoutNode[]>;

  const maxColumnHeight = Math.max(...LEVELS.map((level) => columnHeight(columns[level])), 1);
  const nodeAreaTop = CANVAS_PAD_TOP + COLUMN_HEADER_HEIGHT + COLUMN_HEADER_GAP;
  const contentHeight = nodeAreaTop + maxColumnHeight + CANVAS_PAD_BOTTOM;

  const placedNodes = LEVELS.flatMap((level) => {
    const column = columns[level];
    const totalHeight = columnHeight(column);
    let cursorY = nodeAreaTop + (maxColumnHeight - totalHeight) / 2;

    return column.map((node) => {
      const placedNode = {
        ...node,
        y: cursorY + node.height / 2
      };
      cursorY += node.height + NODE_GAP;
      return placedNode;
    });
  });

  const nodeBounds = placedNodes.reduce<GraphCanvasBounds>(
    (bounds, node) => ({
      maxX: Math.max(bounds.maxX, node.x + node.width / 2 + EDGE_INSET),
      maxY: Math.max(bounds.maxY, node.y + node.height / 2),
      minX: Math.min(bounds.minX, node.x - node.width / 2 - EDGE_INSET),
      minY: Math.min(bounds.minY, CANVAS_PAD_TOP, node.y - node.height / 2)
    }),
    {
      maxX: contentWidth - CANVAS_PAD_X,
      maxY: CANVAS_PAD_TOP + COLUMN_HEADER_HEIGHT,
      minX: CANVAS_PAD_X,
      minY: CANVAS_PAD_TOP
    }
  );

  return {
    bounds: nodeBounds,
    columnCenters: centers,
    contentHeight,
    contentWidth,
    nodeMap: new Map(placedNodes.map((node) => [node.id, node])),
    nodes: placedNodes
  };
}

function getRelatedNodeIds(stage: ProcessGraphStage, selectedNodeId: string) {
  const related = new Set<string>([selectedNodeId]);
  stage.edges.forEach((edge) => {
    if (edge.source === selectedNodeId) related.add(edge.target);
    if (edge.target === selectedNodeId) related.add(edge.source);
  });
  return related;
}

function edgePath(source: LayoutNode, target: LayoutNode) {
  const startX = source.x + source.width / 2 + EDGE_INSET;
  const startY = source.y;
  const endX = target.x - target.width / 2 - EDGE_INSET;
  const endY = target.y;
  const distance = Math.max(120, Math.abs(endX - startX));
  const control = distance * 0.42;
  return `M ${startX} ${startY} C ${startX + control} ${startY}, ${endX - control} ${endY}, ${endX} ${endY}`;
}

export function ProcessGraphStageView({
  currentNodeIds = [],
  generationKey,
  nodeActions = {},
  onSelectNode,
  selectedNodeId,
  stage
}: {
  currentNodeIds?: string[];
  generationKey?: string;
  nodeActions?: Record<string, { disabled?: boolean; label: string; onClick?: () => void; variant?: "primary" | "muted" }>;
  onSelectNode: (nodeId: string) => void;
  selectedNodeId: string | null;
  stage: ProcessGraphStage;
}) {
  const activeNodeId = selectedNodeId || stage.nodes[0]?.id || "";
  const { bounds, columnCenters, contentHeight, contentWidth, nodeMap, nodes } = buildLayout(stage.nodes);
  const relatedNodeIds = getRelatedNodeIds(stage, activeNodeId);

  return (
    <div className="grid min-w-0 gap-4">
      <GraphCanvasShell
        bounds={bounds}
        contentHeight={contentHeight}
        contentWidth={contentWidth}
        fitKey={`${stage.id}-${generationKey || "initial"}-${stage.nodes.map((node) => node.id).join("|")}`}
        fitPadding={88}
        viewportClassName="h-[720px] lg:h-[760px]"
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${contentWidth} ${contentHeight}`} aria-hidden="true">
          <defs>
            <marker id={`arrow-${stage.id}`} markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
              <path d="M 0 0 L 8 4 L 0 8 z" fill="rgba(37,99,235,0.58)" />
            </marker>
          </defs>

          {LEVELS.map((level) => {
            const headerX = columnCenters[level] - COLUMN_HEADER_WIDTH / 2;
            return (
              <g key={level}>
                {level < 3 ? (
                  <path
                    d={`M ${columnCenters[level] + COLUMN_HEADER_WIDTH / 2 + 18} ${CANVAS_PAD_TOP + COLUMN_HEADER_HEIGHT / 2} L ${
                      columnCenters[(level + 1) as ProcessGraphNode["level"]] - COLUMN_HEADER_WIDTH / 2 - 18
                    } ${CANVAS_PAD_TOP + COLUMN_HEADER_HEIGHT / 2}`}
                    fill="none"
                    stroke="rgba(37,99,235,0.32)"
                    strokeDasharray="5 8"
                    strokeLinecap="round"
                    strokeWidth={1.3}
                  />
                ) : null}
                <rect
                  x={headerX}
                  y={CANVAS_PAD_TOP}
                  width={COLUMN_HEADER_WIDTH}
                  height={COLUMN_HEADER_HEIGHT}
                  rx={14}
                  fill="rgba(15,23,42,0.72)"
                  stroke="rgba(148,163,184,0.38)"
                />
                <rect
                  x={headerX + 10}
                  y={CANVAS_PAD_TOP + 10}
                  width={22}
                  height={22}
                  rx={8}
                  fill="rgba(37,99,235,0.2)"
                  stroke="rgba(96,165,250,0.48)"
                />
                <text x={headerX + 21} y={CANVAS_PAD_TOP + 25} textAnchor="middle" className="fill-blue-200 text-[10px] font-black">
                  {level}
                </text>
                <text x={headerX + 42} y={CANVAS_PAD_TOP + 26} className="fill-slate-100 text-[12px] font-black">
                  {COLUMN_LABELS[stage.id][level]}
                </text>
              </g>
            );
          })}

          {stage.edges.map((edge, index) => {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            if (!source || !target) return null;
            const active = edge.source === activeNodeId || edge.target === activeNodeId;
            const related = relatedNodeIds.has(edge.source) && relatedNodeIds.has(edge.target);
            return (
              <g key={`${edge.source}-${edge.target}-${index}`}>
                <path
                  d={edgePath(source, target)}
                  fill="none"
                  markerEnd={active ? `url(#arrow-${stage.id})` : undefined}
                  stroke={active ? "rgba(37,99,235,0.72)" : related ? "rgba(37,99,235,0.42)" : "rgba(100,116,139,0.18)"}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={active ? 2.4 : related ? 1.8 : 1.2}
                />
                {active && edge.label ? (
                  <text
                    x={(source.x + target.x) / 2}
                    y={(source.y + target.y) / 2 - 8}
                    textAnchor="middle"
                    className="fill-blue-700 text-[11px] font-black"
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>

        {nodes.map((node) => {
          const selected = activeNodeId === node.id;
          const related = relatedNodeIds.has(node.id);
          const current = currentNodeIds.includes(node.id);
          const nodeAction = nodeActions[node.id];
          const visibleTags = node.type === "coreCourse" ? [] : node.tags?.slice(0, 2) || [];
          return (
            <div
              key={node.id}
              data-graph-node="true"
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2",
                selected && "z-20 scale-[1.02]",
                !selected && !related && "opacity-40"
              )}
              style={{
                height: node.height,
                left: node.x,
                top: node.y,
                width: node.width
              }}
              title={node.description}
            >
              <button
                type="button"
                onClick={() => onSelectNode(node.id)}
                className={cn(
                  "flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-200",
                  selected && "border-blue-500 ring-4 ring-blue-200 shadow-[0_20px_50px_rgba(37,99,235,0.2)]",
                  current && !selected && "border-blue-300 shadow-[0_14px_34px_rgba(37,99,235,0.14)]"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black", TYPE_CLASS[node.type])}>
                    {TYPE_LABEL[node.type]}
                  </span>
                  {typeof node.weight === "number" ? (
                    <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700">
                      {node.weight}%
                    </span>
                  ) : null}
                </div>
                <span className="mt-2 line-clamp-2 break-words text-[15px] font-black leading-[21px] text-slate-950">{node.title}</span>
                <span className="mt-1 line-clamp-1 break-words text-[11px] font-bold leading-4 text-slate-500">{node.subtitle}</span>
                <span
                  className={cn(
                    "mt-1.5 break-words text-xs font-semibold leading-[18px] text-slate-600",
                    node.type === "coreCourse" ? "line-clamp-1" : "line-clamp-2"
                  )}
                >
                  {node.description}
                </span>
                {visibleTags.length ? (
                  <span className="mt-auto flex flex-wrap gap-1.5 pt-2">
                    {visibleTags.map((tag, index) => (
                      <span key={`${node.id}-tag-${index}-${tag}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        {tag}
                      </span>
                    ))}
                  </span>
                ) : null}
              </button>
              {nodeAction ? (
                <button
                  type="button"
                  disabled={nodeAction.disabled}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!nodeAction.disabled) nodeAction.onClick?.();
                  }}
                  className={cn(
                    "absolute bottom-3 right-3 rounded-full border px-2.5 py-1 text-[10px] font-black transition",
                    nodeAction.variant === "primary"
                      ? "border-blue-500 bg-blue-600 text-white shadow-[0_10px_20px_rgba(37,99,235,0.22)] hover:bg-blue-700"
                      : "border-slate-200 bg-slate-50 text-slate-500",
                    nodeAction.disabled && "cursor-not-allowed opacity-80"
                  )}
                >
                  {nodeAction.label}
                </button>
              ) : null}
            </div>
          );
        })}
      </GraphCanvasShell>

      <div className="grid min-w-0 gap-3 md:grid-cols-3">
        {stage.keyItems.slice(0, 6).map((item, index) => (
          <div key={`${stage.id}-key-item-${index}-${item.title}`} className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <h3 className="min-w-0 text-sm font-black text-slate-950">{item.title}</h3>
              {item.metric ? <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-black text-blue-700">{item.metric}</span> : null}
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProcessGraphStageDetail({
  selectedNodeId,
  stage,
  teachingModules = []
}: {
  selectedNodeId: string | null;
  stage: ProcessGraphStage;
  teachingModules?: Array<{ id: string; name: string }>;
}) {
  const selectedNode = stage.nodes.find((node) => node.id === selectedNodeId) || stage.nodes[0];
  const moduleLabelById = new Map(teachingModules.map((module) => [module.id, module.name]));
  stage.nodes
    .filter((node) => node.type === "courseModule")
    .forEach((node) => {
      node.relatedModuleIds?.forEach((moduleId) => moduleLabelById.set(moduleId, node.title));
    });

  return (
    <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-[0_20px_60px_rgba(37,99,235,0.08)]">
      <div className="border-b border-slate-200 pb-4">
        <span className="inline-flex h-7 items-center rounded-full border border-blue-100 bg-blue-50 px-3 text-xs font-bold text-blue-700">
          {stage.title}
        </span>
        <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">{selectedNode?.title || stage.title}</h2>
        <p className="mt-2 text-sm text-slate-500">{selectedNode?.subtitle || "图谱推导阶段"}</p>
      </div>

      {selectedNode ? (
        <div className="mt-5 space-y-5">
          <div>
            <p className="flex items-center gap-2 text-sm font-black text-blue-700">
              <Network className="h-4 w-4" />
              阶段推导
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{stage.summary}</p>
          </div>

          <div>
            <p className="flex items-center gap-2 text-sm font-black text-blue-700">
              <ShieldCheck className="h-4 w-4" />
              节点说明
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{selectedNode.description}</p>
          </div>

          {selectedNode.relatedModuleIds?.length ? (
            <div>
              <p className="flex items-center gap-2 text-sm font-black text-blue-700">
                <Network className="h-4 w-4" />
                关联课程模块
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedNode.relatedModuleIds.map((moduleId, index) => (
                  <span key={`${selectedNode.id}-module-${index}-${moduleId}`} className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                    {moduleLabelById.get(moduleId) || "关联教学模块"}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {selectedNode.tags?.length ? (
            <div>
              <p className="text-sm font-black text-slate-950">关联项</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedNode.tags.map((tag, index) => (
                  <span key={`${selectedNode.id}-detail-tag-${index}-${tag}`} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 border-t border-slate-200 pt-5">
        <p className="flex items-center gap-2 text-sm font-black text-blue-700">
          <FileText className="h-4 w-4" />
          证据状态
        </p>
        <p className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">
          {stage.notice}
        </p>
      </div>
    </section>
  );
}
