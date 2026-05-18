from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, status

from app.core.files import validate_academic_ppt_task_paths, validate_task_id
from app.core.task_store import EngineTaskState, task_store
from app.tools.academic_ppt.logs import append_log, read_logs
from app.tools.academic_ppt.runner import run_academic_ppt_task
from app.tools.academic_ppt.schemas import (
    AcademicPptLogsResponse,
    AcademicPptTaskAccepted,
    AcademicPptTaskRequest,
    AcademicPptTaskStatus,
)


router = APIRouter()


@router.post("/tasks", response_model=AcademicPptTaskAccepted)
async def create_task(request: AcademicPptTaskRequest) -> AcademicPptTaskAccepted:
    task_dir, input_path = validate_academic_ppt_task_paths(
        request.taskId,
        request.taskDir,
        request.inputFilePath,
    )
    state = await task_store.upsert(
        EngineTaskState(task_id=request.taskId, task_dir=task_dir, progress=5)
    )
    if state.status in {"running", "accepted"} and state.task and not state.task.done():
        return AcademicPptTaskAccepted(taskId=request.taskId, status="running", message="Task is already running.")

    append_log(task_dir, "info", "Generation service accepted the task.")
    state.task = asyncio.create_task(
        run_academic_ppt_task(
            state,
            input_file_path=input_path,
            settings=request.settings,
            request_options={
                "slideCount": request.slideCount,
                "templateId": request.templateId,
                "language": request.language,
                "deepResearchEnabled": request.deepResearchEnabled,
                "externalResearchEnabled": request.externalResearchEnabled,
                "webSearchEnabled": request.webSearchEnabled,
                "visualQaEnabled": request.visualQaEnabled,
                "iconDecorationEnabled": request.iconDecorationEnabled,
                "searchProvider": request.searchProvider,
                "generatorPreference": request.generatorPreference,
            },
            model_bridge_url=request.modelBridgeUrl,
            resume=request.resume,
            resume_from_step=request.resumeFromStep,
        )
    )
    return AcademicPptTaskAccepted(taskId=request.taskId, status="accepted", message="Task accepted.")


@router.get("/tasks/{task_id}", response_model=AcademicPptTaskStatus)
async def get_task(task_id: str) -> AcademicPptTaskStatus:
    validate_task_id(task_id)
    state = await task_store.get(task_id)
    if not state:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
    return AcademicPptTaskStatus(**state.snapshot())


@router.get("/tasks/{task_id}/logs", response_model=AcademicPptLogsResponse)
async def get_logs(task_id: str) -> AcademicPptLogsResponse:
    validate_task_id(task_id)
    state = await task_store.get(task_id)
    if not state:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
    return AcademicPptLogsResponse(taskId=task_id, logs=read_logs(state.task_dir))


@router.post("/tasks/{task_id}/cancel", response_model=AcademicPptTaskStatus)
async def cancel_task(task_id: str) -> AcademicPptTaskStatus:
    validate_task_id(task_id)
    state = await task_store.cancel(task_id)
    if not state:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
    append_log(state.task_dir, "warn", "Generation task cancellation was requested.")
    return AcademicPptTaskStatus(**state.snapshot())


@router.post("/tasks/{task_id}/resume", response_model=AcademicPptTaskAccepted)
async def resume_task(task_id: str) -> AcademicPptTaskAccepted:
    validate_task_id(task_id)
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Resume must be submitted through POST /tasks.")
