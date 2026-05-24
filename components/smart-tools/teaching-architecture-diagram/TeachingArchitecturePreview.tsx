"use client";

import { AlertCircle, Download, FileText, ImageOff, Loader2, RotateCcw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getTeachingArchitectureDiagramLabel } from "@/components/smart-tools/teaching-architecture-diagram/teaching-architecture-options";
import type {
  TeachingArchitectureBlueprint,
  TeachingArchitectureDiagramType,
  TeachingArchitectureErrorCode,
  TeachingArchitectureTaskStage,
  TeachingArchitectureTaskStatus
} from "@/lib/smart-tools/teaching-architecture-diagram/types";

export function TeachingArchitecturePreview({
  blueprint,
  currentStep,
  diagramType,
  downloadUrl,
  errorCode,
  errorMessage,
  onDownload,
  onDownloadPng,
  onRetry,
  previewImageUrl,
  previewSvgUrl,
  progress,
  retryable,
  stage,
  status
}: {
  blueprint?: TeachingArchitectureBlueprint;
  currentStep: string;
  diagramType: TeachingArchitectureDiagramType;
  downloadUrl?: string;
  errorCode?: TeachingArchitectureErrorCode;
  errorMessage?: string;
  onDownload: () => void;
  onDownloadPng?: () => void;
  onRetry: () => void;
  previewImageUrl?: string;
  previewSvgUrl?: string;
  progress: number;
  retryable: boolean;
  stage?: TeachingArchitectureTaskStage;
  status: TeachingArchitectureTaskStatus | "idle";
}) {
  const isComplete = status === "completed";

  return (
    <div className="min-h-[620px] flex-1 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-panel)] shadow-soft">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--color-border)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text)]">生成预览</p>
            <p className="mt-1 truncate text-xs text-[var(--color-text-faint)]">{getTeachingArchitectureDiagramLabel(diagramType)} · 学术架构图工作台</p>
        </div>
        {isComplete ? (
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="secondary" disabled={!downloadUrl} onClick={onDownload}>
              <Download className="h-4 w-4" />
              下载 SVG
            </Button>
            {onDownloadPng ? (
              <Button type="button" size="sm" variant="ghost" onClick={onDownloadPng}>
                PNG
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="p-4">
        {status === "idle" ? <IdleState /> : null}
        {status === "pending" || status === "running" || status === "analyzing" || status === "generating" ? (
          <GeneratingState currentStep={currentStep} progress={progress} stage={stage} />
        ) : null}
        {status === "failed" ? <FailedState errorCode={errorCode} errorMessage={errorMessage} onRetry={onRetry} retryable={retryable} /> : null}
        {isComplete ? (
          <>
            <ArchitectureCanvas imageUrl={previewImageUrl} svgUrl={previewSvgUrl} />
            {blueprint ? <BlueprintSummary blueprint={blueprint} /> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function IdleState() {
  return (
    <div className="grid min-h-[540px] place-items-center rounded-lg border border-dashed border-[color:var(--color-border)] bg-[var(--color-soft)]">
      <div className="max-w-md px-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-[color:var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text-muted)]">
          <Sparkles className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-[var(--color-text)]">输入文字或上传材料后生成架构图</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          右侧会展示任务阶段、蓝图摘要、output.svg 预览和下载入口。
        </p>
      </div>
    </div>
  );
}

function GeneratingState({
  currentStep,
  progress,
  stage
}: {
  currentStep: string;
  progress: number;
  stage?: TeachingArchitectureTaskStage;
}) {
  return (
    <div className="grid min-h-[540px] place-items-center rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)]">
      <div className="w-full max-w-md px-6 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-blue-400/30 bg-blue-500/10 text-blue-300">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
        <h2 className="mt-5 text-lg font-semibold text-[var(--color-text)]">{getStageLabel(stage, currentStep)}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          {stage === "generating_image"
            ? "图片模型可能需要 1-3 分钟，请勿关闭页面。"
            : stage === "rendering_svg"
              ? "正在按固定模板渲染 SVG 架构图，通常很快完成。"
              : "任务通过轮询更新，创建接口不会长时间阻塞。"}
        </p>
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <span>{currentStep || "正在创建任务"}</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-panel)]">
            <div className="h-full rounded-full bg-[var(--color-primary)] transition-all" style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FailedState({
  errorCode,
  errorMessage,
  onRetry,
  retryable
}: {
  errorCode?: TeachingArchitectureErrorCode;
  errorMessage?: string;
  onRetry: () => void;
  retryable: boolean;
}) {
  return (
    <div className="grid min-h-[540px] place-items-center rounded-lg border border-red-400/20 bg-[var(--color-danger-bg)]">
      <div className="max-w-md px-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-red-400/30 bg-red-500/10 text-[var(--color-danger)]">
          <AlertCircle className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-[var(--color-text)]">任务生成失败</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          {getFailureMessage(errorCode, errorMessage)}
        </p>
        {retryable ? (
          <Button type="button" className="mt-5" variant="secondary" onClick={onRetry}>
            <RotateCcw className="h-4 w-4" />
            重试生成
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function BlueprintSummary({ blueprint }: { blueprint: TeachingArchitectureBlueprint }) {
  const warnings = blueprint.source.warnings || [];
  const pendingFiles = blueprint.source.files?.filter((file) => file.extractionStatus === "pending_parser") || [];

  return (
    <div className="mt-4 grid gap-3 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
        <FileText className="h-4 w-4" />
        蓝图摘要
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryItem label="核心主题" value={blueprint.coreTheme} />
        <SummaryItem label="推荐图型" value={getTeachingArchitectureDiagramLabel(blueprint.layoutIntent.recommendedType)} />
        <SummaryItem label="内容来源" value={blueprint.sourceType === "text" ? "文字描述" : "上传文件"} />
        <SummaryItem label="提取状态" value={getExtractionLabel(blueprint.sourceExtractionStatus)} />
      </div>
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-panel)] p-3">
        <p className="text-xs font-medium text-[var(--color-text-muted)]">识别出的重点节点</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {blueprint.layoutIntent.emphasisNodes.map((node) => (
            <span key={node} className="rounded-md border border-[color:var(--color-border)] bg-[var(--color-soft)] px-2 py-1 text-xs text-[var(--color-text)]">
              {node}
            </span>
          ))}
        </div>
      </div>
      {pendingFiles.length ? (
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200">
          当前文件类型解析器待接入，已保存文件，后续将启用真实解析：{pendingFiles.map((file) => file.fileName).join("、")}
        </div>
      ) : null}
      {warnings.length && !pendingFiles.length ? (
        <div className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-xs leading-5 text-[var(--color-text-muted)]">
          {warnings.join("；")}
        </div>
      ) : null}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-panel)] p-3">
      <p className="text-xs text-[var(--color-text-faint)]">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-[var(--color-text)]">{value}</p>
    </div>
  );
}

function getExtractionLabel(status: TeachingArchitectureBlueprint["sourceExtractionStatus"]) {
  if (status === "extracted") return "已真实解析";
  if (status === "partial") return "部分解析";
  if (status === "pending_parser") return "解析器待接入";
  return "解析失败";
}

function ArchitectureCanvas({ imageUrl, svgUrl }: { imageUrl?: string; svgUrl?: string }) {
  const previewUrl = svgUrl || imageUrl;
  if (!previewUrl) {
    return (
      <div className="grid min-h-[540px] place-items-center rounded-lg border border-red-400/20 bg-[var(--color-danger-bg)]">
        <div className="max-w-md px-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-red-400/30 bg-red-500/10 text-[var(--color-danger)]">
            <ImageOff className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-[var(--color-text)]">未找到 output.svg</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
            任务已完成，但没有可预览的 SVG 输出，请检查任务目录或重新生成。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.16)]">
      <img alt="教学架构图 output.svg 预览" className="mx-auto max-h-[720px] max-w-full bg-white object-contain" src={previewUrl} />
    </div>
  );
}

function getStageLabel(stage?: TeachingArchitectureTaskStage, fallback?: string) {
  if (stage === "pending") return "正在创建任务";
  if (stage === "extracting") return "正在分析教学材料";
  if (stage === "analyzing") return "正在生成架构图蓝图";
  if (stage === "building_prompt") return "正在构建架构图渲染约束";
  if (stage === "rendering_svg") return "正在渲染 SVG 架构图";
  if (stage === "generating_image") return "正在生成架构图图片";
  return fallback || "正在创建任务";
}

function getFailureMessage(errorCode?: TeachingArchitectureErrorCode, fallback?: string) {
  if (errorCode === "IMAGE_PROVIDER_NOT_CONFIGURED") return "图片生成服务未配置，请检查环境变量。";
  if (errorCode === "IMAGE_PROVIDER_TIMEOUT" || errorCode === "MODEL_PROVIDER_TIMEOUT") return "模型生成超时，请稍后重试或减少材料数量。";
  if (errorCode === "IMAGE_PROVIDER_BAD_RESPONSE") return "图片生成服务未返回有效图片，请稍后重试。";
  return fallback || "任务生成失败，请检查输入材料或稍后重试。";
}
