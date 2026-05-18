"use client";

import { ArrowLeft, CheckCircle2, Loader2, Presentation, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AcademicPptPreviewCanvas } from "@/components/smart-tools/academic-ppt/AcademicPptPreviewCanvas";
import { AcademicPptSettingsPanel } from "@/components/smart-tools/academic-ppt/AcademicPptSettingsPanel";
import { AcademicPptSourcePanel } from "@/components/smart-tools/academic-ppt/AcademicPptSourcePanel";
import { AcademicPptTaskMonitor } from "@/components/smart-tools/academic-ppt/AcademicPptTaskMonitor";
import { Badge } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  AcademicPptApiError,
  cancelAcademicPptTask,
  createAcademicPptTask,
  getAcademicPptRecentTasks,
  getAcademicPptTask,
  getAcademicPptTaskLogs,
  getAcademicPptTaskPreview,
  resumeAcademicPptTask
} from "@/lib/smart-tools/academic-ppt/client";
import {
  ACADEMIC_PPT_LOG_KEEP_LIMIT,
  ACADEMIC_PPT_LOG_RENDER_LIMIT,
  ACADEMIC_PPT_RECENT_TASK_LIMIT,
  academicPptPipelineLabels,
  defaultAcademicPptSettings,
  initialAcademicPptPipeline,
  sampleAcademicPptSlides
} from "@/lib/smart-tools/academic-ppt/task-api";
import { normalizeAcademicPptSettings } from "@/lib/smart-tools/academic-ppt/task-api";
import type {
  AcademicPptPipelineStep,
  AcademicPptModelCriticStatus,
  AcademicPptGeneratorSource,
  AcademicPptModelSource,
  AcademicPptPreviewManifest,
  AcademicPptPreviewType,
  AcademicPptQualityLevel,
  AcademicPptResearchStatus,
  AcademicPptSearchStatus,
  AcademicPptRecentTask,
  AcademicPptSourceFile,
  AcademicPptSlidePreview,
  AcademicPptTaskLog,
  AcademicPptTaskStep,
  AcademicPptTaskStatus,
  AcademicPptTemplateStyle,
  AcademicPptVisualPipelineStatus
} from "@/lib/smart-tools/academic-ppt/types";

const STEP_TO_PIPELINE_INDEX: Partial<Record<AcademicPptTaskStep, number>> = {
  upload_received: 0,
  parsing_source: 0,
  source_parsed: 0,
  research_enhancement: 1,
  research_ready: 1,
  planning_outline: 2,
  outline_generated: 2,
  running_critic: 4,
  repairing_outline: 5,
  outline_ready: 5,
  generating_slides: 3,
  visual_qa: 4,
  repairing_slides: 5,
  exporting_pptx: 6,
  pptx_exported: 6,
  rendering_preview: 6,
  completed: 6,
  failed: 0,
  cancelled: 0
};

const ACADEMIC_PPT_TASK_STEPS = new Set<AcademicPptTaskStep>([
  "upload_received",
  "parsing_source",
  "source_parsed",
  "research_enhancement",
  "research_ready",
  "planning_outline",
  "outline_generated",
  "running_critic",
  "repairing_outline",
  "outline_ready",
  "generating_slides",
  "visual_qa",
  "repairing_slides",
  "exporting_pptx",
  "pptx_exported",
  "rendering_preview",
  "completed",
  "failed",
  "cancelled"
]);

const RECENT_TASKS_HIDDEN_STORAGE_KEY = "academic-ppt:hidden-recent-task-ids";

function normalizeTaskStep(step: string): AcademicPptTaskStep | undefined {
  return ACADEMIC_PPT_TASK_STEPS.has(step as AcademicPptTaskStep) ? (step as AcademicPptTaskStep) : undefined;
}

function getPipelineForStep(currentStep: string, status: AcademicPptTaskStatus): AcademicPptPipelineStep[] {
  const normalizedStep = normalizeTaskStep(currentStep);
  const activeIndex = normalizedStep ? STEP_TO_PIPELINE_INDEX[normalizedStep] ?? 0 : 0;

  return initialAcademicPptPipeline.map((step, index) => {
    if (status === "failed" && index === activeIndex) return { ...step, status: "failed" };
    if (status === "success") return { ...step, status: "success" };
    if (status === "cancelled") return { ...step, status: index < activeIndex ? "success" : "waiting" };
    if (status === "queued") return { ...step, status: index === 0 ? "running" : "waiting" };
    if (status === "pending") return { ...step, status: index === 0 ? "running" : "waiting" };
    if (status === "running") {
      if (index < activeIndex) return { ...step, status: "success" };
      if (index === activeIndex) return { ...step, status: "running" };
    }
    return { ...step, status: "waiting" };
  });
}

function getTopStatus(status: AcademicPptTaskStatus) {
  if (status === "queued") return { label: "排队中", icon: Loader2, className: "border-blue-200 bg-blue-50 text-blue-700", spinning: true };
  if (status === "pending" || status === "running") return { label: "生成中", icon: Loader2, className: "border-blue-200 bg-blue-50 text-blue-700", spinning: true };
  if (status === "success") return { label: "已完成", icon: CheckCircle2, className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (status === "failed") return { label: "失败", icon: XCircle, className: "border-red-200 bg-red-50 text-red-700" };
  if (status === "cancelled") return { label: "已取消", icon: XCircle, className: "border-amber-200 bg-amber-50 text-amber-700" };
  return { label: "就绪", icon: Presentation, className: "border-blue-200 bg-blue-50 text-blue-700" };
}

function limitLogs(logs: AcademicPptTaskLog[]) {
  return logs.slice(-ACADEMIC_PPT_LOG_RENDER_LIMIT);
}

function isTerminalStatus(status: AcademicPptTaskStatus) {
  return status === "success" || status === "failed" || status === "cancelled" || status === "missing";
}

function isPollableStatus(status: AcademicPptTaskStatus) {
  return status === "queued" || status === "pending" || status === "running";
}

function isAcademicPptNotFoundError(error: unknown) {
  return error instanceof AcademicPptApiError && error.status === 404;
}

function deriveSlidesFromPreviewManifest(
  preview: AcademicPptPreviewManifest | undefined,
  sourceSlides: AcademicPptSlidePreview[],
  templateId?: string
) {
  const previewCount = preview?.slides.length || 0;
  if (!previewCount) return sourceSlides;
  return Array.from({ length: previewCount }, (_, index) => {
    const existing = sourceSlides[index];
    if (existing) {
      return { ...existing, id: `preview-${preview?.source || "manifest"}-${index}`, index: index + 1, status: "ready" as const };
    }
    return {
      id: `preview-${preview?.source || "manifest"}-${index}`,
      index: index + 1,
      title: `Slide ${index + 1}`,
        layout: "content" as const,
        visualType: "none" as const,
      templateId: templateId || "tech_blue_business",
      status: "ready" as const
    };
  });
}

export function AcademicPptWorkbench() {
  const { toast } = useToast();
  const [sourceFile, setSourceFile] = useState<AcademicPptSourceFile | null>(null);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [settings, setSettings] = useState(normalizeAcademicPptSettings(defaultAcademicPptSettings));
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [slidesPreview, setSlidesPreview] = useState<AcademicPptSlidePreview[]>(sampleAcademicPptSlides);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<AcademicPptTaskStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [downloadUrl, setDownloadUrl] = useState<string | undefined>();
  const [modelSource, setModelSource] = useState<AcademicPptModelSource | undefined>();
  const [modelName, setModelName] = useState<string | undefined>();
  const [fallbackReason, setFallbackReason] = useState<string | undefined>();
  const [generationMode, setGenerationMode] = useState<string | undefined>();
  const [visualPipelineStatus, setVisualPipelineStatus] = useState<AcademicPptVisualPipelineStatus | undefined>();
  const [generatorSource, setGeneratorSource] = useState<AcademicPptGeneratorSource | undefined>();
  const [slideCount, setSlideCount] = useState<number | undefined>();
  const [outputFileSize, setOutputFileSize] = useState<number | undefined>();
  const [templateStyle, setTemplateStyle] = useState<AcademicPptTemplateStyle | undefined>(defaultAcademicPptSettings.templateStyle);
  const [outlineTitle, setOutlineTitle] = useState<string | undefined>();
  const [qualityScore, setQualityScore] = useState<number | undefined>();
  const [qualityLevel, setQualityLevel] = useState<AcademicPptQualityLevel | undefined>();
  const [qualityIssuesCount, setQualityIssuesCount] = useState<number | undefined>();
  const [repairRounds, setRepairRounds] = useState<number | undefined>();
  const [nativePreview, setNativePreview] = useState<AcademicPptPreviewManifest | undefined>();
  const [previewType, setPreviewType] = useState<AcademicPptPreviewType | undefined>();
  const [previewFallbackReason, setPreviewFallbackReason] = useState<string | undefined>();
  const [visualQaScore, setVisualQaScore] = useState<number | undefined>();
  const [visualQaLevel, setVisualQaLevel] = useState<AcademicPptQualityLevel | undefined>();
  const [visualQaIssuesCount, setVisualQaIssuesCount] = useState<number | undefined>();
  const [visualQaEnabled, setVisualQaEnabled] = useState(defaultAcademicPptSettings.enableVisualQa);
  const [visualQaSummary, setVisualQaSummary] = useState<string | undefined>();
  const [iconDecorationEnabled, setIconDecorationEnabled] = useState(defaultAcademicPptSettings.enableIconDecoration);
  const [researchEnabled, setResearchEnabled] = useState(defaultAcademicPptSettings.enableDeepResearch);
  const [externalResearchEnabled, setExternalResearchEnabled] = useState(defaultAcademicPptSettings.enableExternalResearch);
  const [webSearchEnabled, setWebSearchEnabled] = useState(defaultAcademicPptSettings.webSearchEnabled ?? false);
  const [searchStatus, setSearchStatus] = useState<AcademicPptSearchStatus | undefined>();
  const [researchStatus, setResearchStatus] = useState<AcademicPptResearchStatus | undefined>();
  const [researchSourcesCount, setResearchSourcesCount] = useState<number | undefined>();
  const [researchFallbackReason, setResearchFallbackReason] = useState<string | undefined>();
  const [modelCriticStatus, setModelCriticStatus] = useState<AcademicPptModelCriticStatus | undefined>();
  const [modelCriticScore, setModelCriticScore] = useState<number | undefined>();
  const [modelCriticLevel, setModelCriticLevel] = useState<AcademicPptQualityLevel | undefined>();
  const [modelCriticIssuesCount, setModelCriticIssuesCount] = useState<number | undefined>();
  const [modelCriticRounds, setModelCriticRounds] = useState<number | undefined>();
  const [modelCriticFallbackReason, setModelCriticFallbackReason] = useState<string | undefined>();
  const [autoRepairFallbackReason, setAutoRepairFallbackReason] = useState<string | undefined>();
  const [autoRepairRounds, setAutoRepairRounds] = useState<number | undefined>();
  const [autoRepairApplied, setAutoRepairApplied] = useState<boolean | undefined>();
  const [finalQualityScore, setFinalQualityScore] = useState<number | undefined>();
  const [finalVisualQaScore, setFinalVisualQaScore] = useState<number | undefined>();
  const [resumable, setResumable] = useState(false);
  const [resumeFromStep, setResumeFromStep] = useState<string | undefined>();
  const [createdAt, setCreatedAt] = useState<string | undefined>();
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const [logs, setLogs] = useState<AcademicPptTaskLog[]>([]);
  const [recentTasks, setRecentTasks] = useState<AcademicPptRecentTask[]>([]);
  const [hiddenRecentTaskIds, setHiddenRecentTaskIds] = useState<Set<string>>(() => new Set());
  const [selectedTaskPreviewMap, setSelectedTaskPreviewMap] = useState<Record<string, AcademicPptPreviewManifest>>({});
  const activeRequestRef = useRef<AbortController | null>(null);
  const previewRequestRef = useRef<AbortController | null>(null);
  const previewManifestCacheRef = useRef<Map<string, AcademicPptPreviewManifest>>(new Map());
  const pollerRef = useRef<{ taskId: string; controller: AbortController; timer?: number; stopped: boolean } | null>(null);
  const activeTaskIdRef = useRef<string | null>(null);

  const resetTaskDetails = useCallback(() => {
    setError(undefined);
    setDownloadUrl(undefined);
    setModelSource(undefined);
    setModelName(undefined);
    setFallbackReason(undefined);
    setGenerationMode(undefined);
    setVisualPipelineStatus(undefined);
    setGeneratorSource(undefined);
    setSlideCount(undefined);
    setOutputFileSize(undefined);
    setTemplateStyle(settings.templateStyle);
    setOutlineTitle(undefined);
    setQualityScore(undefined);
    setQualityLevel(undefined);
    setQualityIssuesCount(undefined);
    setRepairRounds(undefined);
    setNativePreview(undefined);
    setPreviewType(undefined);
    setPreviewFallbackReason(undefined);
    setVisualQaScore(undefined);
    setVisualQaLevel(undefined);
    setVisualQaIssuesCount(undefined);
    setVisualQaEnabled(settings.enableVisualQa);
    setVisualQaSummary(undefined);
    setIconDecorationEnabled(settings.enableIconDecoration);
    setResearchEnabled(settings.enableDeepResearch);
    setExternalResearchEnabled(settings.enableExternalResearch);
    setWebSearchEnabled(settings.webSearchEnabled ?? settings.enableExternalResearch);
    setSearchStatus((settings.webSearchEnabled ?? settings.enableExternalResearch) ? "enabled" : "disabled");
    setResearchStatus(undefined);
    setResearchSourcesCount(undefined);
    setResearchFallbackReason(undefined);
    setModelCriticStatus(undefined);
    setModelCriticScore(undefined);
    setModelCriticLevel(undefined);
    setModelCriticIssuesCount(undefined);
    setModelCriticRounds(undefined);
    setModelCriticFallbackReason(undefined);
    setAutoRepairFallbackReason(undefined);
    setAutoRepairRounds(undefined);
    setAutoRepairApplied(undefined);
    setFinalQualityScore(undefined);
    setFinalVisualQaScore(undefined);
    setCreatedAt(undefined);
    setUpdatedAt(undefined);
    setResumable(false);
    setResumeFromStep(undefined);
    setSlidesPreview(sampleAcademicPptSlides);
    setActiveSlideIndex(0);
    setLogs([]);
  }, [settings]);

  const clearSelectedTaskView = useCallback(() => {
    setSelectedTaskId(null);
    setTaskId(null);
    setStatus("idle");
    setProgress(0);
    setCurrentStep("");
    resetTaskDetails();
  }, [resetTaskDetails]);

  const pipeline = useMemo(() => getPipelineForStep(currentStep, status), [currentStep, status]);
  const visibleLogs = useMemo(() => limitLogs(logs), [logs]);
  const visibleRecentTasks = useMemo(
    () => recentTasks.filter((task) => !hiddenRecentTaskIds.has(task.taskId)),
    [hiddenRecentTaskIds, recentTasks]
  );
  const topStatus = getTopStatus(status);
  const TopStatusIcon = topStatus.icon;
  const activeTaskIsGenerating =
    Boolean(activeTaskId) && (activeTaskId !== selectedTaskId || status === "queued" || status === "pending" || status === "running");
  const canStart = Boolean(rawFile) && !activeTaskIsGenerating;

  useEffect(() => {
    activeTaskIdRef.current = activeTaskId;
  }, [activeTaskId]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(RECENT_TASKS_HIDDEN_STORAGE_KEY);
      const values = stored ? (JSON.parse(stored) as unknown) : [];
      if (Array.isArray(values)) {
        setHiddenRecentTaskIds(new Set(values.filter((value): value is string => typeof value === "string")));
      }
    } catch {
      setHiddenRecentTaskIds(new Set());
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(RECENT_TASKS_HIDDEN_STORAGE_KEY, JSON.stringify([...hiddenRecentTaskIds]));
    } catch {
      // Local history hiding is a convenience only.
    }
  }, [hiddenRecentTaskIds]);

  useEffect(() => {
    return () => {
      activeRequestRef.current?.abort();
      previewRequestRef.current?.abort();
      stopActivePoller();
    };
  }, []);

  useEffect(() => {
    previewManifestCacheRef.current = new Map(Object.entries(selectedTaskPreviewMap));
  }, [selectedTaskPreviewMap]);

  const markRecentTaskMissing = useCallback((missingTaskId: string) => {
    setRecentTasks((current) =>
      current.map((task) => (task.taskId === missingTaskId ? { ...task, status: "missing" as const } : task))
    );
  }, []);

  const stopActivePoller = useCallback((targetTaskId?: string) => {
    const poller = pollerRef.current;
    if (!poller) return;
    if (targetTaskId && poller.taskId !== targetTaskId) return;
    poller.stopped = true;
    if (poller.timer) window.clearInterval(poller.timer);
    poller.controller.abort();
    if (pollerRef.current === poller) {
      pollerRef.current = null;
    }
  }, []);

  const abortPreviewRequest = useCallback(() => {
    previewRequestRef.current?.abort();
    previewRequestRef.current = null;
  }, []);

  const refreshRecentTasks = useCallback(async (signal?: AbortSignal) => {
    const recent = await getAcademicPptRecentTasks({ limit: ACADEMIC_PPT_RECENT_TASK_LIMIT, signal });
    setRecentTasks(recent.tasks);
  }, []);

  const dismissRecentTask = useCallback(
    (dismissedTaskId: string) => {
      setHiddenRecentTaskIds((current) => new Set([...current, dismissedTaskId]));
      if (selectedTaskId === dismissedTaskId) {
        activeRequestRef.current?.abort();
        abortPreviewRequest();
        if (activeTaskId !== dismissedTaskId) {
          stopActivePoller(dismissedTaskId);
        }
        clearSelectedTaskView();
      }
    },
    [abortPreviewRequest, activeTaskId, clearSelectedTaskView, selectedTaskId, stopActivePoller]
  );

  useEffect(() => {
    const controller = new AbortController();
    void refreshRecentTasks(controller.signal).catch((recentError) => {
      if (!controller.signal.aborted) {
        setError(recentError instanceof Error ? recentError.message : "最近任务加载失败。");
      }
    });
    return () => controller.abort();
  }, [refreshRecentTasks]);

  const applyTaskSnapshot = useCallback((snapshot: Awaited<ReturnType<typeof getAcademicPptTask>>) => {
    setTaskId(snapshot.taskId);
    setStatus(snapshot.status);
    setProgress(snapshot.progress ?? 0);
    setCurrentStep(snapshot.currentStep || "");
    setError(snapshot.error);
    setResumable(Boolean(snapshot.resumable));
    setResumeFromStep(snapshot.resumeFromStep);
    setDownloadUrl(snapshot.downloadUrl);
    setModelSource(snapshot.modelSource);
    setModelName(snapshot.modelName);
    setFallbackReason(snapshot.fallbackReason);
    setGenerationMode(snapshot.generationMode);
    setVisualPipelineStatus(snapshot.visualPipelineStatus);
    setGeneratorSource(snapshot.generatorSource);
    setSlideCount(snapshot.slideCount);
    setOutputFileSize(snapshot.outputFileSize);
    setTemplateStyle(snapshot.templateStyle);
    setOutlineTitle(snapshot.outlineTitle);
    setQualityScore(snapshot.qualityScore);
    setQualityLevel(snapshot.qualityLevel);
    setQualityIssuesCount(snapshot.qualityIssuesCount);
    setRepairRounds(snapshot.repairRounds);
    setNativePreview(snapshot.nativePreview);
    setPreviewType(snapshot.previewType);
    setPreviewFallbackReason(snapshot.previewFallbackReason);
    setVisualQaScore(snapshot.visualQaScore);
    setVisualQaLevel(snapshot.visualQaLevel);
    setVisualQaIssuesCount(snapshot.visualQaIssuesCount);
    setVisualQaEnabled(snapshot.visualQaEnabled ?? true);
    setVisualQaSummary(snapshot.visualQaSummary);
    setIconDecorationEnabled(snapshot.iconDecorationEnabled ?? Boolean(snapshot.slidesPreview?.some((slide) => slide.iconDecorations?.length)));
    setResearchEnabled(snapshot.researchEnabled ?? false);
    setExternalResearchEnabled(snapshot.externalResearchEnabled ?? false);
    setWebSearchEnabled(snapshot.webSearchEnabled ?? snapshot.externalResearchEnabled ?? false);
    setSearchStatus(snapshot.searchStatus);
    setResearchStatus(snapshot.researchStatus);
    setResearchSourcesCount(snapshot.researchSourcesCount);
    setResearchFallbackReason(snapshot.researchFallbackReason);
    setModelCriticStatus(snapshot.modelCriticStatus);
    setModelCriticScore(snapshot.modelCriticScore);
    setModelCriticLevel(snapshot.modelCriticLevel);
    setModelCriticIssuesCount(snapshot.modelCriticIssuesCount);
    setModelCriticRounds(snapshot.modelCriticRounds);
    setModelCriticFallbackReason(snapshot.modelCriticFallbackReason);
    setAutoRepairFallbackReason(snapshot.autoRepairFallbackReason);
    setAutoRepairRounds(snapshot.autoRepairRounds);
    setAutoRepairApplied(snapshot.autoRepairApplied);
    setFinalQualityScore(snapshot.finalQualityScore);
    setFinalVisualQaScore(snapshot.finalVisualQaScore);
    setCreatedAt(snapshot.createdAt);
    setUpdatedAt(snapshot.updatedAt);
    if (snapshot.slidesPreview?.length) {
      setSlidesPreview(snapshot.slidesPreview);
      setActiveSlideIndex((current) => Math.min(current, Math.max((snapshot.slidesPreview?.length || 1) - 1, 0)));
    } else if (snapshot.nativePreview?.available) {
      const nativeSlides = deriveSlidesFromPreviewManifest(snapshot.nativePreview, [], snapshot.templateId);
      setSlidesPreview(nativeSlides);
      setActiveSlideIndex((current) => Math.min(current, Math.max(nativeSlides.length - 1, 0)));
    }
  }, []);

  const applyPreviewManifest = useCallback(
    (
      preview: AcademicPptPreviewManifest,
      options?: { taskId?: string; snapshot?: Awaited<ReturnType<typeof getAcademicPptTask>> }
    ) => {
      const cachedTaskId = options?.taskId;
      if (cachedTaskId) {
        previewManifestCacheRef.current.set(cachedTaskId, preview);
        setSelectedTaskPreviewMap((current) => (current[cachedTaskId] === preview ? current : { ...current, [cachedTaskId]: preview }));
      }
      setNativePreview(preview);
      setPreviewType(preview.type);
      setPreviewFallbackReason(preview.fallbackReason);
      setSlidesPreview(() => {
        const derivedSlides = deriveSlidesFromPreviewManifest(
          preview,
          options?.snapshot?.slidesPreview?.length ? options.snapshot.slidesPreview : [],
          options?.snapshot?.templateId
        );
        setActiveSlideIndex((current) => Math.min(current, Math.max(derivedSlides.length - 1, 0)));
        return derivedSlides;
      });
    },
    []
  );

  const refreshSuccessfulTaskPreview = useCallback(
    async (
      finishedTaskId: string,
      options?: {
        signal?: AbortSignal;
        snapshot?: Awaited<ReturnType<typeof getAcademicPptTask>>;
        force?: boolean;
      }
    ) => {
      const cachedPreview = !options?.force ? previewManifestCacheRef.current.get(finishedTaskId) : undefined;
      if (cachedPreview) {
        applyPreviewManifest(cachedPreview, { taskId: finishedTaskId, snapshot: options?.snapshot });
        return cachedPreview;
      }

      const preview = await getAcademicPptTaskPreview(finishedTaskId, { signal: options?.signal });
      if (options?.signal?.aborted) return undefined;
      applyPreviewManifest(preview, { taskId: finishedTaskId, snapshot: options?.snapshot });
      return preview;
    },
    [applyPreviewManifest]
  );

  useEffect(() => {
    if (!activeTaskId) {
      stopActivePoller();
      return;
    }
    if (activeTaskId === selectedTaskId && !isPollableStatus(status)) {
      stopActivePoller(activeTaskId);
      setActiveTaskId(null);
      return;
    }

    stopActivePoller();
    const pollTaskId = activeTaskId;
    const controller = new AbortController();
    const poller = { taskId: pollTaskId, controller, stopped: false, timer: undefined as number | undefined };
    pollerRef.current = poller;

    async function refreshTask() {
      if (poller.stopped || document.visibilityState === "hidden") return;
      try {
        const snapshot = await getAcademicPptTask(pollTaskId, { signal: controller.signal });
        if (poller.stopped || pollerRef.current !== poller) return;
        if (selectedTaskId === pollTaskId) {
          applyTaskSnapshot(snapshot);
          const logSnapshot = await getAcademicPptTaskLogs(pollTaskId, { limit: 100, signal: controller.signal });
          if (!poller.stopped && pollerRef.current === poller && selectedTaskId === pollTaskId) {
            setLogs(logSnapshot.logs.slice(-ACADEMIC_PPT_LOG_KEEP_LIMIT));
          }
        }
        if (isTerminalStatus(snapshot.status)) {
          stopActivePoller(pollTaskId);
          setActiveTaskId(null);
          if (snapshot.status === "success") {
            if (selectedTaskId === pollTaskId) {
              await refreshSuccessfulTaskPreview(pollTaskId, { signal: controller.signal, snapshot }).catch((previewError) => {
                if (controller.signal.aborted) return;
                const message = previewError instanceof Error ? previewError.message : "Preview loading failed; structured preview is shown.";
                setPreviewType("outline");
                setPreviewFallbackReason(message);
              });
            }
          }
          void refreshRecentTasks();
        }
      } catch (pollError) {
        if (controller.signal.aborted || poller.stopped || pollerRef.current !== poller) return;
        if (isAcademicPptNotFoundError(pollError)) {
          markRecentTaskMissing(pollTaskId);
          stopActivePoller(pollTaskId);
          setActiveTaskId(null);
          if (selectedTaskId === pollTaskId) {
            setStatus("missing");
            setError("当前任务不存在或已被清理。");
            setLogs([]);
          }
          return;
        }
        const message = pollError instanceof Error ? pollError.message : "任务状态查询失败。";
        if (selectedTaskId === activeTaskId) {
          setError(message);
          toast({ type: "error", message });
        }
      }
    }

    void refreshTask();
    poller.timer = window.setInterval(() => {
      void refreshTask();
    }, 2000);

    return () => stopActivePoller(activeTaskId);
  }, [
    activeTaskId,
    applyTaskSnapshot,
    markRecentTaskMissing,
    refreshRecentTasks,
    refreshSuccessfulTaskPreview,
    selectedTaskId,
    stopActivePoller,
    status,
    toast
  ]);

  useEffect(() => {
    if (!taskId || status !== "success") return;
    const controller = new AbortController();
    void Promise.resolve(previewManifestCacheRef.current.get(taskId))
      .then((preview) => {
        if (preview) applyPreviewManifest(preview, { taskId });
      })
      .catch((previewError) => {
        if (controller.signal.aborted) return;
        const message = previewError instanceof Error ? previewError.message : "预览加载失败，已切换为结构化预览。";
        setPreviewType("outline");
        setPreviewFallbackReason(message);
      });
    return () => controller.abort();
  }, [applyPreviewManifest, taskId, status]);

  const handleFileChange = useCallback((file: AcademicPptSourceFile | null, selectedFile?: File) => {
    setSourceFile(file);
    setRawFile(selectedFile || null);
    if (file) {
      setError(undefined);
      setStatus((current) => (current === "failed" || current === "cancelled" ? "idle" : current));
      setCurrentStep("等待开始");
      setProgress(0);
      toast({ type: "success", message: "已选择来源文件。" });
    }
  }, [toast]);

  const startTask = useCallback(async () => {
    activeRequestRef.current?.abort();
    abortPreviewRequest();
    stopActivePoller();
    const requestController = new AbortController();
    activeRequestRef.current = requestController;
    resetTaskDetails();

    if (!rawFile) {
      setProgress(0);
      setCurrentStep("等待上传文件");
      setError("请先选择 PDF、PPTX 或 TeX 文件。");
      toast({ type: "error", message: "请先选择来源文件。" });
      return;
    }

    setStatus("queued");
    setProgress(5);
    setCurrentStep(academicPptPipelineLabels.parse_paper);

    try {
      const created = await createAcademicPptTask({ file: rawFile, settings }, { signal: requestController.signal });
      setTaskId(created.taskId);
      setSelectedTaskId(created.taskId);
      setActiveTaskId(created.taskId);
      setStatus(created.status);
      toast({ type: "success", message: "学术PPT任务已创建。" });
      void refreshRecentTasks();
      setLogs([
        {
          time: new Date().toISOString(),
          level: "info",
          message: "任务已创建，正在准备生成。"
        }
      ]);
    } catch (taskError) {
      if (requestController.signal.aborted) return;
      setStatus("failed");
      setProgress(0);
      setCurrentStep("任务创建失败");
      const message = taskError instanceof Error ? taskError.message : "学术PPT任务创建失败。";
      setError(message);
      toast({ type: "error", message });
    } finally {
      if (activeRequestRef.current === requestController) {
        activeRequestRef.current = null;
      }
    }
  }, [abortPreviewRequest, rawFile, refreshRecentTasks, resetTaskDetails, settings, stopActivePoller, toast]);

  const cancelTask = useCallback(async () => {
    const taskToCancel = activeTaskId || taskId;
    if (!taskToCancel) return;
    activeRequestRef.current?.abort();
    abortPreviewRequest();
    stopActivePoller(taskToCancel);
    const requestController = new AbortController();
    activeRequestRef.current = requestController;
    try {
      const cancelled = await cancelAcademicPptTask(taskToCancel, { signal: requestController.signal });
      setStatus(cancelled.task?.status || cancelled.status);
      if (activeTaskId === taskToCancel) setActiveTaskId(null);
      setProgress(cancelled.task?.progress ?? progress);
      setCurrentStep(cancelled.task?.currentStep || "已取消");
      setError(cancelled.task?.error || "用户请求取消任务。");
      setDownloadUrl(undefined);
      if (selectedTaskId === taskToCancel) {
        const logSnapshot = await getAcademicPptTaskLogs(taskToCancel, { limit: 100, signal: requestController.signal });
        setLogs(logSnapshot.logs.slice(-ACADEMIC_PPT_LOG_KEEP_LIMIT));
      }
      void refreshRecentTasks();
      toast({ type: "success", message: "已请求取消任务。" });
    } catch (cancelError) {
      if (requestController.signal.aborted) return;
      const message = cancelError instanceof Error ? cancelError.message : "任务取消失败。";
      setError(message);
      toast({ type: "error", message });
    } finally {
      if (activeRequestRef.current === requestController) {
        activeRequestRef.current = null;
      }
    }
  }, [abortPreviewRequest, activeTaskId, progress, refreshRecentTasks, selectedTaskId, stopActivePoller, taskId, toast]);

  const resumeTask = useCallback(async () => {
    if (!taskId) return;
    activeRequestRef.current?.abort();
    abortPreviewRequest();
    stopActivePoller();
    const requestController = new AbortController();
    activeRequestRef.current = requestController;
    setLogs([]);
    try {
      const resumed = await resumeAcademicPptTask(taskId, { signal: requestController.signal });
      if (resumed.task) applyTaskSnapshot(resumed.task);
      setStatus(resumed.status);
      setSelectedTaskId(taskId);
      setActiveTaskId(taskId);
      setResumable(false);
      setProgress((current) => Math.max(current, 5));
      toast({ type: "success", message: "已继续生成任务。" });
    } catch (resumeError) {
      if (requestController.signal.aborted) return;
      const message = resumeError instanceof Error ? resumeError.message : "任务无法继续生成。";
      setError(message);
      toast({ type: "error", message });
    } finally {
      if (activeRequestRef.current === requestController) {
        activeRequestRef.current = null;
      }
    }
  }, [abortPreviewRequest, applyTaskSnapshot, stopActivePoller, taskId, toast]);

  const downloadTask = useCallback(async () => {
    if (!downloadUrl || !taskId) return;
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "PPTX 下载失败。");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `academic-ppt-${taskId}.pptx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({ type: "success", message: "已开始下载 PPTX。" });
    } catch (downloadError) {
      const message = downloadError instanceof Error ? downloadError.message : "PPTX 下载失败。";
      setError(message);
      toast({ type: "error", message });
    }
  }, [downloadUrl, taskId, toast]);

  const handleNativePreviewError = useCallback(() => {
    setNativePreview((current) =>
      current
        ? {
            ...current,
            available: false,
            type: "outline",
            source: "structured_placeholder",
            previewCount: 0,
            fallbackReason: "Image preview failed; structured preview is shown."
          }
        : current
    );
    setPreviewType("outline");
    setPreviewFallbackReason("Image preview failed; structured preview is shown.");
  }, []);


  const loadRecentTask = useCallback(async (recentTaskId: string) => {
    activeRequestRef.current?.abort();
    abortPreviewRequest();
    if (activeTaskIdRef.current === recentTaskId) {
      stopActivePoller(recentTaskId);
      setActiveTaskId(null);
    }
    const requestController = new AbortController();
    activeRequestRef.current = requestController;
    previewRequestRef.current = requestController;
    try {
      const snapshot = await getAcademicPptTask(recentTaskId, { signal: requestController.signal });
      const logSnapshot = await getAcademicPptTaskLogs(recentTaskId, { limit: 100, signal: requestController.signal });
      setSelectedTaskId(recentTaskId);
      applyTaskSnapshot(snapshot);
      if (isPollableStatus(snapshot.status)) {
        setActiveTaskId(recentTaskId);
      } else {
        stopActivePoller(recentTaskId);
        if (activeTaskIdRef.current === recentTaskId) setActiveTaskId(null);
      }
      setSourceFile(null);
      setRawFile(null);
      setLogs(logSnapshot.logs.slice(-ACADEMIC_PPT_LOG_KEEP_LIMIT));
      if (snapshot.status === "success") {
        await refreshSuccessfulTaskPreview(recentTaskId, { signal: requestController.signal, snapshot });
      }
      toast({ type: "success", message: "已加载生成记录。" });
    } catch (loadError) {
      if (requestController.signal.aborted) return;
      if (isAcademicPptNotFoundError(loadError)) {
        markRecentTaskMissing(recentTaskId);
        if (selectedTaskId === recentTaskId) {
          setStatus("missing");
          setError("历史任务不存在或已被清理。");
          setLogs([]);
        }
        toast({ type: "error", message: "历史任务不存在或已被清理。" });
        return;
      }
      const message = loadError instanceof Error ? loadError.message : "生成记录加载失败。";
      setError(message);
      toast({ type: "error", message });
    } finally {
      if (activeRequestRef.current === requestController) {
        activeRequestRef.current = null;
      }
      if (previewRequestRef.current === requestController) {
        previewRequestRef.current = null;
      }
    }
  }, [abortPreviewRequest, applyTaskSnapshot, markRecentTaskMissing, refreshSuccessfulTaskPreview, selectedTaskId, stopActivePoller, toast]);

  return (
    <div className="flex h-[calc(100vh-5.5rem)] w-full max-w-none flex-col gap-2 overflow-hidden overflow-x-hidden">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-panel)] px-3 shadow-soft">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/smart-tools"
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-[var(--color-text-muted)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回
          </Link>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-100 to-white text-blue-700">
            <Presentation className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-[var(--color-text)]">学术PPT</h1>
            <p className="truncate text-xs text-[var(--color-text-muted)]">基于学术资料自动生成可编辑 PPTX。</p>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <Badge className={topStatus.className}>
            <TopStatusIcon className={`mr-1 h-3.5 w-3.5 ${topStatus.spinning ? "animate-spin" : ""}`} />
            {topStatus.label}
          </Badge>
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-hidden">
        <div className="grid h-full min-w-0 grid-cols-[210px_minmax(0,1fr)_minmax(280px,320px)] gap-2 overflow-hidden">
          <AcademicPptSourcePanel
            activeTaskId={selectedTaskId}
            file={sourceFile}
            pipeline={pipeline}
            recentTasks={visibleRecentTasks}
            onFileChange={handleFileChange}
            onRecentTaskDismiss={dismissRecentTask}
            onRecentTaskSelect={loadRecentTask}
          />
          <AcademicPptPreviewCanvas
            activeSlideIndex={activeSlideIndex}
            nativePreview={nativePreview}
            onNativePreviewError={handleNativePreviewError}
            slides={slidesPreview}
            onSelectSlideIndex={setActiveSlideIndex}
          />
          <AcademicPptSettingsPanel
            canStart={canStart}
            settings={settings}
            taskStatus={status}
            onSettingsChange={setSettings}
            onStart={startTask}
            onCancel={cancelTask}
          />
        </div>
      </section>

      <AcademicPptTaskMonitor
        currentStep={currentStep}
        downloadUrl={downloadUrl}
        error={error}
        fallbackReason={fallbackReason}
        generationMode={generationMode}
        visualPipelineStatus={visualPipelineStatus}
        logs={visibleLogs}
        modelName={modelName}
        modelSource={modelSource}
        onDownload={downloadTask}
        onResume={resumeTask}
        outputFileSize={outputFileSize}
        outlineTitle={outlineTitle}
        progress={progress}
        previewFallbackReason={previewFallbackReason}
        previewType={previewType}
        qualityIssuesCount={qualityIssuesCount}
        qualityLevel={qualityLevel}
        qualityScore={qualityScore}
        repairRounds={repairRounds}
        resumable={resumable}
        slideCount={slideCount}
        templateStyle={templateStyle}
        visualQaIssuesCount={visualQaIssuesCount}
        visualQaEnabled={visualQaEnabled}
        visualQaLevel={visualQaLevel}
            visualQaScore={visualQaScore}
            visualQaSummary={visualQaSummary}
            iconDecorationEnabled={iconDecorationEnabled}
            researchEnabled={researchEnabled}
            externalResearchEnabled={externalResearchEnabled}
            webSearchEnabled={webSearchEnabled}
            searchStatus={searchStatus}
            researchStatus={researchStatus}
        researchSourcesCount={researchSourcesCount}
        researchFallbackReason={researchFallbackReason}
        modelCriticStatus={modelCriticStatus}
        modelCriticScore={modelCriticScore}
        modelCriticLevel={modelCriticLevel}
        modelCriticIssuesCount={modelCriticIssuesCount}
        modelCriticRounds={modelCriticRounds}
        modelCriticFallbackReason={modelCriticFallbackReason}
        autoRepairFallbackReason={autoRepairFallbackReason}
        autoRepairRounds={autoRepairRounds}
        autoRepairApplied={autoRepairApplied}
            finalQualityScore={finalQualityScore}
            finalVisualQaScore={finalVisualQaScore}
            taskId={selectedTaskId || taskId}
            generatorSource={generatorSource}
            createdAt={createdAt}
            updatedAt={updatedAt}
            resumeFromStep={resumeFromStep}
            status={status}
          />
    </div>
  );
}
