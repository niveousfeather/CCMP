import { rm, readFile } from "node:fs/promises";
import path from "node:path";

import { parseDocxPackage } from "@/lib/document/docx-package";
import { executeRuntimeTool } from "@/lib/agent/runtime/tool-executor";
import type { AgentRuntimeDecision } from "@/lib/agent/runtime";
import type { ConversationFileReference, ToolAdapterContext, WordTaskMemory } from "@/lib/agent/runtime/tool-adapters";
import type { AgentRunResult } from "@/lib/agent/types";
import { generateWordDocumentFromRequest } from "@/lib/word-engine";

type Check = {
  name: string;
  run: () => Promise<void> | void;
};

const forbiddenDocxTerms = [
  "wordTaskMemory",
  "completedSections",
  "pendingSections",
  "currentStage",
  "resumeInstruction",
  "failureReason",
  "我将围绕",
  "附件依据",
  "生成正文时优先",
  "作为 AI"
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function baseAgentResult(content: string): AgentRunResult {
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

function wordDecision(overrides: Partial<AgentRuntimeDecision> = {}): AgentRuntimeDecision {
  return {
    intent: "create_document",
    targetTool: "word",
    nextAction: "run_legacy_tool",
    missingInputs: [],
    confidence: 0.92,
    reason: "word memory regression",
    ...overrides
  } as AgentRuntimeDecision;
}

function makeContext({
  userText,
  conversationId = "conversation-memory-1",
  wordTaskMemory,
  conversationFiles = []
}: {
  userText: string;
  conversationId?: string;
  wordTaskMemory?: WordTaskMemory | null;
  conversationFiles?: ConversationFileReference[];
}): ToolAdapterContext {
  return {
    request: new Request("http://localhost/api/ai/chat"),
    origin: "http://localhost",
    userId: "word-memory-test",
    conversationId,
    userText,
    messages: [{ role: "user", content: userText }],
    files: [],
    conversationFiles,
    tools: { webSearch: false, contentMode: null },
    signal: new AbortController().signal,
    activeTask: null,
    wordTaskMemory,
    runLegacyAgent: async () => {
      throw new Error("LEGACY_AGENT_SHOULD_NOT_BE_CALLED");
    },
    runImageGeneration: async () => ({ result: baseAgentResult("image not used"), imageGeneration: null }),
    runChatAnswer: async () => baseAgentResult("chat answer")
  };
}

function conversationFile(conversationId: string, text: string): ConversationFileReference {
  return {
    attachmentId: `${conversationId}-source`,
    fileName: "source.txt",
    mimeType: "text/plain",
    sizeBytes: text.length,
    objectKey: null,
    providerFileId: null,
    extractedText: text,
    textPreview: text.slice(0, 200),
    parseStatus: "parsed",
    sourceMessageId: `${conversationId}-message`,
    conversationId
  };
}

function localPathFromMockUrl(url: string | null) {
  assert(url, "generated file should include a download URL");
  assert(url.startsWith("/mock-storage/"), `unexpected generated URL: ${url}`);
  return path.join(process.cwd(), "public", url.replace(/^\//, ""));
}

async function readGeneratedDocx(result: Awaited<ReturnType<typeof executeRuntimeTool>>) {
  assert("adapterId" in result && result.adapterId === "word-adapter", "expected word-adapter result");
  assert(!("validationFailed" in result), "adapter validation should pass");
  const generated = result.result.generatedFiles[0];
  assert(generated, "expected generated docx");
  const filePath = localPathFromMockUrl(generated.url);
  const buffer = await readFile(filePath);
  await rm(filePath, { force: true });
  const xml = parseDocxPackage(buffer).getText("word/document.xml") || "";
  return { buffer, xml };
}

function textFromXml(xml: string) {
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

async function generateBaseline() {
  return generateWordDocumentFromRequest({
    conversationId: "conversation-memory-1",
    title: "AI 教育培训方案",
    instruction: "生成一份 AI 教育培训方案 Word 文档",
    sourceText: "培训对象为一线教师，重点包含 AI 课程设计、课堂应用和过程评价。",
    sourceFiles: [{ fileName: "source.txt", mimeType: "text/plain", text: "AI 课程设计与课堂应用" }],
    contentOrigin: "existing_content",
    outputFileName: "AI 教育培训方案"
  });
}

const checks: Check[] = [
  {
    name: "new Word generation creates task memory",
    async run() {
      const result = await generateBaseline();
      assert(result.wordTaskMemory, "result should include wordTaskMemory");
      assert(result.wordTaskMemory.conversationId === "conversation-memory-1", "memory should keep conversationId");
    }
  },
  {
    name: "memory records instruction title and source summary",
    async run() {
      const result = await generateBaseline();
      const memory = result.wordTaskMemory;
      assert(memory?.originalInstruction.includes("AI 教育"), "memory should keep original instruction");
      assert(memory?.title === "AI 教育培训方案", "memory should keep title");
      assert(memory?.sourceSummary.includes("一线教师"), "memory should summarize source text");
      assert(memory?.sourceFileNames.includes("source.txt"), "memory should keep source file names");
    }
  },
  {
    name: "completed generation marks completed stage",
    async run() {
      const result = await generateBaseline();
      assert(result.wordTaskMemory?.currentStage === "completed", "memory stage should be completed");
    }
  },
  {
    name: "completed sections are recorded",
    async run() {
      const result = await generateBaseline();
      assert((result.wordTaskMemory?.completedSections.length || 0) > 0, "completedSections should not be empty");
    }
  },
  {
    name: "pending sections are empty after completion",
    async run() {
      const result = await generateBaseline();
      assert(result.wordTaskMemory?.pendingSections.length === 0, "pendingSections should be empty");
    }
  },
  {
    name: "validation failure creates failed task memory",
    async run() {
      try {
        await generateWordDocumentFromRequest({
          conversationId: "conversation-memory-1",
          title: "",
          instruction: "",
          sourceText: ""
        });
      } catch (error) {
        const memory = (error as { wordTaskMemory?: WordTaskMemory }).wordTaskMemory;
        assert(memory, "validation error should carry wordTaskMemory");
        assert(memory.currentStage === "failed", "failed validation should mark failed stage");
        assert(Boolean(memory.failureReason), "failed memory should include failureReason");
        assert(!/stack|api[_-]?key|token|provider/i.test(memory.failureReason || ""), "failureReason should be user-readable");
        return;
      }
      throw new Error("empty request should fail");
    }
  },
  {
    name: "same conversation resume uses recent Word task memory",
    async run() {
      const baseline = await executeRuntimeTool(
        wordDecision(),
        makeContext({
          userText: "把以上内容整理成 Word",
          conversationId: "conversation-memory-resume",
          conversationFiles: [
            conversationFile(
              "conversation-memory-resume",
              "AI 教育培训方案已有正文：培训对象为一线教师，重点包含 AI 课程设计、课堂应用和过程评价。"
            )
          ]
        })
      );
      assert(!("validationFailed" in baseline), "baseline Word generation should validate");
      const baselineMemory = "resultCard" in baseline ? baseline.resultCard?.wordTaskMemory : null;
      assert(baselineMemory?.conversationId === "conversation-memory-resume", "baseline should remember current conversation");
      await readGeneratedDocx(baseline);

      const resumeText = "继续刚才的 Word";
      const result = await executeRuntimeTool(
        wordDecision(),
        makeContext({
          userText: resumeText,
          conversationId: "conversation-memory-resume"
        })
      );
      assert(!("validationFailed" in result), "same conversation resume should validate");
      const cardMemory = "resultCard" in result ? result.resultCard?.wordTaskMemory : null;
      assert(cardMemory?.conversationId === "conversation-memory-resume", "resume should keep same conversationId");
      assert(cardMemory?.resumeInstruction === resumeText, "resumeInstruction should be recorded");
      await readGeneratedDocx(result);
    }
  },
  {
    name: "new conversation resume does not inherit old Word memory",
    async run() {
      const result = await executeRuntimeTool(wordDecision(), makeContext({ userText: "继续刚才的 Word", conversationId: "conversation-new" }));
      assert("validationFailed" in result && result.validationFailed, "new conversation without memory should ask clarification");
      assert(result.missingInputs.includes("active_word_task"), "missingInputs should include active_word_task");
    }
  },
  {
    name: "docx body does not include internal memory fields",
    async run() {
      const result = await generateWordDocumentFromRequest({
        conversationId: "conversation-memory-1",
        title: "内部字段隔离检查",
        instruction: "生成正文时优先检查污染词。作为 AI，我将围绕附件依据生成 Word。",
        sourceText: "completedSections pendingSections currentStage resumeInstruction failureReason wordTaskMemory 这些词不能进入正文。",
        contentOrigin: "existing_content",
        outputFileName: "internal-memory-check"
      });
      const text = textFromXml(parseDocxPackage(result.buffer).getText("word/document.xml") || "");
      for (const term of forbiddenDocxTerms) assert(!text.includes(term), `docx should not include ${term}`);
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
    console.error(`Agent Word memory checks failed: ${failed}/${checks.length} cases failed.`);
    process.exit(1);
  }
  console.log(`Agent Word memory checks passed. ${checks.length}/${checks.length} PASS.`);
}

void main();
