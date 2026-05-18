import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const TEST_USER_ID = "ppt-file-upload-e2e";
const TEST_STORAGE_ROOT = resolve(process.cwd(), "public", "mock-storage", "users", TEST_USER_ID);

function forceEnv(name: string, value: string) {
  process.env[name] = value;
}

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function listZipEntries(buffer: Buffer) {
  const entries: string[] = [];
  for (let offset = 0; offset <= buffer.length - 46; offset += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) break;
    entries.push(buffer.subarray(nameStart, nameEnd).toString("utf8"));
    offset = nameEnd + extraLength + commentLength - 1;
  }
  return entries;
}

function resolveMockStorageUrl(url: string) {
  assert(url.startsWith("/mock-storage/"), `Expected a mock-storage URL, got ${url}`);
  return resolve(process.cwd(), "public", url.replace(/^\//, ""));
}

function assertValidPptx(buffer: Buffer, expectedSlides: number) {
  assert(buffer.subarray(0, 2).toString("utf8") === "PK", "Generated file should be a PPTX/ZIP package");
  assert(buffer.length > 1024, "Generated PPTX should not be empty");
  const entries = listZipEntries(buffer);
  assert(entries.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry)).length === expectedSlides, `Expected ${expectedSlides} slides`);
}

forceEnv("NODE_ENV", "test");
forceEnv("ALLOW_LOCAL_STORAGE_FALLBACK", "true");
forceEnv("PRESENTATION_PROVIDER", "local");
forceEnv("AGENT_TASK_TIMEOUT_MS", "1000");
forceEnv("CLAUDECODER_API_KEY", "");
forceEnv("MOONSHOT_API_KEY", "");
forceEnv("AGENT_KIMI_API_KEY", "");
forceEnv("AGENT_TEST_LOCAL_FILE_PARSE", "true");
forceEnv("PRESENTATION_IMAGE_MAX_SLIDES", "0");
forceEnv("PRESENTATION_IMAGE_SEARCH_ENABLED", "false");
forceEnv("PRESENTATION_IMAGE_GENERATION_ENABLED", "false");
forceEnv("ALI_OSS_BUCKET", "");
forceEnv("ALI_OSS_ACCESS_KEY_ID", "");
forceEnv("ALI_OSS_ACCESS_KEY_SECRET", "");
forceEnv("ALI_OSS_ENDPOINT", "");

async function main() {
  rmSync(TEST_STORAGE_ROOT, { recursive: true, force: true });

  const { runAgent } = await import("../lib/agent/router");
  const fileContent = [
    "Keyframes mark important poses in an animation timeline.",
    "Tweening fills the motion between keyframes.",
    "The graph editor changes acceleration and makes movement feel natural.",
    "Classroom practice should ask students to observe, mark, animate, and explain the motion curve.",
    "Linear interpolation feels mechanical, while ease-in and ease-out curves create weight and intention."
  ].join("\n");
  const file = new File([fileContent], "keyframe-lesson-notes.txt", { type: "text/plain" });

  const result = await runAgent({
    userId: TEST_USER_ID,
    messages: [{ role: "user", content: "根据这个文件生成一份 6 页上课教学 PPT，内容要丰富，有案例和课堂练习。" }],
    files: [file],
    tools: { contentMode: "ppt", webSearch: false },
    signal: new AbortController().signal
  });

  assert(result.agentTask?.type === "create_presentation", `Expected create_presentation task, got ${result.agentTask?.type}`);
  assert(result.extractedDocuments.length === 1, `Expected one extracted document, got ${result.extractedDocuments.length}`);
  assert(result.extractedDocuments[0].extractedMarkdown.includes("Keyframes mark important poses"), "Expected local file content to be extracted");
  assert(result.generatedFiles.length === 1, `Expected one generated PPTX, got ${result.generatedFiles.length}`);
  assert(result.generatedFiles[0].mimeType === PPTX_MIME, `Expected PPTX mime type, got ${result.generatedFiles[0].mimeType}`);
  assert(result.webContext !== null, "PPT file tasks should still collect presentation research context");

  const generatedPath = resolveMockStorageUrl(result.generatedFiles[0].url || "");
  assert(existsSync(generatedPath), `Generated PPTX should exist at ${generatedPath}`);
  assert(statSync(generatedPath).size === result.generatedFiles[0].sizeBytes, "Generated PPTX size should match metadata");

  const buffer = readFileSync(generatedPath);
  assertValidPptx(buffer, 6);
  const xml = buffer.toString("utf8");
  assert(xml.includes("Keyframes mark important poses"), "Generated PPTX should include uploaded file facts");
  assert(xml.includes("Tweening fills the motion"), "Generated PPTX should include extracted source details");
  assert(xml.includes("graph editor changes acceleration"), "Generated PPTX should include technical detail from the file");
  assert(xml.includes("V2 Lesson Exercise"), "Generated PPTX should include a classroom exercise slide");
  assert(xml.includes("V2 Process Steps"), "Generated PPTX should include a process/workflow slide");
  assert(!xml.includes("Generated by NexusAI"), "Generated PPTX should not expose platform-generated branding");

  console.log(JSON.stringify({ ok: true, routeReason: result.routeReason, fileName: result.generatedFiles[0].fileName }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
