"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, FileText, Globe2, ImageIcon, Loader2, Search, Sparkles } from "lucide-react";

import { ChatAttachment, ChatMessage as ChatMessageType } from "@/components/chat/chat-data";
import { ChatMessage } from "@/components/chat/chat-message";
import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

type ChatImageGenerationMeta = NonNullable<ChatMessageType["imageGeneration"]>;

export function ChatThread({
  messages,
  loading,
  loadingLabel = "Nexus AI 正在思考",
  runtimeStatusSteps = [],
  agentDebugTrace,
  onPreviewAttachment,
  onOpenFile,
  onRetryImageGeneration,
  onOpenWebContext,
  onOpenDeepWritingPanel
}: {
  messages: ChatMessageType[];
  loading: boolean;
  loadingLabel?: string;
  runtimeStatusSteps?: string[];
  agentDebugTrace?: {
    intent?: string;
    targetTool?: string;
    confidence?: number;
    nextAction?: string;
    adapterId?: string | null;
    missingInputs?: string[];
    activeTaskId?: string | null;
    activeTaskKind?: string | null;
    activeTaskTitle?: string | null;
    sessionPreferences?: string[];
    memoryHints?: string[];
  } | null;
  onPreviewAttachment: (attachment: ChatAttachment) => void;
  onOpenFile: (attachment: ChatAttachment) => void;
  onRetryImageGeneration?: (imageGeneration: ChatImageGenerationMeta) => void;
  onOpenWebContext?: (webContext: NonNullable<ChatMessageType["webContext"]>) => void;
  onOpenDeepWritingPanel?: (taskCard: NonNullable<ChatMessageType["taskCard"]>) => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const autoFollowRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const [showJumpButton, setShowJumpButton] = useState(false);

  const isNearBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight < 140;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth", force = false) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (!force && !autoFollowRef.current) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
    if (force) {
      autoFollowRef.current = true;
      setShowJumpButton(false);
    }
  }, []);

  useEffect(() => {
    if (!initialScrollDoneRef.current) return;
    scrollToBottom("smooth");
  }, [messages, loading, scrollToBottom]);

  useLayoutEffect(() => {
    if (initialScrollDoneRef.current) return;
    requestAnimationFrame(() => {
      scrollToBottom("auto", true);
      initialScrollDoneRef.current = true;
    });
  }, [scrollToBottom]);

  const handleRevealTick = useCallback(() => {
    requestAnimationFrame(() => scrollToBottom("auto"));
  }, [scrollToBottom]);

  const handleScroll = useCallback(() => {
    const nearBottom = isNearBottom();
    autoFollowRef.current = nearBottom;
    setShowJumpButton(!nearBottom);
  }, [isNearBottom]);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollContainerRef} onScroll={handleScroll} className="h-full overflow-y-auto px-4 py-6 pb-44 md:px-10">
        <div className="mx-auto grid w-full max-w-5xl gap-5">
          {messages.map((message) => (
            <ChatMessage
              key={message.clientKey || message.id}
              message={message}
              onPreviewAttachment={onPreviewAttachment}
              onOpenFile={onOpenFile}
              onRetryImageGeneration={onRetryImageGeneration}
              onOpenWebContext={onOpenWebContext}
              onOpenDeepWritingPanel={onOpenDeepWritingPanel}
              onRevealTick={handleRevealTick}
            />
          ))}
          {loading ? <ThinkingStatus label={loadingLabel} runtimeStatusSteps={runtimeStatusSteps} agentDebugTrace={agentDebugTrace} /> : null}
          <div ref={endRef} />
        </div>
      </div>
      {showJumpButton ? (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth", true)}
          className="absolute bottom-36 right-5 z-20 inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[var(--color-panel)]/94 px-3 py-2 text-xs font-medium text-[var(--color-text)] shadow-[0_14px_38px_rgba(15,23,42,0.16)] backdrop-blur transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-600 md:right-10"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          到最新消息
        </button>
      ) : null}
    </div>
  );
}

type ThinkingMode = "search" | "image" | "file" | "createImage" | "default";

function getThinkingMode(label: string): ThinkingMode {
  if (/搜索|联网|网页|来源/.test(label)) return "search";
  if (/理解图片|图片内容|OCR/.test(label)) return "image";
  if (/创建图像|图像任务|生成图片/.test(label)) return "createImage";
  if (/解析文件|文件|文档|PPT|Word/.test(label)) return "file";
  return "default";
}

function getThinkingDetails(mode: ThinkingMode) {
  if (mode === "search") {
    return ["正在检索公开网页资料", "正在筛选可靠来源并压缩关键信息", "正在把资料融入回答上下文"];
  }
  if (mode === "image") {
    return ["正在识别图片中的文字与画面结构", "正在提取可用于回答的关键线索", "正在整理图片内容摘要"];
  }
  if (mode === "createImage") {
    return ["正在理解画面需求并补全提示词", "正在判断更合适的构图比例", "正在创建图像生成任务"];
  }
  if (mode === "file") {
    return ["正在读取附件内容", "正在提取重点并建立上下文", "正在组织更清晰的回答"];
  }
  return ["正在理解你的问题", "正在整理上下文与回答结构", "正在生成最终回复"];
}

function ThinkingStatus({
  label,
  runtimeStatusSteps,
  agentDebugTrace
}: {
  label: string;
  runtimeStatusSteps?: string[];
  agentDebugTrace?: {
    intent?: string;
    targetTool?: string;
    confidence?: number;
    nextAction?: string;
    adapterId?: string | null;
    missingInputs?: string[];
    activeTaskId?: string | null;
    activeTaskKind?: string | null;
    activeTaskTitle?: string | null;
    sessionPreferences?: string[];
    memoryHints?: string[];
  } | null;
}) {
  const mode = getThinkingMode(label);
  const details = useMemo(() => {
    const cleaned = (runtimeStatusSteps || []).map((item) => item.trim()).filter(Boolean);
    return cleaned.length ? cleaned : getThinkingDetails(mode);
  }, [mode, runtimeStatusSteps]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % details.length);
    }, 2100);
    return () => window.clearInterval(timer);
  }, [details]);

  const Icon = mode === "search" ? Globe2 : mode === "image" || mode === "createImage" ? ImageIcon : mode === "file" ? FileText : Sparkles;
  const detail = details[activeIndex] || details[0];
  const nextDetail = details[(activeIndex + 1) % details.length] || "";
  const isSearching = mode === "search";

  return (
    <div className="flex gap-3">
      <div className="mt-1 shrink-0">
        <BrandLogo showText={false} className="gap-0" />
      </div>
      <div className="min-w-0 pt-1">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--color-text-muted)]">
          <span
            className={cn(
              "grid h-6 w-6 place-items-center rounded-full border",
              isSearching
                ? "border-blue-200 bg-blue-50 text-blue-600"
                : "border-[color:var(--color-border)] bg-[var(--color-soft)] text-[var(--color-text-muted)]"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="font-medium text-[var(--color-text)]">{label}</span>
          {isSearching ? <Search className="h-3.5 w-3.5 text-blue-500" /> : null}
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-text-faint)]" />
        </div>
        <div className="mt-2 grid max-w-md gap-0.5 pl-8 text-[11px] leading-5 text-[var(--color-text-faint)]">
          <p key={`${mode}-${activeIndex}-main`} className="truncate animate-[thinking-line-in_360ms_ease-out]">
            {detail}
          </p>
          <p key={`${mode}-${activeIndex}-next`} className="truncate opacity-70 animate-[thinking-line-in_360ms_ease-out]">
            {nextDetail}
          </p>
        </div>
        <div className="mt-2 flex items-center gap-1.5 pl-8" aria-hidden="true">
          {details.map((_, index) => (
            <span
              key={index}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                index === activeIndex ? "w-4 bg-blue-400" : "w-1.5 bg-blue-200"
              )}
            />
          ))}
        </div>
        {agentDebugTrace ? (
          <div className="mt-2 max-w-md rounded-md border border-dashed border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 py-2 text-[11px] leading-5 text-[var(--color-text-muted)]">
            <div>
              debug: {agentDebugTrace.intent || "unknown"} / {agentDebugTrace.targetTool || "none"} / {agentDebugTrace.nextAction || "pending"}
            </div>
            {agentDebugTrace.activeTaskKind ? (
              <div>
                当前识别任务：{agentDebugTrace.activeTaskKind}
                {agentDebugTrace.activeTaskTitle ? ` / ${agentDebugTrace.activeTaskTitle}` : ""}
              </div>
            ) : null}
            {agentDebugTrace.sessionPreferences?.length ? <div>当前偏好：{agentDebugTrace.sessionPreferences.join(", ")}</div> : null}
            {agentDebugTrace.memoryHints?.length ? <div>记忆提示：{agentDebugTrace.memoryHints.slice(0, 2).join(" | ")}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
