import type {
  AcademicPptOutline,
  AcademicPptPreviewManifest,
  AcademicPptQualityLevel,
  AcademicPptSettings,
  AcademicPptVisualQaIssue,
  AcademicPptVisualQaReport
} from "@/lib/smart-tools/academic-ppt/types";
import { normalizeAcademicPptSettings } from "@/lib/smart-tools/academic-ppt/task-api";
import { getAcademicPptTemplateForSettings } from "@/lib/smart-tools/academic-ppt/template-registry";
import { planAcademicPptIconDecorations } from "@/lib/smart-tools/academic-ppt/icon-decoration";

const TITLE_LIMIT = 72;
const BULLET_TOTAL_LIMIT = 520;
const BULLET_COUNT_LIMIT = 5;
const AGENDA_ITEM_LIMIT = 10;
const visualLayouts = new Set(["method", "experiment", "result", "timeline", "table", "formula", "chart", "architecture", "flow", "compare", "two_column"]);

function pushIssue(
  issues: AcademicPptVisualQaIssue[],
  code: string,
  severity: AcademicPptVisualQaIssue["severity"],
  message: string,
  slideIndex?: number
) {
  issues.push(slideIndex === undefined ? { code, severity, message } : { code, severity, message, slideIndex });
}

function qaScore(issues: AcademicPptVisualQaIssue[]) {
  const penalty = issues.reduce((sum, issue) => {
    if (issue.severity === "error") return sum + 16;
    if (issue.severity === "warn") return sum + 8;
    return sum + 3;
  }, 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

function levelFromScore(score: number, issues: AcademicPptVisualQaIssue[]): AcademicPptQualityLevel {
  if (score >= 85 && !issues.some((issue) => issue.severity === "error")) return "good";
  if (score >= 65) return "warning";
  return "poor";
}

export function runAcademicPptVisualQa({
  outline,
  preview,
  settings
}: {
  outline: AcademicPptOutline;
  preview?: AcademicPptPreviewManifest;
  settings?: AcademicPptSettings;
}): AcademicPptVisualQaReport {
  const issues: AcademicPptVisualQaIssue[] = [];
  const normalizedSettings = normalizeAcademicPptSettings(settings);
  if (!normalizedSettings.enableVisualQa) {
    return {
      score: 100,
      level: "good",
      issues: [],
      summary: "视觉 QA 未启用。",
      previewType: preview?.type
    };
  }

  let textOnlySlides = 0;
  const layoutCounts = new Map<string, number>();
  let decoratedSlides = 0;
  let totalDecorations = 0;
  const template = getAcademicPptTemplateForSettings(normalizedSettings);

  outline.slides.forEach((slide, index) => {
    const slideIndex = index + 1;
    const title = (slide.title || "").trim();
    const bullets = (slide.bullets || []).map((bullet) => bullet.replace(/\s+/g, " ").trim()).filter(Boolean);
    const bulletChars = bullets.reduce((sum, bullet) => sum + bullet.length, 0);
    layoutCounts.set(slide.layout, (layoutCounts.get(slide.layout) || 0) + 1);
    if (slide.layout === "content" && (!slide.visualType || slide.visualType === "none")) textOnlySlides += 1;
    const decorations = normalizedSettings.enableIconDecoration
      ? slide.iconDecorations || planAcademicPptIconDecorations({ slide, slideIndex, templateId: template.id })
      : slide.iconDecorations || [];
    if (decorations.length) decoratedSlides += 1;
    totalDecorations += decorations.length;

    if (!title && slide.layout !== "cover") {
      pushIssue(issues, "missing_title", "error", "内容页缺少标题。", slideIndex);
    }
    if (title.length > TITLE_LIMIT) {
      pushIssue(issues, "long_title", "warn", "标题过长，可能在 PPTX 中换行过多。", slideIndex);
    }
    if (slide.layout !== "cover" && !bullets.length) {
      pushIssue(issues, "blank_content", "error", "页面缺少正文内容，可能接近空白页。", slideIndex);
    }
    if (bullets.length > BULLET_COUNT_LIMIT) {
      pushIssue(issues, "dense_bullets", "warn", "单页 bullet 数量偏多，信息密度较高。", slideIndex);
    }
    if (bulletChars > BULLET_TOTAL_LIMIT) {
      pushIssue(issues, "text_overflow_risk", "warn", "单页文字总量较大，存在溢出风险。", slideIndex);
    }
    if (slide.layout === "agenda" && bullets.length > AGENDA_ITEM_LIMIT) {
      pushIssue(issues, "long_agenda", "warn", "目录页条目过多，建议合并章节。", slideIndex);
    }
    if (slide.layout === "summary" && bulletChars < 20) {
      pushIssue(issues, "weak_summary", "warn", "总结页内容偏少。", slideIndex);
    }
    if ((slide.layout === "summary" || slide.layout === "ending") && bullets.length < 3) {
      pushIssue(issues, "summary_missing_takeaways", "warn", "总结页 takeaway 少于 3 条。", slideIndex);
    }
    if (visualLayouts.has(slide.layout) && slide.visualType !== "none" && !slide.visualHint) {
      pushIssue(issues, "missing_visual_hint", "warn", "视觉型页面缺少图形说明，预览占位可能不够清晰。", slideIndex);
    }
    if (slide.layout === "result" && (!slide.visualType || !["chart", "kpi", "comparison"].includes(slide.visualType))) {
      pushIssue(issues, "result_without_visual_expression", "warn", "结果页缺少指标、图表或对比表达。", slideIndex);
    }
    if (slide.layout === "method" && (!slide.visualType || !["flow", "architecture", "process"].includes(slide.visualType))) {
      pushIssue(issues, "method_without_flow_expression", "warn", "方法页缺少流程或架构表达。", slideIndex);
    }
    if ((slide.layout === "chart" || slide.visualType === "chart") && bulletChars > 420) {
      pushIssue(issues, "chart_text_overload", "warn", "图表页文字偏多，可能挤压图表区域。", slideIndex);
    }
    if ((slide.layout === "table" || slide.visualType === "table") && bullets.length < 2) {
      pushIssue(issues, "table_without_rows", "info", "表格页内容较少，建议补充字段或条件。", slideIndex);
    }
    if ((slide.layout === "formula" || slide.visualType === "formula") && !/＝|=|∑|loss|公式|方程|model|f\(/i.test([slide.title, slide.visualHint, ...bullets].join(" "))) {
      pushIssue(issues, "formula_without_formula_signal", "info", "公式页没有明显公式或变量说明。", slideIndex);
    }
  });

  for (let index = 2; index < outline.slides.length; index += 1) {
    const current = outline.slides[index]?.layout;
    if (current && current !== "content" && current === outline.slides[index - 1]?.layout && current === outline.slides[index - 2]?.layout) {
      pushIssue(issues, "layout_repetition", "warn", "同类版式连续出现，视觉节奏可能单调。", index + 1);
    }
  }

  if (textOnlySlides > Math.max(2, Math.ceil(outline.slides.length * 0.35))) {
    pushIssue(issues, "too_many_text_only_slides", "warn", "纯文字页比例偏高，视觉节奏可能单调。");
  }
  if (normalizedSettings.enableIconDecoration && decoratedSlides === 0) {
    pushIssue(issues, "icon_decoration_missing", "warn", "图标装饰已启用，但未检测到页面装饰摘要。");
  }
  if (normalizedSettings.enableIconDecoration && totalDecorations > outline.slides.length * 3) {
    pushIssue(issues, "icon_decoration_overload", "warn", "图标装饰数量偏多，可能干扰正文阅读。");
  }
  if (!normalizedSettings.enableIconDecoration && totalDecorations > 0) {
    pushIssue(issues, "icon_decoration_unexpected", "warn", "图标装饰未启用，但检测到装饰摘要。");
  }
  const dominantLayout = Array.from(layoutCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  if (dominantLayout && dominantLayout[1] > Math.max(4, Math.ceil(outline.slides.length * 0.45))) {
    pushIssue(issues, "dominant_layout_ratio", "warn", "单一版式占比偏高，建议增加图表、对比或流程页。");
  }

  if (preview?.type === "image" && preview.available) {
    if (Math.abs(preview.slideCount - outline.slides.length) > 1) {
      pushIssue(issues, "preview_slide_count_mismatch", "warn", "PPTX 预览页数与大纲页数不一致。");
    }
    preview.slides.forEach((slide) => {
      if ((slide.width !== undefined && slide.width <= 0) || (slide.height !== undefined && slide.height <= 0)) {
        pushIssue(issues, "invalid_preview_size", "warn", "预览图尺寸异常。", slide.index);
      }
      if ((slide.width !== undefined && slide.width < 640) || (slide.height !== undefined && slide.height < 360)) {
        pushIssue(issues, "small_preview_size", "warn", "预览图分辨率偏低，可能影响人工验收。", slide.index);
      }
      if (slide.fileSizeBytes !== undefined && slide.fileSizeBytes < 8 * 1024) {
        pushIssue(issues, "tiny_preview_file", "warn", "预览图文件过小，可能为空白页或转换异常。", slide.index);
      }
    });
  } else {
    pushIssue(issues, "native_preview_unavailable", "info", preview?.fallbackReason || "PPTX 图片预览暂不可用，已提供结构化预览。");
  }

  const score = qaScore(issues);
  return {
    score,
    level: levelFromScore(score, issues),
    issues,
    summary:
      issues.some((issue) => issue.severity === "warn" || issue.severity === "error")
        ? "已完成生成，部分页面存在信息密度或视觉平衡提示。"
        : "视觉 QA 未发现明显问题。",
    previewType: preview?.type
  };
}
