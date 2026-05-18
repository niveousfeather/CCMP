import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label}: missing ${needle}`);
  }
}

function assertNotIncludes(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`${label}: should not include ${needle}`);
  }
}

const chatRoute = read("app/api/ai/chat/route.ts");
const chatPage = read("components/chat/chat-page.tsx");
const chatData = read("components/chat/chat-data.ts");
const chatMessage = read("components/chat/chat-message.tsx");
const chatThread = read("components/chat/chat-thread.tsx");
const conversationList = read("components/chat/conversation-list.tsx");
const asyncTasks = read("lib/agent/async-tasks.ts");
const agentRouter = read("lib/agent/router.ts");
const taskRouter = read("lib/agent/task-router.ts");
const taskIntents = read("lib/agent/task-intents.ts");
const taskStatusRoute = read("app/api/ai/chat/tasks/[id]/route.ts");
const reliability = read("lib/agent/reliability.ts");
const docxRenderer = read("lib/document/create.ts");
const markdownParser = read("lib/document/markdown.ts");
const presentationSkill = read("lib/agent/skills/create-presentation.ts");
const localPresentationProvider = read("lib/presentation/providers/local.ts");
const fileGenerationPipelineTest = read("scripts/test-file-generation-pipeline.mjs");
const taskIntentTest = read("scripts/test-task-intents.mjs");

assertIncludes(chatRoute, "enqueueAgentChatTask", "chat route should enqueue async agent tasks");
assertIncludes(chatRoute, "asyncTask", "chat route should persist async task metadata");
assertIncludes(chatRoute, "pendingFileGeneration", "chat route should return pending file metadata");
assertIncludes(chatRoute, "getAsyncAgentTaskPlan", "chat route should plan both file and non-file async tasks");
assertIncludes(chatRoute, "pendingAgentTask", "chat route should return generic pending agent task metadata");
assertIncludes(chatRoute, "shouldUseFastChatRoute", "chat route should keep simple chat on the fast GPT route");
assertIncludes(taskIntents, "OUTPUT_INTENT_VERBS", "task intents should centralize output verbs");
assertIncludes(taskIntents, "PRESENTATION_TARGET_TERMS", "task intents should centralize PPT targets");
assertIncludes(taskIntents, "WORD_TARGET_TERMS", "task intents should centralize Word targets");
assertIncludes(taskIntents, "LESSON_PLAN_TARGET_TERMS", "task intents should centralize lesson-plan targets");
assertIncludes(taskIntents, "getExplicitFileGenerationTool", "task intents should provide a single file-generation classifier");
assertIncludes(taskIntents, "isFunctionalArtifactTask", "task intents should provide a single functional artifact classifier");
assertIncludes(taskIntentTest, "教案怎么写", "task intents behavior tests should protect lesson-plan questions from async routing");
assertIncludes(taskRouter, "isFunctionalArtifactTask", "task router should use the shared task intent classifier");
assertIncludes(taskRouter, "isFunctionalAgentTask", "task router should identify only artifact/function requests");
assertNotIncludes(taskRouter, "FUNCTION_TASK_HINT_PATTERN", "task router should not keep duplicated output regexes");
assertNotIncludes(taskRouter, "LESSON_PLAN_TASK_HINT_PATTERN", "task router should not keep duplicated lesson-plan regexes");
assertIncludes(taskIntents, "做一个", "task intents should treat 做一个/做一份 PPT as an artifact request");
assertIncludes(agentRouter, "做一个", "agent router should classify 做一个 PPT as create_presentation");
assertIncludes(taskIntents, "教案", "task intents should recognize generated lesson plans as Word tasks");
assertIncludes(agentRouter, "getExplicitFileGenerationTool", "agent router should use centralized task intent routing");
assertNotIncludes(agentRouter, "hasExplicitLessonPlanOutputIntent", "agent router should not keep duplicated lesson-plan output regexes");
assertNotIncludes(agentRouter, "hasExplicitPresentationOutputIntent", "agent router should not keep duplicated PPT output regexes");
assertNotIncludes(agentRouter, "hasExplicitWordOutputIntent", "agent router should not keep duplicated Word output regexes");
assertIncludes(reliability, "getExplicitFileGenerationTool", "frontend reliability should use centralized task intent routing");
assertNotIncludes(reliability, ".{0,48}", "frontend reliability should not duplicate intent regex windows");
assertNotIncludes(reliability, ".{0,64}", "frontend reliability should not duplicate intent regex windows");
assertNotIncludes(taskRouter, "tools?.webSearch || tools?.contentMode", "task router should not send web search chat to the async agent");
assertNotIncludes(taskRouter, "联网|搜索|", "task router should not treat search wording as a functional file task");
assertNotIncludes(taskRouter, 'task.operation !== "answer"', "task router should keep text writing and research chat on GPT-5.4");
assertNotIncludes(taskRouter, "task.documentType || task.transformMode", "task router should not send text-only writing hints to the async agent");
assertIncludes(chatPage, "/api/ai/chat/tasks/", "chat page should poll async task status");
assertIncludes(chatPage, "pendingFileTaskIds", "chat page should discover pending file tasks");
assertIncludes(chatPage, "pendingAgentTaskIds", "chat page should discover pending non-file agent tasks");
assertIncludes(chatPage, "message.pendingAgentTask?.taskId", "chat page should track generic task ids");
assertIncludes(chatMessage, "Nexus AI 正在联网搜索", "chat message should describe web work as Nexus AI activity");
assertIncludes(chatMessage, "Nexus AI 正在生成", "chat message should describe file work as Nexus AI activity");
assertNotIncludes(chatMessage, "后台任务", "chat message should not expose backend task wording");
assertNotIncludes(chatMessage, "任务处理中", "chat message should not expose generic task-processing wording");
assertIncludes(chatData, '"failed"', "chat data should model failed pending file tasks");
assertIncludes(chatData, "pendingAgentTask", "chat data should model pending non-file agent tasks");
assertIncludes(asyncTasks, "requiresGeneratedFile", "async runner should distinguish file tasks from text-only tasks");
assertIncludes(asyncTasks, "saveGeneratedFiles", "async runner should persist generated PPT/Word attachments");
assertIncludes(asyncTasks, "completed = requiresGeneratedFile ? result.generatedFiles.length > 0", "file tasks should only complete after a generated file exists");
assertIncludes(fileGenerationPipelineTest, "buildFallbackWordMarkdown", "file generation pipeline tests should cover Word local fallback");
assertIncludes(fileGenerationPipelineTest, "DOCX buffer should be non-empty", "file generation pipeline tests should generate a local DOCX");
assertIncludes(fileGenerationPipelineTest, "PPTX buffer should be non-empty", "file generation pipeline tests should generate a local PPTX");
assertIncludes(fileGenerationPipelineTest, "Completed file tasks should require attachments", "file generation pipeline tests should lock polling attachment semantics");
assertIncludes(taskStatusRoute, "webContext", "task polling should return web context for completed async answers");
assertIncludes(taskStatusRoute, "attachments,", "task polling should return generated file attachments");
assertIncludes(chatPage, "attachments: data.task!.attachments || []", "chat page should attach generated PPT/Word files after polling");
assertIncludes(chatPage, "pendingFileGeneration: null", "chat page should clear the pending file card after generated files arrive");
assertIncludes(chatMessage, "\\.(docx?|pptx?|xlsx?|csv|pdf)$", "chat message should treat PPTX attachments as generated files");
assertIncludes(agentRouter, "routeReason: \"fast_chat:gpt_5_4\"", "agent router should keep simple chat on the fast GPT route");
assertIncludes(agentRouter, "const fastWebContext = shouldRunWebContext(userText, tools)", "agent router should let GPT-5.4 answer web-search chat");
assertIncludes(agentRouter, "timeZone: \"Asia/Shanghai\"", "agent router should inject current local date into GPT-5.4 chat context");
assertIncludes(agentRouter, "我是 NexusAI 智能体。", "agent router should force identity questions to answer as NexusAI only");
assertIncludes(agentRouter, "不要回答知识库日期", "agent router should suppress knowledge cutoff answers");
assertNotIncludes(agentRouter, "NexusAI 演示文稿", "agent router should not use platform-branded fallback presentation titles");
assertIncludes(agentRouter, "const answer = await callPrimaryWithFallback", "agent router should use task primary/fallback models for non-fast tasks");
assertIncludes(agentRouter, "collectFileContextWithKimi", "agent router should isolate Kimi file understanding");
assertIncludes(agentRouter, "collectWebContextForTask", "agent router should isolate web context collection for the task model");
assertIncludes(agentRouter, "fetchWebContextResult(webQuery, { summarize: false })", "agent router should let the background task model synthesize raw web context");
assertIncludes(agentRouter, "PPT research: collect teaching/report facts", "PPT research should expand the web query for richer slide content");
assertIncludes(agentRouter, "collectAgentTaskContext", "agent router should build task context through an orchestrator");
assertIncludes(agentRouter, "Promise.all([fileContextPromise, webContextPromise])", "agent router should collect file and web context in parallel");
assertIncludes(agentRouter, "agentTask.type === \"create_presentation\"", "PPT generation should trigger research context automatically");
assertIncludes(agentRouter, "presentation_research", "PPT generation should mark automatic research context collection");
assertIncludes(agentRouter, "renderGeneratedFileLocally", "agent router should keep final Word/PPT rendering in local file engines");
assertIncludes(agentRouter, "documentTypeMatchesFileName", "agent router should keep document type matching as diagnostics only");
assertNotIncludes(agentRouter, "matchesDocumentType &&", "agent router should not fail generated Word files just because file name lacks a document type label");
assertIncludes(chatRoute, '"Nexus AI"', "agent chat route should use the unified frontend model label");
assertNotIncludes(chatRoute, "Nexus PPT.pptx", "chat route should not use platform-branded pending PPT filenames");
assertNotIncludes(chatRoute, "Nexus Word.docx", "chat route should not use platform-branded pending Word filenames");
assertNotIncludes(chatPage, "Nexus PPT.pptx", "chat page should not use platform-branded pending PPT filenames");
assertNotIncludes(chatPage, "Nexus Word.docx", "chat page should not use platform-branded pending Word filenames");
assertNotIncludes(agentRouter, "nexusai-file", "agent router should not use platform-branded fallback file names");

for (const [name, source] of [
  ["lib/document/create.ts", docxRenderer],
  ["lib/document/markdown.ts", markdownParser],
  ["lib/agent/skills/create-presentation.ts", presentationSkill],
  ["lib/presentation/providers/local.ts", localPresentationProvider]
]) {
  assertNotIncludes(source, "由 NexusAI 智能文档模块生成", `${name} should not stamp generated-by platform text into Office files`);
  assertNotIncludes(source, "Generated by NexusAI", `${name} should not add generated-by subtitles`);
  assertNotIncludes(source, "NexusAI /", `${name} should not add platform footers`);
  assertNotIncludes(source, "Application>NexusAI", `${name} should not add platform app metadata`);
  assertNotIncludes(source, "creator>NexusAI", `${name} should not add platform creator metadata`);
  assertNotIncludes(source, "lastModifiedBy>NexusAI", `${name} should not add platform modifier metadata`);
}

for (const [name, source] of [
  ["components/chat/chat-data.ts", chatData],
  ["components/chat/chat-message.tsx", chatMessage],
  ["components/chat/chat-page.tsx", chatPage],
  ["components/chat/chat-thread.tsx", chatThread],
  ["components/chat/conversation-list.tsx", conversationList]
]) {
  assertNotIncludes(source, "NexusAI Agent", `${name} should hide legacy agent label`);
  assertNotIncludes(source, "Nexus Agent", `${name} should use Nexus AI as the display name`);
}

console.log(JSON.stringify({ ok: true }, null, 2));
