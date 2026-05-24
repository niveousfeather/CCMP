from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from app.core.errors import sanitize_message
from app.core.logs import now_iso
from app.core.task_store import EngineTaskState
from app.tools.academic_ppt.checkpoints import write_academic_checkpoint
from app.tools.academic_ppt.logs import append_log
from app.tools.academic_ppt.paper_ppt_adapter import run_paper_ppt_agent_task


async def run_academic_ppt_task(
    state: EngineTaskState,
    *,
    input_file_path: Path,
    settings: dict[str, Any],
    request_options: dict[str, Any] | None,
    model_bridge_url: str | None,
    resume: bool,
    resume_from_step: str | None,
) -> None:
    state.status = "running"
    state.current_step = "starting"
    state.progress = max(state.progress, 5)
    state.message = "Task started."
    state.updated_at = now_iso()
    state.heartbeat_at = state.updated_at
    append_log(state.task_dir, "info", "Generation task started.")

    async def on_progress(step: str, progress: int, message: str) -> None:
        state.status = "running"
        state.current_step = step
        state.progress = max(state.progress, min(progress, 99))
        state.message = message
        state.updated_at = now_iso()
        state.heartbeat_at = state.updated_at

    try:
        result = await run_paper_ppt_agent_task(
            task_id=state.task_id,
            task_dir=state.task_dir,
            input_file_path=input_file_path,
            settings=settings,
            request_options=request_options or {},
            model_bridge_url=model_bridge_url,
            resume=resume,
            resume_from_step=resume_from_step,
            on_progress=on_progress,
            cancel_event=state.cancel_event,
        )
        state.status = "success"
        state.current_step = "completed"
        state.progress = 100
        state.message = "PPTX generated."
        state.output_file_name = result.get("outputFileName")
        state.output_file_size = result.get("outputFileSize")
        state.slide_count = result.get("slideCount")
        state.generation_mode = result.get("generationMode")
        state.visual_pipeline_status = result.get("visualPipelineStatus")
        state.fallback_reason = result.get("fallbackReason")
        state.model_bridge_status = result.get("modelBridgeStatus")
        state.model_bridge_primary_model = result.get("modelBridgePrimaryModel")
        state.model_bridge_primary_status = result.get("modelBridgePrimaryStatus")
        state.model_bridge_fallback_model = result.get("modelBridgeFallbackModel")
        state.model_bridge_fallback_status = result.get("modelBridgeFallbackStatus")
        state.model_bridge_error_summary = result.get("modelBridgeErrorSummary")
        state.search_status = result.get("searchStatus")
        state.research_status = result.get("researchStatus")
        state.research_sources_count = result.get("researchSourcesCount")
        state.research_fallback_reason = result.get("researchFallbackReason")
        state.preview_available = result.get("previewAvailable")
        state.preview_type = result.get("previewType")
        state.preview_slide_count = result.get("previewSlideCount")
        state.preview_manifest_path = result.get("previewManifestPath")
        state.preview_fallback_reason = result.get("previewFallbackReason")
        state.preview_updated_at = result.get("previewUpdatedAt")
        state.selected_variants = result.get("selectedVariants")
        state.role_mapping = result.get("roleMapping")
        state.updated_at = now_iso()
        state.heartbeat_at = state.updated_at
    except asyncio.CancelledError:
        state.status = "cancelled"
        state.current_step = "cancelled"
        state.message = "Task cancelled."
        state.updated_at = now_iso()
        state.heartbeat_at = state.updated_at
        write_academic_checkpoint(
            state.task_dir,
            "generation-state",
            {"taskId": state.task_id, "status": "cancelled", "updatedAt": state.updated_at},
        )
        append_log(state.task_dir, "warn", "Generation task cancelled.")
    except Exception as exc:
        state.status = "failed"
        state.current_step = "failed"
        state.error = sanitize_message(exc)
        state.message = "Task failed."
        if "strict visual mode" in state.error.lower() or "gpt-5.4 visual" in state.error.lower():
            state.visual_pipeline_status = "failed"
            state.generation_mode = "paper-ppt-agent"
            state.fallback_reason = state.error
            state.model_bridge_status = state.model_bridge_status or "failed"
            state.model_bridge_primary_model = state.model_bridge_primary_model or "subrouter:gpt-5.4"
            state.model_bridge_fallback_model = state.model_bridge_fallback_model or "moonshot:kimi-k2.5"
            state.model_bridge_fallback_status = state.model_bridge_fallback_status or "skipped"
            state.model_bridge_error_summary = state.model_bridge_error_summary or state.error
        state.updated_at = now_iso()
        state.heartbeat_at = state.updated_at
        write_academic_checkpoint(
            state.task_dir,
            "generation-state",
            {
                "taskId": state.task_id,
                "status": "failed",
                "error": state.error,
                "updatedAt": state.updated_at,
            },
        )
        append_log(state.task_dir, "error", state.error)
