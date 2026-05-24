import JSZip from "jszip";

import { parseDocuments } from "@/lib/document-processing/parser";
import { executeRuntimeTool } from "@/lib/agent/runtime/tool-executor";
import { getToolAdapter, type ToolAdapterContext } from "@/lib/agent/runtime/tool-adapters";
import type { AgentRuntimeDecision } from "@/lib/agent/runtime";

type CaseResult = {
  name: string;
  skipped?: boolean;
  detail?: string;
};

type ConversationFileFixture = {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  extractedText: string;
  parseStatus: "parsed" | "partial";
  sourceMessageId: string;
  conversationId: string;
};

const baseUrl = process.env.AGENT_E2E_BASE_URL || "http://localhost:3099";
const cookie = process.env.AGENT_E2E_COOKIE || "";

const decision: AgentRuntimeDecision = {
  intent: "file_analysis",
  targetTool: "file-analysis",
  confidence: 0.9,
  needsTool: true,
  needsConfirmation: false,
  missingInputs: [],
  activeTaskId: null,
  nextAction: "run_legacy_tool",
  progressStages: ["analyzing_context", "planning_intent", "selecting_skill", "checking_execution_gate", "calling_tool", "completed"]
};

const sampleText = [
  "AI education report.",
  "The file says teachers need practical classroom scenarios, formative assessment, and responsible AI guidance.",
  "It recommends short activities, clear rubrics, and privacy-aware tool selection."
].join("\n");

function makeTxtFile() {
  return new File([sampleText], "sample.txt", { type: "text/plain" });
}

async function makeDocxFile() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
      "</Types>"
    ].join("")
  );
  zip.folder("_rels")?.file(
    ".rels",
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
      "</Relationships>"
    ].join("")
  );
  zip.folder("word")?.file(
    "document.xml",
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      "<w:body>",
      "<w:p><w:r><w:t>AI education DOCX fixture summary content.</w:t></w:r></w:p>",
      "<w:p><w:r><w:t>Teachers need rubrics, classroom examples, and privacy safeguards.</w:t></w:r></w:p>",
      "</w:body>",
      "</w:document>"
    ].join("")
  );
  const buffer = await zip.generateAsync({ type: "uint8array" });
  const arrayBuffer = Buffer.from(buffer).buffer.slice(0);
  return new File([arrayBuffer], "sample.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

function makePdfBuffer(text: string) {
  const stream = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "utf8");
}

function makePdfFile() {
  return new File([makePdfBuffer("AI education PDF fixture summary content.")], "sample.pdf", { type: "application/pdf" });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function baseContext(overrides: Partial<ToolAdapterContext> = {}): ToolAdapterContext {
  return {
    request: new Request(`${baseUrl}/api/ai/chat`),
    origin: baseUrl,
    userId: "agent-runtime-test-user",
    conversationId: "conversation-a",
    userText: "summarize this file",
    messages: [{ role: "user", content: "summarize this file" }],
    files: [],
    signal: new AbortController().signal,
    activeTask: null,
    runLegacyAgent: async () => {
      throw new Error("legacy agent must not run");
    },
    runImageGeneration: async () => {
      throw new Error("image generation must not run");
    },
    runChatAnswer: async () => {
      throw new Error("chat answer must not run");
    },
    ...overrides
  };
}

function makeConversationFile(overrides: Partial<ConversationFileFixture> = {}): ConversationFileFixture {
  return {
    attachmentId: "attachment-a",
    fileName: "sample.txt",
    mimeType: "text/plain",
    sizeBytes: sampleText.length,
    extractedText: sampleText,
    parseStatus: "parsed",
    sourceMessageId: "message-a",
    conversationId: "conversation-a",
    ...overrides
  };
}

async function runCase(name: string, fn: () => Promise<void> | void): Promise<CaseResult> {
  try {
    await fn();
    console.log(`PASS ${name}`);
    return { name };
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function parseFixture(file: File, allowFailure = false) {
  const parsed = await parseDocuments({ files: [file], maxChars: 20_000 });
  if (allowFailure && parsed.status !== "parsed") {
    const warning = parsed.warnings[0];
    assert(warning?.message, `${file.name} failed without a user-readable parser warning`);
    assert(!/stack|Error:/i.test(warning.message), `${file.name} warning exposes internal error text`);
    return parsed;
  }
  assert(parsed.status === "parsed", `${file.name} parser status expected parsed, got ${parsed.status}`);
  assert(parsed.effectiveText.length > 20, `${file.name} parser returned too little text`);
  return parsed;
}

async function runAdapterWithContext(context: ToolAdapterContext) {
  const execution = await executeRuntimeTool(decision, context);
  const adapter = getToolAdapter("file-analysis");
  const resultCard = adapter.getResultCard(execution);
  assert(resultCard === null, "file-analysis must not expose a taskCard");
  assert(!execution.result.generatedFiles.length, "file-analysis must not generate attachment files");
  return execution;
}

function parseSseEvents(text: string) {
  const events: Array<{ event: string; data: Record<string, unknown> }> = [];
  for (const block of text.split(/\n\n+/)) {
    const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
    const rawData = block.match(/^data:\s*(.+)$/m)?.[1]?.trim();
    if (!event || !rawData) continue;
    events.push({ event, data: JSON.parse(rawData) as Record<string, unknown> });
  }
  return events;
}

async function runApiE2eIfConfigured() {
  if (!cookie) {
    console.log("SKIP API E2E upload: AGENT_E2E_COOKIE is not set.");
    return;
  }

  const formData = new FormData();
  formData.set("mode", "agent");
  formData.set("stream", "true");
  formData.set("messages", JSON.stringify([{ role: "user", content: "summarize this file" }]));
  formData.append("files", makeTxtFile(), "sample.txt");

  const response = await fetch(`${baseUrl}/api/ai/chat?stream=1&debugAgent=1`, {
    method: "POST",
    headers: {
      cookie,
      accept: "text/event-stream"
    },
    body: formData
  });

  assert(response.ok, `API upload failed with HTTP ${response.status}: ${await response.text()}`);
  const events = parseSseEvents(await response.text());
  const final = events.find((event) => event.event === "final");
  const error = events.find((event) => event.event === "error");
  assert(!error, `API SSE returned error: ${JSON.stringify(error?.data)}`);
  assert(final, "API SSE did not return a final event");
  const assistantMessage = final.data.assistantMessage as Record<string, unknown> | undefined;
  assert(assistantMessage, "final event missing assistantMessage");
  assert(!assistantMessage.taskCard, "file-analysis final assistantMessage must not contain a taskCard");
  const trace = final.data.agentRuntimeTrace as { decision?: { targetTool?: string } } | undefined;
  assert(trace?.decision?.targetTool === "file-analysis", `expected targetTool=file-analysis, got ${trace?.decision?.targetTool || "unknown"}`);
}

async function main() {
  const results: CaseResult[] = [];

  results.push(await runCase("public parser parses txt fixture", async () => {
    const parsed = await parseFixture(makeTxtFile());
    assert(parsed.files[0]?.parser === "txt", "txt fixture did not use txt parser");
  }));

  results.push(await runCase("public parser handles docx fixture", async () => {
    const parsed = await parseFixture(await makeDocxFile(), true);
    if (parsed.status === "parsed") assert(parsed.files[0]?.parser === "docx", "docx fixture did not use docx parser");
  }));

  results.push(await runCase("public parser handles pdf fixture", async () => {
    const parsed = await parseFixture(makePdfFile(), true);
    if (parsed.status === "parsed") assert(parsed.files[0]?.parser === "pdf", "pdf fixture did not use pdf parser");
  }));

  results.push(await runCase("file-analysis upload answer has no taskCard", async () => {
    const execution = await runAdapterWithContext(baseContext({ files: [makeTxtFile()] }));
    assert(execution.result.content.includes("AI education"), "file-analysis answer did not include parsed txt content");
    assert(execution.result.extractedDocuments.length === 1, "file-analysis did not return extractedDocuments for txt");
  }));

  results.push(await runCase("no file asks for upload instead of running tool", async () => {
    const execution = await executeRuntimeTool(decision, baseContext());
    assert("validationFailed" in execution && execution.validationFailed, "no-file request should fail validation");
    assert("missingInputs" in execution && execution.missingInputs.includes("file"), "no-file validation must include missing file");
  }));

  results.push(await runCase("same conversation reuses saved extracted file text", async () => {
    const execution = await runAdapterWithContext(
      baseContext({
        files: [],
        userText: "make this file summary shorter",
        activeTask: { id: "attachment-a", kind: "file-analysis", title: "sample.txt", status: "completed", source: "conversation" },
        conversationFiles: [makeConversationFile()]
      } as Partial<ToolAdapterContext> & { conversationFiles: ConversationFileFixture[] })
    );
    assert(execution.result.content.includes("sample.txt"), "continued answer should reference the saved file");
    assert(execution.result.extractedDocuments[0]?.fileName === "sample.txt", "continued run should reuse saved extracted document");
  }));

  results.push(await runCase("partial parsed file can continue in same conversation", async () => {
    const execution = await runAdapterWithContext(
      baseContext({
        files: [],
        userText: "continue summarizing this file",
        activeTask: { id: "attachment-partial", kind: "file-analysis", title: "sample.txt", status: "interrupted", source: "conversation" },
        conversationFiles: [makeConversationFile({ attachmentId: "attachment-partial", parseStatus: "partial" })]
      } as Partial<ToolAdapterContext> & { conversationFiles: ConversationFileFixture[] })
    );
    assert(execution.result.content.includes("AI education"), "partial continuation should use saved extracted text");
  }));

  results.push(await runCase("new conversation does not inherit file reference", async () => {
    const execution = await executeRuntimeTool(decision, baseContext({ conversationId: "conversation-b", files: [] }));
    assert("validationFailed" in execution && execution.validationFailed, "new conversation without files should not inherit prior files");
    assert("missingInputs" in execution && execution.missingInputs.includes("file"), "new conversation must ask for file");
  }));

  results.push(await runCase("optional real multipart API E2E upload", runApiE2eIfConfigured));

  console.log(`Agent Runtime V2 file-analysis upload checks passed: ${results.length}/${results.length}.`);
}

main().catch(() => {
  process.exit(1);
});
