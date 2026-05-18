# NexusAI Python Tools Engine

This service is the unified Python backend for NexusAI AI tools.

Implemented tool:

```text
academic-ppt
```

Reserved placeholder:

```text
diagram-canvas
```

`diagram-canvas` returns `501 Not Implemented` and is not connected to the frontend.

## Fixed Local Ports

```text
Next.js NexusAI:      127.0.0.1:3099
Python Tools Engine:  127.0.0.1:8010
searxng / search:     127.0.0.1:8080
```

Do not use port `8080` for the Python Tools Engine. It is reserved for searxng / search.

The engine defaults to:

```text
AI_TOOLS_ENGINE_HOST=127.0.0.1
AI_TOOLS_ENGINE_PORT=8010
```

## Local Startup

Run from the project root:

```powershell
python -m pip install -r .\services\ai-tools-engine\requirements.txt
python .\services\ai-tools-engine\scripts\check_deps.py
python .\services\ai-tools-engine\start.py
```

Windows CMD helper:

```cmd
services\ai-tools-engine\start-tools.cmd
```

PowerShell helper:

```powershell
.\services\ai-tools-engine\start-tools.ps1
```

If PowerShell blocks `.ps1`, use `start-tools.cmd`. You do not need `Activate.ps1`.

## Next.js Startup

PowerShell:

```powershell
$env:AI_TOOLS_ENGINE_URL="http://127.0.0.1:8010"
$env:NEXT_PUBLIC_APP_URL="http://127.0.0.1:3099"
npm.cmd run dev -- -p 3099
```

For the default Next.js port `3000`, use:

```powershell
$env:AI_TOOLS_ENGINE_URL="http://127.0.0.1:8010"
$env:NEXT_PUBLIC_APP_URL="http://127.0.0.1:3000"
npm.cmd run dev -- -p 3000
```

CMD:

```cmd
set AI_TOOLS_ENGINE_URL=http://127.0.0.1:8010
set NEXT_PUBLIC_APP_URL=http://127.0.0.1:3099
npm.cmd run dev -- -p 3099
```

`NEXT_PUBLIC_APP_URL` must match the actual local Next.js port because Python calls the internal academic-ppt model bridge through that URL.

The Python model bridge waits for the whole Next.js academic-ppt retry chain. Keep `AI_TOOLS_MODEL_BRIDGE_REQUEST_TIMEOUT_SECONDS` larger than all GPT-5.4 primary attempts, staged retry backoff, and Kimi fallback. The default is `1800` seconds; `AI_TOOLS_MODEL_TIMEOUT_SECONDS` remains the per-attempt model timeout.

Academic-ppt key stages prefer GPT-5.4 before fallback. `strategy` / design-spec calls get up to 6 GPT-5.4 attempts; `generation`, `visual_qa`, `research`, `manuscript`, SVG, and repair calls get up to 4 attempts. Backoff is 5s, 15s, 30s, 60s, then 120s.

Strict visual mode defaults to:

```text
ACADEMIC_PPT_STRICT_VISUAL_PIPELINE=true
ACADEMIC_PPT_ALLOW_KIMI_FINAL_FALLBACK=false
ACADEMIC_PPT_MAX_PRIMARY_RETRIES_STRATEGY=6
ACADEMIC_PPT_MAX_PRIMARY_RETRIES_DEFAULT=4
AI_TOOLS_MODEL_BRIDGE_REQUEST_TIMEOUT_SECONDS=1800
```

In strict visual stages, Kimi is not allowed to produce final strategy / design spec / SVG output. If GPT-5.4 remains unavailable after retries, the task should fail or be resumable rather than reporting success with a basic parsed-text deck.

Optional server-side search bridge configuration:

```powershell
$env:SEARCH_PROVIDER="searxng"
$env:SEARCH_BASE_URL="http://127.0.0.1:8080"
$env:SEARCH_TIMEOUT_SECONDS="15"
```

These values are only used by the Python Tools Engine. The browser still calls only Next.js `/api/smart-tools/academic-ppt/*`, and task logs must not expose the search endpoint.

If you want to use `npm` directly in PowerShell and it is blocked by execution policy, a temporary process-only workaround is:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

The recommended command remains `npm.cmd`.

## Diagnostics

Dependency check:

```powershell
python .\services\ai-tools-engine\scripts\check_deps.py
```

Port check:

```powershell
python .\services\ai-tools-engine\scripts\check_port.py
```

If port `8010` is occupied, first request:

```text
http://127.0.0.1:8010/health
```

If it returns `nexusai-tools-engine`, the service is already running. If another program owns the port, inspect manually:

```cmd
netstat -ano | findstr :8010
taskkill /PID <pid> /F
```

Do not kill a process unless you have confirmed it is safe.

## Generation Smoke And Manual Review

After the Tools Engine and Next.js are both running, verify the primary academic-ppt path through NexusAI:

```cmd
npm.cmd exec tsx scripts/academic-ppt/smoke-tools-engine.ts
```

For retained PPTX files that can be opened manually in PowerPoint:

```cmd
set ACADEMIC_PPT_SIDEcar_REVIEW_KEEP_TASKS=1
npm.cmd exec tsx scripts/academic-ppt/manual-sidecar-review.ts
```

The manual review script creates Chinese paper, Chinese technical proposal, and English paper tasks through the Next.js API. It rejects local fallback output and prints the relative output path `outputs/academic-ppt-result.pptx`.

The browser preview first uses real `svg_final` slides copied from paper-ppt-agent. Native slide image preview can also depend on LibreOffice and `pdftoppm`; missing preview tools can degrade the browser preview, but they should not block PPTX download.

Frontend login-state upload testing is intentionally manual. The backend validation scripts above verify the generation and download loop through Next.js APIs without bypassing authentication in the browser.

## Health

```text
GET /health
```

Example:

```json
{
  "status": "ok",
  "service": "nexusai-tools-engine",
  "tools": ["academic-ppt"],
  "version": "0.1.0",
  "diagnostics": {
    "academicPpt": "ready"
  }
}
```

`academicPpt` can be:

```text
ready
missing_dependencies
missing_agent
```

The service can start even when academic-ppt dependencies are missing. In that case `/tools/academic-ppt/tasks` fails quickly with a dependency diagnostic instead of leaving the task stuck in `running`.

## Academic PPT Routes

```text
POST /tools/academic-ppt/tasks
GET  /tools/academic-ppt/tasks/{taskId}
GET  /tools/academic-ppt/tasks/{taskId}/logs
POST /tools/academic-ppt/tasks/{taskId}/cancel
POST /tools/academic-ppt/tasks/{taskId}/resume
```

The `resume` endpoint is reserved; resume is submitted through `POST /tasks` with `resume: true`.

## Isolation

Academic PPT tasks may only access their own task directory:

```text
data/academic-ppt/tasks/{taskId}/
```

The service validates task IDs, task directories, and input file paths. It rejects paths that escape the current task directory.

## paper-ppt-agent Integration

The academic-ppt tool dynamically imports the local paper-ppt-agent package from:

```text
tmp/external-ppt-agents/paper-ppt-agent-master/paper-ppt-agent-master
```

It uses only the backend generation core. It does not import the upstream React frontend and does not expose upstream provider/API-key configuration UI.

Adapter audit:

- NexusAI calls `backend.orchestrator.pipeline.run_pipeline` through `app/tools/academic_ppt/paper_ppt_adapter.py`.
- The upstream `backend/api/endpoints/generate.py` endpoint also wraps the same `GenerationRequest` / `run_pipeline` path, so the adapter is using the original backend generation pipeline rather than a simplified local renderer.
- The pipeline stages are parse -> research manuscript -> strategist design spec -> SVG executor -> SVG finalize -> native PPTX export.
- The adapter patches the paper-ppt-agent runtime so `assets/templates/layouts` is the active layouts directory, then passes a concrete `template_id` such as `academic_defense`, `mckinsey`, `google_style`, or `科技蓝商务`.
- Layout templates provide cover, TOC, chapter, content, and ending skeletons. The executor receives those skeletons and is instructed to preserve the template chrome while replacing placeholders.
- `assets/templates/charts` is present as the paper-ppt-agent visualization reference library. The current upstream pipeline references it through the design-spec reference and generates chart, KPI, timeline, flow, and architecture visuals as native SVG content. It does not hard-inject every chart SVG file as a fixed slide skeleton.

Generated output is copied to:

```text
data/academic-ppt/tasks/{taskId}/outputs/academic-ppt-result.pptx
```

The HTTP response returns only file name, size, slide count, status, progress, heartbeat, and product-safe errors. It does not return local absolute paths.

## Model Bridge

Python does not read `.env`, API keys, provider settings, Base URLs, or Authorization headers.

The paper-ppt-agent LLM provider is patched to `nexus`, which calls:

```text
POST /api/internal/academic-ppt/model
```

Model fallback remains owned by NexusAI server code.

## Long Tasks

`POST /tasks` returns quickly with `accepted`.

Generation runs in a Python background task. Next.js polls `GET /tasks/{taskId}` and syncs `/logs` into the NexusAI task store.

Python dependencies live only under `services/ai-tools-engine/requirements.txt`. They are not part of the Next.js build.

## Common Windows Issues

- Cannot find `requirements.txt`: run commands from the project root.
- `8010 already in use`: check `/health`; if it is not this service, inspect with `netstat -ano | findstr :8010`.
- `8080 already in use`: expected when searxng/search is running; keep Tools Engine on `8010`.
- `npm.ps1` blocked: use `npm.cmd`.
- `Activate.ps1` blocked: you can skip activation or use process-scoped execution policy bypass.
- Slow `pip`: you may temporarily use a package mirror, but do not hard-code mirrors in repo scripts.
