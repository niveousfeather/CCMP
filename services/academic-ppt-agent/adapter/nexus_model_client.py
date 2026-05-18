"""Future NexusAI model adapter for paper-ppt-agent.

The sidecar must call NexusAI server-side model capabilities through an
internal adapter instead of reading user API keys or provider settings.
"""

from __future__ import annotations


class NexusModelClient:
    """Placeholder interface for a future server-side GPT5.4 / Kimi bridge."""

    async def complete(self, prompt: str) -> str:
        raise NotImplementedError(
            "Wire this to a NexusAI server-side task-model endpoint. "
            "Do not read API keys or provider config in the sidecar."
        )
