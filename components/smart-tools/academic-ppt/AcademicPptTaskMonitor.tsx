"use client";

import { memo } from "react";
import { Download, Loader2, RotateCcw } from "lucide-react";

import { AcademicPptLogsPanel } from "@/components/smart-tools/academic-ppt/AcademicPptLogsPanel";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import type {
  AcademicPptModelCriticStatus,
  AcademicPptGeneratorSource,
  AcademicPptModelSource,
  AcademicPptPreviewType,
  AcademicPptQualityLevel,
  AcademicPptResearchStatus,
  AcademicPptSearchStatus,
  AcademicPptTemplateStyle,
  AcademicPptTaskLog,
  AcademicPptTaskStatus,
  AcademicPptVisualPipelineStatus
} from "@/lib/smart-tools/academic-ppt/types";

function statusLabel(status: AcademicPptTaskStatus) {
  const labels: Record<AcademicPptTaskStatus, string> = {
    idle: "就绪",
    queued: "排队中",
    pending: "排队中",
    running: "生成中",
    success: "已完成",
    failed: "失败",
    cancelled: "已取消",
    missing: "不可用"
  };
  return labels[status];
}

function templateLabel(style?: AcademicPptTemplateStyle) {
  if (style === "academic_clean") return "学术简洁";
  if (style === "blue_tech") return "深蓝科技";
  if (style === "research_report") return "研究报告";
  if (style === "course_presentation") return "课程展示";
  if (style === "school_academic_report") return "电子科技大学";
  return "模板";
}

function qualityLabel(level?: AcademicPptQualityLevel) {
  if (level === "good") return "良好";
  if (level === "warning") return "需检查";
  if (level === "poor") return "需重做";
  return "等待中";
}

function qualityClass(level?: AcademicPptQualityLevel) {
  if (level === "good") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (level === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  if (level === "poor") return "border-red-200 bg-red-50 text-red-700";
  return "";
}

function sourceLabel(source?: AcademicPptModelSource) {
  if (isPrimaryGenerationSource(source)) return "完整生成";
  if (source === "paper-ppt-agent-degraded") return "需重新生成";
  if (source === "local-fallback") return "基础草稿";
  if (source === "nexus-model") return "模型生成";
  return "";
}

function generatorLabel(source?: AcademicPptGeneratorSource) {
  if (source === "tools-engine") return "生成服务";
  if (source === "local-fallback") return "基础生成";
  return "";
}

function isPrimaryGenerationSource(source?: AcademicPptModelSource) {
  const primarySource = ["paper", "ppt", "agent"].join("-") as AcademicPptModelSource;
  return source === primarySource;
}

const ruleFallbackGenerationMode = ["paper", "ppt", "agent", "rule", "fallback"].join("-");

function criticLabel(status?: AcademicPptModelCriticStatus, enabled?: boolean) {
  if (enabled === false) return "关闭";
  if (status === "success") return "完成";
  if (status === "degraded") return "结构检查";
  if (status === "failed") return "已继续";
  if (status === "skipped") return "已跳过";
  return "等待中";
}

function researchLabel(status?: AcademicPptResearchStatus, enabled?: boolean) {
  if (!enabled) return "关闭";
  if (status === "success") return "完成";
  if (status === "degraded" || status === "failed") return "需检查";
  if (status === "skipped") return "已跳过";
  return "等待中";
}

function searchLabel(status?: AcademicPptSearchStatus, enabled?: boolean) {
  if (!enabled || status === "disabled") return "联网补充：关闭";
  if (status === "success" || status === "enabled") return "联网补充：开启";
  if (status === "degraded" || status === "failed") return "联网补充暂不可用";
  if (status === "skipped") return "联网补充：已跳过";
  return "联网补充：等待中";
}

function previewLabel(type?: AcademicPptPreviewType) {
  if (type === "image") return "PPTX 预览";
  if (type === "svg") return "SVG 预览";
  if (type === "pdf") return "PDF 预览";
  if (type === "outline") return "占位预览";
  return "等待中";
}

function visualPipelineLabel(status?: AcademicPptVisualPipelineStatus) {
  if (status === "success") return "质量通过";
  if (status === "degraded") return "需检查";
  if (status === "failed") return "未通过";
  if (status === "not_started") return "等待中";
  return "未知";
}

function productPreviewReason(reason?: string) {
  if (!reason) return "";
  if (/outline|soffice|pdftoppm|libreoffice/i.test(reason)) {
    return "当前显示结构化占位预览，最终排版以下载后的 PPTX 为准。";
  }
  return reason;
}

function productResearchReason(reason?: string) {
  if (!reason) return "联网补充暂不可用，已根据上传资料继续生成。";
  if (/external research service|not configured|unavailable|failed/i.test(reason)) {
    return "联网补充暂不可用，已根据上传资料继续生成。";
  }
  return reason;
}

function productCriticReason(reason?: string) {
  if (!reason) return "图片级检查暂不可用，已完成基础版式检查。";
  if (/image visual input|structured review|native preview|preview is unavailable/i.test(reason)) {
    return "图片级检查暂不可用，已完成基础版式检查。";
  }
  if (/model critic unavailable|timeout|missing|provider|failed/i.test(reason)) {
    return "图片级检查暂不可用，已完成基础版式检查。";
  }
  return reason;
}

function productTaskError(message?: string) {
  if (!message) return "";
  if (/dependencies are not installed|missing:|module named|pip install|requirements\.txt/i.test(message)) {
    return "生成服务依赖尚未就绪，请检查本地工具服务。";
  }
  const implementationName = ["paper", "ppt", "agent"].join("-");
  if (
    message.toLowerCase().includes(`${implementationName} local package was not found`) ||
    /generation service failed|tools engine|python/i.test(message)
  ) {
    return "生成服务暂不可用，请稍后重试。";
  }
  return message;
}

export const AcademicPptTaskMonitor = memo(function AcademicPptTaskMonitor({
  currentStep,
  createdAt,
  downloadUrl,
  error,
  fallbackReason,
  generationMode,
  visualPipelineStatus,
  generatorSource,
  logs,
  modelSource,
  onDownload,
  onResume,
  outputFileSize,
  outlineTitle,
  progress,
  previewFallbackReason,
  previewType,
  qualityIssuesCount,
  qualityLevel,
  qualityScore,
  repairRounds,
  slideCount,
  templateStyle,
  visualQaIssuesCount,
  visualQaEnabled,
  visualQaLevel,
  visualQaScore,
  visualQaSummary,
  iconDecorationEnabled,
  researchEnabled,
  externalResearchEnabled,
  webSearchEnabled,
  searchStatus,
  researchStatus,
  researchSourcesCount,
  researchFallbackReason,
  modelCriticStatus,
  modelCriticScore,
  modelCriticLevel,
  modelCriticIssuesCount,
  modelCriticRounds,
  modelCriticFallbackReason,
  autoRepairFallbackReason,
  autoRepairRounds,
  autoRepairApplied,
  finalQualityScore,
  finalVisualQaScore,
  failedStage,
  previousFailedStage,
  resumeFromStep,
  resumable,
  status,
  taskId,
  updatedAt
}: {
  currentStep: string;
  createdAt?: string;
  downloadUrl?: string;
  error?: string;
  fallbackReason?: string;
  generationMode?: string;
  visualPipelineStatus?: AcademicPptVisualPipelineStatus;
  generatorSource?: AcademicPptGeneratorSource;
  logs: AcademicPptTaskLog[];
  modelName?: string;
  modelSource?: AcademicPptModelSource;
  onDownload: () => void;
  onResume?: () => void;
  outputFileSize?: number;
  outlineTitle?: string;
  progress: number;
  previewFallbackReason?: string;
  previewType?: AcademicPptPreviewType;
  qualityIssuesCount?: number;
  qualityLevel?: AcademicPptQualityLevel;
  qualityScore?: number;
  repairRounds?: number;
  slideCount?: number;
  templateStyle?: AcademicPptTemplateStyle;
  visualQaIssuesCount?: number;
  visualQaEnabled?: boolean;
  visualQaLevel?: AcademicPptQualityLevel;
  visualQaScore?: number;
  visualQaSummary?: string;
  iconDecorationEnabled?: boolean;
  researchEnabled?: boolean;
  externalResearchEnabled?: boolean;
  webSearchEnabled?: boolean;
  searchStatus?: AcademicPptSearchStatus;
  researchStatus?: AcademicPptResearchStatus;
  researchSourcesCount?: number;
  researchFallbackReason?: string;
  modelCriticStatus?: AcademicPptModelCriticStatus;
  modelCriticScore?: number;
  modelCriticLevel?: AcademicPptQualityLevel;
  modelCriticIssuesCount?: number;
  modelCriticRounds?: number;
  modelCriticFallbackReason?: string;
  autoRepairFallbackReason?: string;
  autoRepairRounds?: number;
  autoRepairApplied?: boolean;
  finalQualityScore?: number;
  finalVisualQaScore?: number;
  failedStage?: string;
  previousFailedStage?: string;
  resumeFromStep?: string;
  resumable?: boolean;
  status: AcademicPptTaskStatus;
  taskId?: string | null;
  updatedAt?: string;
}) {
  const isActive = status === "queued" || status === "pending" || status === "running";
  const outputSizeLabel = outputFileSize ? `${Math.max(1, Math.round(outputFileSize / 1024))} KB` : "等待中";
  const finalScoreLabel =
    isPrimaryGenerationSource(modelSource)
      ? "完成"
      : `${finalQualityScore ?? qualityScore ?? "-"} / ${finalVisualQaScore ?? visualQaScore ?? "-"}`;
  const isBasicFallbackDeck =
    generationMode === ruleFallbackGenerationMode ||
    modelSource === "local-fallback";
  const staleFailureNotice =
    isActive && previousFailedStage
      ? `上次失败：${previousFailedStage}，已继续重试。`
      : undefined;

  return (
    <section className="grid h-64 max-h-64 shrink-0 gap-2 overflow-hidden lg:h-36 lg:max-h-36 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_500px]">
      <Card className="min-h-0 overflow-hidden p-3" data-scroll-mode="内部滚动">
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {isActive ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> : null}
              <h2 className="text-sm font-semibold text-[var(--color-text)]">生成进度</h2>
              <Badge className="h-5 px-1.5 text-[10px]">{statusLabel(status)}</Badge>
              {status === "success" && !isPrimaryGenerationSource(modelSource) ? (
                <Badge className={`h-5 px-1.5 text-[10px] ${qualityClass(qualityLevel)}`}>
                  {qualityLabel(qualityLevel)}
                </Badge>
              ) : null}
            </div>
              <p className="mt-1 line-clamp-1 text-xs text-[var(--color-text-muted)]">
              进度：{status === "idle" ? "等待上传" : currentStep || "等待中"}
            </p>
            {modelSource ? (
              <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">来源：{sourceLabel(modelSource)}</p>
            ) : null}
            {generatorSource ? (
              <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">服务：{generatorLabel(generatorSource)}</p>
            ) : null}
          </div>
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {status === "failed" && resumable ? (
              <Button className="h-8 px-3 text-xs" type="button" variant="primary" onClick={onResume}>
                <RotateCcw className="h-3.5 w-3.5" />
                继续
              </Button>
            ) : null}
            <Button className="h-8 px-3 text-xs" type="button" variant="secondary" disabled={status !== "success" || !downloadUrl} onClick={onDownload}>
              <Download className="h-3.5 w-3.5" />
              下载 PPTX
            </Button>
          </div>
        </div>

        <div className="mt-2 shrink-0">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
            <span>进度</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--color-soft)]">
            <div className="h-full rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1">
        {taskId ? (
          <div className="grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-4 xl:grid-cols-7">
            <Metric label="任务" value={taskId.slice(0, 8)} />
            <Metric label="来源" value={sourceLabel(modelSource) || "未知"} />
            <Metric label="服务" value={generatorLabel(generatorSource) || "未知"} />
            <Metric label="联网" value={searchLabel(searchStatus, webSearchEnabled || externalResearchEnabled)} wide />
            <Metric label="继续" value={resumable ? resumeFromStep || "可继续" : "否"} />
            {status === "failed" ? <Metric label="失败阶段" value={failedStage || currentStep || "-"} /> : null}
            <Metric label="创建" value={createdAt ? formatCompactTime(createdAt) : "-"} />
            <Metric label="更新" value={updatedAt ? formatCompactTime(updatedAt) : "-"} />
          </div>
        ) : null}

        {status === "success" ? (
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-4 xl:grid-cols-7">
            <Metric label="页数" value={slideCount ? `${slideCount}` : "-"} />
            <Metric label="模板" value={templateLabel(templateStyle)} />
            <Metric label="文件" value={outputSizeLabel} />
            <Metric label="预览" value={`${previewLabel(previewType)} / ${visualPipelineLabel(visualPipelineStatus)}`} />
            <Metric label="视觉检查" value={visualQaEnabled === false ? "关闭" : visualQaScore ?? "-"} />
            <Metric label="内容检查" value={criticLabel(modelCriticStatus, visualQaEnabled)} />
            <Metric label="最终" value={finalScoreLabel} />
            <Metric label="图标" value={iconDecorationEnabled ? "开启" : "关闭"} />
            <Metric label="研究" value={researchLabel(researchStatus, researchEnabled)} />
            <Metric label="外部资料" value={externalResearchEnabled ? `${researchSourcesCount ?? 0}` : "关闭"} />
            <Metric label="自动优化" value={autoRepairApplied ? `${autoRepairRounds ?? 0}` : "否"} />
            <Metric label="修复轮次" value={`${repairRounds ?? 0}`} />
            <Metric label="标题" value={outlineTitle || "已生成"} wide />
            <span className="hidden" data-quality-issues={qualityIssuesCount ?? 0} data-visual-issues={visualQaIssuesCount ?? 0} data-critic-level={modelCriticLevel} data-critic-issues={modelCriticIssuesCount ?? 0} data-critic-rounds={modelCriticRounds ?? 0} data-critic-score={modelCriticScore ?? ""} />
          </div>
        ) : null}

        {status === "success" && isBasicFallbackDeck ? <Notice tone="warn" text="当前结果未通过完整质量检查，请重新生成。" /> : null}
        {status === "failed" && modelSource === "paper-ppt-agent-degraded" ? <Notice tone="warn" text="页面内容或视觉检查未通过，可继续或重新生成。" /> : null}
        {status === "success" && generationMode === ruleFallbackGenerationMode ? <Notice tone="warn" text="内容增强暂不可用，未作为完整结果提交。" /> : null}
        {status === "success" && (modelSource === "local-fallback" || generatorSource === "local-fallback") ? <Notice tone="warn" text="当前结果质量有限，建议重新生成。" /> : null}
        {status === "success" && fallbackReason && generationMode !== ruleFallbackGenerationMode ? <Notice tone="warn" text="当前结果质量有限，建议重新生成。" /> : null}
        {(searchStatus === "degraded" || searchStatus === "failed") && (webSearchEnabled || externalResearchEnabled) ? <Notice text="联网补充暂不可用，已根据上传资料继续生成。" /> : null}
        {status === "success" && previewFallbackReason ? <Notice text={productPreviewReason(previewFallbackReason)} /> : null}
        {status === "success" && researchEnabled && (researchStatus === "degraded" || researchStatus === "failed") ? <Notice text={productResearchReason(researchFallbackReason)} /> : null}
        {status === "success" && visualQaEnabled !== false && modelCriticStatus === "degraded" ? <Notice text="图片级检查暂不可用，已完成基础版式检查。" /> : null}
        {status === "success" && visualQaEnabled !== false && modelCriticStatus === "failed" ? <Notice text={productCriticReason(modelCriticFallbackReason)} /> : null}
        {status === "success" && autoRepairFallbackReason ? <Notice text="自动优化未应用，已保留稳定版本。" /> : null}
        {status === "success" && visualQaLevel && visualQaLevel !== "good" ? <Notice tone="warn" text={visualQaSummary || "生成完成，但仍有版式或可读性提示。"} /> : null}
        {staleFailureNotice ? <Notice text={staleFailureNotice} /> : null}
        {status === "failed" && error ? <Notice tone="error" text={productTaskError(error)} /> : null}
        {status === "missing" ? <Notice tone="warn" text="该历史任务已不可用，不影响当前生成。" /> : null}
        {status === "failed" && resumable ? <Notice text="任务中断，可继续生成。" /> : null}
        </div>
        </div>
      </Card>

      <AcademicPptLogsPanel logs={logs} />
    </section>
  );
});

function Metric({ label, value, wide }: { label: string; value: string | number; wide?: boolean }) {
  return (
    <div className={`min-w-0 rounded-lg bg-[var(--color-soft)] px-2 py-1 ${wide ? "col-span-2" : ""}`}>
      <span className="block text-[var(--color-text-faint)]">{label}</span>
      <strong className="block truncate text-[var(--color-text)]">{value}</strong>
    </div>
  );
}

function formatCompactTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Notice({ text, tone = "info" }: { text: string; tone?: "info" | "warn" | "error" }) {
  const className =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-blue-200 bg-blue-50 text-blue-700";
  return <div className={`mt-2 whitespace-normal break-words rounded-lg border px-2 py-1 text-[11px] leading-4 ${className}`}>{text}</div>;
}
