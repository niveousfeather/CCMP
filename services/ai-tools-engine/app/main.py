from __future__ import annotations

from fastapi import Depends, FastAPI

from app.core.config import get_settings
from app.core.diagnostics import get_runtime_diagnostics
from app.core.security import require_local_request
from app.tools.academic_ppt.router import router as academic_ppt_router
from app.tools.diagram_canvas.router import router as diagram_canvas_router


settings = get_settings()

app = FastAPI(title="NexusAI Tools Engine", version=settings.version)


@app.get("/health", dependencies=[Depends(require_local_request)])
async def health() -> dict[str, object]:
    return {
        "status": "ok",
        "service": "nexusai-tools-engine",
        "tools": ["academic-ppt"],
        "version": settings.version,
        "diagnostics": {
            "academicPpt": get_runtime_diagnostics()["academicPpt"],
        },
    }


app.include_router(
    academic_ppt_router,
    prefix="/tools/academic-ppt",
    dependencies=[Depends(require_local_request)],
)
app.include_router(
    diagram_canvas_router,
    prefix="/tools/diagram-canvas",
    dependencies=[Depends(require_local_request)],
)
