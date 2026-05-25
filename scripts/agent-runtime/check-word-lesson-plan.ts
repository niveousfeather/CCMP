import { rm, readFile } from "node:fs/promises";
import path from "node:path";

import { parseDocxPackage } from "@/lib/document/docx-package";
import { evaluateWordDocumentPlan } from "@/lib/document/quality";
import { planAgentRuntimeTurn, type AgentRuntimeDecision } from "@/lib/agent/runtime";
import { executeRuntimeTool } from "@/lib/agent/runtime/tool-executor";
import type { ToolAdapterContext } from "@/lib/agent/runtime/tool-adapters";
import type { AgentRunResult } from "@/lib/agent/types";
import { composeLessonDocumentPlan } from "@/lib/word-engine/compose-lesson-plan-content";
import { buildWordPlan, generateWordDocumentFromRequest } from "@/lib/word-engine";

type Check = {
  name: string;
  run: () => Promise<void> | void;
};

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const LESSON_PROMPT = "\u5e2e\u6211\u5199\u4e00\u4e2a\u4e09\u7ef4\u52a8\u753b\u6559\u5b66\u8bfe\u7a0b\u7684\u6559\u6848";
const LONG_LESSON_PROMPT = "\u5e2e\u6211\u5199\u4e00\u4e2a\u4e09\u7ef4\u52a8\u753b\u6559\u5b66\u8bfe\u7a0b\u7684\u6559\u6848\uff0c64 \u4e2a\u8bfe\u65f6\uff0c2000 \u5b57";
const REQUIRED_LESSON_TERMS = [
  "\u8bfe\u7a0b\u57fa\u672c\u4fe1\u606f",
  "\u6559\u5b66\u76ee\u6807",
  "\u6559\u5b66\u91cd\u70b9\u4e0e\u96be\u70b9",
  "\u6559\u5b66\u8fc7\u7a0b",
  "\u8003\u6838\u8bc4\u4ef7",
  "\u6559\u5b66\u53cd\u601d"
];

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

function textFromXml(xml: string) {
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function docxText(buffer: Buffer) {
  const docx = parseDocxPackage(buffer);
  const xml = docx.getText("word/document.xml");
  assert(xml, "word/document.xml should exist");
  assert(docx.getText("[Content_Types].xml"), "[Content_Types].xml should exist");
  assert(docx.getText("word/styles.xml"), "word/styles.xml should exist");
  return textFromXml(xml);
}

async function generateText(prompt: string) {
  const result = await generateWordDocumentFromRequest({
    conversationId: "lesson-plan-engine",
    title: prompt,
    instruction: prompt,
    contentOrigin: "generated_content",
    outputFileName: prompt,
    stylePreset: "professional",
    language: "zh-CN"
  });
  return { result, text: docxText(result.buffer) };
}

function makeDecision(): AgentRuntimeDecision {
  return {
    intent: "word",
    targetTool: "word",
    confidence: 0.96,
    needsTool: true,
    needsConfirmation: false,
    missingInputs: [],
    activeTaskId: null,
    nextAction: "run_legacy_tool",
    progressStages: ["analyzing_context", "planning_intent", "selecting_skill", "checking_execution_gate", "calling_tool", "completed"]
  };
}

function context(userText: string, contentMode: "write" | null = "write"): ToolAdapterContext {
  return {
    request: new Request("http://localhost/api/ai/chat"),
    origin: "http://localhost",
    userId: "word-lesson-test",
    conversationId: "word-lesson-conversation",
    userText,
    messages: [{ role: "user", content: userText }],
    files: [],
    conversationFiles: [],
    tools: { webSearch: false, contentMode },
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

async function executeWordAdapter(userText: string, contentMode: "write" | null = "write") {
  const result = await executeRuntimeTool(makeDecision(), context(userText, contentMode));
  assert("adapterId" in result && result.adapterId === "word-adapter", "word adapter should execute");
  assert(!("validationFailed" in result), "adapter validation should pass");
  return result;
}

async function readAdapterDocx(userText: string, contentMode: "write" | null = "write") {
  const result = await executeWordAdapter(userText, contentMode);
  const generated = result.result.generatedFiles[0];
  assert(generated, "adapter should generate a docx file");
  assert(generated.mimeType === DOCX_MIME, "generated file should be docx");
  const filePath = localPathFromMockUrl(generated.url);
  const buffer = await readFile(filePath);
  await rm(filePath, { force: true });
  return { result, generated, text: docxText(buffer) };
}

function assertIncludesAll(text: string, values: string[], label: string) {
  for (const value of values) assert(text.includes(value), `${label} should include ${value}`);
}

function assertNoThinGeneralShell(text: string) {
  const thinTerms = ["\u6587\u6863\u6982\u8ff0", "\u80cc\u666f\u4e0e\u76ee\u6807", "\u4e3b\u8981\u5185\u5bb9", "\u4f7f\u7528\u5efa\u8bae"];
  const count = thinTerms.filter((term) => text.includes(term)).length;
  assert(count < 3, "lesson plan should not be the thin general Word shell");
}

const checks: Check[] = [
  {
    name: "lesson prompt detects lesson_plan",
    run() {
      const plan = buildWordPlan({ title: LESSON_PROMPT, instruction: LESSON_PROMPT, language: "zh-CN" });
      assert(plan.metadata.attributes?.documentKind === "lesson_plan", `expected lesson_plan, got ${plan.metadata.attributes?.documentKind}`);
    }
  },
  {
    name: "course teaching design detects lesson_plan",
    run() {
      const prompt = "\u8bfe\u7a0b\u6559\u5b66\u8bbe\u8ba1 Word";
      const plan = buildWordPlan({ title: prompt, instruction: prompt, language: "zh-CN" });
      assert(plan.metadata.attributes?.documentKind === "lesson_plan", "course teaching design should be lesson_plan");
    }
  },
  {
    name: "64 class hour lesson detects lesson_plan",
    run() {
      const plan = buildWordPlan({ title: LONG_LESSON_PROMPT, instruction: LONG_LESSON_PROMPT, language: "zh-CN" });
      assert(plan.metadata.attributes?.documentKind === "lesson_plan", "64-hour lesson should be lesson_plan");
    }
  },
  {
    name: "generated lesson contains course information",
    async run() {
      const { text } = await generateText(LESSON_PROMPT);
      assert(text.includes("\u8bfe\u7a0b\u57fa\u672c\u4fe1\u606f"), "lesson should include course information");
    }
  },
  {
    name: "generated lesson contains teaching objectives",
    async run() {
      const { text } = await generateText(LESSON_PROMPT);
      assert(text.includes("\u6559\u5b66\u76ee\u6807"), "lesson should include teaching objectives");
    }
  },
  {
    name: "generated lesson contains key and difficult points",
    async run() {
      const { text } = await generateText(LESSON_PROMPT);
      assert(text.includes("\u6559\u5b66\u91cd\u70b9\u4e0e\u96be\u70b9"), "lesson should include key and difficult points");
    }
  },
  {
    name: "generated lesson contains teaching process",
    async run() {
      const { text } = await generateText(LESSON_PROMPT);
      assert(text.includes("\u6559\u5b66\u8fc7\u7a0b"), "lesson should include teaching process");
    }
  },
  {
    name: "generated lesson contains class-hour arrangement",
    async run() {
      const { text } = await generateText(LONG_LESSON_PROMPT);
      assert(text.includes("\u8bfe\u7a0b\u5185\u5bb9\u4e0e\u8bfe\u65f6\u5b89\u6392"), "lesson should include class-hour arrangement");
    }
  },
  {
    name: "64 class hour request includes staged arrangement",
    async run() {
      const { text } = await generateText(LONG_LESSON_PROMPT);
      assert(text.includes("64 \u8bfe\u65f6") || text.includes("64\u8bfe\u65f6"), "lesson should include 64 class hours");
      assertIncludesAll(
        text,
        [
          "\u8bfe\u7a0b\u5bfc\u5165\u4e0e\u8f6f\u4ef6\u57fa\u7840",
          "\u4e09\u7ef4\u5efa\u6a21\u57fa\u7840",
          "\u6750\u8d28\u3001\u706f\u5149\u4e0e\u6e32\u67d3",
          "\u52a8\u753b\u89c4\u5f8b\u4e0e\u5173\u952e\u5e27\u5236\u4f5c"
        ],
        "64-hour lesson"
      );
    }
  },
  {
    name: "2000-word lesson does not use general composer",
    async run() {
      const { result, text } = await generateText(LONG_LESSON_PROMPT);
      assert(result.wordTaskMemory.plan?.metadata.attributes?.documentKind === "lesson_plan", "word memory should record lesson_plan");
      assertNoThinGeneralShell(text);
      assert(text.length > 1200, "lesson should be visibly longer than the thin template");
    }
  },
  {
    name: "docx body is not thin general shell",
    async run() {
      const { text } = await generateText(LESSON_PROMPT);
      assertNoThinGeneralShell(text);
      assertIncludesAll(text, REQUIRED_LESSON_TERMS, "lesson docx");
    }
  },
  {
    name: "QA repair keeps lesson_plan structure",
    async run() {
      const plan = buildWordPlan({ title: LESSON_PROMPT, instruction: LESSON_PROMPT, language: "zh-CN" });
      assert(plan.metadata.attributes?.documentKind === "lesson_plan", "plan should be lesson_plan before render");
      const documentPlan = composeLessonDocumentPlan({ title: LESSON_PROMPT, instruction: LESSON_PROMPT, language: "zh-CN" });
      const report = evaluateWordDocumentPlan(documentPlan, { prompt: LESSON_PROMPT });
      assert(!report.issues.some((issue) => issue.code === "missing_structure_mix"), "lesson plan should not be generic structure");
      assert(!report.issues.some((issue) => issue.code === "generic_lesson_process"), "lesson process should be grounded");
    }
  },
  {
    name: "simple notice is not lesson_plan",
    run() {
      const prompt = "\u5199\u4e00\u4e2a\u7b80\u5355\u901a\u77e5 Word";
      const plan = buildWordPlan({ title: prompt, instruction: prompt, language: "zh-CN" });
      assert(plan.metadata.attributes?.documentKind !== "lesson_plan", "simple notice should not be lesson_plan");
    }
  },
  {
    name: "Word advice does not generate a file",
    run() {
      const plan = planAgentRuntimeTurn({
        messages: [{ role: "user", content: "\u6559\u6848\u600e\u4e48\u5199\uff1f" }],
        files: [],
        pendingTask: null,
        activeTask: null,
        cachedConversationSummary: null,
        tools: { webSearch: false, contentMode: null }
      });
      assert(plan.decision.nextAction !== "run_legacy_tool", "advice should not execute Word generation");
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
    console.error(`Agent Word lesson plan checks failed: ${failed}/${checks.length} cases failed.`);
    process.exit(1);
  }

  console.log(`Agent Word lesson plan checks passed. ${checks.length}/${checks.length} PASS.`);
}

void main();
