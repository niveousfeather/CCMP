import type { ChatTaskCard } from "@/components/chat/chat-data";
import {
  closeDeepWritingPanel,
  createInitialDeepWritingClientState,
  isUnsafeDeepWritingText,
  openDeepWritingPanel,
  reduceDeepWritingPanelEvent,
  shouldShowDeepWritingProcessButton
} from "@/components/chat/deep-writing-panel-state";

type Check = {
  name: string;
  run: () => void;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function deepCard(): ChatTaskCard {
  return {
    kind: "task_card",
    taskType: "word",
    status: "running",
    title: "深度写作",
    description: "AI 教育调研报告",
    taskId: "deep-task-1",
    mode: "deep_writing",
    deepWritingTaskId: "deep-task-1",
    panelAvailable: true,
    panelAutoOpen: true,
    currentStage: "building_outline",
    deepWritingPanelState: {
      isOpen: true,
      taskId: "deep-task-1",
      title: "AI 教育调研报告",
      currentStage: "building_outline",
      progress: 10,
      outline: [],
      sources: [],
      canResume: true
    }
  };
}

function normalWordCard(): ChatTaskCard {
  return {
    kind: "task_card",
    taskType: "word",
    status: "completed",
    title: "Word 文档",
    description: "report.docx",
    downloadUrl: "/mock-storage/report.docx"
  };
}

const checks: Check[] = [
  {
    name: "deep_writing_started auto opens panel",
    run() {
      const state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_started",
        payload: { taskId: "deep-task-1", title: "AI 教育调研报告", stage: "planning", progress: 5 }
      });
      assert(state.isOpen, "panel should auto open");
      assert(state.activeTaskId === "deep-task-1", "activeTaskId should be set");
      assert(state.panelState?.currentStage === "planning", "stage should be planning");
    }
  },
  {
    name: "outline event updates outline",
    run() {
      const state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_outline",
        payload: {
          taskId: "deep-task-1",
          outline: [
            { id: "s1", title: "研究背景", status: "pending" },
            { id: "s2", title: "核心发现", status: "pending" }
          ]
        }
      });
      assert(state.panelState?.outline.length === 2, "outline should be updated");
      assert(state.panelState.outline[0]?.title === "研究背景", "outline title should be visible");
    }
  },
  {
    name: "section started sets current section",
    run() {
      let state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_outline",
        payload: { taskId: "deep-task-1", outline: [{ id: "s1", title: "研究背景", status: "pending" }] }
      });
      state = reduceDeepWritingPanelEvent(state, {
        type: "deep_writing_section_started",
        payload: { taskId: "deep-task-1", sectionId: "s1", title: "研究背景" }
      });
      assert(state.panelState?.currentSection?.id === "s1", "current section should be set");
      assert(state.panelState.outline[0]?.status === "writing", "outline status should be writing");
    }
  },
  {
    name: "section delta appends draft",
    run() {
      let state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_section_started",
        payload: { taskId: "deep-task-1", sectionId: "s1", title: "研究背景" }
      });
      state = reduceDeepWritingPanelEvent(state, {
        type: "deep_writing_section_delta",
        payload: { taskId: "deep-task-1", sectionId: "s1", delta: "第一段。" }
      });
      state = reduceDeepWritingPanelEvent(state, {
        type: "deep_writing_section_delta",
        payload: { taskId: "deep-task-1", sectionId: "s1", delta: "第二段。" }
      });
      assert(state.panelState?.currentSection?.draft === "第一段。第二段。", "delta should append without overwriting");
    }
  },
  {
    name: "section completed marks completed",
    run() {
      let state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_outline",
        payload: { taskId: "deep-task-1", outline: [{ id: "s1", title: "研究背景", status: "writing" }] }
      });
      state = reduceDeepWritingPanelEvent(state, {
        type: "deep_writing_section_completed",
        payload: { taskId: "deep-task-1", sectionId: "s1", preview: "背景已完成。" }
      });
      assert(state.panelState?.outline[0]?.status === "completed", "section should be completed");
      assert(state.panelState?.outline[0]?.preview === "背景已完成。", "preview should be recorded");
    }
  },
  {
    name: "source event writes source summary",
    run() {
      const state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_source_plan",
        payload: {
          taskId: "deep-task-1",
          sources: [{ title: "资料 A", summary: "资料围绕 AI 教育。", adopted: false }]
        }
      });
      assert(state.panelState?.sources[0]?.title === "资料 A", "source title should be stored");
      assert(state.panelState?.sources[0]?.summary.includes("AI 教育"), "source summary should be stored");
    }
  },
  {
    name: "completed sets progress and downloadUrl",
    run() {
      const state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_completed",
        payload: { taskId: "deep-task-1", title: "AI 教育调研报告", downloadUrl: "/download/report.docx" }
      });
      assert(state.panelState?.progress === 100, "progress should be 100");
      assert(state.panelState?.downloadUrl === "/download/report.docx", "downloadUrl should be set");
      assert(state.panelState?.currentStage === "completed", "stage should be completed");
    }
  },
  {
    name: "failed and interrupted can resume",
    run() {
      const failed = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_failed",
        payload: { taskId: "deep-task-1", title: "AI 教育调研报告" }
      });
      const interrupted = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_interrupted",
        payload: { taskId: "deep-task-2", title: "AI 教育调研报告" }
      });
      assert(failed.panelState?.canResume, "failed task should be resumable");
      assert(interrupted.panelState?.canResume, "interrupted task should be resumable");
    }
  },
  {
    name: "normal Word taskCard hides process button",
    run() {
      assert(!shouldShowDeepWritingProcessButton(normalWordCard()), "normal Word should not show process button");
    }
  },
  {
    name: "deep writing taskCard shows process button",
    run() {
      assert(shouldShowDeepWritingProcessButton(deepCard()), "deep writing card should show process button");
    }
  },
  {
    name: "unsafe payload fields are filtered",
    run() {
      const state = reduceDeepWritingPanelEvent(createInitialDeepWritingClientState(), {
        type: "deep_writing_section_delta",
        payload: {
          taskId: "deep-task-1",
          sectionId: "s1",
          title: "研究背景",
          delta: "可展示正文。",
          prompt: "hidden",
          provider: "hidden",
          stack: "hidden",
          apiKey: "hidden",
          internalJSON: { hidden: true },
          chainOfThought: "hidden"
        }
      });
      const serialized = JSON.stringify(state);
      assert(serialized.includes("可展示正文"), "safe draft should remain");
      for (const term of ["prompt", "provider", "stack", "apiKey", "internalJSON", "chainOfThought"]) {
        assert(!serialized.includes(term), `panel state should not include ${term}`);
      }
      assert(isUnsafeDeepWritingText("provider stack prompt"), "unsafe text detector should detect internal terms");
    }
  },
  {
    name: "closing panel preserves active task and can reopen",
    run() {
      const opened = openDeepWritingPanel(createInitialDeepWritingClientState(), deepCard());
      const closed = closeDeepWritingPanel(opened);
      assert(!closed.isOpen, "panel should close");
      assert(closed.activeTaskId === "deep-task-1", "active task should be preserved");
      const reopened = openDeepWritingPanel(closed, deepCard());
      assert(reopened.isOpen, "panel should reopen");
      assert(reopened.panelState?.taskId === "deep-task-1", "panel state should be restored");
    }
  },
  {
    name: "panel source renders direct body instead of outline cards",
    run() {
      const fs = require("node:fs") as typeof import("node:fs");
      const source = fs.readFileSync("components/chat/DeepWritingPanel.tsx", "utf8");
      assert(source.includes("directDocumentBody"), "panel should render direct document body");
      assert(!source.includes("文档大纲"), "panel should not render document outline title");
      assert(!source.includes("SectionStatusIcon"), "panel should not render outline card icons");
    }
  }
];

let failed = 0;

for (const check of checks) {
  try {
    check.run();
    console.log(`PASS ${check.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${check.name}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed > 0) {
  console.error(`Agent deep writing panel checks failed: ${failed}/${checks.length} cases failed.`);
  process.exit(1);
}

console.log(`Agent deep writing panel checks passed. ${checks.length}/${checks.length} PASS.`);
