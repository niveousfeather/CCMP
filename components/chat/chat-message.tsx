"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Copy, Download, ExternalLink, FileText, Globe2, GraduationCap, ImageIcon, Loader2, Network, Presentation, RotateCcw, Sparkles, Table2, User } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { ChatAttachment, ChatMessage as ChatMessageType } from "@/components/chat/chat-data";
import { AttachmentIcon, ChatAttachmentCard, getAttachmentTypeLabel, getAttachmentVisual } from "@/components/chat/chat-attachment-card";
import { shouldShowDeepWritingProcessButton } from "@/components/chat/deep-writing-panel-state";
import { Badge } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ChatImageGenerationMeta = NonNullable<ChatMessageType["imageGeneration"]>;

export function ChatMessage({
  message,
  onPreviewAttachment,
  onOpenFile,
  onRetryImageGeneration,
  onOpenWebContext,
  onOpenDeepWritingPanel,
  onResumeDeepWriting,
  onRevealTick
}: {
  message: ChatMessageType;
  onPreviewAttachment: (attachment: ChatAttachment) => void;
  onOpenFile: (attachment: ChatAttachment) => void;
  onRetryImageGeneration?: (imageGeneration: ChatImageGenerationMeta) => void;
  onOpenWebContext?: (webContext: NonNullable<ChatMessageType["webContext"]>) => void;
  onOpenDeepWritingPanel?: (taskCard: NonNullable<ChatMessageType["taskCard"]>) => void;
  onResumeDeepWriting?: (taskCard: NonNullable<ChatMessageType["taskCard"]>) => void;
  onRevealTick?: () => void;
}) {
  const isUser = message.role === "user";
  const generatedFileAttachments = !isUser
    ? (message.attachments || []).filter(isGeneratedFileAttachment)
    : [];
  const taskCard =
    message.taskCard && !isInlineFileAnalysisTaskCard(message.taskCard)
      ? enrichTaskCardWithAttachment(message.taskCard, generatedFileAttachments[0])
      : null;
  const standaloneGeneratedFileAttachments = taskCard ? [] : generatedFileAttachments;
  const regularAttachments = generatedFileAttachments.length
    ? (message.attachments || []).filter((attachment) => !isGeneratedFileAttachment(attachment))
    : message.attachments || [];
  const [leadContent, followContent] = splitGeneratedDocumentContent(message.content, standaloneGeneratedFileAttachments.length > 0);
  const shouldRevealText = !isUser && Boolean(message.reveal);

  return (
    <div className={cn("flex gap-3", isUser && "justify-end")}>
      {!isUser ? (
        <div className="mt-1 shrink-0">
          <BrandLogo showText={false} className="gap-0" />
        </div>
      ) : null}
      <div
        className={cn(
          "max-w-[92%] px-1 py-1",
          isUser
            ? "rounded-2xl bg-[var(--color-soft)] px-4 py-3 text-[var(--color-text)] md:max-w-[68%]"
            : "text-[var(--color-text)] md:max-w-[78%]"
        )}
      >
        {message.fallback ? <Badge className="mb-3">Nexus AI</Badge> : null}
        {!isUser && message.statusText ? (
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[var(--color-soft)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
            <Loader2 className="h-3 w-3 animate-spin" />
            {message.statusText}
          </div>
        ) : null}
        {!isUser && (message.streamStatus === "interrupted" || message.streamStatus === "failed") && message.streamError ? (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
            <p>{message.streamError}</p>
            <button
              type="button"
              className="mt-2 rounded-md border border-amber-200 bg-white px-2 py-1 text-xs font-medium text-amber-800"
              disabled
              title="继续生成入口将在后续阶段接入"
            >
              继续生成
            </button>
          </div>
        ) : null}
        {leadContent ? <MessageText content={leadContent} reveal={shouldRevealText} onRevealTick={onRevealTick} /> : null}
        {taskCard ? (
          <>
            <GeneratedFileCard taskCard={taskCard} createdAt={message.createdAt} />
            {shouldShowDeepWritingProcessButton(taskCard) ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOpenDeepWritingPanel?.(taskCard)}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[var(--color-panel)] px-3 text-xs font-medium text-[var(--color-text)] shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--color-soft)]"
                >
                  <FileText className="h-3.5 w-3.5" />
                  查看文档
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                {shouldShowDeepWritingResumeButton(taskCard) ? (
                  <button
                    type="button"
                    onClick={() => onResumeDeepWriting?.(taskCard)}
                    className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--color-text)] px-3 text-xs font-medium text-[var(--color-panel)] shadow-sm transition hover:-translate-y-0.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    继续生成
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
        {message.imageGeneration && (!taskCard || message.imageGeneration.images?.length) ? (
          <ImageGenerationCard
            imageGeneration={message.imageGeneration}
            onPreviewAttachment={onPreviewAttachment}
            onRetryImageGeneration={onRetryImageGeneration}
          />
        ) : null}
        {!taskCard && message.pendingFileGeneration ? <PendingFileGenerationCard pending={message.pendingFileGeneration} /> : null}
        {!taskCard && message.pendingAgentTask ? <PendingAgentTaskCard pending={message.pendingAgentTask} /> : null}
        {standaloneGeneratedFileAttachments.length ? (
          <div className="mt-4 grid gap-3">
            {standaloneGeneratedFileAttachments.map((attachment) => (
              <GeneratedWordCard key={attachment.id} attachment={attachment} onOpenFile={onOpenFile} />
            ))}
            <button
              type="button"
              className="inline-flex w-fit items-center gap-1 text-sm text-[var(--color-text-muted)] transition hover:text-[var(--color-primary)]"
              onClick={() => onOpenFile(standaloneGeneratedFileAttachments[0])}
            >
              打开生成文件
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        {followContent ? <MessageText className="mt-4" content={followContent} reveal={shouldRevealText} onRevealTick={onRevealTick} /> : null}
        {!isUser && message.webContext?.items?.length ? (
          <WebReferencePills webContext={message.webContext} onOpenWebContext={onOpenWebContext} />
        ) : null}
        {regularAttachments.length ? (
          <div className="mt-3 grid gap-2">
            {regularAttachments.map((attachment) =>
              attachment.kind === "image" ? (
                <UploadedImageCard key={attachment.id} attachment={attachment} onPreviewAttachment={onPreviewAttachment} />
              ) : (
                <ChatAttachmentCard
                  key={attachment.id}
                  attachment={attachment}
                  compact
                  onPreview={onPreviewAttachment}
                  onOpenFile={onOpenFile}
                />
              )
            )}
          </div>
        ) : null}
        <p className={cn("mt-2 text-xs", isUser ? "opacity-60" : "text-[var(--color-text-faint)]")}>
          {message.createdAt}
        </p>
      </div>
      {isUser ? (
        <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] text-[var(--color-text-muted)]">
          <User className="h-4 w-4" />
        </div>
      ) : null}
    </div>
  );
}

function WebReferencePills({
  webContext,
  onOpenWebContext
}: {
  webContext: NonNullable<ChatMessageType["webContext"]>;
  onOpenWebContext?: (webContext: NonNullable<ChatMessageType["webContext"]>) => void;
}) {
  const count = webContext.items.filter((item) => item.url && item.title).length;
  if (!count) return null;

  return (
    <div className="mt-4 flex items-center gap-2">
      <button
        type="button"
        onClick={() => onOpenWebContext?.(webContext)}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50"
        title="查看本次联网搜索结果"
      >
        <span className="grid h-5 w-5 place-items-center rounded-md bg-blue-50 text-blue-600">
          <Globe2 className="h-3.5 w-3.5" />
        </span>
        <span className="font-medium">{count} 个网页</span>
      </button>
    </div>
  );
}

type TextBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "hr" }
  | { type: "code"; language: string; code: string };

function MessageText({
  content,
  reveal,
  className,
  onRevealTick
}: {
  content: string;
  reveal?: boolean;
  className?: string;
  onRevealTick?: () => void;
}) {
  const blocks = useMemo(() => parseMessageBlocks(content), [content]);
  const [visibleCount, setVisibleCount] = useState(reveal ? 0 : blocks.length);

  useEffect(() => {
    if (!reveal) {
      setVisibleCount(blocks.length);
      return;
    }

    setVisibleCount(0);
    if (!blocks.length) return;

    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisibleCount(Math.min(index, blocks.length));
      onRevealTick?.();
      if (index >= blocks.length) window.clearInterval(timer);
    }, 150);

    return () => window.clearInterval(timer);
  }, [blocks.length, onRevealTick, reveal]);

  const visibleBlocks = blocks.slice(0, visibleCount);

  return (
    <div className={cn("chat-message-text text-[15.5px] leading-7 md:text-base md:leading-8", className)}>
      {visibleBlocks.map((block, index) => (
        <MessageTextBlock key={`${block.type}-${index}`} block={block} />
      ))}
      {reveal && visibleCount < blocks.length ? <span className="chat-reveal-caret" aria-hidden="true" /> : null}
    </div>
  );
}

function MessageTextBlock({ block }: { block: TextBlock }) {
  if (block.type === "heading") {
    const className =
      block.level <= 2
        ? "mb-2 mt-5 first:mt-0 text-xl font-semibold leading-8 tracking-normal text-[var(--color-text)] md:text-[22px]"
        : "mb-2 mt-4 first:mt-0 text-lg font-semibold leading-7 tracking-normal text-[var(--color-text)]";
    return (
      <h3 className={cn("chat-block-in", className)}>
        <InlineMarkdown text={block.text} />
      </h3>
    );
  }

  if (block.type === "hr") {
    return <div className="chat-block-in my-4 h-px bg-[var(--color-border)]" />;
  }

  if (block.type === "code") {
    return <CodeBlockCard language={block.language} code={block.code} />;
  }

  if (block.type === "ul" || block.type === "ol") {
    const ListTag = block.type === "ul" ? "ul" : "ol";
    return (
      <ListTag
        className={cn(
          "chat-block-in my-2 space-y-1.5 pl-5 marker:text-[var(--color-text-muted)]",
          block.type === "ul" ? "list-disc" : "list-decimal"
        )}
      >
        {block.items.map((item, index) => (
          <li key={`${item}-${index}`} className="pl-1">
            <InlineMarkdown text={item} />
          </li>
        ))}
      </ListTag>
    );
  }

  return (
    <p className="chat-block-in my-2 whitespace-pre-wrap text-[var(--color-text)]">
      <InlineMarkdown text={block.text} />
    </p>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={`${part}-${index}`} className="font-semibold text-[1.04em] text-[var(--color-text)]">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={`${part}-${index}`}
              className="rounded-md bg-[var(--color-soft)] px-1.5 py-0.5 text-[0.92em] text-[var(--color-text)]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </>
  );
}

function CodeBlockCard({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const normalizedLanguage = language || "text";

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  function downloadCode() {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nexus-code.${getCodeExtension(normalizedLanguage)}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="chat-block-in my-4 overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-panel)] shadow-[0_18px_46px_rgba(15,23,42,0.10)]">
      <div className="flex items-center justify-between gap-3 bg-[var(--color-soft)] px-4 py-3 text-[var(--color-text)]">
        <span className="truncate text-xs font-medium tracking-wide text-[var(--color-text-muted)]">{normalizedLanguage}</span>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={copyCode}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)] transition hover:text-[var(--color-text)]"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={downloadCode}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)] transition hover:text-[var(--color-text)]"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
        </div>
      </div>
      <pre className="max-h-[560px] overflow-auto bg-[var(--color-panel-2)] px-5 py-4 font-mono text-[13px] leading-6 text-[var(--color-text)]">
        <code className="block min-w-full whitespace-pre-wrap break-words">{code}</code>
      </pre>
    </div>
  );
}

function getCodeExtension(language: string) {
  const normalized = language.toLowerCase();
  if (normalized.includes("javascript") || normalized === "js") return "js";
  if (normalized.includes("typescript") || normalized === "ts" || normalized === "tsx") return normalized === "tsx" ? "tsx" : "ts";
  if (normalized.includes("python") || normalized === "py") return "py";
  if (normalized.includes("json")) return "json";
  if (normalized.includes("css")) return "css";
  if (normalized.includes("html")) return "html";
  if (normalized.includes("sql")) return "sql";
  if (normalized.includes("bash") || normalized.includes("shell") || normalized === "sh") return "sh";
  return "txt";
}

function parseMessageBlocks(content: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let codeBlock: { language: string; lines: string[] } | null = null;

  function flushParagraph() {
    if (!paragraph.length) return;
    splitParagraphIntoReadableChunks(paragraph.join(" ").trim()).forEach((text) => {
      if (text) blocks.push({ type: "paragraph", text });
    });
    paragraph = [];
  }

  function flushList() {
    if (!list) return;
    blocks.push({ type: list.type, items: list.items });
    list = null;
  }

  function flushCodeBlock() {
    if (!codeBlock) return;
    blocks.push({ type: "code", language: codeBlock.language, code: codeBlock.lines.join("\n").replace(/\n+$/g, "") });
    codeBlock = null;
  }

  for (const rawLine of lines) {
    const fence = /^```([A-Za-z0-9_+.#-]*)\s*$/.exec(rawLine.trim());
    if (codeBlock) {
      if (fence) {
        flushCodeBlock();
      } else {
        codeBlock.lines.push(rawLine);
      }
      continue;
    }

    if (fence) {
      flushParagraph();
      flushList();
      codeBlock = { language: fence[1] || "text", lines: [] };
      continue;
    }

    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^-{3,}$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: "hr" });
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      continue;
    }

    const unordered = /^[-*•]\s+(.+)$/.exec(line);
    if (unordered) {
      flushParagraph();
      if (list?.type !== "ul") flushList();
      list = list || { type: "ul", items: [] };
      list.items.push(unordered[1].trim());
      continue;
    }

    const ordered = /^\d+[.、]\s+(.+)$/.exec(line);
    if (ordered) {
      flushParagraph();
      if (list?.type !== "ol") flushList();
      list = list || { type: "ol", items: [] };
      list.items.push(ordered[1].trim());
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  flushCodeBlock();
  return blocks;
}

function splitParagraphIntoReadableChunks(text: string) {
  if (text.length <= 120) return [text];

  const sentences = text.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [text];
  const chunks: string[] = [];
  let current = "";

  sentences.forEach((sentence) => {
    const next = `${current}${sentence}`.trim();
    if (current && next.length > 130) {
      chunks.push(current.trim());
      current = sentence.trim();
    } else {
      current = next;
    }
  });

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function ImageGenerationCard({
  imageGeneration,
  onPreviewAttachment,
  onRetryImageGeneration
}: {
  imageGeneration: ChatImageGenerationMeta;
  onPreviewAttachment: (attachment: ChatAttachment) => void;
  onRetryImageGeneration?: (imageGeneration: ChatImageGenerationMeta) => void;
}) {
  const images = imageGeneration.images || [];
  const referenceImages = imageGeneration.referenceImages || [];
  const isCompleted = (imageGeneration.status === "已完成" || imageGeneration.status === "completed") && images.length > 0;
  const isFailed =
    imageGeneration.status === "生成失败" ||
    imageGeneration.status === "生成超时" ||
    imageGeneration.status === "failed" ||
    imageGeneration.status === "timeout";
  const statusLabel =
    imageGeneration.status === "completed"
      ? "已完成"
      : imageGeneration.status === "failed"
        ? "生成失败"
        : imageGeneration.status === "timeout"
          ? "生成超时"
          : imageGeneration.status === "queued" || imageGeneration.status === "pending" || imageGeneration.status === "processing" || imageGeneration.status === "retrying"
            ? "生成中"
            : imageGeneration.status === "准备生成"
              ? "准备生成"
              : imageGeneration.status;
  const imageAlt = imageGeneration.finalPrompt || imageGeneration.originalPrompt || "Nexus Image2 生成图片";

  function previewImage(src: string, index: number) {
    onPreviewAttachment({
      id: `${imageGeneration.generationId}-${index}`,
      name: `Nexus Image2-${index + 1}.png`,
      type: "image/png",
      size: 0,
      kind: "image",
      previewUrl: src,
      url: src,
      uploadedAt: imageGeneration.updatedAt || imageGeneration.createdAt || "",
      status: "已发送"
    });
  }

  return (
    <div className="mt-4 w-full max-w-[520px]">
      {referenceImages.length ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {referenceImages.slice(0, 3).map((reference, index) => (
            <button
              key={`${reference.url}-${index}`}
              type="button"
              onClick={() =>
                onPreviewAttachment({
                  id: `${imageGeneration.generationId}-reference-${index}`,
                  name: reference.name || `参考图-${index + 1}.png`,
                  type: "image/png",
                  size: 0,
                  kind: "image",
                  previewUrl: reference.url,
                  url: reference.url,
                  uploadedAt: imageGeneration.updatedAt || imageGeneration.createdAt || "",
                  status: "已发送"
                })
              }
              className="group/reference flex max-w-[180px] items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-white/80 p-1 pr-3 text-left shadow-sm transition hover:border-[color:var(--color-border-strong)]"
              aria-label="预览参考图"
            >
              <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-[var(--color-soft)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={reference.url} alt={reference.name || "参考图"} className="h-full w-full object-cover" />
              </span>
              <span className="min-w-0 text-[11px] text-[var(--color-text-muted)]">
                <span className="block truncate">参考图</span>
                {reference.name ? <span className="block truncate opacity-70">{reference.name}</span> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {isCompleted ? (
        <div className="grid gap-3">
          {images.map((src, index) => (
            <div
              key={`${src}-${index}`}
              className="group relative overflow-hidden rounded-[28px] bg-[var(--color-soft)] shadow-[0_18px_44px_rgba(15,23,42,0.16)]"
            >
              <button
                type="button"
                onClick={() => previewImage(src, index)}
                className="block w-full overflow-hidden rounded-[28px]"
                aria-label="放大查看图片"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={imageAlt} className="block max-h-[420px] w-full object-cover transition duration-300 group-hover:scale-[1.015]" />
              </button>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-end bg-gradient-to-t from-black/42 via-black/10 to-transparent p-3 opacity-0 transition duration-200 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => downloadImage(src, `nexus-image-${index + 1}.png`)}
                  className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-white text-black shadow-sm transition hover:bg-white/90"
                  aria-label="下载图片"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : isFailed ? (
        <div className="overflow-hidden rounded-[28px] border border-red-200 bg-red-50 text-red-700 shadow-sm">
          <div className="relative aspect-[16/9] bg-[radial-gradient(circle_at_28%_24%,rgba(248,113,113,0.18),transparent_34%),radial-gradient(circle_at_75%_65%,rgba(251,191,36,0.16),transparent_30%),#fff7f7]">
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <div>
                <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-white text-red-500 shadow-sm">
                  <ImageIcon className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium">{statusLabel}</p>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-red-600/80">
                  {imageGeneration.failureReason || "图片生成没有成功，请调整描述后重试。"}
                </p>
              </div>
            </div>
          </div>
          {onRetryImageGeneration ? (
            <div className="flex items-center justify-between gap-3 border-t border-red-100 bg-white/70 px-4 py-3">
              <span className="text-xs text-red-600/75">可保留原需求重新生成</span>
              <button
                type="button"
                onClick={() => onRetryImageGeneration(imageGeneration)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-red-600 px-3 text-xs font-medium text-white transition hover:bg-red-700"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                重试
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          <div className="mb-1.5 flex justify-end pr-5">
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              {statusLabel === "准备生成" ? "正在理解画面" : "正在生成图片"}
            </span>
          </div>
          <div className="relative aspect-[16/9] overflow-hidden rounded-[28px] border border-[color:var(--color-border)] bg-[var(--color-soft)] shadow-[0_18px_44px_rgba(15,23,42,0.12)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(96,165,250,0.2),transparent_34%),radial-gradient(circle_at_70%_70%,rgba(16,185,129,0.16),transparent_32%)] animate-[image-card-pulse_2.1s_ease-in-out_infinite]" />
            <div className="absolute inset-y-[-20%] left-[-45%] w-1/2 rotate-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)] blur-sm animate-[image-card-sheen_1.25s_ease-in-out_infinite]" />
            <div className="absolute inset-y-[-18%] left-[-65%] w-2/3 rotate-12 bg-[linear-gradient(90deg,transparent,rgba(147,197,253,0.24),rgba(255,255,255,0.32),transparent)] animate-[image-card-sheen_1.25s_ease-in-out_infinite]" />
          </div>
        </div>
      )}
    </div>
  );
}

function UnifiedTaskCard({ taskCard }: { taskCard: NonNullable<ChatMessageType["taskCard"]> }) {
  const isRunning = taskCard.status === "queued" || taskCard.status === "running";
  const isCompleted = taskCard.status === "completed";
  const isFailed = taskCard.status === "failed";
  const Icon = getTaskCardIcon(taskCard.taskType);
  const statusLabel = isCompleted ? "已完成" : isFailed ? "生成失败" : taskCard.status === "queued" ? "正在创建任务" : "正在生成";
  const accent = getTaskCardAccent(taskCard.taskType, isFailed);
  const failureReason = sanitizeTaskFailureReason(taskCard.failureReason);
  const { downloadLabel, openLabel } = getTaskCardActionLabels(taskCard.taskType);
  const openUrl = taskCard.openUrl && !isInternalTaskPollUrl(taskCard.openUrl) ? taskCard.openUrl : null;

  return (
    <div className={cn("mt-4 w-full max-w-[560px] rounded-2xl border bg-white/95 p-4 shadow-sm", accent.border)}>
      <div className="flex items-start gap-3">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", accent.bg, accent.text)}>
          {isRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-[var(--color-text)]">{taskCard.title}</p>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", accent.badge)}>
              {statusLabel}
            </span>
          </div>
          {taskCard.description ? (
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{taskCard.description}</p>
          ) : null}
          {isFailed && failureReason ? (
            <p className="mt-2 text-xs leading-5 text-red-600">{failureReason}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {taskCard.downloadUrl && isCompleted ? (
              <a
                href={taskCard.downloadUrl}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--color-primary)] px-3 text-xs font-medium text-white transition hover:opacity-90"
              >
                <Download className="h-3.5 w-3.5" />
                {downloadLabel}
              </a>
            ) : null}
            {openUrl ? (
              <a
                href={openUrl}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[color:var(--color-border)] bg-white px-3 text-xs font-medium text-[var(--color-text)] transition hover:bg-[var(--color-soft)]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {openLabel}
              </a>
            ) : null}
            {taskCard.retryable ? (
              <button
                type="button"
                disabled
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[color:var(--color-border)] bg-white px-3 text-xs font-medium text-[var(--color-text-muted)]"
                title="重试入口将在后续阶段接入"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                重试
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function getTaskCardIcon(taskType: NonNullable<ChatMessageType["taskCard"]>["taskType"]) {
  if (taskType === "ppt") return Presentation;
  if (taskType === "word") return FileText;
  if (taskType === "excel") return Table2;
  if (taskType === "image") return ImageIcon;
  if (taskType === "teaching-diagram") return GraduationCap;
  if (taskType === "knowledge-graph") return Network;
  return Sparkles;
}

function getTaskCardAccent(taskType: NonNullable<ChatMessageType["taskCard"]>["taskType"], failed: boolean) {
  if (failed) {
    return {
      border: "border-red-200",
      bg: "bg-red-50",
      text: "text-red-600",
      badge: "bg-red-50 text-red-700"
    };
  }
  if (taskType === "ppt") return { border: "border-orange-200", bg: "bg-orange-50", text: "text-orange-600", badge: "bg-orange-50 text-orange-700" };
  if (taskType === "word") return { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-600", badge: "bg-blue-50 text-blue-700" };
  if (taskType === "excel") return { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-600", badge: "bg-emerald-50 text-emerald-700" };
  if (taskType === "image") return { border: "border-violet-200", bg: "bg-violet-50", text: "text-violet-600", badge: "bg-violet-50 text-violet-700" };
  if (taskType === "teaching-diagram") return { border: "border-teal-200", bg: "bg-teal-50", text: "text-teal-600", badge: "bg-teal-50 text-teal-700" };
  return { border: "border-sky-200", bg: "bg-sky-50", text: "text-sky-600", badge: "bg-sky-50 text-sky-700" };
}

function enrichTaskCardWithAttachment(
  taskCard: NonNullable<ChatMessageType["taskCard"]>,
  attachment?: ChatAttachment
): NonNullable<ChatMessageType["taskCard"]> {
  if (!attachment) return taskCard;
  return {
    ...taskCard,
    downloadUrl: taskCard.downloadUrl || attachment.downloadUrl || attachment.url || null,
    title: taskCard.title || attachment.name
  };
}

function getTaskCardActionLabels(taskType: NonNullable<ChatMessageType["taskCard"]>["taskType"]) {
  if (taskType === "ppt") return { downloadLabel: "下载 PPT", openLabel: "打开任务" };
  if (taskType === "word") return { downloadLabel: "下载 Word", openLabel: "打开任务" };
  if (taskType === "excel") return { downloadLabel: "下载 Excel", openLabel: "打开任务" };
  if (taskType === "image") return { downloadLabel: "下载图片", openLabel: "打开图片任务" };
  if (taskType === "teaching-diagram") return { downloadLabel: "下载图片", openLabel: "打开工具页" };
  if (taskType === "knowledge-graph") return { downloadLabel: "下载结果", openLabel: "打开工具页" };
  return { downloadLabel: "下载结果", openLabel: "打开任务" };
}

function isInternalTaskPollUrl(url: string) {
  return /^\/api\/ai\/chat\/tasks\//.test(url);
}

function isInlineFileAnalysisTaskCard(taskCard: NonNullable<ChatMessageType["taskCard"]>) {
  return taskCard.taskType === "file-analysis";
}

function sanitizeTaskFailureReason(reason?: string | null) {
  if (!reason) return "";
  if (/provider|model|stack|trace|api[_ -]?key|agentRuntime|routeReason|SyntaxError|TypeError|Error:/i.test(reason)) {
    return "生成失败，请稍后重试。";
  }
  if (/^\s*[{[]/.test(reason)) return "生成失败，请稍后重试。";
  return reason.replace(/\s+/g, " ").trim().slice(0, 120);
}

function UploadedImageCard({
  attachment,
  onPreviewAttachment
}: {
  attachment: ChatAttachment;
  onPreviewAttachment: (attachment: ChatAttachment) => void;
}) {
  const imageSrc = attachment.previewUrl || attachment.url;
  if (!imageSrc) return null;

  return (
    <div className="w-full max-w-[520px]">
      <div className="group relative overflow-hidden rounded-[28px] bg-[var(--color-soft)] shadow-[0_18px_44px_rgba(15,23,42,0.12)]">
        <button
          type="button"
          onClick={() => onPreviewAttachment(attachment)}
          className="block w-full overflow-hidden rounded-[28px]"
          aria-label={`放大查看 ${attachment.name}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={attachment.name}
            className="block max-h-[420px] w-full object-cover transition duration-300 group-hover:scale-[1.015]"
          />
        </button>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/42 via-black/10 to-transparent p-3 opacity-0 transition duration-200 group-hover:opacity-100">
          <span className="max-w-[72%] truncate rounded-full bg-white/90 px-3 py-1 text-xs text-black shadow-sm">
            {attachment.name}
          </span>
          {attachment.url ? (
            <button
              type="button"
              onClick={() => downloadImage(attachment.url || imageSrc, attachment.name)}
              className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-white text-black shadow-sm transition hover:bg-white/90"
              aria-label="下载图片"
            >
              <Download className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function downloadImage(src: string, filename: string) {
  const link = document.createElement("a");
  link.href = src;
  link.download = filename;
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

type GeneratedFileKind = "word" | "excel" | "ppt" | "pdf" | "image" | "teaching-diagram" | "knowledge-graph" | "other";

function GeneratedFileCard({
  taskCard,
  createdAt
}: {
  taskCard: NonNullable<ChatMessageType["taskCard"]>;
  createdAt: string;
}) {
  const fileKind = getGeneratedFileKind(taskCard);
  const visual = getGeneratedCardVisual(fileKind, taskCard.status === "failed");
  const isRunning = taskCard.status === "queued" || taskCard.status === "running";
  const isCompleted = taskCard.status === "completed";
  const isFailed = taskCard.status === "failed";
  const downloadUrl = isCompleted ? taskCard.downloadUrl || null : null;
  const title = getGeneratedCardTitle(taskCard);
  const meta = `${visual.typeLabel} / ${createdAt}`;
  const className = cn(
    "group/generated relative mt-4 flex h-32 w-full max-w-[560px] items-center overflow-hidden rounded-[24px] border border-[color:var(--color-border)] bg-[var(--color-panel)] px-6 py-5 text-left no-underline shadow-[0_18px_46px_rgba(15,23,42,0.10)] transition duration-200 ease-out sm:w-[560px]",
    downloadUrl
      ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_26px_68px_rgba(15,23,42,0.16)]"
      : "cursor-not-allowed opacity-82",
    downloadUrl ? visual.hover : null
  );
  const content = (
    <>
      <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[24px]">
        <span className={cn("absolute -left-10 -top-12 h-40 w-52 rounded-[42%] opacity-45 blur-sm transition duration-200 group-hover/generated:translate-x-1 group-hover/generated:scale-105", visual.wash)} />
        <span className={cn("absolute -bottom-12 left-8 h-28 w-48 rounded-[55%] opacity-28 transition duration-200 group-hover/generated:-translate-y-1", visual.wash)} />
        <span className="absolute right-16 top-9 grid gap-2 opacity-55 transition duration-200 group-hover/generated:-translate-x-1">
          <span className={cn("h-2 w-28 rounded-full", visual.line)} />
          <span className={cn("h-2 w-20 rounded-full", visual.line)} />
          <span className={cn("h-2 w-14 rounded-full", visual.line)} />
        </span>
      </span>
      <span className={cn("relative z-10 grid h-[76px] w-[76px] shrink-0 place-items-center rounded-[18px] text-white shadow-sm transition duration-200 group-hover/generated:-translate-y-0.5 group-hover/generated:scale-[1.03]", visual.icon)}>
        {isRunning ? <Loader2 className="h-7 w-7 animate-spin text-white" /> : <span className={cn("font-extrabold leading-none !text-white", visual.label.length > 1 ? "text-[19px]" : "text-[36px]")}>{visual.label}</span>}
      </span>
      <span className="relative z-10 ml-5 min-w-0 flex-1 pr-12">
        <span className="block truncate text-[15px] font-semibold leading-6 text-[var(--color-text)]">{title}</span>
        <span className="mt-2 block truncate text-xs text-[var(--color-text-muted)]">{meta}</span>
      </span>
      {downloadUrl ? (
        <span className="absolute bottom-4 right-4 z-10 grid h-9 w-9 translate-y-1 place-items-center rounded-full border border-[color:var(--color-border)] bg-[color-mix(in_srgb,var(--color-panel)_88%,transparent)] text-[var(--color-text)] opacity-0 shadow-sm backdrop-blur transition duration-200 group-hover/generated:translate-y-0 group-hover/generated:opacity-100">
          <Download className="h-4 w-4" />
        </span>
      ) : null}
      {isFailed ? (
        <span className="absolute bottom-4 right-4 z-10 rounded-full border border-red-200 bg-[color-mix(in_srgb,#ef4444_8%,var(--color-panel))] px-2.5 py-1 text-xs text-red-600">
          失败
        </span>
      ) : null}
      {!downloadUrl && isRunning ? (
        <span className="absolute bottom-4 right-4 z-10 grid h-9 w-9 place-items-center rounded-full border border-[color:var(--color-border)] bg-[color-mix(in_srgb,var(--color-panel)_88%,transparent)] text-[var(--color-text-muted)] shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
      ) : null}
    </>
  );

  if (downloadUrl) {
    return (
      <a href={downloadUrl} className={className} title={title}>
        {content}
      </a>
    );
  }

  return (
    <div className={className} title={title} aria-disabled="true">
      {content}
    </div>
  );
}

function getGeneratedCardTitle(taskCard: NonNullable<ChatMessageType["taskCard"]>) {
  const preferred = taskCard.description || taskCard.title;
  return preferred.replace(/\s+/g, " ").trim() || taskCard.title;
}

function shouldShowDeepWritingResumeButton(taskCard: NonNullable<ChatMessageType["taskCard"]>) {
  if (!shouldShowDeepWritingProcessButton(taskCard)) return false;
  if (taskCard.status === "completed" || taskCard.documentReady) return false;
  return taskCard.currentStage === "interrupted" || taskCard.deepWritingPanelState?.canResume === true;
}

function getGeneratedCardVisual(fileKind: GeneratedFileKind, failed: boolean) {
  if (failed) {
    return {
      label: "!",
      typeLabel: "生成文件",
      hover: "hover:border-[color:var(--color-border-strong)] hover:bg-[color-mix(in_srgb,#ef4444_6%,var(--color-panel))]",
      icon: "bg-gradient-to-br from-red-400 via-red-500 to-red-700",
      wash: "bg-red-200/55",
      line: "bg-red-200/60"
    };
  }
  if (fileKind === "excel") {
    return {
      label: "X",
      typeLabel: "Excel 表格",
      hover: "hover:border-[color:var(--color-border-strong)] hover:bg-[color-mix(in_srgb,#10b981_6%,var(--color-panel))]",
      icon: "bg-gradient-to-br from-emerald-400 via-emerald-600 to-green-800",
      wash: "bg-emerald-200/55",
      line: "bg-emerald-200/60"
    };
  }
  if (fileKind === "ppt") {
    return {
      label: "P",
      typeLabel: "PPT 演示文稿",
      hover: "hover:border-[color:var(--color-border-strong)] hover:bg-[color-mix(in_srgb,#f97316_6%,var(--color-panel))]",
      icon: "bg-gradient-to-br from-orange-400 via-orange-600 to-red-600",
      wash: "bg-orange-200/55",
      line: "bg-orange-200/60"
    };
  }
  if (fileKind === "pdf") {
    return {
      label: "PDF",
      typeLabel: "PDF 文档",
      hover: "hover:border-[color:var(--color-border-strong)] hover:bg-[color-mix(in_srgb,#ef4444_6%,var(--color-panel))]",
      icon: "bg-gradient-to-br from-red-400 via-red-500 to-red-700",
      wash: "bg-red-200/55",
      line: "bg-red-200/60"
    };
  }
  if (fileKind === "word") {
    return {
      label: "W",
      typeLabel: "Word 文档",
      hover: "hover:border-[color:var(--color-border-strong)] hover:bg-[color-mix(in_srgb,#2563eb_6%,var(--color-panel))]",
      icon: "bg-gradient-to-br from-blue-400 via-blue-600 to-blue-800",
      wash: "bg-blue-200/55",
      line: "bg-blue-200/60"
    };
  }
  return {
    label: fileKind === "image" ? "IMG" : "AI",
    typeLabel: "生成结果",
    hover: "hover:border-[color:var(--color-border-strong)] hover:bg-[var(--color-hover)]",
    icon: "bg-gradient-to-br from-sky-400 via-blue-600 to-indigo-700",
    wash: "bg-sky-200/45",
    line: "bg-sky-200/50"
  };
}

function GeneratedTaskFileCard({ taskCard }: { taskCard: NonNullable<ChatMessageType["taskCard"]> }) {
  const fileKind = getGeneratedFileKind(taskCard);
  const visual = getGeneratedFileVisual(fileKind, taskCard.status === "failed");
  const isRunning = taskCard.status === "queued" || taskCard.status === "running";
  const isCompleted = taskCard.status === "completed";
  const isFailed = taskCard.status === "failed";
  const statusLabel = isCompleted ? "已完成" : isFailed ? "生成失败" : taskCard.status === "queued" ? "正在创建任务" : "正在生成";
  const failureReason = sanitizeTaskFailureReason(taskCard.failureReason);
  const { downloadLabel, openLabel } = getTaskCardActionLabels(taskCard.taskType);
  const openUrl = taskCard.openUrl && !isInternalTaskPollUrl(taskCard.openUrl) ? taskCard.openUrl : null;
  const primaryUrl = isCompleted && taskCard.downloadUrl ? taskCard.downloadUrl : openUrl;
  const actionLabel = taskCard.downloadUrl ? downloadLabel : openLabel;
  const disabledHint = isFailed ? "可稍后重试" : "生成完成后可下载";
  const subtitle = isFailed && failureReason ? failureReason : taskCard.description || (primaryUrl ? "点击卡片下载" : disabledHint);
  const baseClass = cn(
    "group/generated mt-4 flex w-full max-w-[420px] items-center gap-3 rounded-2xl border bg-[var(--color-panel)] p-3 text-left no-underline shadow-[0_12px_34px_rgba(15,23,42,0.08)] transition duration-200 ease-out",
    primaryUrl
      ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(15,23,42,0.12)]"
      : "cursor-not-allowed opacity-80",
    visual.border,
    primaryUrl ? visual.hover : null
  );
  const body = (
    <>
      <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white shadow-sm transition duration-200 group-hover/generated:-translate-y-0.5", visual.icon)}>
        {isRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className={cn("font-black leading-none", visual.label.length > 1 ? "text-sm" : "text-[22px]")}>{visual.label}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-[var(--color-text)]">{taskCard.title}</span>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", visual.badge)}>{statusLabel}</span>
        </span>
        <span className="mt-1 block truncate text-xs text-[var(--color-text-muted)]">{subtitle}</span>
        <span className="mt-2 flex items-center gap-2">
          <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition duration-200", visual.action)}>
            {primaryUrl ? <Download className="h-3.5 w-3.5" /> : <Loader2 className={cn("h-3.5 w-3.5", isRunning && "animate-spin")} />}
            {primaryUrl ? actionLabel : disabledHint}
          </span>
          {primaryUrl ? <span className="hidden text-xs text-[var(--color-text-faint)] sm:inline">点击卡片下载</span> : null}
        </span>
      </span>
    </>
  );

  if (primaryUrl) {
    return (
      <a href={primaryUrl} className={baseClass} title={`${actionLabel}: ${taskCard.description || taskCard.title}`}>
        {body}
      </a>
    );
  }

  return (
    <div className={baseClass} title={disabledHint} aria-disabled="true">
      {body}
    </div>
  );
}

function getGeneratedFileKind(taskCard: NonNullable<ChatMessageType["taskCard"]>): GeneratedFileKind {
  const source = `${taskCard.title || ""} ${taskCard.description || ""} ${taskCard.downloadUrl || ""}`.toLowerCase();
  if (taskCard.taskType === "word" || /\.(docx?|doc)(?:$|[?#])/.test(source)) return "word";
  if (taskCard.taskType === "excel" || /\.(xlsx?|csv)(?:$|[?#])/.test(source)) return "excel";
  if (taskCard.taskType === "ppt" || /\.(pptx?|ppt)(?:$|[?#])/.test(source)) return "ppt";
  if (/\.pdf(?:$|[?#])/.test(source)) return "pdf";
  if (taskCard.taskType === "image") return "image";
  if (taskCard.taskType === "teaching-diagram") return "teaching-diagram";
  if (taskCard.taskType === "knowledge-graph") return "knowledge-graph";
  return "other";
}

function getGeneratedFileVisual(fileKind: GeneratedFileKind, failed: boolean) {
  if (failed) {
    return {
      label: "!",
      border: "border-red-200",
      hover: "hover:border-red-300 hover:bg-[color-mix(in_srgb,#ef4444_8%,var(--color-panel))]",
      icon: "bg-gradient-to-br from-red-400 via-red-500 to-red-700",
      badge: "bg-[color-mix(in_srgb,#ef4444_10%,var(--color-panel))] text-red-600",
      action: "border-red-200 bg-[color-mix(in_srgb,#ef4444_8%,var(--color-panel))] text-red-600"
    };
  }
  if (fileKind === "excel") {
    return {
      label: "X",
      border: "border-emerald-200",
      hover: "hover:border-emerald-300 hover:bg-[color-mix(in_srgb,#10b981_7%,var(--color-panel))]",
      icon: "bg-gradient-to-br from-emerald-400 via-emerald-600 to-green-800",
      badge: "bg-[color-mix(in_srgb,#10b981_10%,var(--color-panel))] text-emerald-600",
      action: "border-emerald-200 bg-[color-mix(in_srgb,#10b981_8%,var(--color-panel))] text-emerald-600"
    };
  }
  if (fileKind === "ppt") {
    return {
      label: "P",
      border: "border-orange-200",
      hover: "hover:border-orange-300 hover:bg-[color-mix(in_srgb,#f97316_7%,var(--color-panel))]",
      icon: "bg-gradient-to-br from-orange-400 via-orange-600 to-red-600",
      badge: "bg-[color-mix(in_srgb,#f97316_10%,var(--color-panel))] text-orange-600",
      action: "border-orange-200 bg-[color-mix(in_srgb,#f97316_8%,var(--color-panel))] text-orange-600"
    };
  }
  if (fileKind === "pdf") {
    return {
      label: "PDF",
      border: "border-red-200",
      hover: "hover:border-red-300 hover:bg-[color-mix(in_srgb,#ef4444_7%,var(--color-panel))]",
      icon: "bg-gradient-to-br from-red-400 via-red-500 to-red-700",
      badge: "bg-[color-mix(in_srgb,#ef4444_10%,var(--color-panel))] text-red-600",
      action: "border-red-200 bg-[color-mix(in_srgb,#ef4444_8%,var(--color-panel))] text-red-600"
    };
  }
  if (fileKind === "word") {
    return {
      label: "W",
      border: "border-blue-200",
      hover: "hover:border-blue-300 hover:bg-[color-mix(in_srgb,#2563eb_7%,var(--color-panel))]",
      icon: "bg-gradient-to-br from-blue-400 via-blue-600 to-blue-800",
      badge: "bg-[color-mix(in_srgb,#2563eb_10%,var(--color-panel))] text-blue-600",
      action: "border-blue-200 bg-[color-mix(in_srgb,#2563eb_8%,var(--color-panel))] text-blue-600"
    };
  }
  return {
    label: fileKind === "image" ? "IMG" : "AI",
    border: "border-[color:var(--color-border)]",
    hover: "hover:border-[color:var(--color-border-strong)] hover:bg-[var(--color-hover)]",
    icon: "bg-gradient-to-br from-sky-400 via-blue-600 to-indigo-700",
    badge: "bg-[var(--color-soft)] text-[var(--color-text)]",
    action: "border-[color:var(--color-border)] bg-[var(--color-soft)] text-[var(--color-text)]"
  };
}

function splitGeneratedDocumentContent(content: string, hasGeneratedWord: boolean) {
  if (!hasGeneratedWord) return [content, ""] as const;
  const marker = "\n\n---\n\n";
  const [lead, ...rest] = content.split(marker);
  return [lead.trim(), rest.join(marker).trim()] as const;
}

function isGeneratedFileAttachment(attachment: ChatAttachment) {
  const name = attachment.name.toLowerCase();
  return (
    attachment.kind === "word" ||
    attachment.kind === "pdf" ||
    attachment.kind === "spreadsheet" ||
    /\.(docx?|pptx?|xlsx?|csv|pdf)$/.test(name) ||
    /word|presentation|powerpoint|spreadsheet|pdf/.test((attachment.type || "").toLowerCase())
  );
}

function GeneratedWordCard({
  attachment,
  onOpenFile
}: {
  attachment: ChatAttachment;
  onOpenFile: (attachment: ChatAttachment) => void;
}) {
  const visual = getAttachmentVisual(attachment);
  const typeLabel = getAttachmentTypeLabel(attachment);

  return (
    <button
      type="button"
      onClick={() => onOpenFile(attachment)}
      className="group/doc relative flex h-[146px] w-full max-w-[560px] overflow-hidden rounded-[28px] border border-white/80 bg-white/90 text-left shadow-[0_20px_58px_rgba(15,23,42,0.1)] backdrop-blur transition duration-300 ease-out hover:-translate-y-1.5 hover:scale-[1.012] hover:rotate-[0.18deg] hover:border-white hover:shadow-[0_30px_80px_rgba(15,23,42,0.16)]"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]">
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.82),rgba(255,255,255,0.46)_48%,rgba(255,255,255,0.76))]" />
        <div className="absolute -bottom-8 -right-8 h-32 w-56 rounded-[55%] bg-blue-200/38 transition duration-300 group-hover/doc:translate-x-2 group-hover/doc:-translate-y-2" />
        <div className="absolute right-10 top-10 grid gap-2 opacity-40 transition duration-300 group-hover/doc:-translate-x-1">
          <span className="h-2 w-28 rounded-full bg-blue-300" />
          <span className="h-2 w-20 rounded-full bg-blue-300" />
          <span className="h-2 w-14 rounded-full bg-blue-300" />
        </div>
      </div>
      <div className="relative z-10 flex h-full w-full items-center gap-5 px-5">
        <div className="grid h-[76px] w-[76px] shrink-0 place-items-center transition duration-300 group-hover/doc:-translate-y-1 group-hover/doc:rotate-[-5deg] group-hover/doc:scale-105">
          <AttachmentIcon visual={visual} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-[var(--color-text)]">{stripDocx(attachment.name)}</p>
          <p className="mt-1.5 text-xs text-[var(--color-text-faint)]">{typeLabel} / {attachment.uploadedAt}</p>
          <div className="mt-4 flex items-center gap-2 opacity-0 transition duration-200 group-hover/doc:opacity-100">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-xs text-[var(--color-text)] shadow-sm">
              <ExternalLink className="h-3.5 w-3.5" />
              打开
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-[var(--color-text)] shadow-sm">
              <Download className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function PendingFileGenerationCard({
  pending
}: {
  pending: NonNullable<ChatMessageType["pendingFileGeneration"]>;
}) {
  const isPpt = pending.kind === "ppt";
  const isFailed = pending.status === "failed";
  const pendingLabel = isPpt ? "Nexus AI 正在生成 PPT" : "Nexus AI 正在生成 Word 文档";
  const attachment: ChatAttachment = {
    id: `pending-${pending.kind}`,
    name: pending.fileName,
    type: isPpt ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: 0,
    kind: isPpt ? "file" : "word",
    uploadedAt: "",
    status: "仅前端展示"
  };
  const visual = getAttachmentVisual(attachment);

  return (
    <div
      className={cn(
        "group/doc relative mt-4 flex h-[146px] w-full max-w-[560px] overflow-hidden rounded-[28px] border bg-white/90 text-left shadow-[0_20px_58px_rgba(15,23,42,0.1)] backdrop-blur",
        isFailed
          ? "border-red-200/80"
          : isPpt
          ? "border-orange-200/80 animate-[pending-ppt-glow_1.55s_ease-in-out_infinite]"
          : "border-blue-200/80 animate-[pending-word-glow_1.55s_ease-in-out_infinite]"
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]">
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.84),rgba(255,255,255,0.48)_48%,rgba(255,255,255,0.78))]" />
        <div
          className={cn(
            "absolute -bottom-8 -right-8 h-32 w-56 rounded-[55%] transition duration-300",
            isPpt ? "bg-orange-200/42" : "bg-blue-200/42"
          )}
        />
        <div className="absolute right-10 top-10 grid gap-2 opacity-45">
          <span className={cn("h-2 w-28 rounded-full", isPpt ? "bg-orange-300" : "bg-blue-300")} />
          <span className={cn("h-2 w-20 rounded-full", isPpt ? "bg-orange-300" : "bg-blue-300")} />
          <span className={cn("h-2 w-14 rounded-full", isPpt ? "bg-orange-300" : "bg-blue-300")} />
        </div>
        <div className="absolute inset-y-[-20%] left-[-45%] w-1/2 rotate-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.62),transparent)] blur-sm animate-[image-card-sheen_1.35s_ease-in-out_infinite]" />
      </div>
      <div className="relative z-10 flex h-full w-full items-center gap-5 px-5">
        <div className="grid h-[76px] w-[76px] shrink-0 place-items-center">
          <AttachmentIcon visual={visual} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-[var(--color-text)]">{pending.fileName}</p>
          <p className="mt-1.5 inline-flex items-center gap-2 text-xs text-[var(--color-text-faint)]">
            {isFailed ? null : <Loader2 className={cn("h-3.5 w-3.5 animate-spin", isPpt ? "text-orange-500" : "text-blue-500")} />}
            {isFailed ? "生成失败，请重新输入后重试。" : pendingLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

function PendingAgentTaskCard({
  pending
}: {
  pending: NonNullable<ChatMessageType["pendingAgentTask"]>;
}) {
  const isFailed = pending.status === "failed";
  const activityLabel = getNexusActivityLabel(pending.label);

  return (
    <div
      className={cn(
        "mt-4 w-full max-w-[520px] rounded-2xl border bg-white/90 px-4 py-3 shadow-sm backdrop-blur",
        isFailed ? "border-red-200 text-red-700" : "border-[color:var(--color-border)] text-[var(--color-text)]"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full",
            isFailed ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-600"
          )}
        >
          {isFailed ? <Sparkles className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{activityLabel}</p>
          <p className={cn("mt-1 text-xs leading-5", isFailed ? "text-red-600/80" : "text-[var(--color-text-muted)]")}>
            {isFailed ? "生成失败，请重新输入后重试。" : `${activityLabel}，完成后会自动返回。`}
          </p>
        </div>
      </div>
    </div>
  );
}

function getNexusActivityLabel(label?: string) {
  const normalized = label || "";
  if (/联网|搜索|检索|web/i.test(normalized)) return "Nexus AI 正在联网搜索";
  if (/文件|附件|解析|理解/i.test(normalized)) return "Nexus AI 正在理解文件";
  if (/生成|Word|PPT|Excel|图片|图像/i.test(normalized)) return "Nexus AI 正在生成";
  return "Nexus AI 正在思考";
}

function stripDocx(name: string) {
  return name.replace(/\.(docx|pptx|xlsx)$/i, "");
}
