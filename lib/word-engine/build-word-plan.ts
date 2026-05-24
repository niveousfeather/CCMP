import { composeWordPlan } from "./compose-word-content";
import type { WordPlan, WordRequest } from "./types";

export function buildWordPlan(request: WordRequest): WordPlan {
  return composeWordPlan(request);
}
