"""Tests for app.ollama_live — OllamaSession wrapper."""

from __future__ import annotations

import json

import httpx
import pytest
from unittest.mock import AsyncMock, patch

from app.ollama_live import OllamaError, OllamaSession
from app.settings import Settings


def _make_settings(**overrides) -> Settings:
    defaults = {
        "ollama_base_url": "http://localhost:11434",
        "ollama_model": "llama3.2",
    }
    defaults.update(overrides)
    return Settings(**defaults)


def _tags_response(models: list[str] | None = None) -> httpx.Response:
    """Build a fake /api/tags response."""
    if models is None:
        models = ["llama3.2:latest"]
    body = {"models": [{"name": m} for m in models]}
    return httpx.Response(
        200,
        json=body,
        request=httpx.Request("GET", "http://localhost:11434/api/tags"),
    )


# ------------------------------------------------------------------
# connect()
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connect_success():
    """connect() should succeed when Ollama is reachable and model exists."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get = AsyncMock(return_value=_tags_response(["llama3.2:latest"]))

    with patch("app.ollama_live.httpx.AsyncClient", return_value=mock_client):
        session = OllamaSession(settings=_make_settings())
        await session.connect()

        mock_client.get.assert_awaited_once_with("/api/tags")

        await session.close()


@pytest.mark.asyncio
async def test_connect_ollama_unreachable():
    """connect() should raise OllamaError when Ollama is not running."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get = AsyncMock(side_effect=httpx.ConnectError("refused"))

    with patch("app.ollama_live.httpx.AsyncClient", return_value=mock_client):
        session = OllamaSession(settings=_make_settings())

        with pytest.raises(OllamaError, match="Cannot reach Ollama"):
            await session.connect()


@pytest.mark.asyncio
async def test_connect_model_not_found():
    """connect() should raise OllamaError when model is not available."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get = AsyncMock(return_value=_tags_response(["mistral:latest"]))

    with patch("app.ollama_live.httpx.AsyncClient", return_value=mock_client):
        session = OllamaSession(settings=_make_settings())

        with pytest.raises(OllamaError, match="not found"):
            await session.connect()


# ------------------------------------------------------------------
# send_text() / receive_text()
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_and_receive_streams_chunks():
    """receive_text() should yield token chunks from streaming response."""
    # Simulate Ollama streaming JSON lines
    lines = [
        json.dumps({"message": {"content": "Hello"}, "done": False}),
        json.dumps({"message": {"content": " world"}, "done": False}),
        json.dumps({"message": {"content": "!"}, "done": True}),
    ]

    async def fake_aiter_lines():
        for line in lines:
            yield line

    mock_response = AsyncMock()
    mock_response.raise_for_status = lambda: None
    mock_response.aiter_lines = fake_aiter_lines
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get = AsyncMock(return_value=_tags_response())
    mock_client.stream = lambda *args, **kwargs: mock_response

    with patch("app.ollama_live.httpx.AsyncClient", return_value=mock_client):
        session = OllamaSession(settings=_make_settings())
        await session.connect()

        await session.send_text("Hi!")

        chunks: list[str] = []
        async for chunk in session.receive_text():
            chunks.append(chunk)

        assert chunks == ["Hello", " world", "!"]

        # Check conversation history was maintained
        assert len(session._messages) == 2
        assert session._messages[0] == {"role": "user", "content": "Hi!"}
        assert session._messages[1] == {
            "role": "assistant",
            "content": "Hello world!",
        }

        await session.close()


@pytest.mark.asyncio
async def test_send_text_raises_when_not_connected():
    """send_text() should raise RuntimeError when not connected."""
    session = OllamaSession(settings=_make_settings())
    with pytest.raises(RuntimeError, match="not connected"):
        await session.send_text("boom")


# ------------------------------------------------------------------
# Context manager
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_context_manager():
    """OllamaSession should work as an async context manager."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get = AsyncMock(return_value=_tags_response())

    with patch("app.ollama_live.httpx.AsyncClient", return_value=mock_client):
        async with OllamaSession(settings=_make_settings()) as session:
            assert session._client is not None

        # After exit, client should be cleaned up
        assert session._client is None
