import { extractAgentTask } from "@/lib/agent/router";
import { getLatestUserText } from "@/lib/agent/runtime/context-manager";
import { evaluateExecutionGate } from "@/lib/agent/runtime/execution-gate";
import { matchAgentSkill } from "@/lib/agent/runtime/skill-router";
import type {
  AgentRuntimeDecision,
  AgentRuntimeInput,
  AgentRuntimeIntent,
  AgentRuntimeNextAction,
  AgentRuntimePlan,
  AgentRuntimeStage,
  AgentRuntimeTargetTool
} from "@/lib/agent/runtime/types";

const intentBySkill: Record<string, AgentRuntimeIntent> = {
  "file-analysis": "file_analysis",
  word: "word",
  excel: "excel",
  "ppt-simple": "ppt_simple",
  "academic-ppt": "academic_ppt",
  image: "image",
  "teaching-diagram": "teaching_diagram",
  "knowledge-graph": "knowledge_graph"
};

function targetTool(skillId: string | null): AgentRuntimeTargetTool {
  if (!skillId) return "none";
  if (skillId in intentBySkill) return skillId as AgentRuntimeTargetTool;
  return "none";
}

function isAmbiguousAcademicPptRequest(text: string) {
  const compact = text.replace(/\s+/g, "").toLowerCase();
  if (!/(学术ppt|论文ppt|课题ppt|申报ppt|academicppt|paperppt)/i.test(compact)) return false;
  const remainder = compact.replace(/帮我|请|生成|创建|制作|一个|一份|学术ppt|论文ppt|课题ppt|申报ppt|academicppt|paperppt/gi, "");
  return remainder.length < 4;
}

function referencesCurrentPptEdit(text: string) {
  return /继续刚才的\s*ppt|刚才的\s*ppt|上一个\s*ppt|上一份\s*ppt|ppt.*改成|ppt.*修改|ppt.*编辑|ppt.*正式|改成正式一点/i.test(text);
}

function explicitlyRegeneratesPpt(text: string) {
  return /重新生成|再生成|重新做|重新制作|生成.*新版|新版|另生成|重新出一版|regenerate/i.test(text);
}

function needsPptRegenerationConfirmation(text: string, input: AgentRuntimeInput, selectedSkillId: string | null) {
  return input.activeTask?.kind === "ppt" && selectedSkillId === "ppt-simple" && referencesCurrentPptEdit(text) && !explicitlyRegeneratesPpt(text);
}

function nextAction({
  allowed,
  needsTool,
  needsConfirmation
}: {
  allowed: boolean;
  needsTool: boolean;
  needsConfirmation: boolean;
}): AgentRuntimeNextAction {
  if (needsConfirmation) return "ask_clarification";
  if (allowed) return "run_legacy_tool";
  if (needsTool) return "ask_clarification";
  return "answer_chat";
}

function progressStages(action: AgentRuntimeNextAction): AgentRuntimeStage[] {
  const base: AgentRuntimeStage[] = ["analyzing_context", "planning_intent", "selecting_skill", "checking_execution_gate"];
  if (action === "run_legacy_tool") return [...base, "calling_tool", "completed"];
  if (action === "answer_chat") return [...base, "calling_model", "completed"];
  return [...base, "completed"];
}

function clarificationQuestion(decision: Pick<AgentRuntimeDecision, "targetTool" | "missingInputs">, legacyQuestion?: string) {
  if (legacyQuestion) return legacyQuestion;
  if (decision.missingInputs.includes("academic_ppt_confirmation")) {
    return "我先确认一下：你要做的是普通 PPT，还是论文、课题、申报等学术汇报 PPT？请补充主题、用途和材料。";
  }
  if (decision.missingInputs.includes("ppt_regeneration_confirmation")) {
    return "当前聊天里的简单 PPT 支持基于原主题重新生成新版，不支持直接编辑已有 PPT 文件。要我按刚才主题重新生成一个更正式版本吗？";
  }
  if (decision.missingInputs.includes("subject")) {
    if (decision.targetTool === "ppt-simple") return "可以，我先确认一下：这个 PPT 的主题是什么？需要面向谁，预计多少页？";
    if (decision.targetTool === "word") return "可以，我先确认一下：这份 Word 文档的主题、文体和大致篇幅是什么？";
    if (decision.targetTool === "teaching-diagram") return "可以，我先确认一下：这张教学架构图围绕哪个主题或材料来生成？";
    return "可以，我先确认一下：你希望围绕什么主题来生成？";
  }
  if (decision.missingInputs.includes("data_source")) return "可以导出成 Excel。请先提供要导出的数据、表格内容，或上传源文件。";
  if (decision.missingInputs.includes("active_task")) return "我需要先确认你指的是当前对话里的哪一个任务。请告诉我是哪个 PPT、文档或表格，或者重新上传/打开对应任务。";
  if (decision.missingInputs.includes("image_to_edit")) return "可以改图。请告诉我要修改哪张图，或上传需要编辑的图片。";
  if (decision.missingInputs.includes("file")) return "这一步需要源文件，请先上传要处理的文件。";
  return "我先确认一下：你是希望我现在直接执行生成/修改，还是先给你方案和建议？";
}

export function planAgentRuntimeIntent(input: AgentRuntimeInput): Omit<AgentRuntimePlan, "trace"> & {
  legacyTask: ReturnType<typeof extractAgentTask>;
  skillSelection: ReturnType<typeof matchAgentSkill>;
  gate: ReturnType<typeof evaluateExecutionGate>;
} {
  const text = getLatestUserText(input);
  const legacyTask = extractAgentTask(text, Boolean(input.files?.length), {
    pendingTask: input.pendingTask || null,
    tools: input.tools
  });
  const skillSelection = matchAgentSkill({ text, input, legacyTask });
  const selectedSkill = skillSelection.selected;
  const ambiguousAcademicPpt = isAmbiguousAcademicPptRequest(text);
  const pptRegenerationConfirmation = needsPptRegenerationConfirmation(text, input, selectedSkill.skillId);
  const gate = evaluateExecutionGate({ text, legacyTask, skillMatch: selectedSkill, activeTaskKind: input.activeTask?.kind || null });
  const action = ambiguousAcademicPpt || pptRegenerationConfirmation ? "ask_clarification" : nextAction(gate);
  const intent = ambiguousAcademicPpt ? "academic_ppt" : selectedSkill.skillId ? intentBySkill[selectedSkill.skillId] || "general_chat" : "general_chat";
  const missingInputs = Array.from(
    new Set([
      ...gate.missingInputs,
      ...(ambiguousAcademicPpt ? ["academic_ppt_confirmation"] : []),
      ...(pptRegenerationConfirmation ? ["ppt_regeneration_confirmation"] : [])
    ])
  );
  const baseDecision = {
    intent,
    targetTool: ambiguousAcademicPpt ? "none" : targetTool(selectedSkill.skillId),
    confidence: Math.max(0, Math.min(0.99, selectedSkill.confidence)),
    needsTool: ambiguousAcademicPpt ? false : gate.needsTool,
    needsConfirmation: ambiguousAcademicPpt || pptRegenerationConfirmation || gate.needsConfirmation || legacyTask.type === "clarify",
    missingInputs,
    activeTaskId: input.activeTask?.id || (input.pendingTask ? "pending-conversation-task" : null),
    nextAction: action,
    progressStages: progressStages(action)
  } satisfies Omit<AgentRuntimeDecision, "clarificationQuestion">;
  const decision: AgentRuntimeDecision = {
    ...baseDecision,
    clarificationQuestion: action === "ask_clarification" ? clarificationQuestion(baseDecision, legacyTask.clarificationQuestion) : undefined
  };

  return {
    decision,
    legacyTask,
    skillSelection,
    gate
  };
}
