import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type TaskPayload = {
  status?: string;
  attachments?: Array<{ name?: string; url?: string }>;
};

const baseUrl = process.env.FRONTEND_BASE_URL || "http://localhost:3000";
const username = process.env.FRONTEND_TEST_USERNAME || process.env.ADMIN_USERNAME || "admin";
const password = process.env.FRONTEND_TEST_PASSWORD || process.env.ADMIN_PASSWORD || "Admin123456";

const cases = [
  {
    name: "lesson",
    prompt: "给我一份三维动画教学课程，第一章节动画规律的教案，2课时，授课对象为高职数字媒体专业学生，要求覆盖关键帧、运动规律、缓入缓出、挤压拉伸",
    expected: ["三维动画", "第一章节", "动画规律", "关键帧", "运动规律", "缓入缓出", "挤压拉伸", "教学过程"]
  },
  {
    name: "report",
    prompt: "生成《社区养老服务满意度》调研报告，范围：上门护理、助餐服务、紧急呼叫，面向民政部门，要求包含问题原因和改进建议",
    expected: ["社区养老服务满意度", "上门护理", "助餐服务", "紧急呼叫", "民政部门", "问题原因", "改进建议"]
  },
  {
    name: "proposal",
    prompt: "写一份《校园低碳行动》实施方案，周期3个月，对象为后勤处和学生社团，范围包括节能巡检、旧物回收、低碳宣传，要求列出实施步骤和评价指标",
    expected: ["校园低碳行动", "3个月", "后勤处和学生社团", "节能巡检", "旧物回收", "低碳宣传", "实施步骤", "评价指标"]
  },
  {
    name: "work_summary",
    prompt: "写一份《2026年第一季度客户成功团队工作总结》，面向管理层，范围包括续费跟进、客户培训、工单响应，要求包含成果数据、问题不足、改进措施和下季度计划",
    expected: ["2026年第一季度客户成功团队", "管理层", "续费跟进", "客户培训", "工单响应", "成果数据", "问题不足", "下季度计划"]
  },
  {
    name: "meeting_minutes",
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

function extractStoredZipFile(buffer: Buffer, wantedName: string) {
  let offset = 0;
  while (offset + 30 < buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8");
    const contentStart = nameEnd + extraLength;
    const contentEnd = contentStart + compressedSize;
    if (name === wantedName) {
      assert(method === 0, `${wantedName} is compressed; this smoke parser only supports stored entries.`);
      return buffer.subarray(contentStart, contentEnd).toString("utf8");
    }
    offset = contentEnd;
  }
  return "";
}

function docxTextFromLocalMockUrl(url?: string) {
  const localUrl = url || "";
  assert(localUrl.startsWith("/mock-storage/"), `Expected local mock storage URL, got ${url}`);
  const filePath = resolve(process.cwd(), "public", localUrl.replace(/^\//, ""));
  assert(existsSync(filePath), `Missing generated DOCX: ${filePath}`);
  const xml = extractStoredZipFile(readFileSync(filePath), "word/document.xml");
  assert(xml.includes("<w:document"), `Generated file is not a readable DOCX: ${filePath}`);
  return xml.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await sleep(1500);
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

async function main() {
  const cookie = await login();
  const results: Array<{ name: string; fileName: string; elapsedMs: number; chars: number }> = [];

  for (const item of cases) {
    const startedAt = Date.now();
    const taskId = await createWordTask(cookie, item.prompt);
    const attachment = await pollTask(cookie, taskId);
    const text = docxTextFromLocalMockUrl(attachment.url);
    for (const expected of item.expected) {
      assert(text.includes(expected), `${item.name} DOCX missing ${expected}`);
    }
    assert(!text.includes("NexusAI"), `${item.name} DOCX contains platform signature token.`);
    results.push({ name: item.name, fileName: attachment.name || "", elapsedMs: Date.now() - startedAt, chars: text.length });
  }

  assert(new Set(results.map((item) => item.fileName)).size === results.length, "Generated Word file names should differ.");
  console.log(JSON.stringify({ ok: true, baseUrl, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
