# Academic PPT Handoff - 2026-05-17

This document records the current implementation state of `Smart Tools -> Academic PPT` in this workspace:

```text
E:\AI project\codex\WEByunming
```

The workspace is not currently a git repository, so `git status` / `git diff` are not available here. Treat this document and the referenced files as the source of truth for handoff.

## Executive Summary

The Academic PPT module has been moved away from the old TypeScript self-built PPTX generator as the primary path. The current primary architecture is:

```text
Next.js NexusAI task shell
-> Python Tools Engine
-> academic-ppt tool router
-> local paper-ppt-agent backend pipeline
-> NexusAI internal model bridge
-> outputs/academic-ppt-result.pptx
-> Next.js download route
```

The TypeScript `pptx-writer`, `template-registry`, `layout-planner`, and local outline flow are retained only as limited fallback. They must not be presented as the official generation path.

Current fixed local ports:

```text
Next.js NexusAI:      127.0.0.1:3099
Python Tools Engine:  127.0.0.1:8010
searxng / search:     127.0.0.1:8080
```

Port `8080` is reserved for search and must not be reused by the Tools Engine.

## Current Scope And Boundaries

Implemented scope:

- Academic PPT task creation through Next.js API.
- Upload, taskId creation, queue scheduling, task store, logs, checkpoints, recent tasks, cancel/resume, and download remain in NexusAI.
- Python Tools Engine exists under `services/ai-tools-engine`.
- Current Tools Engine routers:
  - `academic-ppt`: implemented.
  - `diagram-canvas`: placeholder only, returns 501 and is not connected to frontend.
- `academic-ppt` calls local paper-ppt-agent backend generation core.
- Internal model bridge exists at `POST /api/internal/academic-ppt/model`.
- Smoke and manual review scripts verify the backend loop through Next.js APIs, not direct Python calls.

Explicitly out of scope / do not touch:

- Existing main PPT generation chain outside `academic-ppt`.
- Word / Excel / image / video / 3D tools.
- Normal chat route.
- Agent main route.
- `capability-map`.
- New providers.
- Frontend API key inputs.
- paper-ppt-agent original React frontend.
- Python dependencies in the Next.js build.
- `package.json` changes unless there is a very explicit requirement.

## Key Files

Next.js Academic PPT routes:

- `app/api/smart-tools/academic-ppt/tasks/route.ts`
- `app/api/smart-tools/academic-ppt/tasks/[taskId]/route.ts`
- `app/api/smart-tools/academic-ppt/tasks/[taskId]/download/route.ts`
- `app/api/smart-tools/academic-ppt/tasks/[taskId]/logs/route.ts`
- `app/api/smart-tools/academic-ppt/tasks/[taskId]/cancel/route.ts`
- `app/api/smart-tools/academic-ppt/tasks/[taskId]/resume/route.ts`

Task and queue logic:

- `lib/smart-tools/academic-ppt/task-queue.ts`
- `lib/smart-tools/academic-ppt/task-runner.ts`
- `lib/smart-tools/academic-ppt/tools-engine-client.ts`
- `lib/smart-tools/academic-ppt/server-task-store.ts`
- `lib/smart-tools/academic-ppt/task-recovery.ts`
- `lib/smart-tools/academic-ppt/task-lock.ts`

Python Tools Engine:

- `services/ai-tools-engine/start.py`
- `services/ai-tools-engine/requirements.txt`
- `services/ai-tools-engine/app/main.py`
- `services/ai-tools-engine/app/core/config.py`
- `services/ai-tools-engine/app/core/model_bridge.py`
- `services/ai-tools-engine/app/core/task_store.py`
- `services/ai-tools-engine/app/core/files.py`
- `services/ai-tools-engine/app/tools/academic_ppt/router.py`
- `services/ai-tools-engine/app/tools/academic_ppt/runner.py`
- `services/ai-tools-engine/app/tools/academic_ppt/paper_ppt_adapter.py`

Validation scripts:

- `scripts/academic-ppt/smoke-tools-engine.ts`
- `scripts/academic-ppt/manual-sidecar-review.ts`
- `scripts/academic-ppt/check-model-bridge.ts`
- `scripts/academic-ppt/check-stability.ts`
- `services/ai-tools-engine/scripts/check_deps.py`
- `services/ai-tools-engine/scripts/check_port.py`

Documentation already updated:

- `services/ai-tools-engine/README.md`
- `lib/smart-tools/academic-ppt/README.md`

## Important Recent Fix

The queue dispatch path had a production-start reliability issue.

Symptom:

- `POST /api/smart-tools/academic-ppt/tasks` returned `queued`.
- Task remained at `queued / upload_received`.
- Python Tools Engine returned 404 for the same taskId, proving the task was never dispatched.

Root cause:

- Task route used fire-and-forget scheduling:

```ts
void scheduleAcademicPptQueue();
```

- In the current `next start` environment, this did not reliably continue after the request returned.

Fix:

- `app/api/smart-tools/academic-ppt/tasks/route.ts`
  - changed GET and POST scheduling calls to `await scheduleAcademicPptQueue()`.
- `app/api/smart-tools/academic-ppt/tasks/[taskId]/route.ts`
  - changed queued-task scheduling to `await scheduleAcademicPptQueue()`.

This does not make the upload request wait for full PPT generation. It only waits for queue dispatch to start the background runner.

Smoke timeout was also aligned with real generation behavior:

- `scripts/academic-ppt/smoke-tools-engine.ts`
  - default timeout increased from 20 minutes to 40 minutes.

## paper-ppt-agent Adapter Audit

Current conclusion: the adapter calls the full paper-ppt-agent backend pipeline, not a simplified local renderer.

Evidence:

- NexusAI Tools Engine adapter imports:

```py
from backend.orchestrator.pipeline import GenerationRequest, run_pipeline
```

- It iterates:

```py
async for event in run_pipeline(request):
```

- The upstream paper-ppt-agent backend `backend/api/endpoints/generate.py` also builds `GenerationRequest` and runs the same `run_pipeline`.

The paper-ppt-agent pipeline stages used by NexusAI are:

```text
parse source
-> research manuscript
-> strategist design spec
-> SVG executor
-> SVG finalize
-> native PPTX export
```

Template and asset behavior:

- Adapter patches paper-ppt-agent runtime settings so the local assets directory is active.
- `assets/templates/layouts` is used through concrete `template_id` values.
- Known mappings include:
  - `academic_clean` -> `academic_defense`
  - `blue_tech` -> `科技蓝商务`
  - `research_report` -> `mckinsey`
  - `course_presentation` -> `google_style`
- Layout templates provide cover / TOC / chapter / content / ending skeletons to the executor.
- `assets/templates/charts` exists as the upstream visualization reference library.
- The current upstream pipeline references chart assets through `design_spec_reference.md` and generates KPI / chart / timeline / flow / architecture content as native SVG. It does not hard-inject every chart SVG file as a fixed slide skeleton.

## Model Bridge

Python does not read NexusAI `.env`, API keys, provider settings, Base URLs, or Authorization headers.

The adapter patches paper-ppt-agent's LLM provider registry with a `nexus` provider implemented by:

```text
services/ai-tools-engine/app/core/model_bridge.py
```

That provider calls:

```text
POST /api/internal/academic-ppt/model
```

Current behavior:

- Primary model calls go through NexusAI server-side model configuration.
- HTTP 500 / 502 / 503 / 504 from the model bridge are retried with fallback preference.
- Model bridge errors are sanitized before crossing back into Python task errors.
- Logs and frontend snapshots must not include provider config, API keys, Authorization headers, Base URLs, request IDs, stack traces, or local absolute paths.

## Current Retained Manual Review Tasks

The latest retained manual sidecar review generated three successful tasks through Next.js APIs. They are intentionally kept for manual PowerPoint inspection.

All are `modelSource=paper-ppt-agent` and not `local-fallback`.

| Scenario | taskId | template | slides | bytes | status |
| --- | --- | --- | ---: | ---: | --- |
| Chinese paper abstract | `98fb3865-a178-43d3-becf-15973fb7eccd` | `academic_defense` | 5 | 38421 | success |
| Chinese technical proposal | `69b6c2ba-7523-423c-887a-2011483b4959` | `tech_blue_business` | 5 | 39338 | success |
| English paper abstract | `c680b048-15ce-4a45-88b5-99b44ed51395` | `mckinsey` | 5 | 39580 | success |

Download URLs while local Next.js is running:

```text
http://127.0.0.1:3099/api/smart-tools/academic-ppt/tasks/98fb3865-a178-43d3-becf-15973fb7eccd/download
http://127.0.0.1:3099/api/smart-tools/academic-ppt/tasks/69b6c2ba-7523-423c-887a-2011483b4959/download
http://127.0.0.1:3099/api/smart-tools/academic-ppt/tasks/c680b048-15ce-4a45-88b5-99b44ed51395/download
```

Backend artifact checks for these tasks:

- `task.json` slideCount matches actual PPTX slide count.
- `outputFileSize` matches download bytes.
- `checkpoints/paper-workspaces/<workspace>/design_spec.md` exists.
- `svg_output` contains 5 SVG files.
- `svg_final` contains 5 SVG files.
- `exports` contains paper-ppt-agent generated PPTX.
- Export conversion report mode is `native`.
- Export audit status is `passed`.
- Blocking slides: `0`.

## Last Verification Evidence

Verified in this workspace after the queue scheduling fix:

```text
python .\services\ai-tools-engine\scripts\check_deps.py
```

Result:

```text
Status: READY
pandas: MISSING (optional)
```

Tools Engine health:

```text
GET http://127.0.0.1:8010/health
```

Result:

```json
{
  "status": "ok",
  "service": "nexusai-tools-engine",
  "tools": ["academic-ppt"],
  "diagnostics": {
    "academicPpt": "ready"
  }
}
```

Smoke:

```text
npm.cmd exec -- tsx scripts/academic-ppt/smoke-tools-engine.ts
```

Result:

```text
academic-ppt tools-engine smoke passed
taskId=06e0182d-5fe5-40ee-8065-6ee893337ed6
slides=4
downloadBytes=35227
modelSource=paper-ppt-agent
```

Manual review:

```text
set ACADEMIC_PPT_SIDEcar_REVIEW_KEEP_TASKS=1
npm.cmd exec -- tsx scripts/academic-ppt/manual-sidecar-review.ts
```

Result:

```text
3/3 scenarios success
all modelSource=paper-ppt-agent
all download routes returned 200
```

Additional checks run successfully:

```text
npm.cmd exec -- tsx scripts/academic-ppt/check-model-bridge.ts
python -m compileall -q services/ai-tools-engine
npm.cmd exec -- tsc --noEmit
npm.cmd exec -- tsx scripts/academic-ppt/check-stability.ts
npm.cmd run build
```

## Local Startup

Terminal 1: Python Tools Engine

```powershell
cd "E:\AI project\codex\WEByunming"
python -m pip install -r .\services\ai-tools-engine\requirements.txt
python .\services\ai-tools-engine\scripts\check_deps.py
python .\services\ai-tools-engine\start.py
```

Terminal 2: Next.js

```powershell
cd "E:\AI project\codex\WEByunming"
$env:AI_TOOLS_ENGINE_URL="http://127.0.0.1:8010"
$env:NEXT_PUBLIC_APP_URL="http://127.0.0.1:3099"
npm.cmd run dev -- -p 3099
```

For production-built local verification:

```powershell
npm.cmd run build
$env:AI_TOOLS_ENGINE_URL="http://127.0.0.1:8010"
$env:NEXT_PUBLIC_APP_URL="http://127.0.0.1:3099"
npm.cmd run start -- -p 3099
```

Use `npm.cmd` on Windows to avoid PowerShell `npm.ps1` execution policy issues.

## Validation Commands For Next Session

Recommended quick backend validation:

```powershell
python .\services\ai-tools-engine\scripts\check_deps.py
Invoke-RestMethod http://127.0.0.1:8010/health
$env:AI_TOOLS_ENGINE_URL="http://127.0.0.1:8010"
$env:ACADEMIC_PPT_TEST_BASE_URL="http://127.0.0.1:3099"
npm.cmd exec -- tsx scripts/academic-ppt/smoke-tools-engine.ts
npm.cmd exec -- tsx scripts/academic-ppt/check-model-bridge.ts
npm.cmd exec -- tsc --noEmit
npm.cmd exec -- tsx scripts/academic-ppt/check-stability.ts
```

For manual inspection outputs:

```powershell
$env:ACADEMIC_PPT_SIDEcar_REVIEW_KEEP_TASKS="1"
npm.cmd exec -- tsx scripts/academic-ppt/manual-sidecar-review.ts
```

If outputs should not be retained, unset `ACADEMIC_PPT_SIDEcar_REVIEW_KEEP_TASKS`.

## Known Caveats

- Frontend logged-in upload test has not been performed by the agent. It is intentionally left for the user to do manually in a logged-in browser session.
- Native image preview depends on LibreOffice and `pdftoppm`. If missing, preview may degrade to structured preview. This should not block PPTX download.
- Some generated logs contain mojibake in historical records. Product-facing sanitization should still avoid leaking provider, key, requestId, Base URL, stack traces, and local paths.
- `pandas` is currently optional missing in dependency diagnostics. It does not block current generation.
- There are pre-existing `.tmp-*` and log files at workspace root. Do not submit generated PPTX, PNG previews, logs, task folders, or `.tmp` files.
- Because this workspace is not a git repository, a future session should be careful when transferring changes into the real repo: compare files manually or use a clean source control checkout.

## Suggested Next Work

Recommended next session focus:

1. User performs logged-in frontend upload test:
   - Upload small `.txt`, `.md`, `.tex`, and a realistic paper file if available.
   - Confirm queued -> running -> success.
   - Confirm logs are product-safe.
   - Confirm download button returns a usable PPTX.
2. Open retained manual review PPTX files in PowerPoint:
   - Check title page, table of contents, content pages, Chinese fonts, English slide text, overflow, blank pages, and template appearance.
3. If visual quality issues remain, fix paper-ppt-agent adapter prompts or template selection only.
   - Do not return to TypeScript writer beautification.
4. Consider adding a small non-auth backend-only test that verifies queue dispatch reaches Tools Engine within a short window.
   - It must create tasks through Next.js API and must not bypass frontend authentication.
5. Before server deployment, define process manager strategy:
   - docker-compose, systemd, supervisor, or pm2.
   - Do not spawn the Python service from a Next.js API request.

## Suggested Skills For Future Agent

- `mattpocock-skills:diagnose` or `superpowers:systematic-debugging` for queue/model/long-running task failures.
- `pptx` for inspecting generated `.pptx` files and visual/export quality.
- `webapp-testing` or Browser plugin only when frontend logged-in UI testing is explicitly in scope.

## Final State

Backend generation is currently usable through:

```text
Next.js API -> queue -> Tools Engine -> paper-ppt-agent -> model bridge -> PPTX output -> Next.js download
```

The adapter is confirmed to use paper-ppt-agent's main backend `run_pipeline`. The retained manual review tasks and smoke task confirm the output is `paper-ppt-agent`, not `local-fallback`.
