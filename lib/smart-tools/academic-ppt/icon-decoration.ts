import type {
  AcademicPptExtendedSlideLayout,
  AcademicPptIconDecoration,
  AcademicPptIconDecorationKind,
  AcademicPptSlide,
  AcademicPptVisualType
} from "@/lib/smart-tools/academic-ppt/types";

export type AcademicPptPlannedIconDecoration = AcademicPptIconDecoration & {
  placement: "header" | "visual" | "corner";
  size: "sm" | "md" | "lg";
};

type DecorationInput = {
  slide: Pick<AcademicPptSlide, "layout" | "visualType" | "title" | "bullets" | "visualHint">;
  slideIndex: number;
  templateId?: string;
};

const layoutIconMap: Partial<Record<AcademicPptExtendedSlideLayout, AcademicPptIconDecorationKind[]>> = {
  agenda: ["node", "arrow"],
  architecture: ["module", "database"],
  chart: ["chart", "star"],
  compare: ["compare", "arrow"],
  experiment: ["flask", "table"],
  flow: ["node", "arrow"],
  formula: ["formula", "node"],
  method: ["gear", "arrow"],
  result: ["chart", "star"],
  summary: ["check", "star"],
  table: ["table", "database"],
  timeline: ["clock", "arrow"],
  two_column: ["compare", "node"]
};

const visualIconMap: Partial<Record<AcademicPptVisualType, AcademicPptIconDecorationKind[]>> = {
  architecture: ["module", "database"],
  chart: ["chart", "star"],
  comparison: ["compare", "arrow"],
  flow: ["node", "arrow"],
  formula: ["formula"],
  kpi: ["chart", "star"],
  matrix: ["table", "compare"],
  process: ["node", "arrow"],
  swot: ["compare", "star"],
  table: ["table"],
  timeline: ["clock", "arrow"]
};

const keywordIcons: Array<{ pattern: RegExp; icon: AcademicPptIconDecorationKind }> = [
  { pattern: /方法|流程|框架|method|process|framework/i, icon: "gear" },
  { pattern: /架构|系统|模块|architecture|system|module/i, icon: "module" },
  { pattern: /实验|评估|数据|experiment|evaluation|dataset|data/i, icon: "flask" },
  { pattern: /结果|指标|提升|result|metric|performance|improve/i, icon: "chart" },
  { pattern: /总结|结论|takeaway|summary|conclusion/i, icon: "check" },
  { pattern: /时间|阶段|计划|timeline|stage|roadmap/i, icon: "clock" },
  { pattern: /对比|基线|消融|compare|baseline|ablation/i, icon: "compare" },
  { pattern: /公式|方程|变量|formula|equation|loss/i, icon: "formula" }
];

function uniqueIcons(icons: AcademicPptIconDecorationKind[]) {
  return Array.from(new Set(icons));
}

function labelForIcon(kind: AcademicPptIconDecorationKind) {
  const labels: Record<AcademicPptIconDecorationKind, string> = {
    arrow: "流程",
    chart: "指标",
    check: "确认",
    clock: "阶段",
    compare: "对比",
    database: "数据",
    flask: "实验",
    formula: "公式",
    gear: "方法",
    module: "模块",
    node: "节点",
    star: "重点",
    table: "表格"
  };
  return labels[kind];
}

export function planAcademicPptIconDecorations({
  slide,
  slideIndex
}: DecorationInput): AcademicPptPlannedIconDecoration[] {
  const layout = slide.layout || "content";
  if (layout === "cover") {
    return [{ kind: "module", label: "主题", tone: "primary", placement: "visual", size: "lg" }];
  }
  if (layout === "section" || layout === "ending") {
    return [{ kind: "star", label: "章节", tone: "secondary", placement: "corner", size: "lg" }];
  }

  const text = [slide.title, slide.visualHint, ...(slide.bullets || [])].join(" ");
  const keywordMatches = keywordIcons.filter((item) => item.pattern.test(text)).map((item) => item.icon);
  const layoutIcons = layoutIconMap[layout] || [];
  const visualIcons = slide.visualType ? visualIconMap[slide.visualType] || [] : [];
  const icons = uniqueIcons([...layoutIcons, ...visualIcons, ...keywordMatches]).slice(0, 3);
  const selected = icons.length ? icons : (["node"] as AcademicPptIconDecorationKind[]);

  return selected.map((kind, index) => ({
    kind,
    label: labelForIcon(kind),
    tone: index === 0 ? "primary" : index === 1 ? "accent" : "secondary",
    placement: index === 0 ? "header" : index === 1 ? "visual" : "corner",
    size: index === 0 && slideIndex % 3 === 0 ? "lg" : "md"
  }));
}
