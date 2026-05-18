import { prisma } from "@/lib/db";
import { parseDocxPackage } from "@/lib/document/docx-package";
import { makeZip } from "@/lib/document/zip";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

type TaskPayload = {
  attachments?: Array<{ name?: string; url?: string }>;
  failureReason?: string | null;
  status?: string;
};

type UploadAcceptanceCase = {
  expected: string[];
  fileName: string;
  name: string;
  prompt: string;
  source: "plain" | "comments";
};

const baseUrl = process.env.FRONTEND_BASE_URL || "http://localhost:3000";
const username = process.env.FRONTEND_TEST_USERNAME || process.env.ADMIN_USERNAME || "admin";
const password = process.env.FRONTEND_TEST_PASSWORD || process.env.ADMIN_PASSWORD || "Admin123456";
const fixtureDir = resolve(process.cwd(), "tmp", "word-upload-acceptance");
const reportPath = resolve(process.cwd(), "docs", "WORD_GENERATION_ACCEPTANCE.md");

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function cookiePair(setCookie: string | null) {
  return String(setCookie || "").split(";")[0];
}

function paragraph(text: string, style?: string) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function plainFixtureBuffer() {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraph("旧标题：社区活动方案", "Title")}
    ${paragraph("一、活动背景", "Heading1")}
    ${paragraph("社区希望提升居民参与度，目前活动通知分散、志愿者分工不清。")}
    ${paragraph("二、执行安排", "Heading1")}
    ${paragraph("报名、物资、宣传需要进一步梳理。")}
    ${paragraph("三、反馈方式", "Heading1")}
    ${paragraph("活动结束后收集居民意见。")}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
  </w:body>
</w:document>`;

  return makeZip([
    {
      name: "[Content_Types].xml",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
    },
    {
      name: "_rels/.rels",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
    },
    {
      name: "word/_rels/document.xml.rels",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
    },
    { name: "word/document.xml", content: documentXml }
  ]);
}

function commentsFixtureBuffer() {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraph("项目周报", "Title")}
    <w:p>
      <w:pPr><w:pStyle w:val="Normal"/></w:pPr>
      <w:commentRangeStart w:id="0"/>
      <w:r><w:t>本周完成了部分工作，表达比较口语。</w:t></w:r>
      <w:commentRangeEnd w:id="0"/>
      <w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>
    </w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
  </w:body>
</w:document>`;
  const commentsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="0" w:author="Reviewer"><w:p><w:r><w:t>请改成正式汇报语气，并补充结果导向。</w:t></w:r></w:p></w:comment>
</w:comments>`;

  return makeZip([
    {
      name: "[Content_Types].xml",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>'
    },
    {
      name: "_rels/.rels",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
    },
    {
      name: "word/_rels/document.xml.rels",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>'
    },
    { name: "word/document.xml", content: documentXml },
    { name: "word/comments.xml", content: commentsXml }
  ]);
}

const cases: UploadAcceptanceCase[] = [
  {
    name: "title_edit_preserve_format",
    fileName: "community-plan-source.docx",
    prompt: "请在原文档基础上修改并保留原格式：把标题改为“社区志愿服务活动实施方案”。",
    source: "plain",
    expected: ["社区志愿服务活动实施方案"]
  },
  {
    name: "section_expansion_preserve_format",
    fileName: "community-plan-source.docx",
    prompt: "请在原文档基础上修改并保留原格式：扩写“执行安排”这一节，补充报名分组、物资准备、宣传节奏和现场协调。",
    source: "plain",
    expected: ["报名分组", "物资准备", "宣传节奏", "现场协调"]
  },
  {
    name: "paragraph_to_table_preserve_format",
    fileName: "community-plan-source.docx",
    prompt: "请在原文档基础上修改并保留原格式：把“执行安排”段落改成表格形式，包含事项、负责人、时间节点。",
    source: "plain",
    expected: ["事项", "负责人", "时间节点"]
  },
  {
    name: "comment_revision",
    fileName: "commented-weekly-report.docx",
    prompt: "请根据 Word 批注修改正文。",
    source: "comments",
    expected: ["正式", "结果"]
  }
];

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

async function ensureFixtures() {
  await rm(fixtureDir, { recursive: true, force: true });
  await mkdir(fixtureDir, { recursive: true });
  const plainPath = resolve(fixtureDir, "community-plan-source.docx");
  const commentsPath = resolve(fixtureDir, "commented-weekly-report.docx");
  writeFileSync(plainPath, plainFixtureBuffer());
  writeFileSync(commentsPath, commentsFixtureBuffer());
  return {
    plain: plainPath,
    comments: commentsPath
  };
}

async function createUploadTask(cookie: string, item: UploadAcceptanceCase, filePath: string) {
  const form = new FormData();
  form.set("mode", "agent");
  form.set("conversationId", "");
  form.set("model", "gpt-5.4");
  form.set("messages", JSON.stringify([{ role: "user", content: item.prompt }]));
  form.set("tools", JSON.stringify({ webSearch: false, contentMode: "write" }));
  form.append(
    "files",
    new File([readFileSync(filePath)], item.fileName, {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    })
  );

  const response = await fetch(`${baseUrl}/api/ai/chat`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form
  });
  const payload = await response.json().catch(async () => ({ raw: await response.text() }));
  assert(response.status === 200, `Create upload task failed ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  const taskId = payload.assistantMessage?.pendingFileGeneration?.taskId;
  assert(taskId, `Expected pending Word upload task: ${JSON.stringify(payload).slice(0, 500)}`);
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

function docxTextAndXml(buffer: Buffer) {
  const xml = parseDocxPackage(buffer).getText("word/document.xml") || "";
  assert(xml.includes("<w:document"), "Generated file is not a readable DOCX.");
  const text = xml.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
  return { text, xml };
}

function writeUploadAcceptanceReport(results: Array<Record<string, unknown>>) {
  const summary = [
    "## Upload DOCX Modification Acceptance",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "### Summary",
    "",
    `- Cases: ${results.length}`,
    `- Deliverable now: ${results.filter((item) => item.deliverable === true).length}/${results.length}`,
    `- Original-format route exercised: ${results.filter((item) => String(item.routeReason || "").includes("revise_original")).length}/${results.length}`,
    `- Comment-revision route exercised: ${results.filter((item) => String(item.routeReason || "").includes("revise_comments")).length}/${results.length}`,
    "",
    "### Results",
    "",
    ...results.flatMap((item, index) => [
      `#### ${index + 1}. ${String(item.name)}`,
      "",
      `- Test prompt: ${String(item.prompt)}`,
      `- Source file: ${String(item.sourceFileName || item.fileName)}`,
      `- Output file: ${String(item.outputFileName || "")}`,
      `- Actual model: ${String(item.providerUsed || "unknown")}:${String(item.modelUsed || "unknown")}`,
      `- Fallback triggered: ${item.fallbackUsed === true || String(item.routeReason || "").includes("fallback") ? "yes" : "no"}`,
      `- Route reason: ${String(item.routeReason || "-")}`,
      `- Elapsed: ${String(item.elapsedMs)} ms`,
      `- Expected terms missing: ${Array.isArray(item.missing) && item.missing.length ? item.missing.join("、") : "none"}`,
      `- Table present: ${item.hasTable === true ? "yes" : "no"}`,
      `- Comments cleared: ${item.commentsCleared === true ? "yes" : "no"}`,
      `- Directly deliverable: ${item.deliverable === true ? "yes" : "needs review"}`,
      `- Current finding: ${item.deliverable === true ? "Route behaved as expected for this fixture." : "Needs targeted follow-up; structural edits such as paragraph-to-table did not produce real table XML."}`,
      ""
    ]),
    "### Known Gaps",
    "",
    "- This suite uses compact DOCX fixtures; it does not yet cover images, headers/footers, complex tables, tracked changes, or long source documents.",
    "- Original-format revision now covers paragraph replacement and paragraph-to-table conversion for safe body paragraphs; broader rich structural edits still need separate coverage.",
    ""
  ].join("\n");
  const existing = existsSync(reportPath) ? readFileSync(reportPath, "utf8") : "# Word Generation Acceptance\n";
  const next = existing.includes("## Upload DOCX Modification Acceptance")
    ? existing.replace(/## Upload DOCX Modification Acceptance[\s\S]*$/u, summary)
    : `${existing.replace(/\s*$/u, "")}\n\n${summary}`;
  writeFileSync(reportPath, next, "utf8");
}

async function getTaskMetadata(taskId: string) {
  const message = await prisma.chatMessage.findUnique({
    where: { id: taskId },
    select: { metadata: true }
  });
  return parseMetadata(message?.metadata);
}

async function main() {
  const cookie = await login();
  const fixtures = await ensureFixtures();
  const results = [];

  for (const item of cases) {
    const startedAt = Date.now();
    const taskId = await createUploadTask(cookie, item, fixtures[item.source]);
    const attachment = await pollTask(cookie, taskId);
    const buffer = await docxBufferFromAttachment(attachment);
    const { text, xml } = docxTextAndXml(buffer);
    const metadata = await getTaskMetadata(taskId);
    const missing = item.expected.filter((expected) => !text.includes(expected));
    const hasTable = xml.includes("<w:tbl>");
    const commentsCleared = item.source !== "comments" || !xml.includes("commentRangeStart");
    const deliverable = missing.length === 0 && commentsCleared && (item.name !== "paragraph_to_table_preserve_format" || hasTable);
    results.push({
      ...item,
      elapsedMs: Date.now() - startedAt,
      sourceFileName: item.fileName,
      fileName: attachment.name || "",
      modelUsed: metadata.modelUsed,
      providerUsed: metadata.providerUsed,
      fallbackUsed: metadata.fallbackUsed,
      routeReason: metadata.routeReason,
      outputFileName: attachment.name || "",
      missing,
      hasTable,
      commentsCleared,
      deliverable
    });
  }

  writeUploadAcceptanceReport(results);
  console.log(JSON.stringify({ ok: true, baseUrl, results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
