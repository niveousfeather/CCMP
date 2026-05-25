import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { executeRuntimeTool } from "@/lib/agent/runtime/tool-executor";
import type { AgentRuntimeDecision } from "@/lib/agent/runtime";
import type { SafeDeepWritingEvent } from "@/lib/agent/runtime/deep-writing-runner";
import { wordAdapter } from "@/lib/agent/runtime/tool-adapters/word-adapter";
import type { ConversationFileReference, ToolAdapterContext } from "@/lib/agent/runtime/tool-adapters";
import type { AgentRunResult } from "@/lib/agent/types";
import { parseDocxPackage } from "@/lib/document/docx-package";
import { generateWordDocumentFromRequest } from "@/lib/word-engine";

type Check = {
  name: string;
  run: () => Promise<void> | void;
};

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DEEP_LESSON_PROMPT = "\u5e2e\u6211\u751f\u6210\u4e00\u4e2a\u5c0f\u5b66\u4e09\u5e74\u7ea7\u6570\u5b66\u8bfe\u7a0b\u7684\u6559\u6848";
const SIMPLE_NOTICE_PROMPT = "\u5e2e\u6211\u5199\u4e00\u4e2a\u95e8\u5e97\u5f00\u4e1a\u901a\u77e5 Word";
const EXPORT_PROMPT = "\u628a\u4e0b\u9762\u8fd9\u6bb5\u5185\u5bb9\u6574\u7406\u6210 Word";
const SOURCE_TEXT = [
  "\u95e8\u5e97\u5f00\u4e1a\u901a\u77e5\uff1a\u65b0\u95e8\u5e97\u5c06\u4e8e\u672c\u6708\u4e8c\u5341\u516b\u65e5\u4e0a\u5348\u4e5d\u70b9\u6b63\u5f0f\u8425\u4e1a\uff0c\u8fd0\u8425\u7ec4\u9700\u63d0\u524d\u5b8c\u6210\u73b0\u573a\u52a8\u7ebf\u786e\u8ba4\u3001\u6536\u94f6\u53f0\u6d4b\u8bd5\u548c\u5f00\u4e1a\u7269\u6599\u6e05\u70b9\u3002",
  "\u5546\u54c1\u7ec4\u8d1f\u8d23\u6838\u5bf9\u8d27\u67b6\u9648\u5217\u3001\u4ef7\u7b7e\u4fe1\u606f\u3001\u4fdd\u8d28\u671f\u6807\u8bc6\u548c\u70ed\u9500\u5355\u54c1\u5e93\u5b58\uff0c\u5bf9\u7f3a\u8d27\u6216\u4ef7\u683c\u5f02\u5e38\u60c5\u51b5\u5f62\u6210\u95ee\u9898\u6e05\u5355\u3002",
  "\u4f1a\u5458\u7ec4\u9700\u719f\u6089\u5f00\u4e1a\u5230\u5e97\u793c\u3001\u6ee1\u989d\u8d60\u3001\u79ef\u5206\u52a0\u500d\u548c\u65b0\u4f1a\u5458\u793c\u5305\u7684\u4f7f\u7528\u8fb9\u754c\uff0c\u907f\u514d\u53e3\u5f84\u4e0d\u4e00\u81f4\u3002",
  "\u5ba3\u4f20\u7ec4\u5728\u5f00\u4e1a\u524d\u4e00\u5929\u5b8c\u6210\u793e\u7fa4\u9884\u544a\u3001\u77ed\u89c6\u9891\u53d1\u5e03\u548c\u95e8\u5e97\u6307\u5f15\u56fe\u66f4\u65b0\uff0c\u5f00\u4e1a\u5f53\u5929\u8ddf\u8fdb\u73b0\u573a\u56fe\u6587\u7d20\u6750\u91c7\u96c6\u3002",
  "\u987e\u5ba2\u63a5\u5f85\u7531\u524d\u5385\u7ec4\u7edf\u4e00\u534f\u8c03\uff0c\u5165\u53e3\u533a\u57df\u5b89\u6392\u5f15\u5bfc\u4eba\u5458\uff0c\u8bd5\u5403\u533a\u63a7\u5236\u6392\u961f\u95f4\u8ddd\uff0c\u513f\u7ae5\u6d3b\u52a8\u89d2\u7531\u4e13\u4eba\u5de1\u67e5\u5b89\u5168\u3002",
  "\u5982\u9047\u7cfb\u7edf\u5361\u987f\u3001\u7269\u6599\u4e0d\u8db3\u3001\u6295\u8bc9\u96c6\u4e2d\u6216\u5ba2\u6d41\u8d85\u8fc7\u9884\u4f30\uff0c\u503c\u73ed\u4e3b\u7ba1\u5e94\u7acb\u5373\u542f\u52a8\u5907\u7528\u65b9\u6848\u5e76\u540c\u6b65\u5e97\u957f\u3002",
  "\u8425\u4e1a\u7ed3\u675f\u540e\u9700\u6c47\u603b\u5ba2\u6d41\u3001\u9500\u552e\u989d\u3001\u70ed\u9500\u54c1\u7c7b\u3001\u4f1a\u5458\u65b0\u589e\u3001\u5e93\u5b58\u5f02\u5e38\u548c\u987e\u5ba2\u53cd\u9988\uff0c\u5e76\u5728\u7b2c\u4e8c\u5929\u4e0a\u5348\u63d0\u4ea4\u590d\u76d8\u8868\u3002",
  "\u672c\u901a\u77e5\u4f5c\u4e3a\u95e8\u5e97\u5f00\u4e1a\u6267\u884c\u4f9d\u636e\uff0c\u8bf7\u5404\u7ec4\u5728\u5f00\u4e1a\u524d\u5b8c\u6210\u81ea\u67e5\uff0c\u5c06\u672a\u5b8c\u6210\u4e8b\u9879\u5199\u5165\u95ee\u9898\u6e05\u5355\u5e76\u6309\u8d23\u4efb\u4eba\u8ddf\u8fdb\u3002"
].join("\n\n");
const UNSAFE_PAYLOAD_TERMS = ["prompt", "provider", "model", "stack", "apiKey", "rawMemory"];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

function wordDecision(): AgentRuntimeDecision {
  return {
    intent: "word",
    targetTool: "word",
    confidence: 0.98,
    needsTool: true,
    needsConfirmation: false,
    missingInputs: [],
    activeTaskId: null,
    nextAction: "run_legacy_tool",
    progressStages: ["analyzing_context", "planning_intent", "selecting_skill", "checking_execution_gate", "calling_tool", "completed"]
  };
}

function conversationFile(text: string): ConversationFileReference {
  return {
    attachmentId: "source-1",
    fileName: "source.txt",
    mimeType: "text/plain",
    sizeBytes: text.length,
    objectKey: null,
    providerFileId: null,
    extractedText: text,
    textPreview: text.slice(0, 400),
    parseStatus: "parsed",
    sourceMessageId: "message-1",
    conversationId: "word-real-generation-test"
  };
}

function makeContext(input: {
  userText: string;
  conversationId: string;
  events?: SafeDeepWritingEvent[];
  allowDeterministicWriting?: boolean;
  sourceText?: string;
}): ToolAdapterContext {
  return {
    request: new Request("http://localhost/api/ai/chat"),
    origin: "http://localhost",
    userId: "word-real-generation-test",
    conversationId: input.conversationId,
    userText: input.userText,
    messages: [{ role: "user", content: input.userText }],
    files: [],
    conversationFiles: input.sourceText ? [conversationFile(input.sourceText)] : [],
    tools: { webSearch: false, contentMode: "write" },
    signal: new AbortController().signal,
    allowDeterministicWriting: input.allowDeterministicWriting,
    emitDeepWritingEvent: input.events
      ? (event) => {
          input.events?.push(event);
        }
      : undefined,
    runLegacyAgent: async () => {
      throw new Error("LEGACY_AGENT_SHOULD_NOT_BE_CALLED");
    },
    runImageGeneration: async () => ({ result: baseResult("unused image"), imageGeneration: null }),
    runChatAnswer: async () => baseResult("unused chat")
  };
}

async function executeWord(input: Parameters<typeof makeContext>[0]) {
  return executeRuntimeTool(wordDecision(), makeContext(input));
}

async function executeWordDirect(input: Parameters<typeof makeContext>[0]) {
  return wordAdapter.execute(wordDecision(), makeContext(input));
}

function localPathFromMockUrl(url?: string | null) {
  assert(url, "generated file should include download URL");
  assert(url.startsWith("/mock-storage/"), `unexpected generated URL: ${url}`);
  return path.join(process.cwd(), "public", url.replace(/^\//, ""));
}

function textFromXml(xml: string) {
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

async function readGeneratedText(url?: string | null) {
  const filePath = localPathFromMockUrl(url);
  const buffer = await readFile(filePath);
  await rm(filePath, { force: true });
  const xml = parseDocxPackage(buffer).getText("word/document.xml") || "";
  return textFromXml(xml);
}

function assertNoCompletedDocx(result: Awaited<ReturnType<typeof executeWord>>) {
  assert("resultCard" in result && result.resultCard?.mode === "deep_writing", "write request should return deep writing taskCard");
  assert(result.resultCard.status !== "completed", "deterministic-only production write must not complete taskCard");
  assert(!result.resultCard.downloadUrl, "deterministic-only production write must not expose downloadUrl");
  assert(result.result.generatedFiles.length === 0, "deterministic-only production write must not expose generatedFiles");
  assert(result.resultCard.documentReady !== true, "deterministic-only production write must not mark document ready");
  assert(result.resultCard.contentGenerationMode === "unavailable", `expected unavailable mode, got ${result.resultCard.contentGenerationMode}`);
}

const checks: Check[] = [
  {
    name: "compose_deep deterministic fallback cannot complete production docx",
    async run() {
      const events: SafeDeepWritingEvent[] = [];
      const result = await executeWord({
        userText: DEEP_LESSON_PROMPT,
        conversationId: "real-generation-deep",
        events,
        allowDeterministicWriting: false
      });
      assertNoCompletedDocx(result);
      assert(events.some((event) => event.type === "deep_writing_failed"), "compose_deep should emit failed event when content generation is unavailable");
    }
  },
  {
    name: "compose_simple deterministic fallback cannot complete production docx",
    async run() {
      const events: SafeDeepWritingEvent[] = [];
      const result = await executeWord({
        userText: SIMPLE_NOTICE_PROMPT,
        conversationId: "real-generation-simple",
        events,
        allowDeterministicWriting: false
      });
      assertNoCompletedDocx(result);
      assert(events.some((event) => event.type === "deep_writing_failed"), "compose_simple should emit failed event when content generation is unavailable");
    }
  },
  {
    name: "export_existing can still complete fast docx",
    async run() {
      const result = await executeWordDirect({
        userText: EXPORT_PROMPT,
        conversationId: "real-generation-export",
        sourceText: SOURCE_TEXT,
        allowDeterministicWriting: false
      });
      assert(
        "resultCard" in result && result.resultCard?.status === "completed",
        `export_existing should complete, got ${JSON.stringify({
          hasCard: "resultCard" in result,
          status: "resultCard" in result ? result.resultCard?.status : null,
          routeReason: result.result.routeReason,
          generatedFiles: result.result.generatedFiles.length
        })}`
      );
      assert(result.resultCard?.downloadUrl, "export_existing should expose downloadUrl");
      assert(result.result.generatedFiles[0]?.mimeType === DOCX_MIME, "export_existing should generate docx");
      const text = await readGeneratedText(result.result.generatedFiles[0]?.url);
      assert(text.includes("\u95e8\u5e97") || text.includes("\u5f00\u4e1a"), "export_existing docx should preserve source text");
    }
  },
  {
    name: "generate-docx rejects write-from-scratch without model content",
    async run() {
      let rejected = false;
      try {
        await generateWordDocumentFromRequest({
          title: "\u5c0f\u5b66\u4e09\u5e74\u7ea7\u6570\u5b66\u6559\u6848",
          instruction: DEEP_LESSON_PROMPT,
          contentOrigin: "write_from_scratch",
          language: "zh-CN"
        });
      } catch (error) {
        rejected = String(error).includes("WRITE_FROM_SCRATCH_REQUIRES_CONTENT_GENERATION");
      }
      assert(rejected, "write-from-scratch without generated content should be rejected");
    }
  },
  {
    name: "taskCard marks contentGenerationMode",
    async run() {
      const result = await executeWord({
        userText: DEEP_LESSON_PROMPT,
        conversationId: "real-generation-mode",
        allowDeterministicWriting: false
      });
      assert("resultCard" in result && result.resultCard?.contentGenerationMode === "unavailable", "taskCard should expose contentGenerationMode");
      assert((result.result.defaultsApplied || []).includes("writing_content_generation:unavailable"), "result should record generation mode");
    }
  },
  {
    name: "payload does not expose internal generation details",
    async run() {
      const events: SafeDeepWritingEvent[] = [];
      const result = await executeWord({
        userText: DEEP_LESSON_PROMPT,
        conversationId: "real-generation-payload",
        events,
        allowDeterministicWriting: false
      });
      const publicPayload = JSON.stringify({ events, resultCard: "resultCard" in result ? result.resultCard : null });
      for (const term of UNSAFE_PAYLOAD_TERMS) assert(!publicPayload.includes(term), `payload should not expose ${term}`);
    }
  }
];

async function main() {
  let passed = 0;
  const failures: string[] = [];
  for (const check of checks) {
    try {
      await check.run();
      passed += 1;
    } catch (error) {
      failures.push(`${check.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length) {
    console.error(failures.map((failure) => `FAIL ${failure}`).join("\n"));
    console.error(`Word real generation checks failed. ${passed}/${checks.length} PASS.`);
    process.exit(1);
  }

  console.log(`Word real generation checks passed. ${passed}/${checks.length} PASS.`);
}

void main();
