"use client";

import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TeachingArchitectureCanvas } from "@/components/smart-tools/teaching-architecture-diagram/TeachingArchitectureCanvas";
import { TeachingArchitectureHistoryPanel } from "@/components/smart-tools/teaching-architecture-diagram/TeachingArchitectureHistoryPanel";
import { TeachingArchitecturePromptBar } from "@/components/smart-tools/teaching-architecture-diagram/TeachingArchitecturePromptBar";
import { getTeachingArchitectureDiagramLabel } from "@/components/smart-tools/teaching-architecture-diagram/teaching-architecture-options";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  createTeachingArchitectureTask,
  deleteTeachingArchitectureTask,
  getTeachingArchitectureTask,
  getTeachingArchitectureTasks,
  reviseTeachingArchitectureTaskImage
} from "@/lib/smart-tools/teaching-architecture-diagram/client";
import type {
  TeachingArchitectureDiagramType,
  TeachingArchitectureErrorCode,
  TeachingArchitectureSourceType,
  TeachingArchitectureTask,
  TeachingArchitectureTaskStage,
  TeachingArchitectureTaskStatus
} from "@/lib/smart-tools/teaching-architecture-diagram/types";
import { TOTAL_TASK_TIMEOUT_MS } from "@/lib/smart-tools/teaching-architecture-diagram/types";

const POLL_INTERVAL_MS = 2_000;

function isPollableStatus(status: TeachingArchitectureTaskStatus | "idle") {
  return status === "pending" || status === "running" || status === "analyzing" || status === "generating";
}

export function TeachingArchitectureWorkbench() {
  const { toast } = useToast();
  const [textPrompt, setTextPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [diagramType, setDiagramType] = useState<TeachingArchitectureDiagramType>("auto");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<TeachingArchitectureTask | undefined>();
  const [status, setStatus] = useState<TeachingArchitectureTaskStatus | "idle">("idle");
  const [stage, setStage] = useState<TeachingArchitectureTaskStage | undefined>();
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [errorCode, setErrorCode] = useState<TeachingArchitectureErrorCode | undefined>();
  const [retryable, setRetryable] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | undefined>();
  const [recentTasks, setRecentTasks] = useState<TeachingArchitectureTask[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [revising, setRevising] = useState(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const pollerRef = useRef<number | null>(null);
  const pollStartedAtRef = useRef<number | null>(null);

  const normalizedText = textPrompt.trim();
  const hasText = normalizedText.length > 0;
  const hasFile = Boolean(file);
  const sourceType: TeachingArchitectureSourceType = hasFile ? "file" : "text";
  const isRevisionMode = status === "completed" && Boolean(taskId);
  const isBusy = isPollableStatus(status) || revising;
  const canStart = isRevisionMode ? hasText && !isBusy : (hasText || hasFile) && !isBusy;

  const stopActivePoller = useCallback(() => {
    if (pollerRef.current) {
      window.clearInterval(pollerRef.current);
      pollerRef.current = null;
    }
  }, []);

  const applyTask = useCallback((task: TeachingArchitectureTask) => {
    setTaskId(task.taskId);
    setActiveTask(task);
    setStatus(task.status);
    setStage(task.stage);
    setProgress(task.progress);
    setCurrentStep(task.currentStep);
    setErrorMessage(task.errorMessage);
    setErrorCode(task.errorCode);
    setRetryable(Boolean(task.retryable));
    setDownloadUrl(task.downloadUrl);
    setDiagramType(task.diagramType);
  }, []);

  const refreshRecentTasks = useCallback(async (signal?: AbortSignal) => {
    setRecentLoading(true);
    try {
      const response = await getTeachingArchitectureTasks({ limit: 12, signal });
      setRecentTasks(response.tasks);
    } catch (recentError) {
      if (!signal?.aborted) {
        console.warn("[teaching-architecture-diagram] recent tasks unavailable", recentError);
      }
    } finally {
      if (!signal?.aborted) setRecentLoading(false);
    }
  }, []);

  const pollTask = useCallback(
    async (nextTaskId: string, signal?: AbortSignal) => {
      const snapshot = await getTeachingArchitectureTask(nextTaskId, { signal });
      if (signal?.aborted) return;
      applyTask(snapshot);
      return snapshot;
    },
    [applyTask]
  );

  const submitImageRevision = useCallback(async () => {
    if (!taskId || !normalizedText || revising) return;

    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setRevising(true);
    setStatus("generating");
    setStage("generating_image");
    setProgress(82);
    setCurrentStep("正在根据修改说明重新生成图片");
    setErrorMessage(undefined);
    setErrorCode(undefined);
    setRetryable(false);
    pollStartedAtRef.current = Date.now();

    try {
      const task = await reviseTeachingArchitectureTaskImage(taskId, normalizedText, { signal: controller.signal });
      applyTask(task);
      setTextPrompt("");
      void refreshRecentTasks();
      toast({ type: "success", message: "图片修改任务已提交，正在重新生成 output.png。" });
    } catch (revisionError) {
      if (controller.signal.aborted) return;
      const message = revisionError instanceof Error ? revisionError.message : "图片修改任务提交失败。";
      setStatus("failed");
      setStage("failed");
      setProgress(0);
      setCurrentStep("图片修改失败");
      setErrorMessage(message);
      toast({ type: "error", message });
    } finally {
      setRevising(false);
      if (activeRequestRef.current === controller) activeRequestRef.current = null;
    }
  }, [applyTask, normalizedText, refreshRecentTasks, revising, taskId, toast]);

  const startTask = useCallback(async () => {
    if (isRevisionMode) {
      await submitImageRevision();
      return;
    }

    if (!hasText && !hasFile) {
      setErrorMessage("请输入教学改革描述，或上传 PDF、DOCX、PPTX、TXT、MD 文件。");
      toast({ type: "error", message: "请先提供文字描述或教学材料。" });
      return;
    }

    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    pollStartedAtRef.current = Date.now();
    setStatus("pending");
    setStage("pending");
    setProgress(5);
    setCurrentStep("正在创建任务");
    setErrorMessage(undefined);
    setErrorCode(undefined);
    setRetryable(false);
    setDownloadUrl(undefined);
    setActiveTask(undefined);

    try {
      const created = await createTeachingArchitectureTask(
        {
          sourceType,
          textPrompt: sourceType === "text" ? normalizedText : undefined,
          file: sourceType === "file" ? file || undefined : undefined,
          diagramType
        },
        { signal: controller.signal }
      );
      setTaskId(created.taskId);
      setStatus(created.status);
      setStage(created.stage);
      setProgress(10);
      setCurrentStep("正在创建任务");
      void refreshRecentTasks();
      toast({ type: "success", message: "教学架构图任务已创建。" });
    } catch (taskError) {
      if (controller.signal.aborted) return;
      setStatus("failed");
      setStage("failed");
      setProgress(0);
      setCurrentStep("任务创建失败");
      const message = taskError instanceof Error ? taskError.message : "教学架构图任务创建失败。";
      setErrorMessage(message);
      toast({ type: "error", message });
    } finally {
      if (activeRequestRef.current === controller) activeRequestRef.current = null;
    }
  }, [diagramType, file, hasFile, hasText, isRevisionMode, normalizedText, refreshRecentTasks, sourceType, submitImageRevision, toast]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshRecentTasks(controller.signal);
    return () => controller.abort();
  }, [refreshRecentTasks]);

  useEffect(() => {
    if (!taskId || !isPollableStatus(status)) {
      stopActivePoller();
      pollStartedAtRef.current = null;
      return;
    }

    const controller = new AbortController();
    pollStartedAtRef.current = pollStartedAtRef.current || Date.now();

    async function refreshTask() {
      if (!taskId) return;
      if (pollStartedAtRef.current && Date.now() - pollStartedAtRef.current > TOTAL_TASK_TIMEOUT_MS) {
        stopActivePoller();
        setStatus("failed");
        setStage("failed");
        setErrorMessage("任务处理超时，请稍后重试或减少材料数量。");
        setCurrentStep("任务处理超时");
        return;
      }

      try {
        const snapshot = await pollTask(taskId, controller.signal);
        if (!snapshot || controller.signal.aborted) return;
        if (!isPollableStatus(snapshot.status)) {
          stopActivePoller();
          pollStartedAtRef.current = null;
          void refreshRecentTasks();
          if (snapshot.status === "completed") {
            setCurrentStep("图片预览已就绪");
            toast({ type: "success", message: "教学架构图 PNG 已生成，可在底部输入修改说明继续调整。" });
          }
        }
      } catch (pollError) {
        if (controller.signal.aborted) return;
        setErrorMessage(pollError instanceof Error ? pollError.message : "任务状态查询失败。");
      }
    }

    void refreshTask();
    pollerRef.current = window.setInterval(() => {
      void refreshTask();
    }, POLL_INTERVAL_MS);

    return () => {
      controller.abort();
      stopActivePoller();
    };
  }, [pollTask, refreshRecentTasks, status, stopActivePoller, taskId, toast]);

  useEffect(() => {
    return () => {
      activeRequestRef.current?.abort();
      stopActivePoller();
    };
  }, [stopActivePoller]);

  const retryCurrentTask = useCallback(async () => {
    await startTask();
  }, [startTask]);

  const openHistoryTask = useCallback(
    async (historyTaskId: string) => {
      activeRequestRef.current?.abort();
      stopActivePoller();
      pollStartedAtRef.current = null;
      setErrorMessage(undefined);
      setErrorCode(undefined);
      setCurrentStep("正在读取历史任务");
      setTextPrompt("");

      const controller = new AbortController();
      activeRequestRef.current = controller;
      try {
        const snapshot = await pollTask(historyTaskId, controller.signal);
        if (!snapshot || controller.signal.aborted) return;
        if (isPollableStatus(snapshot.status)) pollStartedAtRef.current = Date.now();
      } catch (historyError) {
        if (controller.signal.aborted) return;
        const message = historyError instanceof Error ? historyError.message : "历史任务读取失败。";
        setStatus("failed");
        setStage("failed");
        setErrorMessage(message);
        toast({ type: "error", message });
      } finally {
        if (activeRequestRef.current === controller) activeRequestRef.current = null;
      }
    },
    [pollTask, stopActivePoller, toast]
  );

  const deleteHistoryTask = useCallback(
    async (historyTaskId: string) => {
      try {
        await deleteTeachingArchitectureTask(historyTaskId);
        setRecentTasks((current) => current.filter((item) => item.taskId !== historyTaskId));
        if (taskId === historyTaskId) {
          stopActivePoller();
          setTaskId(null);
          setActiveTask(undefined);
          setStatus("idle");
          setStage(undefined);
          setProgress(0);
          setCurrentStep("");
          setErrorMessage(undefined);
          setErrorCode(undefined);
          setRetryable(false);
          setDownloadUrl(undefined);
          setTextPrompt("");
        }
        toast({ type: "success", message: "历史记录已删除。" });
      } catch (deleteError) {
        const message = deleteError instanceof Error ? deleteError.message : "历史记录删除失败。";
        toast({ type: "error", message });
      }
    },
    [stopActivePoller, taskId, toast]
  );

  const downloadPng = useCallback(async () => {
    if (!downloadUrl || !taskId) return;
    try {
      const response = await fetch(`${downloadUrl}${downloadUrl.includes("?") ? "&" : "?"}format=png`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "PNG 下载失败。");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `teaching-architecture-diagram-${taskId}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({ type: "success", message: "已开始下载 PNG。" });
    } catch (downloadError) {
      const message = downloadError instanceof Error ? downloadError.message : "PNG 下载失败。";
      toast({ type: "error", message });
    }
  }, [downloadUrl, taskId, toast]);

  const statusText = useMemo(() => {
    if (revising) return "提交修改中";
    if (status === "idle") return "等待输入";
    return currentStep || status;
  }, [currentStep, revising, status]);

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] flex-col overflow-hidden bg-[#eef2f7]">
      <header className="absolute left-4 right-4 top-4 z-20 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/88 px-3 shadow-[0_14px_42px_rgba(15,23,42,0.1)] backdrop-blur md:left-6 md:right-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/smart-tools"
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-950">教学架构图</h1>
            <p className="truncate text-xs text-slate-500">
              {getTeachingArchitectureDiagramLabel(diagramType)} · {statusText}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={!downloadUrl || status !== "completed"} onClick={downloadPng}>
            <Download className="h-4 w-4" />
            下载 PNG
          </Button>
        </div>
      </header>

      <TeachingArchitectureCanvas
        currentStep={currentStep}
        errorCode={errorCode}
        errorMessage={errorMessage}
        onRetry={retryCurrentTask}
        progress={progress}
        retryable={retryable}
        stage={stage}
        status={status}
        task={activeTask}
      />

      <TeachingArchitectureHistoryPanel
        activeTaskId={taskId}
        loading={recentLoading}
        tasks={recentTasks}
        onDeleteTask={deleteHistoryTask}
        onRefresh={() => void refreshRecentTasks()}
        onSelectTask={openHistoryTask}
      />

      <TeachingArchitecturePromptBar
        canStart={canStart}
        diagramType={diagramType}
        disabled={isBusy}
        file={isRevisionMode ? null : file}
        mode={isRevisionMode ? "revise" : "create"}
        textPrompt={textPrompt}
        onClearText={() => setTextPrompt("")}
        onDiagramTypeChange={setDiagramType}
        onFileChange={setFile}
        onStart={startTask}
        onTextChange={setTextPrompt}
      />
    </div>
  );
}
