"use client";

import { useState } from "react";
import { ArrowDown, Layers3, Network, PencilLine, ShieldCheck, Sparkles } from "lucide-react";

import { CapabilityAnalysisSections } from "@/components/capability-map/capability-analysis-sections";
import { CourseAbilityDetailPanel } from "@/components/capability-map/course-ability-detail-panel";
import { CourseAbilityGraphView } from "@/components/capability-map/course-ability-graph-view";
import { CourseMappingView } from "@/components/capability-map/course-mapping-view";
import {
  CourseRequestPanel,
  DEFAULT_COURSE_REQUEST,
  parseCourseRequestText
} from "@/components/capability-map/course-request-panel";
import { IcebergModel } from "@/components/capability-map/iceberg-model";
import { IndustryImpactPaths } from "@/components/capability-map/industry-impact-paths";
import { createMockCourseAbilityGraph } from "@/lib/capability-map/course-ability-graph";
import type {
  CourseAbilityGraphInput,
  CourseAbilityGraphPayload
} from "@/lib/capability-map/course-ability-graph";
import styles from "@/components/capability-map/capability-map-theme.module.css";
import { cn } from "@/lib/utils";

const defaultForm: CourseAbilityGraphInput = {
  courseName: "AI动画全流程制作",
  majorDirection: "影视动画",
  region: "重庆"
};

type CapabilityMapViewMode = "overview" | "mapping";

function normalizeForm(form: CourseAbilityGraphInput): CourseAbilityGraphInput {
  return {
    courseName: form.courseName.trim(),
    majorDirection: form.majorDirection.trim(),
    region: form.region.trim()
  };
}

export function CapabilityMapEntry() {
  const [requestText, setRequestText] = useState(DEFAULT_COURSE_REQUEST);
  const [lastParsedText, setLastParsedText] = useState(DEFAULT_COURSE_REQUEST);
  const [form, setForm] = useState<CourseAbilityGraphInput>(defaultForm);
  const [graph, setGraph] = useState<CourseAbilityGraphPayload>(() => createMockCourseAbilityGraph(defaultForm));
  const [selectedNodeId, setSelectedNodeId] = useState<string>(graph.courseAbilityMap.rootNode.id);
  const [viewMode, setViewMode] = useState<CapabilityMapViewMode>("overview");
  const [activeMappingModuleId, setActiveMappingModuleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const mappableModuleIds = graph.moduleMappings.map((mapping) => mapping.moduleId);
  const activeModuleMapping = activeMappingModuleId
    ? graph.moduleMappings.find((mapping) => mapping.moduleId === activeMappingModuleId) || null
    : null;
  const mappingViewActive = viewMode === "mapping" && Boolean(activeModuleMapping);

  function parseRequest() {
    const parsed = parseCourseRequestText(requestText, form);
    setForm(parsed);
    setLastParsedText(requestText);
    setError(null);
  }

  function generateLocalGraph() {
    const parsedForm = requestText === lastParsedText ? form : parseCourseRequestText(requestText, form);
    const nextForm = normalizeForm(parsedForm);

    if (!nextForm.courseName || !nextForm.majorDirection || !nextForm.region) {
      setError("请补充课程名称、专业方向和地区后再生成课程能力图谱。");
      return;
    }

    const nextGraph = createMockCourseAbilityGraph(nextForm);
    setForm(nextForm);
    setLastParsedText(requestText);
    setGraph(nextGraph);
    setSelectedNodeId(nextGraph.courseAbilityMap.rootNode.id);
    setViewMode("overview");
    setActiveMappingModuleId(null);
    setEditMode(false);
    setEditNotice(null);
    setError(null);
  }

  function selectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setActiveMappingModuleId(null);
    setViewMode("overview");
  }

  function openCourseMappingFromModule(moduleId: string) {
    const mapping = graph.moduleMappings.find((item) => item.moduleId === moduleId);
    if (!mapping) return;
    setSelectedNodeId(moduleId);
    setActiveMappingModuleId(mapping.moduleId);
    setViewMode("mapping");
  }

  function returnToOverview() {
    setViewMode("overview");
    setActiveMappingModuleId(null);
  }

  function updateCourse(patch: { courseName: string; majorDirection: string; region: string; positioning: string }) {
    setGraph((current) => ({
      ...current,
      course: {
        courseName: patch.courseName,
        majorDirection: patch.majorDirection,
        region: patch.region
      },
      courseAbilityMap: {
        ...current.courseAbilityMap,
        rootNode: {
          ...current.courseAbilityMap.rootNode,
          description: patch.positioning,
          name: `课程：${patch.courseName}`
        }
      },
      courseProfile: {
        ...current.courseProfile,
        positioning: patch.positioning
      }
    }));
    setForm({ courseName: patch.courseName, majorDirection: patch.majorDirection, region: patch.region });
    setEditNotice("已更新课程信息，并同步到页面标题、课程中心节点和右侧详情。后续能力权重、岗位占比和证据链仍需人工审核或后续智能生成。");
  }

  function updateWorkflow(stageId: string, patch: { description: string; name: string }) {
    setGraph((current) => ({
      ...current,
      workflowStages: current.workflowStages.map((stage) => (stage.id === stageId ? { ...stage, ...patch } : stage)),
      courseAbilityMap: {
        ...current.courseAbilityMap,
        nodes: current.courseAbilityMap.nodes.map((node) => (node.id === stageId ? { ...node, description: patch.description, name: patch.name } : node))
      },
      courseProfile: {
        ...current.courseProfile,
        coreAbilityStructure: current.workflowStages.map((stage) =>
          stage.id === stageId ? `${patch.name}（${stage.moduleIds.length} 个教学模块）` : `${stage.name}（${stage.moduleIds.length} 个教学模块）`
        )
      }
    }));
    setEditNotice("已更新工作流程，并同步到主图谱、相关模块所属阶段显示和右侧详情。");
  }

  function updateTeachingModule(moduleId: string, patch: { description: string; hours: number; name: string }) {
    setGraph((current) => ({
      ...current,
      teachingModules: current.teachingModules.map((module) => (module.id === moduleId ? { ...module, ...patch } : module)),
      moduleMappings: current.moduleMappings.map((mapping) =>
        mapping.moduleId === moduleId ? { ...mapping, hours: patch.hours, moduleName: patch.name } : mapping
      )
    }));
    setEditNotice("已更新教学模块，并同步到主图谱节点、课程映射入口、映射画布标题和右侧详情。");
  }

  function updateTask(taskId: string, patch: { description: string; name: string }) {
    setGraph((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
      courseAbilityMap: {
        ...current.courseAbilityMap,
        nodes: current.courseAbilityMap.nodes.map((node) => (node.id === taskId ? { ...node, description: patch.description, name: patch.name } : node))
      }
    }));
    setEditNotice("已更新任务/能力点，并同步到主图谱节点和右侧详情。");
  }

  function updateTypicalWorkProject(moduleId: string, patch: { description: string; name: string }) {
    setGraph((current) => ({
      ...current,
      moduleMappings: current.moduleMappings.map((mapping) =>
        mapping.moduleId === moduleId
          ? {
              ...mapping,
              typicalWorkProject: {
                ...mapping.typicalWorkProject,
                description: patch.description,
                name: patch.name
              }
            }
          : mapping
      )
    }));
    setEditNotice("已更新典型工作项目，并同步到课程映射画布和映射说明。");
  }

  function updateMappingDimension(moduleId: string, dimensionKey: string, patch: { title: string }) {
    setGraph((current) => ({
      ...current,
      moduleMappings: current.moduleMappings.map((mapping) =>
        mapping.moduleId === moduleId
          ? {
              ...mapping,
              mappingDimensions: mapping.mappingDimensions.map((dimension) =>
                dimension.key === dimensionKey ? { ...dimension, title: patch.title } : dimension
              )
            }
          : mapping
      )
    }));
    setEditNotice("已更新课程映射维度，并同步到映射画布和轻量详情。");
  }

  function updateMappingItem(moduleId: string, itemId: string, patch: { description: string; text: string }) {
    setGraph((current) => ({
      ...current,
      moduleMappings: current.moduleMappings.map((mapping) =>
        mapping.moduleId === moduleId
          ? {
              ...mapping,
              mappingDimensions: mapping.mappingDimensions.map((dimension) => ({
                ...dimension,
                items: dimension.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
              }))
            }
          : mapping
      )
    }));
    setEditNotice("已更新课程映射小点，并同步到映射画布和轻量详情。");
  }

  return (
    <main className={cn(styles.root, "capability-map-root min-h-screen")}>
      <div className="w-full px-4 py-4 lg:px-5">
        <header className="mb-4 rounded-3xl border border-blue-100 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(37,99,235,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <ShieldCheck className="h-4 w-4" />
                面向高校教师的课程能力图谱产品原型
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
                重庆地区影视动画专业《{graph.course.courseName}》课程能力图谱
              </h1>
            </div>
          </div>
        </header>

        <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[330px_minmax(720px,1fr)_390px]">
          <aside className="xl:sticky xl:top-5">
            <CourseRequestPanel
              error={error}
              form={form}
              onFormChange={setForm}
              onGenerate={generateLocalGraph}
              onParse={parseRequest}
              onPromptChange={setRequestText}
              prompt={requestText}
            />
          </aside>

          <section className="min-w-0 rounded-3xl border border-blue-100 bg-white p-5 shadow-[0_24px_70px_rgba(37,99,235,0.1)]">
            <div className="mb-4 flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                  {mappingViewActive ? <Layers3 className="h-4 w-4" /> : <Network className="h-4 w-4" />}
                  {mappingViewActive ? "课程映射展开画布" : "课程能力图谱主画布"}
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                  {mappingViewActive && activeModuleMapping
                    ? `当前教学模块：${activeModuleMapping.moduleName}`
                    : `${graph.course.majorDirection} · 《${graph.course.courseName}》`}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {mappingViewActive
                    ? "从当前教学模块展开典型工作项目、七个课程映射维度和具体小点，解释这个模块为什么这样设置。"
                    : "主画布按课程、工作流程、教学模块和任务/能力点四级展开，帮助教师看到课程内容如何落到项目任务。"}
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-blue-700">
                  {mappingViewActive
                    ? "点击典型工作项目、维度或小点，可同步高亮相关节点和连线。"
                    : "点击教学模块本身查看详情；点击教学模块下方“课程映射”徽标可切换到映射展开画布。"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-blue-700">{graph.course.region}</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">本地示例</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">不可正式引用</span>
                <button
                  type="button"
                  onClick={() => setEditMode((current) => !current)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-bold transition",
                    editMode ? "border-blue-500 bg-blue-600 text-white" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-200"
                  )}
                >
                  <PencilLine className="h-3.5 w-3.5" />
                  {editMode ? "退出编辑模式" : "编辑模式"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditNotice("智能生成能力暂未开启，后续接入 GPT-5.4 后可用。")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-bold text-slate-500 transition hover:border-blue-200 hover:text-blue-700"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  基于修改重新生成后续内容
                </button>
              </div>
            </div>
            {editMode ? (
              <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold leading-6 text-blue-700">
                编辑模式已开启：本轮修改只保存在当前页面，刷新后恢复本地示例数据。
              </div>
            ) : null}
            {editNotice ? (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-600">
                {editNotice}
              </div>
            ) : null}
            {mappingViewActive && activeModuleMapping ? (
              <CourseMappingView
                editMode={editMode}
                mapping={activeModuleMapping}
                onBack={returnToOverview}
                onUpdateMappingDimension={updateMappingDimension}
                onUpdateMappingItem={updateMappingItem}
                onUpdateTypicalWorkProject={updateTypicalWorkProject}
              />
            ) : (
              <CourseAbilityGraphView
                graph={graph}
                mappableModuleIds={mappableModuleIds}
                onOpenCourseMappingFromModule={openCourseMappingFromModule}
                selectedNodeId={selectedNodeId}
                onSelectNode={selectNode}
              />
            )}
          </section>

          <aside className="xl:col-start-2 2xl:sticky 2xl:top-5 2xl:col-start-auto">
            <CourseAbilityDetailPanel
              editMode={editMode}
              graph={graph}
              onOpenCourseMapping={() => {
                if (graph.moduleMappings.some((mapping) => mapping.moduleId === selectedNodeId)) {
                  openCourseMappingFromModule(selectedNodeId);
                }
              }}
              onUpdateCourse={updateCourse}
              onUpdateTask={updateTask}
              onUpdateTeachingModule={updateTeachingModule}
              onUpdateWorkflow={updateWorkflow}
              selectedNodeId={selectedNodeId}
            />
          </aside>
        </div>

        {!mappingViewActive ? (
          <>
            <div className="mt-6 flex justify-center text-blue-500" aria-hidden="true">
              <ArrowDown className="h-5 w-5" />
            </div>

            <section className="mt-5 grid gap-5">
              <IndustryImpactPaths
                paths={graph.impactPaths}
                evidenceSources={graph.evidenceSources}
                graph={graph}
                selectedNodeId={selectedNodeId}
              />
              <IcebergModel graph={graph} />
              <CapabilityAnalysisSections graph={graph} selectedNodeId={selectedNodeId} />
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
