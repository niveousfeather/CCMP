import { prisma } from "@/lib/db";
import { parseDocxPackage } from "@/lib/document/docx-package";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type TaskPayload = {
  attachments?: Array<{ name?: string; url?: string }>;
  failureReason?: string | null;
  status?: string;
};

type AcceptanceCase = {
  expected: string[];
  name: string;
  prompt: string;
  typeLabel: string;
};

const baseUrl = process.env.FRONTEND_BASE_URL || "http://localhost:3000";
const username = process.env.FRONTEND_TEST_USERNAME || process.env.ADMIN_USERNAME || "admin";
const password = process.env.FRONTEND_TEST_PASSWORD || process.env.ADMIN_PASSWORD || "Admin123456";

const cases: AcceptanceCase[] = [
  {
    name: "lesson_plan",
    typeLabel: "教案",
    prompt: "给我一份三维动画教学课程，第一章节动画规律的教案，2课时，授课对象为高职数字媒体专业学生，要求覆盖关键帧、运动规律、缓入缓出、挤压拉伸",
    expected: ["三维动画", "第一章节", "动画规律", "关键帧", "运动规律", "缓入缓出", "挤压拉伸", "教学过程"]
  },
  {
    name: "report",
    typeLabel: "报告",
    prompt: "生成《社区养老服务满意度》调研报告，范围：上门护理、助餐服务、紧急呼叫，面向民政部门，要求包含问题原因和改进建议",
    expected: ["社区养老服务满意度", "上门护理", "助餐服务", "紧急呼叫", "民政部门", "问题原因", "改进建议"]
  },
  {
    name: "proposal",
    typeLabel: "方案",
    prompt: "写一份《校园低碳行动》实施方案，周期3个月，对象为后勤处和学生社团，范围包括节能巡检、旧物回收、低碳宣传，要求列出实施步骤和评价指标",
    expected: ["校园低碳行动", "3个月", "后勤处和学生社团", "节能巡检", "旧物回收", "低碳宣传", "实施步骤", "评价指标"]
  },
  {
    name: "work_summary",
    typeLabel: "工作总结",
    prompt: "写一份《2026年第一季度客户成功团队工作总结》，面向管理层，范围包括续费跟进、客户培训、工单响应，要求包含成果数据、问题不足、改进措施和下季度计划",
    expected: ["2026年第一季度客户成功团队", "管理层", "续费跟进", "客户培训", "工单响应", "成果数据", "问题不足", "下季度计划"]
  },
  {
    name: "meeting_minutes",
    typeLabel: "会议纪要",
    prompt: "整理一份《产品例会》会议纪要，会议时间2026年5月10日，参会对象为产品部、研发部和运营部，议题包括新版首页上线、数据看板权限、用户反馈闭环，要求列出决议事项、待办任务、责任人与截止时间",
    expected: ["产品例会", "2026年5月10日", "产品部", "研发部", "运营部", "新版首页上线", "数据看板权限", "用户反馈闭环", "责任人", "截止时间"]
  }
];

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function cookiePair(setCookie: string | null) {
  return String(setCookie || "").split(";")[0];
}

function localDocxPath(url?: string) {
  const localUrl = url || "";
  assert(localUrl.startsWith("/mock-storage/"), `Expected local mock storage URL, got ${url}`);
  const filePath = resolve(process.cwd(), "public", localUrl.replace(/^\//, ""));
  assert(existsSync(filePath), `Missing generated DOCX: ${filePath}`);
  return filePath;
}

async function docxBufferFromAttachment(attachment: { name?: string; url?: string }) {
  const rawUrl = attachment.url || "";
  if (rawUrl.startsWith("/mock-storage/")) return readFileSync(localDocxPath(rawUrl));
  assert(rawUrl.startsWith("http://") || rawUrl.startsWith("https://"), `Unsupported DOCX URL: ${rawUrl}`);
  const response = await fetch(rawUrl);
  assert(response.ok, `Failed to download generated DOCX ${response.status}: ${rawUrl}`);
  return Buffer.from(await response.arrayBuffer());
}

function docxTextFromBuffer(buffer: Buffer) {
  const xml = parseDocxPackage(buffer).getText("word/document.xml") || "";
  assert(xml.includes("<w:document"), "Generated file is not a readable DOCX.");
  return xml.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
}

function getDocxXml(buffer: Buffer) {
  return parseDocxPackage(buffer).getText("word/document.xml") || "";
}

function countOccurrences(text: string, pattern: RegExp) {
  return (text.match(pattern) || []).length;
}

const ACCEPTANCE_SYNONYMS = [
  ["问题原因", "原因分析", "成因分析", "问题成因"],
  ["改进建议", "优化建议", "建议方案", "改善措施"],
  ["实施步骤", "执行步骤", "推进步骤", "实施路径"],
  ["评价指标", "评价标准", "验收标准", "考核指标"],
  ["成果数据", "成果与数据", "关键成果", "量化成果", "数据成果"],
  ["下季度计划", "下一步计划", "后续计划"],
  ["问题不足", "不足", "问题与不足"]
];

function compactAcceptanceText(value: string) {
  return value.replace(/\s+/g, "").replace(/[，。；、,.!?！？:："'“”《》]/g, "");
}

function containsExpectedTerm(text: string, expected: string) {
  if (text.includes(expected)) return true;
  const group = ACCEPTANCE_SYNONYMS.find((items) => items.includes(expected));
  if (group?.some((item) => text.includes(item))) return true;
  const parts = expected
    .split(/[、,，/；;]|\s*(?:和|与)\s*/u)
    .map((item) => compactAcceptanceText(item))
    .filter((item) => item.length >= 2);
  if (parts.length >= 2) {
    const compactText = compactAcceptanceText(text);
    const hits = parts.filter((part) => compactText.includes(part)).length;
    return hits >= Math.ceil(parts.length * 0.75);
  }
  return false;
}

function parseMetadata(value?: string | null) {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function login() {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const text = await response.text();
  assert(response.status === 200, `Login failed ${response.status}: ${text}`);
  const cookie = cookiePair(response.headers.get("set-cookie"));
  assert(cookie, "Missing session cookie after login.");
  return cookie;
}

async function createWordTask(cookie: string, prompt: string) {
  const response = await fetch(`${baseUrl}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      mode: "agent",
      conversationId: null,
      model: "gpt-5.4",
      messages: [{ role: "user", content: prompt }],
      tools: { webSearch: false, contentMode: "write" }
    })
  });
  const payload = await response.json().catch(async () => ({ raw: await response.text() }));
  assert(response.status === 200, `Create failed ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  const taskId = payload.assistantMessage?.pendingFileGeneration?.taskId;
  assert(taskId, `Expected pending Word generation task: ${JSON.stringify(payload).slice(0, 500)}`);
  return taskId as string;
}

async function pollTask(cookie: string, taskId: string) {
  let task: TaskPayload | null = null;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    await sleep(2500);
    const response = await fetch(`${baseUrl}/api/ai/chat/tasks/${encodeURIComponent(taskId)}`, { headers: { Cookie: cookie } });
    const payload = await response.json().catch(async () => ({ raw: await response.text() }));
    assert(response.status === 200, `Poll failed ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    task = payload.task;
    if (task?.status === "completed" || task?.status === "failed") break;
  }
  assert(task?.status === "completed", `Task did not complete: ${JSON.stringify(task).slice(0, 800)}`);
  const attachments = task.attachments || [];
  assert(attachments[0]?.name?.endsWith(".docx"), `Missing DOCX attachment: ${JSON.stringify(task).slice(0, 800)}`);
  return attachments[0];
}

async function getTaskMetadata(taskId: string) {
  const message = await prisma.chatMessage.findUnique({
    where: { id: taskId },
    select: { metadata: true }
  });
  return parseMetadata(message?.metadata);
}

function assessDocument(item: AcceptanceCase, text: string, xml: string) {
  const missing = item.expected.filter((expected) => !containsExpectedTerm(text, expected));
  const tableCount = countOccurrences(xml, /<w:tbl>/g);
  const headingCount = countOccurrences(xml, /w:pStyle w:val="Heading1"/g);
  const numberedCount = countOccurrences(xml, /<w:numId w:val="[2-9]\d*"/g);
  const hasPlatformSignature = /NexusAI|Generated by NexusAI/i.test(text);
  const templateSmells = ["待补充", "本部分用于补充", "请根据", "相关要求", "核心内容", "关键任务"].filter((term) => text.includes(term));
  const advantages = [
    missing.length === 0 ? "核心主题和用户约束均已覆盖" : "",
    tableCount > 0 ? `包含 ${tableCount} 个表格或结构化表` : "",
    headingCount >= 4 ? "一级标题层级清楚" : "",
    !hasPlatformSignature ? "未出现平台署名" : ""
  ].filter(Boolean);
  const problems = [
    ...missing.map((term) => `缺少关键词：${term}`),
    tableCount === 0 ? "缺少表格或结构化块" : "",
    headingCount < 4 ? "一级章节数量偏少" : "",
    numberedCount > 30 ? "编号段落数量偏多，需要检查是否有连续编号感" : "",
    hasPlatformSignature ? "出现平台署名" : "",
    ...templateSmells.map((term) => `疑似模板词：${term}`)
  ].filter(Boolean);
  return {
    advantages,
    directlyDeliverable: problems.length === 0,
    headingCount,
    numberedCount,
    problems,
    tableCount
  };
}

async function main() {
  const cookie = await login();
  const results = [];

  for (const item of cases) {
    const startedAt = Date.now();
    const taskId = await createWordTask(cookie, item.prompt);
    const attachment = await pollTask(cookie, taskId);
    const elapsedMs = Date.now() - startedAt;
    const buffer = await docxBufferFromAttachment(attachment);
    const text = docxTextFromBuffer(buffer);
    const xml = getDocxXml(buffer);
    const metadata = await getTaskMetadata(taskId);
    const assessment = assessDocument(item, text, xml);
    results.push({
      ...item,
      assessment,
      elapsedMs,
      fallbackUsed: metadata.fallbackUsed,
      fileName: attachment.name || "",
      modelUsed: metadata.modelUsed,
      providerUsed: metadata.providerUsed,
      routeReason: metadata.routeReason
    });
  }

  mkdirSync(resolve(process.cwd(), "docs"), { recursive: true });
  const report = [
    "# Word Generation Acceptance",
    "",
    `Generated at: ${new Date().toISOString()}`,
    `Frontend base URL: ${baseUrl}`,
    "",
    "## Summary",
    "",
    `- Cases: ${results.length}`,
    `- Remote primary success: ${results.filter((item) => item.providerUsed === "subrouter" && item.fallbackUsed === false).length}/${results.length}`,
    `- Any fallback used: ${results.filter((item) => item.fallbackUsed === true || String(item.routeReason || "").includes("fallback")).length}/${results.length}`,
    `- Directly deliverable: ${results.filter((item) => item.assessment.directlyDeliverable).length}/${results.length}`,
    "",
    "## Results",
    "",
    ...results.flatMap((item, index) => [
      `### ${index + 1}. ${item.typeLabel}`,
      "",
      `- Test prompt: ${item.prompt}`,
      `- File name: ${item.fileName}`,
      `- Actual model: ${String(item.providerUsed || "unknown")}:${String(item.modelUsed || "unknown")}`,
      `- Fallback triggered: ${item.fallbackUsed === true || String(item.routeReason || "").includes("fallback") ? "yes" : "no"}`,
      `- Route reason: ${String(item.routeReason || "-")}`,
      `- Elapsed: ${item.elapsedMs} ms`,
      `- Tables: ${item.assessment.tableCount}`,
      `- Heading1 count: ${item.assessment.headingCount}`,
      `- Numbered paragraphs: ${item.assessment.numberedCount}`,
      `- Advantages: ${item.assessment.advantages.join("; ") || "none"}`,
      `- Problems: ${item.assessment.problems.join("; ") || "none"}`,
      `- Directly deliverable: ${item.assessment.directlyDeliverable ? "yes" : "needs review"}`,
      `- Next module to fix: ${item.assessment.directlyDeliverable ? "Continue upload-docx modification acceptance and visual polish checks." : "WordDocumentPlan/quality repair for the listed problems."}`,
      ""
    ]),
    "## Upload DOCX Modification Acceptance",
    "",
    "Pending in this run. The next acceptance pass should upload generated/source DOCX files and verify title edits, section expansion, paragraph-to-table conversion, comment-based edits, and original-format preservation.",
    ""
  ].join("\n");
  writeFileSync(resolve(process.cwd(), "docs", "WORD_GENERATION_ACCEPTANCE.md"), report, "utf8");
  console.log(JSON.stringify({ ok: true, baseUrl, report: "docs/WORD_GENERATION_ACCEPTANCE.md", results: results.map((item) => ({ name: item.name, fileName: item.fileName, model: `${item.providerUsed}:${item.modelUsed}`, fallbackUsed: item.fallbackUsed, elapsedMs: item.elapsedMs, directlyDeliverable: item.assessment.directlyDeliverable })) }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
