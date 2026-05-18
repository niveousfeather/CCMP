from __future__ import annotations

from pathlib import Path
from typing import Any

from app.core.checkpoints import read_checkpoint, write_checkpoint


def write_academic_checkpoint(task_dir: Path, name: str, payload: dict[str, Any]) -> None:
    write_checkpoint(task_dir, name, payload)


def read_academic_checkpoint(task_dir: Path, name: str) -> dict[str, Any] | None:
    return read_checkpoint(task_dir, name)
