"use client";

import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { ChangeEvent, DragEvent, useState } from "react";

import { cn } from "@/lib/utils";

export function FileUpload({
  accept,
  file,
  onFile
}: {
  accept: string;
  file?: File | null;
  onFile: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const nextFile = event.dataTransfer.files?.[0];
    if (nextFile) {
      onFile(nextFile);
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (nextFile) {
      onFile(nextFile);
    }
  }

  return (
    <label
      className={cn(
        "grid cursor-pointer place-items-center rounded-lg border border-dashed border-[color:var(--color-border)] bg-[var(--color-soft)] px-5 py-8 text-center transition hover:border-[color:var(--color-border-strong)] hover:bg-[var(--color-hover)]",
        dragging && "border-[color:var(--color-border-strong)] bg-[var(--color-hover)]"
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input className="hidden" type="file" accept={accept} onChange={handleChange} />
      <div className="grid place-items-center">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] text-[var(--color-text-muted)]">
          {file ? <FileSpreadsheet className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
        </div>
        <p className="text-sm font-medium text-[var(--color-text)]">{file ? file.name : "上传 Excel 或 CSV 文件"}</p>
        <p className="mt-2 text-xs text-[var(--color-text-faint)]">支持 .xlsx / .csv，单个文件不超过 5MB</p>
        <span className="mt-4 inline-flex h-8 items-center justify-center rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 text-[13px] font-medium text-[var(--color-text)] transition">
          选择文件
        </span>
      </div>
    </label>
  );
}
