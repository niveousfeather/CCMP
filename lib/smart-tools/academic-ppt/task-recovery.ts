import "server-only";

import { hasAcademicPptCheckpoint } from "@/lib/smart-tools/academic-ppt/checkpoint-store";
import {
  appendAcademicPptLog,
  readAcademicPptTaskRecord,
  updateAcademicPptTaskRecord
} from "@/lib/smart-tools/academic-ppt/server-task-store";
import { hasActiveAcademicPptTaskLock } from "@/lib/smart-tools/academic-ppt/task-lock";
import type {
  AcademicPptCheckpointName,
  AcademicPptTaskRecord,
  AcademicPptTaskStep
} from "@/lib/smart-tools/academic-ppt/types";

const STALE_RUNNING_MS = 45 * 60 * 1000;

function stepRank(step?: AcademicPptTaskStep) {
  const ranks: Partial<Record<AcademicPptTaskStep, number>> = {
    upload_received: 1,
    source_parsed: 2,
    research_ready: 3,
    outline_generated: 4,
    outline_ready: 5,
    pptx_exported: 6,
    completed: 7
  };
  return step ? ranks[step] || 0 : 0;
}

export function getAcademicPptResumeStep(step?: AcademicPptTaskStep): AcademicPptTaskStep {
  if (step === "upload_received") return "parsing_source";
  if (step === "research_ready") return "planning_outline";
  if (step === "source_parsed") return "planning_outline";
  if (step === "outline_generated") return "running_critic";
  if (step === "outline_ready") return "exporting_pptx";
  if (step === "pptx_exported") return "rendering_preview";
  if (step === "completed") return "completed";
  return "parsing_source";
}

export async function inferAcademicPptLastCompletedStep(taskId: string, current?: AcademicPptTaskStep) {
  let inferred = current;
  const candidates: Array<{ checkpoint: AcademicPptCheckpointName; step: AcademicPptTaskStep }> = [
    { checkpoint: "preview", step: "completed" },
    { checkpoint: "pptx-exported", step: "pptx_exported" },
    { checkpoint: "outline-repaired", step: "outline_ready" },
    { checkpoint: "outline-draft", step: "outline_generated" },
    { checkpoint: "research-brief", step: "research_ready" },
    { checkpoint: "source-parsed", step: "source_parsed" }
  ];

  for (const candidate of candidates) {
    if (stepRank(inferred) >= stepRank(candidate.step)) continue;
    if (await hasAcademicPptCheckpoint(taskId, candidate.checkpoint)) {
      inferred = candidate.step;
    }
  }

  return inferred;
}

function isTaskPotentiallyStale(record: AcademicPptTaskRecord) {
  if (record.status !== "pending" && record.status !== "running") return false;
  const timeoutAt = Date.parse(record.timeoutAt || "");
  if (!Number.isNaN(timeoutAt) && timeoutAt <= Date.now()) return true;
  const updatedAt = Date.parse(record.updatedAt || "");
  return Number.isNaN(updatedAt) || Date.now() - updatedAt > STALE_RUNNING_MS;
}

export async function reconcileAcademicPptTaskRecovery(taskId: string) {
  const record = await readAcademicPptTaskRecord(taskId);
  if (!isTaskPotentiallyStale(record)) return record;
  if (await hasActiveAcademicPptTaskLock(taskId)) return record;

  const lastCompletedStep = await inferAcademicPptLastCompletedStep(taskId, record.lastCompletedStep);
  const resumeFromStep = getAcademicPptResumeStep(lastCompletedStep);
  const resumable = Boolean(lastCompletedStep) && resumeFromStep !== "completed";
  const next = await updateAcademicPptTaskRecord(taskId, {
    status: "failed",
    currentStep: "failed",
    progress: Math.max(record.progress || 0, 5),
    error: resumable ? "Task was interrupted and can be resumed." : "Task was interrupted. Please upload again.",
    lastCompletedStep,
    resumeFromStep: resumable ? resumeFromStep : undefined,
    resumable,
    failedAt: new Date().toISOString()
  });
  await appendAcademicPptLog(taskId, resumable ? "warn" : "error", next.error || "Task was interrupted.");
  return next;
}
