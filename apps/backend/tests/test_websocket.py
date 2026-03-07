"""Tests for the /ws/live WebSocket endpoint with mocked Gemini session."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class _FakeGeminiSession:
    """Fully mocked GeminiLiveSession for WebSocket tests."""

    def __init__(self):
        self.connect = AsyncMock()
        self.close = AsyncMock()
        self.send_text = AsyncMock()
        self._responses = ["Hello ", "from Gemini!"]

    async def receive_text(self):
        for chunk in self._responses:
            yield chunk


def _make_fake_session(*args, **kwargs):
    return _FakeGeminiSession()


def test_live_websocket_text_round_trip():
    """Text sent over WS should produce transcript + turn_complete responses."""
    fake = _FakeGeminiSession()

    with patch("app.main.GeminiLiveSession", return_value=fake):
        with client.websocket_connect("/ws/live") as websocket:
            websocket.send_text("hello")

            # First: transcript chunks
            r1 = websocket.receive_json()
            assert r1["type"] == "transcript"
            assert r1["text"] == "Hello "

            r2 = websocket.receive_json()
            assert r2["type"] == "transcript"
            assert r2["text"] == "from Gemini!"

            # Then: turn_complete with full text
            r3 = websocket.receive_json()
            assert r3["type"] == "turn_complete"
            assert r3["text"] == "Hello from Gemini!"

        # Session should have been connected and closed
        fake.connect.assert_awaited_once()
        fake.close.assert_awaited_once()
        fake.send_text.assert_awaited_once_with("hello")