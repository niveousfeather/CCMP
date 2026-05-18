"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { initialVideoPrompt, JIMENG_VIDEO_MODEL, VideoTask } from "@/components/video-generation/video-data";
import { VideoHistoryPanel } from "@/components/video-generation/video-history-panel";
import { VideoParameterPanel } from "@/components/video-generation/video-parameter-panel";
import { VideoPreviewPanel } from "@/components/video-generation/video-preview-panel";
import { useToast } from "@/components/ui/toast";

type UserQuotaResponse = {
  videoDailyLimit: number;
  videoUsedToday: number;
  videoRemaining: number;
};

export function VideoGenerationPage({ initialTaskId = null }: { initialTaskId?: string | null }) {
  const [prompt, setPrompt] = useState(initialVideoPrompt);
  const [model, setModel] = useState(JIMENG_VIDEO_MODEL);
  const [duration, setDuration] = useState("5s");
  const [ratio, setRatio] = useState("16:9");
  const [resolution, setResolution] = useState("720P");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<VideoTask[]>([]);
  const [currentTask, setCurrentTask] = useState<VideoTask | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [quotaSummary, setQuotaSummary] = useState<string | null>(null);
  const { toast } = useToast();
  const selectedTaskId = initialTaskId;

  const pendingIds = useMemo(
    () => history.filter((task) => task.status === "生成中").map((task) => task.taskId),
    [history]
  );

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/video/history");
    if (!response.ok) throw new Error("VIDEO_HISTORY_FAILED");
    const data = (await response.json()) as { history: VideoTask[] };
    setHistory(data.history);
    setCurrentTask((current) => {
      if (!current) return data.history[0] || null;
      return data.history.find((task) => task.taskId === current.taskId) || current;
    });
  }, []);

  const loadQuota = useCallback(async () => {
    try {
      const response = await fetch("/api/user/quota");
      const data = (await response.json().catch(() => ({}))) as Partial<UserQuotaResponse>;
      if (!response.ok) return;
      if (
        typeof data.videoDailyLimit === "number" &&
        typeof data.videoUsedToday === "number" &&
        typeof data.videoRemaining === "number"
      ) {
        setQuotaSummary(`今日视频次数 ${data.videoUsedToday}/${data.videoDailyLimit}，剩余 ${data.videoRemaining} 次`);
      }
    } catch {
      setQuotaSummary(null);
    }
  }, []);

  useEffect(() => {
    loadHistory().catch(() => toast({ type: "error", message: "视频历史加载失败。" }));
  }, [loadHistory, toast]);

  useEffect(() => {
    if (!selectedTaskId) return;
    const taskId = selectedTaskId;
    const matched = history.find((task) => task.taskId === selectedTaskId);
    if (matched) {
      handleSelectHistory(matched);
      return;
    }

    let cancelled = false;
    async function loadTask() {
      try {
        const response = await fetch(`/api/video/tasks/${encodeURIComponent(taskId)}`);
        const data = (await response.json().catch(() => null)) as { task?: VideoTask } | null;
        if (!response.ok || !data?.task || cancelled) return;
        setHistory((items) => [data.task!, ...items.filter((item) => item.taskId !== data.task!.taskId)]);
        handleSelectHistory(data.task);
      } catch {
        if (!cancelled) toast({ type: "error", message: "视频历史加载失败。" });
      }
    }
    void loadTask();
    return () => {
      cancelled = true;
    };
  }, [history, selectedTaskId, toast]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  useEffect(() => {
    loadQuota();
  }, [loadQuota]);

  useEffect(() => {
    if (!pendingIds.length) return;
    const timer = setInterval(async () => {
      for (const taskId of pendingIds) {
        const response = await fetch(`/api/video/tasks/${encodeURIComponent(taskId)}`);
        if (!response.ok) continue;
        const data = (await response.json()) as { task: VideoTask };
        setHistory((items) => items.map((item) => (item.taskId === taskId ? data.task : item)));
        setCurrentTask((current) => (current?.taskId === taskId ? data.task : current));
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [pendingIds]);

  function handleImageChange(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ type: "error", message: "仅支持上传图片文件。" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ type: "error", message: "图片过大，请压缩后重试。" });
      return;
    }
    if (imagePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    toast({ type: "success", message: "已添加参考图片。" });
  }

  function handleImageRemove() {
    if (imagePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl(null);
  }

  async function handleGenerate() {
    if (!prompt.trim()) {
      toast({ type: "error", message: "请输入视频生成提示词。" });
      return;
    }

    setSubmitting(true);
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("model", model);
    formData.append("duration", duration);
    formData.append("ratio", ratio);
    formData.append("resolution", resolution);
    if (imageFile) formData.append("image", imageFile, imageFile.name);

    try {
      const response = await fetch("/api/video", { method: "POST", body: formData });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "视频生成提交失败。");
      const task = data.task as VideoTask;
      setHistory((items) => [task, ...items.filter((item) => item.taskId !== task.taskId)]);
      setCurrentTask(task);
      setPlaying(false);
      toast({ type: "success", message: "视频任务已提交。" });
    } catch (error) {
      toast({ type: "error", message: error instanceof Error ? error.message : "视频生成提交失败。" });
    } finally {
      setSubmitting(false);
    }
  }

  function handleSelectHistory(task: VideoTask) {
    setPrompt(task.prompt);
    setModel(task.model);
    setDuration(task.duration);
    setRatio(task.ratio);
    setResolution(task.resolution);
    setCurrentTask(task);
    setPlaying(false);
    if (task.imageUrl) {
      if (imagePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(imagePreviewUrl);
      setImageFile(null);
      setImagePreviewUrl(task.imageUrl);
    } else {
      handleImageRemove();
    }
  }

  function handleTogglePlay() {
    if (!currentTask?.videoUrl) {
      toast({ type: "error", message: "视频生成完成后可播放预览。" });
      return;
    }
    setPlaying((value) => !value);
  }

  function handleDownload(task: VideoTask) {
    if (!task.videoUrl) {
      toast({ type: "error", message: "暂无可下载的视频文件。" });
      return;
    }
    window.open(task.videoUrl, "_blank", "noopener,noreferrer");
  }

  async function handleDeleteHistory(task: VideoTask) {
    try {
      const response = await fetch(`/api/video/history/${encodeURIComponent(task.taskId)}`, { method: "DELETE" });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        toast({ type: "error", message: data.message || "视频历史记录删除失败。" });
        return;
      }

      const nextHistory = history.filter((item) => item.taskId !== task.taskId);
      setHistory(nextHistory);
      if (currentTask?.taskId === task.taskId) {
        const nextTask = nextHistory[0] || null;
        setCurrentTask(nextTask);
        setPlaying(false);
        if (nextTask) {
          setPrompt(nextTask.prompt);
          setModel(nextTask.model);
          setDuration(nextTask.duration);
          setRatio(nextTask.ratio);
          setResolution(nextTask.resolution);
          setImageFile(null);
          setImagePreviewUrl(nextTask.imageUrl || null);
        } else {
          handleImageRemove();
        }
      }
      toast({ type: "success", message: "已删除视频历史记录。" });
    } catch {
      toast({ type: "error", message: "视频历史记录删除失败。" });
    }
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-col gap-4 xl:h-[calc(100vh-96px)] xl:min-h-[720px] xl:overflow-hidden xl:flex-row">
      <div className="min-h-0 w-full overflow-y-auto xl:w-[320px] xl:shrink-0">
        <VideoParameterPanel
          prompt={prompt}
          model={model}
          duration={duration}
          ratio={ratio}
          resolution={resolution}
          imagePreviewUrl={imagePreviewUrl}
          generating={submitting}
          quotaSummary={quotaSummary}
          onPromptChange={setPrompt}
          onModelChange={setModel}
          onDurationChange={setDuration}
          onRatioChange={setRatio}
          onResolutionChange={setResolution}
          onImageChange={handleImageChange}
          onImageRemove={handleImageRemove}
          onGenerate={handleGenerate}
        />
      </div>

      <VideoPreviewPanel task={currentTask} playing={playing} onTogglePlay={handleTogglePlay} onDownload={handleDownload} onRetry={handleGenerate} />

      <div className="hidden min-h-0 w-full xl:block xl:w-[330px] xl:shrink-0">
        <VideoHistoryPanel tasks={history} activeTaskId={currentTask?.taskId || null} onDelete={handleDeleteHistory} onSelect={handleSelectHistory} />
      </div>
    </div>
  );
}
