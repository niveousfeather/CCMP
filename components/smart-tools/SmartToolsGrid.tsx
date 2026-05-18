import { SmartToolCard } from "@/components/smart-tools/SmartToolCard";
import { smartTools } from "@/components/smart-tools/smart-tools-data";

export function SmartToolsGrid() {
  return (
    <div className="grid gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-[var(--color-text-faint)]">工具箱</p>
        <h1 className="text-3xl font-semibold tracking-normal text-[var(--color-text)] md:text-4xl">智能工具</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--color-text-muted)]">
          集中管理面向专业工作流的 AI 工具。
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {smartTools.map((tool) => (
          <SmartToolCard key={tool.id} tool={tool} />
        ))}
      </section>
    </div>
  );
}
