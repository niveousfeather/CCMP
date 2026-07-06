"use client";

import { useState } from "react";
import { ArrowDown, Layers3, Network, PencilLine, ShieldCheck, Sparkles } from "lucide-react";

import { CapabilityAnalysisSections } from "@/components/capability-map/capability-analysis-sections";
import { CourseAbilityDetailPanel } from "@/components/capability-map/course-ability-detail-panel";
import { CourseAbilityGraphView } from "@/components/capability-map/course-ability-graph-view";
import { CourseMappingView } from "@/components/capability-map/course-mapping-view";
import { CoreCourseSuggestionDetail, CoreCourseSuggestionView } from "@/components/capability-map/core-course-suggestion-view";
import {
  CourseRequestPanel,
  DEFAULT_COURSE_REQUEST,
  parseCourseRequestText
} from "@/components/capability-map/course-request-panel";
import { IcebergModel } from "@/components/capability-map/iceberg-model";
import { IndustryImpactPaths } from "@/components/capability-map/industry-impact-paths";
import { ProcessGraphStageDetail, ProcessGraphStageView } from "@/components/capability-map/process-graph-stage-view";
import { createMockCourseAbilityGraph } from "@/lib/capability-map/course-ability-graph";
import type {
  CourseAbilityGraphInput,
  CourseAbilityGraphPayload
} from "@/lib/capability-map/course-ability-graph";
import {
  courseAbilityDiagnosticLabel,
  courseAbilityDiagnosticWarning,
  extractCourseAbilityDiagnosticCodes,
  sanitizeCourseAbilityWarning
} from "@/lib/capability-map/diagnostics";
import {
  CAPABILITY_MAP_MOCK_NOTICE,
  capabilityMapDiagnosticSummary,
  capabilityMapSourceBadge,
  capabilityMapSourceNotice
} from "@/lib/capability-map/source-status";
import styles from "@/components/capability-map/capability-map-theme.module.css";
import { cn } from "@/lib/utils";

const defaultForm: CourseAbilityGraphInput = {
  courseName: "AI动画全流程制作",
  majorDirection: "影视动画",
  region: "重庆"
};

const STAGE_STATUS_LABELS: Record<string, string> = {
  LOCAL_EXPANSION_COURSE_GRAPH: "阶段状态：课程能力图谱由本地结构扩展生成",
  LOCAL_EXPANSION_MAPPING_ANALYSIS: "阶段状态：课程映射与辅助分析由本地结构扩展生成",
  LOCAL_EXPANSION_PROCESS_GRAPHS: "阶段状态：前置图谱与核心课程建议由本地结构扩展生成",
  MODULE_MAPPING_ALL_PLACEHOLDER_USED: "课程映射状态：所有模块映射使用本地占位补齐",
  MODULE_MAPPING_MATCHED_BY_ID: "课程映射状态：已按教学模块 ID 对齐",
  MODULE_MAPPING_MATCHED_BY_NAME: "课程映射状态：已按教学模块名称对齐",
  MODULE_MAPPING_PARTIAL_PLACEHOLDER_USED: "课程映射状态：部分模块使用本地占位补齐",
  NORMALIZE_COURSE_GRAPH_OK: "结构校验：课程能力图谱主结构正常",
  NORMALIZE_MODULE_MAPPING_PATCHED: "结构校验：课程映射已按最终教学模块补齐",
  NORMALIZE_PROCESS_GRAPH_OK: "结构校验：前置图谱结构正常",
  TEMPLATE_PATTERN_DETECTED: "质量检查：部分结构可能偏模板化，建议人工检查",
  COURSE_MODULES_TOO_SIMILAR: "质量检查：部分教学模块名称相似度较高",
  MAPPING_CONTENT_TOO_SIMILAR: "质量检查：部分课程映射内容相似度较高",
  DOMAIN_MISMATCH_WITH_INPUT: "质量检查：部分内容与当前专业或课程方向不完全匹配",
  STAGE_1_SEMANTIC_SKELETON_FAILED: "阶段状态：前置图谱语义骨架使用本地示例补齐",
  STAGE_1_SEMANTIC_SKELETON_USED_MODEL: "阶段状态：前置图谱语义骨架由 GPT-5.4 生成",
  STAGE_2_COURSE_STRUCTURE_FAILED: "阶段状态：课程结构骨架使用本地示例补齐",
  STAGE_2_COURSE_STRUCTURE_USED_MODEL: "阶段状态：课程结构骨架由 GPT-5.4 生成",
  STAGE_3_MAPPING_SKELETON_FAILED: "阶段状态：课程映射骨架使用本地示例补齐",
  STAGE_3_MAPPING_SKELETON_USED_MODEL: "阶段状态：课程映射骨架由 GPT-5.4 生成"
};

type CapabilityMapViewMode = "industry" | "regionalJobs" | "majorAbilities" | "coreCourses" | "overview" | "mapping";

const PROCESS_STEPS: Array<{ description: string; id: CapabilityMapViewMode; label: string }> = [
  { id: "industry", label: "产业图谱", description: "从产业变化识别课程内容更新方向。" },
  { id: "regionalJobs", label: "区域岗位图谱", description: "从区域岗位需求定位课程服务对象。" },
  { id: "majorAbilities", label: "专业能力图谱", description: "从岗位能力抽取专业能力结构。" },
  { id: "coreCourses", label: "核心课程建议", description: "从专业能力结构推导专业核心课程体系。" },
  { id: "overview", label: "课程能力图谱", description: "将某一门核心课程拆解为工作流程、教学模块与任务能力点。" },
  { id: "mapping", label: "课程映射", description: "将教学模块映射到典型工作项目和七个课程建设维度。" }
];

function normalizeForm(form: CourseAbilityGraphInput): CourseAbilityGraphInput {
  return {
    courseName: form.courseName.trim(),
    majorDirection: form.majorDirection.trim(),
    region: form.region.trim()
  };
}

function graphDiagnosticMessages(graph: CourseAbilityGraphPayload) {
  if (graph.meta.source !== "mock-fallback" && !graph.meta.warnings.length) return [];

  const codes = extractCourseAbilityDiagnosticCodes(graph.meta.warnings);
  const codeMessages = codes.map((code) => `生成失败原因：${courseAbilityDiagnosticLabel(code)}`);
  if (codeMessages.length) return codeMessages;

  const stageMessages = graph.meta.warnings
    .map((warning) => STAGE_STATUS_LABELS[warning])
    .filter((message): message is string => Boolean(message));
  if (stageMessages.length) return Array.from(new Set(stageMessages));

  return graph.meta.warnings
    .filter((warning) => warning !== CAPABILITY_MAP_MOCK_NOTICE && !warning.includes("本地示例数据"))
    .map(sanitizeCourseAbilityWarning)
    .filter((warning): warning is string => Boolean(warning))
    .map((warning) => `生成失败原因：${warning}`);
}

function createClientFallbackGraph(input: CourseAbilityGraphInput) {
  const reason = courseAbilityDiagnosticWarning("MODEL_CALL_FAILED");
  const graph = createMockCourseAbilityGraph(input, [reason]);
  return {
    ...graph,
    meta: {
      ...graph.meta,
      source: "mock-fallback" as const,
      warnings: Array.from(new Set([CAPABILITY_MAP_MOCK_NOTICE, reason, ...graph.meta.warnings]))
    }
  };
}

export function CapabilityMapEntry() {
  const [requestText, setRequestText] = useState(DEFAULT_COURSE_REQUEST);
  const [lastParsedText, setLastParsedText] = useState(DEFAULT_COURSE_REQUEST);
  const [form, setForm] = useState<CourseAbilityGraphInput>(defaultForm);
  const [graph, setGraph] = useState<CourseAbilityGraphPayload>(() => createMockCourseAbilityGraph(defaultForm));
  const [selectedNodeId, setSelectedNodeId] = useState<string>(graph.courseAbilityMap.rootNode.id);
  const [viewMode, setViewMode] = useState<CapabilityMapViewMode>("overview");
  const [selectedProcessNodeId, setSelectedProcessNodeId] = useState<string | null>(null);
  const [selectedCoreCourseId, setSelectedCoreCourseId] = useState<string | null>(null);
  const [activeMappingModuleId, setActiveMappingModuleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const [parseNotice, setParseNotice] = useState<string | null>(null);
  const mappableModuleIds = graph.moduleMappings.map((mapping) => mapping.moduleId);
  const activeModuleMapping = activeMappingModuleId
    ? graph.moduleMappings.find((mapping) => mapping.moduleId === activeMappingModuleId) || null
    : null;
  const mappingViewActive = viewMode === "mapping" && Boolean(activeModuleMapping);
  const activeProcessStage =
    viewMode === "industry"
      ? graph.industryGraph
      : viewMode === "regionalJobs"
        ? graph.regionalJobGraph
        : viewMode === "majorAbilities"
          ? graph.majorAbilityGraph
          : null;
  const coreCourseViewActive = viewMode === "coreCourses";
  const currentCoreCourse = graph.coreCourseSuggestions.find((course) => course.isCurrentCourse) || graph.coreCourseSuggestions[0] || null;
  const activeCoreCourseId = selectedCoreCourseId || currentCoreCourse?.id || null;
  const sourceNotice = capabilityMapSourceNotice(graph);
  const diagnosticSummary = capabilityMapDiagnosticSummary(graph);
  const sourceBadge = capabilityMapSourceBadge(graph);
  const diagnosticMessages = graphDiagnosticMessages(graph);

  function parseRequest() {
    const parsed = parseCourseRequestText(requestText, form);
    setForm(parsed);
    setLastParsedText(requestText);
    setError(null);
    setParseNotice(`已解析：${parsed.region} / ${parsed.majorDirection} / ${parsed.courseName}`);
  }

  async function generateLocalGraph() {
    const parsedForm = requestText === lastParsedText ? form : parseCourseRequestText(requestText, form);
    const nextForm = normalizeForm(parsedForm);

    if (!nextForm.courseName || !nextForm.majorDirection || !nextForm.region) {
      setError("请补充课程名称、专业方向和地区后再生成课程能力图谱。");
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/capability-map/course-ability-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextForm)
      });
      if (!response.ok) {
        throw new Error(`CAPABILITY_MAP_API_${response.status}`);
      }
      const nextGraph = await response.json() as CourseAbilityGraphPayload;
      setForm(nextForm);
      setLastParsedText(requestText);
      setGraph(nextGraph);
      setSelectedNodeId(nextGraph.courseAbilityMap.rootNode.id);
      setSelectedProcessNodeId(null);
      setSelectedCoreCourseId(nextGraph.coreCourseSuggestions.find((course) => course.isCurrentCourse)?.id || null);
      setViewMode("overview");
      setActiveMappingModuleId(null);
      setEditMode(false);
      setEditNotice(nextGraph.meta.source === "mock" ? null : capabilityMapSourceNotice(nextGraph));
      setError(null);
    } catch {
      const fallbackGraph = createClientFallbackGraph(nextForm);
      setForm(nextForm);
      setLastParsedText(requestText);
      setGraph(fallbackGraph);
      setSelectedNodeId(fallbackGraph.courseAbilityMap.rootNode.id);
      setSelectedProcessNodeId(null);
      setSelectedCoreCourseId(fallbackGraph.coreCourseSuggestions.find((course) => course.isCurrentCourse)?.id || null);
      setViewMode("overview");
      setActiveMappingModuleId(null);
      setEditMode(false);
      setEditNotice(capabilityMapSourceNotice(fallbackGraph));
      setError(null);
    } finally {
      setGenerating(false);
    }
  }

  function selectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setSelectedProcessNodeId(null);
    setSelectedCoreCourseId(null);
    setActiveMappingModuleId(null);
    setViewMode("overview");
  }

  function selectProcessStep(nextMode: CapabilityMapViewMode) {
    if (nextMode === "mapping") {
      const selectedMapping = graph.moduleMappings.find((mapping) => mapping.moduleId === selectedNodeId);
      const fallbackMapping = graph.moduleMappings[0];
      const mapping = selectedMapping || activeModuleMapping || fallbackMapping;
      if (mapping) openCourseMappingFromModule(mapping.moduleId);
      return;
    }

    setViewMode(nextMode);
    setActiveMappingModuleId(null);
    if (nextMode === "coreCourses") {
      setSelectedProcessNodeId(null);
      setSelectedCoreCourseId(currentCoreCourse?.id || null);
      return;
    }
    if (nextMode === "overview") {
      setSelectedProcessNodeId(null);
      setSelectedCoreCourseId(null);
      return;
    }

    const stage =
      nextMode === "industry"
        ? graph.industryGraph
        : nextMode === "regionalJobs"
          ? graph.regionalJobGraph
          : graph.majorAbilityGraph;
    setSelectedProcessNodeId(stage.nodes[0]?.id || null);
  }

  function openCourseMappingFromModule(moduleId: string) {
    const mapping = graph.moduleMappings.find((item) => item.moduleId === moduleId);
    if (!mapping) return;
    setSelectedNodeId(moduleId);
    setSelectedProcessNodeId(null);
    setSelectedCoreCourseId(null);
    setActiveMappingModuleId(mapping.moduleId);
    setViewMode("mapping");
  }

  function returnToOverview() {
    setViewMode("overview");
    setSelectedProcessNodeId(null);
    setSelectedCoreCourseId(null);
    setActiveMappingModuleId(null);
  }

  function openCurrentCourseGraph() {
    setViewMode("overview");
    setSelectedProcessNodeId(null);
    setSelectedCoreCourseId(null);
    setActiveMappingModuleId(null);
    setSelectedNodeId(graph.courseAbilityMap.rootNode.id);
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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <ShieldCheck className="h-4 w-4" />
                面向高校教师的课程能力图谱产品原型
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
                {graph.course.region}地区{graph.course.majorDirection}专业《{graph.course.courseName}》课程能力图谱
              </h1>
            </div>
            <div className="max-w-xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium leading-6 text-amber-900">
              <p>{sourceNotice}</p>
            </div>
          </div>
        </header>

        <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[330px_minmax(720px,1fr)_390px]">
          <aside className="xl:sticky xl:top-5">
            <CourseRequestPanel
              error={error}
              form={form}
              diagnosticSummary={diagnosticSummary}
              diagnosticMessages={diagnosticMessages}
              generating={generating}
              onFormChange={setForm}
              onGenerate={generateLocalGraph}
              onParse={parseRequest}
              onPromptChange={setRequestText}
              parseNotice={parseNotice}
              prompt={requestText}
              sourceNotice={sourceNotice}
            />
          </aside>

          <section className="min-w-0 rounded-3xl border border-blue-100 bg-white p-5 shadow-[0_24px_70px_rgba(37,99,235,0.1)]">
            <ProcessStepNav activeMode={viewMode} onSelect={selectProcessStep} />

            <div className="mb-4 flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                  {mappingViewActive || activeProcessStage || coreCourseViewActive ? <Layers3 className="h-4 w-4" /> : <Network className="h-4 w-4" />}
                  {mappingViewActive ? "课程映射展开画布" : activeProcessStage || coreCourseViewActive ? "图谱生成过程视图" : "课程能力图谱主画布"}
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                  {mappingViewActive && activeModuleMapping
                    ? `当前教学模块：${activeModuleMapping.moduleName}`
                    : coreCourseViewActive
                      ? graph.coreCourseGraph.title
                      : activeProcessStage
                      ? activeProcessStage.title
                    : `${graph.course.majorDirection} · 《${graph.course.courseName}》`}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {mappingViewActive
                    ? "从当前教学模块展开典型工作项目、七个课程映射维度和具体小点，解释这个模块为什么这样设置。"
                    : coreCourseViewActive
                      ? graph.coreCourseGraph.lead
                    : activeProcessStage
                      ? activeProcessStage.lead
                    : "主画布按课程、工作流程、教学模块和任务/能力点四级展开，帮助教师看到某一门核心课程如何落到项目任务。"}
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-blue-700">
                  {mappingViewActive
                    ? "点击典型工作项目、维度或小点，可同步高亮相关节点和连线。"
                    : coreCourseViewActive
                      ? "点击核心课程节点可查看课程定位、支撑能力和岗位；当前课程可继续进入课程能力图谱。"
                    : activeProcessStage
                      ? "点击轻量节点可在右侧查看阶段说明。当前结果需人工审核，不代表正式资料库结论。"
                    : "点击教学模块本身查看详情；点击教学模块下方“课程映射”徽标可切换到映射展开画布。"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-blue-700">{graph.course.region}</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">{sourceBadge}</span>
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
                  onClick={() => setEditNotice("当前编辑模式仅刷新页面状态；不会接入 RAG、爬虫、向量数据库或图数据库。")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-bold text-slate-500 transition hover:border-blue-200 hover:text-blue-700"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  基于修改重新生成后续内容
                </button>
              </div>
            </div>
            {editMode ? (
              <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold leading-6 text-blue-700">
                编辑模式已开启：本轮修改只保存在当前页面，刷新后恢复当前演示数据。
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
            ) : coreCourseViewActive ? (
              <CoreCourseSuggestionView
                graph={graph}
                onOpenCurrentCourseGraph={openCurrentCourseGraph}
                onSelectCourse={setSelectedCoreCourseId}
                selectedCourseId={activeCoreCourseId}
              />
            ) : activeProcessStage ? (
              <ProcessGraphStageView
                generationKey={graph.meta.generatedAt}
                onSelectNode={setSelectedProcessNodeId}
                selectedNodeId={selectedProcessNodeId}
                stage={activeProcessStage}
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
            {coreCourseViewActive ? (
              <CoreCourseSuggestionDetail
                graph={graph}
                onOpenCurrentCourseGraph={openCurrentCourseGraph}
                selectedCourseId={activeCoreCourseId}
              />
            ) : activeProcessStage ? (
              <ProcessGraphStageDetail
                selectedNodeId={selectedProcessNodeId}
                stage={activeProcessStage}
                teachingModules={graph.teachingModules}
              />
            ) : (
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
            )}
          </aside>
        </div>

        {!mappingViewActive && !activeProcessStage && !coreCourseViewActive ? (
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

function ProcessStepNav({
  activeMode,
  onSelect
}: {
  activeMode: CapabilityMapViewMode;
  onSelect: (mode: CapabilityMapViewMode) => void;
}) {
  const activeStep = PROCESS_STEPS.find((step) => step.id === activeMode) || PROCESS_STEPS[4];

  return (
    <nav className="mb-4 overflow-x-auto rounded-[28px] border border-blue-100 bg-blue-50/70 p-2" aria-label="图谱生成过程">
      <div className="flex min-w-max items-center gap-2">
        {PROCESS_STEPS.map((step, index) => {
          const active = activeMode === step.id || (step.id === "mapping" && activeMode === "mapping");
          return (
            <div key={step.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                className={cn(
                  "rounded-2xl border px-4 py-2 text-sm font-black transition focus:outline-none focus:ring-4 focus:ring-blue-200",
                  active
                    ? "border-blue-500 bg-blue-600 text-white shadow-[0_12px_30px_rgba(37,99,235,0.2)]"
                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"
                )}
              >
                {step.label}
              </button>
              {index < PROCESS_STEPS.length - 1 ? <span className="text-sm font-black text-blue-300">→</span> : null}
            </div>
          );
        })}
      </div>
      <p className="mt-2 px-2 text-xs font-bold leading-5 text-blue-700">{activeStep.description}</p>
    </nav>
  );
}
