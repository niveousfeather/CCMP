import { buildWordPlan } from "./build-word-plan";
import { generateDocx } from "./generate-docx";
import { sanitizeWordContent } from "./sanitize-word-content";
import type { WordContent, WordRequest } from "./types";
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
  const validation = validateWordRequest(request);
  if (!validation.ok) {
    throw new Error(validation.errors.join(" "));
  }

  const plan = buildWordPlan(request);
  const content = sanitizeWordContent(planToContent(plan));
  return generateDocx({ content, request, warnings: validation.warnings });
}

export { buildWordPlan } from "./build-word-plan";
export { generateDocx } from "./generate-docx";
export { sanitizeWordContent } from "./sanitize-word-content";
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
  WordValidationResult
} from "./types";
