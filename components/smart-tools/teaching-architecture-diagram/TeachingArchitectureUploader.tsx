"use client";

import { FileText, UploadCloud, X } from "lucide-react";
import { ChangeEvent, DragEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  TEACHING_ARCHITECTURE_ACCEPT,
  teachingArchitectureFileLabel
} from "@/components/smart-tools/teaching-architecture-diagram/teaching-architecture-options";
import { cn } from "@/lib/utils";

export function TeachingArchitectureUploader({
  disabled,
  disabledReason,
  file,
  removeDisabled,
  onFileChange
}: {
  disabled?: boolean;
  disabledReason?: string;
  file: File | null;
  removeDisabled?: boolean;
  onFileChange: (file: File | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function selectFile(nextFile: File | undefined) {
    if (!nextFile || disabled) return;
    onFileChange(nextFile);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0]);
  }

  return (
    <div className="grid gap-2">
      <label
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 py-3 transition hover:border-[color:var(--color-border-strong)] hover:bg-[var(--color-hover)]",
          dragging && "border-[color:var(--color-border-strong)] bg-[var(--color-hover)]",
          disabled && "cursor-not-allowed opacity-55"
        )}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept={TEACHING_ARCHITECTURE_ACCEPT}
          disabled={disabled}
          onChange={handleChange}
        />
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[color:var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text-muted)]">
          {file ? <FileText className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[var(--color-text)]">
            {file ? file.name : "也可以点击上传文件生成架构图"}
          </span>
          <span className="mt-1 block text-xs leading-5 text-[var(--color-text-faint)]">
            {disabled && disabledReason ? disabledReason : `支持 ${teachingArchitectureFileLabel}，单个文件不超过 20MB`}
          </span>
        </span>
      </label>

      {file ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-panel)] px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm text-[var(--color-text)]">{file.name}</p>
            <p className="text-xs text-[var(--color-text-faint)]">{formatFileSize(file.size)}</p>
          </div>
          <Button type="button" size="sm" variant="ghost" disabled={removeDisabled} onClick={() => onFileChange(null)}>
            <X className="h-4 w-4" />
            移除文件
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}
