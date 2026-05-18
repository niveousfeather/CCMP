from __future__ import annotations

from fastapi import APIRouter, HTTPException, status


router = APIRouter()


@router.post("/tasks")
async def create_task() -> None:
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="diagram-canvas is not implemented.")


@router.get("/tasks/{task_id}")
async def get_task(task_id: str) -> None:
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="diagram-canvas is not implemented.")
