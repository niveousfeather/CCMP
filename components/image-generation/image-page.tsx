"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ImageResolution,
  ImageResult,
  ImageTask,
  UploadedImage,
  defaultStyle,
  initialPrompt
} from "@/components/image-generation/image-data";
import { ImageHistoryPanel } from "@/components/image-generation/image-history-panel";
import { ImageParameterPanel } from "@/components/image-generation/image-parameter-panel";
import { ImagePreviewDialog } from "@/components/image-generation/image-preview-dialog";
import { ImageResultGrid, getImageSrc } from "@/components/image-generation/image-result-grid";
import { ImageUploadPreviewDialog } from "@/components/image-generation/image-upload-preview-dialog";
import { useToast } from "@/components/ui/toast";
import { getImageModelCapability, isSelectableImageModel } from "@/lib/image/config";

type ImageApiResponse = {
  images?: Array<{
    url: string | null;
    b64_json: string | null;
    revised_prompt: string | null;
    model: string;
    objectKey?: string | null;
  }>;
  generation?: ImageTask;
  message?: string;
  code?: string;
};

type HistoryApiResponse = {
  history?: ImageTask[];
};

type TaskApiResponse = {
  task?: ImageTask;
};

type UserQuotaResponse = {
  imageDailyLimit: number;
  imageUsedToday: number;
  imageRemaining: number;
};

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedImageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);

function createTaskTitle(prompt: string) {
  const compact = prompt.replace(/\s+/g, " ").trim();
  return compact.length > 18 ? `${compact.slice(0, 18)}...` : compact || "未命名任务";
}

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function isAllowedImage(file: File) {
  return allowedImageExtensions.has(getExtension(file.name)) && (!file.type || allowedImageTypes.has(file.type));
}

function formatTime(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return value || "刚刚";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function getDownloadName(result: ImageResult) {
  const safeTitle = result.title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 48) || "nexusai-image";
  return `${safeTitle}.png`;
}

function buildResultsFromTask(task: ImageTask): ImageResult[] {
  return (task.images || []).map((url, index) => ({
    id: `${task.taskId}-asset-${index}`,
    taskId: task.taskId,
    prompt: task.prompt,
    finalPrompt: task.finalPrompt,
    revisedPrompt: task.finalPrompt,
    title: `${task.title} ${index + 1}`,
    style: task.style || defaultStyle,
    ratio: task.ratio,
    resolution: task.resolution,
    model: task.model,
    visualIndex: index,
    liked: Boolean(task.isFavorite),
    createdAt: formatTime(task.createdAt),
    url,
    b64_json: null,
    mode: task.mode,
    status: task.status,
    failureReason: task.failureReason
  }));
}

async function downloadImage(result: ImageResult) {
  const src = getImageSrc(result);
  if (!src) return false;

  const anchor = document.createElement("a");
  anchor.download = getDownloadName(result);

  if (result.b64_json) {
    anchor.href = `data:image/png;base64,${result.b64_json}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  }

  try {
    const response = await fetch(`/api/ai/image/download?url=${encodeURIComponent(src)}&filename=${encodeURIComponent(getDownloadName(result))}`);
    if (!response.ok) throw new Error("download failed");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    anchor.href = objectUrl;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    return true;
  } catch {
    anchor.href = src;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  }
}

export function ImageGenerationPage() {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [style, setStyle] = useState(defaultStyle);
  const [ratio, setRatio] = useState("16:9");
  const [resolution, setResolution] = useState<ImageResolution>("1K");
  const [model, setModel] = useState("gpt-image-2");
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [showUploadPreview, setShowUploadPreview] = useState(false);
  const [creating, setCreating] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [results, setResults] = useState<ImageResult[]>([]);
  const [resultsByTask, setResultsByTask] = useState<Record<string, ImageResult[]>>({});
  const [history, setHistory] = useState<ImageTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [previewResultId, setPreviewResultId] = useState<string | null>(null);
  const [quotaSummary, setQuotaSummary] = useState<string | null>(null);
  const { toast } = useToast();

  const previewIndex = Math.max(results.findIndex((result) => result.id === previewResultId), 0);
  const previewResult = useMemo(() => results.find((result) => result.id === previewResultId) || null, [previewResultId, results]);
  const modelCapability = getImageModelCapability(model);
  const modelSupportsImageUpload = Boolean(modelCapability?.supportsImageUpload);

  async function loadQuota() {
    try {
      const response = await fetch("/api/user/quota");
      const data = (await response.json().catch(() => ({}))) as Partial<UserQuotaResponse>;
      if (!response.ok) return;
      if (
        typeof data.imageDailyLimit === "number" &&
        typeof data.imageUsedToday === "number" &&
        typeof data.imageRemaining === "number"
      ) {
        setQuotaSummary(`今日图片次数 ${data.imageUsedToday}/${data.imageDailyLimit}，剩余 ${data.imageRemaining} 次`);
      }
    } catch {
      setQuotaSummary(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      setHistoryLoading(true);
      try {
        const response = await fetch("/api/ai/image/history");
        const data = (await response.json().catch(() => ({}))) as HistoryApiResponse;
        if (!response.ok) throw new Error("load failed");
        if (cancelled) return;

        const nextHistory = data.history || [];
        const nextResultsByTask = nextHistory.reduce<Record<string, ImageResult[]>>((acc, task) => {
          acc[task.taskId] = buildResultsFromTask(task);
          return acc;
        }, {});
        setHistory(nextHistory);
        setResultsByTask(nextResultsByTask);

        const firstSuccess = nextHistory.find((task) => task.status === "已完成" && task.images?.length);
        if (firstSuccess) {
          const firstResults = nextResultsByTask[firstSuccess.taskId] || [];
          setActiveTaskId(firstSuccess.taskId);
          setResults(firstResults);
          setActiveResultId(firstResults[0]?.id || null);
        }
      } catch {
        if (!cancelled) toast({ type: "error", message: "历史记录加载失败，请稍后刷新。" });
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    loadQuota();
  }, []);

  useEffect(() => {
    return () => {
      if (uploadedImage?.previewUrl) URL.revokeObjectURL(uploadedImage.previewUrl);
    };
  }, [uploadedImage]);

  function handleImageSelect(file: File) {
    if (!isAllowedImage(file)) {
      toast({ type: "error", message: "仅支持 jpg、jpeg、png、webp 图片。" });
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      toast({ type: "error", message: "图片过大，请压缩后重试。" });
      return;
    }

    setUploadedImage((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file), name: file.name, size: file.size, type: file.type };
    });
    toast({ type: "success", message: "已添加参考图片。" });
  }

  function handleImageRemove() {
    setUploadedImage((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    setShowUploadPreview(false);
  }

  async function reloadHistory() {
    const response = await fetch("/api/ai/image/history");
    const data = (await response.json().catch(() => ({}))) as HistoryApiResponse;
    if (!response.ok) return;
    const nextHistory = data.history || [];
    const nextResultsByTask = nextHistory.reduce<Record<string, ImageResult[]>>((acc, task) => {
      acc[task.taskId] = buildResultsFromTask(task);
      return acc;
    }, {});
    setHistory(nextHistory);
    setResultsByTask(nextResultsByTask);
  }

  function applyTaskUpdate(task: ImageTask) {
    const taskResults = buildResultsFromTask(task);
    setHistory((current) => [task, ...current.filter((item) => item.taskId !== task.taskId)]);
    setResultsByTask((current) => ({ ...current, [task.taskId]: taskResults }));

    if (activeTaskId === task.taskId) {
      setResults(taskResults);
      setActiveResultId(taskResults[0]?.id || null);
    }
  }

  useEffect(() => {
    const pendingIds = history.filter((task) => task.status === "生成中").map((task) => task.taskId);
    if (!pendingIds.length) return;

    let cancelled = false;
    const timer = window.setInterval(async () => {
      const responses = await Promise.all(
        pendingIds.map(async (taskId) => {
          try {
            const response = await fetch(`/api/ai/image/tasks/${encodeURIComponent(taskId)}`);
            const data = (await response.json().catch(() => ({}))) as TaskApiResponse;
            if (!response.ok || !data.task) return null;
            return data.task;
          } catch {
            return null;
          }
        })
      );

      if (cancelled) return;
      responses.forEach((task) => {
        if (task) applyTaskUpdate(task);
      });
    }, 3500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeTaskId, history]);

  async function handleGenerate() {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      toast({ type: "error", message: "请先输入图片生成提示词。" });
      return;
    }

    setCreating(true);
    setResults([]);
    setActiveResultId(null);
    setPreviewResultId(null);

    const formData = new FormData();
    formData.append("model", model);
    formData.append("prompt", cleanPrompt);
    formData.append("style", style === defaultStyle ? "" : style);
    formData.append("aspect_ratio", ratio);
    formData.append("resolution", resolution);
    formData.append("count", "1");
    if (uploadedImage && modelSupportsImageUpload) formData.append("image", uploadedImage.file, uploadedImage.name);

    try {
      const response = await fetch("/api/ai/image", { method: "POST", body: formData });
      const data = (await response.json().catch(() => ({}))) as ImageApiResponse;

      if (!response.ok || !data.generation) {
        toast({ type: "error", message: data.message || "图片任务创建失败，请稍后重试。" });
        await reloadHistory();
        return;
      }

      const taskId = data.generation.taskId;
      const taskTitle = data.generation.title || createTaskTitle(cleanPrompt);
      const task: ImageTask = {
        ...data.generation,
        title: taskTitle,
        prompt: cleanPrompt,
        finalPrompt: data.generation.finalPrompt || cleanPrompt,
        style: data.generation.style || defaultStyle,
        ratio: data.generation.ratio || ratio,
        resolution: (data.generation.resolution || resolution) as ImageResolution,
        status: "生成中",
        count: 0,
        images: [],
        visualIndex: 0,
        createdAt: data.generation.createdAt,
        updatedAt: data.generation.updatedAt
      };

      setResultsByTask((current) => ({ ...current, [taskId]: [] }));
      setHistory((current) => [task, ...current.filter((item) => item.taskId !== taskId)]);
      setResults([]);
      setActiveTaskId(taskId);
      setActiveResultId(null);
      toast({ type: "success", message: uploadedImage ? "图片编辑任务已创建，正在生成。" : "图片生成任务已创建，正在生成。" });
    } catch {
      toast({ type: "error", message: "图片任务创建失败，请稍后重试。" });
      await reloadHistory();
    } finally {
      setCreating(false);
    }
  }

  function handleSelectHistory(task: ImageTask) {
    setPrompt(task.prompt);
    setStyle(task.style || defaultStyle);
    setRatio(task.ratio);
    setResolution(task.resolution || "1K");
    if (isSelectableImageModel(task.model)) setModel(task.model);
    setActiveTaskId(task.taskId);
    setPreviewResultId(null);
    const taskResults = resultsByTask[task.taskId] || buildResultsFromTask(task);
    setResultsByTask((current) => ({ ...current, [task.taskId]: taskResults }));
    setResults(taskResults);
    setActiveResultId(taskResults[0]?.id || null);
  }

  async function handleDeleteHistory(task: ImageTask) {
    try {
      const response = await fetch(`/api/ai/image/history/${encodeURIComponent(task.taskId)}`, { method: "DELETE" });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        toast({ type: "error", message: data.message || "历史记录删除失败。" });
        return;
      }

      setHistory((current) => current.filter((item) => item.taskId !== task.taskId));
      setResultsByTask((current) => {
        const next = { ...current };
        delete next[task.taskId];
        return next;
      });
      if (activeTaskId === task.taskId) {
        setActiveTaskId(null);
        setActiveResultId(null);
        setPreviewResultId(null);
        setResults([]);
      }
      toast({ type: "success", message: "已删除历史记录。" });
    } catch {
      toast({ type: "error", message: "历史记录删除失败。" });
    }
  }

  function handleReuse(result: ImageResult) {
    setPrompt(result.finalPrompt || result.revisedPrompt || result.prompt);
    toast({ type: "success", message: "已将提示词回填到参数面板。" });
  }

  async function handleToggleLike(id: string) {
    const target = results.find((result) => result.id === id);
    if (!target) return;
    const nextLiked = !target.liked;
    const targetTaskId = target.taskId;

    try {
      const response = await fetch(
        nextLiked ? "/api/favorites" : `/api/favorites?targetType=image&targetId=${encodeURIComponent(targetTaskId)}`,
        {
          method: nextLiked ? "POST" : "DELETE",
          headers: nextLiked ? { "Content-Type": "application/json" } : undefined,
          body: nextLiked ? JSON.stringify({ targetType: "image", targetId: targetTaskId }) : undefined
        }
      );
      if (!response.ok) throw new Error("favorite failed");

      const updateResults = (items: ImageResult[]) => items.map((result) => (result.taskId === targetTaskId ? { ...result, liked: nextLiked } : result));
      setResults(updateResults(results));
      setResultsByTask((current) => {
        const next = { ...current };
        Object.keys(next).forEach((taskId) => {
          if (taskId === targetTaskId) next[taskId] = updateResults(next[taskId]);
        });
        return next;
      });
      setHistory((current) => current.map((task) => (task.taskId === targetTaskId ? { ...task, isFavorite: nextLiked } : task)));
      toast({ type: "success", message: nextLiked ? "已收藏当前图片记录。" : "已取消收藏。" });
    } catch {
      toast({ type: "error", message: "收藏状态更新失败，请稍后重试。" });
    }
  }

  function handlePreview(result: ImageResult) {
    setActiveResultId(result.id);
    setPreviewResultId(result.id);
  }

  function selectPreviewOffset(offset: number) {
    if (!results.length || !previewResult) return;
    const nextIndex = (previewIndex + offset + results.length) % results.length;
    setActiveResultId(results[nextIndex].id);
    setPreviewResultId(results[nextIndex].id);
  }

  async function handleDownload(result: ImageResult) {
    setActiveResultId(result.id);
    const ok = await downloadImage(result);
    toast({ type: ok ? "success" : "error", message: ok ? "已开始下载当前原图。" : "当前图片无法下载。" });
  }

  const activeTask = activeTaskId ? history.find((task) => task.taskId === activeTaskId) : null;
  const resultLoading = creating || activeTask?.status === "生成中";

  return (
    <>
      <div className="flex min-h-0 w-full flex-col gap-4 xl:h-[calc(100vh-128px)] xl:overflow-hidden xl:flex-row">
        <div className="min-h-0 w-full xl:h-full xl:w-[320px] xl:shrink-0 xl:overflow-y-auto">
          <ImageParameterPanel
            prompt={prompt}
            style={style}
            ratio={ratio}
            resolution={resolution}
            model={model}
            uploadedImage={uploadedImage}
            loading={creating}
            modelSupportsImageUpload={modelSupportsImageUpload}
            quotaSummary={quotaSummary}
            onPromptChange={setPrompt}
            onStyleChange={setStyle}
            onRatioChange={setRatio}
            onResolutionChange={setResolution}
            onModelChange={setModel}
            onImageSelect={handleImageSelect}
            onImageRemove={handleImageRemove}
            onImagePreview={() => setShowUploadPreview(true)}
            onGenerate={handleGenerate}
          />
        </div>

        <div className="min-h-[520px] min-w-0 flex-1 xl:h-full xl:min-h-0">
          <ImageResultGrid
            results={results}
            loading={resultLoading}
            activeId={activeResultId}
            onSelect={setActiveResultId}
            onPreview={handlePreview}
            onDownload={handleDownload}
            onReuse={handleReuse}
            onToggleLike={handleToggleLike}
          />
        </div>

        <div className="hidden min-h-0 w-full xl:block xl:h-full xl:w-[330px] xl:shrink-0">
          <ImageHistoryPanel
            tasks={history}
            activeTaskId={activeTaskId}
            loading={historyLoading}
            onDelete={handleDeleteHistory}
            onSelect={handleSelectHistory}
          />
        </div>
      </div>

      <ImagePreviewDialog
        result={previewResult}
        indexLabel={previewResult && results.length > 1 ? `${previewIndex + 1}/${results.length}` : undefined}
        onPrevious={results.length > 1 ? () => selectPreviewOffset(-1) : undefined}
        onNext={results.length > 1 ? () => selectPreviewOffset(1) : undefined}
        onClose={() => setPreviewResultId(null)}
        onReuse={handleReuse}
        onToggleLike={handleToggleLike}
        onDownload={handleDownload}
      />
      <ImageUploadPreviewDialog image={showUploadPreview ? uploadedImage : null} onClose={() => setShowUploadPreview(false)} />
    </>
  );
}
