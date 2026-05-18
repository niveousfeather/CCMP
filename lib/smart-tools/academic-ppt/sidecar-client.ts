import "server-only";

import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

import { readAcademicPptCheckpoint, writeAcademicPptCheckpoint } from "@/lib/smart-tools/academic-ppt/checkpoint-store";
import { generateAcademicPptOutline } from "@/lib/smart-tools/academic-ppt/model-adapter";
import { repairAcademicPptOutlineFromModelCritic } from "@/lib/smart-tools/academic-ppt/model-critic-repair";
import { runAcademicPptModelVisualCritic } from "@/lib/smart-tools/academic-ppt/model-visual-critic";
import { critiqueAcademicPptOutline } from "@/lib/smart-tools/academic-ppt/outline-critic";
import { repairAcademicPptOutline } from "@/lib/smart-tools/academic-ppt/outline-repair";
import { renderAcademicPptNativePreview } from "@/lib/smart-tools/academic-ppt/preview-renderer";
import { writeAcademicPptxFromOutline } from "@/lib/smart-tools/academic-ppt/pptx-writer";
import { enhanceAcademicPptResearch } from "@/lib/smart-tools/academic-ppt/research-enhancer";
import {
  appendAcademicPptLog,
  assertAcademicPptTaskNotCancelled,
  buildAcademicPptSlidesPreview,
  getAcademicPptOutputDir,
  getAcademicPptPreviewDir,
  readAcademicPptTaskRecord,
  updateAcademicPptStep,
  updateAcademicPptTaskRecord,
  writeAcademicPptQualityReport
} from "@/lib/smart-tools/academic-ppt/server-task-store";
import { extractAcademicPptSourceText } from "@/lib/smart-tools/academic-ppt/source-parser";
import { normalizeAcademicPptSettings } from "@/lib/smart-tools/academic-ppt/task-api";
import {
  getAcademicPptResumeStep,
  inferAcademicPptLastCompletedStep
} from "@/lib/smart-tools/academic-ppt/task-recovery";
import { hasActiveAcademicPptTaskLock } from "@/lib/smart-tools/academic-ppt/task-lock";
import { runAcademicPptVisualQa } from "@/lib/smart-tools/academic-ppt/visual-qa";
import type {
  AcademicPptOutline,
  AcademicPptPreviewManifest,
  AcademicPptQualityReport,
  AcademicPptResearchBrief,
  AcademicPptSettings,
  AcademicPptVisualQaReport
} from "@/lib/smart-tools/academic-ppt/types";

const MAX_REPAIR_ROUNDS = 2;
const MAX_MODEL_CRITIC_REPAIR_ROUNDS = 1;

type SourceCheckpoint = Awaited<ReturnType<typeof extractAcademicPptSourceText>>;
type ResearchBriefCheckpoint = AcademicPptResearchBrief;

type OutlineDraftCheckpoint = {
  outline: AcademicPptOutline;
  modelSource: "nexus-model" | "local-fallback";
  modelName: string;
  fallbackReason?: string;
};

type QualityCheckpoint = {
  report: AcademicPptQualityReport;
  repairRounds: number;
};

type RepairedOutlineCheckpoint = {
  outline: AcademicPptOutline;
  report: AcademicPptQualityReport;
  repairRounds: number;
};

type PptxExportCheckpoint = {
  outputFilePath: string;
  outputFileSize: number;
  slideCount: number;
};

type NativePreviewResult = Awaited<ReturnType<typeof renderAcademicPptNativePreview>>;

function validateAcademicPptAutoRepairResult({
  before,
  after,
  beforeReport,
  afterReport
}: {
  before: AcademicPptOutline;
  after: AcademicPptOutline;
  beforeReport: AcademicPptQualityReport;
  afterReport: AcademicPptQualityReport;
}) {
  const issues: string[] = [];
  const beforeCount = before.slides.length;
  const afterCount = after.slides.length;
  if (afterCount < 3) issues.push("slideCount too low after repair");
  if (afterCount > Math.max(beforeCount + 4, Math.ceil(beforeCount * 1.35))) issues.push("slideCount increased too much after repair");
  if (afterCount < Math.max(3, Math.floor(beforeCount * 0.65))) issues.push("slideCount dropped too much after repair");
  if (after.slides.some((slide) => !slide.title?.trim())) issues.push("empty title after repair");
  if (after.slides.some((slide) => slide.layout !== "cover" && slide.layout !== "section" && (!slide.bullets || slide.bullets.length === 0))) {
    issues.push("empty bullet content after repair");
  }
  const titles = after.slides.map((slide) => slide.title.trim().toLowerCase()).filter(Boolean);
  if (new Set(titles).size < titles.length) issues.push("duplicate title after repair");
  if (!after.slides.some((slide) => slide.layout === "cover")) issues.push("missing cover after repair");
  if (after.slides.length >= 8 && !after.slides.some((slide) => slide.layout === "agenda")) issues.push("missing agenda after repair");
  if (!after.slides.some((slide) => slide.layout === "summary" || slide.layout === "ending")) issues.push("missing summary after repair");
  const dominantLayoutCount = Math.max(...Array.from(after.slides.reduce((map, slide) => map.set(slide.layout, (map.get(slide.layout) || 0) + 1), new Map<string, number>()).values()));
  if (dominantLayoutCount >= Math.max(5, Math.ceil(after.slides.length * 0.75))) issues.push("dominant layout ratio too high after repair");
  if (afterReport.score + 5 < beforeReport.score) issues.push("outline quality score decreased after repair");
  if (afterReport.issues.filter((issue) => issue.severity === "error").length > beforeReport.issues.filter((issue) => issue.severity === "error").length) {
    issues.push("outline critic found more errors after repair");
  }
  return {
    ok: issues.length === 0,
    fallbackReason: issues.join("; ")
  };
}

function shouldRepairQualityReport(report: AcademicPptQualityReport) {
  if (report.level !== "good") return true;
  return report.issues.some((issue) =>
    [
      "missing_cover",
      "missing_agenda",
      "missing_summary",
      "empty_outline_title",
      "empty_slide_title",
      "empty_bullets",
      "too_many_bullets",
      "long_bullet",
      "duplicate_title",
      "overflow_risk"
    ].includes(issue.code)
  );
}

function summarizeError(error: unknown) {
  if (!(error instanceof Error)) return "Academic PPT task failed.";
  return error.message
    .replace(/[A-Za-z]:[\\/][^\s"'<>]+/g, "[local-path]")
    .replace(/\/(?:Users|home|var|tmp|mnt)\/[^\s"'<>]+/g, "[local-path]")
    .replace(/[A-Z0-9_]*(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*/gi, "[sensitive-config]")
    .replace(/\bAuthorization\b/gi, "[auth-header]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "[bearer-token]")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

async function exportAcademicPptxForTask({
  taskId,
  outline,
  outputFilePath,
  settings,
  researchBrief,
  force
}: {
  taskId: string;
  outline: AcademicPptOutline;
  outputFilePath: string;
  settings: AcademicPptSettings;
  researchBrief?: AcademicPptResearchBrief;
  force?: boolean;
}): Promise<PptxExportCheckpoint> {
  if (!force) {
    try {
      const cached = await readAcademicPptCheckpoint<PptxExportCheckpoint>(taskId, "pptx-exported");
      await stat(cached.outputFilePath);
      await appendAcademicPptLog(taskId, "info", "Loaded PPTX export checkpoint.");
      return cached;
    } catch {
      // Continue with a fresh export below.
    }
  }

  const writeResult = await writeAcademicPptxFromOutline({
    outputPath: outputFilePath,
    outline,
    settings,
    researchBrief
  });
  const outputStat = await stat(outputFilePath);
  const pptxExport = {
    outputFilePath,
    outputFileSize: outputStat.size,
    slideCount: writeResult.slideCount
  };
  await writeAcademicPptCheckpoint(taskId, "pptx-exported", pptxExport);
  return pptxExport;
}

async function renderAcademicPptPreviewForTask({
  taskId,
  pptxExport,
  expectedSlideCount,
  force
}: {
  taskId: string;
  pptxExport: PptxExportCheckpoint;
  expectedSlideCount: number;
  force?: boolean;
}): Promise<NativePreviewResult> {
  if (!force) {
    try {
      const manifest = await readAcademicPptCheckpoint<AcademicPptPreviewManifest>(taskId, "preview");
      await appendAcademicPptLog(taskId, "info", "Loaded preview checkpoint.");
      return {
        manifest,
        manifestPath: path.join(getAcademicPptPreviewDir(taskId), "manifest.json")
      };
    } catch {
      // Continue with a fresh preview below.
    }
  }

  const previewResult = await renderAcademicPptNativePreview({
    taskId,
    pptxPath: pptxExport.outputFilePath,
    expectedSlideCount,
    onLog: (level, message) => appendAcademicPptLog(taskId, level, message)
  });
  await writeAcademicPptCheckpoint(taskId, "preview", previewResult.manifest);
  return previewResult;
}

async function updateAcademicPptVisualQaSummary({
  taskId,
  outline,
  preview,
  settings,
  final
}: {
  taskId: string;
  outline: AcademicPptOutline;
  preview: AcademicPptPreviewManifest;
  settings: AcademicPptSettings;
  final?: boolean;
}) {
  const visualQa = runAcademicPptVisualQa({
    outline,
    preview,
    settings
  });
  await updateAcademicPptTaskRecord(taskId, {
    visualQaScore: visualQa.score,
    visualQaLevel: visualQa.level,
    visualQaIssuesCount: visualQa.issues.length,
    visualQaEnabled: settings.enableVisualQa !== false && settings.visualQaEnabled !== false,
    visualQaSummary: visualQa.summary,
    visualQaPreviewType: visualQa.previewType,
    iconDecorationEnabled: settings.enableIconDecoration === true || settings.iconSearchEnabled === true,
    ...(final ? { finalVisualQaScore: visualQa.score } : {})
  });
  return visualQa;
}

async function runModelCriticAndRepairLoop({
  taskId,
  qualityResult,
  settings,
  researchBrief,
  outputFilePath,
  pptxExport,
  previewResult,
  visualQa
}: {
  taskId: string;
  qualityResult: RepairedOutlineCheckpoint;
  settings: AcademicPptSettings;
  researchBrief?: AcademicPptResearchBrief;
  outputFilePath: string;
  pptxExport: PptxExportCheckpoint;
  previewResult: NativePreviewResult;
  visualQa: AcademicPptVisualQaReport;
}) {
  const modelCriticEnabled = settings.enableVisualQa !== false && settings.visualQaEnabled !== false;
  if (!modelCriticEnabled) {
    await updateAcademicPptTaskRecord(taskId, {
      modelCriticEnabled: false,
      modelCriticStatus: "skipped",
      modelCriticRounds: 0,
      autoRepairRounds: 0,
      autoRepairApplied: false,
      finalQualityScore: qualityResult.report.score,
      finalVisualQaScore: visualQa.score
    });
    await appendAcademicPptLog(taskId, "info", "Skipped model visual critic because visual QA is not enabled.");
    return { qualityResult, pptxExport, previewResult, visualQa };
  }

  let currentQualityResult = qualityResult;
  let currentPptxExport = pptxExport;
  let currentPreviewResult = previewResult;
  let currentVisualQa = visualQa;
  let modelCriticRounds = 0;
  let autoRepairRounds = 0;
  let autoRepairApplied = false;
  let lastScore = currentVisualQa.score;

  await updateAcademicPptTaskRecord(taskId, {
    modelCriticEnabled: true,
    modelCriticStatus: "skipped",
    modelCriticRounds: 0,
    autoRepairRounds: 0,
    autoRepairApplied: false,
    finalQualityScore: currentQualityResult.report.score,
    finalVisualQaScore: currentVisualQa.score
  });

  for (let round = 1; round <= MAX_MODEL_CRITIC_REPAIR_ROUNDS; round += 1) {
    await assertAcademicPptTaskNotCancelled(taskId);
    await updateAcademicPptStep(taskId, "visual_qa", Math.min(96 + round, 98), `Running model visual critic, round ${round}.`);
    await appendAcademicPptLog(taskId, "info", "Running model visual critic.");
    const criticReport = await runAcademicPptModelVisualCritic({
      outline: currentQualityResult.outline,
      preview: currentPreviewResult.manifest,
      ruleVisualQa: currentVisualQa,
      settings
    });
    modelCriticRounds = round;
    await writeAcademicPptCheckpoint(taskId, round === 1 ? "model-critic-round-1" : "model-critic-round-2", criticReport);
    await updateAcademicPptTaskRecord(taskId, {
      modelCriticEnabled: true,
      modelCriticStatus: criticReport.status,
      modelCriticScore: criticReport.score,
      modelCriticLevel: criticReport.level,
      modelCriticIssuesCount: criticReport.issues.length,
      modelCriticRounds,
      modelCriticFallbackReason: criticReport.fallbackReason,
      finalQualityScore: currentQualityResult.report.score,
      finalVisualQaScore: currentVisualQa.score
    });
    await appendAcademicPptLog(
      taskId,
      criticReport.level === "good" ? "info" : "warn",
      criticReport.status === "success" || criticReport.status === "degraded"
        ? `Model visual critic finished: ${criticReport.score} score, ${criticReport.issues.length} issue(s).`
        : "Model visual critic was skipped or unavailable; rule QA remains in effect."
    );

    if (!criticReport.enabled || !criticReport.repairActions.length || criticReport.score >= 90 || criticReport.level === "good") {
      break;
    }

    await updateAcademicPptStep(taskId, "repairing_slides", 98, `Applying automatic visual repair, round ${round}.`);
    const stableQualityResult = currentQualityResult;
    const stableVisualQa = currentVisualQa;
    const repair = repairAcademicPptOutlineFromModelCritic({
      outline: currentQualityResult.outline,
      report: criticReport,
      settings
    });
    await writeAcademicPptCheckpoint(taskId, round === 1 ? "auto-repair-round-1" : "auto-repair-round-2", {
      applied: repair.applied,
      changes: repair.changes,
      outline: repair.outline
    });
    if (!repair.applied) {
      await appendAcademicPptLog(taskId, "warn", "Automatic visual repair found no safe changes to apply.");
      break;
    }

    const nextReport = critiqueAcademicPptOutline({ outline: repair.outline, settings });
    const validation = validateAcademicPptAutoRepairResult({
      before: currentQualityResult.outline,
      after: repair.outline,
      beforeReport: currentQualityResult.report,
      afterReport: nextReport
    });
    if (!validation.ok) {
      await updateAcademicPptTaskRecord(taskId, {
        autoRepairApplied: false,
        autoRepairFallbackReason: `rollback: ${validation.fallbackReason}`,
        autoRepairRounds
      });
      await appendAcademicPptLog(taskId, "warn", `Automatic repair rollback: ${validation.fallbackReason}`);
      break;
    }

    autoRepairRounds = round;
    autoRepairApplied = true;
    currentQualityResult = {
      outline: repair.outline,
      report: nextReport,
      repairRounds: currentQualityResult.repairRounds + 1
    };
    await writeAcademicPptCheckpoint(taskId, "outline-repaired", currentQualityResult);
    const nextSlidesPreview = buildAcademicPptSlidesPreview(currentQualityResult.outline, settings);
    await updateAcademicPptTaskRecord(taskId, {
      qualityScore: nextReport.score,
      qualityLevel: nextReport.level,
      qualityIssuesCount: nextReport.issues.length,
      repairRounds: currentQualityResult.repairRounds,
      slideCount: currentQualityResult.outline.slides.length,
      outlineTitle: currentQualityResult.outline.title,
      slidesPreview: nextSlidesPreview,
      previewUpdatedAt: new Date().toISOString(),
      autoRepairRounds,
      autoRepairApplied,
      autoRepairFallbackReason: undefined
    });
    await appendAcademicPptLog(
      taskId,
      "info",
      `Automatic repair round ${round} applied: ${repair.changes.slice(0, 4).join("; ")}${repair.changes.length > 4 ? "..." : ""}`
    );

    currentPptxExport = await exportAcademicPptxForTask({
      taskId,
      outline: currentQualityResult.outline,
      outputFilePath,
      settings,
      researchBrief,
      force: true
    });
    await updateAcademicPptTaskRecord(taskId, {
      outputFilePath: currentPptxExport.outputFilePath,
      outputFileSize: currentPptxExport.outputFileSize,
      slideCount: currentPptxExport.slideCount
    });
    currentPreviewResult = await renderAcademicPptPreviewForTask({
      taskId,
      pptxExport: currentPptxExport,
      expectedSlideCount: currentPptxExport.slideCount,
      force: true
    });
    await updateAcademicPptTaskRecord(taskId, {
      previewAvailable: currentPreviewResult.manifest.available,
      previewType: currentPreviewResult.manifest.type,
      previewSlideCount: currentPreviewResult.manifest.slideCount,
      previewFallbackReason: currentPreviewResult.manifest.fallbackReason,
      previewManifestPath: currentPreviewResult.manifestPath,
      previewUpdatedAt: currentPreviewResult.manifest.generatedAt
    });
    currentVisualQa = await updateAcademicPptVisualQaSummary({
      taskId,
      outline: currentQualityResult.outline,
      preview: currentPreviewResult.manifest,
      settings,
      final: true
    });
    await updateAcademicPptTaskRecord(taskId, {
      finalQualityScore: currentQualityResult.report.score,
      finalVisualQaScore: currentVisualQa.score
    });
    await appendAcademicPptLog(taskId, "info", `Quality score changed from ${lastScore} to ${currentVisualQa.score}.`);
    if (currentVisualQa.score < stableVisualQa.score) {
      const fallbackReason = `rollback: visual QA score decreased from ${stableVisualQa.score} to ${currentVisualQa.score}`;
      await appendAcademicPptLog(taskId, "warn", `Automatic repair rollback: ${fallbackReason}`);
      currentQualityResult = stableQualityResult;
      autoRepairRounds = Math.max(0, round - 1);
      autoRepairApplied = autoRepairRounds > 0;
      await writeAcademicPptCheckpoint(taskId, "outline-repaired", currentQualityResult);
      currentPptxExport = await exportAcademicPptxForTask({
        taskId,
        outline: currentQualityResult.outline,
        outputFilePath,
        settings,
        researchBrief,
        force: true
      });
      currentPreviewResult = await renderAcademicPptPreviewForTask({
        taskId,
        pptxExport: currentPptxExport,
        expectedSlideCount: currentPptxExport.slideCount,
        force: true
      });
      const rollbackSlidesPreview = buildAcademicPptSlidesPreview(currentQualityResult.outline, settings);
      await updateAcademicPptTaskRecord(taskId, {
        qualityScore: currentQualityResult.report.score,
        qualityLevel: currentQualityResult.report.level,
        qualityIssuesCount: currentQualityResult.report.issues.length,
        slideCount: currentPptxExport.slideCount,
        outlineTitle: currentQualityResult.outline.title,
        slidesPreview: rollbackSlidesPreview,
        outputFilePath: currentPptxExport.outputFilePath,
        outputFileSize: currentPptxExport.outputFileSize,
        previewAvailable: currentPreviewResult.manifest.available,
        previewType: currentPreviewResult.manifest.type,
        previewSlideCount: currentPreviewResult.manifest.slideCount,
        previewFallbackReason: currentPreviewResult.manifest.fallbackReason,
        previewManifestPath: currentPreviewResult.manifestPath,
        previewUpdatedAt: currentPreviewResult.manifest.generatedAt,
        autoRepairApplied,
        autoRepairFallbackReason: fallbackReason,
        autoRepairRounds,
        finalQualityScore: currentQualityResult.report.score
      });
      currentVisualQa = await updateAcademicPptVisualQaSummary({
        taskId,
        outline: currentQualityResult.outline,
        preview: currentPreviewResult.manifest,
        settings,
        final: true
      });
      await updateAcademicPptTaskRecord(taskId, {
        finalVisualQaScore: currentVisualQa.score
      });
      break;
    }
    if (currentVisualQa.score <= lastScore) break;
    lastScore = currentVisualQa.score;
  }

  await updateAcademicPptTaskRecord(taskId, {
    modelCriticRounds,
    autoRepairRounds,
    autoRepairApplied,
    finalQualityScore: currentQualityResult.report.score,
    finalVisualQaScore: currentVisualQa.score
  });

  return {
    qualityResult: currentQualityResult,
    pptxExport: currentPptxExport,
    previewResult: currentPreviewResult,
    visualQa: currentVisualQa
  };
}

async function runOutlineQualityLoop({
  outline,
  settings,
  sourceText,
  sourceTitle,
  taskId
}: {
  outline: AcademicPptOutline;
  settings: AcademicPptSettings;
  sourceText: string;
  sourceTitle?: string;
  taskId: string;
}) {
  let currentOutline = outline;
  let report: AcademicPptQualityReport = critiqueAcademicPptOutline({ outline: currentOutline, settings });
  let repairRounds = 0;

  await appendAcademicPptLog(taskId, "info", `Outline quality check finished: ${report.issues.length} issue(s), score ${report.score}.`);

  while (repairRounds < MAX_REPAIR_ROUNDS && shouldRepairQualityReport(report)) {
    repairRounds += 1;
    await updateAcademicPptStep(taskId, "repairing_slides", 78 + repairRounds * 4, `Repairing outline, round ${repairRounds}.`);
    const repair = repairAcademicPptOutline({
      outline: currentOutline,
      report,
      settings,
      sourceText,
      sourceTitle
    });
    currentOutline = repair.outline;
    await appendAcademicPptLog(
      taskId,
      repair.changes.length ? "info" : "warn",
      repair.changes.length
        ? `Repair round ${repairRounds} finished: ${repair.changes.slice(0, 4).join("; ")}${repair.changes.length > 4 ? "..." : ""}`
        : `Repair round ${repairRounds} found no automatic changes.`
    );

    const nextReport = critiqueAcademicPptOutline({ outline: currentOutline, settings });
    await appendAcademicPptLog(taskId, "info", `Post-repair quality score: ${nextReport.score}; remaining issues: ${nextReport.issues.length}.`);

    report = nextReport;
    if (nextReport.level !== "poor" && !nextReport.issues.some((issue) => issue.severity === "error")) break;
  }

  return { outline: currentOutline, report, repairRounds };
}

export async function tryStartAcademicPptHttpSidecar(taskId: string) {
  const sidecarUrl = process.env.ACADEMIC_PPT_AGENT_URL;
  if (!sidecarUrl) return false;

  const record = await readAcademicPptTaskRecord(taskId);
  await appendAcademicPptLog(taskId, "info", "Connecting generation service.");
  const response = await fetch(`${sidecarUrl.replace(/\/$/, "")}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskId,
      inputFilePath: record.inputFilePath,
      settings: record.settings
    })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Generation service start failed: ${response.status} ${body.slice(0, 160)}`);
  }
  await updateAcademicPptTaskRecord(taskId, {
    status: "running",
    currentStep: "parsing_source",
    progress: 12
  });
  await appendAcademicPptLog(taskId, "info", "Generation service accepted the task.");
  return true;
}

async function readOrCreateResearchBrief({
  taskId,
  source,
  settings
}: {
  taskId: string;
  source: SourceCheckpoint;
  settings: AcademicPptSettings;
}) {
  await updateAcademicPptStep(taskId, "research_enhancement", 24, "Preparing research enhancement.");
  let researchBrief: ResearchBriefCheckpoint;
  try {
    researchBrief = await readAcademicPptCheckpoint<ResearchBriefCheckpoint>(taskId, "research-brief");
    await appendAcademicPptLog(taskId, "info", "Loaded research enhancement checkpoint.");
  } catch {
    researchBrief = await enhanceAcademicPptResearch({
      sourceText: source.text,
      sourceTitle: source.title,
      settings
    });
    await writeAcademicPptCheckpoint(taskId, "research-brief", researchBrief);
  }

  await assertAcademicPptTaskNotCancelled(taskId);
  await updateAcademicPptTaskRecord(taskId, {
    researchEnabled: settings.enableDeepResearch,
    externalResearchEnabled: settings.enableExternalResearch,
    researchStatus: researchBrief.status,
    researchSourcesCount: researchBrief.sources.length,
    researchFallbackReason: researchBrief.fallbackReason,
    researchBriefUpdatedAt: researchBrief.generatedAt,
    lastCompletedStep: "research_ready",
    resumeFromStep: "planning_outline",
    resumable: true
  });

  if (researchBrief.status === "skipped") {
    await appendAcademicPptLog(taskId, "info", "Research enhancement was not enabled; continuing from uploaded content.");
  } else {
    await appendAcademicPptLog(taskId, "info", `Generated ${researchBrief.queries.length} research query hint(s).`);
    await appendAcademicPptLog(taskId, researchBrief.sources.length ? "info" : "warn", `Collected ${researchBrief.sources.length} research source summary item(s).`);
    await appendAcademicPptLog(
      taskId,
      researchBrief.status === "success" ? "info" : "warn",
      researchBrief.status === "success"
        ? "Research enhancement completed and will inform the outline."
        : "Research enhancement degraded; continuing from uploaded content."
    );
  }

  return researchBrief;
}

export async function runAcademicPptGenerationPipeline(taskId: string, resume = false) {
  const record = await readAcademicPptTaskRecord(taskId);
  const settings = record.settings ? normalizeAcademicPptSettings(record.settings) : undefined;
  if (!settings) throw new Error("Task generation settings are missing.");
  await updateAcademicPptTaskRecord(taskId, {
    modelSource: "local-fallback",
    generatorSource: "local-fallback",
    modelName: "Fallback generation",
    generationMode: "paper-ppt-agent-rule-fallback",
    visualPipelineStatus: "degraded",
    fallbackReason: "Generation service unavailable; generated with limited fallback renderer."
  });
  await appendAcademicPptLog(taskId, "warn", "Fallback generation is being used. Quality may be limited.");
  if (resume) {
    await appendAcademicPptLog(taskId, "info", `Resuming task from ${record.resumeFromStep || getAcademicPptResumeStep(record.lastCompletedStep)}.`);
  }

  await updateAcademicPptStep(taskId, "parsing_source", 15, `Parsing ${record.sourceFileType || "uploaded"} source.`);
  let source: SourceCheckpoint;
  try {
    source = await readAcademicPptCheckpoint<SourceCheckpoint>(taskId, "source-parsed");
    await appendAcademicPptLog(taskId, "info", "Loaded source parsing checkpoint.");
  } catch {
    source = await extractAcademicPptSourceText(record);
    await writeAcademicPptCheckpoint(taskId, "source-parsed", source);
  }
  await assertAcademicPptTaskNotCancelled(taskId);
  await updateAcademicPptTaskRecord(taskId, {
    extractedTextLength: source.characterCount,
    lastCompletedStep: "source_parsed",
    resumeFromStep: "planning_outline",
    resumable: true
  });
  await appendAcademicPptLog(taskId, "info", `Extracted ${source.characterCount} characters from source.`);

  const researchBrief = await readOrCreateResearchBrief({ taskId, source, settings });

  await updateAcademicPptStep(taskId, "planning_outline", 34, "Planning academic PPT outline.");
  let outlineDraft: OutlineDraftCheckpoint;
  try {
    outlineDraft = await readAcademicPptCheckpoint<OutlineDraftCheckpoint>(taskId, "outline-draft");
    await appendAcademicPptLog(taskId, "info", "Loaded outline checkpoint.");
  } catch {
    const outlineResult = await generateAcademicPptOutline({
      sourceText: source.text,
      sourceTitle: source.title,
      settings,
      researchBrief
    });
    outlineDraft = {
      outline: outlineResult.outline,
      modelSource: outlineResult.modelSource,
      modelName: `${outlineResult.providerUsed}:${outlineResult.modelUsed}`,
      fallbackReason: outlineResult.fallbackReason
    };
    await writeAcademicPptCheckpoint(taskId, "outline-draft", outlineDraft);
  }
  await assertAcademicPptTaskNotCancelled(taskId);
  await updateAcademicPptTaskRecord(taskId, {
    modelSource: outlineDraft.modelSource,
    modelName: outlineDraft.modelName,
    fallbackReason: outlineDraft.fallbackReason,
    slideCount: outlineDraft.outline.slides.length + 1,
    outlineTitle: outlineDraft.outline.title,
    lastCompletedStep: "outline_generated",
    resumeFromStep: "running_critic",
    resumable: true
  });
  await appendAcademicPptLog(
    taskId,
    outlineDraft.modelSource === "local-fallback" ? "warn" : "info",
    outlineDraft.modelSource === "local-fallback"
      ? "Remote model unavailable; used local outline fallback."
      : `Model outline generated: ${outlineDraft.outline.slides.length} slide plan item(s).`
  );
  if (outlineDraft.fallbackReason) {
    await appendAcademicPptLog(taskId, "warn", `Model fallback reason: ${summarizeError(new Error(outlineDraft.fallbackReason))}`);
  }

  await updateAcademicPptStep(taskId, "running_critic", 70, "Checking outline quality.");
  let qualityResult: RepairedOutlineCheckpoint;
  try {
    qualityResult = await readAcademicPptCheckpoint<RepairedOutlineCheckpoint>(taskId, "outline-repaired");
    await appendAcademicPptLog(taskId, "info", "Loaded repaired outline checkpoint.");
  } catch {
    const qualityLoopResult = await runOutlineQualityLoop({
      outline: outlineDraft.outline,
      settings,
      sourceText: source.text,
      sourceTitle: source.title,
      taskId
    });
    await writeAcademicPptCheckpoint<QualityCheckpoint>(taskId, "outline-critic", {
      report: qualityLoopResult.report,
      repairRounds: qualityLoopResult.repairRounds
    });
    qualityResult = qualityLoopResult;
    await writeAcademicPptCheckpoint(taskId, "outline-repaired", qualityResult);
  }
  await assertAcademicPptTaskNotCancelled(taskId);
  const qualityReportPath = await writeAcademicPptQualityReport(taskId, qualityResult.report);
  const slidesPreview = buildAcademicPptSlidesPreview(qualityResult.outline, settings);
  await updateAcademicPptTaskRecord(taskId, {
    qualityScore: qualityResult.report.score,
    qualityLevel: qualityResult.report.level,
    qualityIssuesCount: qualityResult.report.issues.length,
    repairRounds: qualityResult.repairRounds,
    qualityReportPath,
    slideCount: qualityResult.outline.slides.length,
    outlineTitle: qualityResult.outline.title,
    slidesPreview,
    previewUpdatedAt: new Date().toISOString(),
    lastCompletedStep: "outline_ready",
    resumeFromStep: "exporting_pptx",
    resumable: true
  });
  await appendAcademicPptLog(
    taskId,
    qualityResult.report.level === "good" ? "info" : "warn",
    `Outline quality level ${qualityResult.report.level}; ${qualityResult.report.issues.length} issue(s); ${qualityResult.repairRounds} repair round(s).`
  );

  await updateAcademicPptStep(taskId, "generating_slides", 84, "Preparing PPTX export.");
  const outputDir = getAcademicPptOutputDir(taskId);
  await mkdir(outputDir, { recursive: true });
  const outputFilePath = path.join(outputDir, "academic-ppt-result.pptx");
  if (qualityResult.outline.slides.length < 3) {
    throw new Error("Generated outline is too short for PPTX export.");
  }

  await updateAcademicPptStep(taskId, "exporting_pptx", 90, "Exporting PPTX file.");
  await assertAcademicPptTaskNotCancelled(taskId);
  let pptxExport = await exportAcademicPptxForTask({
    taskId,
    outline: qualityResult.outline,
    outputFilePath,
    settings,
    researchBrief
  });
  await updateAcademicPptTaskRecord(taskId, {
    outputFilePath: pptxExport.outputFilePath,
    outputFileSize: pptxExport.outputFileSize,
    slideCount: pptxExport.slideCount,
    lastCompletedStep: "pptx_exported",
    resumeFromStep: "rendering_preview",
    resumable: true
  });

  await updateAcademicPptStep(taskId, "rendering_preview", 95, "Rendering PPTX preview.");
  let previewResult = await renderAcademicPptPreviewForTask({
    taskId,
    pptxExport,
    expectedSlideCount: pptxExport.slideCount
  });
  await assertAcademicPptTaskNotCancelled(taskId);
  await updateAcademicPptTaskRecord(taskId, {
    previewAvailable: previewResult.manifest.available,
    previewType: previewResult.manifest.type,
    previewSlideCount: previewResult.manifest.slideCount,
    previewFallbackReason: previewResult.manifest.fallbackReason,
    previewManifestPath: previewResult.manifestPath,
    previewUpdatedAt: previewResult.manifest.generatedAt,
    lastCompletedStep: "completed",
    resumeFromStep: undefined,
    resumable: false
  });
  await appendAcademicPptLog(
    taskId,
    previewResult.manifest.available ? "info" : "warn",
    previewResult.manifest.available
      ? `PPTX preview generated: ${previewResult.manifest.slideCount} page(s).`
      : previewResult.manifest.fallbackReason || "Native preview unavailable; structured preview remains available."
  );

  await appendAcademicPptLog(taskId, "info", "Running rule visual QA.");
  let visualQa = await updateAcademicPptVisualQaSummary({
    taskId,
    outline: qualityResult.outline,
    preview: previewResult.manifest,
    settings,
    final: true
  });
  await appendAcademicPptLog(
    taskId,
    visualQa.level === "good" ? "info" : "warn",
    settings.enableVisualQa === false || settings.visualQaEnabled === false
      ? "Visual QA was not enabled."
      : `Visual QA finished: ${visualQa.score} score, ${visualQa.issues.length} issue(s).`
  );

  const criticLoopResult = await runModelCriticAndRepairLoop({
    taskId,
    qualityResult,
    settings,
    researchBrief,
    outputFilePath,
    pptxExport,
    previewResult,
    visualQa
  });
  qualityResult = criticLoopResult.qualityResult;
  pptxExport = criticLoopResult.pptxExport;
  previewResult = criticLoopResult.previewResult;
  visualQa = criticLoopResult.visualQa;

  await updateAcademicPptTaskRecord(taskId, {
    status: "success",
    progress: 100,
    currentStep: "completed",
    visualPipelineStatus: "degraded",
    outputFilePath: pptxExport.outputFilePath,
    outputFileSize: pptxExport.outputFileSize,
    slideCount: pptxExport.slideCount,
    completedAt: new Date().toISOString(),
    resumable: false
  });
  await appendAcademicPptLog(taskId, "info", `PPTX generated. File size: ${Math.round(pptxExport.outputFileSize / 1024)} KB.`);
}

export async function resumeAcademicPptGeneration(taskId: string) {
  const record = await readAcademicPptTaskRecord(taskId);
  if (record.status === "cancelled" || record.cancelRequested) {
    throw new Error("Task was cancelled and cannot be resumed.");
  }
  if (await hasActiveAcademicPptTaskLock(taskId)) {
    await appendAcademicPptLog(taskId, "warn", "Task is still running; duplicate resume skipped.");
    return record;
  }
  if (!record.resumable && record.status !== "failed" && record.status !== "running") {
    throw new Error("Current task cannot be resumed.");
  }
  const lastCompletedStep = await inferAcademicPptLastCompletedStep(taskId, record.lastCompletedStep);
  const resumeFromStep = record.resumeFromStep || getAcademicPptResumeStep(lastCompletedStep);
  if (!lastCompletedStep || resumeFromStep === "completed") {
    throw new Error("No usable checkpoint is available for resume.");
  }
  try {
    await stat(record.inputFilePath);
  } catch {
    await updateAcademicPptTaskRecord(taskId, {
      status: "failed",
      currentStep: "failed",
      progress: 100,
      error: "Uploaded file is missing; please upload again.",
      resumable: false,
      resumeFromStep: undefined,
      failedAt: new Date().toISOString()
    });
    await appendAcademicPptLog(taskId, "error", "Uploaded file is missing; resume is unavailable.");
    throw new Error("Uploaded file is missing; please upload again.");
  }
  await updateAcademicPptTaskRecord(taskId, {
    status: "queued",
    progress: Math.max(record.progress || 5, 5),
    currentStep: resumeFromStep,
    error: undefined,
    lastCompletedStep,
    resumeFromStep,
    resumable: true,
    startedAt: record.startedAt || new Date().toISOString(),
    timeoutAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
  });
  await appendAcademicPptLog(taskId, "info", `Task requeued and will resume from ${resumeFromStep}.`);
  return readAcademicPptTaskRecord(taskId);
}

export function summarizeAcademicPptTaskError(error: unknown) {
  return summarizeError(error);
}
