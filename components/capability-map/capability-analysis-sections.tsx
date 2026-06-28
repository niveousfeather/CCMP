"use client";

import { useMemo, useState } from "react";
import { BarChart3, BriefcaseBusiness, FileText, GraduationCap, WalletCards } from "lucide-react";

import type { CourseAbilityGraphPayload, CourseEvidenceSource, CourseRelatedJob, CourseUpdateSuggestion } from "@/lib/capability-map/course-ability-graph";
import { capabilityMapSourceNotice } from "@/lib/capability-map/source-status";
import { cn } from "@/lib/utils";

const sourceTypeLabels: Record<CourseEvidenceSource["sourceType"], string> = {
  model_synthesis: "本地归纳",
  industry_report: "行业资料",
  job_posting: "岗位资料",
  policy: "政策资料",
  curriculum_standard: "课程标准",
  manual: "人工录入"
};

const reliabilityLabels: Record<CourseEvidenceSource["reliability"], string> = {
  high: "高",
  medium: "中",
  low: "低"
};

const priorityLabels: Record<CourseUpdateSuggestion["priority"], string> = {
  high: "优先处理",
  medium: "建议推进",
  low: "后续完善"
};

type AnalysisTab = "skills" | "salary" | "evidence";

const tabs: Array<{ id: AnalysisTab; label: string; description: string }> = [
  { id: "skills", label: "技能与岗位", description: "能力权重与岗位关联" },
  { id: "salary", label: "薪资与就业", description: "就业方向与待校准区间" },
  { id: "evidence", label: "证据与建议", description: "依据状态与课程更新动作" }
];

function evidenceStatusText(graph: CourseAbilityGraphPayload) {
  return capabilityMapSourceNotice(graph);
}

export function CapabilityAnalysisSections({
  graph,
  selectedNodeId
}: {
  graph: CourseAbilityGraphPayload;
  selectedNodeId: string;
}) {
  const [activeTab, setActiveTab] = useState<AnalysisTab>("skills");
  const selectedName = getSelectedName(graph, selectedNodeId);
  const context = useMemo(() => buildAnalysisContext(graph, selectedNodeId), [graph, selectedNodeId]);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.045)]">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">辅助分析</p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
            {selectedName ? `围绕“${selectedName}”的补充信息` : "用于课程研讨、专业论证和后续完善的补充信息"}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "rounded-2xl border px-4 py-2 text-left transition",
                activeTab === tab.id
                  ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-200"
              )}
            >
              <span className="block text-sm font-black">{tab.label}</span>
              <span className={cn("mt-0.5 block text-xs", activeTab === tab.id ? "text-blue-100" : "text-slate-500")}>{tab.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {activeTab === "skills" ? <SkillsAndJobs graph={graph} context={context} selectedName={selectedName} /> : null}
        {activeTab === "salary" ? <SalaryAndEmployment graph={graph} context={context} /> : null}
        {activeTab === "evidence" ? <EvidenceAndSuggestions graph={graph} context={context} selectedName={selectedName} /> : null}
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

function skillsForModule(moduleId: string) {
  const map: Record<string, string[]> = {
    script_design: ["剧本与分镜设计", "AI工具使用"],
    model_generation: ["模型生成与优化", "AI工具使用"],
    animation_production: ["动画制作"],
    scene_building: ["场景搭建", "AI工具使用"],
    render_output: ["渲染合成与输出", "项目展示与评价"]
  };
  return map[moduleId] || [];
}

function buildAnalysisContext(graph: CourseAbilityGraphPayload, selectedNodeId: string) {
  if (selectedNodeId === graph.courseAbilityMap.rootNode.id) {
    return {
      focused: false,
      skillNames: graph.skillWeights.map((item) => item.skill),
      jobIds: graph.relatedJobs.map((job) => job.id),
      evidenceIds: graph.evidenceSources.map((source) => source.id),
      teachingSuggestions: [] as string[]
    };
  }

  const stage = graph.workflowStages.find((item) => item.id === selectedNodeId);
  const module = graph.teachingModules.find((item) => item.id === selectedNodeId);
  const task = graph.tasks.find((item) => item.id === selectedNodeId);
  const relatedModule = task ? graph.teachingModules.find((item) => item.id === task.moduleId) : null;
  const stageModules = stage ? graph.teachingModules.filter((item) => stage.moduleIds.includes(item.id)) : [];
  const skillNames = [
    ...(module ? skillsForModule(module.id) : []),
    ...(relatedModule ? skillsForModule(relatedModule.id) : []),
    ...stageModules.flatMap((item) => skillsForModule(item.id))
  ];
  const jobIds = module?.relatedJobIds || task?.relatedJobIds || stageModules.flatMap((item) => item.relatedJobIds);
  const evidenceIds = module?.evidenceSourceIds || task?.evidenceSourceIds || stageModules.flatMap((item) => item.evidenceSourceIds);
  const teachingSuggestions = module?.teachingSuggestions || task?.teachingSuggestions || stageModules.flatMap((item) => item.teachingSuggestions);

  return {
    focused: true,
    skillNames: Array.from(new Set(skillNames)),
    jobIds: Array.from(new Set(jobIds)),
    evidenceIds: Array.from(new Set(evidenceIds)),
    teachingSuggestions: Array.from(new Set(teachingSuggestions))
  };
}

function SkillsAndJobs({
  context,
  graph,
  selectedName
}: {
  context: ReturnType<typeof buildAnalysisContext>;
  graph: CourseAbilityGraphPayload;
  selectedName: string | null;
}) {
  const skillWeights = graph.skillWeights.filter((item) => !context.focused || context.skillNames.includes(item.skill));
  const jobs = graph.relatedJobs.filter((job) => !context.focused || context.jobIds.includes(job.id));
  const visibleSkillWeights = skillWeights.length ? skillWeights : graph.skillWeights;
  const visibleJobs = jobs.length ? jobs : graph.relatedJobs;

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <AnalysisCard icon={BarChart3} title="技能权重" subtitle={selectedName ? "优先显示当前内容相关技能" : "课程核心技能完整占比"}>
        <div className="grid gap-4">
          {visibleSkillWeights.map((item) => (
            <div key={item.skill} className={cn(context.skillNames.includes(item.skill) && "rounded-2xl border border-blue-200 bg-blue-50 p-3")}>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-semibold text-slate-800">{item.skill}</span>
                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">{item.weight}%</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(100, item.weight))}%` }} />
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{item.description}</p>
            </div>
          ))}
        </div>
      </AnalysisCard>

      <AnalysisCard icon={BriefcaseBusiness} title="岗位关联" subtitle={selectedName ? "优先显示当前内容对应岗位" : "区域岗位与课程模块匹配"}>
        <JobList jobs={visibleJobs} focusedJobIds={context.jobIds} />
      </AnalysisCard>
    </div>
  );
}

function SalaryAndEmployment({
  context,
  graph
}: {
  context: ReturnType<typeof buildAnalysisContext>;
  graph: CourseAbilityGraphPayload;
}) {
  const focusedJobs = graph.relatedJobs.filter((job) => context.jobIds.includes(job.id));
  const focusedJobTitles = new Set(focusedJobs.map((job) => job.title));
  const salaries = graph.salaryRanges.filter((salary) => !context.focused || focusedJobTitles.has(salary.jobTitle));
  const visibleSalaries = salaries.length ? salaries : graph.salaryRanges;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      <AnalysisCard icon={BriefcaseBusiness} title="就业方向" subtitle={context.focused ? "与当前节点相关的岗位方向" : "课程整体面向岗位"}>
        <JobList jobs={focusedJobs.length ? focusedJobs : graph.relatedJobs} focusedJobIds={context.jobIds} />
      </AnalysisCard>

      <AnalysisCard icon={WalletCards} title="薪资区间" subtitle="当前为待校准区间，后续需由真实岗位数据校准">
        <div className="grid gap-3">
          {visibleSalaries.map((salary) => (
            <div key={salary.jobTitle} className={cn("rounded-2xl border border-slate-200 bg-slate-50 p-4", focusedJobTitles.has(salary.jobTitle) && "border-blue-200 bg-blue-50")}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-900">{salary.jobTitle}</h3>
                  <p className="mt-1 text-xs text-slate-500">{salary.region}</p>
                </div>
                <span className="text-sm font-black text-slate-900">
                  {salary.min.toLocaleString("zh-CN")} - {salary.max.toLocaleString("zh-CN")}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{salary.note}</p>
            </div>
          ))}
        </div>
      </AnalysisCard>
    </div>
  );
}

function EvidenceAndSuggestions({
  context,
  graph,
  selectedName
}: {
  context: ReturnType<typeof buildAnalysisContext>;
  graph: CourseAbilityGraphPayload;
  selectedName: string | null;
}) {
  const evidence = graph.evidenceSources.filter((source) => !context.focused || context.evidenceIds.includes(source.id));
  const visibleEvidence = evidence.length ? evidence : graph.evidenceSources;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      <AnalysisCard icon={FileText} title="证据来源" subtitle="不伪造真实政策、报告或网页链接">
        <div className="grid gap-3">
          {visibleEvidence.map((source) => (
            <div key={source.id} className={cn("rounded-2xl border border-slate-200 bg-slate-50 p-4", context.evidenceIds.includes(source.id) && "border-blue-200 bg-blue-50")}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="mr-auto font-semibold text-slate-900">{source.title}</h3>
                <Pill>{sourceTypeLabels[source.sourceType]}</Pill>
                <Pill>可信度 {reliabilityLabels[source.reliability]}</Pill>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{source.summary}</p>
              <p className="mt-3 text-xs font-medium text-amber-700">{evidenceStatusText(graph)}</p>
            </div>
          ))}
        </div>
      </AnalysisCard>

      <AnalysisCard icon={GraduationCap} title="课程更新建议" subtitle={selectedName ? "当前内容的教学建议与课程层面建议" : "从产业变化回落到可执行教学动作"}>
        <div className="grid gap-3">
          {selectedName && context.teachingSuggestions.length ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <h3 className="font-semibold text-slate-900">{selectedName}</h3>
              <div className="mt-3 grid gap-2">
                {context.teachingSuggestions.map((action) => (
                  <div key={action} className="rounded-xl bg-white px-3 py-2 text-sm leading-5 text-slate-600">{action}</div>
                ))}
              </div>
            </div>
          ) : null}
          {graph.updateSuggestions.map((suggestion) => (
            <div key={suggestion.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-semibold text-slate-900">{suggestion.title}</h3>
                <Pill className={cn(suggestion.priority === "high" && "border-blue-200 bg-blue-50 text-blue-700")}>
                  {priorityLabels[suggestion.priority]}
                </Pill>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{suggestion.reason}</p>
            </div>
          ))}
        </div>
      </AnalysisCard>
    </div>
  );
}

function JobList({ focusedJobIds, jobs }: { focusedJobIds: string[]; jobs: CourseRelatedJob[] }) {
  return (
    <div className="grid gap-3">
      {jobs.map((job) => (
        <div key={job.id} className={cn("rounded-2xl border border-slate-200 bg-slate-50 p-4", focusedJobIds.includes(job.id) && "border-blue-200 bg-blue-50")}>
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-semibold text-slate-900">{job.title}</h3>
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">{job.relevance}%</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{job.reason}</p>
        </div>
      ))}
    </div>
  );
}

function AnalysisCard({
  children,
  icon: Icon,
  subtitle,
  title
}: {
  children: React.ReactNode;
  icon: typeof BarChart3;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5">
      <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-black text-slate-950">
            <Icon className="h-5 w-5 text-blue-600" />
            {title}
          </h3>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-500", className)}>
      {children}
    </span>
  );
}
