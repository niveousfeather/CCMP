import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { parseDocxPackage } from "@/lib/document/docx-package";
import { detectDeepWritingMode } from "@/lib/agent/runtime/deep-writing-detector";
import {
  createDeepWritingTaskMemory,
  resumeDeepWritingTaskMemory,
  type DeepWritingTaskMemory
} from "@/lib/agent/runtime/deep-writing-memory";
import { runDeepWritingDraft, type SafeDeepWritingEvent } from "@/lib/agent/runtime/deep-writing-runner";
import { composeDeepWritingDocxContent } from "@/lib/word-engine/compose-deep-writing-docx";
import { executeRuntimeTool } from "@/lib/agent/runtime/tool-executor";
import { shouldShowDeepWritingProcessButton } from "@/components/chat/deep-writing-panel-state";
import { planAgentRuntimeTurn, type AgentRuntimeDecision } from "@/lib/agent/runtime";
import type { ToolAdapterContext } from "@/lib/agent/runtime/tool-adapters";
import type { AgentRunResult } from "@/lib/agent/types";

type Check = {
  name: string;
  run: () => Promise<void> | void;
};

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const sourceText = "\u59d3\u540d,\u6210\u7ee9\n\u5f20\u4e09,90\n\u674e\u56db,85\n\u8bf4\u660e\uff1a\u8fd9\u662f AI \u6559\u80b2\u6d4b\u8bd5\u6570\u636e";
const forbiddenTerms = [
  "deepWritingTaskMemory",
  "wordTaskMemory",
  "taskId",
  "conversationId",
  "currentStage",
  "searchPlan",
  "adoptedSources",
  "section_delta",
  "source_plan",
  "mock",
  "placeholder",
  "TODO",
  "prompt",
  "provider",
  "chain-of-thought",
  "internal JSON"
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeMemory(overrides: Partial<DeepWritingTaskMemory> = {}): DeepWritingTaskMemory {
  const instruction = "\u6df1\u5ea6\u5199\u4e00\u4efd AI \u6559\u80b2\u8c03\u7814\u62a5\u544a";
  const detection = detectDeepWritingMode({ userText: instruction, targetTool: "word", sourceText });
  assert(detection.enabled, "test setup should trigger deep writing");
  const memory = createDeepWritingTaskMemory({
    conversationId: "deep-docx-conversation",
    originalInstruction: instruction,
    topic: "AI \u6559\u80b2\u8c03\u7814\u62a5\u544a",
    detection,
    sourceFileNames: ["sample.txt"],
    sourceSummary: sourceText
  });
  memory.adoptedSources = [
    {
      title: "AI \u6559\u80b2\u6d4b\u8bd5\u6570\u636e",
      summary: "\u8d44\u6599\u5305\u542b\u5f20\u4e09\u3001\u674e\u56db\u4e24\u540d\u5b66\u751f\u7684\u6210\u7ee9\uff0c\u5206\u522b\u4e3a 90 \u548c 85\uff0c\u5e76\u8bf4\u660e\u8fd9\u662f AI \u6559\u80b2\u6d4b\u8bd5\u6570\u636e\u3002",
      sourceType: "uploaded_file",
      relevance: "high",
      adopted: true,
      usedInSections: []
    }
  ];
  return { ...memory, ...overrides };
}

async function collectWithDocx(memory = makeMemory()) {
  const events: SafeDeepWritingEvent[] = [];
  let calls = 0;
  const completed = await runDeepWritingDraft({
    memory,
    sourceText,
    conversationSummary: sourceText,
    emit: (event) => {
      events.push(event);
    },
    generateFinalDocument: async (finalMemory) => {
      calls += 1;
      const content = composeDeepWritingDocxContent(finalMemory);
      return {
        fileName: "deep-writing-report.docx",
        mimeType: DOCX_MIME,
        sizeBytes: JSON.stringify(content).length,
        downloadUrl: "/mock-storage/deep-writing-report.docx"
      };
    }
  });
  return { events, completed, calls };
}

function baseResult(content: string): AgentRunResult {
  return {
    content,
    modelUsed: "test",
    providerUsed: "xheai",
    routeReason: "test",
    fallbackUsed: false,
    extractedDocuments: [],
    generatedFiles: [],
    pendingTask: null,
    defaultsApplied: []
  };
}

function makeDecision(overrides: Partial<AgentRuntimeDecision> = {}): AgentRuntimeDecision {
  return {
    intent: "word",
    targetTool: "word",
    confidence: 0.96,
    needsTool: true,
    needsConfirmation: false,
    missingInputs: [],
    activeTaskId: null,
    nextAction: "run_legacy_tool",
    progressStages: ["analyzing_context", "planning_intent", "selecting_skill", "checking_execution_gate", "calling_tool", "completed"],
    ...overrides
  };
}

function context(userText: string, conversationId = "deep-docx-adapter"): ToolAdapterContext {
  return {
    request: new Request("http://localhost/api/ai/chat"),
    origin: "http://localhost",
    userId: "deep-docx-test",
    conversationId,
    userText,
    messages: [{ role: "user", content: userText }],
    files: [],
    conversationFiles: [
      {
        attachmentId: "attachment-1",
        fileName: "sample.txt",
        mimeType: "text/plain",
        sizeBytes: sourceText.length,
        objectKey: null,
        providerFileId: null,
        extractedText: sourceText,
        textPreview: sourceText,
        parseStatus: "parsed",
        sourceMessageId: "message-1",
        conversationId
      }
    ],
    tools: { webSearch: false, contentMode: "write" },
    signal: new AbortController().signal,
    runLegacyAgent: async () => {
      throw new Error("LEGACY_AGENT_SHOULD_NOT_BE_CALLED");
    },
    runImageGeneration: async () => ({ result: baseResult("unused image"), imageGeneration: null }),
    runChatAnswer: async () => baseResult("unused chat")
  };
}

function localPathFromMockUrl(url?: string | null) {
  assert(url, "generated file should include a download URL");
  assert(url.startsWith("/mock-storage/"), `unexpected generated URL: ${url}`);
  return path.join(process.cwd(), "public", url.replace(/^\//, ""));
}

async function readGeneratedDocx(result: Awaited<ReturnType<typeof executeRuntimeTool>>) {
  assert("result" in result, "adapter result should include result");
  const generated = result.result.generatedFiles[0];
  assert(generated, "deep writing should generate a docx file");
  assert(generated.mimeType === DOCX_MIME, "generated mimeType should be docx");
  assert(generated.fileName.endsWith(".docx"), "fileName should end with .docx");
  assert(generated.sizeBytes > 0, "generated docx should not be empty");
  const filePath = localPathFromMockUrl(generated.url);
  const buffer = await readFile(filePath);
  await rm(filePath, { force: true });
  const packageXml = parseDocxPackage(buffer);
  const xml = packageXml.getText("word/document.xml") || "";
  assert(xml.includes("<w:document"), "docx should contain word/document.xml");
  return { generated, buffer, xml, text: plainTextFromDocumentXml(xml) };
}

function plainTextFromDocumentXml(xml: string) {
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

async function executeDeepWritingAdapter() {
  const events: SafeDeepWritingEvent[] = [];
  const result = await executeRuntimeTool(makeDecision(), {
    ...context("\u6df1\u5ea6\u5199\u4e00\u4efd AI \u6559\u80b2\u8c03\u7814\u62a5\u544a", "deep-docx-adapter"),
    emitDeepWritingEvent: (event) => {
      events.push(event);
    }
  });
  return { result, events };
}

const checks: Check[] = [
  {
    name: "runner enters rendering_docx stage",
    async run() {
      const { events } = await collectWithDocx();
      assert(events.some((event) => event.type === "deep_writing_docx_generating"), "docx generating event should appear");
    }
  },
  {
    name: "docx generating event appears before completed",
    async run() {
      const { events } = await collectWithDocx();
      const types = events.map((event) => event.type);
      assert(types.indexOf("deep_writing_docx_generating") > -1, "docx event should exist");
      assert(types.indexOf("deep_writing_completed") > types.indexOf("deep_writing_docx_generating"), "completed should follow docx generation");
    }
  },
  {
    name: "completed payload marks document ready",
    async run() {
      const { events } = await collectWithDocx();
      const completed = events.find((event) => event.type === "deep_writing_completed");
      assert(completed?.payload.documentReady === true, "completed should mark documentReady");
    }
  },
  {
    name: "completed payload includes download reference",
    async run() {
      const { events } = await collectWithDocx();
      const completed = events.find((event) => event.type === "deep_writing_completed");
      assert(typeof completed?.payload.downloadUrl === "string", "completed should include downloadUrl");
      assert(typeof completed?.payload.fileName === "string", "completed should include fileName");
    }
  },
  {
    name: "taskCard metadata is deep writing",
    async run() {
      const { result } = await executeDeepWritingAdapter();
      const card = "resultCard" in result ? result.resultCard : null;
      assert(card?.mode === "deep_writing", "taskCard mode should be deep_writing");
      assert(card?.currentStage === "completed", "taskCard should be completed");
    }
  },
  {
    name: "taskCard exposes process panel",
    async run() {
      const { result } = await executeDeepWritingAdapter();
      const card = "resultCard" in result ? result.resultCard : null;
      assert(card?.panelAvailable === true, "panelAvailable should be true");
      assert(shouldShowDeepWritingProcessButton(card as never), "Word card should show process button");
    }
  },
  {
    name: "taskCard includes document download state",
    async run() {
      const { result } = await executeDeepWritingAdapter();
      const card = "resultCard" in result ? result.resultCard : null;
      assert(card?.documentReady === true, "taskCard should mark documentReady");
      assert(typeof card?.downloadUrl === "string" && card.downloadUrl.endsWith(".docx"), "taskCard should include docx downloadUrl");
    }
  },
  {
    name: "docx validates as zip package",
    async run() {
      const { result } = await executeDeepWritingAdapter();
      const { buffer } = await readGeneratedDocx(result);
      assert(buffer.length > 0, "docx buffer should not be empty");
    }
  },
  {
    name: "docx is not empty",
    async run() {
      const { result } = await executeDeepWritingAdapter();
      const { generated } = await readGeneratedDocx(result);
      assert(generated.sizeBytes > 1000, "docx should have meaningful size");
    }
  },
  {
    name: "docx contains section titles and draft text",
    async run() {
      const { result } = await executeDeepWritingAdapter();
      const { text } = await readGeneratedDocx(result);
      assert(text.includes("AI \u6559\u80b2\u8c03\u7814\u62a5\u544a") || text.includes("AI 鏁欒偛"), "docx should include title");
      assert(text.includes("资料分析") || text.includes("璧勬枡"), "docx should include section content");
    }
  },
  {
    name: "docx contains adopted source summary",
    async run() {
      const { result } = await executeDeepWritingAdapter();
      const { text } = await readGeneratedDocx(result);
      for (const term of ["\u5f20\u4e09", "\u674e\u56db", "90", "85", "AI \u6559\u80b2\u6d4b\u8bd5\u6570\u636e"]) {
        assert(text.includes(term), `docx should include ${term}`);
      }
    }
  },
  {
    name: "docx excludes memory and event internals",
    async run() {
      const { result } = await executeDeepWritingAdapter();
      const { text } = await readGeneratedDocx(result);
      for (const term of forbiddenTerms.slice(0, 9)) assert(!text.includes(term), `docx should not include ${term}`);
    }
  },
  {
    name: "docx excludes prompt pollution",
    async run() {
      const { result } = await executeDeepWritingAdapter();
      const { text } = await readGeneratedDocx(result);
      for (const term of forbiddenTerms.slice(9)) assert(!text.includes(term), `docx should not include ${term}`);
    }
  },
  {
    name: "resume after docx failure retries rendering only",
    async run() {
      const memory = makeMemory();
      const events: SafeDeepWritingEvent[] = [];
      const failed = await runDeepWritingDraft({
        memory,
        sourceText,
        conversationSummary: sourceText,
        emit: (event) => {
          events.push(event);
        },
        generateFinalDocument: async () => {
          throw new Error("DOCX_RENDER_FAILED");
        }
      });
      assert(failed.currentStage === "failed", "failed docx render should mark memory failed");
      const resumedEvents: SafeDeepWritingEvent[] = [];
      const resumed = await runDeepWritingDraft({
        memory: resumeDeepWritingTaskMemory(failed, "\u7ee7\u7eed\u521a\u624d\u7684\u6df1\u5ea6\u62a5\u544a"),
        sourceText,
        conversationSummary: sourceText,
        emit: (event) => {
          resumedEvents.push(event);
        },
        generateFinalDocument: async () => ({
          fileName: "retry.docx",
          mimeType: DOCX_MIME,
          sizeBytes: 1200,
          downloadUrl: "/mock-storage/retry.docx"
        })
      });
      assert(resumed.currentStage === "completed", "resume should complete rendering");
      assert(!resumedEvents.some((event) => event.type === "deep_writing_section_started"), "resume should not rewrite completed sections");
    }
  },
  {
    name: "ordinary Word is unaffected",
    async run() {
      const result = await executeRuntimeTool(makeDecision(), context("\u5e2e\u6211\u751f\u6210\u4e00\u4efd Word\uff0c\u4e3b\u9898\u662f AI \u6559\u80b2\u57f9\u8bad\u65b9\u6848", "ordinary-word"));
      assert("resultCard" in result && result.resultCard?.mode !== "deep_writing", "ordinary Word should not enter deep writing");
    }
  },
  {
    name: "file summary does not generate deep writing docx",
    run() {
      const plan = planAgentRuntimeTurn({
        messages: [{ role: "user", content: "\u6839\u636e\u8fd9\u4e2a\u6587\u4ef6\u603b\u7ed3\u4e00\u4e0b" }],
        files: [{ name: "sample.txt", type: "text/plain", size: 120 }],
        pendingTask: null,
        activeTask: null,
        cachedConversationSummary: null,
        tools: { webSearch: false, contentMode: null }
      });
      assert(plan.decision.targetTool === "file-analysis", "file summary should remain file-analysis");
    }
  }
];

async function main() {
  let failed = 0;
  for (const check of checks) {
    try {
      await check.run();
      console.log(`PASS ${check.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${check.name}`);
      console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failed > 0) {
    console.error(`Agent deep writing docx checks failed: ${failed}/${checks.length} cases failed.`);
    process.exit(1);
  }

  console.log(`Agent deep writing docx checks passed. ${checks.length}/${checks.length} PASS.`);
}

void main();
