"use client";

import { Archive, Box, Boxes, Check, ChevronRight, Clock3, Download, Eye, FileUp, Grid2X2, History, Info, Layers, MoreHorizontal, Package, RotateCcw, Save, Sparkles, Star, Trash2, Undo2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { isModel3DTaskProcessing, Model3DOperationRecord, Model3DSceneNode, Model3DSceneSelection, Model3DSceneTransform, Model3DTask } from "@/components/model3d/model3d-data";
import { cn } from "@/lib/utils";

type RightPanelTab = "assets" | "properties" | "history";

const tabItems: Array<{ value: RightPanelTab; label: string; icon: typeof Package }> = [
  { value: "assets", label: "资产", icon: Archive },
  { value: "properties", label: "属性", icon: Layers },
  { value: "history", label: "历史记录", icon: History }
];

export function Model3DHistoryPanel({
  tasks,
  activeTaskId,
  sceneHierarchy,
  sceneSelection,
  hiddenNodeIds,
  isolatedNodeId,
  onSelect,
  onSceneNodeSelect,
  onSceneNodeVisibilityToggle,
  onSceneNodeIsolate,
  onSceneTransformChange,
  onOperationSelect,
  onSaveOperationAsAsset,
  onDelete,
  onDownload,
  onUploadModel
}: {
  tasks: Model3DTask[];
  activeTaskId: string | null;
  sceneHierarchy: Model3DSceneNode | null;
  sceneSelection: Model3DSceneSelection | null;
  hiddenNodeIds: string[];
  isolatedNodeId: string | null;
  onSelect: (task: Model3DTask) => void;
  onSceneNodeSelect: (nodeId: string) => void;
  onSceneNodeVisibilityToggle: (nodeId: string) => void;
  onSceneNodeIsolate: (nodeId: string) => void;
  onSceneTransformChange: (nodeId: string, transform: Model3DSceneTransform) => void;
  onOperationSelect: (task: Model3DTask, operation: Model3DOperationRecord) => void;
  onSaveOperationAsAsset: (task: Model3DTask, operationTitle: string) => void;
  onDelete: (task: Model3DTask) => void;
  onDownload: (task: Model3DTask) => void;
  onUploadModel: () => void;
}) {
  const [activeTab, setActiveTab] = useState<RightPanelTab>("assets");
  const [assetMenuTaskId, setAssetMenuTaskId] = useState<string | null>(null);
  const [managementOpen, setManagementOpen] = useState(false);
  const activeTask = tasks.find((task) => task.id === activeTaskId) || tasks[0] || null;

  return (
    <aside className="model3d-history-panel flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text)] shadow-soft">
      <nav className="grid h-10 shrink-0 grid-cols-3 overflow-hidden border-b border-[color:var(--color-border)] bg-[var(--color-soft)] text-[11px] font-semibold">
        {tabItems.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setActiveTab(tab.value);
                setAssetMenuTaskId(null);
                setManagementOpen(false);
              }}
              className={cn("flex items-center justify-center gap-1.5 text-[var(--color-text-muted)] transition hover:bg-[var(--color-panel)] hover:text-[var(--color-text)]", active && "bg-gradient-to-r from-blue-500 to-cyan-400 !text-white hover:!text-white")}
              title={tab.label}
            >
              <Icon className="h-3.5 w-3.5" />
              {active ? <span>{tab.label}</span> : null}
            </button>
          );
        })}
      </nav>

      {activeTab === "assets" ? (
        <AssetsPanel
          tasks={tasks}
          activeTaskId={activeTaskId}
          openMenuTaskId={assetMenuTaskId}
          managementOpen={managementOpen}
          onUploadModel={onUploadModel}
          onToggleManagement={() => setManagementOpen((value) => !value)}
          onSelect={onSelect}
          onDelete={onDelete}
          onDownload={onDownload}
          onToggleTaskMenu={(taskId) => setAssetMenuTaskId((current) => (current === taskId ? null : taskId))}
        />
      ) : null}

      {activeTab === "properties" ? <PropertiesPanel task={activeTask} sceneHierarchy={sceneHierarchy} sceneSelection={sceneSelection} hiddenNodeIds={hiddenNodeIds} isolatedNodeId={isolatedNodeId} onSceneNodeSelect={onSceneNodeSelect} onSceneNodeVisibilityToggle={onSceneNodeVisibilityToggle} onSceneNodeIsolate={onSceneNodeIsolate} onSceneTransformChange={onSceneTransformChange} /> : null}
      {activeTab === "history" ? <OperationsPanel tasks={tasks} activeTask={activeTask} onOperationSelect={onOperationSelect} onSaveOperationAsAsset={onSaveOperationAsAsset} onSelect={onSelect} /> : null}
    </aside>
  );
}

function AssetsPanel({
  tasks,
  activeTaskId,
  openMenuTaskId,
  managementOpen,
  onUploadModel,
  onToggleManagement,
  onSelect,
  onDelete,
  onDownload,
  onToggleTaskMenu
}: {
  tasks: Model3DTask[];
  activeTaskId: string | null;
  openMenuTaskId: string | null;
  managementOpen: boolean;
  onUploadModel: () => void;
  onToggleManagement: () => void;
  onSelect: (task: Model3DTask) => void;
  onDelete: (task: Model3DTask) => void;
  onDownload: (task: Model3DTask) => void;
  onToggleTaskMenu: (taskId: string) => void;
}) {
  return (
    <div className="model3d-assets-panel min-h-0 flex-1 overflow-y-auto p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconPill active icon={Grid2X2} label="网格视图" />
          <IconPill icon={Star} label="收藏资产" />
          <IconPill icon={Box} label="筛选资产" />
        </div>
        <div className="relative">
          <button type="button" onClick={onToggleManagement} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 px-3 text-[11px] font-bold !text-white shadow">
            <Archive className="h-3.5 w-3.5" />
            管理
          </button>
          {managementOpen ? (
            <div className="absolute right-0 top-10 z-[120] grid w-40 gap-1 rounded-xl border border-[color:var(--color-border)] bg-[var(--color-panel)] p-2 text-xs font-semibold text-[var(--color-text)] shadow-[var(--shadow-panel)]">
              <button type="button" onClick={() => tasks.forEach((task) => task.modelUrl && onDownload(task))} className="flex h-9 items-center gap-2 rounded-lg px-3 text-left hover:bg-[var(--color-soft)] hover:text-blue-500">
                <Download className="h-4 w-4" />
                批量导出
              </button>
              <button type="button" onClick={() => tasks.forEach(onDelete)} className="flex h-9 items-center gap-2 rounded-lg px-3 text-left hover:bg-red-500/10 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
                批量删除
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="model3d-asset-grid grid grid-cols-2 gap-3">
        <button type="button" onClick={onUploadModel} className="model3d-asset-upload grid aspect-square place-items-center rounded-xl border border-dashed border-[color:var(--color-border-strong)] bg-[linear-gradient(45deg,rgba(59,130,246,0.05)_25%,transparent_25%,transparent_50%,rgba(59,130,246,0.05)_50%,rgba(59,130,246,0.05)_75%,transparent_75%,transparent)] bg-[length:14px_14px] text-center text-xs text-[var(--color-text-muted)] transition hover:border-blue-300 hover:bg-[var(--color-soft)]">
          <span>
            <FileUp className="mx-auto h-5 w-5" />
            <span className="mt-2 block font-bold text-[var(--color-text)]">上传 3D 模型</span>
            <span className="mt-1 block leading-4">支持 GLB, GLTF,<br />FBX, OBJ 格式</span>
          </span>
        </button>

        {tasks.map((task) => (
          <AssetCard
            key={task.id}
            task={task}
            active={activeTaskId === task.id}
            menuOpen={openMenuTaskId === task.id}
            onSelect={() => onSelect(task)}
            onDelete={() => onDelete(task)}
            onToggleMenu={() => onToggleTaskMenu(task.id)}
          />
        ))}
      </div>
    </div>
  );
}

function IconPill({ icon: Icon, label, active = false }: { icon: typeof Box; label: string; active?: boolean }) {
  return (
    <button type="button" className={cn("model3d-icon-pill grid h-8 w-8 place-items-center rounded-full bg-[var(--color-soft)] text-[var(--color-text-muted)] transition hover:bg-[var(--color-soft)] hover:text-blue-500", active && "bg-gradient-to-r from-blue-500 to-cyan-400 !text-white hover:!text-white")} title={label}>
      <Icon className={cn("h-4 w-4", active && "!text-white")} />
    </button>
  );
}

function AssetCard({
  task,
  active,
  menuOpen,
  onSelect,
  onDelete,
  onToggleMenu
}: {
  task: Model3DTask;
  active: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onToggleMenu: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn("model3d-asset-card group relative aspect-square overflow-visible rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] text-left transition hover:border-blue-300 hover:bg-[var(--color-panel)]", active && "border-blue-300 bg-[var(--color-panel)] shadow-sm ring-1 ring-blue-300/35")}
      title={`${task.title}\n${formatDateTime(task.updatedAt)}`}
    >
      {task.previewImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={task.previewImageUrl} alt={task.title} className="h-full w-full rounded-xl object-cover" />
      ) : (
        <div className="grid h-full place-items-center rounded-xl bg-[radial-gradient(circle_at_50%_35%,rgba(59,130,246,0.14),transparent_45%),var(--color-soft)]">
          <Box className="h-7 w-7 text-[var(--color-text-faint)]" />
        </div>
      )}
      <span className="pointer-events-none absolute left-2 top-1.5 hidden rounded-full border border-[color:var(--color-border)] bg-[var(--color-panel)]/95 px-2 py-0.5 text-[10px] font-semibold text-blue-500 shadow group-hover:block">{formatShortDate(task.updatedAt)}</span>
      <span className="absolute bottom-1.5 left-1.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--color-panel)]/90 text-blue-500 shadow">
        <Info className="h-3 w-3" />
      </span>
      <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
        {active ? <Star className="h-4 w-4 fill-blue-500 text-blue-500 drop-shadow" /> : null}
        <span
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onToggleMenu();
          }}
          className="grid h-6 w-6 place-items-center rounded-full bg-[var(--color-panel)]/90 text-[var(--color-text-muted)] shadow hover:bg-blue-500 hover:!text-white"
          aria-label="打开资产菜单"
        >
          <MoreHorizontal className="h-4 w-4" />
        </span>
      </span>
      <span className="absolute left-1.5 top-1.5">
        <StatusPill status={task.status} />
      </span>
      {menuOpen ? (
        <span className="absolute bottom-9 right-1.5 z-[120] grid min-w-24 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-panel)] p-1 text-xs font-semibold text-[var(--color-text)] shadow-[var(--shadow-panel)]">
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className="flex h-8 items-center gap-2 rounded-md px-2 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </span>
        </span>
      ) : null}
    </button>
  );
}

function PropertiesPanel({
  task,
  sceneHierarchy,
  sceneSelection,
  hiddenNodeIds,
  isolatedNodeId,
  onSceneNodeSelect,
  onSceneNodeVisibilityToggle,
  onSceneNodeIsolate,
  onSceneTransformChange
}: {
  task: Model3DTask | null;
  sceneHierarchy: Model3DSceneNode | null;
  sceneSelection: Model3DSceneSelection | null;
  hiddenNodeIds: string[];
  isolatedNodeId: string | null;
  onSceneNodeSelect: (nodeId: string) => void;
  onSceneNodeVisibilityToggle: (nodeId: string) => void;
  onSceneNodeIsolate: (nodeId: string) => void;
  onSceneTransformChange: (nodeId: string, transform: Model3DSceneTransform) => void;
}) {
  const hierarchy = sceneHierarchy;
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());

  function toggleHierarchyNode(nodeId: string) {
    setCollapsedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 py-2 text-xs font-bold text-[var(--color-text)]">
        <span>层级</span>
        <span className="rounded-full bg-[var(--color-soft)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">{hierarchy?.meshCount || 0} Mesh</span>
      </div>
      <div className="mx-3 mb-2 rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 py-2 text-[10px] leading-relaxed text-[var(--color-text-muted)]">
        当前选中整个模型；展开层级后点击子层级，可单独选择并编辑该部件。
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {hierarchy ? (
          <HierarchyTree node={hierarchy} activeNodeId={sceneSelection?.id || "scene-root"} collapsedNodeIds={collapsedNodeIds} hiddenNodeIds={hiddenNodeIds} isolatedNodeId={isolatedNodeId} onSceneNodeSelect={onSceneNodeSelect} onSceneNodeVisibilityToggle={onSceneNodeVisibilityToggle} onSceneNodeIsolate={onSceneNodeIsolate} onToggleNode={toggleHierarchyNode} />
        ) : (
          <div className="mx-3 rounded-xl border border-dashed border-[color:var(--color-border)] bg-[var(--color-panel)] px-3 py-8 text-center text-xs font-medium text-[var(--color-text-faint)]">
            暂无真实模型层级；生成或导入模型后显示 GLB/GLTF/FBX/OBJ 节点。
          </div>
        )}
      </div>
      <TransformPanel selection={sceneSelection} onSceneTransformChange={onSceneTransformChange} />
    </div>
  );
}

function HierarchyTree({
  node,
  activeNodeId,
  collapsedNodeIds,
  hiddenNodeIds,
  isolatedNodeId,
  depth = 0,
  inheritedHidden = false,
  onSceneNodeSelect,
  onSceneNodeVisibilityToggle,
  onSceneNodeIsolate,
  onToggleNode
}: {
  node: Model3DSceneNode;
  activeNodeId: string;
  collapsedNodeIds: Set<string>;
  hiddenNodeIds: string[];
  isolatedNodeId: string | null;
  depth?: number;
  inheritedHidden?: boolean;
  onSceneNodeSelect: (nodeId: string) => void;
  onSceneNodeVisibilityToggle: (nodeId: string) => void;
  onSceneNodeIsolate: (nodeId: string) => void;
  onToggleNode: (nodeId: string) => void;
}) {
  const hasChildren = Boolean(node.children?.length);
  const collapsed = collapsedNodeIds.has(node.id);
  const hidden = hiddenNodeIds.includes(node.id);
  const effectivelyHidden = hidden || inheritedHidden;
  const isolated = isolatedNodeId === node.id;
  return (
    <>
      <HierarchyRow active={activeNodeId === node.id} collapsed={collapsed} depth={depth} hasChildren={hasChildren} hidden={hidden} inheritedHidden={inheritedHidden} isolated={isolated} meshCount={node.meshCount} name={node.name} type={node.type} onSelect={() => onSceneNodeSelect(node.id)} onToggle={() => onToggleNode(node.id)} onVisibilityToggle={() => onSceneNodeVisibilityToggle(node.id)} onIsolate={() => onSceneNodeIsolate(node.id)} />
      {!collapsed ? node.children?.map((child) => <HierarchyTree key={child.id} node={child} activeNodeId={activeNodeId} collapsedNodeIds={collapsedNodeIds} hiddenNodeIds={hiddenNodeIds} isolatedNodeId={isolatedNodeId} inheritedHidden={effectivelyHidden} depth={depth + 1} onSceneNodeSelect={onSceneNodeSelect} onSceneNodeVisibilityToggle={onSceneNodeVisibilityToggle} onSceneNodeIsolate={onSceneNodeIsolate} onToggleNode={onToggleNode} />) : null}
    </>
  );
}

function HierarchyRow({
  name,
  type,
  meshCount,
  active = false,
  collapsed,
  depth = 0,
  hasChildren,
  hidden,
  inheritedHidden,
  isolated,
  onSelect,
  onToggle,
  onVisibilityToggle,
  onIsolate
}: {
  name: string;
  type: Model3DSceneNode["type"];
  meshCount: number;
  active?: boolean;
  collapsed: boolean;
  depth?: number;
  hasChildren: boolean;
  hidden: boolean;
  inheritedHidden: boolean;
  isolated: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onVisibilityToggle: () => void;
  onIsolate: () => void;
}) {
  return (
    <button type="button" onClick={onSelect} className={cn("group flex h-9 w-full items-center gap-2 border-l-2 border-transparent px-3 text-left text-xs font-semibold text-[var(--color-text-muted)] transition hover:bg-[var(--color-soft)] hover:text-[var(--color-text)]", active && "border-l-slate-400 bg-[var(--color-soft)] text-[var(--color-text)] ring-1 ring-inset ring-[color:var(--color-border)]", (hidden || inheritedHidden) && "opacity-45")} style={{ paddingLeft: 12 + depth * 18 }}>
      <span
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onIsolate();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onIsolate();
          }
        }}
        className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-black text-[var(--color-text-muted)] opacity-70 transition hover:bg-[var(--color-soft)] hover:text-[var(--color-text)] group-hover:opacity-100", isolated && "bg-[var(--color-soft)] text-blue-500 opacity-100 shadow-sm")}
        aria-label={isolated ? "取消隔离层级" : "隔离显示层级"}
        title={isolated ? "取消隔离" : "Solo 隔离"}
      >
        S
      </span>
      <span
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          if (hasChildren) onToggle();
        }}
        onKeyDown={(event) => {
          if (!hasChildren) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onToggle();
          }
        }}
        className={cn("grid h-4 w-4 shrink-0 place-items-center rounded text-[var(--color-text-muted)] transition", hasChildren && "hover:bg-[var(--color-soft)] hover:text-[var(--color-text)]", !hasChildren && "opacity-0")}
        aria-label={collapsed ? "展开层级" : "收起层级"}
      >
        <ChevronRight className={cn("h-3.5 w-3.5 transition", hasChildren && !collapsed && "rotate-90")} />
      </span>
      {depth === 0 ? <Boxes className={cn("h-3.5 w-3.5 text-[var(--color-text-muted)]", active && "text-[var(--color-text)]")} /> : <Box className={cn("h-3.5 w-3.5 text-[var(--color-text-muted)]", active && "text-[var(--color-text)]")} />}
      <span className="min-w-0 flex-1 truncate">{depth === 0 ? "整个模型" : name}</span>
      <span className={cn("rounded-full bg-[var(--color-soft)] px-1.5 py-0.5 text-[9px] uppercase text-[var(--color-text-faint)]", active && "bg-[var(--color-panel)] text-[var(--color-text-muted)]")}>{depth === 0 ? "Root" : type === "mesh" ? "Mesh" : meshCount}</span>
      <span
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onVisibilityToggle();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onVisibilityToggle();
          }
        }}
        className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[var(--color-text-muted)] opacity-70 transition hover:bg-[var(--color-soft)] hover:text-[var(--color-text)] group-hover:opacity-100", active && "text-[var(--color-text)] opacity-100", hidden && "bg-[var(--color-soft)] text-[var(--color-text-faint)]")}
        aria-label={hidden ? "显示层级" : "隐藏层级"}
      >
        <Eye className="h-3.5 w-3.5" />
      </span>
      <MoreHorizontal className="h-4 w-4 text-[var(--color-text-muted)]" />
    </button>
  );
}

function TransformPanel({ selection, onSceneTransformChange }: { selection: Model3DSceneSelection | null; onSceneTransformChange: (nodeId: string, transform: Model3DSceneTransform) => void }) {
  const transform = selection?.transform || {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  };

  function updateTransform(axisGroup: keyof Model3DSceneTransform, axisIndex: number, value: number) {
    if (!selection || Number.isNaN(value)) return;
    const nextTransform: Model3DSceneTransform = {
      position: [...selection.transform.position],
      rotation: [...selection.transform.rotation],
      scale: [...selection.transform.scale]
    };
    nextTransform[axisGroup][axisIndex] = value;
    onSceneTransformChange(selection.id, nextTransform);
  }

  return (
    <div className="border-t border-[color:var(--color-border)] p-3">
      <div className="mb-3 flex items-center justify-between text-xs font-bold text-[var(--color-text)]">
        <span>变换</span>
        <RotateCcw className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
      </div>
      <TransformRow disabled={!selection} label="移动" values={transform.position} onChange={(axisIndex, value) => updateTransform("position", axisIndex, value)} />
      <TransformRow disabled={!selection} label="旋转" values={transform.rotation} onChange={(axisIndex, value) => updateTransform("rotation", axisIndex, value)} />
      <TransformRow disabled={!selection} label="缩放" values={transform.scale} onChange={(axisIndex, value) => updateTransform("scale", axisIndex, value)} />
    </div>
  );
}

function TransformRow({ disabled, label, values, onChange }: { disabled: boolean; label: string; values: number[]; onChange: (axisIndex: number, value: number) => void }) {
  return (
    <div className="mb-2 grid grid-cols-[20px_1fr_1fr_1fr] items-center gap-2 text-[10px]">
      <span className="text-[var(--color-text-faint)]">{label.slice(0, 1)}</span>
      {["X", "Y", "Z"].map((axis, index) => (
        <label key={axis} className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-2 py-1.5 text-center">
          <span className="mr-1 text-blue-500">{axis}</span>
          <input
            type="number"
            disabled={disabled}
            step="0.01"
            value={formatTransformValue(values[index])}
            onChange={(event) => onChange(index, Number(event.target.value))}
            className="w-12 bg-transparent text-center font-bold text-[var(--color-text)] outline-none disabled:opacity-60"
          />
        </label>
      ))}
    </div>
  );
}

function formatTransformValue(value: number) {
  return value.toFixed(2);
}

function OperationsPanel({ tasks, activeTask, onOperationSelect, onSaveOperationAsAsset, onSelect }: { tasks: Model3DTask[]; activeTask: Model3DTask | null; onOperationSelect: (task: Model3DTask, operation: Model3DOperationRecord) => void; onSaveOperationAsAsset: (task: Model3DTask, operationTitle: string) => void; onSelect: (task: Model3DTask) => void }) {
  const operations = useMemo(() => buildOperations(tasks), [tasks]);
  const [activeOperationId, setActiveOperationId] = useState<string | null>(null);
  const [menuOperationId, setMenuOperationId] = useState<string | null>(null);
  const [baselineOperation, setBaselineOperation] = useState<OperationRecord | null>(null);

  function selectOperation(operation: OperationRecord) {
    if (!baselineOperation) {
      const currentOperation = activeOperationId ? operations.find((item) => item.id === activeOperationId) : null;
      const latestActiveOperation = operations.find((item) => item.task.id === (activeTask?.id || operation.task.id));
      setBaselineOperation(currentOperation || latestActiveOperation || operation);
    }
    setActiveOperationId(operation.id);
    setMenuOperationId(null);
    onOperationSelect(operation.task, operation.operation);
  }

  function restoreCurrentVersion() {
    if (baselineOperation) {
      setActiveOperationId(baselineOperation.id);
      onOperationSelect(baselineOperation.task, baselineOperation.operation);
    }
    setBaselineOperation(null);
    setMenuOperationId(null);
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {baselineOperation && activeOperationId !== baselineOperation.id ? (
        <div className="sticky top-0 z-10 border-b border-[color:var(--color-border)] bg-[var(--color-panel)] px-3 py-2">
          <button type="button" onClick={restoreCurrentVersion} className="h-8 rounded-full bg-[var(--color-soft)] px-3 text-[11px] font-bold text-[var(--color-text)] transition hover:bg-[var(--color-panel)]">
            当前版本
          </button>
        </div>
      ) : null}
      {operations.length ? (
        operations.map((operation) => {
          const active = activeOperationId ? activeOperationId === operation.id : activeTask?.id === operation.task?.id;
          return (
            <div
              key={operation.id}
              className={cn("relative flex h-12 w-full items-center gap-3 px-3 text-left text-xs font-bold text-[var(--color-text-muted)] transition hover:bg-[var(--color-soft)] hover:text-[var(--color-text)]", active && "bg-[var(--color-soft)] !text-[var(--color-text)] ring-1 ring-inset ring-[color:var(--color-border)] hover:bg-[var(--color-soft)]")}
            >
              <button type="button" onClick={() => selectOperation(operation)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className={cn("grid h-6 w-6 place-items-center rounded-full bg-[var(--color-soft)] text-[var(--color-text-faint)]", active && "bg-[var(--color-panel)] text-blue-500")}>
                  {operation.kind === "model" || operation.kind === "transform" ? <Sparkles className={cn("h-3.5 w-3.5", active && "text-blue-500")} /> : <Box className={cn("h-3.5 w-3.5", active && "text-blue-500")} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{operation.title}</span>
                  <span className="mt-0.5 block truncate text-[10px] font-medium text-[var(--color-text-faint)]">{operation.createdAt}</span>
                </span>
              </button>
              <button type="button" onClick={() => setMenuOperationId((current) => (current === operation.id ? null : operation.id))} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--color-text-muted)] transition hover:bg-[var(--color-soft)] hover:text-[var(--color-text)]" aria-label="打开历史记录菜单">
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menuOperationId === operation.id ? (
                <div className="absolute right-2 top-10 z-[120] grid w-36 gap-1 rounded-xl border border-[color:var(--color-border)] bg-[var(--color-panel)] p-1.5 text-[11px] font-bold text-[var(--color-text)] shadow-[var(--shadow-panel)]">
                  <button type="button" onClick={() => selectOperation(operation)} className="flex h-8 items-center gap-2 rounded-lg px-2 text-left hover:bg-[var(--color-soft)]">
                    <Undo2 className="h-3.5 w-3.5 text-blue-500" />
                    恢复此版本
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSaveOperationAsAsset(operation.task, operation.title);
                      setMenuOperationId(null);
                    }}
                    className="flex h-8 items-center gap-2 rounded-lg px-2 text-left hover:bg-[var(--color-soft)]"
                  >
                    <Save className="h-3.5 w-3.5 text-blue-500" />
                    另存为新模型
                  </button>
                </div>
              ) : null}
            </div>
          );
        })
      ) : (
        <div className="grid h-full place-items-center px-5 text-center text-xs text-[var(--color-text-muted)]">暂无历史记录</div>
      )}
    </div>
  );
}

type OperationRecord = {
  createdAt: string;
  id: string;
  title: string;
  kind: Model3DOperationRecord["kind"];
  operation: Model3DOperationRecord;
  task: Model3DTask;
};

function buildOperations(tasks: Model3DTask[]): OperationRecord[] {
  return tasks.flatMap((task) => {
    const records = task.operations?.length ? task.operations : [{ createdAt: task.createdAt, id: `${task.id}-model`, kind: "model" as const, title: "模型生成" }];
    return records.map((operation) => ({
      createdAt: operation.createdAt,
      id: `${task.id}-${operation.id}`,
      kind: operation.kind,
      operation,
      task,
      title: operation.title
    }));
  });
}

function StatusPill({ status }: { status: Model3DTask["status"] }) {
  if (status === "succeeded") {
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white">
        <Check className="h-3 w-3" />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full bg-red-500 text-white">
        <XCircle className="h-3 w-3" />
      </span>
    );
  }
  if (isModel3DTaskProcessing(status)) {
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-500 text-white">
        <Clock3 className="h-3 w-3" />
      </span>
    );
  }
  return <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--color-soft)] text-[var(--color-text-faint)]">·</span>;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getFullYear()}-${formatShortDate(value)}`;
}
