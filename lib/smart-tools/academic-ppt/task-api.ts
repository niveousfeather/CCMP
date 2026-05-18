import type {
  AcademicPptPipelineStep,
  AcademicPptPipelineStepId,
  AcademicPptSettings,
  AcademicPptSlidePreview
} from "@/lib/smart-tools/academic-ppt/types";

export const ACADEMIC_PPT_RECENT_TASK_LIMIT = 10;
export const ACADEMIC_PPT_LOG_KEEP_LIMIT = 200;
export const ACADEMIC_PPT_LOG_RENDER_LIMIT = 50;
export const ACADEMIC_PPT_THUMBNAIL_RENDER_LIMIT = 24;

export const academicPptPipelineLabels: Record<AcademicPptPipelineStepId, string> = {
  parse_paper: "解析论文",
  research_analysis: "研究分析",
  structure_planning: "结构规划",
  slide_generation: "生成页面",
  visual_check: "视觉检查",
  post_process: "后处理",
  export_file: "导出文件"
};

export const defaultAcademicPptSettings: AcademicPptSettings = {
  templateStyle: "blue_tech",
  aspectRatio: "16:9",
  outputLanguage: "zh",
  targetSlides: 16,
  detailLevel: "standard",
  informationDensity: "normal",
  enableVisualQa: true,
  enableIconDecoration: true,
  enableDeepResearch: false,
  enableExternalResearch: false,
  visualQaEnabled: true,
  deepResearchEnabled: false,
  externalResearchEnabled: false,
  webSearchEnabled: false,
  searchProvider: "nexus-searxng",
  generatorPreference: "paper-ppt-agent",
  iconSearchEnabled: true,
  extraRequirements: ""
};

export function normalizeAcademicPptSettings(settings: Partial<AcademicPptSettings> | undefined): AcademicPptSettings {
  const merged = { ...defaultAcademicPptSettings, ...(settings || {}) };
  const enableVisualQa =
    typeof merged.enableVisualQa === "boolean" ? merged.enableVisualQa : merged.visualQaEnabled !== false;
  const enableIconDecoration =
    typeof merged.enableIconDecoration === "boolean" ? merged.enableIconDecoration : merged.iconSearchEnabled === true;
  const enableDeepResearch =
    typeof merged.enableDeepResearch === "boolean" ? merged.enableDeepResearch : merged.deepResearchEnabled === true;
  const enableExternalResearch =
    typeof merged.enableExternalResearch === "boolean"
      ? merged.enableExternalResearch
      : merged.externalResearchEnabled === true;
  const webSearchEnabled =
    typeof settings?.webSearchEnabled === "boolean" ? settings.webSearchEnabled : enableExternalResearch;
  return {
    ...merged,
    enableVisualQa,
    enableIconDecoration,
    enableDeepResearch,
    enableExternalResearch,
    visualQaEnabled: enableVisualQa,
    deepResearchEnabled: enableDeepResearch,
    externalResearchEnabled: enableExternalResearch,
    webSearchEnabled,
    searchProvider: "nexus-searxng",
    generatorPreference: "paper-ppt-agent",
    iconSearchEnabled: enableIconDecoration
  };
}

export const initialAcademicPptPipeline: AcademicPptPipelineStep[] = Object.entries(academicPptPipelineLabels).map(
  ([id, label]) => ({
    id: id as AcademicPptPipelineStepId,
    label,
    status: "waiting"
  })
);

export const sampleAcademicPptSlides: AcademicPptSlidePreview[] = [
  {
    id: "cover",
    title: "研究背景与问题定义",
    subtitle: "标题页",
    layout: "cover",
    visualType: "none",
    templateId: "tech_blue_business",
    templateIntent: "使用模板封面呈现题目、来源和汇报场景。",
    iconDecorations: [{ kind: "module", label: "主题", tone: "primary" }],
    status: "placeholder"
  },
  {
    id: "method",
    title: "方法框架",
    subtitle: "流程与架构",
    layout: "method",
    visualType: "flow",
    templateId: "tech_blue_business",
    visualHint: "使用 3-5 个步骤呈现研究方法流程。",
    bullets: ["问题输入与建模假设", "方法流程与关键模块", "输出结果与评估方式"],
    iconDecorations: [
      { kind: "node", label: "步骤", tone: "primary" },
      { kind: "arrow", label: "流程", tone: "accent" }
    ],
    status: "placeholder"
  },
  {
    id: "experiment",
    title: "实验设计",
    subtitle: "表格与指标",
    layout: "experiment",
    visualType: "table",
    templateId: "tech_blue_business",
    visualHint: "使用表格呈现实验设置、数据集和指标。",
    bullets: ["数据集与样本来源", "评价指标与对照方法", "实验配置与复现实验"],
    iconDecorations: [{ kind: "flask", label: "实验", tone: "accent" }],
    status: "placeholder"
  },
  {
    id: "result",
    title: "结果分析",
    subtitle: "关键指标",
    layout: "result",
    visualType: "kpi",
    templateId: "tech_blue_business",
    visualHint: "使用 KPI 卡片突出关键发现。",
    bullets: ["主要结果优于基线", "消融实验说明模块贡献", "误差案例揭示后续优化方向"],
    iconDecorations: [
      { kind: "chart", label: "指标", tone: "primary" },
      { kind: "star", label: "发现", tone: "secondary" }
    ],
    status: "placeholder"
  },
  {
    id: "summary",
    title: "结论与展望",
    subtitle: "总结页",
    layout: "summary",
    visualType: "kpi",
    templateId: "tech_blue_business",
    bullets: ["总结研究贡献与核心结论", "说明局限性与改进方向", "提出后续研究计划"],
    iconDecorations: [{ kind: "check", label: "总结", tone: "primary" }],
    status: "placeholder"
  }
];

export function formatAcademicPptFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

export function inferAcademicPptFileType(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "PDF" as const;
  if (extension === "pptx" || extension === "ppt") return "PPTX" as const;
  if (extension === "txt") return "Text" as const;
  if (extension === "md" || extension === "markdown") return "Markdown" as const;
  return "TeX" as const;
}
