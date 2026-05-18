# NexusAI Academic PPT

`Smart Tools -> Academic PPT` is now a NexusAI task shell backed by the unified Python Tools Engine.

The browser calls only:

```text
/api/smart-tools/academic-ppt/*
```

It never calls Python directly and never receives provider settings, API keys, Base URLs, request IDs, stack traces, or local filesystem paths.

## Current Architecture

```text
Next.js NexusAI
  - workbench UI
  - uploads
  - task id creation
  - queue scheduling
  - task.json / logs.json / checkpoints
  - recent tasks
  - cancel / resume
  - download route
  - internal model bridge

Python Tools Engine
  - /health
  - /tools/academic-ppt/*
  - /tools/diagram-canvas/* placeholder only
```

Academic PPT's primary generator is:

```text
Python Tools Engine -> academic-ppt tool -> local paper-ppt-agent core
```

The TypeScript `pptx-writer.ts`, `template-registry.ts`, `layout-planner.ts`, and local outline flow are retained only as fallback. They are not the primary generator and must be labeled as limited fallback whenever used.

## Runtime URLs

```text
Next.js:              http://127.0.0.1:3000 or http://127.0.0.1:3099
Python Tools Engine:  http://127.0.0.1:8010
searxng / search:     http://127.0.0.1:8080
```

Port `8080` is reserved for searxng / search. Do not configure the Python Tools Engine to use `8080`.

Next.js resolves the academic-ppt tool endpoint with this priority:

```text
AI_TOOLS_ENGINE_URL=http://127.0.0.1:8010
ACADEMIC_PPT_AGENT_URL=http://127.0.0.1:8010/tools/academic-ppt
```

The model bridge URL sent to Python is resolved separately:

```text
NEXT_PUBLIC_APP_URL
-> current request origin
-> NEXUSAI_BASE_URL
-> http://127.0.0.1:3000
```

If local Next.js runs on port `3000`, set `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000`.
If local Next.js runs on port `3099`, set `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3099`.

Python waits for the full academic-ppt model bridge retry chain. Use `AI_TOOLS_MODEL_BRIDGE_REQUEST_TIMEOUT_SECONDS` for that outer wait; keep it larger than GPT-5.4 primary timeout + staged retry backoff + fallback timeout. The default is `1800` seconds, while `AI_TOOLS_MODEL_TIMEOUT_SECONDS` remains the per-attempt timeout sent to Next.js.

The academic-ppt model bridge keeps GPT-5.4 as the preferred model for key paper-ppt-agent stages. `strategy` / design-spec calls get up to 6 GPT-5.4 attempts, while `generation`, `visual_qa`, `research`, `manuscript`, SVG, and repair calls get up to 4 GPT-5.4 attempts. Retry backoff is progressive: 5s, 15s, 30s, 60s, then 120s.

Strict visual mode is enabled by default:

```text
ACADEMIC_PPT_STRICT_VISUAL_PIPELINE=true
ACADEMIC_PPT_ALLOW_KIMI_FINAL_FALLBACK=false
ACADEMIC_PPT_MAX_PRIMARY_RETRIES_STRATEGY=6
ACADEMIC_PPT_MAX_PRIMARY_RETRIES_DEFAULT=4
AI_TOOLS_MODEL_BRIDGE_REQUEST_TIMEOUT_SECONDS=1800
```

Kimi can still help non-final content fallback paths when allowed, but it must not produce the final visual strategy / design spec / SVG result in strict visual mode. If GPT-5.4 is unavailable after the retry chain, the task should fail or become resumable instead of reporting success with a basic parsed-text deck.

## Pipeline

```text
upload
-> create taskId
-> write task.json
-> queued
-> queue dispatch
-> task-runner lock
-> POST /tools/academic-ppt/tasks
-> poll Python task status
-> sync Python logs into logs.json
-> paper-ppt-agent parses/plans/generates/exports PPTX
-> copy/register outputs/academic-ppt-result.pptx
-> real svg_final preview when available, otherwise clearly labeled structured preview
-> success
```

`POST /api/smart-tools/academic-ppt/tasks` returns quickly with `status: "queued"`. Long generation never runs inside the upload request.

## Task Repository

```text
data/academic-ppt/tasks/{taskId}/
  task.json
  logs.json
  uploads/
  checkpoints/
  outputs/
  previews/
```

Python may only read and write inside the current task directory. It writes tool checkpoints under `checkpoints/`, including `source-parsed.json`, `generation-state.json`, `tools-engine-logs.json`, and `pptx-exported.json`.

Checkpoint writes use temporary files and atomic replacement. Checkpoints must not store API keys, Authorization headers, Base URLs, long raw model responses, or local paths intended for frontend snapshots.

## Model Bridge

Python does not read API keys and does not own model provider configuration.

When paper-ppt-agent needs an LLM, the Python adapter registers a `nexus` provider that calls:

```text
POST /api/internal/academic-ppt/model
```

That route accepts only local server calls and reuses NexusAI's existing server-side primary task model and fallback task model. It returns only status, model name, model content, optional partial content, and sanitized error summaries.

## Timeout And Resume

- Python `POST /tasks` accepts quickly and starts background work.
- Next.js polls Python `GET /tasks/{taskId}`.
- Frontend polls only Next.js task APIs.
- A single HTTP timeout does not immediately fail the task.
- Next.js checks heartbeat and task status before marking a task failed.
- Stale tasks are marked failed + resumable when checkpoints exist.
- Resume requeues the task and passes `resume` / `resumeFromStep` to Python.

## Fallback Policy

The TypeScript writer remains available only as fallback when no generation service URL is configured, or when the product owner chooses to allow fallback for a local environment.

Fallback must be explicit in task metadata:

```text
modelSource: "local-fallback"
modelName: "Fallback generation"
fallbackReason: "Generation service unavailable; generated with limited fallback renderer."
```

The UI displays:

```text
Fallback generation was used. Quality may be limited.
```

Fallback output must not pretend to be paper-ppt-agent output.

## Local Startup

```powershell
cd <project-root>
python -m pip install -r services/ai-tools-engine/requirements.txt
python .\services\ai-tools-engine\scripts\check_deps.py
python services/ai-tools-engine/start.py
```

PowerShell for Next.js:

```powershell
$env:AI_TOOLS_ENGINE_URL="http://127.0.0.1:8010"
$env:NEXT_PUBLIC_APP_URL="http://127.0.0.1:3099"
npm.cmd run dev -- -p 3099
```

CMD for Next.js:

```cmd
set AI_TOOLS_ENGINE_URL=http://127.0.0.1:8010
set NEXT_PUBLIC_APP_URL=http://127.0.0.1:3099
npm.cmd run dev -- -p 3099
```

Future server deployment can run the Python Tools Engine as part of the same project deployment using docker-compose, systemd, supervisor, or pm2. It should not be spawned from a Next.js API request.

Windows notes:

- If `requirements.txt` is not found, you are not in the project root.
- If `8010` is in use, open `http://127.0.0.1:8010/health`; if it is not `nexusai-tools-engine`, inspect with `netstat -ano | findstr :8010`.
- If `npm.ps1` is blocked, use `npm.cmd`.
- If `Activate.ps1` is blocked, activation is optional; or use `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`.
- If `pip` is slow, a temporary package mirror is fine, but do not hard-code it into repo scripts.

## Local Generation Verification

`scripts/academic-ppt/smoke-tools-engine.ts` verifies the primary generation path through the Next.js API. It checks Tools Engine health, creates a short task, rejects `local-fallback`, and confirms the downloaded PPTX comes from the primary generator.

For human inspection of real generated PPTX files, run:

```powershell
$env:ACADEMIC_PPT_SIDEcar_REVIEW_KEEP_TASKS="1"
npm.cmd exec tsx scripts/academic-ppt/manual-sidecar-review.ts
```

The manual sidecar review creates three tasks through Next.js only:

- Chinese paper abstract
- Chinese technical proposal
- English paper abstract

It prints task IDs, slide counts, output sizes, download URLs, and `outputs/academic-ppt-result.pptx` as a relative path. By default it cleans its task folders; set `ACADEMIC_PPT_SIDEcar_REVIEW_KEEP_TASKS=1` to keep outputs for PowerPoint inspection.

If local LibreOffice or `pdftoppm` is unavailable, native image preview may degrade to structured preview. PPTX download is still the acceptance path for this phase.

Frontend real upload testing is left to the user in a logged-in browser session. Backend verification must not add a login bypass or a frontend-only test route.

## Stability Freeze - 2026-05-18

Academic PPT is frozen at the current primary-generation capability before the built-in template-system phase. This freeze is not a template-system change.

Frozen guarantees:

- Browser code calls only `/api/smart-tools/academic-ppt/*`; it never calls Python, model providers, OSS, or search directly.
- The accepted primary success state is `modelSource=paper-ppt-agent`, `generatorSource=tools-engine`, `generationMode=paper-ppt-agent`, and `visualPipelineStatus=success`.
- `local-fallback`, rule fallback, or degraded visual output must not be presented as full success.
- Completed historical tasks fetch one preview manifest and do not keep polling `/preview`.
- Preview pages are rendered only from `manifest.slides`; the UI must not synthesize `/preview/1..N` from `slideCount`.
- `/preview` returns `status=pending` or `status=unavailable` for existing tasks whose preview assets are not ready; only a missing task should be a 404.
- `/preview/{page}` accepts a 1-based page number and returns `202/200` pending or unavailable JSON for missing page assets instead of high-volume 404s.
- Completed preview assets are represented by `data/academic-ppt/tasks/{taskId}/previews/manifest.json`.
- Preview/download storage fields are reserved for future local-to-OSS migration: `outputStorageProvider`, `pptxUrl`, `previewManifestUrl`, `previewStoragePrefix`, `previewAssetsReady`, plus slide `publicUrl`, `storageKey`, and `storageProvider`.

Latest local evidence:

- Short tools-engine smoke: passed, `modelSource=paper-ppt-agent`, `visualPipelineStatus=success`, downloadable PPTX, smoke task cleaned after inspection.
- Existing 5-slide result: success, 5-slide PPTX opens structurally, primary generator, design spec present.
- Existing 12-slide long PDF result: success, 12-slide PPTX, primary generator, design spec present, SVG preview available.
- Existing 25-slide target pressure result: success with all major options enabled, generated 28 slides, primary generator, design spec present, SVG preview manifest ready, downloadable PPTX. This is accepted as a long-document pressure pass, but exact target slide-count locking is not frozen.

Recommended gate before template-system work:

```powershell
npm.cmd exec -- tsc --noEmit
npm.cmd run build
npm.cmd exec -- tsx scripts/academic-ppt/check-stability.ts
npm.cmd exec -- tsx scripts/academic-ppt/check-model-bridge.ts
npm.cmd exec -- tsx scripts/academic-ppt/smoke-tools-engine.ts
python -m compileall -q services/ai-tools-engine
```

For the first manual model-bridge verification, use a `.txt` file, target `5` slides, and turn off deep research, external research, visual QA, and icon decoration. This isolates the model bridge and paper-ppt-agent generation loop before testing heavier PDF and enhancement paths.

When `externalResearchEnabled` is on, Next.js persists `webSearchEnabled=true` and `searchProvider="nexus-searxng"` in the task snapshot, then the Tools Engine calls its server-side search bridge. The default search service is searxng on `127.0.0.1:8080`; if it is unavailable, the task records `searchStatus: "degraded"` and continues PPTX generation without external references.

## Adapter Audit

Current conclusion: the adapter calls the full paper-ppt-agent backend pipeline.

- NexusAI creates the task through `/api/smart-tools/academic-ppt/tasks`; the task runner calls the Tools Engine; the Tools Engine calls `app/tools/academic_ppt/paper_ppt_adapter.py`.
- The adapter imports `backend.orchestrator.pipeline.GenerationRequest` and iterates `run_pipeline`.
- The original paper-ppt-agent FastAPI `/generate` endpoint also builds `GenerationRequest` and runs the same `run_pipeline` function.
- The paper-ppt-agent stages used by NexusAI are parse -> research manuscript -> strategist design spec -> SVG executor -> SVG finalize -> native PPTX export.
- The adapter maps NexusAI template styles to paper-ppt-agent layout template IDs and patches `settings.templates_dir` to the local `assets/templates` directory.
- Layout assets under `assets/templates/layouts` are actively loaded. The selected layout provides cover, TOC, chapter, content, and ending skeletons to the SVG executor.
- Chart assets under `assets/templates/charts` are available as the upstream visualization reference library. The current pipeline references the chart library through `design_spec_reference.md` and generates charts, KPI cards, timelines, flows, and architecture diagrams as native SVG content. It does not hard-wire every chart SVG file as a fixed page template.
- Successful backend smoke and manual sidecar review tasks must report `modelSource: "paper-ppt-agent"` and must fail if `local-fallback` is used.

## Tool Boundaries

```text
academic-ppt     implemented
diagram-canvas   placeholder only, returns 501
```

The unified Python service is designed for more tools later, but this phase only connects academic-ppt.

## Local Dependency Diagnostics

The Python service can start with minimal FastAPI dependencies, but true PPTX generation requires the full `services/ai-tools-engine/requirements.txt` set plus the local paper-ppt-agent package under:

```text
tmp/external-ppt-agents/paper-ppt-agent-master/paper-ppt-agent-master
```

If generation dependencies are missing, the tool fails the task quickly with a clear dependency diagnostic instead of leaving it permanently `running`.

## Safety Boundaries

- Do not modify the existing main PPT generation chain.
- Do not modify Word, Excel, image, video, 3D, normal chat, Agent routes, or capability-map.
- Do not add providers.
- Do not add frontend API key inputs.
- Do not put Python dependencies into the Next.js build.
- Do not expose local paths to frontend snapshots.
- Do not commit generated PPTX, PNG previews, logs, task folders, or `.tmp` files.
