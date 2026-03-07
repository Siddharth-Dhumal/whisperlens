"""Tests for app.gemini_live — GeminiLiveSession wrapper."""

from __future__ import annotations

import pytest
from unittest import mock
from unittest.mock import AsyncMock, MagicMock, patch

from app.gemini_live import GeminiLiveSession
from app.settings import Settings


def _make_settings(**overrides) -> Settings:
    defaults = {
        "google_cloud_project": "test-proj",
        "google_cloud_location": "us-central1",
        "google_genai_use_vertexai": True,
        "gemini_live_model": "test-model",
    }
    defaults.update(overrides)
    return Settings(**defaults)


class _FakeLiveServerMessage:
    """Minimal stand-in for genai.types.LiveServerMessage."""

    def __init__(self, text: str | None = None):
        self.text = text


@pytest.mark.asyncio
async def test_connect_creates_client_and_session():
    """connect() should create a genai.Client and open an async session."""
    mock_session = AsyncMock()
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    mock_client = MagicMock()
    mock_client.aio.live.connect.return_value = mock_ctx

    with patch("app.gemini_live.genai.Client", return_value=mock_client):
        session = GeminiLiveSession(settings=_make_settings())
        await session.connect()

        mock_client.aio.live.connect.assert_called_once_with(
            model="test-model",
            config={"response_modalities": ["TEXT"]},
        )
        assert session._session is mock_session

        await session.close()


@pytest.mark.asyncio
async def test_send_text_calls_send_client_content():
    """send_text() should forward text via send_client_content."""
    mock_session = AsyncMock()
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    mock_client = MagicMock()
    mock_client.aio.live.connect.return_value = mock_ctx

    with patch("app.gemini_live.genai.Client", return_value=mock_client):
        gs = GeminiLiveSession(settings=_make_settings())
        await gs.connect()

        await gs.send_text("Hello!")

        mock_session.send_client_content.assert_awaited_once()
        call_kwargs = mock_session.send_client_content.call_args
        assert call_kwargs.kwargs["turn_complete"] is True

        await gs.close()


@pytest.mark.asyncio
async def test_receive_text_yields_text_chunks():
    """receive_text() should yield text from LiveServerMessages."""
    messages = [
        _FakeLiveServerMessage(text="Hello"),
        _FakeLiveServerMessage(text=" world"),
        _FakeLiveServerMessage(text=None),  # should be skipped
    ]

    async def fake_receive():
        for m in messages:
            yield m

    mock_session = AsyncMock()
    mock_session.receive = fake_receive

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    mock_client = MagicMock()
    mock_client.aio.live.connect.return_value = mock_ctx

    with patch("app.gemini_live.genai.Client", return_value=mock_client):
        gs = GeminiLiveSession(settings=_make_settings())
        await gs.connect()

        chunks: list[str] = []
        async for chunk in gs.receive_text():
            chunks.append(chunk)

        assert chunks == ["Hello", " world"]

        await gs.close()


@pytest.mark.asyncio
async def test_send_text_raises_when_not_connected():
    """send_text() should raise RuntimeError when not connected."""
    gs = GeminiLiveSession(settings=_make_settings())
    with pytest.raises(RuntimeError, match="not connected"):
        await gs.send_text("boom")


@pytest.mark.asyncio
async def test_context_manager():
    """GeminiLiveSession should work as an async context manager."""
    mock_session = AsyncMock()
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    mock_client = MagicMock()
    mock_client.aio.live.connect.return_value = mock_ctx

    with patch("app.gemini_live.genai.Client", return_value=mock_client):
        async with GeminiLiveSession(settings=_make_settings()) as gs:
            assert gs._session is mock_session

        # After exit, session should be cleaned up
        assert gs._session is None
