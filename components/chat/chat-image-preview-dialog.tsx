"use client";

import { Download, X } from "lucide-react";
import { useEffect } from "react";

import { ChatAttachment } from "@/components/chat/chat-data";

export function ChatImagePreviewDialog({
  attachment,
  onClose
}: {
  attachment: ChatAttachment | null;
  onClose: () => void;
}) {
  const imageSrc = attachment?.previewUrl || attachment?.url;

  useEffect(() => {
    if (!attachment) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [attachment, onClose]);

  if (!attachment) return null;

  function downloadImage() {
    if (!imageSrc || !attachment) return;
    const link = document.createElement("a");
    link.href = imageSrc;
    link.download = attachment.name || "nexus-image.png";
    link.rel = "noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 p-2 backdrop-blur-sm md:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={attachment.name || "图片预览"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="absolute right-4 top-4 z-10 flex gap-2">
        {imageSrc ? (
          <button
            type="button"
            onClick={downloadImage}
            className="grid h-10 w-10 place-items-center rounded-full bg-white text-black shadow-sm transition hover:bg-white/90"
            aria-label="下载图片"
          >
            <Download className="h-4 w-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-full bg-white text-black shadow-sm transition hover:bg-white/90"
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt={attachment.name}
          className="max-h-[96vh] min-h-[70vh] w-auto max-w-[98vw] object-contain shadow-[0_24px_90px_rgba(0,0,0,0.38)]"
          onMouseDown={(event) => event.stopPropagation()}
        />
      ) : null}
    </div>
  );
}
