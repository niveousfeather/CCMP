import type { PresentationDeck } from "@/lib/presentation/types";
import { createPresentationPlanV2, type PresentationPlanV2Input } from "@/lib/presentation/v2/planner";
import { checkPresentationPlanV2 } from "@/lib/presentation/v2/qa";

export function preparePresentationDeckV2(input: PresentationPlanV2Input): PresentationDeck {
  const planned = createPresentationPlanV2(input);
  const qa = checkPresentationPlanV2(planned);

  return {
    ...planned,
    qa
  };
}
