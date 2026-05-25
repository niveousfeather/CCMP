import { composeDeepWritingDraft } from "@/lib/word-engine/compose-deep-writing-draft";
import {
  createDeepWritingEvent,
  type DeepWritingEventType,
  type DeepWritingTaskMemory,
  type DeepWritingTaskStage
} from "@/lib/agent/runtime/deep-writing-memory";

export type SafeDeepWritingEvent = {
  type: DeepWritingEventType;
  payload: Record<string, unknown>;
};

export type DeepWritingRunnerInput = {
  memory: DeepWritingTaskMemory;
  sourceText?: string;
  conversationSummary?: string;
  emit: (event: SafeDeepWritingEvent) => Promise<void> | void;
};

const completedStages = new Set<DeepWritingTaskStage>(["completed"]);

export async function runDeepWritingDraft(input: DeepWritingRunnerInput): Promise<DeepWritingTaskMemory> {
  const memory = cloneMemory(input.memory);
  const draft = composeDeepWritingDraft({
    memory,
    sourceText: input.sourceText,
    conversationSummary: input.conversationSummary
  });
  const timestamp = new Date().toISOString();
  const existingOutlineById = new Map(memory.outline.map((section) => [section.id, section]));
  memory.outline = draft.sections.map((section) => {
    const existing = existingOutlineById.get(section.id);
    return {
      id: section.id,
      title: section.title,
      status: existing?.status || "pending",
      summary: existing?.summary,
      draft: existing?.draft
    };
  });
  memory.pendingSectionIds = memory.outline.filter((section) => section.status !== "completed").map((section) => section.id);
  memory.completedSectionIds = memory.outline.filter((section) => section.status === "completed").map((section) => section.id);
  memory.currentStage = completedStages.has(memory.currentStage) && memory.pendingSectionIds.length ? "writing_sections" : "planning";
  memory.updatedAt = timestamp;

  await emit(input.emit, "deep_writing_started", {
    taskId: memory.taskId,
    title: memory.topic,
    currentStage: "planning",
    progress: 0,
    panelAutoOpen: true
  });

  memory.currentStage = "building_outline";
  await emit(input.emit, "deep_writing_outline", {
    taskId: memory.taskId,
    outline: panelOutline(memory),
    progress: 10
  });

  const total = Math.max(draft.sections.length, 1);
  const completedAtStart = new Set(memory.completedSectionIds);
  for (let index = 0; index < draft.sections.length; index += 1) {
    const section = draft.sections[index];
    if (completedAtStart.has(section.id)) continue;

    memory.currentStage = "writing_sections";
    memory.currentSectionId = section.id;
    updateSection(memory, section.id, { status: "writing" });
    await emit(input.emit, "deep_writing_section_started", {
      taskId: memory.taskId,
      sectionId: section.id,
      title: section.title,
      progress: progressFor(index, total, 12)
    });

    let accumulated = "";
    for (const paragraph of section.paragraphs) {
      const delta = `${paragraph}\n\n`;
      accumulated += delta;
      updateSection(memory, section.id, { draft: accumulated });
      await emit(input.emit, "deep_writing_section_delta", {
        taskId: memory.taskId,
        sectionId: section.id,
        delta,
        accumulatedPreview: accumulated.slice(0, 220),
        progress: progressFor(index, total, 18)
      });
    }

    const preview = accumulated.replace(/\s+/g, " ").trim().slice(0, 180);
    updateSection(memory, section.id, { status: "completed", summary: preview, draft: accumulated });
    memory.completedSectionIds = unique([...memory.completedSectionIds, section.id]);
    memory.pendingSectionIds = memory.outline.filter((item) => item.status !== "completed").map((item) => item.id);
    await emit(input.emit, "deep_writing_section_completed", {
      taskId: memory.taskId,
      sectionId: section.id,
      preview,
      progress: progressFor(index + 1, total, 18)
    });
  }

  memory.currentSectionId = undefined;
  memory.currentStage = "polishing";
  await emit(input.emit, "deep_writing_polishing", {
    taskId: memory.taskId,
    currentStage: "polishing",
    progress: 90
  });

  memory.currentStage = "completed";
  memory.pendingSectionIds = [];
  memory.updatedAt = new Date().toISOString();
  await emit(input.emit, "deep_writing_completed", {
    taskId: memory.taskId,
    currentStage: "completed",
    progress: 100,
    panelAvailable: true,
    draftCompleted: true
  });

  return memory;
}

async function emit(
  emitEvent: DeepWritingRunnerInput["emit"],
  type: DeepWritingEventType,
  payload: Record<string, unknown>
) {
  const event = createDeepWritingEvent(type, payload) as SafeDeepWritingEvent;
  await emitEvent(event);
}

function cloneMemory(memory: DeepWritingTaskMemory): DeepWritingTaskMemory {
  return {
    ...memory,
    sourceFileNames: [...memory.sourceFileNames],
    searchPlan: {
      ...memory.searchPlan,
      keywords: [...memory.searchPlan.keywords],
      questions: [...memory.searchPlan.questions]
    },
    outline: memory.outline.map((section) => ({ ...section })),
    completedSectionIds: [...memory.completedSectionIds],
    pendingSectionIds: [...memory.pendingSectionIds],
    adoptedSources: memory.adoptedSources.map((source) => ({
      ...source,
      usedInSections: [...source.usedInSections]
    }))
  };
}

function panelOutline(memory: DeepWritingTaskMemory) {
  return memory.outline.map((section) => ({
    id: section.id,
    title: section.title,
    status: section.status,
    preview: section.summary || section.draft?.slice(0, 120)
  }));
}

function updateSection(
  memory: DeepWritingTaskMemory,
  sectionId: string,
  patch: Partial<DeepWritingTaskMemory["outline"][number]>
) {
  memory.outline = memory.outline.map((section) => (section.id === sectionId ? { ...section, ...patch } : section));
}

function progressFor(position: number, total: number, base: number) {
  const span = 78;
  return Math.min(89, Math.max(base, Math.round(base + (position / total) * span)));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
