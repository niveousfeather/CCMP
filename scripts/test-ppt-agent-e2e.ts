import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const TEST_USER_ID = "ppt-agent-e2e";
const TEST_STORAGE_ROOT = resolve(process.cwd(), "public", "mock-storage", "users", TEST_USER_ID);

function forceEnv(name: string, value: string) {
  process.env[name] = value;
}

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function assertIncludes(source: string, needle: string, label: string) {
  assert(source.includes(needle), `${label}: missing ${needle}`);
}

function assertNotIncludes(source: string, needle: string, label: string) {
  assert(!source.includes(needle), `${label}: should not include ${needle}`);
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

function makeTinyPng() {
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
}

function assertValidPptx(buffer: Buffer, expectedSlides: number, label: string) {
  assert(buffer.subarray(0, 2).toString("utf8") === "PK", `${label} should be a ZIP/PPTX package`);
  assert(buffer.length > 1024, `${label} should not be empty`);

  const entries = listZipEntries(buffer);
  const slideEntries = entries.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry));
  const relEntries = entries.filter((entry) => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(entry));

  for (const required of [
    "[Content_Types].xml",
    "_rels/.rels",
    "docProps/core.xml",
    "docProps/app.xml",
    "ppt/presentation.xml",
    "ppt/_rels/presentation.xml.rels",
    "ppt/slideMasters/slideMaster1.xml",
    "ppt/slideLayouts/slideLayout1.xml",
    "ppt/theme/theme1.xml"
  ]) {
    assert(entries.includes(required), `${label} missing PPTX entry ${required}`);
  }

  assert(slideEntries.length === expectedSlides, `${label} should contain ${expectedSlides} slides, got ${slideEntries.length}`);
  assert(relEntries.length >= slideEntries.length, `${label} should include slide relationship files`);

  return entries;
}

forceEnv("NODE_ENV", "test");
forceEnv("ALLOW_LOCAL_STORAGE_FALLBACK", "true");
forceEnv("PRESENTATION_PROVIDER", "local");
forceEnv("AGENT_TASK_TIMEOUT_MS", "1000");
forceEnv("CLAUDECODER_API_KEY", "");
forceEnv("MOONSHOT_API_KEY", "");
forceEnv("AGENT_KIMI_API_KEY", "");
forceEnv("ALI_OSS_BUCKET", "");
forceEnv("ALI_OSS_ACCESS_KEY_ID", "");
forceEnv("ALI_OSS_ACCESS_KEY_SECRET", "");
forceEnv("ALI_OSS_ENDPOINT", "");

if (process.env.PRESENTATION_E2E_REAL_IMAGES !== "true") {
  forceEnv("PRESENTATION_IMAGE_MAX_SLIDES", "0");
  forceEnv("PRESENTATION_IMAGE_SEARCH_ENABLED", "false");
  forceEnv("PRESENTATION_IMAGE_GENERATION_ENABLED", "false");
}

async function main() {
  rmSync(TEST_STORAGE_ROOT, { recursive: true, force: true });

  const { extractAgentTask, runAgent } = await import("../lib/agent/router");
  const { shouldUseFastChatRoute } = await import("../lib/agent/task-router");
  const { createLocalPresentationProvider } = await import("../lib/presentation/providers/local");

  const request = "Create a 6-slide teaching PPT about keyframe animation for a classroom lesson.";
  const tools = { webSearch: false, contentMode: "ppt" as const };
  const task = extractAgentTask(request, false, { tools });

  assert(task.type === "create_presentation", `Expected PPT request to route to create_presentation, got ${task.type}`);
  assert(task.outputFormat === "pptx", `Expected PPT request outputFormat=pptx, got ${task.outputFormat}`);
  assert(
    !shouldUseFastChatRoute({ text: request, hasFiles: false, tools, task }),
    "PPT generation should not use the fast chat route"
  );

  const result = await runAgent({
    userId: TEST_USER_ID,
    messages: [{ role: "user", content: request }],
    files: [],
    tools,
    signal: new AbortController().signal
  });

  assert(result.agentTask?.type === "create_presentation", `runAgent should preserve create_presentation task, got ${result.agentTask?.type}`);
  assert(result.routeReason.includes("create_presentation"), `runAgent routeReason should mention create_presentation, got ${result.routeReason}`);
  assert(result.generatedFiles.length === 1, `runAgent should return one generated PPTX file, got ${result.generatedFiles.length}`);
  assert(result.pendingTask === null, "runAgent should not leave a pending task after successful PPT generation");

  const file = result.generatedFiles[0];
  assert(file.fileName.endsWith(".pptx"), `Generated file should end with .pptx, got ${file.fileName}`);
  assert(file.mimeType === PPTX_MIME, `Generated file should use PPTX mime type, got ${file.mimeType}`);
  assert(file.sizeBytes > 1024, `Generated file should be larger than 1KB, got ${file.sizeBytes}`);
  assert(file.url, "Generated PPTX should expose a download URL");

  const generatedPath = resolveMockStorageUrl(file.url);
  assert(existsSync(generatedPath), `Generated PPTX should exist at ${generatedPath}`);
  assert(statSync(generatedPath).size === file.sizeBytes, "Generated PPTX size should match attachment metadata");

  const generatedBuffer = readFileSync(generatedPath);
  assertValidPptx(generatedBuffer, 6, "Agent PPTX");

  const generatedXml = generatedBuffer.toString("utf8");
  assertIncludes(generatedXml, "V2 Teaching Cover", "Agent PPTX should use V2 teaching cover rendering");
  assertIncludes(generatedXml, "V2 Agenda List", "Agent PPTX should use V2 agenda rendering");
  assertIncludes(generatedXml, "V2 Process Steps", "Agent PPTX should use V2 process rendering");
  assertNotIncludes(generatedXml, "Generated by NexusAI", "Agent PPTX should not expose platform-generated branding");
  assertNotIncludes(generatedXml, "NexusAI", "Agent PPTX should not expose NexusAI as document content");

  const visualProvider = createLocalPresentationProvider();
  const visualDeck = await visualProvider.generate({
    deck: {
      title: "Visual Asset Packaging",
      theme: "clean_education",
      slides: [
        {
          type: "cover",
          title: "Visual Asset Packaging",
          visualAsset: {
            buffer: makeTinyPng(),
            mimeType: "image/png",
            extension: "png",
            source: "web_search",
            alt: "embedded test visual",
            sourceUrl: "https://example.com/test.png"
          }
        }
      ]
    }
  });

  const visualEntries = assertValidPptx(visualDeck.buffer, 1, "Visual asset PPTX");
  const visualXml = visualDeck.buffer.toString("utf8");
  assert(visualEntries.includes("ppt/media/visual-1.png"), "Visual asset PPTX should package resolved visuals into ppt/media");
  assertIncludes(visualXml, "relationships/image", "Visual asset PPTX should link packaged images with slide relationships");
  assertIncludes(visualXml, "Searched Visual Asset", "Visual asset PPTX should render the visual asset frame");
  assertNotIncludes(visualXml, "Generated by NexusAI", "Visual asset PPTX should not expose platform-generated branding");

  console.log(
    JSON.stringify(
      {
        ok: true,
        routeReason: result.routeReason,
        fileName: file.fileName,
        sizeBytes: file.sizeBytes,
        url: file.url,
        visualAssetMedia: true
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
