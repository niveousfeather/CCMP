"use client";

import { ChevronDown, Paperclip, SendHorizontal, Sparkles, X } from "lucide-react";
import { ChangeEvent, DragEvent, KeyboardEvent, useMemo, useRef, useState } from "react";

import { ChatAttachment } from "@/components/chat/chat-data";
import { ChatAttachmentCard } from "@/components/chat/chat-attachment-card";
import {
  TEACHING_ARCHITECTURE_ACCEPT,
  teachingArchitectureDiagramOptions
} from "@/components/smart-tools/teaching-architecture-diagram/teaching-architecture-options";
import { Button } from "@/components/ui/button";
import type { TeachingArchitectureDiagramType } from "@/lib/smart-tools/teaching-architecture-diagram/types";
import { cn } from "@/lib/utils";

export function TeachingArchitecturePromptBar({
  canStart,
  diagramType,
  disabled,
  file,
  mode = "create",
  textPrompt,
  onClearText,
  onDiagramTypeChange,
  onFileChange,
  onStart,
  onTextChange
}: {
  canStart: boolean;
  diagramType: TeachingArchitectureDiagramType;
  disabled: boolean;
  file: File | null;
  mode?: "create" | "revise";
  textPrompt: string;
  onClearText: () => void;
  onDiagramTypeChange: (type: TeachingArchitectureDiagramType) => void;
  onFileChange: (file: File | null) => void;
  onStart: () => void;
  onTextChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const hasText = textPrompt.trim().length > 0;
  const hasFile = Boolean(file);
  const isRevisionMode = mode === "revise";
  const fileAttachment = useMemo(() => (file ? createLocalAttachment(file) : null), [file]);

  function selectFile(nextFile: File | undefined) {
    if (!nextFile || disabled || hasText || isRevisionMode) return;
    onFileChange(nextFile);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.ctrlKey) return;
    event.preventDefault();
    if (canStart) onStart();
  }

  return (
    <form
      className="pointer-events-none fixed bottom-4 left-0 right-0 z-30 flex justify-center px-4 md:bottom-5 lg:left-56"
      onSubmit={(event) => {
        event.preventDefault();
        if (canStart) onStart();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled && !hasText && !isRevisionMode) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (isRevisionMode) return;
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={isRevisionMode ? undefined : handleDrop}
    >
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept={TEACHING_ARCHITECTURE_ACCEPT}
        disabled={disabled || hasText || isRevisionMode}
        onChange={handleFileChange}
      />
      <div
        className={cn(
          "pointer-events-auto w-full max-w-[980px] rounded-[20px] border border-slate-200 bg-white/96 p-2 shadow-[0_22px_70px_rgba(15,23,42,0.18)] backdrop-blur md:p-2.5",
          dragging && "border-blue-300 bg-blue-50/95 shadow-[0_22px_80px_rgba(37,99,235,0.2)]"
        )}
      >
        {fileAttachment ? (
          <div className="mb-2 w-[min(100%,360px)]">
            <ChatAttachmentCard attachment={fileAttachment} compact dense onRemove={() => onFileChange(null)} />
          </div>
        ) : null}

        <textarea
          className="min-h-10 max-h-24 w-full resize-none rounded-2xl border-0 bg-transparent px-3 py-1.5 text-[15px] leading-7 text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled || (hasFile && !isRevisionMode)}
          placeholder={
            isRevisionMode
              ? "输入图片修改说明，例如：把标题改成“数字赋能课程教学改革模型”，保持整体架构图风格..."
              : hasFile
                ? "已导入文件，移除后可输入文字..."
                : "输入教学改革材料，生成架构图..."
          }
          rows={1}
          value={textPrompt}
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={handleTextareaKeyDown}
        />

        <div className="mt-1 flex items-end justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 shrink-0"
              disabled={disabled || hasText || isRevisionMode}
              title={hasText ? "清空文字后可上传文件" : "上传文件"}
              onClick={() => inputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            {hasText ? (
              <Button type="button" size="sm" variant="ghost" className="h-9 shrink-0" disabled={disabled} onClick={onClearText}>
                <X className="h-4 w-4" />
                清空
              </Button>
            ) : null}
            <span className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-white px-3 text-sm text-blue-700 shadow-sm">
              <Sparkles className="h-4 w-4" />
              {isRevisionMode ? "图片修改" : "Agent模式"}
            </span>
            <label className={cn("relative h-9 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 pl-3 pr-2 text-sm text-slate-800 transition hover:border-slate-300", isRevisionMode ? "hidden" : "inline-flex")}>
              <select
                className="max-w-[190px] appearance-none bg-transparent pr-6 text-sm outline-none disabled:cursor-not-allowed"
                disabled={disabled}
                value={diagramType}
                onChange={(event) => onDiagramTypeChange(event.target.value as TeachingArchitectureDiagramType)}
              >
                {teachingArchitectureDiagramOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-slate-500" />
            </label>
          </div>

          <Button type="submit" size="icon" variant="primary" className="h-10 w-10 shrink-0 rounded-xl" disabled={!canStart}>
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </div>

        {!fileAttachment && !hasText ? (
          <p className="px-3 pt-0.5 text-xs text-slate-500">
            {isRevisionMode ? "图片会根据当前 output.png 和修改说明重新调用生图，不再进入 SVG 文字编辑。" : "支持拖拽上传 TXT / MD / DOCX / PDF / PPTX"}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function createLocalAttachment(file: File): ChatAttachment {
  return {
    id: `teaching-architecture-${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    kind: getAttachmentKind(file),
    file,
    uploadedAt: "刚刚",
    status: "仅前端展示"
  };
}

function getAttachmentKind(file: File): ChatAttachment["kind"] {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (type.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (type.includes("word") || name.endsWith(".doc") || name.endsWith(".docx")) return "word";
  if (type.includes("presentation") || name.endsWith(".ppt") || name.endsWith(".pptx")) return "file";
  if (type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".markdown")) return "text";
  return "file";
}
