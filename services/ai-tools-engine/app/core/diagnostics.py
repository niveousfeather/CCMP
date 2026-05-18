from __future__ import annotations

import importlib.util
import platform
from dataclasses import dataclass
from pathlib import Path

from app.core.config import get_settings


ACADEMIC_PPT_REQUIRED_MODULES: tuple[tuple[str, str], ...] = (
    ("fastapi", "fastapi"),
    ("uvicorn", "uvicorn"),
    ("pydantic", "pydantic"),
    ("pydantic-settings", "pydantic_settings"),
    ("requests", "requests"),
    ("python-pptx", "pptx"),
    ("PyMuPDF", "fitz"),
    ("pymupdf4llm", "pymupdf4llm"),
    ("pylatexenc", "pylatexenc"),
    ("Pillow", "PIL"),
    ("lxml", "lxml"),
    ("jinja2", "jinja2"),
    ("numpy", "numpy"),
    ("reportlab", "reportlab"),
)

ACADEMIC_PPT_OPTIONAL_MODULES: tuple[tuple[str, str], ...] = (
    ("pandas", "pandas"),
)


@dataclass(frozen=True)
class AcademicPptDiagnostics:
    status: str
    missing_dependencies: tuple[str, ...]
    missing_agent: bool
    missing_optional_dependencies: tuple[str, ...] = ()


def import_available(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


def get_project_root_status(project_root: Path | None = None) -> bool:
    root = project_root or get_settings().project_root
    return (root / "services" / "ai-tools-engine" / "requirements.txt").exists() and (
        root / "services" / "ai-tools-engine" / "start.py"
    ).exists()


def get_academic_ppt_diagnostics() -> AcademicPptDiagnostics:
    settings = get_settings()
    missing = tuple(
        package for package, module_name in ACADEMIC_PPT_REQUIRED_MODULES if not import_available(module_name)
    )
    missing_optional = tuple(
        package for package, module_name in ACADEMIC_PPT_OPTIONAL_MODULES if not import_available(module_name)
    )
    missing_agent = not (settings.paper_ppt_agent_root / "backend" / "orchestrator" / "pipeline.py").exists()
    if missing_agent:
        status = "missing_agent"
    elif missing:
        status = "missing_dependencies"
    else:
        status = "ready"
    return AcademicPptDiagnostics(
        status=status,
        missing_dependencies=missing,
        missing_agent=missing_agent,
        missing_optional_dependencies=missing_optional,
    )


def get_runtime_diagnostics() -> dict[str, object]:
    academic = get_academic_ppt_diagnostics()
    return {
        "python": platform.python_version(),
        "projectRoot": "ok" if get_project_root_status() else "not_project_root",
        "academicPpt": academic.status,
        "missingDependencies": list(academic.missing_dependencies),
        "missingOptionalDependencies": list(academic.missing_optional_dependencies),
        "missingAgent": academic.missing_agent,
    }


def format_missing_dependency_message(missing_dependencies: tuple[str, ...]) -> str:
    if not missing_dependencies:
        return "Academic PPT generation dependencies are ready."
    joined = ", ".join(missing_dependencies)
    return (
        "Academic PPT generation dependencies are not installed. "
        "Install services/ai-tools-engine/requirements.txt. "
        f"Missing: {joined}."
    )
