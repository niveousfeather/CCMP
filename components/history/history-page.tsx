"use client";

import { Box, Check, ExternalLink, Heart, Image as ImageIcon, MessageSquare, Search, Trash2, Video, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { HistoryRecord } from "@/components/history/history-data";
import { ImageResult } from "@/components/image-generation/image-data";
import { ImagePreviewDialog } from "@/components/image-generation/image-preview-dialog";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { getImageModelLabel } from "@/lib/image/config";
import { cn } from "@/lib/utils";
import { getVideoModelDisplayName } from "@/lib/video/config";

type ViewMode = "history" | "favorites";
type TypeFilter = "all" | "image" | "chat" | "video" | "model3d";
type StatusFilter = "all" | "已完成" | "生成中" | "活跃" | "生成失败";

type RecordsResponse = {
  records?: HistoryRecord[];
};

const historyTabs: { label: string; value: TypeFilter }[] = [
  { label: "全部", value: "all" },
  { label: "图片", value: "image" },
  { label: "对话", value: "chat" },
  { label: "视频", value: "video" },
  { label: "3D", value: "model3d" }
];

const favoriteTabs: { label: string; value: TypeFilter }[] = [
  { label: "全部", value: "all" },
  { label: "图片", value: "image" },
  { label: "对话", value: "chat" },
  { label: "3D", value: "model3d" }
];

const statusOptions: StatusFilter[] = ["all", "已完成", "生成中", "活跃", "生成失败"];

export function HistoryPage() {
  const router = useRouter();
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [favoriteRecords, setFavoriteRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("history");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [previewResults, setPreviewResults] = useState<ImageResult[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    async function loadRecords() {
      setLoading(true);
      try {
        const [historyResponse, favoritesResponse] = await Promise.all([fetch("/api/history"), fetch("/api/favorites")]);
        const historyData = (await historyResponse.json().catch(() => ({}))) as RecordsResponse;
        const favoritesData = (await favoritesResponse.json().catch(() => ({}))) as RecordsResponse;
        if (!historyResponse.ok || !favoritesResponse.ok) throw new Error("load failed");
        if (!cancelled) {
          setHistoryRecords(historyData.records || []);
          setFavoriteRecords(favoritesData.records || []);
        }
      } catch {
        if (!cancelled) toast({ type: "error", message: "历史记录加载失败，请稍后刷新。" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadRecords();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const sourceRecords = viewMode === "favorites" ? favoriteRecords : historyRecords;
  const availableTabs = viewMode === "favorites" ? favoriteTabs : historyTabs;

  useEffect(() => {
    if (viewMode === "favorites" && typeFilter === "video") setTypeFilter("all");
  }, [typeFilter, viewMode]);

  const filteredRecords = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return sourceRecords.filter((record) => {
      const typeMatched = typeFilter === "all" || record.type === typeFilter;
      const statusMatched = statusFilter === "all" || normalizeStatus(record.status) === statusFilter;
      const textMatched =
        !query ||
        record.title.toLowerCase().includes(query) ||
        record.prompt.toLowerCase().includes(query) ||
        (record.finalPrompt || "").toLowerCase().includes(query) ||
        record.model.toLowerCase().includes(query);
      return typeMatched && statusMatched && textMatched;
    });
  }, [keyword, sourceRecords, statusFilter, typeFilter]);

  const activePreview = previewResults[previewIndex] || null;

  function openRecord(record: HistoryRecord) {
    if (record.type === "image") {
      const results = recordToImageResults(record);
      if (!results.length) {
        toast({ type: "error", message: normalizeStatus(record.status) === "生成失败" ? record.failureReason || "该图片任务生成失败。" : "这条图片历史没有可预览资源。" });
        return;
      }
      setPreviewResults(results);
      setPreviewIndex(0);
      return;
    }

    if (record.type === "chat") {
      router.push(`/chat?conversationId=${encodeURIComponent(record.taskId)}`);
      return;
    }

    if (record.type === "model3d") {
      router.push(`/model3d?taskId=${encodeURIComponent(record.taskId)}`);
      return;
    }

    router.push(`/video?taskId=${encodeURIComponent(record.taskId)}`);
  }

  function selectPreviewOffset(offset: number) {
    if (!previewResults.length) return;
    setPreviewIndex((current) => (current + offset + previewResults.length) % previewResults.length);
  }

  function handleReuse() {
    toast({ type: "success", message: "已读取该图片提示词，可在图片页面复用。" });
  }

  async function toggleFavorite(record: HistoryRecord) {
    if (record.type === "video") {
      toast({ type: "error", message: "视频收藏会在真实视频历史接入后开放。" });
      return;
    }

    const nextFavorite = !record.isFavorite;
    try {
      const response = await fetch(
        nextFavorite ? "/api/favorites" : `/api/favorites?targetType=${record.type}&targetId=${encodeURIComponent(record.taskId)}`,
        {
          method: nextFavorite ? "POST" : "DELETE",
          headers: nextFavorite ? { "Content-Type": "application/json" } : undefined,
          body: nextFavorite ? JSON.stringify({ targetType: record.type, targetId: record.taskId }) : undefined
        }
      );
      if (!response.ok) throw new Error("favorite failed");

      setHistoryRecords((current) =>
        current.map((item) => (item.type === record.type && item.taskId === record.taskId ? { ...item, isFavorite: nextFavorite } : item))
      );
      setFavoriteRecords((current) => {
        if (nextFavorite) {
          const exists = current.some((item) => item.type === record.type && item.taskId === record.taskId);
          return exists ? current : [{ ...record, isFavorite: true }, ...current];
        }
        return current.filter((item) => !(item.type === record.type && item.taskId === record.taskId));
      });
      setPreviewResults((current) => current.map((item) => (item.taskId === record.taskId ? { ...item, liked: nextFavorite } : item)));
      toast({ type: "success", message: nextFavorite ? "已加入我的收藏。" : "已取消收藏。" });
    } catch {
      toast({ type: "error", message: "收藏状态更新失败，请稍后重试。" });
    }
  }

  function handleTogglePreviewLike(id: string) {
    const result = previewResults.find((item) => item.id === id);
    const record = [...historyRecords, ...favoriteRecords].find((item) => item.taskId === result?.taskId && item.type === "image");
    if (record) void toggleFavorite(record);
  }

  function handleDownload(result: ImageResult) {
    const src = result.url || (result.b64_json ? `data:image/png;base64,${result.b64_json}` : null);
    if (!src) {
      toast({ type: "error", message: "当前图片无法下载。" });
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = src;
    anchor.download = `${result.title || "nexusai-image"}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    toast({ type: "success", message: "已开始下载当前图片。" });
  }

  async function deleteRecord(record: HistoryRecord) {
    const endpoint =
      record.type === "image"
        ? `/api/ai/image/history/${encodeURIComponent(record.taskId)}`
        : record.type === "video"
          ? `/api/video/history/${encodeURIComponent(record.taskId)}`
          : record.type === "model3d"
            ? `/api/model3d/history/${encodeURIComponent(record.taskId)}`
            : `/api/ai/chat/conversations/${encodeURIComponent(record.taskId)}`;

    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        toast({ type: "error", message: data.message || "历史记录删除失败。" });
        return;
      }

      setHistoryRecords((current) => current.filter((item) => !(item.type === record.type && item.taskId === record.taskId)));
      setFavoriteRecords((current) => current.filter((item) => !(item.type === record.type && item.taskId === record.taskId)));
      if (record.type === "image") {
        setPreviewResults((current) => current.filter((item) => item.taskId !== record.taskId));
      }
      toast({ type: "success", message: "已删除历史记录。" });
    } catch {
      toast({ type: "error", message: "历史记录删除失败。" });
    }
  }

  return (
    <>
      <div className="grid gap-6">
        <div>
          <p className="text-sm font-medium text-[var(--color-text-faint)]">项目中心</p>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">历史记录</h1>
          <p className="mt-3 hidden max-w-2xl text-sm leading-7 text-[var(--color-text-muted)] sm:block">
            统一查看当前账号的图片、对话、视频和 3D 资产历史。3D 资产会使用稳定存储链接，刷新页面后仍可恢复到工作区。
          </p>
        </div>

        <Card className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={viewMode === "history" ? "primary" : "secondary"} onClick={() => setViewMode("history")}>
                全部历史
              </Button>
              <Button type="button" size="sm" variant={viewMode === "favorites" ? "primary" : "secondary"} onClick={() => setViewMode("favorites")}>
                我的收藏
              </Button>
              <span className="mx-1 hidden h-8 w-px bg-[var(--color-border)] sm:block" />
              {availableTabs.map((tab) => (
                <Button key={tab.value} type="button" size="sm" variant={typeFilter === tab.value ? "primary" : "secondary"} onClick={() => setTypeFilter(tab.value)}>
                  {tab.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 sm:w-72">
                <Search className="h-4 w-4 text-[var(--color-text-faint)]" />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索标题、prompt 或模型"
                  className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)]"
                />
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="hidden h-10 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 text-sm text-[var(--color-text)] outline-none sm:block"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status === "all" ? "全部状态" : status}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <div className="grid gap-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <Card key={index} className="p-4">
                <div className="grid gap-4 lg:grid-cols-[88px_minmax(0,1fr)_220px]">
                  <Skeleton className="h-20" />
                  <div>
                    <Skeleton className="h-5 w-1/3" />
                    <Skeleton className="mt-3 h-4 w-full" />
                    <Skeleton className="mt-2 h-4 w-2/3" />
                  </div>
                  <div className="grid gap-2">
                    <Skeleton className="h-8" />
                    <Skeleton className="h-8" />
                  </div>
                </div>
              </Card>
            ))
          ) : filteredRecords.length ? (
            filteredRecords.map((record) => (
              <HistoryRow
                key={`${record.type}-${record.taskId}`}
                record={record}
                onOpen={() => openRecord(record)}
                onDelete={() => deleteRecord(record)}
                onToggleFavorite={() => toggleFavorite(record)}
              />
            ))
          ) : (
            <Card className="min-h-64">
              <EmptyState
                icon={viewMode === "favorites" ? Heart : typeFilter === "chat" ? MessageSquare : typeFilter === "video" ? Video : typeFilter === "model3d" ? Box : ImageIcon}
                title={getEmptyTitle(viewMode, typeFilter)}
                description={getEmptyDescription(viewMode, typeFilter)}
              />
            </Card>
          )}
        </div>
      </div>

      <ImagePreviewDialog
        result={activePreview}
        indexLabel={activePreview && previewResults.length > 1 ? `${previewIndex + 1}/${previewResults.length}` : undefined}
        onPrevious={previewResults.length > 1 ? () => selectPreviewOffset(-1) : undefined}
        onNext={previewResults.length > 1 ? () => selectPreviewOffset(1) : undefined}
        onClose={() => setPreviewResults([])}
        onReuse={handleReuse}
        onToggleLike={handleTogglePreviewLike}
        onDownload={handleDownload}
      />
    </>
  );
}

function HistoryRow({
  record,
  onOpen,
  onDelete,
  onToggleFavorite
}: {
  record: HistoryRecord;
  onOpen: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <Card className="p-0">
      <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[88px_minmax(0,1fr)_220px]">
        <button type="button" onClick={onOpen} className="text-left">
          <RecordThumb record={record} />
        </button>
        <button type="button" onClick={onOpen} className="min-w-0 text-left">
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden sm:inline-flex">
              <Badge>{getTypeLabel(record.type)}</Badge>
            </span>
            <span className="hidden sm:inline-flex">
              <StatusBadge status={normalizeStatus(record.status)} />
            </span>
            <h2 className="min-w-0 truncate text-sm font-medium text-[var(--color-text)] sm:text-base">{record.title}</h2>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-text-muted)] sm:mt-2 sm:text-sm sm:leading-6">
            {normalizeStatus(record.status) === "生成失败" ? record.failureReason || record.prompt : record.finalPrompt || record.prompt}
          </p>
        </button>
        <div className="col-span-2 hidden content-start gap-2 text-sm text-[var(--color-text-muted)] sm:grid lg:col-span-1">
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={onOpen}>
              <ExternalLink className="h-4 w-4" />
              查看
            </Button>
            <Button type="button" variant="secondary" size="icon" onClick={onToggleFavorite} aria-label="切换收藏">
              <Heart className={cn("h-4 w-4", record.isFavorite && "fill-current")} />
            </Button>
            <Button type="button" variant="secondary" size="icon" onClick={onDelete} aria-label="删除历史记录">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Meta label="模型" value={getHistoryModelLabel(record)} />
          {record.type === "image" ? <Meta label="比例" value={record.ratio} /> : null}
          <Meta label="更新" value={formatTime(record.updatedAt)} />
        </div>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "已完成") {
    return (
      <span className="inline-flex h-6 items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 text-xs text-emerald-600">
        <Check className="h-3 w-3" />
        已完成
      </span>
    );
  }
  if (status === "生成失败") {
    return (
      <span className="inline-flex h-6 items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 text-xs text-red-600">
        <X className="h-3 w-3" />
        生成失败
      </span>
    );
  }
  return <Badge>{status}</Badge>;
}

function RecordThumb({ record }: { record: HistoryRecord }) {
  const Icon = record.type === "image" ? ImageIcon : record.type === "chat" ? MessageSquare : record.type === "model3d" ? Box : Video;
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [record.thumbnailUrl]);

  return (
    <div className="relative h-16 overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] sm:h-20">
      {record.thumbnailUrl && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={record.thumbnailUrl} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-[var(--color-text-muted)]">
          <div className="text-center">
            <Icon className="mx-auto h-5 w-5" />
            {record.type === "image" && broken ? <span className="mt-1 block text-[10px] leading-3">图片失效</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--color-border)] bg-[var(--color-soft)] px-2 py-1.5 text-xs">
      <span className="text-[var(--color-text-faint)]">{label}</span>
      <span className="truncate text-right text-[var(--color-text)]">{value}</span>
    </div>
  );
}

function getHistoryModelLabel(record: HistoryRecord) {
  if (record.type === "image") return getImageModelLabel(record.model);
  if (record.type === "video") return getVideoModelDisplayName(record.model);
  if (record.type === "model3d") return "Nexus 3D Preview";
  return record.model;
}

function getTypeLabel(type: HistoryRecord["type"]) {
  if (type === "image") return "图片";
  if (type === "chat") return "对话";
  if (type === "video") return "视频";
  return "3D";
}

function recordToImageResults(record: HistoryRecord): ImageResult[] {
  return (record.images || []).map((url, index) => ({
    id: `${record.taskId}-${index}`,
    taskId: record.taskId,
    prompt: record.prompt,
    finalPrompt: record.finalPrompt,
    revisedPrompt: record.finalPrompt,
    title: `${record.title} ${index + 1}`,
    style: record.style || "默认",
    ratio: record.ratio,
    resolution: record.resolution as ImageResult["resolution"],
    model: record.model,
    visualIndex: index,
    liked: Boolean(record.isFavorite),
    createdAt: formatTime(record.createdAt),
    url,
    status: normalizeStatus(record.status) as ImageResult["status"],
    failureReason: record.failureReason
  }));
}

function normalizeStatus(status: string): StatusFilter {
  if (status === "已完成" || status.includes("完成")) return "已完成";
  if (status === "生成失败" || status.includes("失败")) return "生成失败";
  if (status === "活跃" || status.includes("活")) return "活跃";
  if (status === "all") return "all";
  return "生成中";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function getEmptyTitle(viewMode: ViewMode, typeFilter: TypeFilter) {
  if (viewMode === "favorites") return "暂无收藏内容";
  if (typeFilter === "model3d") return "暂无 3D 历史";
  if (typeFilter === "video") return "暂无视频历史";
  if (typeFilter === "chat") return "暂无对话历史";
  return "暂无历史记录";
}

function getEmptyDescription(viewMode: ViewMode, typeFilter: TypeFilter) {
  if (viewMode === "favorites") return "在图片、对话或 3D 记录中点击收藏后，会显示在这里。";
  if (typeFilter === "model3d") return "3D 模型生成或编辑完成后，会在这里保留可恢复的资产记录。";
  if (typeFilter === "video") return "视频生成完成后，历史会显示在这里。";
  if (typeFilter === "chat") return "发送对话后，真实对话历史会显示在这里。";
  return "生成图片、视频、3D 模型或发送对话后，真实历史记录会显示在这里。";
}
