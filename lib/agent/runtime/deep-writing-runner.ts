import { composeDeepWritingDraft } from "@/lib/word-engine/compose-deep-writing-draft";
import {
  createDeepWritingEvent,
  type DeepWritingEventType,
  type DeepWritingTaskMemory,
  type DeepWritingTaskStage
} from "@/lib/agent/runtime/deep-writing-memory";
import {
  createDefaultDeepWritingSearchProvider,
  type DeepWritingSearchProvider,
  type DeepWritingSearchQuery,
  type DeepWritingSearchResult
} from "@/lib/agent/runtime/deep-writing-search-provider";

export type SafeDeepWritingEvent = {
  type: DeepWritingEventType;
  payload: Record<string, unknown>;
};

export type DeepWritingGeneratedDocument = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl?: string | null;
  objectKey?: string | null;
};

export type DeepWritingRunnerInput = {
  memory: DeepWritingTaskMemory;
  sourceText?: string;
  conversationSummary?: string;
  searchProvider?: DeepWritingSearchProvider;
  generateFinalDocument?: (memory: DeepWritingTaskMemory) => Promise<DeepWritingGeneratedDocument> | DeepWritingGeneratedDocument;
  emit: (event: SafeDeepWritingEvent) => Promise<void> | void;
};

const completedStages = new Set<DeepWritingTaskStage>(["completed"]);

export async function runDeepWritingDraft(input: DeepWritingRunnerInput): Promise<DeepWritingTaskMemory> {
  const memory = cloneMemory(input.memory);
  const timestamp = new Date().toISOString();
  memory.currentStage = completedStages.has(memory.currentStage) && memory.pendingSectionIds.length ? "writing_sections" : "planning";
  memory.updatedAt = timestamp;

  await emit(input.emit, "deep_writing_started", {
    taskId: memory.taskId,
    title: memory.topic,
    currentStage: "planning",
    progress: 0,
    panelAutoOpen: true
  });

  memory.currentStage = "collecting_sources";
  await emit(input.emit, "deep_writing_source_plan", {
    taskId: memory.taskId,
    keywords: memory.searchPlan.keywords,
    questions: memory.searchPlan.questions,
    currentStage: "collecting_sources",
    progress: 5
  });

  const sourceEvents = await collectSources(input, memory);
  for (const source of sourceEvents) {
    await emit(input.emit, "deep_writing_source", {
      taskId: memory.taskId,
      title: source.title,
      summary: source.summary,
      url: source.url,
      sourceType: source.sourceType,
      relevance: source.relevance,
      adopted: source.adopted,
      currentStage: "collecting_sources"
    });
  }

  const draft = composeDeepWritingDraft({
    memory,
    sourceText: input.sourceText,
    conversationSummary: input.conversationSummary,
    adoptedSources: memory.adoptedSources
  });
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

  memory.currentStage = "rendering_docx";
  await emit(input.emit, "deep_writing_docx_generating", {
    taskId: memory.taskId,
    currentStage: "rendering_docx",
    progress: 92,
    message: "正在生成 Word 文档"
  });

  let generatedDocument: DeepWritingGeneratedDocument | null = null;
  if (input.generateFinalDocument) {
    try {
      generatedDocument = await input.generateFinalDocument(memory);
      memory.finalDocument = generatedDocument;
    } catch (error) {
      memory.currentStage = "failed";
      memory.failureReason = safeFailureReason(error);
      memory.updatedAt = new Date().toISOString();
      await emit(input.emit, "deep_writing_failed", {
        taskId: memory.taskId,
        currentStage: "failed",
        progress: 92,
        canResume: true,
        failureReason: memory.failureReason
      });
      return memory;
    }
  }

  memory.currentStage = "completed";
  memory.pendingSectionIds = [];
  memory.updatedAt = new Date().toISOString();
  await emit(input.emit, "deep_writing_completed", {
    taskId: memory.taskId,
    currentStage: "completed",
    progress: 100,
    panelAvailable: true,
    draftCompleted: true,
    documentReady: Boolean(generatedDocument),
    fileName: generatedDocument?.fileName,
    downloadUrl: generatedDocument?.downloadUrl
  });

  return memory;
}

async function collectSources(input: DeepWritingRunnerInput, memory: DeepWritingTaskMemory): Promise<DeepWritingSearchResult[]> {
  const localSources = buildLocalSources(input, memory);
  const shouldReuseSearch = memory.searchPlan.status === "completed" && memory.adoptedSources.length > 0 && !wantsFreshSearch(memory.resumeInstruction);
  const providerResults = shouldReuseSearch ? [] : await searchWithProvider(input, memory);
  const allSources = dedupeSources([...localSources, ...providerResults]);
  const adoptedSources = allSources.filter(isAdoptableSource);

  memory.adoptedSources = dedupeMemorySources([
    ...memory.adoptedSources,
    ...adoptedSources.map((source) => ({
      title: source.title,
      ...(source.url ? { url: source.url } : {}),
      summary: source.summary,
      sourceType: source.sourceType,
      relevance: source.relevance,
      adopted: true,
      usedInSections: []
    }))
  ]);
  memory.sourceSummary = mergeSummary(memory.sourceSummary, memory.adoptedSources.map((source) => source.summary).join("\n"));

  const hasInternalSearch = allSources.some((source) => source.sourceType === "internal_search");
  const hasNotConfigured = allSources.some((source) => source.sourceType === "not_configured");
  memory.searchPlan.status = hasInternalSearch ? "completed" : hasNotConfigured ? "skipped" : "completed";
  memory.updatedAt = new Date().toISOString();

  return allSources.length ? allSources : [notConfiguredEventSource()];
}

function buildLocalSources(input: DeepWritingRunnerInput, memory: DeepWritingTaskMemory): DeepWritingSearchResult[] {
  const sources: DeepWritingSearchResult[] = [];
  const sourceText = compact(input.sourceText || memory.sourceSummary, 700);
  if (sourceText) {
    sources.push({
      id: "uploaded-file-source",
      title: memory.sourceFileNames[0] || "上传资料摘要",
      sourceType: "uploaded_file",
      snippet: sourceText,
      summary: sourceText,
      relevance: "high",
      adopted: true
    });
  }

  const conversationSummary = compact(input.conversationSummary, 700);
  if (conversationSummary && conversationSummary !== sourceText) {
    sources.push({
      id: "conversation-source",
      title: "当前对话摘要",
      sourceType: "conversation",
      snippet: conversationSummary,
      summary: conversationSummary,
      relevance: "medium",
      adopted: true
    });
  }
  return sources;
}

async function searchWithProvider(input: DeepWritingRunnerInput, memory: DeepWritingTaskMemory) {
  const provider = input.searchProvider || createDefaultDeepWritingSearchProvider();
  const query: DeepWritingSearchQuery = {
    taskId: memory.taskId,
    topic: memory.topic,
    documentKind: memory.documentKind,
    keywords: memory.searchPlan.keywords,
    questions: memory.searchPlan.questions,
    sourceSummary: memory.sourceSummary,
    conversationSummary: input.conversationSummary,
    maxResults: 6
  };
  try {
    return sanitizeSearchResults(await provider.search(query));
  } catch {
    return [notConfiguredEventSource()];
  }
}

function sanitizeSearchResults(results: DeepWritingSearchResult[]) {
  return results
    .map((source, index) => ({
      id: compact(source.id || `source-${index + 1}`, 80),
      title: compact(source.title, 140),
      ...(source.url ? { url: source.url } : {}),
      sourceType: source.sourceType,
      snippet: compact(source.snippet || source.summary, 500),
      summary: compact(source.summary, 700),
      relevance: source.relevance,
      adopted: Boolean(source.adopted)
    }))
    .filter((source) => source.title && source.summary);
}

function dedupeSources(sources: DeepWritingSearchResult[]) {
  const byKey = new Map<string, DeepWritingSearchResult>();
  sources.forEach((source) => {
    const key = `${source.url || ""}|${source.title}|${source.summary}`.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, source);
  });
  return Array.from(byKey.values());
}

function dedupeMemorySources(sources: DeepWritingTaskMemory["adoptedSources"]) {
  const byKey = new Map<string, DeepWritingTaskMemory["adoptedSources"][number]>();
  sources.forEach((source) => {
    if (!source.title || !source.summary) return;
    const key = `${source.url || ""}|${source.title}|${source.summary}`.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, source);
  });
  return Array.from(byKey.values());
}

function isAdoptableSource(source: DeepWritingSearchResult) {
  if (!source.title || !source.summary) return false;
  if (source.sourceType === "not_configured") return false;
  if (source.sourceType === "uploaded_file" || source.sourceType === "conversation") return true;
  return source.adopted && source.relevance !== "low";
}

function wantsFreshSearch(text?: string) {
  return /重新搜集|重新检索|重新搜索|重新找资料/.test(text || "");
}

function mergeSummary(original: string, extra: string) {
  return compact([original, extra].filter(Boolean).join("\n"), 1600);
}

function compact(value?: string, maxLength = 800) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeFailureReason(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "");
  const cleaned = compact(raw, 240);
  if (!cleaned || /api[_-]?key|token|secret|password|authorization|provider|stack|model/i.test(cleaned)) {
    return "Word 文档生成失败，请稍后重试。";
  }
  return cleaned;
}

function notConfiguredEventSource(): DeepWritingSearchResult {
  return {
    id: "not-configured",
    title: "自建搜索未配置",
    sourceType: "not_configured",
    snippet: "未检测到可用的自建搜索，当前基于已上传资料和对话内容继续写作。",
    summary: "未检测到可用的自建搜索，当前基于已上传资料和对话内容继续写作。",
    relevance: "low",
    adopted: false
  };
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
    finalDocument: memory.finalDocument ? { ...memory.finalDocument } : undefined,
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
