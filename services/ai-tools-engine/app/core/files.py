from __future__ import annotations

import re
from pathlib import Path

from fastapi import HTTPException, status

from app.core.config import get_settings


TASK_ID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.I,
)


def is_inside(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def validate_task_id(task_id: str) -> None:
    if not TASK_ID_RE.match(task_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid task id.")


def validate_academic_ppt_task_paths(task_id: str, task_dir: str, input_file_path: str) -> tuple[Path, Path]:
    validate_task_id(task_id)
    settings = get_settings()
    resolved_task_dir = Path(task_dir).resolve()
    expected_task_dir = (settings.task_root / task_id).resolve()
    if resolved_task_dir != expected_task_dir:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid task directory.")
    resolved_input = Path(input_file_path).resolve()
    upload_dir = resolved_task_dir / "uploads"
    if not is_inside(resolved_input, upload_dir):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid input path.")
    if not resolved_input.exists() or not resolved_input.is_file():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Input file does not exist.")
    for child in ["uploads", "checkpoints", "outputs", "previews"]:
        (resolved_task_dir / child).mkdir(parents=True, exist_ok=True)
    return resolved_task_dir, resolved_input


def safe_task_child(task_dir: Path, *parts: str) -> Path:
    target = task_dir.joinpath(*parts).resolve()
    if not is_inside(target, task_dir):
        raise ValueError("Path escapes task directory.")
    target.parent.mkdir(parents=True, exist_ok=True)
    return target
