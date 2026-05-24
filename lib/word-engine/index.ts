import { buildWordPlan } from "./build-word-plan";
import { generateDocx } from "./generate-docx";
import { sanitizeWordContent } from "./sanitize-word-content";
import type { WordContent, WordRequest } from "./types";
import {
  attachPlanToWordTaskMemory,
  completeWordTaskMemory,
  createWordTaskMemory,
  throwWordTaskMemoryError,
  updateWordTaskMemory
} from "./task-memory";
import { validateWordRequest } from "./validate-word-request";

function planToContent(plan: ReturnType<typeof buildWordPlan>): WordContent {
  return {
    title: plan.title,
    subtitle: plan.subtitle,
    sections: plan.sections,
    tables: plan.tables
  };
}

export async function generateWordDocumentFromRequest(request: WordRequest) {
  let memory = createWordTaskMemory(request, "planning");
  const validation = validateWordRequest(request);
  if (!validation.ok) {
    throwWordTaskMemoryError(validation.errors.join(" "), memory);
  }

  try {
    const plan = buildWordPlan(request);
    memory = attachPlanToWordTaskMemory(memory, plan);
    memory = updateWordTaskMemory(memory, { currentStage: "sanitizing" });
    const content = sanitizeWordContent(planToContent(plan));
    memory = updateWordTaskMemory(memory, { currentStage: "rendering_docx" });
    memory = completeWordTaskMemory(memory, plan);
    return generateDocx({ content, request, warnings: validation.warnings, wordTaskMemory: memory });
  } catch (error) {
    throwWordTaskMemoryError(error, memory);
  }
}

export { buildWordPlan } from "./build-word-plan";
export { composeWordPlan } from "./compose-word-content";
export { generateDocx } from "./generate-docx";
export { sanitizeWordContent } from "./sanitize-word-content";
export {
  WordTaskMemoryError,
  createWordTaskMemory,
  resumeWordRequestFromMemory,
  failWordTaskMemory,
  completeWordTaskMemory
} from "./task-memory";
export { validateWordRequest } from "./validate-word-request";
export type {
  WordContent,
  WordGenerateResult,
  WordPlan,
  WordRequest,
  WordSection,
  WordSourceFile,
  WordStylePreset,
  WordTable,
  WordTaskMemory,
  WordTaskStage,
  WordValidationResult
} from "./types";
