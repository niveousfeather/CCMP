import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();

function workspacePath(filePath: string) {
  return path.join(root, filePath);
}

function readWorkspaceFile(filePath: string) {
  return readFileSync(workspacePath(filePath), "utf8");
}

function assertFile(filePath: string) {
  if (!existsSync(workspacePath(filePath))) {
    throw new Error(`missing file: ${filePath}`);
  }
}

function assertIncludes(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`${label}: missing ${needle}`);
  }
}

function assertNotIncludes(source: string, needle: string, label: string) {
  if (source.includes(needle)) {
    throw new Error(`${label}: must not include ${needle}`);
  }
}

function assertOrdered(source: string, first: string, second: string, label: string) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  if (firstIndex === -1 || secondIndex === -1 || firstIndex > secondIndex) {
    throw new Error(`${label}: expected ${first} before ${second}`);
  }
}

function listFiles(directory: string) {
  return readdirSync(workspacePath(directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function assertPythonPasses(source: string, label: string) {
  const result = spawnSync("python", ["-c", source], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (result.status !== 0) {
    throw new Error(`${label}: Python check failed\n${result.stdout}\n${result.stderr}`);
  }
}

for (const file of [
  "app/api/smart-tools/academic-ppt/tasks/route.ts",
  "app/api/smart-tools/academic-ppt/tasks/[taskId]/route.ts",
  "app/api/smart-tools/academic-ppt/tasks/[taskId]/download/route.ts",
  "app/api/smart-tools/academic-ppt/tasks/[taskId]/logs/route.ts",
  "app/api/smart-tools/academic-ppt/tasks/[taskId]/cancel/route.ts",
  "app/api/smart-tools/academic-ppt/tasks/[taskId]/resume/route.ts",
  "app/api/internal/academic-ppt/model/route.ts",
  "components/smart-tools/academic-ppt/AcademicPptWorkbench.tsx",
  "components/smart-tools/academic-ppt/AcademicPptTaskMonitor.tsx",
  "components/smart-tools/academic-ppt/AcademicPptLogsPanel.tsx",
  "lib/smart-tools/academic-ppt/task-queue.ts",
  "lib/smart-tools/academic-ppt/task-runner.ts",
  "lib/smart-tools/academic-ppt/task-lock.ts",
  "lib/smart-tools/academic-ppt/task-recovery.ts",
  "lib/smart-tools/academic-ppt/server-task-store.ts",
  "lib/smart-tools/academic-ppt/checkpoint-store.ts",
  "lib/smart-tools/academic-ppt/tools-engine-client.ts",
  "lib/smart-tools/academic-ppt/sidecar-client.ts",
  "lib/smart-tools/academic-ppt/pptx-writer.ts",
  "services/ai-tools-engine/README.md",
  "services/ai-tools-engine/requirements.txt",
  "services/ai-tools-engine/start.py",
  "services/ai-tools-engine/start-tools.cmd",
  "services/ai-tools-engine/start-tools.ps1",
  "services/ai-tools-engine/app/main.py",
  "services/ai-tools-engine/app/core/config.py",
  "services/ai-tools-engine/app/core/diagnostics.py",
  "services/ai-tools-engine/app/core/security.py",
  "services/ai-tools-engine/app/core/files.py",
  "services/ai-tools-engine/app/core/model_bridge.py",
  "services/ai-tools-engine/scripts/check_deps.py",
  "services/ai-tools-engine/scripts/check_port.py",
  "services/ai-tools-engine/app/tools/academic_ppt/router.py",
  "services/ai-tools-engine/app/tools/academic_ppt/runner.py",
  "services/ai-tools-engine/app/tools/academic_ppt/paper_ppt_adapter.py",
  "services/ai-tools-engine/app/tools/diagram_canvas/router.py",
  "lib/smart-tools/academic-ppt/README.md",
  "scripts/academic-ppt/e2e-local.ts",
  "scripts/academic-ppt/quality-regression.ts",
  "scripts/academic-ppt/manual-review-pack.ts",
  "scripts/academic-ppt/manual-sidecar-review.ts",
  "scripts/academic-ppt/smoke-tools-engine.ts",
  "scripts/academic-ppt/check-model-bridge.ts",
  "scripts/academic-ppt/check-preview-env.ts",
  "scripts/academic-ppt/check-repository.ts",
  "scripts/academic-ppt/cleanup.ts"
]) {
  assertFile(file);
}

const taskRunner = readWorkspaceFile("lib/smart-tools/academic-ppt/task-runner.ts");
assertIncludes(taskRunner, "runAcademicPptToolsEngineTask", "runner should call Python Tools Engine");
assertIncludes(taskRunner, "runAcademicPptGenerationPipeline", "runner should keep TypeScript fallback");
assertIncludes(taskRunner, "fallback generation", "runner should label fallback");
assertIncludes(taskRunner, "acquireAcademicPptTaskLock", "runner lock");
assertIncludes(taskRunner, "releaseAcademicPptTaskLock", "runner releases lock");
assertIncludes(taskRunner, "onAcademicPptTaskFinished", "runner finish hook");

const engineClient = readWorkspaceFile("lib/smart-tools/academic-ppt/tools-engine-client.ts");
assertIncludes(engineClient, "AI_TOOLS_ENGINE_URL", "engine client new env");
assertIncludes(engineClient, "ACADEMIC_PPT_AGENT_URL", "engine client legacy env");
assertIncludes(engineClient, "/tools/academic-ppt", "engine client academic-ppt route");
assertIncludes(engineClient, "modelBridgeUrl", "engine client passes model bridge");
assertIncludes(engineClient, "webSearchEnabled", "engine client passes controlled search flag");
assertIncludes(engineClient, "searchProvider", "engine client passes search provider label");
assertIncludes(engineClient, "generatorPreference", "engine client passes generator preference");
assertIncludes(engineClient, "resolveAcademicPptModelBridgeEndpoint", "engine client should centralize model bridge URL resolution");
assertIncludes(engineClient, "preferIncomingMeaningful", "engine client should let final tools-engine bridge diagnostics override stale in-flight statuses");
assertIncludes(engineClient, "renderAcademicPptNativePreview", "engine client should try native PPTX preview after successful export");
assertIncludes(engineClient, "native_preview", "engine client should persist native PPTX preview source when available");
assertIncludes(engineClient, "request-origin", "engine client should support request-origin bridge URL source");
assertIncludes(engineClient, "127.0.0.1:3000", "engine client default bridge URL should match local Next.js default");
assertIncludes(engineClient, "POST_TIMEOUT_MS", "engine client submit timeout");
assertIncludes(engineClient, "STALE_HEARTBEAT_MS", "engine client heartbeat guard");
assertIncludes(engineClient, 'modelSource: "paper-ppt-agent"', "engine client marks primary model source");
assertIncludes(engineClient, 'generatorSource: "tools-engine"', "engine client marks tools-engine source");
assertNotIncludes(engineClient, "outputFilePath:", "snapshot must not expose output path from engine client");

const workbench = readWorkspaceFile("components/smart-tools/academic-ppt/AcademicPptWorkbench.tsx");
assertIncludes(workbench, "selectedTaskId", "workbench should separate selected task from active poller");
assertIncludes(workbench, "activeTaskId", "workbench should track exactly one active poller task");
assertIncludes(workbench, "pollerRef", "workbench should own and stop the active poller");
assertIncludes(workbench, "activeTaskIdRef", "workbench should not replace an already running active poller from history selection");
assertIncludes(workbench, "stopActivePoller", "workbench should explicitly stop stale polling");
assertIncludes(workbench, "isAcademicPptNotFoundError", "workbench should distinguish missing historical tasks");
assertIncludes(workbench, "markRecentTaskMissing", "workbench should mark stale recent tasks missing");
assertIncludes(workbench, "refreshSuccessfulTaskPreview", "workbench should reload task snapshot and preview manifest after success");
assertIncludes(workbench, "deriveSlidesFromPreviewManifest", "workbench should use real preview slide count when outline preview is stale or missing");
assertIncludes(workbench, "selectedTaskPreviewMap", "workbench should cache preview manifests by task id");
assertIncludes(workbench, "previewManifestCacheRef", "workbench should keep a synchronous preview manifest cache");
assertIncludes(workbench, "previewRequestRef", "workbench should abort stale preview manifest requests when switching tasks");
assertIncludes(workbench, "isPollableStatus", "workbench should only start periodic polling for active task statuses");
assertIncludes(workbench, "applyPreviewManifest", "workbench should apply cached preview manifests without refetching");
assertIncludes(workbench, "activeSlideIndex", "workbench should use a 0-based selected slide index internally");
assertIncludes(workbench, "setActiveSlideIndex", "workbench should select slides by 0-based index instead of mixed ids");
assertIncludes(workbench, "deriveSlidesFromPreviewManifest", "workbench should replace preview slides from the manifest as one source of truth");
assertNotIncludes(workbench, "[applyTaskSnapshot, slidesPreview]", "success preview refresh must not depend on mutable slide preview state");
assertNotIncludes(workbench, "[refreshSuccessfulTaskPreview, taskId, status]", "completed tasks must not refetch preview from a success-state effect");
assertNotIncludes(workbench, "getAcademicPptTask(finishedTaskId", "completed preview refresh must not request the task snapshot a second time");
assertIncludes(workbench, "RECENT_TASKS_HIDDEN_STORAGE_KEY", "workbench should persist hidden recent task ids locally");
assertIncludes(workbench, "ACADEMIC_PPT_PLACEHOLDER_TASK_ID", "workbench should know the placeholder academic-ppt task id");
assertIncludes(workbench, "isAcademicPptPlaceholderTaskId", "workbench should clean placeholder task ids from local history");
assertIncludes(workbench, "dismissRecentTask", "workbench should hide recent tasks without deleting task directories");
assertIncludes(workbench, "setSelectedTaskId(null)", "dismissing the selected task should clear selection");
assertIncludes(workbench, 'snapshot.status === "success"', "workbench should refresh preview manifest after loading a completed history task");
assertIncludes(workbench, "refreshSuccessfulTaskPreview(recentTaskId", "workbench should avoid stale preview counts for history tasks");
assertIncludes(workbench, "基于学术资料自动生成可编辑 PPTX。", "workbench top copy should be product friendly");
assertNotIncludes(workbench, "基于 paper-ppt-agent", "workbench must not expose implementation pipeline copy");

const modelBridge = readWorkspaceFile("app/api/internal/academic-ppt/model/route.ts");
assertIncludes(modelBridge, "getAgentModelConfig", "model bridge uses existing model config");
assertIncludes(modelBridge, "getAcademicPptProviderConfig", "model bridge should resolve provider config inside the academic-ppt route");
assertIncludes(modelBridge, "callAcademicPptProviderModel", "model bridge should use academic-ppt provider stream wrapper");
assertIncludes(modelBridge, "readAcademicPptProviderStream", "model bridge should aggregate provider stream chunks server-side");
assertIncludes(modelBridge, "modelPreference", "model bridge supports fallback preference");
assertIncludes(modelBridge, "subrouter:gpt-5.4", "model bridge should expose academic-ppt primary model name");
assertIncludes(modelBridge, "kimi-k2.5", "model bridge should expose academic-ppt fallback model name");
assertIncludes(modelBridge, "primaryModel", "model bridge response should include primary diagnostics");
assertIncludes(modelBridge, "fallbackModel", "model bridge response should include fallback diagnostics");
assertIncludes(modelBridge, "modelBridgePrimaryStatus", "model bridge should persist primary status");
assertIncludes(modelBridge, "simulatePrimaryFailure", "model bridge check should be able to force fallback");
assertIncludes(modelBridge, "simulatePrimarySuccessAfterTransient", "model bridge check should verify retry policy independent of live provider availability");
assertIncludes(modelBridge, "simulateFallbackSuccess", "model bridge check should verify fallback diagnostics independent of live fallback provider availability");
assertIncludes(modelBridge, "ACADEMIC_PPT_STRICT_VISUAL_PIPELINE", "model bridge should expose strict visual mode");
assertIncludes(modelBridge, "ACADEMIC_PPT_ALLOW_KIMI_FINAL_FALLBACK", "model bridge should gate Kimi final fallback");
assertIncludes(modelBridge, "STRATEGY_PRIMARY_MAX_ATTEMPTS = readPositiveIntEnv(\"ACADEMIC_PPT_MAX_PRIMARY_RETRIES_STRATEGY\", 6)", "strategy/design-spec should allow six GPT-5.4 attempts");
assertIncludes(modelBridge, "DEFAULT_PRIMARY_MAX_ATTEMPTS = readPositiveIntEnv(\"ACADEMIC_PPT_MAX_PRIMARY_RETRIES_DEFAULT\", 4)", "default academic-ppt key stages should allow four GPT-5.4 attempts");
assertIncludes(modelBridge, "PRIMARY_RETRY_BACKOFF_MS = [5000, 15000, 30000, 60000, 120000]", "model bridge should use long progressive primary retry backoff");
assertIncludes(modelBridge, "primaryMaxAttemptsForStage", "model bridge should choose retry count by paper-ppt-agent stage");
assertIncludes(modelBridge, "isStrategyStage", "model bridge should recognize strategy/design-spec stages");
assertIncludes(modelBridge, "isKeyAcademicPptStage", "model bridge should recognize generation/visual_qa/manuscript stages");
assertIncludes(modelBridge, "Retrying primary model attempt", "model bridge should log primary retry");
assertIncludes(modelBridge, "Primary retries exhausted; starting fallback model.", "fallback should start only after primary retries are exhausted");
assertIncludes(modelBridge, "Kimi fallback disabled for strict visual stage", "strict visual mode should block Kimi from final visual stages");
assertIncludes(modelBridge, "body.stream !== false", "academic-ppt model bridge should default to provider streaming for long calls");
assertIncludes(modelBridge, "stream completed", "academic-ppt model bridge should log safe stream completion");
assertIncludes(modelBridge, "isRetryablePrimaryFailure", "model bridge should identify retryable provider failures");
assertIncludes(modelBridge, "isTransientAcademicPptModelError", "model bridge should classify stream interruptions as transient");
assertIncludes(modelBridge, "stream_interrupted", "model bridge should return structured stream interruption errors");
assertIncludes(modelBridge, "model stream interrupted, retryable", "model bridge should summarize retryable stream interruptions safely");
assertIncludes(modelBridge, "terminated", "model bridge should retry terminated provider streams");
assertIncludes(modelBridge, "UND_ERR_SOCKET", "model bridge should retry undici socket interruptions");
assertIncludes(modelBridge, "simulatePrimaryStreamInterruptedFailures", "model bridge check should simulate interrupted primary streams");
assertIncludes(modelBridge, "stripHtmlProviderBody", "model bridge should strip HTML provider errors");
assertIncludes(modelBridge, "Internal model bridge only accepts local requests", "model bridge local-only guard");
assertNotIncludes(modelBridge, "apiKey", "model bridge must not expose api keys");
assertNotIncludes(modelBridge, "Base URL", "model bridge must not expose base URL");

const serverTaskStore = readWorkspaceFile("lib/smart-tools/academic-ppt/server-task-store.ts");
assertIncludes(serverTaskStore, "requestAcademicPptToolsEngineCancellation", "cancel should notify tools engine");
assertIncludes(serverTaskStore, "modelBridgeStatus", "task store should persist model bridge status");
assertIncludes(serverTaskStore, "modelBridgeUrlSource", "task store should persist bridge URL source without exposing the URL");
assertIncludes(serverTaskStore, "generationMode", "task store should persist generation mode");
assertIncludes(serverTaskStore, "visualPipelineStatus", "task store should persist visual pipeline status");
assertIncludes(serverTaskStore, "requestSnapshot", "task store should persist academic-ppt request snapshot");
assertIncludes(serverTaskStore, "deepResearchEnabled", "task store should persist deep research flag");
assertIncludes(serverTaskStore, "externalResearchEnabled", "task store should persist external research flag");
assertIncludes(serverTaskStore, "webSearchEnabled", "task store should persist web search flag");
assertIncludes(serverTaskStore, "searchProvider", "task store should persist search provider label without endpoint");
assertIncludes(serverTaskStore, "searchStatus", "task store should persist search status");
assertIncludes(serverTaskStore, "generatorSource", "task store should persist generator source");
assertIncludes(serverTaskStore, "previewCount", "preview manifest should expose previewCount");
assertIncludes(serverTaskStore, "manifest.json", "completed preview should be stored as a stable manifest asset");
assertIncludes(serverTaskStore, "getLegacyTaskPreviewManifestPath", "preview reader should preserve compatibility with older preview.json tasks");
assertIncludes(serverTaskStore, "normalizePreviewSlide", "preview manifest should normalize every slide to 0-based index and 1-based pageNumber");
assertIncludes(serverTaskStore, "pageNumber", "preview manifest slides should expose user-facing page numbers");
assertIncludes(serverTaskStore, "assetPath", "preview manifest slides should expose local static asset paths");
assertIncludes(serverTaskStore, "storageProvider", "preview manifest slides should reserve storage provider fields for OSS");
assertIncludes(serverTaskStore, "previewAssetsReady", "task record should know when preview assets are durable");
assertIncludes(serverTaskStore, "outputStorageProvider", "task record should reserve output storage provider");
assertIncludes(serverTaskStore, "previewManifestUrl", "task record should reserve preview manifest URL");
assertIncludes(serverTaskStore, "pptxUrl", "task record should reserve PPTX URL");
assertIncludes(serverTaskStore, "school_academic_report", "task store should record the builtin school academic template id");
assertIncludes(serverTaskStore, "svg_final", "preview manifest should identify real svg_final source");
assertIncludes(serverTaskStore, "native_preview", "preview manifest should identify native PPTX preview source");
assertIncludes(serverTaskStore, "structured_placeholder", "structured preview must not masquerade as a real preview");
assertIncludes(serverTaskStore, "findAcademicPptSvgFinalFiles", "preview route should recover actual svg_final count from task artifacts");
assertIncludes(serverTaskStore, "buildSvgFinalPreviewManifest", "preview route should fall back to actual svg_final artifacts");
assertIncludes(serverTaskStore, "readStoredAcademicPptPreviewManifest", "preview route should inspect stored native manifest before SVG fallback");
assertIncludes(serverTaskStore, "ACADEMIC_PPT_PLACEHOLDER_TASK_IDS", "task store should identify placeholder task ids");
assertIncludes(serverTaskStore, "isAcademicPptPlaceholderTaskId", "task store should skip placeholder task ids before reading task.json");
assertIncludes(serverTaskStore, 'previewPending ? "pending"', "preview manifest should report pending instead of 404 while running assets are not ready");
assertIncludes(serverTaskStore, "record.previewAssetsReady &&", "task snapshots must not synthesize /preview/page assets before durable preview assets are ready");
assertOrdered(
  serverTaskStore,
  "const storedManifest = await readStoredAcademicPptPreviewManifest(taskId, record);",
  "const svgFinalFiles = await findAcademicPptSvgFinalFiles(taskId);",
  "preview route should prefer available native PPTX preview before SVG fallback"
);
assertNotIncludes(serverTaskStore, "inputFilePath: record.inputFilePath", "snapshot must not expose input path");
assertNotIncludes(serverTaskStore, "outputFilePath: record.outputFilePath", "snapshot must not expose output path");
assertNotIncludes(serverTaskStore, "qualityReportPath: record.qualityReportPath", "snapshot must not expose report path");

const sidecarClient = readWorkspaceFile("lib/smart-tools/academic-ppt/sidecar-client.ts");
assertIncludes(sidecarClient, 'modelSource: "local-fallback"', "TypeScript generator must be fallback");
assertIncludes(sidecarClient, "Fallback generation", "fallback writer label");

const engineMain = readWorkspaceFile("services/ai-tools-engine/app/main.py");
assertIncludes(engineMain, "nexusai-tools-engine", "engine health service name");
assertIncludes(engineMain, "/tools/academic-ppt", "engine academic-ppt router");
assertIncludes(engineMain, "/tools/diagram-canvas", "engine diagram placeholder router");
assertIncludes(engineMain, "require_local_request", "engine local-only dependency");
assertIncludes(engineMain, "diagnostics", "engine health diagnostics");
assertIncludes(engineMain, "academicPpt", "engine health academic-ppt diagnostics");

const engineStart = readWorkspaceFile("services/ai-tools-engine/start.py");
assertIncludes(engineStart, '"127.0.0.1"', "engine default host");
assertIncludes(engineStart, '"8010"', "engine default port");
assertNotIncludes(engineStart, "8080", "engine must not default to 8080");

const checkDeps = readWorkspaceFile("services/ai-tools-engine/scripts/check_deps.py");
for (const dependency of ["fastapi", "uvicorn", "pydantic_settings", "pptx", "fitz", "pymupdf4llm", "pandas", "reportlab"]) {
  assertIncludes(checkDeps, dependency, `check_deps should check ${dependency}`);
}
assertIncludes(checkDeps, "python -m pip install -r", "check_deps install guidance");

const checkPort = readWorkspaceFile("services/ai-tools-engine/scripts/check_port.py");
assertIncludes(checkPort, "8010", "check_port fixed engine port");
assertIncludes(checkPort, "/health", "check_port health probe");
assertIncludes(checkPort, "nexusai-tools-engine", "check_port service detection");
assertIncludes(checkPort, "netstat -ano | findstr :8010", "check_port manual PID guidance");
assertIncludes(checkPort, "taskkill /PID <pid> /F", "check_port manual kill guidance");
assertNotIncludes(checkPort, "kill(", "check_port must not kill processes");

const startCmd = readWorkspaceFile("services/ai-tools-engine/start-tools.cmd");
assertIncludes(startCmd, "check_deps.py", "start cmd dependency check");
assertIncludes(startCmd, "check_port.py", "start cmd port check");
assertIncludes(startCmd, "AI_TOOLS_ENGINE_PORT=8010", "start cmd port");
assertIncludes(startCmd, "netstat -ano", "start cmd port guidance");

const startPs1 = readWorkspaceFile("services/ai-tools-engine/start-tools.ps1");
assertIncludes(startPs1, "check_deps.py", "start ps1 dependency check");
assertIncludes(startPs1, "check_port.py", "start ps1 port check");
assertIncludes(startPs1, "AI_TOOLS_ENGINE_PORT", "start ps1 port env");

const engineFiles = readWorkspaceFile("services/ai-tools-engine/app/core/files.py");
assertIncludes(engineFiles, "validate_academic_ppt_task_paths", "engine path validator");
assertIncludes(engineFiles, "relative_to", "engine path containment");
assertIncludes(engineFiles, "uploads", "engine input must be under uploads");

const paperAdapter = readWorkspaceFile("services/ai-tools-engine/app/tools/academic_ppt/paper_ppt_adapter.py");
assertIncludes(paperAdapter, "paper-ppt-agent", "adapter should load local paper-ppt-agent");
assertIncludes(paperAdapter, "NexusModelBridgeProvider", "adapter should use Nexus model bridge");
assertIncludes(paperAdapter, "run_pipeline", "adapter should call paper-ppt-agent pipeline");
assertIncludes(paperAdapter, "academic-ppt-result.pptx", "adapter should copy final output");
assertIncludes(paperAdapter, "strict_visual_pipeline", "adapter should enforce strict visual pipeline mode");
assertIncludes(paperAdapter, "Strict visual pipeline is enabled; not generating rule fallback PPTX.", "adapter should not write low-quality PPTX in strict mode");
assertIncludes(paperAdapter, "visual-pipeline", "adapter should write visual pipeline checkpoint metadata");
assertIncludes(paperAdapter, "svg-final-index", "adapter should write SVG final index checkpoint");
assertIncludes(paperAdapter, "manuscript.md", "adapter should require manuscript or equivalent for full visual success");
assertIncludes(paperAdapter, "previewType\": \"svg\"", "adapter should expose real svg_final preview metadata");
assertIncludes(paperAdapter, "paper-ppt-agent-rule-fallback", "adapter should still identify Python-side rule fallback when strict mode is disabled");
assertIncludes(paperAdapter, "visualPipelineStatus", "adapter should report full/degraded visual pipeline status");
assertIncludes(paperAdapter, "_pptx_contains_basic_fallback_markers", "adapter should detect basic fallback decks");
assertIncludes(paperAdapter, "_visual_pipeline_status", "adapter should verify strategy/SVG/native pipeline output");
assertNotIncludes(paperAdapter, '"basic deck",', "adapter should not treat incidental basic deck text as fallback by itself");
assertIncludes(paperAdapter, '"basic deck" in combined and "generated from parsed text" in combined and "model bridge" in combined', "adapter should require combined evidence for generic basic deck fallback detection");
assertIncludes(paperAdapter, "_visual_quality_style_overrides", "adapter should pass visual quality constraints without patching vendor core");
assertIncludes(paperAdapter, "NexusAI visual quality guardrails", "adapter should inject readability and contrast guardrails");
assertIncludes(paperAdapter, "must remain readable on its background", "adapter should constrain text contrast");
assertIncludes(paperAdapter, "Section-page large numbers", "adapter should prevent section number/title collisions");
assertIncludes(paperAdapter, "_slide_composition_guardrails", "adapter should constrain section divider/content slide balance before design spec");
assertIncludes(paperAdapter, "_patch_paper_ppt_agent_svg_executor", "adapter should patch paper-ppt-agent SVG executor behavior without editing vendor files");
assertIncludes(paperAdapter, "detect_chapter_pages_from_intent", "adapter should prevent every Slide N heading from becoming a chapter page");
assertIncludes(paperAdapter, "_assess_visual_composition_quality", "adapter should classify low-body-content SVG output as degraded");
assertIncludes(paperAdapter, "contentSlides", "adapter should report content slide counts in visual pipeline checkpoints");
assertIncludes(paperAdapter, "sectionDividerSlides", "adapter should cap section divider slides");
assertIncludes(paperAdapter, "outlineOnlySlides", "adapter should detect outline-only slides");
assertIncludes(paperAdapter, "#DCEBFF", "blue tech theme should force light body text on dark backgrounds");
assertIncludes(paperAdapter, "decorative_number", "blue tech theme should keep large numbers low opacity and behind titles");
assertIncludes(paperAdapter, "section_divider_layers", "blue tech theme should fix section title/number layering");
assertIncludes(paperAdapter, "forbidden_dark_text_on_dark_background", "blue tech theme should reject black/navy text on dark backgrounds");
assertIncludes(paperAdapter, "Design spec planned only", "adapter should reject low-content design specs before reporting full success");
assertIncludes(paperAdapter, "SVG pages were generated for a", "adapter should detect large requested/actual page drift");
assertIncludes(paperAdapter, "_svg_text_background_is_dark", "contrast gate should evaluate the local text background");
assertIncludes(paperAdapter, "_svg_background_shapes", "contrast gate should inspect actual SVG background shapes");
assertIncludes(paperAdapter, 'generation_mode = "paper-ppt-agent-rule-fallback" if basic_fallback_detected else "paper-ppt-agent"', "composition failures should not masquerade as rule fallback decks");
assertIncludes(paperAdapter, "_read_model_bridge_snapshot", "adapter should preserve real bridge fallback_success diagnostics from task metadata");
assertIncludes(paperAdapter, 'model_bridge_snapshot.get("modelBridgeStatus")', "adapter should not collapse Kimi fallback inside a successful visual pipeline into local fallback");
assertIncludes(paperAdapter, '"Research manuscript was not generated."', "strict visual success should require manuscript or equivalent metadata");
assertIncludes(paperAdapter, "paper-workspaces", "adapter should isolate paper workspace");
assertIncludes(paperAdapter, "run_academic_search_bridge", "adapter should use NexusAI search bridge");
assertIncludes(paperAdapter, "externalResearchEnabled", "adapter should receive external research flag");
assertIncludes(paperAdapter, "webSearchEnabled", "adapter should receive web search flag");
assertIncludes(paperAdapter, "Search bridge degraded; continuing without external references.", "adapter should degrade search safely");
assertNotIncludes(paperAdapter, "openai_api_key", "adapter must not read provider keys");
assertNotIncludes(paperAdapter, "Authorization", "adapter must not read auth headers");
assertIncludes(paperAdapter, "get_academic_ppt_diagnostics", "adapter should preflight dependencies");
assertPythonPasses(String.raw`
import sys
from pathlib import Path
root = Path.cwd()
sys.path.insert(0, str(root / "services" / "ai-tools-engine"))
from app.tools.academic_ppt import paper_ppt_adapter as adapter

def low_count(svg: str) -> int:
    return adapter._low_contrast_text_count(svg, adapter._plain_svg_text(svg))

light_page = """<svg width="1280" height="720" viewBox="0 0 1280 720">
<rect x="0" y="0" width="1280" height="720" fill="#F8FAFC" />
<path d="M0,0 L10,5 L0,10 Z" fill="#172554" />
<text x="70" y="70" font-size="30" fill="#172554">Readable navy title on light page</text>
</svg>"""
light_card = """<svg width="1280" height="720" viewBox="0 0 1280 720">
<rect x="0" y="0" width="1280" height="720" fill="#0B1220" />
<path fill="#FFFFFF" d="M100,170 H610 A10,10 0 0 1 620,180 V300 A10,10 0 0 1 610,310 H100 A10,10 0 0 1 90,300 V180 A10,10 0 0 1 100,170 Z" />
<text x="160" y="210" font-size="22" fill="#172554">Readable navy title inside card</text>
</svg>"""
dark_page = """<svg width="1280" height="720" viewBox="0 0 1280 720">
<rect x="0" y="0" width="1280" height="720" fill="#0B1220" />
<text x="70" y="70" font-size="30" fill="#172554">Unreadable navy title on dark page</text>
</svg>"""
assert low_count(light_page) == 0
assert low_count(light_card) == 0
assert low_count(dark_page) == 1
`, "adapter dark-template contrast regression");

const diagramRouter = readWorkspaceFile("services/ai-tools-engine/app/tools/diagram_canvas/router.py");
assertIncludes(diagramRouter, "501", "diagram canvas placeholder should return 501");

const createRoute = readWorkspaceFile("app/api/smart-tools/academic-ppt/tasks/route.ts");
assertIncludes(createRoute, "enqueueAcademicPptTask", "create route enqueues task");
assertIncludes(createRoute, "scheduleAcademicPptQueue", "create route schedules queue");
assertIncludes(createRoute, 'status: "queued"', "create route returns queued");
assertNotIncludes(createRoute, "runAcademicPptTask(", "create route must not run long tasks");

const monitor = readWorkspaceFile("components/smart-tools/academic-ppt/AcademicPptTaskMonitor.tsx");
assertIncludes(monitor, "生成服务", "monitor source labels should be product friendly");
assertIncludes(monitor, "visualPipelineStatus", "monitor should display visual pipeline status");
assertIncludes(monitor, "内部滚动", "monitor should keep overflowing details inside the progress panel");
assertIncludes(monitor, "联网补充暂不可用", "monitor degraded search copy");
assertNotIncludes(monitor, "paper-ppt-agent native", "monitor must not expose implementation source labels");
assertNotIncludes(monitor, "Python Tools Engine", "monitor must not expose implementation service labels");
assertNotIncludes(monitor, "basic fallback deck", "monitor must not expose fallback implementation copy");
assertIncludes(monitor, "生成服务依赖尚未就绪", "monitor dependency-safe error");

const logsPanel = readWorkspaceFile("components/smart-tools/academic-ppt/AcademicPptLogsPanel.tsx");
for (const hidden of ["python", "sidecar", "paper-ppt-agent", "tools engine", "AI_TOOLS_ENGINE_URL", "ACADEMIC_PPT_AGENT_URL", "provider", "Base URL"]) {
  assertIncludes(logsPanel.toLowerCase(), hidden.toLowerCase(), `logs panel should sanitize ${hidden}`);
}
assertIncludes(logsPanel, "生成服务依赖尚未就绪", "logs panel dependency-safe message");
assertIncludes(logsPanel, "正在分析和生成内容", "logs panel should sanitize model bridge progress copy");
assertIncludes(logsPanel, "已生成第", "logs panel should translate generated slide progress");

const settingsPanel = readWorkspaceFile("components/smart-tools/academic-ppt/AcademicPptSettingsPanel.tsx");
assertIncludes(settingsPanel, "高级选项", "settings should place optional features under advanced options");
assertIncludes(settingsPanel, "深入分析资料结构，提炼研究背景、问题、方法与结论。", "settings should use product copy for deep research");
assertIncludes(settingsPanel, "联网补充公开资料，丰富背景信息和参考依据。", "settings should use product copy for external research");
assertIncludes(settingsPanel, "检查版式、可读性和内容完整度。", "settings should use product copy for visual QA");
assertIncludes(settingsPanel, "自动添加图标、点缀元素和视觉辅助。", "settings should use product copy for icon decoration");
assertIncludes(settingsPanel, "支持 PDF、TXT、Markdown、PPTX 等资料，PDF 解析耗时可能更长。", "settings should use product copy for supported files");
assertIncludes(settingsPanel, "min-w-[280px]", "settings panel should keep a fixed minimum width");
assertIncludes(settingsPanel, "max-w-[320px]", "settings panel should keep a fixed maximum width");
assertIncludes(settingsPanel, "line-clamp-2", "settings descriptions should not cause horizontal overflow");
assertNotIncludes(settingsPanel, "paper-ppt-agent", "settings must not expose implementation names");
assertNotIncludes(settingsPanel, "映射", "settings must not expose mapping copy");
assertNotIncludes(settingsPanel, "失败不丢弃可用 PPTX", "settings must not expose engineering QA copy");

const sourcePanel = readWorkspaceFile("components/smart-tools/academic-ppt/AcademicPptSourcePanel.tsx");
assertIncludes(sourcePanel, "Trash2", "recent tasks should expose hover delete affordance");
assertIncludes(sourcePanel, "onRecentTaskDismiss", "recent tasks should support front-end dismissal");
assertIncludes(sourcePanel, "event.stopPropagation()", "recent task delete should not select the task");
assertIncludes(sourcePanel, "group-hover:opacity-100", "recent task delete should appear on hover");

const previewCanvas = readWorkspaceFile("components/smart-tools/academic-ppt/AcademicPptPreviewCanvas.tsx");
assertIncludes(previewCanvas, "Native PPTX preview", "preview should label native PPTX image previews");
assertIncludes(previewCanvas, "Real SVG preview", "preview should label real SVG previews");
assertIncludes(previewCanvas, "结构化占位预览", "preview should label structured placeholders");
assertIncludes(previewCanvas, "最终排版以下载后的 PPTX 为准。", "preview should clarify PPTX is authoritative");
assertIncludes(previewCanvas, 'nativePreview?.source === "native_preview"', "preview mode should use manifest source");
assertIncludes(previewCanvas, "activeSlideIndex", "preview should render from a 0-based active slide index");
assertIncludes(previewCanvas, "previewSlides", "preview thumbnails and main image should share one manifest slide array");
assertIncludes(previewCanvas, "pageNumber", "preview should display 1-based page numbers");
assertIncludes(previewCanvas, "slide.publicUrl || slide.url || slide.imageUrl", "preview should be storage-provider agnostic");
assertIncludes(previewCanvas, "const nativePreviewCount = nativePreview?.available ? previewSlides.length : 0", "preview canvas should only render pages listed in manifest.slides");
assertNotIncludes(previewCanvas, "previewSlide.index === index + 1", "preview should not mix 1-based manifest indexes with 0-based UI indexes");
assertNotIncludes(previewCanvas, "nativePreview.previewCount || nativePreview.slides.length || nativePreview.slideCount", "preview canvas must not request images based on slideCount");
assertNotIncludes(previewCanvas, "native paper-ppt-agent pipeline", "preview placeholder must not expose implementation names");

const previewManifestRoute = readWorkspaceFile("app/api/smart-tools/academic-ppt/tasks/[taskId]/preview/route.ts");
assertIncludes(previewManifestRoute, 'manifest.status === "pending"', "preview manifest route should return 202 for existing tasks whose preview is still pending");
assertIncludes(previewManifestRoute, "PREVIEW_NOT_FOUND", "preview manifest route should reserve 404 for missing tasks only");

const previewPageRoute = readWorkspaceFile("app/api/smart-tools/academic-ppt/tasks/[taskId]/preview/[slideIndex]/route.ts");
assertIncludes(previewPageRoute, "readAcademicPptTaskRecord", "preview page route should distinguish missing tasks from missing preview assets");
assertIncludes(previewPageRoute, "PREVIEW_PENDING", "preview page route should return pending instead of 404 while assets are not ready");
assertIncludes(previewPageRoute, "PREVIEW_UNAVAILABLE", "preview page route should return unavailable instead of 404 when a task exists but a page asset is missing");

const previewRenderer = readWorkspaceFile("lib/smart-tools/academic-ppt/preview-renderer.ts");
assertIncludes(previewRenderer, "readExistingAvailableManifest", "native preview fallback must preserve an existing real SVG manifest");

const workbenchPreview = readWorkspaceFile("components/smart-tools/academic-ppt/AcademicPptWorkbench.tsx");
assertIncludes(workbenchPreview, "preview?.slides.length", "workbench should derive preview pages from manifest.slides only");
assertNotIncludes(workbenchPreview, "preview.previewCount || preview.slides.length || preview.slideCount", "workbench must not synthesize preview pages from slideCount");

const templateOptions = readWorkspaceFile("components/smart-tools/academic-ppt/academic-ppt-options.ts");
assertIncludes(templateOptions, "电子科技大学", "front-end template dropdown should expose the builtin school template display name");

const academicPptTypes = readWorkspaceFile("lib/smart-tools/academic-ppt/types.ts");
assertIncludes(academicPptTypes, '"school_academic_report"', "template style enum should include the builtin school template");

const templateRegistry = readWorkspaceFile("lib/smart-tools/academic-ppt/template-registry.ts");
assertIncludes(templateRegistry, 'id: "school_academic_report"', "template registry should include the builtin school template");
assertIncludes(templateRegistry, 'name: "电子科技大学"', "template registry should use the school template display name");
assertIncludes(templateRegistry, 'school_academic_report: "school_academic_report"', "template style should map to the builtin school template id");

const paperPptAdapter = readWorkspaceFile("services/ai-tools-engine/app/tools/academic_ppt/paper_ppt_adapter.py");
assertIncludes(paperPptAdapter, "BUILTIN_TEMPLATE_ID = \"school_academic_report\"", "adapter should know the builtin school template id");
assertIncludes(paperPptAdapter, "_builtin_template_metadata", "adapter should read builtin template metadata");
assertIncludes(paperPptAdapter, "_builtin_template_instruction", "adapter should inject builtin template constraints");
assertIncludes(paperPptAdapter, "school_academic_report", "adapter should map the school template style");
assertIncludes(
  paperPptAdapter,
  "_assess_builtin_template_role_plan",
  "adapter should let final builtin template role mapping validate blueprint PPTX output"
);

assertFile("services/ai-tools-engine/app/tools/academic_ppt/templates/builtin/school_academic_report/template.pptx");
assertFile("services/ai-tools-engine/app/tools/academic_ppt/templates/builtin/school_academic_report/template.json");
const schoolTemplateMetadata = JSON.parse(
  readWorkspaceFile("services/ai-tools-engine/app/tools/academic_ppt/templates/builtin/school_academic_report/template.json")
) as {
  templateId?: string;
  displayName?: string;
  templateFamily?: string;
  theme?: {
    primaryColor?: string;
    secondaryColor?: string;
    gradientStartColor?: string;
    gradientEndColor?: string;
    accentColor?: string;
  };
  coordinateSystem?: { type?: string; width?: number; height?: number; unit?: string };
  sanitized?: boolean;
  source?: string;
  fontPolicy?: {
    preserveEmbeddedFonts?: boolean;
    headingFontFamily?: string;
    bodyFontFamily?: string;
    fallbackFonts?: string[];
  };
  layoutPolicy?: {
    preserveMasterHeader?: boolean;
    preserveLogoPosition?: boolean;
    preserveOriginalTextBoxPosition?: boolean;
    preserveOriginalFontSize?: boolean;
    disableGeneratedFooterPageNumber?: boolean;
    doNotMoveSchoolLogo?: boolean;
    doNotRedrawHeader?: boolean;
  };
  layoutTypes?: {
    cover?: unknown[];
    toc?: unknown[];
    section?: unknown[];
    content?: unknown[];
    imageText?: unknown[];
    chart?: unknown[];
    summary?: unknown[];
  };
  variants?: Record<
    string,
    Array<{
      variantId?: string;
      sourceFile?: string;
      sourceSlideIndex?: number;
      templateSlideIndex?: number;
      role?: string;
      slots?: Record<string, { x?: number; y?: number; w?: number; h?: number; fontSize?: number; color?: string }>;
    }>
  >;
  placeholderPolicy?: {
    replaceOnlyKnownPlaceholders?: boolean;
    removePowerPointDefaultPrompts?: boolean;
    removeUnfilledPlaceholders?: boolean;
  };
};
if (schoolTemplateMetadata.templateId !== "school_academic_report" || schoolTemplateMetadata.sanitized !== true) {
  throw new Error("builtin school template metadata should be sanitized and use stable templateId=school_academic_report");
}
if (schoolTemplateMetadata.displayName !== "电子科技大学") {
  throw new Error("builtin school template metadata should use displayName=电子科技大学");
}
if (schoolTemplateMetadata.templateFamily !== "cqupt-purple-academic") {
  throw new Error("builtin school template metadata should define templateFamily=cqupt-purple-academic");
}
if (
  schoolTemplateMetadata.coordinateSystem?.type !== "inches" ||
  schoolTemplateMetadata.coordinateSystem.width !== 13.333 ||
  schoolTemplateMetadata.coordinateSystem.height !== 7.5
) {
  throw new Error("builtin school template metadata should define a single 16:9 inch coordinate system");
}
if (schoolTemplateMetadata.source !== "builtin-pptx-template" || schoolTemplateMetadata.fontPolicy?.preserveEmbeddedFonts !== true) {
  throw new Error("builtin school template metadata should preserve embedded font policy and source type");
}
if (
  schoolTemplateMetadata.theme?.primaryColor !== "#801C80" ||
  schoolTemplateMetadata.theme.secondaryColor !== "#9D229D" ||
  schoolTemplateMetadata.theme.gradientStartColor !== "#811C81" ||
  schoolTemplateMetadata.theme.gradientEndColor !== "#9D229D" ||
  schoolTemplateMetadata.theme.accentColor !== "#801C80"
) {
  throw new Error("builtin school template metadata should use the required purple theme #801C80 and gradient #811C81 -> #9D229D");
}
if (
  schoolTemplateMetadata.fontPolicy?.headingFontFamily !== "SimSun" ||
  schoolTemplateMetadata.fontPolicy.bodyFontFamily !== "SimHei" ||
  !schoolTemplateMetadata.fontPolicy.fallbackFonts?.includes("SimSun") ||
  !schoolTemplateMetadata.fontPolicy.fallbackFonts?.includes("SimHei")
) {
  throw new Error("builtin school template metadata should prefer bold Songti headings and Heiti body text");
}
const schoolLayoutPolicy = schoolTemplateMetadata.layoutPolicy;
if (
  !schoolLayoutPolicy?.preserveMasterHeader ||
  !schoolLayoutPolicy.preserveLogoPosition ||
  !schoolLayoutPolicy.preserveOriginalTextBoxPosition ||
  !schoolLayoutPolicy.preserveOriginalFontSize ||
  !schoolLayoutPolicy.disableGeneratedFooterPageNumber ||
  !schoolLayoutPolicy.doNotMoveSchoolLogo ||
  !schoolLayoutPolicy.doNotRedrawHeader
) {
  throw new Error("builtin school template metadata should lock master header, logo, geometry, font size, and generated page numbers");
}
for (const layoutType of ["cover", "toc", "section", "content", "imageText", "chart", "summary"] as const) {
  if (!Array.isArray(schoolTemplateMetadata.layoutTypes?.[layoutType]) || !schoolTemplateMetadata.layoutTypes[layoutType]?.length) {
    throw new Error(`builtin school template metadata should map ${layoutType} layouts`);
  }
}
for (const role of ["cover", "toc", "section", "content", "imageText", "chart", "summary", "ending"] as const) {
  const variants = schoolTemplateMetadata.variants?.[role];
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error(`builtin school template blueprint should include ${role} variants`);
  }
  for (const variant of variants) {
    if (!variant.variantId || !variant.sourceFile || !variant.sourceSlideIndex || !variant.templateSlideIndex || variant.role !== role) {
      throw new Error(`builtin school template ${role} variant should preserve source and template slide identity`);
    }
    const slots = variant.slots || {};
    if (!slots.title && role !== "toc") {
      throw new Error(`builtin school template ${variant.variantId} should define a title slot`);
    }
    const requiredSlot = role === "cover" ? "subtitle" : role === "toc" ? "tocItems" : role === "section" ? "sectionTitle" : role === "ending" ? "closingText" : "body";
    if (!slots[requiredSlot]) {
      throw new Error(`builtin school template ${variant.variantId} should define ${requiredSlot} slot`);
    }
  }
}
if (
  !schoolTemplateMetadata.placeholderPolicy?.replaceOnlyKnownPlaceholders ||
  !schoolTemplateMetadata.placeholderPolicy.removePowerPointDefaultPrompts ||
  !schoolTemplateMetadata.placeholderPolicy.removeUnfilledPlaceholders
) {
  throw new Error("builtin school template metadata should define placeholder cleanup policy");
}
assertPythonPasses(
  `
import json, re, zipfile
from pathlib import Path
from pptx import Presentation
template = Path("services/ai-tools-engine/app/tools/academic_ppt/templates/builtin/school_academic_report/template.pptx")
forbidden = [
    "学校简介", "学校概况", "重电实践", "申报准备", "建设探索", "时代背景", "重电举措", "未来计划",
    "人工智能赋能", "博士", "二级教授", "博导", "姓名", "职务", "2566", "22369", "1226",
    "Artificial Intelligence", "达特茅斯", "国家战略有要求", "数字化重塑"
]
placeholders = {"{{TITLE}}", "{{SUBTITLE}}", "{{AUTHOR}}", "{{DATE}}", "{{SECTION_TITLE}}", "{{SLIDE_TITLE}}", "{{BODY}}", "{{KEY_POINTS}}", "{{CHART}}", "{{IMAGE}}", "{{FOOTER}}"}
forbidden = [
    "学校简介", "学校概况", "重电实践", "申报准备", "建设探索", "时代背景", "重电举措", "未来计划", "未来规划",
    "人工智能赋能", "博士", "二级教授", "博导", "姓名", "职务", "Artificial Intelligence", "达特茅斯",
    "国家战略有要求", "数字化重塑", "新双高、新内涵", "双高计划", "DeepSeek", "OBE+AI", "谢谢"
]
with zipfile.ZipFile(template) as z:
    names = z.namelist()
    assert any(name.startswith("ppt/slideMasters/") for name in names), "masters missing"
    assert any(name.startswith("ppt/slideLayouts/") for name in names), "layouts missing"
    assert any(name.startswith("ppt/media/") for name in names), "media missing"
    assert any(name.startswith("ppt/fonts/") for name in names), "embedded font files missing"
    assert not any(name.startswith("ppt/notesSlides/") for name in names), "template should not contain notes slide parts"
    assert not any(name.startswith("ppt/notesMasters/") for name in names), "template should not contain notes master parts"
    xml_text = "\\n".join(
        z.read(name).decode("utf-8", "ignore")
        for name in names
        if name.endswith(".xml") and (name.startswith("ppt/") or name.startswith("docProps/"))
    )
    rel_text = "\\n".join(
        z.read(name).decode("utf-8", "ignore")
        for name in names
        if name.endswith(".rels")
    )
    content_types = z.read("[Content_Types].xml").decode("utf-8", "ignore")
    assert "notesSlide" not in rel_text + content_types, "template relationships/content types should not reference notes slides"
    assert "notesMaster" not in rel_text + content_types, "template relationships/content types should not reference notes masters"
    upper_xml = xml_text.upper()
    assert "801C80" in upper_xml, "template XML should include required primary purple #801C80"
    assert "9D229D" in upper_xml, "template XML should include required gradient purple #9D229D"
    for stale_color in ["156082", "0F9ED5", "4EA72E", "801C44", "801D7F", "92278F", "9B32A7"]:
        assert stale_color not in upper_xml, f"template XML should not retain stale theme color {stale_color}"
    visible_text = "\\n".join(
        match.group(1)
        for match in re.finditer(
            r"<(?:[A-Za-z0-9_]+:)?(?:t|v|title|subject|creator|keywords|description|lastModifiedBy|category|contentStatus|version|lpstr|lpwstr)(?:\\s+[^>]*)?>(.*?)</(?:[A-Za-z0-9_]+:)?(?:t|v|title|subject|creator|keywords|description|lastModifiedBy|category|contentStatus|version|lpstr|lpwstr)>",
            xml_text,
            flags=re.S,
        )
    )
    leaked = [item for item in forbidden if item in visible_text]
    assert not leaked, "template still contains source example text: " + ", ".join(leaked)
    found_placeholders = {item for item in placeholders if item in xml_text}
    assert not found_placeholders, "template should not contain visible control placeholders: " + ", ".join(sorted(found_placeholders))
    placeholder_instances = re.findall(r"\\{\\{[A-Z_]+\\}\\}", xml_text)
    assert not placeholder_instances, f"template contains explicit placeholders: {len(placeholder_instances)}"
    assert not re.search(r'(?:name|fmla|x|y|cxn|gd)="[^"]*\\{\\{', xml_text), "template placeholders must not appear in geometry attributes"
    assert "单击此处添加标题" not in xml_text, "PowerPoint default Chinese title prompt should be removed"
    assert "Click to add title" not in xml_text, "PowerPoint default English title prompt should be removed"
    doc_props_text = "\\n".join(
        z.read(name).decode("utf-8", "ignore")
        for name in names
        if name.startswith("docProps/") and name.endswith(".xml")
    )
    assert "NexusAI" not in doc_props_text, "template package metadata should not contain generated author names"
    doc_prop_placeholders = sorted({item for item in placeholders if item in doc_props_text})
    assert not doc_prop_placeholders, "template package metadata should not contain placeholders: " + ", ".join(doc_prop_placeholders)
presentation = Presentation(str(template))
assert len(presentation.slides) >= 8, "template should be parseable and contain the blueprint slide family"
`,
  "sanitized builtin school template"
);
assertIncludes(
  paperPptAdapter,
  "_remove_unfilled_pptx_placeholders",
  "adapter should remove unfilled builtin placeholders from exported PPTX"
);
assertIncludes(
  paperPptAdapter,
  "_recompose_builtin_template_pptx",
  "adapter should recompose builtin school PPTX on top of the source template"
);
assertIncludes(
  paperPptAdapter,
  "_builtin_template_select_variants",
  "adapter should select builtin school template variants from the blueprint"
);
assertIncludes(
  paperPptAdapter,
  "_fill_builtin_template_slot",
  "adapter should fill explicit blueprint slots instead of relying on visible placeholders"
);
assertIncludes(
  paperPptAdapter,
  "from pptx.oxml.xmlchemy import OxmlElement",
  "adapter should use the python-pptx OxmlElement import path available in the runtime"
);
assertPythonPasses(
  `
from pathlib import Path
import sys
import zipfile
from pptx import Presentation
from pptx.util import Inches

sys.path.insert(0, str(Path("services/ai-tools-engine").resolve()))
from app.tools.academic_ppt.paper_ppt_adapter import _set_pptx_shape_text

target = Path("tmp/check-school-template-fonts.pptx")
target.parent.mkdir(parents=True, exist_ok=True)
presentation = Presentation()
slide = presentation.slides.add_slide(presentation.slide_layouts[6])
title_shape = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(5), Inches(1))
body_shape = slide.shapes.add_textbox(Inches(1), Inches(2), Inches(5), Inches(1))
_set_pptx_shape_text(title_shape, "标题字体检查", font_size=30, font_family="SimSun", color="801C80", bold=True)
_set_pptx_shape_text(body_shape, "正文字体检查", font_size=16, font_family="SimHei", color="3F3F3F", bold=False)
presentation.save(str(target))
with zipfile.ZipFile(target) as archive:
    xml_text = "\\n".join(
        archive.read(name).decode("utf-8", "ignore")
        for name in archive.namelist()
        if name.startswith("ppt/slides/") and name.endswith(".xml")
    )
assert "SimSun" in xml_text, "generated title text should write SimSun into PPTX XML"
assert "SimHei" in xml_text, "generated body text should write SimHei into PPTX XML"
assert "801C80" in xml_text, "generated title text should write the required purple color"
target.unlink(missing_ok=True)
`,
  "builtin school generated font writing"
);
assertPythonPasses(
  `
from pathlib import Path
import sys

sys.path.insert(0, str(Path("services/ai-tools-engine").resolve()))
from app.tools.academic_ppt.paper_ppt_adapter import _builtin_template_metadata, _builtin_template_select_variants

metadata = _builtin_template_metadata()
generated_texts = [
    ["Cover title"],
    ["Contents"],
    ["Section divider"],
    ["comparison body"],
    ["comparison body"],
    ["comparison body"],
    ["comparison body"],
    ["Summary"],
]
selected, role_mapping = _builtin_template_select_variants(
    metadata,
    generated_texts,
    {"targetSlides": 8, "taskId": "stability-duplicate-variant-plan"},
)
template_slide_indexes = [item["templateSlideIndex"] for item in selected]
assert len(selected) == 8, "selectedVariants should match target slide count"
assert len(role_mapping) == 8, "roleMapping should match target slide count"
assert len(template_slide_indexes) == len(set(template_slide_indexes)), "variant selection should avoid duplicate templateSlideIndex values when unused body slides are available"
`,
  "builtin school unique variant selection"
);
assertIncludes(
  paperPptAdapter,
  "selectedVariants",
  "adapter should report selected builtin school template variants"
);
assertIncludes(
  paperPptAdapter,
  "roleMapping",
  "adapter should report builtin school template role mapping"
);
assertIncludes(
  paperPptAdapter,
  "_delete_presentation_slides_except",
  "adapter should preserve selected source template slides instead of creating a second template"
);
assertIncludes(
  paperPptAdapter,
  "_sanitize_powerpoint_default_prompts",
  "adapter should remove PowerPoint default placeholder prompts from exported PPTX"
);
assertNotIncludes(
  paperPptAdapter,
  "_apply_builtin_template_chrome(project_dir, settings)",
  "adapter must not redraw builtin school SVG chrome"
);
assertNotIncludes(
  paperPptAdapter,
  "_apply_builtin_template_pptx_chrome(output_file, settings)",
  "adapter must not redraw builtin school PPTX chrome or add page numbers"
);
assertNotIncludes(
  paperPptAdapter,
  "{slide_index:02d}/{slide_count:02d}",
  "adapter must not add generated footer page numbers to builtin school template"
);
assertNotIncludes(
  paperPptAdapter,
  "_add_builtin_template_textbox(slide, 0.55, 1.08",
  "adapter must not add a duplicate body-slide title over the template header/title placeholder"
);
assertNotIncludes(
  paperPptAdapter,
  "_add_builtin_template_textbox(slide, x, 1.9",
  "adapter should not render body cards by bypassing existing template text boxes"
);
const academicPptTypesSource = readWorkspaceFile("lib/smart-tools/academic-ppt/types.ts");
assertIncludes(academicPptTypesSource, "selectedVariants", "task types should expose selected template variants");
assertIncludes(academicPptTypesSource, "roleMapping", "task types should expose role mapping");

const toolsEngineClientSource = readWorkspaceFile("lib/smart-tools/academic-ppt/tools-engine-client.ts");
assertIncludes(toolsEngineClientSource, "selectedVariants", "tools-engine client should persist selected template variants");
assertIncludes(toolsEngineClientSource, "roleMapping", "tools-engine client should persist role mapping");

const searchBridge = readWorkspaceFile("services/ai-tools-engine/app/core/search_bridge.py");
assertIncludes(searchBridge, "SEARCH_BASE_URL", "search bridge should use server-side endpoint config");
assertIncludes(searchBridge, "http://127.0.0.1:8080", "search bridge default searxng endpoint");
assertIncludes(searchBridge, "trust_env=False", "search bridge should avoid ambient proxy env");
assertNotIncludes(searchBridge, "Authorization", "search bridge must not expose auth headers");
assertNotIncludes(searchBridge, "api_key", "search bridge must not use api keys");

const engineConfig = readWorkspaceFile("services/ai-tools-engine/app/core/config.py");
assertIncludes(engineConfig, "search_provider", "engine config should expose server-side search provider");
assertIncludes(engineConfig, "search_base_url", "engine config should expose server-side search endpoint");
assertIncludes(engineConfig, "search_timeout_seconds", "engine config should expose search timeout");
assertIncludes(engineConfig, "model_bridge_request_timeout_seconds", "engine config should allow bridge retry/fallback to finish");
assertIncludes(engineConfig, '"1800"', "engine model bridge timeout default should cover strategy GPT-5.4 retries plus fallback");

const pythonModelBridge = readWorkspaceFile("services/ai-tools-engine/app/core/model_bridge.py");
assertIncludes(pythonModelBridge, "model_bridge_request_timeout_seconds", "Python model bridge should wait across primary retries and fallback");
assertIncludes(pythonModelBridge, "\"stream\": True", "Python model bridge should ask Next internal bridge to use stream aggregation");
assertIncludes(pythonModelBridge, "strictVisualPipeline", "Python model bridge should tell Next about strict visual mode");
assertIncludes(pythonModelBridge, "_is_retryable_bridge_error", "Python model bridge should recognize structured retryable errors from Next");
assertIncludes(pythonModelBridge, "retryable", "Python model bridge should inspect retryable structured errors");

const readme = readWorkspaceFile("lib/smart-tools/academic-ppt/README.md");
assertIncludes(readme, "Python Tools Engine", "README tools engine architecture");
assertIncludes(readme, "paper-ppt-agent core", "README paper-ppt-agent primary generator");
assertIncludes(readme, "TypeScript", "README TypeScript fallback");
assertIncludes(readme, "AI_TOOLS_ENGINE_URL", "README new env");
assertIncludes(readme, "POST /api/internal/academic-ppt/model", "README model bridge");
assertIncludes(readme, "npm.cmd run dev -- -p 3099", "README Windows npm.cmd guidance");
assertIncludes(readme, "searxng / search", "README 8080 reserved for search");
assertIncludes(readme, "http://127.0.0.1:8010", "README engine port");
assertIncludes(readme, "manual-sidecar-review", "README manual sidecar review");
assertIncludes(readme, "structured preview", "README preview fallback");

const engineReadme = readWorkspaceFile("services/ai-tools-engine/README.md");
assertIncludes(engineReadme, "academic-ppt", "engine README academic-ppt");
assertIncludes(engineReadme, "diagram-canvas", "engine README diagram placeholder");
assertIncludes(engineReadme, "paper-ppt-agent", "engine README paper-ppt-agent");
assertIncludes(engineReadme, "npm.cmd run dev -- -p 3099", "engine README npm.cmd");
assertIncludes(engineReadme, "127.0.0.1:8010", "engine README engine port");
assertIncludes(engineReadme, "127.0.0.1:8080", "engine README search port");
assertIncludes(engineReadme, "check_deps.py", "engine README dependency check");
assertIncludes(engineReadme, "manual-sidecar-review", "engine README manual sidecar review");

const smokeToolsEngine = readWorkspaceFile("scripts/academic-ppt/smoke-tools-engine.ts");
assertIncludes(smokeToolsEngine, "AI_TOOLS_ENGINE_URL", "smoke tools engine env");
assertIncludes(smokeToolsEngine, "/health", "smoke tools engine health");
assertIncludes(smokeToolsEngine, "/api/smart-tools/academic-ppt/tasks", "smoke uses Next.js API");
assertIncludes(smokeToolsEngine, "local-fallback", "smoke rejects local fallback");
assertIncludes(smokeToolsEngine, "ACADEMIC_PPT_SMOKE_KEEP_TASKS", "smoke keep tasks env");
assertIncludes(smokeToolsEngine, "getTaskEventually", "smoke should tolerate brief post-create task visibility lag");

const manualSidecarReview = readWorkspaceFile("scripts/academic-ppt/manual-sidecar-review.ts");
assertIncludes(manualSidecarReview, "/api/smart-tools/academic-ppt/tasks", "manual sidecar review uses Next.js API");
assertIncludes(manualSidecarReview, "zh-paper-abstract", "manual sidecar review Chinese paper sample");
assertIncludes(manualSidecarReview, "zh-tech-proposal", "manual sidecar review Chinese proposal sample");
assertIncludes(manualSidecarReview, "en-paper-abstract", "manual sidecar review English paper sample");
assertIncludes(manualSidecarReview, "local-fallback", "manual sidecar review rejects fallback");
assertIncludes(manualSidecarReview, "ACADEMIC_PPT_SIDEcar_REVIEW_KEEP_TASKS", "manual sidecar review keep env");
assertIncludes(manualSidecarReview, "outputs/academic-ppt-result.pptx", "manual sidecar review output relative path");

const modelBridgeCheck = readWorkspaceFile("scripts/academic-ppt/check-model-bridge.ts");
assertIncludes(modelBridgeCheck, "/api/internal/academic-ppt/model", "model bridge check route");
assertIncludes(modelBridgeCheck, "x-forwarded-for", "model bridge check local header");
assertIncludes(modelBridgeCheck, "Return a JSON object with title and bullets", "model bridge check should call a real minimal prompt");
assertIncludes(modelBridgeCheck, "simulatePrimaryFailure", "model bridge check should validate fallback path");
assertIncludes(modelBridgeCheck, "simulateFallbackSuccess", "model bridge check should validate fallback diagnostics without requiring live fallback provider availability");
assertIncludes(modelBridgeCheck, "simulatePrimaryTransientFailures", "model bridge check should validate primary retry path");
assertIncludes(modelBridgeCheck, "simulatePrimarySuccessAfterTransient", "model bridge check should validate retry behavior even when the live primary provider is unavailable");
assertIncludes(modelBridgeCheck, "primaryAttempts", "model bridge check output should include primary attempts");
assertIncludes(modelBridgeCheck, "fallbackAttempts", "model bridge check output should include fallback attempts");
assertIncludes(modelBridgeCheck, "simulatePrimaryTransientFailures: 3", "model bridge check should validate strategy retry success path");
assertIncludes(modelBridgeCheck, "simulatePrimaryTransientFailures: 6", "model bridge check should validate strategy six-attempt retry exhaustion");
assertIncludes(modelBridgeCheck, "simulatePrimaryStreamInterruptedFailures", "model bridge check should validate stream interruption retry behavior");
assertIncludes(modelBridgeCheck, "stream_interrupted", "model bridge check should validate structured stream interruption error type");
assertIncludes(modelBridgeCheck, 'fallbackStatus !== "skipped"', "model bridge check should verify strict visual Kimi fallback is skipped");
assertIncludes(modelBridgeCheck, "primaryModel", "model bridge check output should include primary model");
assertIncludes(modelBridgeCheck, "fallbackModel", "model bridge check output should include fallback model");

const forbiddenTouchedRoots = [
  "app/api/ai/chat",
  "lib/capability-map",
  "app/api/capability-map",
  "lib/document",
  "lib/image",
  "lib/video",
  "lib/model3d"
];
for (const forbiddenRoot of forbiddenTouchedRoots) {
  if (!existsSync(workspacePath(forbiddenRoot))) continue;
}

const tempFiles = readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.join(entry.parentPath, entry.name))
  .filter((filePath) => {
    const normalized = filePath.split(path.sep).join("/");
    if (normalized.includes("/data/academic-ppt/tasks/")) return false;
    const name = path.basename(filePath);
    return name.startsWith(".tmp-academic-ppt") || /^academic-ppt.*(smoke|start|tmp|preview-result|result).*\.(log|json)$/i.test(name);
  });
if (tempFiles.length) {
  throw new Error(`temporary academic-ppt files found: ${tempFiles.join(", ")}`);
}

console.log("academic-ppt tools-engine stability checks passed");
