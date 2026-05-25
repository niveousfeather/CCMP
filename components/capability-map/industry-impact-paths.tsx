"use client";

import { ArrowRight, FileText, Route } from "lucide-react";

import type { CourseAbilityGraphPayload, CourseEvidenceSource, ImpactPath } from "@/lib/capability-map/course-ability-graph";
import { cn } from "@/lib/utils";

const DATA_NOTICE = "当前为本地示例数据，未接入真实资料库，不能作为正式引用。";

const stageLabels = ["产业变化", "岗位变化", "专业能力变化", "课程模块变化", "教学内容建议"] as const;

function compactItems(items: string[], limit = 2) {
  const visible = items.slice(0, limit);
  const rest = items.length - visible.length;
  return rest > 0 ? [...visible, `另有 ${rest} 项`] : visible;
}

export function IndustryImpactPaths({
  evidenceSources,
  graph,
  selectedNodeId,
  paths
}: {
  evidenceSources: CourseEvidenceSource[];
  graph: CourseAbilityGraphPayload;
  selectedNodeId: string;
  paths: ImpactPath[];
}) {
  const evidenceMap = new Map(evidenceSources.map((source) => [source.id, source]));
  const selectedName = getSelectedName(graph, selectedNodeId);
  const selectedRelatedPaths = selectedName ? paths.filter((path) => isPathRelatedToSelection(path, selectedNodeId, graph)) : paths;
  const visiblePaths = selectedRelatedPaths.length ? selectedRelatedPaths : paths;
  const focused = Boolean(selectedName && selectedRelatedPaths.length);

  return (
    <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-[0_22px_64px_rgba(37,99,235,0.08)]">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-blue-700">
            <Route className="h-4 w-4" />
            核心解释链路
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">课程为什么要改</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {focused
              ? `当前优先展示与“${selectedName}”相关的课程调整依据。`
              : "每条链路从产业变化出发，解释岗位、专业能力和课程模块如何连续变化，最后落到教学内容建议。"}
          </p>
        </div>
        <div className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
          产业变化 → 岗位变化 → 专业能力变化 → 课程模块变化 → 教学内容建议
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        {visiblePaths.map((path, pathIndex) => {
          const stages = [
            [path.industryTrend],
            path.affectedJobs,
            path.majorAbilities,
            path.courseAbilities,
            path.teachingSuggestions
          ];
          const sources = path.evidenceSourceIds.map((id) => evidenceMap.get(id)).filter(Boolean) as CourseEvidenceSource[];

          return (
            <article
              key={path.id}
              className={cn(
                "rounded-3xl border border-slate-200 bg-slate-50 p-4",
                focused && "border-blue-300 shadow-[0_14px_34px_rgba(37,99,235,0.12)]"
              )}
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-black text-slate-950">链路 {pathIndex + 1}：{path.industryTrend}</h3>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">{DATA_NOTICE}</span>
              </div>

              <div className="grid gap-3 xl:grid-cols-[repeat(5,minmax(0,1fr))]">
                {stages.map((items, index) => (
                  <div key={`${path.id}-${stageLabels[index]}`} className="relative">
                    <div className="h-full rounded-2xl border border-blue-100 bg-white p-3 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-black text-blue-700">{stageLabels[index]}</p>
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-xs font-black text-blue-700">
                          {index + 1}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {compactItems(items).map((item) => (
                          <div key={`${path.id}-${stageLabels[index]}-${item}`} className="rounded-xl bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-700">
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                    {index < stages.length - 1 ? (
                      <ArrowRight className="absolute -right-5 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-blue-500 xl:block" />
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <FileText className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-slate-700">依据状态：</span>
                {sources.map((source) => (
                  <span key={source.id} className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                    {source.title}
                  </span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function getSelectedName(graph: CourseAbilityGraphPayload, selectedNodeId: string) {
  if (selectedNodeId === graph.courseAbilityMap.rootNode.id) return null;
  return (
    graph.workflowStages.find((stage) => stage.id === selectedNodeId)?.name ||
    graph.teachingModules.find((module) => module.id === selectedNodeId)?.name ||
    graph.tasks.find((task) => task.id === selectedNodeId)?.name ||
    null
  );
}

function isPathRelatedToSelection(path: ImpactPath, selectedNodeId: string, graph: CourseAbilityGraphPayload) {
  const stage = graph.workflowStages.find((item) => item.id === selectedNodeId);
  const module = graph.teachingModules.find((item) => item.id === selectedNodeId);
  const task = graph.tasks.find((item) => item.id === selectedNodeId);
  const relatedModule = task ? graph.teachingModules.find((item) => item.id === task.moduleId) : null;
  const jobIds = module?.relatedJobIds || task?.relatedJobIds || [];
  const trendIds = module?.trendIds || task?.trendIds || [];
  const jobs = graph.regionalJobMap.filter((job) => jobIds.includes(job.id)).map((job) => job.title);
  const trends = graph.industryTrends.filter((trend) => trendIds.includes(trend.id)).map((trend) => trend.name);
  const moduleNames = [
    module?.name,
    relatedModule?.name,
    ...(stage ? graph.teachingModules.filter((item) => stage.moduleIds.includes(item.id)).map((item) => item.name) : [])
  ].filter(Boolean) as string[];

  return (
    moduleNames.some((name) => path.courseAbilities.includes(name)) ||
    jobs.some((job) => path.affectedJobs.includes(job)) ||
    trends.includes(path.industryTrend)
  );
}
