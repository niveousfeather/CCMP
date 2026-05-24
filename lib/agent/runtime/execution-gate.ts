import type { AgentExecutionGate, AgentSkillMatch } from "@/lib/agent/runtime/types";
import type { AgentTask } from "@/lib/agent/types";

const toolSkills = new Set(["file-analysis", "word", "excel", "ppt-simple", "image", "teaching-diagram", "knowledge-graph"]);
const fileGenerationSkills = new Set(["word", "excel", "ppt-simple"]);
const subjectRequiredSkills = new Set(["word", "ppt-simple", "teaching-diagram"]);

function hasExecutionVerb(text: string) {
  return /生成|创建|制作|导出|下载|保存|分析|总结|读取|转换|修改|编辑|改成|改为|换成|标题改|画|构建|帮我|给我|做一个|做一份|generate|create|make|export|download|analyze|summarize|convert|edit|build|鐢熸垚|鍒涘缓|鍒朵綔|瀵煎嚭|涓嬭浇|淇濆瓨|鍒嗘瀽|鎬荤粨|璇诲彇|杞崲|淇敼|缂栬緫/i.test(text);
}

function isHowToQuestion(text: string) {
  return /怎么|如何|怎样|怎么做|怎么写|怎么制作|怎么生成|how to|what is|介绍一下|讲讲|解释|建议|鎬庝箞|濡備綍/i.test(text);
}

function hasSubjectAfterToolMention(text: string, skillId: string | null) {
  const compact = text.replace(/\s+/g, "");
  if (skillId === "ppt-simple") {
    return compact.replace(/帮我|给我|生成|创建|制作|做一个|做一份|10页|ppt|pptx|PPT|课件|幻灯片/g, "").length >= 4;
  }
  if (skillId === "word") {
    return compact.replace(/帮我|给我|生成|创建|写|做一份|word|docx|文档|报告|总结|方案/g, "").length >= 4;
  }
  if (skillId === "excel") {
    return compact.replace(/帮我|给我|生成|创建|导出|excel|xlsx|表格|数据|成/g, "").length >= 4;
  }
  if (skillId === "teaching-diagram") {
    return compact.replace(/帮我|给我|生成|创建|教学架构图|教学框架图|教改架构图|架构图/g, "").length >= 4;
  }
  return true;
}

function hasInlineDataSource(text: string) {
  return /[:：]\s*\S+/.test(text) || /数据|名单|表格|列表|姓名|成绩|金额|数量|日期|项目/i.test(text);
}

function buildMissingInputs(text: string, legacyTask: AgentTask, skillId: string | null, hasActiveTask?: boolean) {
  const missing = new Set<string>(
    legacyTask.missingFields
      .map((field) => String(field))
      .filter((field) => {
        if (field === "fileName" && (skillId === "ppt-simple" || skillId === "word" || skillId === "excel")) return false;
        if ((field === "style" || field === "length") && (skillId === "word" || skillId === "ppt-simple")) return false;
        return true;
      })
  );
  if (skillId && subjectRequiredSkills.has(skillId) && !hasSubjectAfterToolMention(text, skillId)) missing.add("subject");
  if (skillId === "excel" && /导出|export/i.test(text) && !legacyTask.hasFiles && !hasInlineDataSource(text)) {
    missing.add("data_source");
  }
  if (skillId === "image" && /修改|编辑|改成|改为|换成|标题|刚才|上一张|那张|edit|revise|change/i.test(text) && !legacyTask.hasFiles && !hasActiveTask) {
    missing.add("image_to_edit");
  }
  if (skillId === "image" && /改|修改|编辑|标题改|edit/i.test(text) && !legacyTask.hasFiles && !hasActiveTask && !/刚才|上一张|那张|current|previous/i.test(text)) {
    missing.add("image_to_edit");
  }
  return Array.from(missing);
}

export function evaluateExecutionGate({
  text,
  legacyTask,
  skillMatch,
  hasActiveTask = false
}: {
  text: string;
  legacyTask: AgentTask;
  skillMatch: AgentSkillMatch;
  hasActiveTask?: boolean;
}): AgentExecutionGate {
  const skillId = skillMatch.skillId;
  const needsTool = Boolean(skillId && toolSkills.has(skillId));
  const executionIntent = hasExecutionVerb(text);
  const advisoryQuestion = isHowToQuestion(text);
  const missingInputs = buildMissingInputs(text, legacyTask, skillId, hasActiveTask);
  const reasons: string[] = [];

  if (needsTool) reasons.push(`skill:${skillId}`);
  if (!needsTool) reasons.push("no_tool_needed");
  if (skillMatch.confidence < 0.7) reasons.push("low_skill_confidence");
  if (advisoryQuestion && fileGenerationSkills.has(String(skillId))) reasons.push("advisory_question");
  if (!executionIntent && needsTool) reasons.push("no_clear_execution_intent");
  if (missingInputs.length) reasons.push("missing_inputs");
  if (legacyTask.type === "clarify") reasons.push("legacy_clarify");

  const confidenceNeedsConfirmation = skillId === "file-analysis" ? skillMatch.confidence < 0.6 : skillMatch.confidence < 0.78;
  const needsConfirmation =
    needsTool &&
    (confidenceNeedsConfirmation ||
      (!executionIntent && skillId !== "file-analysis") ||
      (advisoryQuestion && fileGenerationSkills.has(String(skillId))) ||
      missingInputs.length > 0);

  return {
    needsTool,
    needsConfirmation,
    missingInputs,
    allowed: needsTool && !needsConfirmation && missingInputs.length === 0,
    reasons
  };
}
