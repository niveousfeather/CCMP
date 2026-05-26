import type { AgentExecutionGate, AgentSkillMatch } from "@/lib/agent/runtime/types";
import type { AgentTask } from "@/lib/agent/types";

const toolSkills = new Set(["file-analysis", "word", "excel", "ppt-simple", "image", "teaching-diagram", "knowledge-graph"]);
const fileGenerationSkills = new Set(["word", "excel", "ppt-simple"]);
const subjectRequiredSkills = new Set(["word", "ppt-simple", "teaching-diagram"]);

function hasExecutionVerb(text: string) {
  return /生成|创建|制作|导出|下载|保存|分析|总结|读取|转换|修改|编辑|改成|改为|换成|标题|构建|帮我|给我|做一个|做一份|继续|继续刚才|再总结|generate|create|make|export|download|analyze|summarize|convert|edit|build/i.test(text);
}

function hasModernChineseExecutionVerb(text: string) {
  return /生成|创建|制作|导出|下载|保存|分析|总结|读取|转换|修改|编辑|整理|做成|新增|增加|整理成|继续|接着写|续写|重试/i.test(text);
}

function isHowToQuestion(text: string) {
  return /怎么|如何|怎样|怎么做|怎么写|怎么制作|怎么生成|解释|介绍|建议|how to|what is/i.test(text);
}

function wantsPlanOnly(text: string) {
  return /不要生成|先给方案|先别生成|先不要生成|只给建议|先讲思路|先给我方案|plan first/i.test(text);
}

function referencesConversationText(text: string) {
  return /上面内容|刚才的总结|前面内容|上述内容|以上内容/i.test(text);
}

function referencesPriorObject(text: string) {
  return /刚才|上一|上一个|上一份|这个文件|这份文件|这个文档|这份文档|这个附件|那张图|这张图|继续/i.test(text);
}

function referencesResumeRequest(text: string) {
  return /继续|继续生成|接着写|续写|重试|继续刚才|继续生成文档/i.test(text);
}

function referencesCurrentFileForWord(text: string) {
  return /这个文件|这份文件|这个文档|这份文档|这个附件|上传资料|上传的资料|根据.*文件|根据.*资料/i.test(text);
}

function referencesCurrentFileForExcel(text: string) {
  return /这个文件|这份文件|上传文件|根据.*文件/i.test(text);
}

function modifiesSpreadsheetFile(text: string) {
  return /这个\s*excel|这份\s*excel|已有\s*excel|excel.*增加|增加.*平均分|新增.*列|导出新版|修改.*excel/i.test(text);
}

function hasSubjectAfterToolMention(text: string, skillId: string | null) {
  const compact = text.replace(/\s+/g, "");
  if (skillId === "ppt-simple") {
    return compact.replace(/帮我|给我|生成|创建|制作|做一个|做一份|继续刚才|10页|ppt|pptx|课件|幻灯片/gi, "").length >= 4;
  }
  if (skillId === "word") {
    return compact.replace(/帮我|给我|生成|创建|写|做一份|word|docx|文档|报告|总结|方案/gi, "").length >= 4;
  }
  if (skillId === "excel") {
    return compact.replace(/帮我|给我|生成|创建|导出|excel|xlsx|表格|数据|成/gi, "").length >= 4;
  }
  if (skillId === "teaching-diagram") {
    return compact.replace(/帮我|给我|生成|创建|教学架构图|教学框架图|教改架构图|架构图|主题是/gi, "").length >= 4;
  }
  return true;
}

function hasInlineDataSource(text: string) {
  return /[:：]\s*\S+/.test(text) || /数据|名单|表格|列表|姓名|成绩|金额|数量|日期|项目/i.test(text);
}

function isVagueClarificationRequest(text: string) {
  return /^(整理一下|帮我弄成正式一点|导出一下)$/i.test(text.trim());
}

function buildMissingInputs(text: string, legacyTask: AgentTask, skillId: string | null, activeTaskKind?: string | null) {
  const missing = new Set<string>(
    legacyTask.missingFields
      .map((field) => String(field))
      .filter((field) => {
        if (field === "fileName" && (skillId === "ppt-simple" || skillId === "word" || skillId === "excel")) return false;
        if ((field === "documentType" || field === "style" || field === "length") && skillId === "excel") return false;
        if ((field === "style" || field === "length") && (skillId === "word" || skillId === "ppt-simple")) return false;
        return true;
      })
  );
  if (skillId === "excel" && activeTaskKind === "file-analysis") missing.delete("file");
  if (skillId === "file-analysis" && activeTaskKind === "file-analysis") missing.delete("file");
  if (skillId === "word" && activeTaskKind === "file-analysis" && referencesCurrentFileForWord(text)) {
    missing.delete("file");
    missing.delete("documentType");
  }
  if (skillId === "word" && hasSubjectAfterToolMention(text, "word")) {
    missing.delete("documentType");
  }
  if (skillId === "word" && referencesConversationText(text)) {
    missing.delete("documentType");
  }
  if (
    skillId &&
    subjectRequiredSkills.has(skillId) &&
    !hasSubjectAfterToolMention(text, skillId) &&
    !(skillId === "word" && referencesCurrentFileForWord(text) && activeTaskKind) &&
    !(skillId === "word" && activeTaskKind === "word" && referencesResumeRequest(text))
  ) {
    missing.add("subject");
  }
  if (skillId === "excel" && /导出|export/i.test(text) && !legacyTask.hasFiles && !hasInlineDataSource(text)) {
    missing.add("data_source");
  }
  if (skillId === "excel" && referencesCurrentFileForExcel(text) && !legacyTask.hasFiles && !activeTaskKind) {
    missing.add("file");
  }
  if (skillId === "excel" && modifiesSpreadsheetFile(text) && !legacyTask.hasFiles) {
    missing.add("spreadsheet_file");
  }
  if ((skillId === "ppt-simple" || skillId === "word" || skillId === "excel" || skillId === "file-analysis") && referencesPriorObject(text) && !referencesConversationText(text) && !legacyTask.hasFiles && !activeTaskKind) {
    missing.add(skillId === "file-analysis" || referencesCurrentFileForWord(text) ? "file" : "active_task");
  }
  const hasEditableImageTask = activeTaskKind === "image" || activeTaskKind === "teaching-diagram";
  if (skillId === "image" && /修改|编辑|改成|改为|换成|标题|刚才|上一张|那张|edit|revise|change/i.test(text) && !legacyTask.hasFiles && !hasEditableImageTask) {
    missing.add("image_to_edit");
  }
  if (!skillId && isVagueClarificationRequest(text)) {
    missing.add(/导出/.test(text) ? "output_format" : "topic");
  }
  if (!skillId && /继续刚才的文档/i.test(text)) {
    missing.add("active_task");
  }
  if (!skillId && !isVagueClarificationRequest(text) && !/继续刚才的文档/i.test(text)) missing.clear();
  missing.delete("outputFormat");
  return Array.from(missing);
}

export function evaluateExecutionGate({
  text,
  legacyTask,
  skillMatch,
  activeTaskKind = null
}: {
  text: string;
  legacyTask: AgentTask;
  skillMatch: AgentSkillMatch;
  activeTaskKind?: string | null;
}): AgentExecutionGate {
  if (wantsPlanOnly(text)) {
    return {
      needsTool: false,
      needsConfirmation: false,
      missingInputs: [],
      allowed: false,
      reasons: ["plan_first_requested", "no_tool_needed"]
    };
  }

  const skillId = skillMatch.skillId;
  const needsTool = Boolean(skillId && toolSkills.has(skillId));
  const executionIntent = hasExecutionVerb(text) || hasModernChineseExecutionVerb(text);
  const advisoryQuestion = isHowToQuestion(text);
  const missingInputs = buildMissingInputs(text, legacyTask, skillId, activeTaskKind);
  const needsClarificationWithoutTool = !needsTool && missingInputs.length > 0;
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
    needsClarificationWithoutTool ||
    (needsTool &&
      (confidenceNeedsConfirmation ||
        (!executionIntent && skillId !== "file-analysis") ||
        (advisoryQuestion && fileGenerationSkills.has(String(skillId))) ||
        missingInputs.length > 0));

  return {
    needsTool,
    needsConfirmation,
    missingInputs,
    allowed: needsTool && !needsConfirmation && missingInputs.length === 0,
    reasons
  };
}
