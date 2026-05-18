from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


def _default_project_root() -> Path:
    return Path(__file__).resolve().parents[4]


@dataclass(frozen=True)
class EngineSettings:
    version: str
    project_root: Path
    task_root: Path
    paper_ppt_agent_root: Path
    model_call_timeout_seconds: float
    model_bridge_request_timeout_seconds: float
    task_max_runtime_seconds: float
    academic_ppt_strict_visual_pipeline: bool
    academic_ppt_allow_kimi_final_fallback: bool
    academic_ppt_max_primary_retries_strategy: int
    academic_ppt_max_primary_retries_default: int
    search_provider: str
    search_base_url: str
    search_timeout_seconds: float


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value.lower() in {"1", "true", "yes", "on"}


@lru_cache(maxsize=1)
def get_settings() -> EngineSettings:
    project_root = Path(os.environ.get("NEXUSAI_PROJECT_ROOT") or _default_project_root()).resolve()
    paper_root = Path(
        os.environ.get("PAPER_PPT_AGENT_ROOT")
        or project_root / "tmp" / "external-ppt-agents" / "paper-ppt-agent-master" / "paper-ppt-agent-master"
    ).resolve()
    return EngineSettings(
        version=os.environ.get("AI_TOOLS_ENGINE_VERSION", "0.1.0"),
        project_root=project_root,
        task_root=(project_root / "data" / "academic-ppt" / "tasks").resolve(),
        paper_ppt_agent_root=paper_root,
        model_call_timeout_seconds=float(os.environ.get("AI_TOOLS_MODEL_TIMEOUT_SECONDS", "240")),
        model_bridge_request_timeout_seconds=float(os.environ.get("AI_TOOLS_MODEL_BRIDGE_REQUEST_TIMEOUT_SECONDS", "1800")),
        task_max_runtime_seconds=float(os.environ.get("AI_TOOLS_TASK_MAX_RUNTIME_SECONDS", "3600")),
        academic_ppt_strict_visual_pipeline=_env_bool("ACADEMIC_PPT_STRICT_VISUAL_PIPELINE", True),
        academic_ppt_allow_kimi_final_fallback=_env_bool("ACADEMIC_PPT_ALLOW_KIMI_FINAL_FALLBACK", False),
        academic_ppt_max_primary_retries_strategy=int(os.environ.get("ACADEMIC_PPT_MAX_PRIMARY_RETRIES_STRATEGY", "6")),
        academic_ppt_max_primary_retries_default=int(os.environ.get("ACADEMIC_PPT_MAX_PRIMARY_RETRIES_DEFAULT", "4")),
        search_provider=os.environ.get("SEARCH_PROVIDER", "searxng"),
        search_base_url=os.environ.get("SEARCH_BASE_URL", "http://127.0.0.1:8080"),
        search_timeout_seconds=float(os.environ.get("SEARCH_TIMEOUT_SECONDS", "15")),
    )
