export default function DashboardLoading() {
  return (
    <div className="grid gap-6">
      <div className="space-y-3">
        <div className="h-4 w-24 animate-pulse rounded bg-[var(--color-soft)]" />
        <div className="h-9 w-64 animate-pulse rounded bg-[var(--color-soft)]" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-[var(--color-soft)]" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.55fr)]">
        <div className="min-h-[230px] animate-pulse rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)]" />
        <div className="min-h-[230px] animate-pulse rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)]" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)]"
          />
        ))}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <div className="h-80 animate-pulse rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)]" />
        <div className="h-80 animate-pulse rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)]" />
      </div>
    </div>
  );
}
