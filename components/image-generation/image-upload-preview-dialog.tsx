"use client";

import { X } from "lucide-react";

import { UploadedImage } from "@/components/image-generation/image-data";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function ImageUploadPreviewDialog({
  image,
  onClose
}: {
  image: UploadedImage | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={Boolean(image)}
      title={image?.name || "上传图片预览"}
      onClose={onClose}
      showHeader={false}
      className="w-[min(92vw,960px)] max-w-none overflow-hidden p-0"
    >
      {image ? (
        <div className="grid max-h-[88vh] overflow-hidden md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="grid min-h-[360px] place-items-center bg-[var(--color-soft)] p-4 md:p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.previewUrl}
              alt={image.name}
              className="max-h-[72vh] max-w-full rounded-lg border border-[color:var(--color-border)] object-contain"
            />
          </div>
          <aside className="flex min-h-0 flex-col border-t border-[color:var(--color-border)] bg-[var(--color-panel)] md:border-l md:border-t-0">
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border)] p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-text)]">参考图片</p>
                <h2 className="mt-2 truncate text-base font-semibold text-[var(--color-text)]">{image.name}</h2>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4 p-4">
              <Info label="文件类型" value={image.type || "image"} />
              <Info label="文件大小" value={formatFileSize(image.size)} />
              <div className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-3 text-xs leading-5 text-[var(--color-text-muted)]">
                生成时将使用这张图片作为图生图 / 图片编辑参考。
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[var(--color-text-faint)]">{label}</p>
      <p className="mt-1 break-all text-sm text-[var(--color-text)]">{value}</p>
    </div>
  );
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(size / 1024, 1).toFixed(1)}KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}
