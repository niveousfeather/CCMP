"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BookOpenCheck, BriefcaseBusiness, ClipboardCheck, FileText, Layers3, PencilLine, Save, Target, TrendingUp, X } from "lucide-react";

import type {
  CourseAbilityGraphPayload,
  CourseTaskNode,
  TeachingModuleNode,
  WorkflowStage
} from "@/lib/capability-map/course-ability-graph";
import { capabilityMapSourceNotice } from "@/lib/capability-map/source-status";

function findById<T extends { id: string }>(items: T[], ids: string[]) {
  const idSet = new Set(ids);
  return items.filter((item) => idSet.has(item.id));
}

function evidenceStatusText(graph: CourseAbilityGraphPayload) {
  return capabilityMapSourceNotice(graph);
}

export function CourseAbilityDetailPanel({
  editMode = false,
  graph,
  onOpenCourseMapping,
  onUpdateCourse,
  onUpdateTask,
  onUpdateTeachingModule,
  onUpdateWorkflow,
  selectedNodeId
}: {
  editMode?: boolean;
  graph: CourseAbilityGraphPayload;
  onOpenCourseMapping?: () => void;
  onUpdateCourse?: (patch: { courseName: string; majorDirection: string; positioning: string; region: string }) => void;
  onUpdateTask?: (taskId: string, patch: { description: string; name: string }) => void;
  onUpdateTeachingModule?: (moduleId: string, patch: { description: string; hours: number; name: string }) => void;
  onUpdateWorkflow?: (stageId: string, patch: { description: string; name: string }) => void;
  selectedNodeId: string;
}) {
  const selectedWorkflow = graph.workflowStages.find((stage) => stage.id === selectedNodeId) || null;
  const selectedModule = graph.teachingModules.find((module) => module.id === selectedNodeId) || null;
  const selectedTask = graph.tasks.find((task) => task.id === selectedNodeId) || null;
  const rootSelected = selectedNodeId === graph.courseAbilityMap.rootNode.id || (!selectedWorkflow && !selectedModule && !selectedTask);

  return (
    <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-[0_20px_60px_rgba(37,99,235,0.08)]">
      {rootSelected ? (
        <CourseRootDetail editMode={editMode} graph={graph} onUpdateCourse={onUpdateCourse} />
      ) : null}
      {selectedWorkflow ? (
        <WorkflowDetail editMode={editMode} graph={graph} stage={selectedWorkflow} onUpdateWorkflow={onUpdateWorkflow} />
      ) : null}
      {selectedModule ? (
        <ModuleDetail
          editMode={editMode}
          graph={graph}
          module={selectedModule}
          onOpenCourseMapping={onOpenCourseMapping}
          onUpdateTeachingModule={onUpdateTeachingModule}
        />
      ) : null}
      {selectedTask ? (
        <TaskDetail editMode={editMode} graph={graph} task={selectedTask} onUpdateTask={onUpdateTask} />
      ) : null}
    </section>
  );
}

function CourseRootDetail({
  editMode,
  graph,
  onUpdateCourse
}: {
  editMode: boolean;
  graph: CourseAbilityGraphPayload;
  onUpdateCourse?: (patch: { courseName: string; majorDirection: string; positioning: string; region: string }) => void;
}) {
  const targetJobs = findById(graph.regionalJobMap, graph.courseProfile.targetJobIds);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    courseName: graph.course.courseName,
    majorDirection: graph.course.majorDirection,
    positioning: graph.courseProfile.positioning,
    region: graph.course.region
  });

  useEffect(() => {
    setEditing(false);
    setDraft({
      courseName: graph.course.courseName,
      majorDirection: graph.course.majorDirection,
      positioning: graph.courseProfile.positioning,
      region: graph.course.region
    });
  }, [editMode, graph.course.courseName, graph.course.majorDirection, graph.course.region, graph.courseProfile.positioning]);

  return (
    <>
      <DetailHeader eyebrow="课程" title={`《${graph.course.courseName}》`} subtitle={`${graph.course.majorDirection} · ${graph.course.region}`} />

      {editMode && onUpdateCourse ? (
        <EditBlock editing={editing} onBegin={() => setEditing(true)} label="编辑课程信息">
          {editing ? (
            <div className="grid gap-3">
              <TextInput label="课程名称" value={draft.courseName} onChange={(courseName) => setDraft((current) => ({ ...current, courseName }))} />
              <TextInput label="专业方向" value={draft.majorDirection} onChange={(majorDirection) => setDraft((current) => ({ ...current, majorDirection }))} />
              <TextInput label="地区" value={draft.region} onChange={(region) => setDraft((current) => ({ ...current, region }))} />
              <TextArea label="课程定位" value={draft.positioning} onChange={(positioning) => setDraft((current) => ({ ...current, positioning }))} />
              <SaveCancel
                onCancel={() => setEditing(false)}
                onSave={() => {
                  onUpdateCourse({
                    courseName: draft.courseName.trim() || graph.course.courseName,
                    majorDirection: draft.majorDirection.trim() || graph.course.majorDirection,
                    positioning: draft.positioning.trim() || graph.courseProfile.positioning,
                    region: draft.region.trim() || graph.course.region
                  });
                  setEditing(false);
                }}
              />
            </div>
          ) : null}
        </EditBlock>
      ) : null}

      <DetailSection icon={Target} title="课程定位">
        <p>{graph.courseProfile.positioning}</p>
      </DetailSection>

      <DetailSection icon={Layers3} title="工作流程结构">
        <TagList items={graph.workflowStages.map((stage) => `${stage.name} · ${stage.moduleIds.length} 个教学模块`)} />
      </DetailSection>

      <DetailSection icon={BriefcaseBusiness} title="面向岗位">
        <TagList items={targetJobs.map((job) => `${job.title} · 匹配度 ${job.relevance}%`)} />
      </DetailSection>

      <DetailSection icon={FileText} title="证据状态">
        <EvidenceNotice graph={graph} />
      </DetailSection>
    </>
  );
}

function WorkflowDetail({
  editMode,
  graph,
  onUpdateWorkflow,
  stage
}: {
  editMode: boolean;
  graph: CourseAbilityGraphPayload;
  onUpdateWorkflow?: (stageId: string, patch: { description: string; name: string }) => void;
  stage: WorkflowStage;
}) {
  const modules = graph.teachingModules.filter((module) => stage.moduleIds.includes(module.id));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ description: stage.description || "", name: stage.name });

  useEffect(() => {
    setEditing(false);
    setDraft({ description: stage.description || "", name: stage.name });
  }, [editMode, stage.description, stage.id, stage.name]);

  return (
    <>
      <DetailHeader eyebrow="工作流程" title={stage.name} subtitle={`${modules.length} 个教学模块`} />

      {editMode && onUpdateWorkflow ? (
        <EditBlock editing={editing} onBegin={() => setEditing(true)} label="编辑当前工作流程">
          {editing ? (
            <div className="grid gap-3">
              <TextInput label="工作流程名称" value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} />
              <TextArea label="工作流程说明" value={draft.description} onChange={(description) => setDraft((current) => ({ ...current, description }))} />
              <SaveCancel
                onCancel={() => setEditing(false)}
                onSave={() => {
                  onUpdateWorkflow(stage.id, {
                    description: draft.description.trim() || stage.description || "",
                    name: draft.name.trim() || stage.name
                  });
                  setEditing(false);
                }}
              />
            </div>
          ) : null}
        </EditBlock>
      ) : null}

      <DetailSection icon={Target} title="流程说明">
        <p>{stage.description}</p>
      </DetailSection>

      <DetailSection icon={BookOpenCheck} title="包含教学模块">
        <TagList items={modules.map((module) => `${module.name}${module.hours ? ` · ${module.hours} 学时` : ""}`)} />
      </DetailSection>

      <DetailSection icon={FileText} title="证据状态">
        <EvidenceNotice graph={graph} />
      </DetailSection>
    </>
  );
}

function ModuleDetail({
  editMode,
  graph,
  module,
  onOpenCourseMapping,
  onUpdateTeachingModule
}: {
  editMode: boolean;
  graph: CourseAbilityGraphPayload;
  module: TeachingModuleNode;
  onOpenCourseMapping?: () => void;
  onUpdateTeachingModule?: (moduleId: string, patch: { description: string; hours: number; name: string }) => void;
}) {
  const stage = graph.workflowStages.find((item) => item.id === module.workflowStageId);
  const tasks = graph.tasks.filter((task) => module.taskIds.includes(task.id));
  const jobs = findById(graph.regionalJobMap, module.relatedJobIds);
  const trends = findById(graph.industryTrends, module.trendIds);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ description: module.description || "", hours: String(module.hours || 0), name: module.name });

  useEffect(() => {
    setEditing(false);
    setDraft({ description: module.description || "", hours: String(module.hours || 0), name: module.name });
  }, [editMode, module.description, module.hours, module.id, module.name]);

  return (
    <>
      <DetailHeader eyebrow="教学模块" title={module.name} subtitle={`${stage?.name || "未标注阶段"}${module.hours ? ` · ${module.hours} 学时` : ""}`} />

      {editMode && onUpdateTeachingModule ? (
        <EditBlock editing={editing} onBegin={() => setEditing(true)} label="编辑当前教学模块">
          {editing ? (
            <div className="grid gap-3">
              <TextInput label="教学模块名称" value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} />
              <TextInput label="学时" value={draft.hours} onChange={(hours) => setDraft((current) => ({ ...current, hours }))} type="number" />
              <TextArea label="教学模块说明" value={draft.description} onChange={(description) => setDraft((current) => ({ ...current, description }))} />
              <SaveCancel
                onCancel={() => setEditing(false)}
                onSave={() => {
                  const parsedHours = Number(draft.hours);
                  onUpdateTeachingModule(module.id, {
                    description: draft.description.trim() || module.description || "",
                    hours: Number.isFinite(parsedHours) ? Math.max(0, Math.round(parsedHours)) : module.hours || 0,
                    name: draft.name.trim() || module.name
                  });
                  setEditing(false);
                }}
              />
            </div>
          ) : null}
        </EditBlock>
      ) : null}

      {onOpenCourseMapping ? (
        <button
          type="button"
          onClick={onOpenCourseMapping}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
        >
          <BookOpenCheck className="h-4 w-4" />
          查看课程映射
        </button>
      ) : null}

      <DetailSection icon={Target} title="模块说明">
        <p>{module.description}</p>
      </DetailSection>

      <DetailSection icon={Layers3} title="任务 / 能力点">
        <TagList items={tasks.map((task) => task.name)} />
      </DetailSection>

      <DetailSection icon={BriefcaseBusiness} title="对应岗位">
        <TagList items={jobs.map((job) => `${job.title} · 匹配度 ${job.relevance}%`)} />
      </DetailSection>

      <DetailSection icon={TrendingUp} title="支撑趋势">
        <TagList items={trends.map((trend) => trend.name)} />
      </DetailSection>

      <DetailSection icon={ClipboardCheck} title="考核方式">
        <BulletList items={module.assessmentMethods} />
      </DetailSection>

      <DetailSection icon={FileText} title="证据状态">
        <EvidenceNotice graph={graph} />
      </DetailSection>
    </>
  );
}

function TaskDetail({
  editMode,
  graph,
  onUpdateTask,
  task
}: {
  editMode: boolean;
  graph: CourseAbilityGraphPayload;
  onUpdateTask?: (taskId: string, patch: { description: string; name: string }) => void;
  task: CourseTaskNode;
}) {
  const module = graph.teachingModules.find((item) => item.id === task.moduleId);
  const jobs = findById(graph.regionalJobMap, task.relatedJobIds);
  const trends = findById(graph.industryTrends, task.trendIds);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ description: task.description || "", name: task.name });

  useEffect(() => {
    setEditing(false);
    setDraft({ description: task.description || "", name: task.name });
  }, [editMode, task.description, task.id, task.name]);

  return (
    <>
      <DetailHeader eyebrow="任务 / 能力点" title={task.name} subtitle={module ? `所属教学模块：${module.name}` : "未标注教学模块"} />

      {editMode && onUpdateTask ? (
        <EditBlock editing={editing} onBegin={() => setEditing(true)} label="编辑当前任务">
          {editing ? (
            <div className="grid gap-3">
              <TextInput label="任务 / 能力点名称" value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} />
              <TextArea label="任务 / 能力点说明" value={draft.description} onChange={(description) => setDraft((current) => ({ ...current, description }))} />
              <SaveCancel
                onCancel={() => setEditing(false)}
                onSave={() => {
                  onUpdateTask(task.id, {
                    description: draft.description.trim() || task.description || "",
                    name: draft.name.trim() || task.name
                  });
                  setEditing(false);
                }}
              />
            </div>
          ) : null}
        </EditBlock>
      ) : null}

      <DetailSection icon={Target} title="任务说明">
        <p>{task.description}</p>
      </DetailSection>

      <DetailSection icon={Layers3} title="能力标签">
        <TagList items={task.abilityTags || []} />
      </DetailSection>

      {task.aiTools?.length ? (
        <DetailSection icon={BookOpenCheck} title="可使用工具">
          <TagList items={task.aiTools} />
        </DetailSection>
      ) : null}

      <DetailSection icon={BriefcaseBusiness} title="对应岗位">
        <TagList items={jobs.map((job) => `${job.title} · 匹配度 ${job.relevance}%`)} />
      </DetailSection>

      <DetailSection icon={TrendingUp} title="支撑趋势">
        <TagList items={trends.map((trend) => trend.name)} />
      </DetailSection>

      <DetailSection icon={FileText} title="证据状态">
        <EvidenceNotice graph={graph} />
      </DetailSection>
    </>
  );
}

function DetailHeader({ eyebrow, subtitle, title }: { eyebrow: string; subtitle: string; title: string }) {
  return (
    <div className="border-b border-slate-200 pb-4">
      <span className="inline-flex h-7 items-center rounded-full border border-blue-100 bg-blue-50 px-3 text-xs font-bold text-blue-700">{eyebrow}</span>
      <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function DetailSection({
  children,
  icon: Icon,
  title
}: {
  children: ReactNode;
  icon: typeof Target;
  title: string;
}) {
  return (
    <section className="border-b border-slate-200 py-4 last:border-b-0">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
        <Icon className="h-4 w-4 text-blue-600" />
        {title}
      </h3>
      <div className="text-sm leading-6 text-slate-600">{children}</div>
    </section>
  );
}

function EditBlock({
  children,
  editing,
  label,
  onBegin
}: {
  children: ReactNode;
  editing: boolean;
  label: string;
  onBegin: () => void;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-3">
      {editing ? (
        children
      ) : (
        <button
          type="button"
          onClick={onBegin}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-black text-blue-700 transition hover:border-blue-300"
        >
          <PencilLine className="h-4 w-4" />
          {label}
        </button>
      )}
    </div>
  );
}

function TextInput({
  label,
  onChange,
  type = "text",
  value
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-bold text-slate-600">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-blue-300"
      />
    </label>
  );
}

function TextArea({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="grid gap-1.5 text-xs font-bold text-slate-600">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-950 outline-none focus:border-blue-300"
      />
    </label>
  );
}

function SaveCancel({ onCancel, onSave }: { onCancel: () => void; onSave: () => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <button type="button" onClick={onSave} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-black text-white">
        <Save className="h-4 w-4" />
        保存
      </button>
      <button type="button" onClick={onCancel} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700">
        <X className="h-4 w-4" />
        取消
      </button>
    </div>
  );
}

function EvidenceNotice({ graph }: { graph: CourseAbilityGraphPayload }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
      {evidenceStatusText(graph)}
    </div>
  );
}

function TagList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
          {item}
        </span>
      ))}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li key={item} className="rounded-2xl bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">
          {item}
        </li>
      ))}
    </ul>
  );
}
