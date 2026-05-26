"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Loader2, X } from "lucide-react";

import type { DeepWritingPanelState } from "@/components/chat/chat-data";
import type { NormalizedDocumentBlock } from "@/lib/word-engine/normalize-document-structure";
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
  const completedSections = panel?.completedSections || [];
  const currentSection = panel?.currentSection || null;
  const progress = panel?.progress ?? 0;
  const stage = panel?.currentStage || "planning";
  const stageLabel = getStageLabel(stage);
  const badge = getStageBadge(stage);
  const fullDocument = buildDocumentPreview(completedSections, currentSection);
  const directBody = panel?.directDocumentBody || fullDocument.map((section) => `${section.title}\n${section.draft}`.trim()).join("\n\n");
  const normalizedBlocks = useMemo(() => panel?.normalizedBlocks || fallbackBlocks(fullDocument), [panel?.normalizedBlocks, fullDocument]);
  const [panelWidth, setPanelWidth] = useState(560);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const canDownload = stage === "completed" && Boolean(panel?.downloadUrl);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem("deepWritingPanelWidth") || "");
    if (Number.isFinite(saved)) setPanelWidth(clampPanelWidth(saved));
  }, []);

  useEffect(() => {
    function handleMove(event: MouseEvent) {
      if (!dragState.current) return;
      const delta = dragState.current.startX - event.clientX;
      const nextWidth = clampPanelWidth(dragState.current.startWidth + delta);
      setPanelWidth(nextWidth);
      window.localStorage.setItem("deepWritingPanelWidth", String(nextWidth));
    }
    function handleUp() {
      dragState.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);

  return (
    <aside
      className={cn(
        "absolute inset-y-0 right-0 z-40 flex w-[calc(100vw-24px)] max-w-full flex-col border-l border-[color:var(--color-border)] bg-[var(--color-panel)] shadow-[-18px_0_44px_rgba(15,23,42,0.10)] transition-transform duration-300 md:max-w-[70vw]",
        open ? "translate-x-0" : "translate-x-full"
      )}
      style={{ width: `min(${panelWidth}px, calc(100vw - 24px), 70vw)` }}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="拖拽调整文档预览宽度"
        className="absolute inset-y-0 left-0 hidden w-2 -translate-x-1 cursor-col-resize border-l border-transparent transition hover:border-[var(--color-primary)] md:block"
        onMouseDown={(event) => {
          dragState.current = { startX: event.clientX, startWidth: panelWidth };
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
      />

      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[color:var(--color-border)] px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-[var(--color-text)]">{panel?.title || "文档生成"}</p>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", badge.className)}>{badge.label}</span>
          </div>
          <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">文档生成 / {stageLabel}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--color-text-muted)] transition hover:bg-[var(--color-soft)] hover:text-[var(--color-text)]"
          aria-label="关闭文档生成页面"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <section className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-4 py-3">
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
          <PanelHeading title={stage === "completed" ? "文档正文" : "正文预览"} meta={currentSection?.title || (directBody ? "实时生成" : "准备生成")} />
          <div className="mt-3 min-h-[52vh] rounded-lg border border-[color:var(--color-border)] bg-[var(--color-panel)] px-4 py-4">
            {normalizedBlocks.length ? (
              <DocumentBlocks blocks={normalizedBlocks} />
            ) : directBody ? (
              <div className="whitespace-pre-wrap break-words text-sm leading-7 text-[var(--color-text)]">{directBody}</div>
            ) : (
              <EmptyLine text="正文开始生成后会在这里实时显示。" />
            )}
          </div>
        </section>
      </div>

      <div className="shrink-0 border-t border-[color:var(--color-border)] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-xs leading-5 text-[var(--color-text-muted)]">
            {stage === "completed" ? "文档已完成，可下载 Word。" : stage === "interrupted" ? "生成已暂停，可继续生成。" : "文档正在生成，完成后会整理为 Word。"}
          </div>
          {canDownload ? (
            <a
              href={panel?.downloadUrl}
              download
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-text)] px-3 text-xs font-medium text-[var(--color-panel)] transition hover:-translate-y-0.5"
            >
              <Download className="h-3.5 w-3.5" />
              下载 Word
            </a>
          ) : stage === "interrupted" && panel?.canResume ? (
            <button
              type="button"
              onClick={onResume}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-text)] px-3 text-xs font-medium text-[var(--color-panel)] transition hover:-translate-y-0.5"
            >
              <FileText className="h-3.5 w-3.5" />
              继续生成
            </button>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--color-border)] px-3 text-xs text-[var(--color-text-muted)]"
            >
              {stage === "interrupted" || stage === "failed" ? <FileText className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {stage === "interrupted" ? "可继续生成" : stage === "failed" ? "生成未完成" : "整理 Word"}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}

function DocumentBlocks({ blocks }: { blocks: NormalizedDocumentBlock[] }) {
  return (
    <div className="space-y-3 break-words text-[var(--color-text)]">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const className =
            block.level === 1
              ? "mt-5 text-lg font-bold leading-8"
              : block.level === 2
                ? "mt-4 text-base font-semibold leading-7"
                : block.level === 3
                  ? "mt-3 text-sm font-semibold leading-7"
                  : "mt-2 text-sm font-semibold leading-6";
          return (
            <h3 key={`${block.type}-${index}`} className={className}>
              {block.text}
            </h3>
          );
        }
        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag key={`${block.type}-${index}`} className={cn("space-y-1 pl-5 text-sm leading-7", block.ordered ? "list-decimal" : "list-disc")}>
              {block.items.map((item, itemIndex) => (
                <li key={`${index}-${itemIndex}`} className="whitespace-pre-wrap break-words">
                  {item}
                </li>
              ))}
            </ListTag>
          );
        }
        if (block.type === "table") {
          return (
            <div key={`${block.type}-${index}`} className="overflow-x-auto rounded-md border border-[color:var(--color-border)]">
              <table className="w-full min-w-[520px] table-fixed border-collapse text-left text-xs leading-5">
                <thead className="bg-[var(--color-soft)] text-[var(--color-text)]">
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th key={`${index}-h-${headerIndex}`} className="break-words border-b border-[color:var(--color-border)] px-2 py-2 font-semibold">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`${index}-r-${rowIndex}`}>
                      {block.headers.map((_, cellIndex) => (
                        <td key={`${index}-r-${rowIndex}-${cellIndex}`} className="break-words border-b border-[color:var(--color-border)] px-2 py-2 align-top text-[var(--color-text)]">
                          {row[cellIndex] || ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p key={`${block.type}-${index}`} className="whitespace-pre-wrap break-words text-sm leading-7 text-[var(--color-text)]">
            {block.text}
          </p>
        );
      })}
    </div>
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

function getStageLabel(stage?: string) {
  const labels: Record<string, string> = {
    planning: "开始生成文档",
    collecting_sources: "整理资料",
    building_outline: "准备正文结构",
    writing_sections: "生成正文预览",
    polishing: "整理正文",
    rendering_docx: "正在整理 Word",
    completed: "已完成",
    interrupted: "已暂停，可继续",
    failed: "生成未完成"
  };
  return labels[stage || ""] || "准备生成";
}

function getStageBadge(stage?: string) {
  if (stage === "completed") return { label: "已完成", className: "bg-emerald-50 text-emerald-600" };
  if (stage === "rendering_docx" || stage === "polishing") return { label: "整理中", className: "bg-amber-50 text-amber-600" };
  if (stage === "interrupted") return { label: "可继续", className: "bg-amber-50 text-amber-600" };
  if (stage === "failed") return { label: "未完成", className: "bg-red-50 text-red-600" };
  return { label: "生成中", className: "bg-blue-50 text-blue-600" };
}

function buildDocumentPreview(
  completedSections: NonNullable<DeepWritingPanelState["completedSections"]>,
  currentSection?: DeepWritingPanelState["currentSection"] | null
) {
  const sections = [...completedSections];
  if (currentSection?.draft) {
    const existing = sections.findIndex((section) => section.id === currentSection.id);
    const live = { id: currentSection.id, title: currentSection.title, draft: currentSection.draft };
    if (existing >= 0) sections[existing] = live;
    else sections.push(live);
  }
  return sections.filter((section) => section.title && section.draft);
}

function fallbackBlocks(sections: ReturnType<typeof buildDocumentPreview>): NormalizedDocumentBlock[] {
  return sections.flatMap((section, index) => [
    { type: "heading" as const, level: 1 as const, text: `${index + 1}. ${section.title}` },
    ...section.draft
      .split(/\n{2,}|\r?\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((text) => ({ type: "paragraph" as const, text }))
  ]);
}

function clampPanelWidth(value: number) {
  return Math.max(360, Math.min(960, Math.round(value)));
}
