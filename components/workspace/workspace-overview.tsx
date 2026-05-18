import { ArrowRight, Box, Clock3, Image, Video, Zap } from "lucide-react";
import Link from "next/link";

import type { DashboardOverviewItem, DashboardStats } from "@/lib/dashboard-stats";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { MetricGrid } from "@/components/workspace/metric-grid";
import { ModelStatusCard } from "@/components/workspace/model-status-card";
import { QuickActionGrid } from "@/components/workspace/quick-action-grid";
import { RecentTaskList } from "@/components/workspace/recent-task-list";

export function WorkspaceOverview({ isAdmin, stats }: { isAdmin: boolean; stats: DashboardStats | null }) {
  const latest = stats?.overview.find((item) => item.id === "latest");
  const module = stats?.overview.find((item) => item.id === "module");
  const quota = stats?.quota;
  const imagePercent = getUsagePercent(quota?.imageUsedToday, quota?.imageDailyLimit);
  const videoPercent = getUsagePercent(quota?.videoUsedToday, quota?.videoDailyLimit);
  const model3DPercent = getUsagePercent(quota?.model3DUsedToday, quota?.model3DDailyLimit);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-[var(--color-text-faint)]">工作台</p>
        <h1 className="text-3xl font-semibold tracking-normal text-[var(--color-text)] md:text-4xl">今日工作台</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--color-text-muted)]">
          把对话、图片、视频和知识图谱收在同一个入口，先看状态，再继续创作。
        </p>
      </div>

      <section className="grid min-w-0 items-stretch gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Card className="relative min-w-0 overflow-hidden p-5 md:p-6">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_70%_25%,rgba(96,165,250,0.16),transparent_34%),radial-gradient(circle_at_88%_72%,rgba(16,185,129,0.12),transparent_30%)]" />
          <div className="relative grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
            <div className="min-w-0">
              <Badge>{isAdmin ? "平台视角" : "个人视角"}</Badge>
              <h2 className="mt-4 max-w-2xl text-2xl font-semibold leading-tight text-[var(--color-text)] md:text-3xl">
                先从一个任务开始，Nexus 会把创作链路接起来
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-text-muted)]">
                工作台现在更偏向“继续工作”：查看最近结果、进入常用能力、确认模型状态，不再把信息散在多个入口里。
              </p>
            </div>

            <div className="grid gap-2 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-panel)]/78 p-3 backdrop-blur">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-faint)]">
                <Clock3 className="h-3.5 w-3.5" />
                最近更新
              </div>
              <p className="truncate text-lg font-semibold text-[var(--color-text)]">{latest?.value || "暂无记录"}</p>
              <p className="text-xs leading-5 text-[var(--color-text-muted)]">
                {module?.label || "常用模块"}：{module?.value || "暂无数据"}
              </p>
            </div>
          </div>

          <div className="relative mt-5 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            <Link href="/chat" className="col-span-2 sm:col-span-1">
              <Button
                variant="secondary"
                className="w-full border-blue-200 bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 !text-white shadow-[0_14px_32px_rgba(37,99,235,0.28)] hover:border-blue-200 hover:brightness-105 sm:w-auto"
              >
                打开 Nexus Agent
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/image" className="min-w-0">
              <Button variant="secondary">生成图片</Button>
            </Link>
            <Link href="/video" className="min-w-0">
              <Button variant="secondary">视频生成</Button>
            </Link>
            <Link href="/history" className="min-w-0">
              <Button variant="ghost">查看历史</Button>
            </Link>
          </div>

          <div className="relative mt-7 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(stats?.overview || []).map((item) => (
              <OverviewStatCard key={item.id} item={item} />
            ))}
          </div>
        </Card>

        <Card className="flex min-w-0 flex-col p-4 md:p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-[var(--color-text-faint)]">今日用量</p>
              <h2 className="mt-1 text-xl font-semibold text-[var(--color-text)]">额度脉冲</h2>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
              <Zap className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-xs leading-6 text-[var(--color-text-muted)]">
            根据今天的提交记录实时计算剩余额度，图片和视频任务提交时会同步扣减。
          </p>

          <div className="mt-4 grid flex-1 content-start gap-2">
            <QuotaMeter
              icon={Image}
              label="图片生成"
              used={quota?.imageUsedToday}
              limit={quota?.imageDailyLimit}
              remaining={quota?.imageRemaining}
              percent={imagePercent}
            />
            <QuotaMeter
              icon={Video}
              label="视频生成"
              used={quota?.videoUsedToday}
              limit={quota?.videoDailyLimit}
              remaining={quota?.videoRemaining}
              percent={videoPercent}
            />
            <QuotaMeter
              icon={Box}
              label="3D生成"
              used={quota?.model3DUsedToday}
              limit={quota?.model3DDailyLimit}
              remaining={quota?.model3DRemaining}
              percent={model3DPercent}
            />
          </div>

        </Card>
      </section>

      <MetricGrid metrics={stats?.metrics || []} />
      <QuickActionGrid isAdmin={isAdmin} />

      <section className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <RecentTaskList stats={stats} />
        <ModelStatusCard />
      </section>
    </div>
  );
}

function OverviewStatCard({ item }: { item: DashboardOverviewItem }) {
  return (
    <div className="flex h-28 flex-col justify-between rounded-lg border border-[color:var(--color-border)] bg-[var(--color-panel)]/82 p-4 backdrop-blur">
      <p className="text-xs text-[var(--color-text-faint)]">{item.label}</p>
      <p className="truncate text-lg font-semibold text-[var(--color-text)]">{item.value}</p>
      <p className="line-clamp-1 text-xs leading-5 text-[var(--color-text-muted)]">{item.description}</p>
    </div>
  );
}

function getUsagePercent(used = 0, limit = 0) {
  if (!limit) return 0;
  return Math.min(Math.round((used / limit) * 100), 100);
}

function QuotaMeter({
  icon: Icon,
  label,
  used = 0,
  limit = 0,
  remaining = 0,
  percent
}: {
  icon: typeof Image;
  label: string;
  used?: number;
  limit?: number;
  remaining?: number;
  percent: number;
}) {
  return (
    <div className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-2.5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-blue-50 to-white text-blue-600">
            <Icon className="h-3.5 w-3.5" />
          </span>
          {label}
        </span>
        <span className="text-xs text-[var(--color-text-faint)]">剩余 {remaining} 次</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-panel)]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-300 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs">
        <span className="text-[var(--color-text-muted)]">已用 {used}/{limit}</span>
        <span className="font-medium text-blue-600">已用 {percent}%</span>
      </div>
    </div>
  );
}
