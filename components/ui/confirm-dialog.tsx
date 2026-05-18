"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "确认",
  loading,
  onCancel,
  onConfirm
}: {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} title={title} onClose={onCancel}>
      <div className="grid gap-5">
        <div className="flex gap-3 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-[var(--color-danger)]" />
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">{description}</p>
        </div>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
            取消
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={loading}>
            {loading ? "处理中..." : confirmText}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
