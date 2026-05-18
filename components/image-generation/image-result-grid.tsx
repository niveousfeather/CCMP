"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Download, Eye, Heart, Image as ImageIcon, Loader2 } from "lucide-react";

import { ImageResult } from "@/components/image-generation/image-data";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { getImageModelLabel } from "@/lib/image/config";

export function ImageResultGrid({
  results,
  loading,
  activeId,
  onSelect,
  onPreview,
  onDownload,
  onReuse,
  onToggleLike
}: {
  results: ImageResult[];
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onPreview: (result: ImageResult) => void;
  onDownload: (result: ImageResult) => void;
  onReuse: (result: ImageResult) => void;
  onToggleLike: (id: string) => void;
}) {
  const activeIndex = Math.max(results.findIndex((result) => result.id === activeId), 0);
  const activeResult = results[activeIndex] || null;

  function selectOffset(offset: number) {
    if (!results.length) return;
    const nextIndex = (activeIndex + offset + results.length) % results.length;
    onSelect(results[nextIndex].id);
  }

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-5">
      <div className="mb-5 flex shrink-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Badge>结果查看</Badge>
          <h1 className="mt-3 text-2xl font-semibold text-[var(--color-text)]">图片生成</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            生成结果在固定预览区展示，底部信息栏显示最终 Prompt 和操作入口。
          </p>
        </div>
        <p className="text-sm text-[var(--color-text-faint)]">{loading ? "正在生成..." : results.length ? "已生成" : "暂无结果"}</p>
      </div>

      <div className="min-h-0 flex-1">
        {loading ? (
          <ImageGeneratingState />
        ) : activeResult ? (
          <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-soft)]">
            <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-[var(--color-panel)]">
                <ImageVisualFrame result={activeResult} fit="contain" />
              </div>

              {results.length > 1 ? (
                <div className="absolute bottom-5 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-panel)]/92 px-2 py-2 shadow-soft backdrop-blur">
                  <Button type="button" variant="secondary" size="icon" onClick={() => selectOffset(-1)} aria-label="上一张">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-14 text-center text-sm font-medium text-[var(--color-text)]">
                    {activeIndex + 1} / {results.length}
                  </span>
                  <Button type="button" variant="secondary" size="icon" onClick={() => selectOffset(1)} aria-label="下一张">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-[color:var(--color-border)] bg-[var(--color-panel)]/60 px-4 py-3">
              <div className="flex min-h-16 flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge>{activeResult.mode === "image-to-image" ? "图生图" : "文生图"}</Badge>
                    <Badge>{activeResult.ratio}</Badge>
                    <Badge>{activeResult.resolution || "1K"}</Badge>
                    <Badge>{getImageModelLabel(activeResult.model)}</Badge>
                    <Badge>已完成</Badge>
                    <span className="text-xs text-[var(--color-text-faint)]">{activeResult.createdAt}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium text-[var(--color-text)]">
                    {activeResult.title}
                    <span className="mx-2 text-[var(--color-text-faint)]">/</span>
                    <span className="font-normal text-[var(--color-text-muted)]">
                      {activeResult.finalPrompt || activeResult.revisedPrompt || activeResult.prompt}
                    </span>
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2 xl:justify-end">
                  <Button type="button" variant="secondary" size="sm" onClick={() => onPreview(activeResult)}>
                    <Eye className="h-4 w-4" />
                    查看
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => onReuse(activeResult)}>
                    <Copy className="h-4 w-4" />
                    复用
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => onToggleLike(activeResult.id)}>
                    <Heart className={cn("h-4 w-4", activeResult.liked && "fill-current")} />
                    {activeResult.liked ? "取消收藏" : "收藏"}
                  </Button>
                  <Button type="button" variant="primary" size="sm" onClick={() => onDownload(activeResult)}>
                    <Download className="h-4 w-4" />
                    下载
                  </Button>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <div className="grid h-full min-h-0 place-items-center rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-soft)]">
            <EmptyState icon={ImageIcon} title="暂无生成结果" description="输入提示词并点击生成后，真实图片会显示在这里。" />
          </div>
        )}
      </div>
    </Card>
  );
}

function ImageGeneratingState() {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-soft)]">
      <div className="grid min-h-0 flex-1 place-items-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-[color:var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-[var(--color-text)]">正在生成图片，请稍候...</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">模型正在处理提示词和参数，完成后会自动切换到图片展示。</p>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-[var(--color-panel)]">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-[var(--color-primary)]" />
          </div>
        </div>
      </div>
      <div className="shrink-0 border-t border-[color:var(--color-border)] bg-[var(--color-panel)]/60 px-4 py-3">
        <div className="min-h-16">
          <div className="h-3 w-32 animate-pulse rounded bg-[var(--color-soft)]" />
          <div className="mt-3 h-3 w-full animate-pulse rounded bg-[var(--color-soft)]" />
        </div>
      </div>
    </section>
  );
}

export function ImageVisualFrame({ result, fit = "cover" }: { result: ImageResult; fit?: "cover" | "contain" }) {
  const imageSrc = getImageSrc(result);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    setFailedSrc(null);
  }, [imageSrc]);

  if (imageSrc && failedSrc !== imageSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageSrc}
        alt={result.title}
        className={cn(fit === "contain" ? "h-full w-full object-contain" : "absolute inset-0 h-full w-full object-cover")}
        onError={() => setFailedSrc(imageSrc)}
      />
    );
  }

  return (
    <div className="grid h-full w-full place-items-center px-6 text-center text-[var(--color-text-faint)]">
      <div>
        <ImageIcon className="mx-auto h-8 w-8" />
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">{imageSrc ? "图片资源加载失败" : "暂无可展示图片"}</p>
        {imageSrc ? <p className="mt-1 text-xs text-[var(--color-text-faint)]">图片地址可能已失效，请重新生成或检查存储配置。</p> : null}
      </div>
    </div>
  );
}

export function getImageSrc(result: ImageResult) {
  if (result.url) return result.url;
  if (result.b64_json) return `data:image/png;base64,${result.b64_json}`;
  return null;
}
