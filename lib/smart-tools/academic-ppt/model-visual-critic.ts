import "server-only";

import { getAgentModelConfig } from "@/lib/agent/models";
import { callChatModel } from "@/lib/agent/router";
import type { AgentChatMessage } from "@/lib/agent/types";
import { createAcademicPptRenderPlan } from "@/lib/smart-tools/academic-ppt/layout-planner";
import { normalizeAcademicPptSettings } from "@/lib/smart-tools/academic-ppt/task-api";
import type {
  AcademicPptModelCriticReport,
  AcademicPptOutline,
  AcademicPptPreviewManifest,
  AcademicPptQualityIssueSeverity,
  AcademicPptQualityLevel,
  AcademicPptSettings,
  AcademicPptVisualQaReport
} from "@/lib/smart-tools/academic-ppt/types";

const MODEL_VISUAL_CRITIC_TIMEOUT_MS = 90_000;
const MAX_MODEL_ISSUES = 12;
const MAX_MODEL_ACTIONS = 10;

function withTimeout(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`academic_ppt_model_visual_critic_timeout:${timeoutMs}`)), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timer)
  };
}

function sanitizeText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value : "";
  return text
    .replace(/[A-Za-z]:[\\/][^\s"'<>]+/g, "[local-path]")
    .replace(/\/(?:Users|home|var|tmp|mnt)\/[^\s"'<>]+/g, "[local-path]")
    .replace(new RegExp("[A-Z0-9_]*(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*", "gi"), "[sensitive-config]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "[bearer-token]")
    .replace(new RegExp(`\\b${"Author"}${"ization"}\\b`, "gi"), "[auth-header]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function extractJsonObject(content: string) {
  const trimmed = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  throw new Error("ACADEMIC_PPT_MODEL_CRITIC_JSON_NOT_FOUND");
}

function levelFromScore(score: number, hasError: boolean): AcademicPptQualityLevel {
  if (score >= 85 && !hasError) return "good";
  if (score >= 65) return "warning";
  return "poor";
}

function clampScore(value: unknown, fallback: number) {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function sanitizeSeverity(value: unknown): AcademicPptQualityIssueSeverity {
  return value === "error" || value === "warn" || value === "info" ? value : "warn";
}

const issueCategories = new Set([
  "layout",
  "density",
  "readability",
  "visual_balance",
  "template_fit",
  "logic",
  "missing_content",
  "overflow"
]);

const repairActions = new Set([
  "shorten_text",
  "split_slide",
  "change_layout",
  "add_visual",
  "remove_visual",
  "rebalance_columns",
  "add_summary",
  "adjust_density"
]);

function parseModelCriticReport(content: string, fallbackScore: number): AcademicPptModelCriticReport {
  const data = JSON.parse(extractJsonObject(content)) as Record<string, unknown>;
  const rawIssues = Array.isArray(data.issues) ? data.issues : [];
  const issues = rawIssues
    .map((item) => {
      const issue = item as Record<string, unknown>;
      const category = typeof issue.category === "string" && issueCategories.has(issue.category) ? issue.category : "visual_balance";
      const slideIndex = Number(issue.slideIndex);
      return {
        ...(Number.isFinite(slideIndex) && slideIndex > 0 ? { slideIndex: Math.round(slideIndex) } : {}),
        severity: sanitizeSeverity(issue.severity),
        category: category as AcademicPptModelCriticReport["issues"][number]["category"],
        message: sanitizeText(issue.message, 180) || "Slide visual quality can be improved.",
        suggestion: sanitizeText(issue.suggestion, 180) || "Adjust layout, density, or visual balance."
      };
    })
    .filter((issue) => issue.message && issue.suggestion)
    .slice(0, MAX_MODEL_ISSUES);

  const rawActions = Array.isArray(data.repairActions) ? data.repairActions : [];
  const actions = rawActions
    .map((item) => {
      const action = item as Record<string, unknown>;
      const actionName = typeof action.action === "string" && repairActions.has(action.action) ? action.action : undefined;
      const slideIndex = Number(action.slideIndex);
      if (!actionName) return null;
      return {
        ...(Number.isFinite(slideIndex) && slideIndex > 0 ? { slideIndex: Math.round(slideIndex) } : {}),
        action: actionName as AcademicPptModelCriticReport["repairActions"][number]["action"],
        reason: sanitizeText(action.reason, 180) || "Improve presentation readability."
      };
    })
    .filter((action): action is AcademicPptModelCriticReport["repairActions"][number] => Boolean(action))
    .slice(0, MAX_MODEL_ACTIONS);

  const score = clampScore(data.score, fallbackScore);
  return {
    enabled: true,
    status: "success",
    score,
    level: levelFromScore(score, issues.some((issue) => issue.severity === "error")),
    summary: sanitizeText(data.summary, 240) || "Model critic completed a structured review.",
    issues,
    repairActions: actions
  };
}

function summarizeSlides(outline: AcademicPptOutline) {
  return outline.slides.slice(0, 28).map((slide, index) => ({
    slideIndex: index + 1,
    title: sanitizeText(slide.title, 90),
    layout: slide.layout,
    visualType: slide.visualType || "none",
    bulletCount: slide.bullets?.length || 0,
    bullets: (slide.bullets || []).slice(0, 5).map((bullet) => sanitizeText(bullet, 110)),
    visualHint: sanitizeText(slide.visualHint, 110),
    emphasis: sanitizeText(slide.emphasis, 100)
  }));
}

function summarizePreview(preview?: AcademicPptPreviewManifest) {
  if (!preview) return { type: "outline", available: false, source: "structured_placeholder", slideCount: 0, previewCount: 0 };
  return {
    type: preview.type,
    available: preview.available,
    source: preview.source,
    slideCount: preview.slideCount,
    previewCount: preview.previewCount,
    slides: preview.slides.slice(0, 12).map((slide) => ({
      index: slide.index,
      width: slide.width,
      height: slide.height,
      fileSizeBytes: slide.fileSizeBytes
    })),
    fallbackReason: sanitizeText(preview.fallbackReason, 180)
  };
}

function buildModelCriticPrompt({
  outline,
  preview,
  ruleVisualQa,
  settings
}: {
  outline: AcademicPptOutline;
  preview?: AcademicPptPreviewManifest;
  ruleVisualQa: AcademicPptVisualQaReport;
  settings: AcademicPptSettings;
}) {
  const normalizedSettings = normalizeAcademicPptSettings(settings);
  const renderPlan = createAcademicPptRenderPlan(outline, normalizedSettings);
  return `You are reviewing an academic PPT deck for visual quality. Return STRICT JSON only, no Markdown.

Schema:
{
  "score": 0-100,
  "level": "good" | "warning" | "poor",
  "summary": "short audit summary",
  "issues": [
    {
      "slideIndex": 1,
      "severity": "info" | "warn" | "error",
      "category": "layout" | "density" | "readability" | "visual_balance" | "template_fit" | "logic" | "missing_content" | "overflow",
      "message": "concise issue",
      "suggestion": "concrete fix"
    }
  ],
  "repairActions": [
    {
      "slideIndex": 1,
      "action": "shorten_text" | "split_slide" | "change_layout" | "add_visual" | "remove_visual" | "rebalance_columns" | "add_summary" | "adjust_density",
      "reason": "why this action helps"
    }
  ]
}

Review goals:
- Prefer concrete, conservative fixes that improve a finished academic presentation.
- Do not request raw model/provider details.
- Do not invent source citations or new facts.
- Prioritize text overflow, density, layout mismatch, weak result/method/summary slides, and poor visual balance.
- If the rule QA score is already strong, return few or no repair actions.

Current model visual input mode:
- This server model call uses structured review data. It does not support image visual input in this path.
- If native PNG preview is available, use only the safe preview manifest summary below, not local file paths.

Settings:
${JSON.stringify({
    templateStyle: normalizedSettings.templateStyle,
    targetSlides: normalizedSettings.targetSlides,
    detailLevel: normalizedSettings.detailLevel,
    informationDensity: normalizedSettings.informationDensity,
    iconDecoration: normalizedSettings.enableIconDecoration,
    language: normalizedSettings.outputLanguage
  })}

Rule visual QA:
${JSON.stringify({
    score: ruleVisualQa.score,
    level: ruleVisualQa.level,
    issues: ruleVisualQa.issues.slice(0, 14).map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      slideIndex: issue.slideIndex,
      message: sanitizeText(issue.message, 140)
    }))
  })}

Preview summary:
${JSON.stringify(summarizePreview(preview))}

Render plan summary:
${JSON.stringify(
    renderPlan.slides.slice(0, 28).map((slide) => ({
      slideIndex: slide.slideIndex,
      layout: slide.layout,
      visualType: slide.visualType,
      density: slide.density,
      title: sanitizeText(slide.title, 90)
    }))
  )}

Slides:
${JSON.stringify(summarizeSlides(outline))}`;
}

function summarizeFailure(error: unknown) {
  if (!(error instanceof Error)) return "model critic unavailable";
  return sanitizeText(error.message, 220) || "model critic unavailable";
}

function createStructuredReview({
  enabled,
  status,
  reason,
  ruleVisualQa,
  preview
}: {
  enabled: boolean;
  status: AcademicPptModelCriticReport["status"];
  reason?: string;
  ruleVisualQa: AcademicPptVisualQaReport;
  preview?: AcademicPptPreviewManifest;
}): AcademicPptModelCriticReport {
  const issues = ruleVisualQa.issues
    .filter((issue) => issue.severity !== "info")
    .slice(0, MAX_MODEL_ISSUES)
    .map((issue) => {
      const category =
        /overflow|dense|long|text/i.test(issue.code) ? "density" :
        /layout|visual|preview|icon/i.test(issue.code) ? "visual_balance" :
        /summary|result|method|missing/i.test(issue.code) ? "missing_content" :
        "readability";
      const action =
        category === "density" ? "shorten_text" :
        /result|method|visual/i.test(issue.code) ? "add_visual" :
        /summary/i.test(issue.code) ? "add_summary" :
        "adjust_density";
      return {
        slideIndex: issue.slideIndex,
        severity: issue.severity,
        category: category as AcademicPptModelCriticReport["issues"][number]["category"],
        message: sanitizeText(issue.message, 180) || "Rule QA found a presentation quality issue.",
        suggestion: "Apply a conservative structured repair before final export."
      };
    });

  const repairActions = issues
    .filter((issue) => issue.severity !== "info")
    .slice(0, MAX_MODEL_ACTIONS)
    .map((issue) => ({
      slideIndex: issue.slideIndex,
      action: (issue.category === "density" ? "shorten_text" : issue.category === "missing_content" ? "add_summary" : "adjust_density") as AcademicPptModelCriticReport["repairActions"][number]["action"],
      reason: issue.suggestion
    }));

  const fallbackReason =
    reason ||
    (preview?.type === "image" && preview.available
      ? "Current model call does not support image visual input; used structured review data instead."
      : "Native preview is unavailable; used structured review data instead.");

  return {
    enabled,
    status,
    score: ruleVisualQa.score,
    level: ruleVisualQa.level,
    summary: enabled ? "Structured review completed from rule QA, render plan, and preview metadata." : "Visual QA is not enabled.",
    issues,
    repairActions,
    ...(enabled && status !== "success" ? { fallbackReason } : {})
  };
}

export async function runAcademicPptModelVisualCritic({
  outline,
  preview,
  ruleVisualQa,
  settings
}: {
  outline: AcademicPptOutline;
  preview?: AcademicPptPreviewManifest;
  ruleVisualQa: AcademicPptVisualQaReport;
  settings: AcademicPptSettings;
}): Promise<AcademicPptModelCriticReport> {
  const normalizedSettings = normalizeAcademicPptSettings(settings);
  if (!normalizedSettings.enableVisualQa) {
    return createStructuredReview({ enabled: false, status: "skipped", ruleVisualQa, preview });
  }

  const imageFallbackReason =
    preview?.type === "image" && preview.available
      ? "Current model call does not support image visual input; used structured review data instead."
      : undefined;

  const config = getAgentModelConfig();
  const prompt = buildModelCriticPrompt({ outline, preview, ruleVisualQa, settings: normalizedSettings });
  const messages: AgentChatMessage[] = [
    {
      role: "system",
      content: "You are a strict academic presentation visual critic. Return compact JSON only and never reveal provider or key details."
    },
    { role: "user", content: prompt }
  ];

  const criticTimeout = withTimeout(MODEL_VISUAL_CRITIC_TIMEOUT_MS);
  try {
    const content = await callChatModel({
      stage: "academic_ppt_model_visual_critic",
      provider: config.taskPrimary.provider,
      model: config.taskPrimary.model,
      messages,
      maxTokens: 2600,
      signal: criticTimeout.signal,
      timeoutMs: MODEL_VISUAL_CRITIC_TIMEOUT_MS
    });
    const report = parseModelCriticReport(content, ruleVisualQa.score);
    return {
      ...report,
      status: imageFallbackReason ? "degraded" : report.status,
      fallbackReason: imageFallbackReason
    };
  } catch (error) {
    return createStructuredReview({
      enabled: true,
      status: "degraded",
      reason: `${imageFallbackReason ? `${imageFallbackReason} ` : ""}Model critic unavailable: ${summarizeFailure(error)}. Used structured review.`,
      ruleVisualQa,
      preview
    });
  } finally {
    criticTimeout.dispose();
  }
}
