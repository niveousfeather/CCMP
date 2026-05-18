from __future__ import annotations

from fastapi import HTTPException, Request, status


LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1"}


async def require_local_request(request: Request) -> None:
    client_host = request.client.host if request.client else ""
    forwarded_for = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    candidate = forwarded_for or client_host
    if candidate in LOCAL_HOSTS or candidate.startswith("127."):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Tools engine only accepts local server requests.",
    )
