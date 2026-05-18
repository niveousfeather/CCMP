from __future__ import annotations

import importlib.util
import platform
import sys
from pathlib import Path


REQUIRED_MODULES: tuple[tuple[str, str], ...] = (
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

OPTIONAL_MODULES: tuple[tuple[str, str], ...] = (
    ("pandas", "pandas"),
)


def find_project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def is_importable(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


def main() -> int:
    root = find_project_root()
    cwd = Path.cwd().resolve()
    requirements_path = root / "services" / "ai-tools-engine" / "requirements.txt"
    start_path = root / "services" / "ai-tools-engine" / "start.py"
    paper_root = root / "tmp" / "external-ppt-agents" / "paper-ppt-agent-master" / "paper-ppt-agent-master"
    paper_pipeline = paper_root / "backend" / "orchestrator" / "pipeline.py"

    print("NexusAI Tools Engine dependency check")
    print(f"Python: {platform.python_version()}")
    print(f"Project root: {'OK' if cwd == root else 'MISMATCH'}")
    if cwd != root:
        print("  Run this command from the project root:")
        print(f"  cd /d {root}")

    print(f"requirements.txt: {'OK' if requirements_path.exists() else 'MISSING'}")
    print(f"start.py: {'OK' if start_path.exists() else 'MISSING'}")
    print(f"paper-ppt-agent core: {'OK' if paper_pipeline.exists() else 'MISSING'}")

    missing: list[str] = []
    missing_optional: list[str] = []
    print("")
    print("Python modules:")
    for package, module_name in REQUIRED_MODULES:
        ok = is_importable(module_name)
        print(f"  {package}: {'OK' if ok else 'MISSING'}")
        if not ok:
            missing.append(package)
    for package, module_name in OPTIONAL_MODULES:
        ok = is_importable(module_name)
        print(f"  {package}: {'OK' if ok else 'MISSING (optional)'}")
        if not ok:
            missing_optional.append(package)

    if missing or cwd != root or not requirements_path.exists() or not start_path.exists() or not paper_pipeline.exists():
        print("")
        print("Install command:")
        print(r"  python -m pip install -r .\services\ai-tools-engine\requirements.txt")
        print("")
        print("Status: MISSING")
        return 1

    if missing_optional:
        print("")
        print(f"Optional missing: {', '.join(missing_optional)}")

    print("")
    print("Status: READY")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
