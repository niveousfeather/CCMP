import { MetricCard } from "@/components/workspace/metric-card";
import type { DashboardMetric } from "@/lib/dashboard-stats";
import { cn } from "@/lib/utils";

export function MetricGrid({ metrics }: { metrics: DashboardMetric[] }) {
  if (!metrics.length) return null;

  return (
    <section className={cn("grid gap-4 sm:grid-cols-2", metrics.length >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
      {metrics.map((metric) => (
        <MetricCard key={metric.id} {...metric} />
      ))}
    </section>
  );
}
