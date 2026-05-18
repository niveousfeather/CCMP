"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Box,
  CheckCircle2,
  Clock3,
  Image,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  Video
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type {
  AdminAnalyticsBreakdownItem,
  AdminAnalyticsData,
  AdminAnalyticsMetric,
  AdminAnalyticsTrendPoint
} from "@/lib/admin-analytics";
import { cn } from "@/lib/utils";

type MetricDetailId = "today" | "success" | "errors" | "users" | null;

const metricIcons = {
  today: Activity,
  success: CheckCircle2,
  errors: AlertTriangle,
  users: Users
} as const;

const usageIcons = {
  image: Image,
  video: Video,
  model3d: Box,
  chat: Bot
} as const;

const statusTone = {
  success: "from-emerald-500 to-cyan-300",
  running: "from-sky-500 to-blue-400",
  failed: "from-rose-500 to-orange-400",
  other: "from-zinc-400 to-zinc-600"
} as const;

type LoadState = "idle" | "loading" | "ready" | "failed";

export function AdminAnalyticsClient() {
  const [data, setData] = useState<AdminAnalyticsData | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [activeDetail, setActiveDetail] = useState<MetricDetailId>(null);

  async function loadAnalytics() {
    setState((current) => (current === "ready" ? "ready" : "loading"));
    setError("");

    const response = await fetch("/api/admin/analytics", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("failed");
      setError(payload.message || "数据分析加载失败，请稍后重试。");
      return;
    }

    setData(payload as AdminAnalyticsData);
    setState("ready");
  }

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loading = state === "idle" || state === "loading";

  return (
    <div className="grid gap-6">
      <section className="relative overflow-hidden rounded-[28px] border border-[color:var(--color-border)] bg-[var(--color-panel)] p-5 shadow-soft md:p-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_14%,rgba(96,165,250,0.18),transparent_28rem),linear-gradient(140deg,rgba(255,255,255,0.05),transparent_40%)]" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-text)] md:text-4xl">数据分析</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-text-muted)]">
              汇总平台访问趋势、创作任务状态、模型调用表现与账户活跃数据，为运营监控、资源调度和异常排查提供统一分析视图。
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] px-4 py-3 text-sm">
              <p className="text-xs text-[var(--color-text-faint)]">更新时间</p>
              <p className="mt-1 font-medium text-[var(--color-text)]">{data?.generatedAt || "等待加载"}</p>
            </div>
            <Button variant="primary" onClick={loadAnalytics} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              刷新数据
            </Button>
          </div>
        </div>
      </section>

      {error ? <Card className="border-red-500/30 bg-red-500/10 text-sm font-medium !text-red-600">{error}</Card> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(data?.metrics || makeMetricSkeleton()).map((metric) => (
          <MetricTile
            key={metric.id}
            metric={metric}
            loading={!data}
            active={activeDetail === metric.id}
            onClick={() => setActiveDetail((current) => (current === metric.id ? null : (metric.id as MetricDetailId)))}
          />
        ))}
      </section>

      {activeDetail && data ? <MetricDetailPanel data={data} detailId={activeDetail} onClose={() => setActiveDetail(null)} /> : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.6fr)]">
        <TrendCard trends={data?.trends || []} loading={!data} />
        <BreakdownCard
          title="功能使用分布"
          description="近 7 天各模块创建量占比"
          items={data?.usageBreakdown || []}
          loading={!data}
          iconMap={usageIcons}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.28fr)]">
        <StatusCard items={data?.statusBreakdown || []} loading={!data} />
        <ErrorLogCard data={data} loading={!data} />
      </section>

      <DailyTableCard data={data} loading={!data} />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.62fr)]">
        <TopUsersCard data={data} loading={!data} />
        <StorageCard data={data} loading={!data} />
      </section>
    </div>
  );
}

function makeMetricSkeleton(): AdminAnalyticsMetric[] {
  return [
    { id: "today", label: "今日请求", value: "-", helper: "加载中", delta: "-" },
    { id: "success", label: "任务成功率", value: "-", helper: "加载中", delta: "-" },
    { id: "errors", label: "失败任务", value: "-", helper: "加载中", delta: "-" },
    { id: "users", label: "平台用户", value: "-", helper: "加载中", delta: "-" }
  ];
}

function MetricTile({
  metric,
  loading,
  active,
  onClick
}: {
  metric: AdminAnalyticsMetric;
  loading: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  const Icon = metricIcons[metric.id as keyof typeof metricIcons] || BarChart3;

  return (
    <button type="button" onClick={onClick} className="block text-left" disabled={loading}>
      <Card className={cn("relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_52px_rgba(37,99,235,0.12)]", active && "border-blue-300 bg-[color-mix(in_srgb,var(--color-soft)_62%,var(--color-panel))]")}>
      <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-full bg-[radial-gradient(circle,rgba(96,165,250,0.18),transparent_70%)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--color-text-muted)]">{metric.label}</p>
          <p className={cn("mt-3 text-3xl font-semibold text-[var(--color-text)]", loading && "animate-pulse")}>{metric.value}</p>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400 !text-white shadow-[0_10px_28px_rgba(56,189,248,0.28)]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="relative mt-5 border-t border-[color:var(--color-border)] pt-3">
        <p className="line-clamp-1 text-xs text-[var(--color-text-faint)]">{metric.helper}</p>
        <p className="mt-1 text-xs font-medium text-[var(--color-text)]">{metric.delta}</p>
      </div>
    </Card>
    </button>
  );
}

function MetricDetailPanel({ data, detailId, onClose }: { data: AdminAnalyticsData; detailId: Exclude<MetricDetailId, null>; onClose: () => void }) {
  const titleMap = {
    today: "今日请求明细",
    success: "成功率分析",
    errors: "失败任务分析",
    users: "平台用户明细"
  } as const;
  const rows =
    detailId === "today"
      ? data.details.recentTasks
      : detailId === "success"
        ? data.details.successTasks
        : detailId === "errors"
          ? data.details.failedTasks
          : [];

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col justify-between gap-3 border-b border-[color:var(--color-border)] bg-[var(--color-soft)] px-5 py-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-lg font-medium text-[var(--color-text)]">{titleMap[detailId]}</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {detailId === "today"
              ? "展示近期所有模块返回的任务记录。"
              : detailId === "success"
                ? "展示成功请求，并对照任务状态分布查看平台健康度。"
                : detailId === "errors"
                  ? "展示失败任务与错误原因，便于定位异常链路。"
                  : "展示平台用户与近 7 天活跃提交量。"}
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          收起详情
        </Button>
      </div>
      {detailId === "users" ? (
        <CompactUserTable users={data.details.users} />
      ) : (
        <CompactTaskTable rows={rows} emptyText={detailId === "errors" ? "暂无失败任务。" : "暂无可展示任务。"} />
      )}
    </Card>
  );
}

function CompactTaskTable({ rows, emptyText }: { rows: AdminAnalyticsData["details"]["recentTasks"]; emptyText: string }) {
  return (
    <div className="max-h-[360px] overflow-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="sticky top-0 bg-[var(--color-panel)] text-xs text-[var(--color-text-faint)]">
          <tr>
            <th className="px-5 py-3 font-medium">模块</th>
            <th className="px-4 py-3 font-medium">任务</th>
            <th className="px-4 py-3 font-medium">用户</th>
            <th className="px-4 py-3 font-medium">状态</th>
            <th className="px-4 py-3 font-medium">时间</th>
            <th className="px-5 py-3 font-medium">详情</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={`${row.module}-${row.id}`} className="border-t border-[color:var(--color-border)]">
                <td className="px-5 py-3 text-[var(--color-text-muted)]">{getModuleLabel(row.module)}</td>
                <td className="max-w-56 truncate px-4 py-3 font-medium text-[var(--color-text)]">{row.title}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{row.username || row.userId.slice(0, 8)}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{row.status}</td>
                <td className="px-4 py-3 text-[var(--color-text-faint)]">{row.createdAt}</td>
                <td className="max-w-72 truncate px-5 py-3 text-[var(--color-text-muted)]">{row.detail || "-"}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CompactUserTable({ users }: { users: AdminAnalyticsData["details"]["users"] }) {
  return (
    <div className="max-h-[360px] overflow-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead className="sticky top-0 bg-[var(--color-panel)] text-xs text-[var(--color-text-faint)]">
          <tr>
            <th className="px-5 py-3 font-medium">用户</th>
            <th className="px-4 py-3 font-medium">角色</th>
            <th className="px-4 py-3 font-medium">图片</th>
            <th className="px-4 py-3 font-medium">视频</th>
            <th className="px-4 py-3 font-medium">3D</th>
            <th className="px-5 py-3 text-right font-medium">近 7 天总计</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-t border-[color:var(--color-border)]">
              <td className="px-5 py-3 font-medium text-[var(--color-text)]">{user.username}</td>
              <td className="px-4 py-3 text-[var(--color-text-muted)]">{user.role.toLowerCase()}</td>
              <td className="px-4 py-3 text-[var(--color-text-muted)]">{user.image}</td>
              <td className="px-4 py-3 text-[var(--color-text-muted)]">{user.video}</td>
              <td className="px-4 py-3 text-[var(--color-text-muted)]">{user.model3d}</td>
              <td className="px-5 py-3 text-right font-semibold text-[var(--color-text)]">{user.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getModuleLabel(module: string) {
  if (module === "image") return "图片";
  if (module === "video") return "视频";
  if (module === "model3d") return "3D";
  return "Agent";
}

function TrendCard({ trends, loading }: { trends: AdminAnalyticsTrendPoint[]; loading: boolean }) {
  const maxTotal = useMemo(() => Math.max(1, ...trends.map((item) => item.total)), [trends]);
  const displayTrends = trends.length
    ? trends
    : Array.from({ length: 7 }, (_, index) => ({ date: String(index), label: "--", image: 0, video: 0, model3d: 0, chat: 0, total: 0 }));

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border)] p-5">
        <div>
          <h2 className="text-lg font-medium text-[var(--color-text)]">近 7 天使用趋势</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">按功能模块统计每日创建量，方便观察使用峰值。</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400 !text-white">
          <BarChart3 className="h-5 w-5" />
        </div>
      </div>
      <div className="grid gap-5 p-5">
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[linear-gradient(180deg,var(--color-soft),transparent)] p-4">
          <div className="flex h-64 items-end gap-3">
            {displayTrends.map((item) => (
              <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center gap-3">
                <div className="flex h-44 w-full items-end justify-center">
                  <div
                    className={cn(
                      "w-full max-w-12 rounded-t-2xl bg-gradient-to-t from-blue-700 via-sky-400 to-cyan-200 shadow-[0_18px_48px_rgba(37,99,235,0.24)]",
                      loading && "animate-pulse opacity-45"
                    )}
                    style={{ height: `${Math.max(8, (item.total / maxTotal) * 176)}px` }}
                  />
                </div>
                <div className="min-w-0 text-center">
                  <p className="text-xs font-medium text-[var(--color-text)]">{item.total}</p>
                  <p className="truncate text-[11px] text-[var(--color-text-faint)]">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-2 text-xs text-[var(--color-text-muted)] sm:grid-cols-4">
          <LegendDot label="图片" className="bg-blue-500" />
          <LegendDot label="视频" className="bg-cyan-400" />
          <LegendDot label="3D" className="bg-slate-400" />
          <LegendDot label="Agent" className="bg-zinc-500" />
        </div>
      </div>
    </Card>
  );
}

function LegendDot({ label, className }: { label: string; className: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 rounded-full", className)} />
      {label}
    </span>
  );
}

function BreakdownCard({
  title,
  description,
  items,
  loading,
  iconMap
}: {
  title: string;
  description: string;
  items: AdminAnalyticsBreakdownItem[];
  loading: boolean;
  iconMap: typeof usageIcons;
}) {
  const displayItems = items.length
    ? items
    : [
        { id: "image", label: "图片生成", value: 0, displayValue: "-", percent: 0 },
        { id: "video", label: "视频生成", value: 0, displayValue: "-", percent: 0 },
        { id: "model3d", label: "3D生成", value: 0, displayValue: "-", percent: 0 },
        { id: "chat", label: "Nexus Agent", value: 0, displayValue: "-", percent: 0 }
      ];

  return (
    <Card className="p-5">
      <h2 className="text-lg font-medium text-[var(--color-text)]">{title}</h2>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p>
      <div className="mt-5 grid gap-3">
        {displayItems.map((item) => {
          const Icon = iconMap[item.id as keyof typeof iconMap] || Sparkles;
          return (
            <div key={item.id} className="rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--color-panel)] text-blue-500">
                    <Icon className="h-4 w-4" />
                  </span>
                  {item.label}
                </span>
                <span className={cn("text-sm font-semibold text-[var(--color-text)]", loading && "animate-pulse")}>{item.displayValue}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--color-panel)]">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-600 via-sky-400 to-cyan-200" style={{ width: `${Math.max(item.percent, item.value ? 6 : 0)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function StatusCard({ items, loading }: { items: AdminAnalyticsBreakdownItem[]; loading: boolean }) {
  const displayItems = items.length
    ? items
    : [
        { id: "success", label: "成功", value: 0, displayValue: "-", percent: 0 },
        { id: "running", label: "处理中", value: 0, displayValue: "-", percent: 0 },
        { id: "failed", label: "失败", value: 0, displayValue: "-", percent: 0 },
        { id: "other", label: "其他", value: 0, displayValue: "-", percent: 0 }
      ];

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium text-[var(--color-text)]">任务状态分布</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">近 7 天生成类任务的整体健康度。</p>
        </div>
        <ShieldCheck className="h-5 w-5 text-blue-500" />
      </div>
      <div className="mt-5 grid gap-3">
        {displayItems.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            <div className="w-16 text-xs text-[var(--color-text-muted)]">{item.label}</div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-soft)]">
              <div className={cn("h-full rounded-full bg-gradient-to-r", statusTone[item.id as keyof typeof statusTone] || statusTone.other)} style={{ width: `${Math.max(item.percent, item.value ? 8 : 0)}%` }} />
            </div>
            <div className={cn("w-12 text-right text-xs font-medium text-[var(--color-text)]", loading && "animate-pulse")}>{item.displayValue}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ErrorLogCard({ data, loading }: { data: AdminAnalyticsData | null; loading: boolean }) {
  const errors = data?.errors.latest || [];

  return (
    <Card className="p-4">
      <div className="flex flex-col justify-between gap-2 border-b border-[color:var(--color-border)] pb-3 md:flex-row md:items-start">
        <div>
          <h2 className="text-lg font-medium text-[var(--color-text)]">错误请求分析</h2>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">汇总近期接口错误和生成失败原因。</p>
        </div>
        <Badge className="border-red-500/30 bg-red-500/10 font-medium !text-red-600">{loading ? "加载中" : `${errors.length} 条近期记录`}</Badge>
      </div>
      <div className="mt-3 grid max-h-[250px] gap-2 overflow-y-auto pr-1">
        {errors.length ? (
          errors.map((item) => (
            <div key={`${item.module}-${item.id}`} className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-[11px] font-medium !text-red-600">{item.module}</span>
                  <span className="text-xs text-[var(--color-text-faint)]">{item.status}</span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-[var(--color-text-faint)]">
                  <Clock3 className="h-3.5 w-3.5" />
                  {item.createdAt}
                </span>
              </div>
              <p className="mt-1 line-clamp-1 text-xs leading-5 text-[var(--color-text-muted)]">{item.message}</p>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] p-6 text-center text-sm text-[var(--color-text-muted)]">
            暂无近期失败任务，状态很安静。
          </div>
        )}
      </div>
    </Card>
  );
}

function TopUsersCard({ data, loading }: { data: AdminAnalyticsData | null; loading: boolean }) {
  const users = data?.topUsers || [];
  const maxTotal = Math.max(1, ...users.map((item) => item.total));

  return (
    <Card className="p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium text-[var(--color-text)]">活跃账户排行</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">基于近 7 天配额使用记录统计。</p>
        </div>
        <Users className="h-5 w-5 text-blue-500" />
      </div>
      <div className="grid gap-3">
        {users.length ? (
          users.map((user, index) => (
            <div key={user.id} className="rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-text)]">
                    #{index + 1} {user.username}
                  </p>
                  <p className="text-xs text-[var(--color-text-faint)]">{user.role.toLowerCase()}</p>
                </div>
                <span className={cn("text-sm font-semibold text-[var(--color-text)]", loading && "animate-pulse")}>{user.total}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-panel)]">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-600 via-sky-400 to-cyan-200" style={{ width: `${Math.max(8, (user.total / maxTotal) * 100)}%` }} />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-[var(--color-text-faint)]">
                <span>图 {user.image}</span>
                <span>视频 {user.video}</span>
                <span>3D {user.model3d}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] p-6 text-center text-sm text-[var(--color-text-muted)]">
            暂无近 7 天配额使用记录。
          </div>
        )}
      </div>
    </Card>
  );
}

function DailyTableCard({ data, loading }: { data: AdminAnalyticsData | null; loading: boolean }) {
  const rows = data?.dailyTable || [];

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col justify-between gap-3 border-b border-[color:var(--color-border)] p-5 md:flex-row md:items-center">
        <div>
          <h2 className="text-lg font-medium text-[var(--color-text)]">每日真实数据表</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">与上方趋势图使用同一批后端聚合数据，后续可扩展筛选和导出。</p>
        </div>
        <Badge className="border-blue-500/30 bg-blue-500/10 font-medium text-blue-600">
          {loading ? "加载中" : `${rows.length} 天`}
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="bg-[var(--color-soft)] text-xs text-[var(--color-text-faint)]">
            <tr>
              <th className="px-5 py-3 font-medium">日期</th>
              <th className="px-4 py-3 font-medium">图片</th>
              <th className="px-4 py-3 font-medium">视频</th>
              <th className="px-4 py-3 font-medium">3D</th>
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-5 py-3 text-right font-medium">总计</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.date} className="border-t border-[color:var(--color-border)]">
                  <td className="px-5 py-4 font-medium text-[var(--color-text)]">{row.label}</td>
                  <td className="px-4 py-4 text-[var(--color-text-muted)]">{row.image}</td>
                  <td className="px-4 py-4 text-[var(--color-text-muted)]">{row.video}</td>
                  <td className="px-4 py-4 text-[var(--color-text-muted)]">{row.model3d}</td>
                  <td className="px-4 py-4 text-[var(--color-text-muted)]">{row.chat}</td>
                  <td className="px-5 py-4 text-right font-semibold text-[var(--color-text)]">{row.total}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">
                  暂无统计数据。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function StorageCard({ data, loading }: { data: AdminAnalyticsData | null; loading: boolean }) {
  const model3dCount = data?.usageBreakdown.find((item) => item.id === "model3d")?.displayValue || "-";
  const errorCount = data?.errors.total ?? 0;

  return (
    <Card className="relative overflow-hidden p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_86%_18%,rgba(96,165,250,0.14),transparent_14rem)]" />
      <div className="relative">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400 !text-white">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h2 className="mt-5 text-lg font-medium text-[var(--color-text)]">数据链路状态</h2>
        <p className="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
          当前页面读取真实生成历史、配额记录和 ErrorLog。3D 成功结果会写入资产表，并通过服务端存储层保存到 OSS。
        </p>
        <div className="mt-5 grid gap-2 text-sm text-[var(--color-text-muted)]">
          <span className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 py-2">
            近 7 天 3D 记录：{loading ? "加载中" : model3dCount}
          </span>
          <span className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 py-2">
            近期错误日志：{loading ? "加载中" : `${errorCount} 条`}
          </span>
        </div>
      </div>
    </Card>
  );
}
