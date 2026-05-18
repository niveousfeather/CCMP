from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from app.core.logs import now_iso


EngineTaskStatus = Literal["accepted", "running", "success", "failed", "cancelled"]


@dataclass
class EngineTaskState:
    task_id: str
    task_dir: Path
    status: EngineTaskStatus = "accepted"
    progress: int = 0
    current_step: str = "accepted"
    message: str = "Task accepted."
    output_file_name: str | None = None
    output_file_size: int | None = None
    slide_count: int | None = None
    generation_mode: str | None = None
    visual_pipeline_status: str | None = None
    fallback_reason: str | None = None
    model_bridge_status: str | None = None
    model_bridge_primary_model: str | None = None
    model_bridge_primary_status: str | None = None
    model_bridge_fallback_model: str | None = None
    model_bridge_fallback_status: str | None = None
    model_bridge_error_summary: str | None = None
    search_status: str | None = None
    research_status: str | None = None
    research_sources_count: int | None = None
    research_fallback_reason: str | None = None
    preview_available: bool | None = None
    preview_type: str | None = None
    preview_slide_count: int | None = None
    preview_manifest_path: str | None = None
    preview_fallback_reason: str | None = None
    preview_updated_at: str | None = None
    error: str | None = None
    heartbeat_at: str = field(default_factory=now_iso)
    created_at: str = field(default_factory=now_iso)
    updated_at: str = field(default_factory=now_iso)
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    task: asyncio.Task[Any] | None = None

    def snapshot(self) -> dict[str, Any]:
        return {
            "taskId": self.task_id,
            "status": self.status,
            "progress": self.progress,
            "currentStep": self.current_step,
            "message": self.message,
            "outputFileName": self.output_file_name,
            "outputFileSize": self.output_file_size,
            "slideCount": self.slide_count,
            "generationMode": self.generation_mode,
            "visualPipelineStatus": self.visual_pipeline_status,
            "fallbackReason": self.fallback_reason,
            "modelBridgeStatus": self.model_bridge_status,
            "modelBridgePrimaryModel": self.model_bridge_primary_model,
            "modelBridgePrimaryStatus": self.model_bridge_primary_status,
            "modelBridgeFallbackModel": self.model_bridge_fallback_model,
            "modelBridgeFallbackStatus": self.model_bridge_fallback_status,
            "modelBridgeErrorSummary": self.model_bridge_error_summary,
            "searchStatus": self.search_status,
            "researchStatus": self.research_status,
            "researchSourcesCount": self.research_sources_count,
            "researchFallbackReason": self.research_fallback_reason,
            "previewAvailable": self.preview_available,
            "previewType": self.preview_type,
            "previewSlideCount": self.preview_slide_count,
            "previewManifestPath": self.preview_manifest_path,
            "previewFallbackReason": self.preview_fallback_reason,
            "previewUpdatedAt": self.preview_updated_at,
            "error": self.error,
            "heartbeatAt": self.heartbeat_at,
            "updatedAt": self.updated_at,
        }


class EngineTaskStore:
    def __init__(self) -> None:
        self._tasks: dict[str, EngineTaskState] = {}
        self._lock = asyncio.Lock()

    async def upsert(self, state: EngineTaskState) -> EngineTaskState:
        async with self._lock:
            current = self._tasks.get(state.task_id)
            if current and current.status in {"accepted", "running"}:
                return current
            self._tasks[state.task_id] = state
            return state

    async def get(self, task_id: str) -> EngineTaskState | None:
        async with self._lock:
            return self._tasks.get(task_id)

    async def cancel(self, task_id: str) -> EngineTaskState | None:
        async with self._lock:
            state = self._tasks.get(task_id)
            if not state:
                return None
            state.cancel_event.set()
            if state.task and not state.task.done():
                state.task.cancel()
            state.status = "cancelled"
            state.current_step = "cancelled"
            state.message = "Task cancellation requested."
            state.updated_at = now_iso()
            state.heartbeat_at = state.updated_at
            return state


task_store = EngineTaskStore()
