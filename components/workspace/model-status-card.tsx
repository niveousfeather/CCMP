"use client";

import { Activity, CircleDot, Gauge, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge, Card } from "@/components/ui/card";
import { heroModel, modelStatuses, workspaceHighlights } from "@/components/workspace/workspace-data";

export function ModelStatusCard() {
  const HeroIcon = heroModel.icon;
  const [model3DHealth, setModel3DHealth] = useState<"checking" | "available" | "unavailable">("checking");

  useEffect(() => {
    let cancelled = false;
    async function checkModel3DHealth() {
      try {
        const response = await fetch("/api/model3d/health", { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as { ok?: boolean };
        if (!cancelled) setModel3DHealth(response.ok && data.ok ? "available" : "unavailable");
      } catch {
        if (!cancelled) setModel3DHealth("unavailable");
      }
    }

    void checkModel3DHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid gap-4">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-[var(--color-text)]">状态中枢</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{heroModel.description}</p>
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] text-[var(--color-text-muted)]">
            <HeroIcon className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-5 grid gap-2">
          {modelStatuses.map((model) => (
            <div key={model.id} className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-4 transition hover:bg-[var(--color-hover)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">{model.name}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">{model.capability}</p>
                </div>
                <Badge className={getStatusBadgeClass(model.id === "model3d-pro" ? model3DHealth : "available")}>
                  {model.id === "model3d-pro" ? getModel3DHealthLabel(model3DHealth) : model.status}
                </Badge>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-[var(--color-text-faint)]">
                <Gauge className="h-3.5 w-3.5" />
                <span>响应：{model.latency}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-[var(--color-text-muted)]" />
          <h2 className="text-base font-medium text-[var(--color-text)]">运行概览</h2>
        </div>
        <div className="grid gap-3">
          {workspaceHighlights.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg bg-[var(--color-soft)] px-3 py-3">
              <span className="text-sm text-[var(--color-text-muted)]">{item.label}</span>
              <span className="text-sm font-medium text-[var(--color-text)]">{item.value}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="relative overflow-hidden p-5">
        <div className="absolute right-[-4rem] top-[-4rem] h-40 w-40 rounded-full border border-[color:var(--color-border)]" />
        <div className="relative">
          <div className="mb-4 flex items-center gap-2">
            <CircleDot className="h-4 w-4 text-[var(--color-text-muted)]" />
            <h2 className="text-base font-medium text-[var(--color-text)]">使用建议</h2>
          </div>
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">
            平台适合承载团队内的日常创作流。上传资料前先确认内容合规，生成结果建议进入历史记录后统一复查和分发。
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
            <ShieldCheck className="h-3.5 w-3.5" />
            服务端密钥不暴露到前端
          </div>
        </div>
      </Card>
    </div>
  );
}

function getModel3DHealthLabel(status: "checking" | "available" | "unavailable") {
  if (status === "available") return "可用";
  if (status === "unavailable") return "不可用";
  return "检查中";
}

function getStatusBadgeClass(status: "checking" | "available" | "unavailable") {
  if (status === "available") return "border-emerald-500/30 bg-emerald-500/10 !text-emerald-600";
  if (status === "unavailable") return "border-red-500/30 bg-red-500/10 !text-red-600";
  return "";
}
