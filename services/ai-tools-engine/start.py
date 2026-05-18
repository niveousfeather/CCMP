from __future__ import annotations

import os
from pathlib import Path

import uvicorn

from app.core.diagnostics import get_runtime_diagnostics


ENGINE_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ENGINE_ROOT.parents[1]


def main() -> None:
    os.environ.setdefault("NEXUSAI_PROJECT_ROOT", str(PROJECT_ROOT))
    os.chdir(ENGINE_ROOT)
    host = os.environ.get("AI_TOOLS_ENGINE_HOST", "127.0.0.1")
    port = int(os.environ.get("AI_TOOLS_ENGINE_PORT", "8010"))
    diagnostics = get_runtime_diagnostics()
    print("NexusAI Tools Engine")
    print(f"Service: nexusai-tools-engine")
    print(f"Listen: {host}:{port}")
    print("Enabled tools: academic-ppt")
    print(f"academic-ppt: {diagnostics['academicPpt']}")
    uvicorn.run("app.main:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
