import { readFile } from "node:fs/promises";

import { closeDeepWritingPanel, createInitialDeepWritingClientState, openDeepWritingPanel, reduceDeepWritingPanelEvent } from "@/components/chat/deep-writing-panel-state";
import type { ChatTaskCard } from "@/components/chat/chat-data";
import { createDeepWritingTaskMemory } from "@/lib/agent/runtime/deep-writing-memory";
import { detectDeepWritingMode } from "@/lib/agent/runtime/deep-writing-detector";
import { runDeepWritingDraft } from "@/lib/agent/runtime/deep-writing-runner";
import { parseDocxPackage } from "@/lib/document/docx-package";
import { composeDeepWritingDocxContent, composeDeepWritingDocxRequest } from "@/lib/word-engine/compose-deep-writing-docx";
import { generateDocx } from "@/lib/word-engine";
import { normalizeDocumentTitle } from "@/lib/word-engine/normalize-document-title";
import type { DeepWritingTaskMemory } from "@/lib/agent/runtime/deep-writing-memory";

type Check = {
  name: string;
  run: () => Promise<void> | void;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIncludes(text: string, terms: string[], label: string) {
  for (const term of terms) assert(text.includes(term), `${label} should include ${term}`);
}

function assertExcludes(text: string, terms: string[], label: string) {
  for (const term of terms) assert(!text.includes(term), `${label} should not include ${term}`);
}

function countMatches(text: string, terms: string[]) {
  return terms.filter((term) => text.includes(term)).length;
}

function sourceOf(file: string) {
  return readFile(file, "utf8");
}

function makeMemory(prompt: string) {
  const detection = detectDeepWritingMode({ userText: prompt, targetTool: "word" });
  assert(detection.enabled, "test prompt should trigger deep writing");
  return createDeepWritingTaskMemory({
    conversationId: `doc-stream-${Math.random().toString(36).slice(2)}`,
    originalInstruction: prompt,
    topic: prompt,
    detection,
    sourceFileNames: [],
    sourceSummary: ""
  });
}

async function completedMemory(prompt: string) {
  const memory = makeMemory(prompt);
  return runDeepWritingDraft({
    memory,
    contentGenerationMode: "deterministic_test_only",
    emit: () => undefined
  });
}

function docxParts(memory: DeepWritingTaskMemory) {
  const content = composeDeepWritingDocxContent(memory);
  const request = composeDeepWritingDocxRequest(memory);
  const result = generateDocx({
    content,
    request,
    warnings: [],
    wordTaskMemory: {
      conversationId: memory.conversationId,
      originalInstruction: memory.originalInstruction,
      title: request.title,
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
  const docx = parseDocxPackage(result.buffer);
  const documentXml = docx.getText("word/document.xml") || "";
  const coreXml = docx.getText("docProps/core.xml") || "";
  const text = documentXml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  return { result, text, documentXml, coreXml };
}

function deepCard(): ChatTaskCard {
  return {
    kind: "task_card",
    taskType: "word",
    status: "completed",
    title: "高中二年级化学教案",
    description: "高中二年级化学教案.docx",
    taskId: "doc-stream-task",
    mode: "deep_writing",
    deepWritingTaskId: "doc-stream-task",
    panelAvailable: true,
    panelAutoOpen: true,
    currentStage: "completed",
    documentReady: true,
    downloadUrl: "/mock/high-school-chemistry.docx"
  };
}

const unsafeUiTerms = ["deep_writing_", "section_delta", "source_plan", "taskId", "provider", "model", "prompt", "stack", "apiKey", "rawMemory"];

const checks: Check[] = [
  {
    name: "panel title no longer says deep writing process",
    async run() {
      const source = await sourceOf("components/chat/DeepWritingPanel.tsx");
      assert(!source.includes("深度写作过程"), "panel should not display 深度写作过程");
    }
  },
  {
    name: "panel uses document generation title",
    async run() {
      const source = await sourceOf("components/chat/DeepWritingPanel.tsx");
      assert(source.includes("文档生成"), "panel should use 文档生成 wording");
    }
  },
  {
    name: "task card button says view document",
    async run() {
      const source = await sourceOf("components/chat/chat-message.tsx");
      assert(source.includes("查看文档") || source.includes("查看生成结果"), "button should say view document");
      assert(!source.includes("查看写作过程"), "button should not say view writing process");
    }
  },
  {
    name: "outline event maps to document outline",
    run() {
      const state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_outline",
        payload: { taskId: "doc-stream-task", title: "高中二年级化学教案", outline: [{ id: "s1", title: "课程基本信息", status: "pending" }] }
      });
      assert(state.panelState?.outline[0]?.title === "课程基本信息", "outline should update document outline");
    }
  },
  {
    name: "section delta maps to preview body",
    run() {
      let state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_section_started",
        payload: { taskId: "doc-stream-task", sectionId: "s1", title: "教学过程设计" }
      });
      state = reduceDeepWritingPanelEvent(state, {
        type: "deep_writing_section_delta",
        payload: { taskId: "doc-stream-task", sectionId: "s1", delta: "实验观察和现象记录。" }
      });
      assert(state.panelState?.currentSection?.draft.includes("实验观察"), "section delta should append to draft preview");
    }
  },
  {
    name: "section completed stores complete section body",
    run() {
      let state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_section_started",
        payload: { taskId: "doc-stream-task", sectionId: "s1", title: "教学过程设计" }
      });
      state = reduceDeepWritingPanelEvent(state, {
        type: "deep_writing_section_delta",
        payload: { taskId: "doc-stream-task", sectionId: "s1", delta: "实验观察和现象记录。" }
      });
      state = reduceDeepWritingPanelEvent(state, {
        type: "deep_writing_section_completed",
        payload: { taskId: "doc-stream-task", sectionId: "s1", title: "教学过程设计", preview: "实验观察" }
      });
      assert(state.panelState?.completedSections?.[0]?.draft.includes("实验观察"), "completed section should keep full draft");
    }
  },
  {
    name: "completed keeps full document preview",
    run() {
      let state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_section_completed",
        payload: { taskId: "doc-stream-task", sectionId: "s1", title: "教学过程设计", draft: "完整正文内容", preview: "完整正文" }
      });
      state = reduceDeepWritingPanelEvent(state, {
        type: "deep_writing_completed",
        payload: { taskId: "doc-stream-task", downloadUrl: "/mock/doc.docx" }
      });
      assert(state.panelState?.completedSections?.[0]?.draft === "完整正文内容", "completed document preview should remain");
    }
  },
  {
    name: "zero sources are weakly displayed",
    async run() {
      const source = await sourceOf("components/chat/DeepWritingPanel.tsx");
      assert(source.includes("当前基于用户输入和已有对话生成"), "zero sources should use weak hint");
      assert(!source.includes("0 条"), "zero sources should not emphasize 0 items");
    }
  },
  {
    name: "ui does not display event names",
    async run() {
      const source = await sourceOf("components/chat/DeepWritingPanel.tsx");
      assertExcludes(source, ["deep_writing_started", "deep_writing_outline", "deep_writing_section_delta"], "panel UI source");
    }
  },
  {
    name: "ui does not display task id",
    async run() {
      const source = await sourceOf("components/chat/DeepWritingPanel.tsx");
      assert(!/task\s*id|taskId/i.test(source), "panel should not render task id text");
    }
  },
  {
    name: "ui does not display internal fields",
    async run() {
      const source = await sourceOf("components/chat/DeepWritingPanel.tsx");
      assertExcludes(source, unsafeUiTerms.slice(4), "panel UI source");
    }
  },
  {
    name: "high school chemistry title normalizes",
    run() {
      assert(normalizeDocumentTitle({ instruction: "帮我写一个高中二年级化学的教案", documentKind: "lesson_plan" }) === "高中二年级化学教案", "chemistry title should normalize");
    }
  },
  {
    name: "primary math title normalizes",
    run() {
      assert(normalizeDocumentTitle({ instruction: "帮我生成一个小学三年级数学课程的教案", documentKind: "lesson_plan" }) === "小学三年级数学教案", "math title should normalize");
    }
  },
  {
    name: "animation title normalizes",
    run() {
      assert(normalizeDocumentTitle({ instruction: "帮我写一个三维动画课程的教案", documentKind: "lesson_plan" }) === "三维动画课程教案", "animation title should normalize");
    }
  },
  {
    name: "file name uses normalized title",
    async run() {
      const memory = await completedMemory("帮我写一个高中二年级化学的教案");
      const { result } = docxParts(memory);
      assert(result.fileName === "高中二年级化学教案.docx", `expected normalized fileName, got ${result.fileName}`);
    }
  },
  {
    name: "docx metadata title uses normalized title",
    async run() {
      const memory = await completedMemory("帮我写一个高中二年级化学的教案");
      const { coreXml } = docxParts(memory);
      assert(coreXml.includes("<dc:title>高中二年级化学教案</dc:title>"), "core metadata should include normalized title");
    }
  },
  {
    name: "lesson plan outline contains formal sections",
    run() {
      const memory = makeMemory("帮我写一个高中二年级化学的教案");
      const titles = memory.outline.map((item) => item.title).join("\n");
      assertIncludes(titles, ["课程基本信息", "学情分析", "教学目标", "教学重点与难点", "教学过程设计", "作业设计", "板书设计", "教学反思"], "lesson outline");
    }
  },
  {
    name: "chemistry lesson contains subject terms",
    async run() {
      const memory = await completedMemory("帮我写一个高中二年级化学的教案");
      const { text } = docxParts(memory);
      assert(countMatches(text, ["实验", "现象", "安全", "概念", "化学方程式"]) >= 2, "chemistry lesson should include chemistry terms");
    }
  },
  {
    name: "math lesson contains subject terms",
    async run() {
      const memory = await completedMemory("帮我生成一个小学三年级数学课程的教案");
      const { text } = docxParts(memory);
      assert(countMatches(text, ["例题", "练习", "计算", "推理", "课堂活动"]) >= 2, "math lesson should include math terms");
    }
  },
  {
    name: "language lesson contains subject terms",
    async run() {
      const memory = await completedMemory("帮我生成一个小学三年级语文课程的教案");
      const { text } = docxParts(memory);
      assert(countMatches(text, ["朗读", "课文", "生字词", "阅读", "板书"]) >= 2, "language lesson should include language terms");
    }
  },
  {
    name: "non-practice lesson does not default practical sections",
    async run() {
      const memory = await completedMemory("帮我写一个高中二年级化学的教案");
      const text = memory.outline.map((item) => item.title).join("\n");
      assertExcludes(text, ["实训任务", "项目作品"], "non-practice outline");
    }
  },
  {
    name: "animation course allows practical terms",
    async run() {
      const memory = await completedMemory("帮我写一个三维动画课程的教案");
      const { text } = docxParts(memory);
      assert(countMatches(text, ["实训", "项目", "建模", "渲染"]) >= 2, "animation lesson should allow practical terms");
    }
  },
  {
    name: "closing document page preserves active task",
    run() {
      const opened = openDeepWritingPanel(createInitialDeepWritingClientState(), deepCard());
      const closed = closeDeepWritingPanel(opened);
      assert(!closed.isOpen, "panel should close");
      assert(closed.activeTaskId === "doc-stream-task", "active task should remain");
    }
  },
  {
    name: "no internal fields in reducer state",
    run() {
      const state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_section_delta",
        payload: { taskId: "doc-stream-task", sectionId: "s1", title: "正文", delta: "公开正文", provider: "hidden", rawMemory: "hidden" }
      });
      const serialized = JSON.stringify(state);
      assert(serialized.includes("公开正文"), "public draft should remain");
      assertExcludes(serialized, ["provider", "rawMemory"], "panel state");
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
    console.error(`Word document stream UX checks failed. ${passed}/${checks.length} PASS.`);
    process.exit(1);
  }

  console.log(`Word document stream UX checks passed. ${passed}/${checks.length} PASS.`);
}

void main();
