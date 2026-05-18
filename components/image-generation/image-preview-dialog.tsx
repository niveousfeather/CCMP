"use client";

import { ChevronLeft, ChevronRight, Copy, Download, Heart, X } from "lucide-react";

import { ImageResult } from "@/components/image-generation/image-data";
import { ImageVisualFrame } from "@/components/image-generation/image-result-grid";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getImageModelLabel } from "@/lib/image/config";

export function ImagePreviewDialog({
  result,
  indexLabel,
  onPrevious,
  onNext,
  onClose,
  onReuse,
  onToggleLike,
  onDownload
}: {
  result: ImageResult | null;
  indexLabel?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  onClose: () => void;
  onReuse: (result: ImageResult) => void;
  onToggleLike: (id: string) => void;
  onDownload: (result: ImageResult) => void;
}) {
  const displayPrompt = result?.finalPrompt || result?.revisedPrompt || result?.prompt || "";

  return (
    <Dialog
      open={Boolean(result)}
      title="图片预览"
      onClose={onClose}
      showHeader={false}
      className="!h-[100svh] !max-h-[100svh] !w-screen !max-w-none !overflow-hidden !rounded-none !p-0 sm:!h-[92vh] sm:!max-h-[92vh] sm:!w-[94vw] sm:!rounded-2xl 2xl:!w-[90vw]"
    >
      {result ? (
        <div className="grid h-full min-h-0 overflow-hidden lg:grid-cols-[minmax(0,1.8fr)_minmax(360px,0.95fr)] xl:grid-cols-[minmax(0,1.95fr)_minmax(380px,0.95fr)]">
          <section className="relative flex min-h-0 items-center justify-center overflow-auto bg-black p-0 sm:overflow-hidden sm:bg-[var(--color-bg)] sm:p-3 md:p-6">
            <Button type="button" variant="secondary" size="icon" onClick={onClose} aria-label="关闭预览" className="absolute right-3 top-3 z-20 lg:hidden">
              <X className="h-4 w-4" />
            </Button>
            <Button type="button" variant="secondary" size="icon" onClick={() => onDownload(result)} aria-label="下载图片" className="absolute bottom-4 right-3 z-20 lg:hidden">
              <Download className="h-4 w-4" />
            </Button>
            <div className="relative flex min-h-full min-w-full items-center justify-center rounded-none border-0 bg-transparent p-0 sm:h-full sm:w-full sm:min-w-0 sm:rounded-xl sm:border sm:border-[color:var(--color-border)] sm:bg-[var(--color-soft)] sm:p-3 md:p-6">
              <div className="relative flex min-h-full min-w-full items-center justify-center overflow-visible rounded-none border-0 bg-black shadow-none sm:h-full sm:w-full sm:min-w-0 sm:overflow-hidden sm:rounded-lg sm:border sm:border-[color:var(--color-border-strong)] sm:bg-[var(--color-panel)] sm:shadow-soft">
                <div className={cn("relative h-[100svh] w-[100vw] sm:h-full sm:w-full", getPreviewAspectClass(result.ratio))}>
                  <ImageVisualFrame result={result} fit="contain" />
                </div>
                {onPrevious ? (
                  <Button type="button" variant="secondary" size="icon" className="absolute left-4 top-1/2 -translate-y-1/2" onClick={onPrevious} aria-label="上一张">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                ) : null}
                {onNext ? (
                  <Button type="button" variant="secondary" size="icon" className="absolute right-4 top-1/2 -translate-y-1/2" onClick={onNext} aria-label="下一张">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : null}
                {indexLabel ? <Badge className="absolute bottom-4 left-4">{indexLabel}</Badge> : null}
              </div>
            </div>
          </section>

          <aside className="hidden min-h-0 flex-col border-t border-[color:var(--color-border)] bg-[var(--color-panel)] lg:flex lg:border-l lg:border-t-0">
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border)] p-5 lg:p-6">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge>{result.mode === "image-to-image" ? "图生图" : "文生图"}</Badge>
                  <Badge>{result.style}</Badge>
                  <Badge>{result.ratio}</Badge>
                  <Badge>{result.resolution || "1K"}</Badge>
                  {indexLabel ? <Badge>{indexLabel}</Badge> : null}
                </div>
                <h2 className="text-2xl font-semibold leading-tight text-[var(--color-text)]">{result.title}</h2>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="关闭预览">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 lg:p-6">
              <div className="grid gap-4">
                <Card className="p-4 shadow-none">
                  <h3 className="text-sm font-medium text-[var(--color-text)]">最终 Prompt</h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-text-muted)]">{displayPrompt}</p>
                </Card>

                <Card className="grid gap-3 p-4 text-sm shadow-none">
                  <Meta label="模型" value={getImageModelLabel(result.model)} />
                  <Meta label="比例" value={result.ratio} />
                  <Meta label="分辨率" value={result.resolution || "1K"} />
                  <Meta label="状态" value={result.status || "已完成"} />
                  <Meta label="生成时间" value={result.createdAt} />
                </Card>
              </div>
            </div>

            <div className="border-t border-[color:var(--color-border)] p-5 lg:p-6">
              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="secondary" onClick={onClose}>
                  关闭
                </Button>
                <Button type="button" variant="secondary" onClick={() => onReuse(result)}>
                  <Copy className="h-4 w-4" />
                  复用提示词
                </Button>
                <Button type="button" variant="secondary" onClick={() => onToggleLike(result.id)}>
                  <Heart className={cn("h-4 w-4", result.liked && "fill-current")} />
                  {result.liked ? "取消收藏" : "收藏"}
                </Button>
                <Button type="button" variant="primary" onClick={() => onDownload(result)}>
                  <Download className="h-4 w-4" />
                  下载
                </Button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </Dialog>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 py-2">
      <span className="text-[var(--color-text-faint)]">{label}</span>
      <span className="text-right font-medium text-[var(--color-text)]">{value}</span>
    </div>
  );
}

function getPreviewAspectClass(ratio: string) {
  if (ratio === "16:9") return "max-h-full max-w-full aspect-video";
  if (ratio === "9:16") return "mx-auto h-full max-h-full aspect-[9/16] w-auto max-w-full";
  if (ratio === "4:3") return "max-h-full max-w-full aspect-[4/3]";
  if (ratio === "3:4") return "mx-auto h-full max-h-full aspect-[3/4] w-auto max-w-full";
  return "mx-auto h-full max-h-full aspect-square w-auto max-w-full";
}
