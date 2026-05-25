import { rm, readFile } from "node:fs/promises";
import path from "node:path";

import { detectDeepWritingMode } from "@/lib/agent/runtime/deep-writing-detector";
import { createDeepWritingTaskMemory, isDeepWritingResumeRequest, resumeDeepWritingTaskMemory, type DeepWritingTaskMemory } from "@/lib/agent/runtime/deep-writing-memory";
import { runDeepWritingDraft, type SafeDeepWritingEvent } from "@/lib/agent/runtime/deep-writing-runner";
import { classifyWordWriteMode } from "@/lib/agent/runtime/word-write-mode-classifier";
import { executeRuntimeTool } from "@/lib/agent/runtime/tool-executor";
import type { AgentRuntimeDecision } from "@/lib/agent/runtime";
import type { ToolAdapterContext } from "@/lib/agent/runtime/tool-adapters";
import type { AgentRunResult } from "@/lib/agent/types";
import { parseDocxPackage } from "@/lib/document/docx-package";
import { composeDeepWritingDocxContent, composeDeepWritingDocxRequest, extractDeepWritingTopicProfile } from "@/lib/word-engine/compose-deep-writing-docx";
import { generateDocx, generateWordDocumentFromRequest } from "@/lib/word-engine";

type Check = {
  name: string;
  run: () => Promise<void> | void;
};

const PRIMARY_LANGUAGE_PROMPT = "帮我生成一个小学三年级语文课程的教案";
const ANIMATION_PROMPT = "帮我写一个三维动画课程的教案";
const SIMPLE_NOTICE_PROMPT = "帮我写一个门店开业通知 Word";
const FORBIDDEN_ANIMATION_TERMS = ["三维动画", "建模", "材质", "灯光", "渲染", "关键帧", "Maya", "Blender"];
const PRIMARY_LANGUAGE_TERMS = ["识字", "朗读", "课文", "阅读", "作业", "板书"];
const ANIMATION_TERMS = ["建模", "渲染", "关键帧"];
const UNSAFE_PAYLOAD_TERMS = ["prompt", "provider", "model", "stack", "apiKey", "rawMemory", "deepWritingTaskMemory", "wordTaskMemory"];
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIncludes(text: string, terms: string[], label: string) {
  for (const term of terms) assert(text.includes(term), `${label} should include ${term}`);
}

function assertExcludes(text: string, terms: string[], label: string) {
  for (const term of terms) assert(!text.includes(term), `${label} should not include ${term}`);
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
  return textFromXml(xml);
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

function adapterContext(input: {
  userText: string;
  conversationId: string;
  events?: SafeDeepWritingEvent[];
  deepWritingTaskMemory?: DeepWritingTaskMemory | null;
  sourceText?: string;
}): ToolAdapterContext {
  const sourceText = input.sourceText || "";
  return {
    request: new Request("http://localhost/api/ai/chat"),
    origin: "http://localhost",
    userId: "word-content-pipeline-test",
    conversationId: input.conversationId,
    userText: input.userText,
    messages: [{ role: "user", content: input.userText }],
    files: [],
    conversationFiles: sourceText
      ? [
          {
            attachmentId: "source-1",
            fileName: "source.txt",
            mimeType: "text/plain",
            sizeBytes: sourceText.length,
            objectKey: null,
            providerFileId: null,
            extractedText: sourceText,
            textPreview: sourceText.slice(0, 400),
            parseStatus: "parsed",
            sourceMessageId: "message-1",
            conversationId: input.conversationId
          }
        ]
      : [],
    tools: { webSearch: false, contentMode: "write" },
    signal: new AbortController().signal,
    deepWritingTaskMemory: input.deepWritingTaskMemory,
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

function makeMemory(instruction: string, conversationId: string) {
  const detection = detectDeepWritingMode({ userText: instruction, targetTool: "word" });
  assert(detection.enabled, "test setup should trigger deep writing");
  return createDeepWritingTaskMemory({
    conversationId,
    originalInstruction: instruction,
    topic: instruction,
    detection,
    sourceFileNames: [],
    sourceSummary: ""
  });
}

async function runDraft(instruction: string, conversationId: string) {
  const events: SafeDeepWritingEvent[] = [];
  const completed = await runDeepWritingDraft({
    memory: makeMemory(instruction, conversationId),
    emit: (event) => {
      events.push(event);
    }
  });
  return { completed, events, text: JSON.stringify(events) };
}

function renderMemoryToDocxText(memory: DeepWritingTaskMemory) {
  const content = composeDeepWritingDocxContent(memory);
  const request = composeDeepWritingDocxRequest(memory);
  const result = generateDocx({
    content,
    request,
    warnings: [],
    wordTaskMemory: {
      conversationId: memory.conversationId,
      originalInstruction: memory.originalInstruction,
      title: memory.topic,
      sourceFileNames: [],
      sourceSummary: "",
      plan: null,
      completedSections: memory.completedSectionIds,
      pendingSections: memory.pendingSectionIds,
      currentStage: "rendering_docx",
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt
    }
  });
  return docxText(result.buffer);
}

async function executeAdapter(input: {
  userText: string;
  conversationId: string;
  events?: SafeDeepWritingEvent[];
  deepWritingTaskMemory?: DeepWritingTaskMemory | null;
  sourceText?: string;
}) {
  return executeRuntimeTool(makeDecision(), adapterContext(input));
}

function eventText(events: SafeDeepWritingEvent[]) {
  return events.map((event) => JSON.stringify(event.payload)).join("\n");
}

function localPathFromMockUrl(url?: string | null) {
  assert(url, "generated file should include a download URL");
  assert(url.startsWith("/mock-storage/"), `unexpected generated URL: ${url}`);
  return path.join(process.cwd(), "public", url.replace(/^\//, ""));
}

const sourceText = [
  "门店开业通知：新门店将于本月二十八日上午九点正式营业，请运营、商品、会员和宣传相关同事按既定排班到岗。",
  "开业前一天需要完成货架陈列、价签核对、收银测试、会员礼品清点、消防通道检查和现场导视摆放，所有结果由店长统一确认。",
  "开业当天顾客接待由前厅组负责，商品补货由后仓组负责，线上社群咨询由宣传组负责，突发客诉由值班主管第一时间响应。",
  "活动规则包括到店礼、满额赠、会员积分和新品试吃，员工须熟悉优惠边界，避免出现口径不一致或承诺超出活动范围的情况。",
  "现场秩序方面，入口区域安排引导人员，收银台保持两条动线，试吃区控制排队距离，儿童活动角由专人巡查安全。",
  "数据记录方面，营业结束后汇总客流、销售额、热销品类、会员新增、库存异常和顾客反馈，并在第二日上午提交复盘表。",
  "如遇系统卡顿、物料不足、投诉集中或客流超过预估，值班主管应立即启动备用方案，并同步区域负责人和店长。",
  "本通知作为门店开业执行依据，请各组在开业前完成自查，并将未完成事项写入问题清单，便于后续跟进整改。"
].join("\n\n");

const checks: Check[] = [
  {
    name: "unmarked write from scratch rejects fast docx",
    async run() {
      let failed = false;
      try {
        await generateWordDocumentFromRequest({ title: PRIMARY_LANGUAGE_PROMPT, instruction: PRIMARY_LANGUAGE_PROMPT, language: "zh-CN" });
      } catch (error) {
        failed = String(error).includes("WRITE_FROM_SCRATCH_REQUIRES_CONTENT_GENERATION");
      }
      assert(failed, "write-from-scratch without contentOrigin should be rejected");
    }
  },
  {
    name: "export existing with source text allows fast docx",
    async run() {
      const result = await generateWordDocumentFromRequest({
        title: "门店开业通知整理",
        instruction: "把下面这段内容整理成 Word",
        contentOrigin: "existing_content",
        sourceText,
        language: "zh-CN"
      });
      assert(result.mimeType === DOCX_MIME, "export_existing should generate docx");
      assert(docxText(result.buffer).includes("门店开业"), "docx should retain source topic");
    }
  },
  {
    name: "compose simple is not immediate deterministic docx",
    async run() {
      const decision = classifyWordWriteMode({ userText: SIMPLE_NOTICE_PROMPT, contentMode: "write" });
      assert(decision.mode === "compose_simple", `expected compose_simple, got ${decision.mode}`);
      assert(!decision.shouldGenerateImmediateDocx, "compose_simple should not fast export");
    }
  },
  {
    name: "compose deep is not immediate deterministic docx",
    async run() {
      const decision = classifyWordWriteMode({ userText: PRIMARY_LANGUAGE_PROMPT, contentMode: "write" });
      assert(decision.mode === "compose_deep", `expected compose_deep, got ${decision.mode}`);
      assert(!decision.shouldGenerateImmediateDocx, "compose_deep should not fast export");
    }
  },
  {
    name: "primary language topic extraction finds subject and grade",
    run() {
      const profile = extractDeepWritingTopicProfile(PRIMARY_LANGUAGE_PROMPT);
      assert(profile.subject === "语文", `expected subject 语文, got ${profile.subject}`);
      assert(profile.grade === "小学三年级", `expected grade 小学三年级, got ${profile.grade}`);
      assert(profile.domain === "primary_language", `expected primary_language, got ${profile.domain}`);
    }
  },
  {
    name: "animation topic extraction finds subject",
    run() {
      const profile = extractDeepWritingTopicProfile(ANIMATION_PROMPT);
      assert(profile.subject === "三维动画", `expected subject 三维动画, got ${profile.subject}`);
      assert(profile.domain === "animation_course", `expected animation_course, got ${profile.domain}`);
    }
  },
  {
    name: "primary language outline excludes animation terms",
    run() {
      const memory = makeMemory(PRIMARY_LANGUAGE_PROMPT, "pipeline-primary-outline");
      const outlineText = memory.outline.map((section) => section.title).join("\n");
      assertExcludes(outlineText, FORBIDDEN_ANIMATION_TERMS, "primary language outline");
    }
  },
  {
    name: "primary language section deltas exclude animation terms",
    async run() {
      const { events } = await runDraft(PRIMARY_LANGUAGE_PROMPT, "pipeline-primary-delta");
      const deltas = events.filter((event) => event.type === "deep_writing_section_delta");
      assert(deltas.length > 0, "expected section deltas");
      assertExcludes(eventText(deltas), FORBIDDEN_ANIMATION_TERMS, "primary language section deltas");
    }
  },
  {
    name: "primary language docx excludes animation terms",
    async run() {
      const { completed } = await runDraft(PRIMARY_LANGUAGE_PROMPT, "pipeline-primary-docx");
      assertExcludes(renderMemoryToDocxText(completed), FORBIDDEN_ANIMATION_TERMS, "primary language docx");
    }
  },
  {
    name: "primary language draft includes language teaching terms",
    async run() {
      const { text } = await runDraft(PRIMARY_LANGUAGE_PROMPT, "pipeline-primary-terms");
      assertIncludes(text, PRIMARY_LANGUAGE_TERMS, "primary language draft");
    }
  },
  {
    name: "primary language docx includes language teaching terms",
    async run() {
      const { completed } = await runDraft(PRIMARY_LANGUAGE_PROMPT, "pipeline-primary-docx-terms");
      assertIncludes(renderMemoryToDocxText(completed), PRIMARY_LANGUAGE_TERMS, "primary language docx");
    }
  },
  {
    name: "animation lesson allows animation terms",
    async run() {
      const { text } = await runDraft(ANIMATION_PROMPT, "pipeline-animation-terms");
      assertIncludes(text, ANIMATION_TERMS, "animation draft");
    }
  },
  {
    name: "same conversation animation then primary language creates new task",
    async run() {
      const conversationId = "pipeline-cross-topic-a";
      const firstEvents: SafeDeepWritingEvent[] = [];
      const first = await executeAdapter({ userText: ANIMATION_PROMPT, conversationId, events: firstEvents });
      assert("resultCard" in first && first.resultCard?.deepWritingTaskMemory, "first request should create memory");
      const firstMemory = first.resultCard.deepWritingTaskMemory as DeepWritingTaskMemory;
      const secondEvents: SafeDeepWritingEvent[] = [];
      const second = await executeAdapter({ userText: PRIMARY_LANGUAGE_PROMPT, conversationId, events: secondEvents, deepWritingTaskMemory: firstMemory });
      assert("resultCard" in second && second.resultCard?.deepWritingTaskMemory, "second request should create memory");
      const secondMemory = second.resultCard.deepWritingTaskMemory as DeepWritingTaskMemory;
      assert(firstMemory.taskId !== secondMemory.taskId, "cross-topic request should create a new task");
      assertExcludes(eventText(secondEvents), FORBIDDEN_ANIMATION_TERMS, "second cross-topic events");
    }
  },
  {
    name: "only explicit resume phrase permits resume",
    run() {
      assert(isDeepWritingResumeRequest("继续刚才的深度写作"), "explicit resume should match");
      assert(!isDeepWritingResumeRequest(PRIMARY_LANGUAGE_PROMPT), "new topic should not match resume");
    }
  },
  {
    name: "topic fingerprint mismatch blocks memory reuse",
    run() {
      const animationMemory = makeMemory(ANIMATION_PROMPT, "pipeline-fingerprint");
      let failed = false;
      try {
        resumeDeepWritingTaskMemory(animationMemory, "继续刚才，改成小学三年级语文课程的教案");
      } catch (error) {
        failed = String(error).includes("TOPIC_FINGERPRINT_MISMATCH");
      }
      assert(failed, "resume should reject a different explicit topic");
    }
  },
  {
    name: "deep writing completed docx uses completed sections",
    run() {
      const memory = makeMemory(PRIMARY_LANGUAGE_PROMPT, "pipeline-completed-sections");
      memory.outline = [
        {
          id: "section-1",
          title: "教学过程设计",
          status: "completed",
          draft: "本节使用唯一正文标记：课文朗读与识字板书任务。"
        }
      ];
      memory.completedSectionIds = ["section-1"];
      memory.pendingSectionIds = [];
      const text = renderMemoryToDocxText(memory);
      assert(text.includes("唯一正文标记"), "docx should include completed section draft");
      assertExcludes(text, FORBIDDEN_ANIMATION_TERMS, "completed section docx");
    }
  },
  {
    name: "payload excludes internal terms",
    async run() {
      const { events } = await runDraft(PRIMARY_LANGUAGE_PROMPT, "pipeline-payload");
      assertExcludes(JSON.stringify(events), UNSAFE_PAYLOAD_TERMS, "deep writing payload");
    }
  },
  {
    name: "search provider not configured does not fake external sources",
    async run() {
      const { events } = await runDraft(PRIMARY_LANGUAGE_PROMPT, "pipeline-sources");
      const sourceText = eventText(events.filter((event) => event.type === "deep_writing_source"));
      assert(!sourceText.includes("http://") && !sourceText.includes("https://"), "not configured search should not invent external URLs");
    }
  },
  {
    name: "adapter export existing can fast docx and preserves source",
    async run() {
      const result = await executeAdapter({ userText: "把下面这段内容整理成 Word", conversationId: "pipeline-export", sourceText });
      assert("resultCard" in result && result.resultCard?.mode !== "deep_writing", "export_existing can use normal Word card");
      const generated = result.result.generatedFiles[0];
      assert(generated?.mimeType === DOCX_MIME, "export should produce docx");
      const filePath = localPathFromMockUrl(generated.url);
      const text = docxText(await readFile(filePath));
      await rm(filePath, { force: true });
      assert(text.includes("门店开业"), "export docx should preserve source text");
    }
  },
  {
    name: "adapter compose deep returns deep writing card",
    async run() {
      const events: SafeDeepWritingEvent[] = [];
      const result = await executeAdapter({ userText: PRIMARY_LANGUAGE_PROMPT, conversationId: "pipeline-deep-card", events });
      assert("resultCard" in result && result.resultCard?.mode === "deep_writing", "compose_deep should return deep writing card");
      assert(events.some((event) => event.type === "deep_writing_section_delta"), "compose_deep should stream section delta");
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
    console.error(`Word content pipeline checks failed. ${passed}/${checks.length} PASS.`);
    process.exit(1);
  }

  console.log(`Word content pipeline checks passed. ${passed}/${checks.length} PASS.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
