"""Tests for the /ws/live WebSocket endpoint with mocked Ollama session."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class _FakeOllamaSession:
    """Fully mocked OllamaSession for WebSocket tests."""

    def __init__(self):
        self.connect = AsyncMock()
        self.close = AsyncMock()
        self.send_text = AsyncMock()
        self._responses = ["Hello ", "from Ollama!"]

    async def receive_text(self):
        for chunk in self._responses:
            yield chunk


def test_live_websocket_text_round_trip():
    """Text sent over WS should produce transcript + turn_complete responses."""
    fake = _FakeOllamaSession()

    with patch("app.main.OllamaSession", return_value=fake):
        with client.websocket_connect("/ws/live") as websocket:
            websocket.send_text("hello")

            # First: transcript chunks
            r1 = websocket.receive_json()
            assert r1["type"] == "transcript"
            assert r1["text"] == "Hello "

            r2 = websocket.receive_json()
            assert r2["type"] == "transcript"
            assert r2["text"] == "from Ollama!"

            # Then: turn_complete with full text
            r3 = websocket.receive_json()
            assert r3["type"] == "turn_complete"
            assert r3["text"] == "Hello from Ollama!"

        # Session should have been connected and closed
        fake.connect.assert_awaited_once()
        fake.close.assert_awaited_once()
        fake.send_text.assert_awaited_once_with("hello")