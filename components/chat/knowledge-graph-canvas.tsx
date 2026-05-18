"use client";

import { ChangeEvent, FormEvent, PointerEvent, WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Network, Paperclip, RotateCcw, SendHorizontal, Sparkles, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";

import { cn } from "@/lib/utils";

type GraphCategory = {
  id: string;
  label: string;
  color: string;
};

type ApiGraphNode = {
  id: string;
  label: string;
  category: string;
  size?: number;
  description?: string;
};

type GraphNode = ApiGraphNode & {
  x: number;
  y: number;
  size: number;
};

type GraphLink = {
  source: string;
  target: string;
  label?: string;
  dashed?: boolean;
};

type GraphData = {
  title: string;
  subtitle?: string;
  categories: GraphCategory[];
  nodes: GraphNode[];
  links: GraphLink[];
};

type ApiGraphData = {
  title: string;
  subtitle?: string;
  status?: "pending" | "completed" | "failed";
  statusMessage?: string;
  taskId?: string;
  errorMessage?: string;
  categories: GraphCategory[];
  nodes: ApiGraphNode[];
  links: GraphLink[];
};

type GraphResponse = {
  graph?: ApiGraphData;
  status?: "pending" | "completed" | "failed";
  taskId?: string;
  message?: string;
};

type GraphTaskResponse = {
  task?: KnowledgeGraphHistoryItem & {
    message?: string | null;
    status?: "pending" | "completed" | "failed";
  };
  message?: string;
};

type KnowledgeGraphHistoryItem = {
  id: string;
  title: string;
  topic: string;
  summary?: string | null;
  graph: ApiGraphData;
  message?: string | null;
  status?: "pending" | "completed" | "failed";
  createdAt: string;
};

const defaultCategories: GraphCategory[] = [
  { id: "core", label: "核心主题", color: "#1d4ed8" },
  { id: "theory", label: "基础概念", color: "#2563eb" },
  { id: "method", label: "方法技能", color: "#0891b2" },
  { id: "practice", label: "实践任务", color: "#059669" },
  { id: "tools", label: "工具资源", color: "#d97706" },
  { id: "assessment", label: "评价拓展", color: "#7c3aed" }
];

const fallbackNodes: ApiGraphNode[] = [
  { id: "core", label: "三维动画教学", category: "core", size: 86, description: "围绕三维动画课程展开的核心主题，统筹理论、工具、实践和评价。" },
  { id: "theory", label: "基础理论", category: "theory", size: 58, description: "帮助学习者建立空间、运动和视觉表达的基本认知。" },
  { id: "space", label: "三维空间概念", category: "theory", size: 38, description: "理解坐标、透视、深度和空间关系，是三维创作的基础。" },
  { id: "motion", label: "运动规律", category: "theory", size: 40, description: "掌握节奏、缓动、重量感和动作连续性，让动画更自然。" },
  { id: "method", label: "制作方法", category: "method", size: 58, description: "把创意转化为模型、材质、动画和渲染成片的流程方法。" },
  { id: "modeling", label: "建模技术", category: "method", size: 42, description: "通过几何结构塑造角色、场景和道具，是视觉呈现的起点。" },
  { id: "material", label: "材质与纹理", category: "method", size: 40, description: "控制表面质感、颜色和细节，增强作品真实感与风格。" },
  { id: "practice", label: "项目实践", category: "practice", size: 58, description: "通过完整任务训练学生从设计到输出的综合制作能力。" },
  { id: "binding", label: "角色绑定", category: "practice", size: 40, description: "建立骨骼、控制器和变形关系，支持角色可控运动。" },
  { id: "keyframe", label: "关键帧动画", category: "practice", size: 42, description: "用关键姿态控制动作变化，是动画制作的核心技能。" },
  { id: "tools", label: "软件工具", category: "tools", size: 58, description: "选择合适工具完成建模、动画、材质、灯光和渲染任务。" },
  { id: "maya", label: "Maya", category: "tools", size: 36, description: "常用于专业三维动画、角色绑定和影视级制作流程。" },
  { id: "blender", label: "Blender", category: "tools", size: 36, description: "开源三维创作软件，适合建模、动画、渲染和教学实践。" },
  { id: "assessment", label: "评价拓展", category: "assessment", size: 58, description: "用于衡量作品质量、学习过程和后续拓展方向。" },
  { id: "rubric", label: "作品评价", category: "assessment", size: 36, description: "从技术完成度、创意表达和视觉效果等维度评价作品。" },
  { id: "path", label: "学习路径", category: "assessment", size: 38, description: "帮助学生从基础概念逐步过渡到综合项目和独立创作。" }
];

const fallbackLinks: GraphLink[] = [
  { source: "core", target: "theory" },
  { source: "core", target: "method" },
  { source: "core", target: "practice" },
  { source: "core", target: "tools" },
  { source: "core", target: "assessment" },
  { source: "theory", target: "space" },
  { source: "theory", target: "motion" },
  { source: "method", target: "modeling" },
  { source: "method", target: "material" },
  { source: "practice", target: "binding" },
  { source: "practice", target: "keyframe" },
  { source: "tools", target: "maya" },
  { source: "tools", target: "blender" },
  { source: "assessment", target: "rubric" },
  { source: "assessment", target: "path" },
  { source: "motion", target: "keyframe", dashed: true },
  { source: "maya", target: "binding", dashed: true },
  { source: "modeling", target: "material", dashed: true }
];

function getNodeById(nodes: GraphNode[], id: string) {
  return nodes.find((node) => node.id === id);
}

const GRAPH_WIDTH = 2600;
const GRAPH_HEIGHT = 1600;
const GRAPH_DEFAULT_ZOOM = 0.62;
const GRAPH_MIN_ZOOM = 0.26;
const GRAPH_MAX_ZOOM = 1.7;
const GRAPH_MARGIN = 150;

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function estimateNodeClearance(node: GraphNode) {
  return node.size / 2 + Math.min(140, Math.max(86, node.label.length * 8));
}

function relaxNodeLayout(nodes: GraphNode[], fixedNodeId?: string) {
  const relaxed = nodes.map((node) => ({ ...node }));

  for (let iteration = 0; iteration < 42; iteration += 1) {
    for (let i = 0; i < relaxed.length; i += 1) {
      for (let j = i + 1; j < relaxed.length; j += 1) {
        const a = relaxed[i];
        const b = relaxed[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.sqrt(dx * dx + dy * dy);

        if (!distance) {
          const angle = ((i + 1) * 1.73 + (j + 1) * 0.91) % (Math.PI * 2);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }

        const minDistance = estimateNodeClearance(a) + estimateNodeClearance(b) + 18;
        if (distance >= minDistance) continue;

        const push = (minDistance - distance) * 0.22;
        const nx = dx / distance;
        const ny = dy / distance;
        const aFixed = a.id === fixedNodeId;
        const bFixed = b.id === fixedNodeId;

        if (!aFixed && !bFixed) {
          a.x -= nx * push * 0.5;
          a.y -= ny * push * 0.5;
          b.x += nx * push * 0.5;
          b.y += ny * push * 0.5;
        } else if (aFixed && !bFixed) {
          b.x += nx * push;
          b.y += ny * push;
        } else if (!aFixed && bFixed) {
          a.x -= nx * push;
          a.y -= ny * push;
        }
      }
    }

    for (const node of relaxed) {
      if (node.id === fixedNodeId) continue;
      node.x = clampNumber(node.x, GRAPH_MARGIN, GRAPH_WIDTH - GRAPH_MARGIN);
      node.y = clampNumber(node.y, GRAPH_MARGIN, GRAPH_HEIGHT - GRAPH_MARGIN);
    }
  }

  return relaxed;
}

function makeLinkPath(source: GraphNode, target: GraphNode, index: number) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const midX = source.x + dx / 2;
  const midY = source.y + dy / 2;
  const curve = Math.min(92, Math.max(26, distance * 0.08)) * (index % 2 ? 1 : -1);
  const normalX = -dy / distance;
  const normalY = dx / distance;

  return `M ${source.x} ${source.y} Q ${midX + normalX * curve} ${midY + normalY * curve} ${target.x} ${target.y}`;
}

function buildReadableLinks(apiGraph: ApiGraphData, nodes: GraphNode[], coreNodeId?: string) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const categoryEntryIds = new Set<string>();
  const byCategory = new Map<string, GraphNode[]>();

  for (const node of nodes) {
    if (node.id === coreNodeId || node.category === "core") continue;
    byCategory.set(node.category, [...(byCategory.get(node.category) || []), node]);
  }

  const readableLinks: GraphLink[] = [];
  for (const [, categoryNodes] of byCategory) {
    const entry =
      categoryNodes.find((node) => apiGraph.links.some((link) => link.source === coreNodeId && link.target === node.id)) ||
      categoryNodes[0];
    if (!entry) continue;

    categoryEntryIds.add(entry.id);
    if (coreNodeId) readableLinks.push({ source: coreNodeId, target: entry.id });

    categoryNodes
      .filter((node) => node.id !== entry.id)
      .forEach((node, index) => {
        readableLinks.push({ source: index > 0 && index % 3 === 0 ? categoryNodes[index - 1]?.id || entry.id : entry.id, target: node.id });
      });
  }

  const existingKeys = new Set(readableLinks.map((link) => `${link.source}->${link.target}`));
  const crossLinks = apiGraph.links
    .filter((link) => {
      const source = nodeMap.get(link.source);
      const target = nodeMap.get(link.target);
      if (!source || !target) return false;
      if (existingKeys.has(`${link.source}->${link.target}`)) return false;
      if (source.category === target.category) return false;
      if (source.id === coreNodeId || target.id === coreNodeId) return false;
      return categoryEntryIds.has(source.id) || categoryEntryIds.has(target.id) || link.dashed;
    })
    .slice(0, 8)
    .map((link) => ({ ...link, dashed: true }));

  return [...readableLinks, ...crossLinks];
}

function makeFallbackGraph(): ApiGraphData {
  return {
    title: "三维动画教学知识图谱",
    subtitle: "输入主题后由 Nexus AI 联网重绘",
    categories: defaultCategories,
    nodes: fallbackNodes,
    links: fallbackLinks
  };
}

function getApiGraphStatus(graph: ApiGraphData | null | undefined): "pending" | "completed" | "failed" {
  if (graph?.status === "pending" || graph?.status === "failed") return graph.status;
  return "completed";
}

function layoutGraph(apiGraph: ApiGraphData): GraphData {
  const categories = apiGraph.categories.length ? apiGraph.categories : defaultCategories;
  const categoryIds = categories.map((category) => category.id);
  const coreNode = apiGraph.nodes.find((node) => node.category === "core" || node.id === "core") || apiGraph.nodes[0];
  const grouped = categoryIds
    .filter((id) => id !== "core")
    .map((categoryId) => ({
      categoryId,
      nodes: apiGraph.nodes.filter((node) => node.id !== coreNode?.id && node.category === categoryId)
    }))
    .filter((group) => group.nodes.length);

  const nodes: GraphNode[] = [];
  const center = { x: GRAPH_WIDTH * 0.48, y: GRAPH_HEIGHT * 0.5 };
  const coreNodeId = coreNode?.id || "core";
  if (coreNode) {
    nodes.push({
      ...coreNode,
      id: coreNodeId,
      category: coreNode.category || "core",
      x: center.x,
      y: center.y,
      size: Math.max(84, Math.min(108, (coreNode.size || 86) + 10))
    });
  }

  const ringRadius = clampNumber(650 + grouped.length * 36, 720, 920);
  grouped.forEach((group, groupIndex) => {
    const angle = -Math.PI / 2 - 0.12 + (Math.PI * 2 * groupIndex) / Math.max(grouped.length, 1);
    const radiusJitter = 1 + ((groupIndex % 3) - 1) * 0.07 + Math.min(0.06, group.nodes.length * 0.008);
    const clusterX = center.x + Math.cos(angle) * ringRadius * radiusJitter;
    const clusterY = center.y + Math.sin(angle) * ringRadius * 0.72 * radiusJitter;
    const categoryNode = group.nodes.find((node) => apiGraph.links.some((link) => link.source === coreNode?.id && link.target === node.id)) || group.nodes[0];
    const children = group.nodes.filter((node) => node.id !== categoryNode.id);
    nodes.push({
      ...categoryNode,
      x: clusterX,
      y: clusterY,
      size: Math.max(56, Math.min(76, (categoryNode.size || 58) + 8))
    });

    children.forEach((node, index) => {
      const arc = Math.min(Math.PI * 1.22, Math.max(0.92, 0.24 * children.length + 0.72));
      const childAngle = angle - arc / 2 + (arc * (index + 0.5)) / Math.max(children.length, 1);
      const childRadius = 245 + (index % 3) * 72 + Math.floor(index / 3) * 30;
      const tangent = (index % 2 ? 1 : -1) * (24 + (index % 4) * 8);
      nodes.push({
        ...node,
        x: clusterX + Math.cos(childAngle) * childRadius + Math.cos(angle + Math.PI / 2) * tangent,
        y: clusterY + Math.sin(childAngle) * childRadius * 0.82 + Math.sin(angle + Math.PI / 2) * tangent,
        size: Math.max(36, Math.min(54, (node.size || 36) + 6))
      });
    });
  });

  const placedIds = new Set(nodes.map((node) => node.id));
  apiGraph.nodes
    .filter((node) => !placedIds.has(node.id))
    .forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(apiGraph.nodes.length, 1);
      nodes.push({
        ...node,
        x: center.x + Math.cos(angle) * 980,
        y: center.y + Math.sin(angle) * 680,
        size: Math.max(36, Math.min(52, (node.size || 34) + 6))
      });
    });

  const relaxedNodes = relaxNodeLayout(nodes, coreNodeId);

  return {
    title: apiGraph.title,
    subtitle: apiGraph.subtitle,
    categories,
    nodes: relaxedNodes,
    links: buildReadableLinks(apiGraph, relaxedNodes, coreNodeId)
  };
}

function truncateFileName(name: string) {
  return name.length > 18 ? `${name.slice(0, 10)}...${name.slice(-5)}` : name;
}

function getNodeDescription(node: GraphNode | undefined, category: GraphCategory | undefined) {
  if (!node) return "";
  if (node.description?.trim()) return node.description.trim();
  if (node.category === "core") return `“${node.label}”是当前知识图谱的核心主题，用于统领各个知识模块和拓展关系。`;
  return `“${node.label}”属于${category?.label || "当前分类"}，可结合相邻节点理解它在知识结构中的含义、作用和关联。`;
}

export function KnowledgeGraphCanvas() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [input, setInput] = useState("");
  const [apiGraph, setApiGraph] = useState<ApiGraphData>(() => makeFallbackGraph());
  const [selectedNodeId, setSelectedNodeId] = useState("core");
  const [zoom, setZoom] = useState(GRAPH_DEFAULT_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ pointerId: number; x: number; y: number } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<KnowledgeGraphHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const graph = useMemo(() => layoutGraph(apiGraph), [apiGraph]);
  const selectedNode = getNodeById(graph.nodes, selectedNodeId) || graph.nodes[0];
  const selectedCategory = graph.categories.find((category) => category.id === selectedNode?.category) || graph.categories[0];

  useEffect(() => {
    void loadHistory();
  }, []);

  useEffect(() => {
    const pendingItem = history.find((item) => getApiGraphStatus(item.graph) === "pending");
    if (!activeTaskId && pendingItem) {
      setActiveTaskId(pendingItem.id);
    }
  }, [activeTaskId, history]);

  useEffect(() => {
    if (!activeTaskId) return;
    let cancelled = false;

    async function refreshTask() {
      try {
        const response = await fetch(`/api/ai/knowledge-graph/tasks/${encodeURIComponent(activeTaskId!)}`, { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as GraphTaskResponse;
        if (!response.ok || !data.task || cancelled) return;

        setHistory((current) => [data.task!, ...current.filter((item) => item.id !== data.task!.id)].slice(0, 12));
        if (data.task.graph) {
          setApiGraph(data.task.graph);
          setSelectedNodeId(data.task.graph.nodes.find((node) => node.category === "core")?.id || data.task.graph.nodes[0]?.id || "core");
        }

        const status = data.task.status || getApiGraphStatus(data.task.graph);
        setLoading(status === "pending");
        if (status === "failed") {
          setError(data.task.message || data.task.graph.errorMessage || "知识图谱生成失败，请稍后重试。");
          setActiveTaskId(null);
        }
        if (status === "completed") {
          setError("");
          setActiveTaskId(null);
        }
      } catch {
        // Keep polling; a page switch or transient network failure should not cancel the task.
      }
    }

    void refreshTask();
    const timer = window.setInterval(refreshTask, 3500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeTaskId]);

  async function submitTopic(event: FormEvent) {
    event.preventDefault();
    const topic = input.trim();
    if (!topic || loading) return;
    setLoading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("topic", topic);
      files.forEach((file) => formData.append("files", file, file.name));
      const response = await fetch("/api/ai/knowledge-graph", { method: "POST", body: formData });
      const data = (await response.json().catch(() => ({}))) as GraphResponse & { historyItem?: KnowledgeGraphHistoryItem };
      if (!response.ok || !data.graph) throw new Error(data.message || "知识图谱生成失败");
      setApiGraph(data.graph);
      setSelectedNodeId(data.graph.nodes.find((node) => node.category === "core")?.id || data.graph.nodes[0]?.id || "core");
      setActiveTaskId(data.taskId || data.historyItem?.id || data.graph.taskId || null);
      setInput("");
      setFiles([]);
      setZoom(GRAPH_DEFAULT_ZOOM);
      setOffset({ x: 0, y: 0 });
      if (data.historyItem) {
        setHistory((current) => [data.historyItem!, ...current.filter((item) => item.id !== data.historyItem!.id)].slice(0, 12));
      } else {
        void loadHistory();
      }
      setLoading(getApiGraphStatus(data.graph) === "pending");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "知识图谱生成失败，请稍后重试。");
      setLoading(false);
    } finally {
    }
  }

  function resetView() {
    setZoom(GRAPH_DEFAULT_ZOOM);
    setOffset({ x: 0, y: 0 });
    setSelectedNodeId(graph.nodes[0]?.id || "core");
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button,input")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ pointerId: event.pointerId, x: event.clientX, y: event.clientY });
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    setOffset((current) => ({ x: current.x + dx, y: current.y + dy }));
    setDrag({ pointerId: event.pointerId, x: event.clientX, y: event.clientY });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (drag?.pointerId === event.pointerId) setDrag(null);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.06 : 0.06;
    setZoom((current) => clampNumber(Number((current + delta).toFixed(2)), GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM));
  }

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files || []);
    if (!nextFiles.length) return;
    setFiles((current) => [...current, ...nextFiles].slice(0, 4));
    event.currentTarget.value = "";
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/ai/knowledge-graph/history", { method: "GET" });
      const data = (await response.json().catch(() => ({}))) as { items?: KnowledgeGraphHistoryItem[] };
      if (response.ok && Array.isArray(data.items)) setHistory(data.items);
    } finally {
      setHistoryLoading(false);
    }
  }

  function openHistoryItem(item: KnowledgeGraphHistoryItem) {
    setApiGraph(item.graph);
    setSelectedNodeId(item.graph.nodes.find((node) => node.category === "core")?.id || item.graph.nodes[0]?.id || "core");
    setActiveTaskId(getApiGraphStatus(item.graph) === "pending" ? item.id : null);
    setLoading(getApiGraphStatus(item.graph) === "pending");
    setZoom(GRAPH_DEFAULT_ZOOM);
    setOffset({ x: 0, y: 0 });
    setError(getApiGraphStatus(item.graph) === "failed" ? item.message || item.graph.errorMessage || "知识图谱生成失败，请稍后重试。" : "");
  }

  async function deleteHistoryItem(id: string) {
    const previousHistory = history;
    setHistory((current) => current.filter((item) => item.id !== id));
    try {
      const response = await fetch(`/api/ai/knowledge-graph/history?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("删除失败");
    } catch (deleteError) {
      setHistory(previousHistory);
      setError(deleteError instanceof Error ? deleteError.message : "历史记录删除失败，请稍后重试。");
    }
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[#f8fafc]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(59,130,246,0.13),transparent_34%),linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] bg-[length:auto,42px_42px,42px_42px]" />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.txt,.md,.doc,.docx,.xls,.xlsx,.csv,application/pdf,text/plain,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        onChange={addFiles}
      />

      <div className="absolute left-6 top-5 z-20 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-blue-600 shadow-sm">
          <Network className="h-5 w-5" />
        </div>
        <div>
          <h2 className="max-w-[56vw] truncate text-base font-semibold text-slate-900">{graph.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{graph.subtitle || "Nexus AI 知识图谱"}</p>
        </div>
      </div>

      <div className="absolute right-6 top-5 z-20 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/88 p-1 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => setZoom((current) => clampNumber(Number((current - 0.08).toFixed(2)), GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM))}
          className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          aria-label="缩小知识图谱"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="min-w-12 text-center text-xs font-medium text-slate-500">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setZoom((current) => clampNumber(Number((current + 0.08).toFixed(2)), GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM))}
          className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          aria-label="放大知识图谱"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={resetView}
          className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          aria-label="重置知识图谱视图"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <div className="absolute right-6 top-20 z-20 hidden w-56 md:block">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs font-semibold text-slate-500">历史记录</p>
          <button
            type="button"
            onClick={loadHistory}
            className="text-[11px] text-slate-400 transition hover:text-blue-600"
            disabled={historyLoading}
          >
            {historyLoading ? "读取中" : "刷新"}
          </button>
        </div>
        <div className="grid max-h-[290px] gap-2 overflow-y-auto pr-1">
          {history.length ? (
            history.map((item) => (
              <div
                key={item.id}
                className="group relative rounded-2xl border border-white/70 bg-white/55 px-3 py-2 pr-9 text-left shadow-sm backdrop-blur transition hover:border-blue-200 hover:bg-white/88 hover:shadow-[0_12px_34px_rgba(15,23,42,0.08)]"
              >
                <button type="button" onClick={() => openHistoryItem(item)} className="block w-full text-left">
                  <p className="truncate text-xs font-semibold text-slate-700 group-hover:text-blue-700">
                    {item.title}
                    {getApiGraphStatus(item.graph) === "pending" ? " · 生成中" : getApiGraphStatus(item.graph) === "failed" ? " · 失败" : ""}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-slate-400">{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void deleteHistoryItem(item.id);
                  }}
                  className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-slate-300 opacity-0 transition hover:bg-blue-50 hover:text-blue-500 group-hover:opacity-100"
                  aria-label="删除知识图谱历史"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-white/70 bg-white/45 px-3 py-3 text-xs text-slate-400 backdrop-blur">
              暂无个人图谱历史
            </div>
          )}
        </div>
      </div>

      <div className="absolute left-6 top-24 z-20 hidden max-w-[220px] gap-2 md:grid">
        {graph.categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => {
              const node = graph.nodes.find((item) => item.category === category.id);
              if (node) setSelectedNodeId(node.id);
            }}
            className="flex items-center gap-2 rounded-full bg-white/76 px-3 py-2 text-left text-xs text-slate-600 shadow-sm ring-1 ring-slate-200/80 transition hover:bg-white hover:text-slate-900"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.color }} />
            <span className="truncate">{category.label}</span>
          </button>
        ))}
      </div>

      {selectedNode ? (
        <div className="absolute bottom-28 right-6 z-20 hidden w-72 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_18px_52px_rgba(15,23,42,0.12)] backdrop-blur md:block">
          <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedCategory.color }} />
            {selectedCategory.label}
          </div>
          <h3 className="line-clamp-2 text-base font-semibold text-slate-900">{selectedNode.label}</h3>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {getNodeDescription(selectedNode, selectedCategory)}
          </p>
        </div>
      ) : null}

      <div
        className={cn("absolute inset-0 cursor-grab select-none pt-24 active:cursor-grabbing", drag && "cursor-grabbing")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        >
          <div
          className="absolute left-1/2 top-1/2 h-[1600px] w-[2600px] origin-center -translate-x-1/2 -translate-y-1/2"
          style={{ transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${zoom})` }}
        >
          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} aria-hidden="true">
            <defs>
              <filter id="knowledge-link-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {graph.links.map((link, index) => {
              const source = getNodeById(graph.nodes, link.source);
              const target = getNodeById(graph.nodes, link.target);
              if (!source || !target) return null;
              const linkCategory = graph.categories.find((item) => item.id === target.category) || graph.categories.find((item) => item.id === source.category);
              return (
                <path
                  key={`${link.source}-${link.target}-${index}`}
                  d={makeLinkPath(source, target, index)}
                  className={cn("knowledge-graph-link", link.dashed && "knowledge-graph-link-dashed")}
                  stroke={link.dashed ? "#9ca3af" : target.category === source.category ? linkCategory?.color || "#60a5fa" : "#93c5fd"}
                  strokeWidth={link.dashed ? 1.15 : 2.1}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={link.dashed ? "7 8" : undefined}
                  filter={link.dashed ? undefined : "url(#knowledge-link-glow)"}
                />
              );
            })}
          </svg>

          {graph.nodes.map((node) => {
            const category = graph.categories.find((item) => item.id === node.category) || graph.categories[0];
            const isSelected = selectedNodeId === node.id;
            const isCore = node.category === "core";
            const labelInset = node.size + 9;
            const labelOnRight = node.x < GRAPH_WIDTH * 0.56;
            const tooltipLeft = labelOnRight ? node.size + 10 : -126;
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => setSelectedNodeId(node.id)}
                className={cn(
                  "knowledge-graph-node group absolute overflow-visible rounded-full transition duration-300 hover:z-20",
                  isCore && "knowledge-graph-node-core",
                  isSelected && "ring-4 ring-blue-200"
                )}
                style={{
                  left: node.x,
                  top: node.y,
                  width: node.size,
                  height: node.size,
                  marginLeft: -node.size / 2,
                  marginTop: -node.size / 2,
                  ["--kg-color" as string]: category.color,
                  ["--kg-float-duration" as string]: `${4.8 + (node.id.length % 5) * 0.55}s`,
                  ["--kg-float-delay" as string]: `${(node.id.length % 7) * -0.42}s`,
                  ["--kg-float-x" as string]: `${((node.id.length % 3) - 1) * 3}px`,
                  ["--kg-float-y" as string]: `${((node.id.length % 4) - 1.5) * 2.5}px`
                }}
                title={node.label}
              >
                <span className="knowledge-graph-orb absolute inset-0 rounded-full" />
                <span
                  className={cn(
                    "knowledge-graph-label absolute top-1/2 min-w-max max-w-[152px] -translate-y-1/2 rounded-none bg-transparent px-0 py-0 text-[14px] font-semibold leading-none text-slate-700 transition group-hover:text-slate-950",
                    isCore && "max-w-[190px] text-base text-blue-800",
                    labelOnRight ? "text-left" : "text-right"
                  )}
                  style={labelOnRight ? { left: labelInset } : { right: labelInset }}
                >
                  {node.label}
                </span>
                <span
                  className="knowledge-graph-tooltip pointer-events-none absolute z-30 w-max max-w-[142px] rounded-md bg-slate-900 px-2 py-1 text-left text-[10px] leading-none text-white opacity-0 shadow-[0_14px_36px_rgba(15,23,42,0.28)] transition duration-200 group-hover:translate-y-0 group-hover:opacity-100"
                  style={{ left: tooltipLeft, top: node.size * 0.58 }}
                >
                  <span className="mb-0.5 block truncate text-[10px] font-semibold leading-none">{node.label}</span>
                  <span className="flex items-center gap-1 text-[9px] leading-none text-slate-200">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: category.color }} />
                    {category.label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-white/24 backdrop-blur-[1px]">
          <div className="rounded-[28px] border border-blue-100 bg-white/88 px-6 py-5 text-center shadow-[0_22px_70px_rgba(37,99,235,0.16)]">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <p className="text-sm font-semibold text-slate-900">Nexus AI 正在重绘知识图谱</p>
            <p className="mt-2 text-xs text-slate-500">联网检索、解析资料并生成更细的节点关系</p>
            <div className="mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-slate-100">
              <div className="knowledge-graph-loading-bar h-full w-1/2 rounded-full bg-gradient-to-r from-blue-400 via-sky-400 to-cyan-300" />
            </div>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={submitTopic}
        className="pointer-events-none absolute bottom-6 left-1/2 z-30 w-[min(100%-48px,760px)] -translate-x-1/2"
      >
        {error ? (
          <div className="pointer-events-auto mx-auto mb-2 w-fit rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs text-red-600">
            {error}
          </div>
        ) : null}
        {files.length ? (
          <div className="pointer-events-auto mx-auto mb-2 flex max-w-full flex-wrap justify-center gap-2">
            {files.map((file, index) => (
              <span
                key={`${file.name}-${index}`}
                className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-blue-100 bg-white/90 px-3 py-1 text-xs text-slate-600 shadow-sm"
              >
                <FileText className="h-3.5 w-3.5 text-blue-500" />
                <span className="truncate">{truncateFileName(file.name)}</span>
                <button
                  type="button"
                  onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                  className="text-slate-400 hover:text-slate-700"
                  aria-label="移除文件"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="pointer-events-auto flex items-end gap-2 rounded-[24px] border border-slate-200 bg-white/94 p-2 shadow-[0_22px_70px_rgba(15,23,42,0.16)] backdrop-blur">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600 transition hover:bg-blue-100"
            aria-label="上传知识图谱资料"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
            <Sparkles className="h-4 w-4" />
          </div>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="输入教学主题，Nexus AI 会联网搜索并重绘知识图谱..."
            className="min-h-10 flex-1 bg-transparent px-1 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-sky-400 text-white shadow-[0_10px_28px_rgba(37,99,235,0.26)] transition hover:from-blue-600 hover:to-cyan-500 disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-100 disabled:text-slate-400 disabled:shadow-none"
            aria-label="生成知识图谱"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}

