import type { ChatTaskCard, DeepWritingPanelState, DeepWritingSectionStatus } from "@/components/chat/chat-data";
import { normalizeDocumentStructure, normalizedBlocksToPlainText, type NormalizedDocumentBlock } from "@/lib/word-engine/normalize-document-structure";

export type DeepWritingClientState = {
  isOpen: boolean;
  activeTaskId?: string;
  panelState?: DeepWritingPanelState | null;
};

export type DeepWritingPanelEvent = {
  type: string;
  payload?: Record<string, unknown> | null;
};

const unsafePayloadKeys = new Set([
  "prompt",
  "chainOfThought",
  "chain-of-thought",
  "provider",
  "model",
  "stack",
  "apiKey",
  "api_key",
  "authorization",
  "internalJSON",
  "internalJson",
  "internal",
  "rawEvent",
  "rawJson",
  "rawHtml",
  "html",
  "rawMemory",
  "wordTaskMemory",
  "deepWritingTaskMemory",
  "modelReasoning"
]);

const unsafeTextPattern = /chain[-\s]?of[-\s]?thought|prompt|provider|api[_\s-]?key|authorization|stack trace|internal json|raw memory|raw html|wordTaskMemory|deepWritingTaskMemory|model reasoning/i;

export function createInitialDeepWritingClientState(): DeepWritingClientState {
  return {
    isOpen: false,
    panelState: null
  };
}

export function isUnsafeDeepWritingText(text: string) {
  return unsafeTextPattern.test(text);
}

export function shouldShowDeepWritingProcessButton(taskCard?: ChatTaskCard | null) {
  if (!taskCard) return false;
  return taskCard.mode === "deep_writing" || taskCard.panelAvailable === true || Boolean(taskCard.deepWritingTaskId);
}

export function closeDeepWritingPanel(state: DeepWritingClientState): DeepWritingClientState {
  return {
    ...state,
    isOpen: false,
    panelState: state.panelState ? { ...state.panelState, isOpen: false } : state.panelState
  };
}

export function openDeepWritingPanel(state: DeepWritingClientState, taskCard: ChatTaskCard | DeepWritingPanelState): DeepWritingClientState {
  const panelState = isTaskCard(taskCard) ? panelStateFromTaskCard(taskCard, state.panelState) : normalizePanelState(taskCard);
  return {
    isOpen: true,
    activeTaskId: panelState.taskId,
    panelState: {
      ...panelState,
      isOpen: true
    }
  };
}

export function reduceDeepWritingPanelEvent(state: DeepWritingClientState, event: DeepWritingPanelEvent): DeepWritingClientState {
  if (!event.type.startsWith("deep_writing_")) return state;
  const payload = sanitizePayload(event.payload || {});
  const taskId = readString(payload.taskId) || state.activeTaskId || state.panelState?.taskId || "deep-writing-task";
  const base = ensurePanelState(state, taskId, readString(payload.title));
  const panel = base.panelState || createPanelState(taskId, readString(payload.title));

  if (event.type === "deep_writing_started") {
    const nextPanel = {
      ...panel,
      isOpen: true,
      title: readString(payload.title) || panel.title,
      currentStage: readString(payload.stage) || readString(payload.currentStage) || "planning",
      progress: readNumber(payload.progress, panel.progress)
    };
    return { isOpen: true, activeTaskId: taskId, panelState: nextPanel };
  }

  if (event.type === "deep_writing_outline") {
    const outline = normalizeOutline(payload.outline);
    return updatePanel(base, {
      ...panel,
      outline: outline.length ? outline : panel.outline,
      currentStage: readString(payload.stage) || panel.currentStage,
      progress: readNumber(payload.progress, panel.progress)
    });
  }

  if (event.type === "deep_writing_section_started") {
    const sectionId = readString(payload.sectionId) || readString(payload.id) || panel.currentSection?.id || "section-current";
    const title = readString(payload.title) || findOutlineTitle(panel, sectionId) || "当前章节";
    return updatePanel(base, {
      ...panel,
      currentStage: "writing_sections",
      currentSection: { id: sectionId, title, draft: "" },
      ...documentPreviewPatch(panel.completedSections || [], { id: sectionId, title, draft: "" }),
      outline: upsertOutlineStatus(panel.outline, sectionId, title, "writing")
    });
  }

  if (event.type === "deep_writing_section_delta") {
    const sectionId = readString(payload.sectionId) || panel.currentSection?.id || "section-current";
    const title = readString(payload.title) || panel.currentSection?.title || findOutlineTitle(panel, sectionId) || "当前章节";
    const delta = readString(payload.delta) || readString(payload.text) || "";
    const currentDraft = panel.currentSection?.id === sectionId ? panel.currentSection.draft : "";
    return updatePanel(base, {
      ...panel,
      currentStage: "writing_sections",
      currentSection: {
        id: sectionId,
        title,
        draft: `${currentDraft}${delta}`
      },
      ...documentPreviewPatch(panel.completedSections || [], {
        id: sectionId,
        title,
        draft: `${currentDraft}${delta}`
      }),
      outline: upsertOutlineStatus(panel.outline, sectionId, title, "writing")
    });
  }

  if (event.type === "deep_writing_section_completed") {
    const sectionId = readString(payload.sectionId) || panel.currentSection?.id || "section-current";
    const title = readString(payload.title) || panel.currentSection?.title || findOutlineTitle(panel, sectionId) || "当前章节";
    const draft = readString(payload.draft) || panel.currentSection?.draft || readString(payload.preview);
    const preview = readString(payload.preview) || draft.slice(0, 120);
    const outline = panel.outline.map((item) =>
      item.id === sectionId
        ? {
            ...item,
            status: "completed" as const,
            preview
          }
        : item
    );
    return updatePanel(base, {
      ...panel,
      outline: outline.some((item) => item.id === sectionId) ? outline : [...outline, { id: sectionId, title, status: "completed", preview }],
      completedSections: upsertCompletedSection(panel.completedSections || [], sectionId, title, draft),
      ...documentPreviewPatch(upsertCompletedSection(panel.completedSections || [], sectionId, title, draft), undefined),
      progress: progressFromOutline(outline)
    });
  }

  if (event.type === "deep_writing_source_plan" || event.type === "deep_writing_source") {
    const sources = event.type === "deep_writing_source" ? normalizeSourceEvent(payload) : normalizeSources(payload.sources);
    const mergedSources = mergeSources(panel.sources, sources);
    return updatePanel(base, {
      ...panel,
      currentStage: readString(payload.stage) || panel.currentStage,
      sources: mergedSources.length ? mergedSources : panel.sources
    });
  }

  if (event.type === "deep_writing_completed") {
    return updatePanel(base, {
      ...panel,
      currentStage: "completed",
      progress: 100,
      canResume: false,
      completedSections: panel.completedSections || [],
      ...documentPreviewPatch(panel.completedSections || [], panel.currentSection),
      downloadUrl: readString(payload.downloadUrl) || panel.downloadUrl
    });
  }

  if (event.type === "deep_writing_failed" || event.type === "deep_writing_interrupted") {
    return updatePanel(base, {
      ...panel,
      currentStage: event.type === "deep_writing_failed" ? "failed" : "interrupted",
      canResume: true,
      ...documentPreviewPatch(panel.completedSections || [], panel.currentSection)
    });
  }

  return updatePanel(base, {
    ...panel,
    currentStage: readString(payload.stage) || readString(payload.currentStage) || panel.currentStage
  });
}

function isTaskCard(value: ChatTaskCard | DeepWritingPanelState): value is ChatTaskCard {
  return (value as ChatTaskCard).kind === "task_card";
}

function panelStateFromTaskCard(taskCard: ChatTaskCard, fallback?: DeepWritingPanelState | null): DeepWritingPanelState {
  if (taskCard.deepWritingPanelState) return normalizePanelState(taskCard.deepWritingPanelState);
  return createPanelState(taskCard.deepWritingTaskId || taskCard.taskId || fallback?.taskId || "deep-writing-task", taskCard.description || taskCard.title, {
    currentStage: taskCard.currentStage || fallback?.currentStage || "planning",
    progress: fallback?.progress || (taskCard.status === "completed" ? 100 : 0),
    outline: fallback?.outline || [],
    currentSection: fallback?.currentSection,
    completedSections: fallback?.completedSections || [],
    directDocumentBody: fallback?.directDocumentBody,
    normalizedBlocks: fallback?.normalizedBlocks,
    sources: fallback?.sources || [],
    canResume: taskCard.status !== "completed",
    downloadUrl: taskCard.downloadUrl || fallback?.downloadUrl || undefined
  });
}

function normalizePanelState(panelState: DeepWritingPanelState): DeepWritingPanelState {
  return {
    isOpen: panelState.isOpen,
    taskId: panelState.taskId,
    title: panelState.title || "深度写作任务",
    currentStage: panelState.currentStage || "planning",
    progress: clampProgress(panelState.progress),
    outline: normalizeOutline(panelState.outline),
    currentSection: panelState.currentSection
      ? {
          id: panelState.currentSection.id,
          title: panelState.currentSection.title,
          draft: panelState.currentSection.draft
        }
      : undefined,
    completedSections: normalizeCompletedSections(panelState.completedSections),
    ...documentPreviewPatch(normalizeCompletedSections(panelState.completedSections), panelState.currentSection, panelState.normalizedBlocks),
    sources: normalizeSources(panelState.sources),
    canResume: Boolean(panelState.canResume),
    downloadUrl: panelState.downloadUrl
  };
}

function createPanelState(taskId: string, title?: string, overrides: Partial<DeepWritingPanelState> = {}): DeepWritingPanelState {
  return {
    isOpen: true,
    taskId,
    title: title || "深度写作任务",
    currentStage: overrides.currentStage || "planning",
    progress: clampProgress(overrides.progress || 0),
    outline: overrides.outline || [],
    currentSection: overrides.currentSection,
    completedSections: overrides.completedSections || [],
    ...documentPreviewPatch(overrides.completedSections || [], overrides.currentSection, overrides.normalizedBlocks),
    sources: overrides.sources || [],
    canResume: overrides.canResume ?? true,
    downloadUrl: overrides.downloadUrl
  };
}

function ensurePanelState(state: DeepWritingClientState, taskId: string, title?: string): DeepWritingClientState {
  if (state.panelState && state.panelState.taskId === taskId) return state;
  return {
    ...state,
    activeTaskId: taskId,
    panelState: createPanelState(taskId, title)
  };
}

function updatePanel(state: DeepWritingClientState, panelState: DeepWritingPanelState): DeepWritingClientState {
  return {
    isOpen: state.isOpen || panelState.isOpen,
    activeTaskId: panelState.taskId,
    panelState
  };
}

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (unsafePayloadKeys.has(key)) continue;
    if (Array.isArray(value)) {
      result[key] = value
        .map((item) => (typeof item === "object" && item ? sanitizePayload(item as Record<string, unknown>) : item))
        .filter((item) => !isEmptyObject(item));
      continue;
    }
    if (typeof value === "object" && value) {
      const cleaned = sanitizePayload(value as Record<string, unknown>);
      if (!isEmptyObject(cleaned)) result[key] = cleaned;
      continue;
    }
    result[key] = value;
  }
  return result;
}

function normalizeOutline(value: unknown): DeepWritingPanelState["outline"] {
  if (!Array.isArray(value)) return [];
  const outline: DeepWritingPanelState["outline"] = [];
  value.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const record = sanitizePayload(item as Record<string, unknown>);
    const title = readString(record.title);
    if (!title) return;
    const preview = readString(record.preview) || readString(record.summary);
    outline.push({
      id: readString(record.id) || `section-${index + 1}`,
      title,
      status: normalizeStatus(readString(record.status)),
      ...(preview ? { preview } : {})
    });
  });
  return outline;
}

function normalizeSources(value: unknown): DeepWritingPanelState["sources"] {
  if (!Array.isArray(value)) return [];
  const sources: DeepWritingPanelState["sources"] = [];
  value.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const record = sanitizePayload(item as Record<string, unknown>);
    const title = readString(record.title);
    const summary = readString(record.summary);
    if (!title && !summary) return;
    const url = readString(record.url);
    sources.push({
      title: title || "资料来源",
      summary,
      ...(url ? { url } : {}),
      ...(readSourceType(record.sourceType) ? { sourceType: readSourceType(record.sourceType) } : {}),
      ...(readRelevance(record.relevance) ? { relevance: readRelevance(record.relevance) } : {}),
      adopted: Boolean(record.adopted)
    });
  });
  return sources;
}

function normalizeCompletedSections(value: unknown): NonNullable<DeepWritingPanelState["completedSections"]> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const record = sanitizePayload(item as Record<string, unknown>);
      const title = readString(record.title);
      const draft = readString(record.draft);
      if (!title || !draft) return null;
      return {
        id: readString(record.id) || `section-${index + 1}`,
        title,
        draft
      };
    })
    .filter((item): item is NonNullable<DeepWritingPanelState["completedSections"]>[number] => Boolean(item));
}

function normalizeSourceEvent(payload: Record<string, unknown>): DeepWritingPanelState["sources"] {
  const fromArray = normalizeSources(payload.sources);
  return fromArray.length ? fromArray : normalizeSources([payload]);
}

function mergeSources(existing: DeepWritingPanelState["sources"], incoming: DeepWritingPanelState["sources"]) {
  if (!incoming.length) return existing;
  const byKey = new Map<string, DeepWritingPanelState["sources"][number]>();
  [...existing, ...incoming].forEach((source) => {
    const key = `${source.url || ""}|${source.title}|${source.summary}`.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, source);
  });
  return Array.from(byKey.values());
}

function normalizeStatus(value?: string): DeepWritingSectionStatus {
  if (value === "writing" || value === "completed") return value;
  return "pending";
}

function upsertOutlineStatus(
  outline: DeepWritingPanelState["outline"],
  sectionId: string,
  title: string,
  status: DeepWritingSectionStatus
) {
  let found = false;
  const next = outline.map((item) => {
    if (item.id !== sectionId) return item;
    found = true;
    return { ...item, title: item.title || title, status };
  });
  return found ? next : [...next, { id: sectionId, title, status }];
}

function upsertCompletedSection(
  sections: NonNullable<DeepWritingPanelState["completedSections"]>,
  id: string,
  title: string,
  draft: string
) {
  if (!draft) return sections;
  let found = false;
  const next = sections.map((section) => {
    if (section.id !== id) return section;
    found = true;
    return { id, title: title || section.title, draft };
  });
  return found ? next : [...next, { id, title, draft }];
}

function buildDirectDocumentBody(
  completedSections: NonNullable<DeepWritingPanelState["completedSections"]>,
  currentSection?: DeepWritingPanelState["currentSection"] | null
) {
  const sections = [...completedSections];
  if (currentSection?.draft) {
    const existing = sections.findIndex((section) => section.id === currentSection.id);
    const next = { id: currentSection.id, title: currentSection.title, draft: currentSection.draft };
    if (existing >= 0) sections[existing] = next;
    else sections.push(next);
  }
  return sections.map((section) => `${section.title}\n${section.draft}`.trim()).filter(Boolean).join("\n\n");
}

function documentPreviewPatch(
  completedSections: NonNullable<DeepWritingPanelState["completedSections"]>,
  currentSection?: DeepWritingPanelState["currentSection"] | null,
  existingBlocks?: NormalizedDocumentBlock[]
): Pick<DeepWritingPanelState, "directDocumentBody" | "normalizedBlocks"> {
  const sections = [...completedSections];
  if (currentSection?.draft) {
    const existing = sections.findIndex((section) => section.id === currentSection.id);
    const next = { id: currentSection.id, title: currentSection.title, draft: currentSection.draft };
    if (existing >= 0) sections[existing] = next;
    else sections.push(next);
  }
  const normalizedBlocks = existingBlocks?.length
    ? existingBlocks
    : normalizeDocumentStructure({
        sections: sections.map((section) => ({
          heading: section.title,
          paragraphs: [section.draft]
        })),
        documentKind: looksLikeLessonPlan(sections) ? "lesson_plan" : "general"
      }).blocks;
  return {
    normalizedBlocks,
    directDocumentBody: normalizedBlocksToPlainText(normalizedBlocks) || buildDirectDocumentBody(completedSections, currentSection)
  };
}

function looksLikeLessonPlan(sections: Array<{ title: string; draft: string }>) {
  return sections.some((section) => /课程|教学|学情|课时|板书|作业|课堂|目标|重点|难点|教案/.test(`${section.title}\n${section.draft}`));
}

function findOutlineTitle(panel: DeepWritingPanelState, sectionId: string) {
  return panel.outline.find((item) => item.id === sectionId)?.title;
}

function progressFromOutline(outline: DeepWritingPanelState["outline"]) {
  if (!outline.length) return 0;
  return Math.round((outline.filter((item) => item.status === "completed").length / outline.length) * 100);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? clampProgress(value) : fallback;
}

function readSourceType(value: unknown): DeepWritingPanelState["sources"][number]["sourceType"] | undefined {
  if (value === "internal_search" || value === "uploaded_file" || value === "conversation" || value === "not_configured") return value;
  return undefined;
}

function readRelevance(value: unknown): DeepWritingPanelState["sources"][number]["relevance"] | undefined {
  if (value === "low" || value === "medium" || value === "high") return value;
  return undefined;
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isEmptyObject(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);
}
