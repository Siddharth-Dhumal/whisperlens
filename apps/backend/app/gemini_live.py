"""Async wrapper around the google-genai Live API (text-only for now)."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from types import TracebackType

from google import genai
from google.genai import types

from app.settings import Settings, get_settings

logger = logging.getLogger(__name__)


class GeminiLiveSession:
    """Manages a single Gemini Live session.

    Usage::

        async with GeminiLiveSession() as session:
            await session.send_text("Hello!")
            async for chunk in session.receive_text():
                print(chunk)
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._client: genai.Client | None = None
        self._session: genai.live.AsyncSession | None = None
        self._ctx: object | None = None  # async context manager

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def connect(self) -> None:
        """Open a Gemini Live session with TEXT-only response modality."""
        s = self._settings

        client_kwargs: dict = {}
        if s.google_genai_use_vertexai:
            client_kwargs["vertexai"] = True
            client_kwargs["project"] = s.google_cloud_project
            client_kwargs["location"] = s.google_cloud_location

        self._client = genai.Client(**client_kwargs)

        config = {"response_modalities": ["TEXT"]}

        self._ctx = self._client.aio.live.connect(
            model=s.gemini_live_model,
            config=config,
        )
        # __aenter__ returns the AsyncSession
        self._session = await self._ctx.__aenter__()  # type: ignore[union-attr]
        logger.info("Gemini Live session opened (model=%s)", s.gemini_live_model)

    async def close(self) -> None:
        """Close the underlying session gracefully."""
        if self._ctx is not None:
            try:
                await self._ctx.__aexit__(None, None, None)  # type: ignore[union-attr]
            except Exception:
                logger.exception("Error closing Gemini Live session")
            finally:
                self._session = None
                self._ctx = None
                self._client = None
                logger.info("Gemini Live session closed")

    # ------------------------------------------------------------------
    # Messaging
    # ------------------------------------------------------------------

    async def send_text(self, text: str) -> None:
        """Send a user text message and mark the turn as complete."""
        if self._session is None:
            raise RuntimeError("Session is not connected. Call connect() first.")

        await self._session.send_client_content(
            turns=types.Content(
                role="user",
                parts=[types.Part(text=text)],
            ),
            turn_complete=True,
        )
        logger.debug("Sent text to Gemini Live: %s", text[:80])

    async def receive_text(self) -> AsyncIterator[str]:
        """Yield text fragments from the model response."""
        if self._session is None:
            raise RuntimeError("Session is not connected. Call connect() first.")

        async for message in self._session.receive():
            if message.text is not None:
                yield message.text

    # ------------------------------------------------------------------
    # Async context manager
    # ------------------------------------------------------------------

    async def __aenter__(self) -> "GeminiLiveSession":
        await self.connect()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        await self.close()
