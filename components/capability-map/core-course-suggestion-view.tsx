"use client";

import { BookOpenCheck, FileText, Network, ShieldCheck } from "lucide-react";

import { ProcessGraphStageView } from "@/components/capability-map/process-graph-stage-view";
import type { CoreCourseSuggestion, CourseAbilityGraphPayload } from "@/lib/capability-map/course-ability-graph";
import { cn } from "@/lib/utils";

function currentCourseSuggestion(graph: CourseAbilityGraphPayload) {
  return graph.coreCourseSuggestions.find((course) => course.isCurrentCourse) || graph.coreCourseSuggestions[0] || null;
}

function selectedCourseSuggestion(graph: CourseAbilityGraphPayload, selectedCourseId: string | null) {
  return graph.coreCourseSuggestions.find((course) => course.id === selectedCourseId) || currentCourseSuggestion(graph);
}

function courseIdFromNodeId(graph: CourseAbilityGraphPayload, nodeId: string) {
  const direct = graph.coreCourseSuggestions.find((course) => course.id === nodeId);
  if (direct) return direct.id;

  const position = graph.coreCourseSuggestions.find((course) => `${course.id}_position` === nodeId);
  if (position) return position.id;

  const abilityCourse = graph.coreCourseSuggestions.find((course) =>
    (course.supportedAbilityIds || []).some((abilityId) => `core_${abilityId}` === nodeId)
  );
  return abilityCourse?.id || currentCourseSuggestion(graph)?.id || null;
}

export function CoreCourseSuggestionView({
  graph,
  onOpenCurrentCourseGraph,
  onSelectCourse,
  selectedCourseId
}: {
  graph: CourseAbilityGraphPayload;
  onOpenCurrentCourseGraph: () => void;
  onSelectCourse: (courseId: string) => void;
  selectedCourseId: string | null;
}) {
  const currentCourse = currentCourseSuggestion(graph);
  const activeCourse = selectedCourseSuggestion(graph, selectedCourseId);

  return (
    <ProcessGraphStageView
      currentNodeIds={currentCourse ? [currentCourse.id] : []}
      generationKey={graph.meta.generatedAt}
      nodeActions={Object.fromEntries(
        graph.coreCourseSuggestions.map((course) => [
          course.id,
          course.status === "available"
            ? {
                label: "查看课程能力图谱",
                onClick: onOpenCurrentCourseGraph,
                variant: "primary" as const
              }
            : {
                disabled: true,
                label: "后续可生成",
                variant: "muted" as const
              }
        ])
      )}
      onSelectNode={(nodeId) => {
        const courseId = courseIdFromNodeId(graph, nodeId);
        if (courseId) onSelectCourse(courseId);
      }}
      selectedNodeId={activeCourse?.id || currentCourse?.id || null}
      stage={graph.coreCourseGraph}
    />
  );
}

export function CoreCourseSuggestionDetail({
  graph,
  onOpenCurrentCourseGraph,
  selectedCourseId
}: {
  graph: CourseAbilityGraphPayload;
  onOpenCurrentCourseGraph: () => void;
  selectedCourseId: string | null;
}) {
  const selectedCourse = selectedCourseSuggestion(graph, selectedCourseId);

  return (
    <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-[0_20px_60px_rgba(37,99,235,0.08)]">
      <div className="border-b border-slate-200 pb-4">
        <span className="inline-flex h-7 items-center rounded-full border border-blue-100 bg-blue-50 px-3 text-xs font-bold text-blue-700">
          专业核心课程建设建议
        </span>
        <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">{selectedCourse?.name || graph.coreCourseGraph.title}</h2>
        <p className="mt-2 text-sm text-slate-500">{selectedCourse?.isCurrentCourse ? "当前课程能力图谱入口" : "建议核心课程"}</p>
      </div>

      {selectedCourse ? (
        <div className="mt-5 space-y-5">
          <DetailBlock icon={<Network className="h-4 w-4" />} title="阶段推导">
            {graph.coreCourseGraph.summary}
          </DetailBlock>

          <DetailBlock icon={<BookOpenCheck className="h-4 w-4" />} title="课程定位">
            {selectedCourse.position}
          </DetailBlock>

          {selectedCourse.description ? (
            <DetailBlock icon={<ShieldCheck className="h-4 w-4" />} title="课程说明">
              {selectedCourse.description}
            </DetailBlock>
          ) : null}

          <TokenGroup title="支撑专业能力" values={selectedCourse.supportedAbilityNames} />
          <TokenGroup title="支撑岗位" values={selectedCourse.relatedJobNames} />

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-black text-slate-950">生成状态</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {selectedCourse.status === "available"
                ? "当前课程已接入现有课程能力图谱，可继续查看课程 → 工作流程 → 教学模块 → 任务/能力点。"
                : "该课程暂作为专业课程体系建议展示，后续可继续生成对应课程能力图谱。"}
            </p>
            {selectedCourse.status === "available" ? (
              <button
                type="button"
                onClick={onOpenCurrentCourseGraph}
                className="mt-3 inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(37,99,235,0.22)] transition hover:bg-blue-700"
              >
                查看课程能力图谱
              </button>
            ) : (
              <span className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-500">
                后续可生成课程能力图谱
              </span>
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-5 border-t border-slate-200 pt-5">
        <p className="flex items-center gap-2 text-sm font-black text-blue-700">
          <FileText className="h-4 w-4" />
          证据状态
        </p>
        <p className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">
          {graph.coreCourseGraph.notice}
        </p>
      </div>
    </section>
  );
}

function DetailBlock({ children, icon, title }: { children: string; icon: React.ReactNode; title: string }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-black text-blue-700">
        {icon}
        {title}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{children}</p>
    </div>
  );
}

function TokenGroup({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <p className="text-sm font-black text-slate-950">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value, index) => (
          <span
            key={`${title}-${value}-${index}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-bold",
              title.includes("岗位") ? "border-amber-100 bg-amber-50 text-amber-700" : "border-blue-100 bg-blue-50 text-blue-700"
            )}
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
