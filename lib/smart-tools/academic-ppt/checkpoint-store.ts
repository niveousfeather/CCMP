import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { getAcademicPptCheckpointDir } from "@/lib/smart-tools/academic-ppt/server-task-store";
import type { AcademicPptCheckpointName } from "@/lib/smart-tools/academic-ppt/types";

const CHECKPOINT_FILE_NAMES: Record<AcademicPptCheckpointName, string> = {
  "source-parsed": "source-parsed.json",
  "research-brief": "research-brief.json",
  "paper-outline": "paper-outline.json",
  "slide-plan": "slide-plan.json",
  "template-plan": "template-plan.json",
  "generation-state": "generation-state.json",
  "outline-draft": "outline-draft.json",
  "outline-critic": "outline-critic.json",
  "outline-repaired": "outline-repaired.json",
  "pptx-exported": "pptx-exported.json",
  preview: "preview.json",
  "model-critic-round-1": "model-critic-round-1.json",
  "model-critic-round-2": "model-critic-round-2.json",
  "auto-repair-round-1": "auto-repair-round-1.json",
  "auto-repair-round-2": "auto-repair-round-2.json"
};

export function getAcademicPptCheckpointPath(taskId: string, name: AcademicPptCheckpointName) {
  return path.join(getAcademicPptCheckpointDir(taskId), CHECKPOINT_FILE_NAMES[name]);
}

export async function writeAcademicPptCheckpoint<T>(
  taskId: string,
  name: AcademicPptCheckpointName,
  data: T
) {
  const checkpointDir = getAcademicPptCheckpointDir(taskId);
  await mkdir(checkpointDir, { recursive: true });
  const targetPath = getAcademicPptCheckpointPath(taskId, name);
  const tempPath = path.join(checkpointDir, `${CHECKPOINT_FILE_NAMES[name]}.${Date.now()}.tmp`);
  const payload = {
    name,
    savedAt: new Date().toISOString(),
    data
  };
  await writeFile(tempPath, JSON.stringify(payload, null, 2), "utf8");
  await rename(tempPath, targetPath);
  return targetPath;
}

export async function readAcademicPptCheckpoint<T>(taskId: string, name: AcademicPptCheckpointName) {
  const raw = await readFile(getAcademicPptCheckpointPath(taskId, name), "utf8");
  const parsed = JSON.parse(raw) as { data: T };
  return parsed.data;
}

export async function hasAcademicPptCheckpoint(taskId: string, name: AcademicPptCheckpointName) {
  try {
    await readAcademicPptCheckpoint(taskId, name);
    return true;
  } catch {
    return false;
  }
}
