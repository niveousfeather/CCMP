"use client";

import { Anchor, BriefcaseBusiness, ClipboardCheck, FileText, GraduationCap, Layers3, Lightbulb, TrendingUp } from "lucide-react";

import type { CourseAbilityGraphPayload } from "@/lib/capability-map/course-ability-graph";
import { capabilityMapSourceNotice } from "@/lib/capability-map/source-status";

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function take(items: string[], limit = 3) {
  const visible = items.slice(0, limit);
  const rest = items.length - visible.length;
  return rest > 0 ? [...visible, `另有 ${rest} 项`] : visible;
}

function evidenceStatusText(graph: CourseAbilityGraphPayload) {
  return capabilityMapSourceNotice(graph);
}

export function IcebergModel({ graph }: { graph: CourseAbilityGraphPayload }) {
  const courseChanges = take(graph.teachingModules.map((module) => `${module.name}${module.hours ? `（${module.hours}学时）` : ""}`));
  const projectChanges = take(graph.updateSuggestions.map((suggestion) => suggestion.title));
  const assessmentChanges = take(unique(graph.teachingModules.flatMap((module) => module.assessmentMethods)), 3);

  const trends = take(graph.industryTrends.map((trend) => trend.name));
  const jobs = take(graph.regionalJobMap.map((job) => `${job.region} · ${job.title}`));
  const majorAbilities = take(graph.majorAbilityMap.map((ability) => ability.name));
  const evidence = take(graph.evidenceSources.map((source) => source.title), 2);

  return (
    <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">冰山模型 / 底层驱动</p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">教师看到课程变化，背后是产业、岗位与专业能力在变化</h2>
        </div>
        <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
          {evidenceStatusText(graph)}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
        <div className="bg-gradient-to-b from-sky-50 to-white p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold text-blue-800">
            <Layers3 className="h-4 w-4" />
            水面上：课程建设中直接呈现的变化
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <IcebergBlock icon={GraduationCap} title="课程内容" items={courseChanges} tone="surface" />
            <IcebergBlock icon={Lightbulb} title="教学项目" items={projectChanges} tone="surface" />
            <IcebergBlock icon={ClipboardCheck} title="考核方式" items={assessmentChanges} tone="surface" />
          </div>
        </div>

        <div className="relative border-y border-[color:var(--color-border)] bg-[var(--color-soft)] px-5 py-3">
          <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--color-border)]" />
          <div className="relative mx-auto flex w-fit items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[var(--color-panel)] px-4 py-1.5 text-sm font-semibold text-[var(--color-text-muted)] shadow-sm">
            <Anchor className="h-4 w-4 text-[var(--color-text-faint)]" />
            课程调整不是孤立发生，而是由水面下因素共同推动
          </div>
        </div>

        <div className="bg-gradient-to-b from-[var(--color-panel-2)] to-[var(--color-panel)] p-5 text-[var(--color-text)]">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
            <TrendingUp className="h-4 w-4 text-[var(--color-text-faint)]" />
            水面下：支撑课程变化的底层依据
          </div>
          <div className="grid gap-3 lg:grid-cols-4">
            <IcebergBlock icon={TrendingUp} title="产业趋势" items={trends} tone="deep" />
            <IcebergBlock icon={BriefcaseBusiness} title="岗位需求" items={jobs} tone="deep" />
            <IcebergBlock icon={Layers3} title="专业能力" items={majorAbilities} tone="deep" />
            <IcebergBlock icon={FileText} title="证据来源" items={evidence} tone="deep" />
          </div>
        </div>
      </div>
    </section>
  );
}

function IcebergBlock({
  icon: Icon,
  items,
  title,
  tone
}: {
  icon: typeof GraduationCap;
  items: string[];
  title: string;
  tone: "surface" | "deep";
}) {
  return (
    <div
      className={
        tone === "surface"
          ? "rounded-2xl border border-blue-100 bg-white p-4 shadow-sm"
          : "rounded-2xl border border-white/15 bg-white/10 p-4"
      }
    >
      <div className={tone === "surface" ? "flex items-center gap-2 text-sm font-bold text-slate-900" : "flex items-center gap-2 text-sm font-bold text-white"}>
        <Icon className={tone === "surface" ? "h-4 w-4 text-blue-600" : "h-4 w-4 text-blue-200"} />
        {title}
      </div>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <div
            key={`${title}-${item}`}
            className={
              tone === "surface"
                ? "rounded-xl bg-blue-50 px-3 py-2 text-sm leading-5 text-slate-700"
                : "rounded-xl bg-white/10 px-3 py-2 text-sm leading-5 text-blue-50"
            }
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
