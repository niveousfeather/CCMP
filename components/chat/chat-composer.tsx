"use client";

import { FilePenLine, Globe2, ImageIcon, Paperclip, Plus, Presentation, SendHorizontal, Sparkles, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useRef, useState } from "react";

import { ChatAttachment } from "@/components/chat/chat-data";
import { ChatAttachmentCard } from "@/components/chat/chat-attachment-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AgentToolId = "web" | "write" | "ppt" | "image";
export type ContentToolId = Exclude<AgentToolId, "web">;

const toolPrompts: Record<AgentToolId, string> = {
  web: "请先联网搜索并参考最新资料回答：",
  write: "请作为写作助手，帮我完成：",
  ppt: "请作为 PPT 制作智能体，帮我生成一份演示文稿。主题是：",
  image: "请帮我生成一张图像，画面要求是："
};

const webTool = { id: "web" as const, label: "联网搜索", icon: Globe2 };

const contentTools: Array<{
  id: ContentToolId;
  label: string;
  icon: typeof Globe2;
}> = [
  { id: "write", label: "帮我写作", icon: FilePenLine },
  { id: "ppt", label: "PPT生成", icon: Presentation },
  { id: "image", label: "图像生成", icon: ImageIcon }
];

export function getToolPrompt(toolIds: AgentToolId[] = []) {
  return toolIds.map((toolId) => toolPrompts[toolId]).filter(Boolean).join("");
}

export function ChatComposer({
  value,
  loading,
  attachments,
  webSearchEnabled,
  selectedContentTool,
  placement = "bottom",
  onToggleWebSearch,
  onSelectContentTool,
  onChange,
  onSubmit,
  onAddFiles,
  onRemoveAttachment,
  onPreviewAttachment,
  onOpenFile
}: {
  value: string;
  loading: boolean;
  attachments: ChatAttachment[];
  webSearchEnabled: boolean;
  selectedContentTool: ContentToolId | null;
  placement?: "center" | "bottom";
  onToggleWebSearch: () => void;
  onSelectContentTool: (tool: ContentToolId | null) => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onPreviewAttachment: (attachment: ChatAttachment) => void;
  onOpenFile: (attachment: ChatAttachment) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") return;
    if (event.shiftKey || event.ctrlKey) return;
    event.preventDefault();
    if (!loading && (value.trim() || attachments.length)) onSubmit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "pointer-events-none absolute left-1/2 z-20 w-[min(100%-24px,980px)] -translate-x-1/2 sm:w-[min(100%-48px,980px)]",
        placement === "center" ? "top-1/2 -translate-y-[10%] sm:-translate-y-[16%]" : "bottom-4 sm:bottom-5"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.md,.doc,.docx,.xls,.xlsx,.csv,.mp4,.mov,.webm,.m4v,image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm,application/pdf,text/plain,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        onChange={(event) => {
          onAddFiles(Array.from(event.target.files || []));
          event.currentTarget.value = "";
        }}
      />

      <div className="pointer-events-auto w-full rounded-[20px] border border-[color:var(--color-border)] bg-[color-mix(in_srgb,var(--color-panel)_97%,transparent)] p-2.5 shadow-[0_18px_60px_rgba(15,23,42,0.16)] backdrop-blur sm:p-3">
        {attachments.length ? (
          <div className="mb-2 flex max-h-[92px] gap-2 overflow-x-auto overflow-y-hidden pb-1 sm:grid sm:max-h-[148px] sm:overflow-y-auto sm:pr-1">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="w-[172px] shrink-0 sm:w-auto">
                <ChatAttachmentCard
                  attachment={attachment}
                  compact
                  dense
                  onPreview={onPreviewAttachment}
                  onOpenFile={onOpenFile}
                  onRemove={() => onRemoveAttachment(attachment.id)}
                />
              </div>
            ))}
          </div>
        ) : null}

        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleTextareaKeyDown}
          placeholder="发消息..."
          rows={attachments.length && placement === "center" ? 1 : 2}
          className={cn(
            "w-full resize-none rounded-2xl border-0 bg-transparent px-3 py-2 text-[15px] leading-7 text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)]",
            attachments.length && placement === "center" ? "max-h-20 min-h-10" : "max-h-32 min-h-12 sm:max-h-40 sm:min-h-14"
          )}
        />

        {mobileToolsOpen ? (
          <div className="mb-2 grid gap-1.5 rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-panel)] p-1.5 shadow-soft sm:hidden">
            {contentTools.map((tool) => {
              const Icon = tool.icon;
              const active = selectedContentTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => {
                    onSelectContentTool(active ? null : tool.id);
                    setMobileToolsOpen(false);
                  }}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-xl px-3 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-hover)]",
                    active && "border border-blue-200 bg-gradient-to-r from-blue-50 to-white text-blue-700 shadow-sm"
                  )}
                  aria-pressed={active}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{tool.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="mt-1 flex items-end justify-between gap-2">
          <div className="grid min-w-0 flex-1 gap-1.5">
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-1">
              <Button type="button" variant="ghost" size="icon" aria-label="上传文件" onClick={() => inputRef.current?.click()} className="shrink-0">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={mobileToolsOpen ? "关闭功能菜单" : "打开功能菜单"}
                onClick={() => setMobileToolsOpen((current) => !current)}
                className={cn(
                  "shrink-0 sm:hidden",
                  selectedContentTool && "border border-blue-200 bg-gradient-to-r from-blue-50 to-white text-blue-700 shadow-sm"
                )}
              >
                {mobileToolsOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </Button>
              <button
                type="button"
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-white px-2.5 text-xs text-blue-700 shadow-sm sm:px-3 sm:text-sm"
                aria-pressed="true"
              >
                <Sparkles className="h-4 w-4" />
                Agent模式
              </button>
              <button
                type="button"
                onClick={onToggleWebSearch}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 text-xs text-[var(--color-text)] transition hover:bg-[var(--color-hover)] sm:px-3 sm:text-sm",
                  webSearchEnabled && "border border-blue-200 bg-gradient-to-r from-blue-50 to-white text-blue-700 shadow-sm"
                )}
                aria-pressed={webSearchEnabled}
              >
                <webTool.icon className="h-4 w-4" />
                {webTool.label}
              </button>
              <div className="hidden items-center gap-1.5 sm:flex">
                {contentTools.map((tool) => {
                  const Icon = tool.icon;
                  const active = selectedContentTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => onSelectContentTool(active ? null : tool.id)}
                      className={cn(
                        "inline-flex h-9 min-w-0 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs text-[var(--color-text)] transition hover:bg-[var(--color-hover)] sm:gap-2 sm:px-3 sm:text-sm",
                        active && "border border-blue-200 bg-gradient-to-r from-blue-50 to-white text-blue-700 shadow-sm"
                      )}
                      aria-pressed={active}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{tool.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="icon"
            disabled={loading || (!value.trim() && !attachments.length)}
            aria-label="发送消息"
            className="shrink-0"
          >
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </form>
  );
}
