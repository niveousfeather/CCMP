"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type Toast = {
  id: number;
  type: "success" | "error";
  message: string;
  count: number;
};

type ToastContextValue = {
  toast: (toast: Omit<Toast, "id" | "count">) => void;
};

const MAX_TOASTS = 3;
const TOAST_DURATION = 3000;

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const itemsRef = useRef<Toast[]>([]);
  const timersRef = useRef<Map<number, number>>(new Map());
  const idRef = useRef(1);

  const removeToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    itemsRef.current = itemsRef.current.filter((item) => item.id !== id);
    setItems(itemsRef.current);
  }, []);

  const scheduleRemoval = useCallback(
    (id: number) => {
      const currentTimer = timersRef.current.get(id);
      if (currentTimer) {
        window.clearTimeout(currentTimer);
      }
      const timer = window.setTimeout(() => removeToast(id), TOAST_DURATION);
      timersRef.current.set(id, timer);
    },
    [removeToast]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: (toast) => {
        const current = itemsRef.current;
        const existing = current.find((item) => item.type === toast.type && item.message === toast.message);
        const id = existing?.id ?? Date.now() + idRef.current++;
        const nextItem: Toast = existing
          ? { ...existing, count: existing.count + 1 }
          : { ...toast, id, count: 1 };
        const nextItems = [nextItem, ...current.filter((item) => item.id !== id)].slice(0, MAX_TOASTS);
        const visibleIds = new Set(nextItems.map((item) => item.id));

        for (const [timerId, timer] of timersRef.current.entries()) {
          if (!visibleIds.has(timerId)) {
            window.clearTimeout(timer);
            timersRef.current.delete(timerId);
          }
        }

        itemsRef.current = nextItems;
        setItems(nextItems);
        scheduleRemoval(id);
      }
    }),
    [scheduleRemoval]
  );

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-[60] grid w-[calc(100vw-32px)] gap-2 sm:w-80">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-3 rounded-lg border border-[color:var(--color-border-strong)] bg-[var(--color-panel)] p-4 text-sm text-[var(--color-text)] shadow-soft"
          >
            {item.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text)]" />
            ) : (
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-danger)]" />
            )}
            <span className="min-w-0 flex-1 text-[var(--color-text-muted)]">{item.message}</span>
            {item.count > 1 ? (
              <span className="rounded-md border border-[color:var(--color-border)] bg-[var(--color-soft)] px-1.5 py-0.5 text-xs text-[var(--color-text-faint)]">
                x{item.count}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
