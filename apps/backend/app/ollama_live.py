"""Async wrapper around the local Ollama HTTP API (text-only)."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from types import TracebackType

import httpx

from app.settings import Settings, get_settings

logger = logging.getLogger(__name__)


class OllamaError(Exception):
    """Raised when the Ollama backend is unreachable or returns an error."""


class OllamaSession:
    """Manages a conversation with a local Ollama model.

    Uses Ollama's ``/api/chat`` endpoint with ``stream: true`` for real-time
    token-by-token responses.

    Usage::

        async with OllamaSession() as session:
            await session.send_text("Hello!")
            async for chunk in session.receive_text():
                print(chunk)
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._client: httpx.AsyncClient | None = None
        self._messages: list[dict[str, str]] = []
        self._pending_user_text: str | None = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def connect(self) -> None:
        """Verify that Ollama is reachable and the model is available."""
        s = self._settings

        self._client = httpx.AsyncClient(
            base_url=s.ollama_base_url,
            timeout=httpx.Timeout(connect=5.0, read=120.0, write=5.0, pool=5.0),
        )

        # Health-check: hit the tags endpoint to verify connectivity
        try:
            resp = await self._client.get("/api/tags")
            resp.raise_for_status()
        except httpx.ConnectError as exc:
            await self._cleanup()
            raise OllamaError(
                f"Cannot reach Ollama at {s.ollama_base_url}. "
                "Is Ollama running? (ollama serve)"
            ) from exc
        except httpx.HTTPStatusError as exc:
            await self._cleanup()
            raise OllamaError(
                f"Ollama returned HTTP {exc.response.status_code}"
            ) from exc

        # Check that the requested model exists
        data = resp.json()
        available = [m.get("name", "") for m in data.get("models", [])]
        # Ollama returns names like "llama3.2:latest" — match on prefix
        model_found = any(
            name == s.ollama_model or name.startswith(f"{s.ollama_model}:")
            for name in available
        )
        if not model_found:
            await self._cleanup()
            raise OllamaError(
                f"Model '{s.ollama_model}' not found in Ollama. "
                f"Available: {available}. Run: ollama pull {s.ollama_model}"
            )

        logger.info(
            "Ollama session ready (url=%s, model=%s)",
            s.ollama_base_url,
            s.ollama_model,
        )

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._cleanup()
        logger.info("Ollama session closed")

    async def _cleanup(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    # ------------------------------------------------------------------
    # Messaging
    # ------------------------------------------------------------------

    async def send_text(self, text: str) -> None:
        """Record a user message for the next model turn."""
        if self._client is None:
            raise RuntimeError("Session is not connected. Call connect() first.")

        self._messages.append({"role": "user", "content": text})
        self._pending_user_text = text
        logger.debug("Queued user message: %s", text[:80])

    async def receive_text(self) -> AsyncIterator[str]:
        """Stream response tokens from Ollama.

        Calls ``/api/chat`` with ``stream: true`` and yields each token as it
        arrives.  The assistant's full response is appended to the conversation
        history so subsequent turns have context.
        """
        if self._client is None:
            raise RuntimeError("Session is not connected. Call connect() first.")

        payload = {
            "model": self._settings.ollama_model,
            "messages": self._messages,
            "stream": True,
        }

        full_response = ""

        try:
            async with self._client.stream(
                "POST", "/api/chat", json=payload
            ) as resp:
                resp.raise_for_status()

                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue

                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    token = chunk.get("message", {}).get("content", "")
                    if token:
                        full_response += token
                        yield token

                    # Ollama signals end-of-response with "done": true
                    if chunk.get("done", False):
                        break

        except httpx.ConnectError as exc:
            raise OllamaError("Lost connection to Ollama") from exc
        except httpx.HTTPStatusError as exc:
            raise OllamaError(
                f"Ollama returned HTTP {exc.response.status_code}"
            ) from exc

        # Store assistant response for multi-turn context
        if full_response:
            self._messages.append({"role": "assistant", "content": full_response})

    # ------------------------------------------------------------------
    # Async context manager
    # ------------------------------------------------------------------

    async def __aenter__(self) -> "OllamaSession":
        await self.connect()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        await self.close()
