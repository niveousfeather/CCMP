"use client";

import { CheckCircle2, ChevronRight, Download, FileText, PauseCircle, RotateCcw, X } from "lucide-react";

import type { DeepWritingPanelState } from "@/components/chat/chat-data";
import { cn } from "@/lib/utils";

export function DeepWritingPanel({
  open,
  state,
  onClose,
  onResume
}: {
  open: boolean;
  state?: DeepWritingPanelState | null;
  onClose: () => void;
  onResume?: () => void;
}) {
  const panel = state || null;
  const outline = panel?.outline || [];
  const sources = panel?.sources || [];
  const currentSection = panel?.currentSection || null;
  const progress = panel?.progress ?? 0;
  const stageLabel = getStageLabel(panel?.currentStage);

  return (
    <aside
      className={cn(
        "absolute inset-y-0 right-0 z-40 flex w-[min(460px,calc(100vw-24px))] flex-col border-l border-[color:var(--color-border)] bg-[var(--color-panel)] shadow-[-18px_0_44px_rgba(15,23,42,0.10)] transition-transform duration-300",
        open ? "translate-x-0" : "translate-x-full"
      )}
      aria-hidden={!open}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[color:var(--color-border)] px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-[var(--color-text)]">深度写作过程</p>
            <span className="shrink-0 rounded-full bg-[var(--color-soft)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)]">
              {stageLabel}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">{panel?.title || "等待写作任务开始"}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--color-text-muted)] transition hover:bg-[var(--color-soft)] hover:text-[var(--color-text)]"
          aria-label="关闭深度写作过程"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <section className="rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] px-4 py-3">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <span>{stageLabel}</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-border)_65%,transparent)]">
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </div>
        </section>

        <section className="mt-5">
          <PanelHeading title="文档大纲" meta={`${outline.filter((item) => item.status === "completed").length}/${outline.length || 0}`} />
          <div className="mt-3 grid gap-2">
            {outline.length ? (
              outline.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-xl border px-3 py-2 transition",
                    item.status === "writing"
                      ? "border-[color:var(--color-border-strong)] bg-[var(--color-panel)]"
                      : "border-[color:var(--color-border)] bg-[var(--color-soft)]"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <SectionStatusIcon status={item.status} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text)]">{item.title}</span>
                  </div>
                  {item.preview ? <p className="mt-1 line-clamp-2 pl-6 text-xs leading-5 text-[var(--color-text-muted)]">{item.preview}</p> : null}
                </div>
              ))
            ) : (
              <EmptyLine text="等待大纲生成" />
            )}
          </div>
        </section>

        <section className="mt-5">
          <PanelHeading title="当前正文" meta={currentSection?.title || "草稿预览"} />
          <div className="mt-3 rounded-xl border border-[color:var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            {currentSection?.draft ? (
              <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--color-text)]">{currentSection.draft}</p>
            ) : (
              <EmptyLine text="等待正文生成" />
            )}
          </div>
        </section>

        <section className="mt-5">
          <PanelHeading title="资料来源" meta={`${sources.length} 条`} />
          <div className="mt-3 grid gap-2">
            {sources.length ? (
              sources.map((source, index) => (
                <div key={`${source.title}-${index}`} className="rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text)] transition hover:text-[var(--color-primary)]"
                      >
                        {source.title}
                      </a>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text)]">{source.title}</span>
                    )}
                    {source.adopted ? <span className="shrink-0 rounded-full bg-[var(--color-panel)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)]">已采用</span> : null}
                  </div>
                  {source.summary ? <p className="mt-1 line-clamp-3 text-xs leading-5 text-[var(--color-text-muted)]">{source.summary}</p> : null}
                </div>
              ))
            ) : (
              <EmptyLine text="暂未接入外部检索，当前仅展示对话和附件资料摘要" />
            )}
          </div>
        </section>
      </div>

      <div className="shrink-0 border-t border-[color:var(--color-border)] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-xs leading-5 text-[var(--color-text-muted)]">
            {panel?.canResume ? "可继续当前写作任务" : "写作任务已完成"}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {panel?.canResume && onResume ? (
              <button
                type="button"
                onClick={onResume}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[color:var(--color-border)] px-3 text-xs font-medium text-[var(--color-text)] transition hover:bg-[var(--color-soft)]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                继续
              </button>
            ) : null}
            {panel?.downloadUrl ? (
              <a
                href={panel.downloadUrl}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--color-text)] px-3 text-xs font-medium text-[var(--color-panel)] transition hover:-translate-y-0.5"
              >
                <Download className="h-3.5 w-3.5" />
                下载
              </a>
            ) : (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[color:var(--color-border)] px-3 text-xs text-[var(--color-text-muted)]">
                <ChevronRight className="h-3.5 w-3.5" />
                等待文件
              </span>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function PanelHeading({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
      <span className="truncate text-xs text-[var(--color-text-muted)]">{meta}</span>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="text-sm leading-6 text-[var(--color-text-muted)]">{text}</p>;
}

function SectionStatusIcon({ status }: { status: DeepWritingPanelState["outline"][number]["status"] }) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
  if (status === "writing") return <PauseCircle className="h-4 w-4 shrink-0 text-blue-500" />;
  return <span className="h-4 w-4 shrink-0 rounded-full border border-[color:var(--color-border-strong)]" />;
}

function getStageLabel(stage?: string) {
  const labels: Record<string, string> = {
    planning: "规划中",
    collecting_sources: "整理资料",
    building_outline: "生成大纲",
    writing_sections: "撰写章节",
    polishing: "润色中",
    rendering_docx: "生成文档",
    completed: "已完成",
    interrupted: "已中断",
    failed: "失败"
  };
  return labels[stage || ""] || "准备中";
}
