from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from app.core.checkpoints import read_checkpoint, write_checkpoint
from app.core.errors import sanitize_message


LogLevel = Literal["info", "warn", "error"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_tool_logs(task_dir: Path) -> list[dict]:
    payload = read_checkpoint(task_dir, "tools-engine-logs") or {}
    logs = payload.get("logs")
    return logs if isinstance(logs, list) else []


def append_tool_log(task_dir: Path, level: LogLevel, message: object) -> dict:
    logs = read_tool_logs(task_dir)
    seq = int(logs[-1].get("seq", 0)) + 1 if logs else 1
    entry = {
        "seq": seq,
        "time": now_iso(),
        "level": level,
        "message": sanitize_message(message),
    }
    logs.append(entry)
    write_checkpoint(task_dir, "tools-engine-logs", {"logs": logs[-500:]})
    return entry
