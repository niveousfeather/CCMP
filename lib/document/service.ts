import { createDocxBuffer } from "./create";
import { planDocumentTask } from "./planner";
import { polishDocument } from "./polish";
import { reviseDocumentComments } from "./revise-comments";
import { reviseOriginalDocument } from "./revise-original";
import { uploadDocumentBuffer } from "./storage";
import type { DocumentTaskInput, DocumentTaskResult } from "./types";

export async function runDocumentTask(input: DocumentTaskInput): Promise<DocumentTaskResult> {
  const plan = planDocumentTask(input);

  if (plan.mode === "revise_comments") {
    return reviseDocumentComments({ ...input, requestedMode: "revise_comments" });
  }

  if (plan.mode === "revise_original") {
    return reviseOriginalDocument({ ...input, requestedMode: "revise_original" });
  }

  if (plan.mode === "polish") {
    return polishDocument({ ...input, requestedMode: "polish" });
  }

  const buffer = createDocxBuffer({
    markdown: input.markdown,
    title: plan.title,
    template: plan.template,
    prompt: input.generationPrompt,
    intent: input.generationIntent
  });
  const file = await uploadDocumentBuffer({
    userId: input.userId,
    buffer,
    fileName: plan.fileName || plan.title
  });

  return { file, files: [file], plan };
}
