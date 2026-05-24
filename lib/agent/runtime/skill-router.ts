import { getExplicitFileGenerationTool } from "@/lib/agent/task-intents";
import type { AgentRuntimeInput, AgentSkillId, AgentSkillMatch, AgentSkillSelection } from "@/lib/agent/runtime/types";
import type { AgentTask } from "@/lib/agent/types";

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function targetFromLegacyTask(task: AgentTask): AgentSkillId | null {
  if (task.type === "analyze_file") return "file-analysis";
  if (task.type === "create_document") return "word";
  if (task.type === "create_spreadsheet") return "excel";
  if (task.type === "create_presentation") return "ppt-simple";
  return null;
}

function uniqueTopCandidates(candidates: AgentSkillMatch[]) {
  return candidates
    .sort((a, b) => b.confidence - a.confidence)
    .filter((candidate, index, list) => candidate.skillId === null || list.findIndex((item) => item.skillId === candidate.skillId) === index)
    .slice(0, 3);
}

function wantsPlanOnly(text: string) {
  return /不要生成|先给方案|先别生成|先不要生成|只给建议|先讲思路|先给我方案|plan first/i.test(text);
}

function referencesCurrentFile(text: string) {
  return /这个文件|这份文件|刚才的文件|上一份文件|上传的文件|再总结|总结短一点|短一点|短些|提炼一下/i.test(text);
}

function referencesCurrentImage(text: string) {
  return /刚才那张图|上一张图|那张图|这张图|图片标题|改图|图片.*改|标题改成|标题改为/i.test(text);
}

function referencesCurrentPpt(text: string) {
  return /继续刚才的\s*ppt|刚才的\s*ppt|上一个\s*ppt|上一份\s*ppt|ppt.*改成|ppt.*正式|改成正式一点/i.test(text);
}

function referencesPptRegenerationFollowup(text: string) {
  return /重新生成|再生成|重新做|重新制作|生成.*新版|新版|另生成|重新出一版|更正式版本|regenerate/i.test(text);
}

export function matchAgentSkill({
  text,
  input,
  legacyTask
}: {
  text: string;
  input: AgentRuntimeInput;
  legacyTask: AgentTask;
}): AgentSkillSelection {
  const normalized = text.toLowerCase();
  const candidates: AgentSkillMatch[] = [];
  const activeKind = input.activeTask?.kind || "";

  if (wantsPlanOnly(text)) {
    candidates.push({ skillId: null, confidence: 0.99, reasons: ["user_requested_plan_first"] });
  }

  if (activeKind === "file-analysis" && referencesCurrentFile(text)) {
    candidates.push({ skillId: "file-analysis", confidence: 0.9, reasons: ["current_conversation_file_reference"] });
  } else if (!activeKind && referencesCurrentFile(text)) {
    candidates.push({ skillId: "file-analysis", confidence: 0.82, reasons: ["missing_current_conversation_file_reference"] });
  }

  if ((activeKind === "image" || activeKind === "teaching-diagram") && referencesCurrentImage(text)) {
    candidates.push({ skillId: "image", confidence: 0.9, reasons: ["current_conversation_image_reference"] });
  }

  if (activeKind === "ppt" && (referencesCurrentPpt(text) || referencesPptRegenerationFollowup(text))) {
    candidates.push({ skillId: "ppt-simple", confidence: 0.84, reasons: ["current_conversation_ppt_reference"] });
  } else if (!activeKind && referencesCurrentPpt(text)) {
    candidates.push({ skillId: "ppt-simple", confidence: 0.82, reasons: ["missing_current_conversation_ppt_reference"] });
  }

  if (input.tools?.contentMode === "image") {
    candidates.push({ skillId: "image", confidence: 0.95, reasons: ["selected_image_tool"] });
  }
  if (input.tools?.contentMode === "ppt") {
    candidates.push({ skillId: "ppt-simple", confidence: 0.95, reasons: ["selected_ppt_tool"] });
  }
  if (input.tools?.contentMode === "write") {
    candidates.push({ skillId: "word", confidence: 0.95, reasons: ["selected_write_tool"] });
  }

  if (
    hasAny(normalized, [
      /教学架构图/,
      /教学框架图/,
      /教改架构图/,
      /生成.*架构图.*图/,
      /teaching.*diagram/,
      /鏁欏鏋舵瀯鍥?/,
      /鏁欏.*妗嗘灦鍥?/,
      /璇剧▼.*鏋舵瀯鍥?/
    ])
  ) {
    candidates.push({ skillId: "teaching-diagram", confidence: 0.9, reasons: ["explicit_teaching_diagram_terms"] });
  }

  if (hasAny(normalized, [/知识图谱/, /概念图谱/, /关系图谱/, /knowledge\s*graph/, /鐭ヨ瘑鍥捐氨/, /姒傚康鍥捐氨/, /鍏崇郴鍥捐氨/])) {
    candidates.push({ skillId: "knowledge-graph", confidence: 0.86, reasons: ["knowledge_graph_terms"] });
  }

  if (
    (hasAny(normalized, [/图片|图像|海报|配图|生图|改图|image|poster|鍥剧墖|鍥惧儚|娴锋姤|閰嶅浘|鐢熷浘/]) || /那张图|刚才.*图|上一张.*图/.test(text)) &&
    /生成|创建|制作|画|改图|修改|编辑|标题改|generate|create|edit|鐢熸垚|鍒涘缓|鍒朵綔|淇敼|缂栬緫/.test(normalized)
  ) {
    candidates.push({ skillId: "image", confidence: 0.84, reasons: ["image_execution_terms"] });
  }

  if (/论文.*ppt|学术.*ppt|课题.*ppt|申报.*ppt|academic.*ppt|paper.*ppt/i.test(normalized)) {
    candidates.push({ skillId: "academic-ppt", confidence: 0.78, reasons: ["explicit_academic_ppt_terms"] });
  }

  if (/ppt|pptx|幻灯片|课件|演示文稿/i.test(text) && /生成|创建|制作|帮我|给我|做一个|做一份|导出|下载/i.test(text)) {
    candidates.push({ skillId: "ppt-simple", confidence: 0.86, reasons: ["direct_ppt_execution_terms"] });
  }
  if (/excel|xlsx|表格|电子表格/i.test(text) && /生成|创建|导出|下载|保存|整理|修改|帮我|给我/i.test(text)) {
    candidates.push({ skillId: "excel", confidence: 0.86, reasons: ["direct_excel_execution_terms"] });
  }
  if (/word|docx|文档|报告|方案|总结/i.test(text) && /生成|创建|导出|下载|保存|撰写|写一份|帮我|给我/i.test(text)) {
    candidates.push({ skillId: "word", confidence: 0.84, reasons: ["direct_word_execution_terms"] });
  }

  const explicitTool = getExplicitFileGenerationTool(text);
  if (explicitTool === "ppt") candidates.push({ skillId: "ppt-simple", confidence: 0.9, reasons: ["explicit_ppt_output"] });
  if (explicitTool === "excel") candidates.push({ skillId: "excel", confidence: 0.9, reasons: ["explicit_excel_output"] });
  if (explicitTool === "write") candidates.push({ skillId: "word", confidence: 0.9, reasons: ["explicit_word_output"] });

  const legacyTarget = targetFromLegacyTask(legacyTask);
  if (legacyTarget) {
    candidates.push({ skillId: legacyTarget, confidence: legacyTask.confidence, reasons: legacyTask.reasons });
  }

  if (input.files?.length) {
    candidates.push({ skillId: "file-analysis", confidence: 0.72, reasons: ["uploaded_files"] });
  }

  const topCandidates = uniqueTopCandidates(candidates);
  const selected = topCandidates[0] || { skillId: null, confidence: legacyTask.confidence, reasons: ["general_chat"] };
  return {
    selected,
    candidates: topCandidates.length ? topCandidates : [selected]
  };
}
