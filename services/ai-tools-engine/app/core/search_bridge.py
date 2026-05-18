from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.errors import sanitize_message

SEARCH_BASE_URL = "SEARCH_BASE_URL"
DEFAULT_SEARXNG_BASE_URL = "http://127.0.0.1:8080"


@dataclass
class SearchBridgeResult:
    status: str
    query_count: int
    documents_count: int
    results: list[dict[str, str]]
    error_summary: str | None = None


def _search_endpoint() -> str:
    base_url = get_settings().search_base_url.strip().rstrip("/")
    if base_url.endswith("/search"):
        return base_url
    return f"{base_url}/search"


def _normalize_item(item: dict[str, Any]) -> dict[str, str] | None:
    title = str(item.get("title") or "").strip()
    url = str(item.get("url") or item.get("content_url") or "").strip()
    snippet = str(item.get("content") or item.get("snippet") or item.get("description") or "").strip()
    source = str(item.get("engine") or item.get("source") or "searxng").strip()
    if not title and not snippet:
        return None
    return {
        "title": title[:180] or "Untitled source",
        "url": url[:500],
        "snippet": snippet[:600],
        "source": source[:80] or "searxng",
    }


def _queries_from_text(text: str, *, language: str, limit: int) -> list[str]:
    normalized = " ".join(text.replace("\r", "\n").split())
    if not normalized:
        return []
    prefix = "学术论文 研究背景 相关工作" if language == "zh" else "academic paper related work"
    title = normalized[:140]
    queries = [f"{title} {prefix}".strip()]
    if len(normalized) > 240:
        queries.append(f"{normalized[140:320]} {prefix}".strip())
    return queries[:limit]


async def run_academic_search_bridge(
    *,
    query_text: str,
    language: str = "zh",
    max_queries: int = 3,
    top_k: int = 5,
) -> SearchBridgeResult:
    settings = get_settings()
    if settings.search_provider != "searxng":
        return SearchBridgeResult(
            status="degraded",
            query_count=0,
            documents_count=0,
            results=[],
            error_summary="Search provider unavailable.",
        )

    queries = _queries_from_text(query_text, language=language, limit=max_queries)
    if not queries:
        return SearchBridgeResult(status="skipped", query_count=0, documents_count=0, results=[])

    endpoint = _search_endpoint()
    timeout = httpx.Timeout(settings.search_timeout_seconds)
    collected: list[dict[str, str]] = []
    seen_urls: set[str] = set()

    try:
        async with httpx.AsyncClient(timeout=timeout, trust_env=False) as client:
            for query in queries:
                response = await client.get(
                    endpoint,
                    params={
                        "q": query,
                        "format": "json",
                        "language": "zh-CN" if language == "zh" else "en",
                        "safesearch": "1",
                    },
                )
                if response.status_code >= 400:
                    raise RuntimeError(f"Search service returned HTTP {response.status_code}.")
                data = response.json()
                for raw_item in data.get("results", [])[:top_k]:
                    if not isinstance(raw_item, dict):
                        continue
                    item = _normalize_item(raw_item)
                    if not item:
                        continue
                    dedupe_key = item["url"] or item["title"]
                    if dedupe_key in seen_urls:
                        continue
                    seen_urls.add(dedupe_key)
                    collected.append(item)
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        return SearchBridgeResult(
            status="degraded",
            query_count=len(queries),
            documents_count=0,
            results=[],
            error_summary=sanitize_message(f"Search service unavailable or timed out: {exc}", 180),
        )
    except Exception as exc:
        return SearchBridgeResult(
            status="degraded",
            query_count=len(queries),
            documents_count=0,
            results=[],
            error_summary=sanitize_message(f"Search bridge failed: {exc}", 180),
        )

    return SearchBridgeResult(
        status="success" if collected else "degraded",
        query_count=len(queries),
        documents_count=len(collected),
        results=collected[: max(top_k, 1) * max_queries],
        error_summary=None if collected else "Search returned no usable public sources.",
    )
