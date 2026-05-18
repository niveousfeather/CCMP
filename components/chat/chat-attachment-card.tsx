import { Download, X } from "lucide-react";

import { ChatAttachment } from "@/components/chat/chat-data";
import { cn } from "@/lib/utils";

export function ChatAttachmentCard({
  attachment,
  compact = false,
  dense = false,
  onPreview,
  onOpenFile,
  onRemove
}: {
  attachment: ChatAttachment;
  compact?: boolean;
  dense?: boolean;
  onPreview?: (attachment: ChatAttachment) => void;
  onOpenFile?: (attachment: ChatAttachment) => void;
  onRemove?: () => void;
}) {
  const imageSrc = attachment.previewUrl || attachment.url;
  const isImage = attachment.kind === "image" && imageSrc;
  const typeLabel = getAttachmentTypeLabel(attachment);
  const visual = getAttachmentVisual(attachment);

  function handleOpen() {
    if (isImage && onPreview) {
      onPreview(attachment);
      return;
    }
    const downloadUrl = attachment.downloadUrl || attachment.url;
    if (downloadUrl) {
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = attachment.name;
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }
    onOpenFile?.(attachment);
  }

  return (
    <div
      className={cn(
        "group/asset relative flex min-w-0 items-center gap-3 overflow-hidden rounded-[22px] border border-white/80 bg-white/90 p-3 text-left shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur transition duration-300 ease-out hover:-translate-y-1 hover:scale-[1.012] hover:rotate-[0.15deg] hover:border-white hover:shadow-[0_26px_70px_rgba(15,23,42,0.14)]",
        dense
          ? "h-[66px] w-[min(100%,420px)] gap-2 rounded-2xl p-2 shadow-[0_10px_28px_rgba(15,23,42,0.08)] hover:-translate-y-0.5"
          : compact
            ? "h-[66px] w-[min(100%,420px)] gap-2 rounded-2xl p-2 shadow-[0_10px_28px_rgba(15,23,42,0.08)] hover:-translate-y-0.5"
            : "h-[118px] w-full"
      )}
    >
      <AttachmentCardBackdrop visual={visual} />
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "relative z-10 grid shrink-0 place-items-center overflow-visible rounded-[18px] transition duration-300 group-hover/asset:-translate-y-1 group-hover/asset:rotate-[-4deg] group-hover/asset:scale-105",
          dense || compact ? "h-11 w-11 rounded-2xl" : "h-16 w-16"
        )}
        aria-label={isImage ? `预览 ${attachment.name}` : `查看 ${attachment.name}`}
      >
        {isImage ? (
          <span className={cn("relative h-full w-full overflow-hidden rounded-[18px] shadow-[0_14px_30px_rgba(15,23,42,0.18)]", visual.iconShadow)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSrc} alt={attachment.name} className="h-full w-full object-cover" />
          </span>
        ) : (
          <AttachmentIcon visual={visual} />
        )}
      </button>

      <button type="button" onClick={handleOpen} className="relative z-10 min-w-0 flex-1 text-left">
        <p className={cn("max-w-full truncate font-medium text-[var(--color-text)]", dense || compact ? "text-xs" : "text-[15px]")}>
          {attachment.name}
        </p>
        <p className={cn("truncate text-[11px] text-[var(--color-text-faint)]", dense ? "mt-0.5" : "mt-1.5")}>
          {typeLabel} / {formatFileSize(attachment.size)}
        </p>
        {!compact && !dense ? (
          <p className="mt-2 line-clamp-1 text-[11px] text-[var(--color-text-faint)]">
            {attachment.status} / {attachment.uploadedAt}
          </p>
        ) : null}
      </button>

      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className={cn(
            "relative z-10 grid shrink-0 place-items-center rounded-full bg-white/70 text-[var(--color-text-muted)] shadow-sm transition hover:bg-white hover:text-[var(--color-text)]",
            dense || compact ? "h-7 w-7" : "h-8 w-8"
          )}
          aria-label={`移除 ${attachment.name}`}
        >
          <X className="h-4 w-4" />
        </button>
      ) : attachment.url ? (
        <button
          type="button"
          onClick={handleOpen}
          className={cn(
            "relative z-10 grid shrink-0 place-items-center rounded-full bg-white/70 text-[var(--color-text-muted)] opacity-0 shadow-sm transition hover:bg-white hover:text-[var(--color-text)] group-hover/asset:opacity-100",
            dense || compact ? "h-7 w-7" : "h-8 w-8"
          )}
          aria-label={`下载 ${attachment.name}`}
        >
          <Download className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function getAttachmentTypeLabel(attachment: ChatAttachment) {
  if (attachment.kind === "image") return "图片";
  if (attachment.kind === "video") return "视频";
  if (attachment.kind === "pdf") return "PDF";
  if (attachment.kind === "word") return "Word 文档";
  if (attachment.kind === "spreadsheet") return "表格";
  if (attachment.kind === "text") return "文本";
  return attachment.type || "文件";
}

export type AttachmentVisual = {
  shortLabel: string;
  iconGradient: string;
  iconShadow: string;
  accent: string;
  pattern: "lines" | "slides" | "sheet" | "image" | "folder" | "chart" | "database" | "pdf";
};

export function getAttachmentVisual(attachment: ChatAttachment): AttachmentVisual {
  const name = attachment.name.toLowerCase();
  const type = (attachment.type || "").toLowerCase();

  if (attachment.kind === "word" || /\.docx?$/.test(name) || type.includes("wordprocessingml")) {
    return {
      shortLabel: "W",
      iconGradient: "from-blue-400 via-blue-600 to-blue-800",
      iconShadow: "shadow-[0_16px_30px_rgba(37,99,235,0.34)]",
      accent: "bg-blue-200/55",
      pattern: "lines"
    };
  }

  if (/\.pptx?$/.test(name) || type.includes("presentationml") || type.includes("powerpoint")) {
    return {
      shortLabel: "P",
      iconGradient: "from-orange-400 via-orange-600 to-red-600",
      iconShadow: "shadow-[0_16px_30px_rgba(234,88,12,0.32)]",
      accent: "bg-orange-200/55",
      pattern: "slides"
    };
  }

  if (attachment.kind === "spreadsheet" || /\.(xlsx?|csv)$/.test(name) || type.includes("spreadsheet")) {
    return {
      shortLabel: "X",
      iconGradient: "from-emerald-400 via-emerald-600 to-green-800",
      iconShadow: "shadow-[0_16px_30px_rgba(22,163,74,0.32)]",
      accent: "bg-emerald-200/55",
      pattern: "sheet"
    };
  }

  if (attachment.kind === "pdf" || /\.pdf$/.test(name) || type.includes("pdf")) {
    return {
      shortLabel: "PDF",
      iconGradient: "from-red-400 via-red-500 to-red-700",
      iconShadow: "shadow-[0_16px_30px_rgba(239,68,68,0.32)]",
      accent: "bg-rose-200/55",
      pattern: "pdf"
    };
  }

  if (attachment.kind === "image" || /\.(png|jpe?g|webp|gif|svg)$/.test(name) || type.startsWith("image/")) {
    return {
      shortLabel: "IMG",
      iconGradient: "from-violet-400 via-purple-600 to-indigo-700",
      iconShadow: "shadow-[0_16px_30px_rgba(124,58,237,0.3)]",
      accent: "bg-violet-200/50",
      pattern: "image"
    };
  }

  if (attachment.kind === "video" || /\.(mp4|mov|webm|m4v)$/.test(name) || type.startsWith("video/")) {
    return {
      shortLabel: "VID",
      iconGradient: "from-sky-400 via-blue-600 to-cyan-800",
      iconShadow: "shadow-[0_16px_30px_rgba(2,132,199,0.3)]",
      accent: "bg-sky-200/50",
      pattern: "slides"
    };
  }

  if (/\.(zip|rar|7z|tar|gz)$/.test(name)) {
    return {
      shortLabel: "ZIP",
      iconGradient: "from-amber-300 via-amber-500 to-orange-600",
      iconShadow: "shadow-[0_16px_30px_rgba(245,158,11,0.32)]",
      accent: "bg-amber-200/55",
      pattern: "folder"
    };
  }

  if (/\.(json|js|ts|tsx|jsx|html|css|md)$/.test(name) || attachment.kind === "text") {
    return {
      shortLabel: attachment.kind === "text" ? "TXT" : "</>",
      iconGradient: "from-indigo-400 via-blue-600 to-violet-700",
      iconShadow: "shadow-[0_16px_30px_rgba(79,70,229,0.3)]",
      accent: "bg-indigo-200/50",
      pattern: "lines"
    };
  }

  if (/\.(db|sqlite|sql)$/.test(name)) {
    return {
      shortLabel: "DB",
      iconGradient: "from-slate-600 via-slate-800 to-slate-950",
      iconShadow: "shadow-[0_16px_30px_rgba(15,23,42,0.28)]",
      accent: "bg-slate-200/60",
      pattern: "database"
    };
  }

  return {
    shortLabel: "FILE",
    iconGradient: "from-slate-500 via-slate-700 to-slate-900",
    iconShadow: "shadow-[0_16px_30px_rgba(15,23,42,0.24)]",
    accent: "bg-slate-200/55",
    pattern: "lines"
  };
}

export function AttachmentIcon({ visual }: { visual: AttachmentVisual }) {
  return (
    <span className="relative grid h-full w-full place-items-center">
      <span className={cn("absolute left-2 top-2 h-full w-full rounded-[16px] opacity-35 blur-[0.2px]", visual.accent)} />
      <span
        className={cn(
          "relative grid h-full w-full place-items-center rounded-[16px] bg-gradient-to-br font-black text-white",
          visual.iconGradient,
          visual.iconShadow
        )}
      >
        <span
          style={{ color: "#fff" }}
          className={cn(
            "!text-white drop-shadow-sm",
            visual.shortLabel.length === 1
              ? "text-[30px] leading-none"
              : visual.shortLabel.length <= 3
                ? "text-lg leading-none"
                : "text-[13px] leading-none"
          )}
        >
          {visual.shortLabel}
        </span>
      </span>
    </span>
  );
}

function AttachmentCardBackdrop({ visual }: { visual: AttachmentVisual }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[22px]">
      <div className={cn("absolute -bottom-8 -right-6 h-28 w-44 rounded-[55%] opacity-40 blur-[0.2px] transition duration-300 group-hover/asset:translate-x-2 group-hover/asset:-translate-y-1", visual.accent)} />
      {visual.pattern === "sheet" ? <SheetPattern /> : null}
      {visual.pattern === "slides" ? <SlidePattern /> : null}
      {visual.pattern === "image" ? <ImagePattern /> : null}
      {visual.pattern === "folder" ? <FolderPattern /> : null}
      {visual.pattern === "chart" ? <ChartPattern /> : null}
      {visual.pattern === "database" ? <DatabasePattern /> : null}
      {visual.pattern === "pdf" ? <PdfPattern /> : null}
      {visual.pattern === "lines" ? <LinePattern /> : null}
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.7),rgba(255,255,255,0.35)_42%,rgba(255,255,255,0.64))]" />
    </div>
  );
}

function LinePattern() {
  return (
    <div className="absolute right-10 top-8 grid gap-2 opacity-45 transition duration-300 group-hover/asset:-translate-x-1">
      <span className="h-2 w-24 rounded-full bg-slate-300" />
      <span className="h-2 w-16 rounded-full bg-slate-300" />
      <span className="h-2 w-12 rounded-full bg-slate-300" />
    </div>
  );
}

function SlidePattern() {
  return (
    <div className="absolute right-8 top-7 h-16 w-16 rounded-full bg-orange-300/35 transition duration-300 group-hover/asset:rotate-12">
      <div className="absolute right-0 top-0 h-8 w-8 rounded-tr-full border-b-[5px] border-l-[5px] border-white/80 bg-orange-100" />
    </div>
  );
}

function SheetPattern() {
  return (
    <div className="absolute right-5 top-7 grid grid-cols-3 gap-1 opacity-45 transition duration-300 group-hover/asset:translate-x-1">
      {Array.from({ length: 9 }).map((_, index) => (
        <span key={index} className="h-4 w-8 rounded bg-emerald-200" />
      ))}
    </div>
  );
}

function ImagePattern() {
  return (
    <div className="absolute right-4 bottom-4 h-20 w-32 opacity-45 transition duration-300 group-hover/asset:-translate-y-1">
      <span className="absolute bottom-0 left-4 h-10 w-16 rotate-[-1deg] rounded-t-[18px] bg-violet-300/70" />
      <span className="absolute bottom-0 right-2 h-14 w-20 rotate-2 rounded-t-[22px] bg-violet-200/80" />
      <span className="absolute right-12 top-0 h-5 w-5 rounded-full bg-violet-300" />
    </div>
  );
}

function FolderPattern() {
  return (
    <div className="absolute bottom-0 right-5 h-20 w-32 opacity-55 transition duration-300 group-hover/asset:translate-x-1">
      <span className="absolute bottom-0 h-16 w-full rounded-t-[14px] bg-amber-100" />
      <span className="absolute bottom-14 left-5 h-6 w-16 rounded-t-[12px] bg-amber-100" />
    </div>
  );
}

function ChartPattern() {
  return (
    <div className="absolute right-8 bottom-8 flex items-end gap-3 opacity-45">
      <span className="h-8 w-6 rounded-t bg-emerald-200" />
      <span className="h-12 w-6 rounded-t bg-emerald-200" />
      <span className="h-16 w-6 rounded-t bg-emerald-200" />
    </div>
  );
}

function DatabasePattern() {
  return (
    <div className="absolute right-6 bottom-6 h-16 w-24 opacity-45 transition duration-300 group-hover/asset:-translate-y-1">
      <span className="absolute inset-x-0 top-0 h-5 rounded-[50%] bg-slate-300" />
      <span className="absolute inset-x-0 top-4 h-5 rounded-[50%] border-y border-white/80 bg-slate-300" />
      <span className="absolute inset-x-0 top-8 h-5 rounded-[50%] border-y border-white/80 bg-slate-300" />
    </div>
  );
}

function PdfPattern() {
  return (
    <div className="absolute -right-3 bottom-3 h-24 w-44 opacity-45 transition duration-300 group-hover/asset:-translate-y-1">
      <span className="absolute bottom-0 left-0 h-14 w-24 rotate-[-10deg] rounded-[50%] bg-rose-200" />
      <span className="absolute bottom-2 right-0 h-16 w-28 rotate-[8deg] rounded-[50%] bg-red-200" />
    </div>
  );
}

export function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(size / 1024, 1).toFixed(1)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}
