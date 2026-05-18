"""Future task runner boundary for the academic-ppt sidecar.

The first Next.js integration stage stores tasks locally and can call an HTTP
sidecar through ACADEMIC_PPT_AGENT_URL. Real paper-ppt-agent generation should
be implemented here in a separate Python process.
"""

from __future__ import annotations


async def run_task(task_id: str, input_file_path: str) -> None:
    raise NotImplementedError(
        f"Task {task_id} is not wired yet. Input file: {input_file_path!r}"
    )
