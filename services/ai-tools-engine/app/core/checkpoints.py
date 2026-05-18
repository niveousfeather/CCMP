from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.files import safe_task_child


def checkpoint_path(task_dir: Path, name: str) -> Path:
    safe_name = name if name.endswith(".json") else f"{name}.json"
    return safe_task_child(task_dir, "checkpoints", safe_name)


def write_checkpoint(task_dir: Path, name: str, payload: dict[str, Any]) -> None:
    path = checkpoint_path(task_dir, name)
    temp = path.with_suffix(f"{path.suffix}.tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


def read_checkpoint(task_dir: Path, name: str) -> dict[str, Any] | None:
    path = checkpoint_path(task_dir, name)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, ValueError):
        return None
