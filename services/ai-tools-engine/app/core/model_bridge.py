from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.errors import sanitize_message


def _message_to_payload(message: Any) -> dict[str, str]:
    role = getattr(message, "role", "user")
    content = getattr(message, "content", "")
    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        parts: list[str] = []
        for block in content:
            block_type = getattr(block, "type", None)
            if block_type == "text":
                parts.append(getattr(block, "text", "") or "")
            elif block_type == "image":
                parts.append("[image input omitted by text-only model bridge]")
        text = "\n".join(part for part in parts if part)
    else:
        text = str(content)
    return {"role": role if role in {"system", "user", "assistant"} else "user", "content": text}


def _stage_from_usage_context() -> str:
    try:
        from backend.usage.tracker import current_usage_context

        ctx = current_usage_context()
        stage = ctx.get("stage")
        return str(stage or "paper-ppt")
    except Exception:
        return "paper-ppt"


class NexusModelBridgeProvider:
    """paper-ppt-agent LLM provider that delegates to NexusAI server models."""

    def __init__(self, api_key: str = "", base_url: str | None = None, **_: Any) -> None:
        self.task_id = api_key
        self.model_bridge_url = base_url or ""

    async def chat(
        self,
        messages: list[Any],
        model: str,
        *,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        response_format: type[Any] | None = None,
    ) -> Any:
        from backend.llm.types import LLMResponse

        if not self.model_bridge_url:
            raise RuntimeError("NexusAI model bridge URL is not configured.")
        settings = get_settings()
        timeout = httpx.Timeout(settings.model_bridge_request_timeout_seconds)
        prefer_fallback_only = model == "nexus-fallback"
        payload = {
            "taskId": self.task_id,
            "tool": "academic-ppt",
            "step": _stage_from_usage_context(),
            "modelPreference": "fallback" if prefer_fallback_only else "primary",
            "messages": [_message_to_payload(message) for message in messages],
            "jsonMode": response_format is not None,
            "stream": True,
            "strictVisualPipeline": settings.academic_ppt_strict_visual_pipeline,
            "timeoutMs": int(settings.model_call_timeout_seconds * 1000),
            "resumeContext": {
                "temperature": temperature,
                "maxTokens": max_tokens,
                "responseFormat": getattr(response_format, "__name__", None) if response_format else None,
                "strictVisualPipeline": settings.academic_ppt_strict_visual_pipeline,
            },
        }

        append_summary = ""
        async with httpx.AsyncClient(timeout=timeout, trust_env=False) as client:
            try:
                response = await client.post(self.model_bridge_url, json=payload)
            except httpx.ConnectError as exc:
                raise RuntimeError(sanitize_message(f"Model bridge connection refused: {exc}")) from exc
            except httpx.TimeoutException as exc:
                raise TimeoutError(sanitize_message(f"Model bridge timeout: {exc}")) from exc
            except httpx.HTTPError as exc:
                raise RuntimeError(sanitize_message(f"Model bridge request failed: {exc}")) from exc
        if response.status_code >= 400:
            append_summary = f" HTTP {response.status_code}"
        try:
            data = response.json()
        except ValueError as exc:
            raise RuntimeError(sanitize_message(f"Model bridge response parse failed{append_summary}.")) from exc
        status = data.get("status")
        if status == "success" and data.get("content"):
            return LLMResponse(content=str(data["content"]))
        detail = data.get("errorSummary") or data.get("finalStatus") or f"Model bridge failed{append_summary}."
        raise RuntimeError(sanitize_message(detail))

    async def chat_stream(
        self,
        messages: list[Any],
        model: str,
        *,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> AsyncIterator[Any]:
        from backend.llm.types import LLMStreamChunk

        response = await self.chat(messages, model, temperature=temperature, max_tokens=max_tokens)
        yield LLMStreamChunk(delta=response.content, finish_reason="stop")

    async def validate(self) -> bool:
        return bool(self.model_bridge_url)

    def get_provider_info(self) -> Any:
        from backend.llm.types import ModelInfo, ProviderInfo

        return ProviderInfo(
            name="nexus",
            display_name="NexusAI Model Bridge",
            models=[ModelInfo(id="nexus-primary", display_name="NexusAI Primary")],
        )
