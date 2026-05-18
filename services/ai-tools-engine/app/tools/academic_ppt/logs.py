from __future__ import annotations

from pathlib import Path

from app.core.logs import append_tool_log, read_tool_logs


def append_log(task_dir: Path, level: str, message: object) -> dict:
    safe_level = level if level in {"info", "warn", "error"} else "info"
    return append_tool_log(task_dir, safe_level, message)


def read_logs(task_dir: Path) -> list[dict]:
    return read_tool_logs(task_dir)
