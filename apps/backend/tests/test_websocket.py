"""Tests for the /ws/live WebSocket endpoint with mocked Ollama and STT."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

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


class _FakeStt:
    """Mocked SpeechToTextService."""

    def __init__(self, transcript: str = "hello from voice", **kwargs):
        self._transcript = transcript

    def transcribe(self, audio_bytes: bytes) -> str:
        return self._transcript


# ------------------------------------------------------------------
# Existing text path (must still work)
# ------------------------------------------------------------------


def test_live_websocket_text_round_trip():
    """Text sent over WS should produce transcript + turn_complete responses."""
    fake = _FakeOllamaSession()

    with patch("app.main.OllamaSession", return_value=fake), \
         patch("app.main.SpeechToTextService", return_value=_FakeStt()):
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

        fake.connect.assert_awaited_once()
        fake.close.assert_awaited_once()
        fake.send_text.assert_awaited_once_with("hello")


# ------------------------------------------------------------------
# Audio lifecycle
# ------------------------------------------------------------------


def test_audio_lifecycle_round_trip():
    """audio_start → binary → audio_end should produce stt_result + Ollama response."""
    fake_ollama = _FakeOllamaSession()
    fake_stt = _FakeStt(transcript="hello from voice")

    with patch("app.main.OllamaSession", return_value=fake_ollama), \
         patch("app.main.SpeechToTextService", return_value=fake_stt):
        with client.websocket_connect("/ws/live") as websocket:
            # Start audio recording
            websocket.send_text(json.dumps({"type": "audio_start"}))

            # Send binary audio chunks
            websocket.send_bytes(b"\x00\x01\x02\x03")
            websocket.send_bytes(b"\x04\x05\x06\x07")

            # End audio recording
            websocket.send_text(json.dumps({"type": "audio_end"}))

            # Should get stt_result first
            r1 = websocket.receive_json()
            assert r1["type"] == "stt_result"
            assert r1["text"] == "hello from voice"

            # Then Ollama response (transcript chunks + turn_complete)
            r2 = websocket.receive_json()
            assert r2["type"] == "transcript"
            assert r2["text"] == "Hello "

            r3 = websocket.receive_json()
            assert r3["type"] == "transcript"
            assert r3["text"] == "from Ollama!"

            r4 = websocket.receive_json()
            assert r4["type"] == "turn_complete"
            assert r4["text"] == "Hello from Ollama!"

        fake_ollama.send_text.assert_awaited_once_with("hello from voice")


def test_audio_end_without_data_returns_error():
    """audio_end with no audio data should send an error."""
    fake_ollama = _FakeOllamaSession()

    with patch("app.main.OllamaSession", return_value=fake_ollama), \
         patch("app.main.SpeechToTextService", return_value=_FakeStt()):
        with client.websocket_connect("/ws/live") as websocket:
            websocket.send_text(json.dumps({"type": "audio_start"}))
            # No binary data sent
            websocket.send_text(json.dumps({"type": "audio_end"}))

            r1 = websocket.receive_json()
            assert r1["type"] == "error"
            assert "No audio data" in r1["message"]


def test_binary_without_audio_start_is_ignored():
    """Binary frames sent without audio_start should be silently ignored."""
    fake_ollama = _FakeOllamaSession()

    with patch("app.main.OllamaSession", return_value=fake_ollama), \
         patch("app.main.SpeechToTextService", return_value=_FakeStt()):
        with client.websocket_connect("/ws/live") as websocket:
            # Send binary without starting audio session
            websocket.send_bytes(b"\x00\x01\x02\x03")

            # Send a text message to verify connection still works
            websocket.send_text("hello")

            r1 = websocket.receive_json()
            assert r1["type"] == "transcript"


def test_audio_end_without_audio_start_returns_error():
    """audio_end sent without a preceding audio_start should return error."""
    fake_ollama = _FakeOllamaSession()

    with patch("app.main.OllamaSession", return_value=fake_ollama), \
         patch("app.main.SpeechToTextService", return_value=_FakeStt()):
        with client.websocket_connect("/ws/live") as websocket:
            # audio_end without audio_start — buffer is empty
            websocket.send_text(json.dumps({"type": "audio_end"}))

            r1 = websocket.receive_json()
            assert r1["type"] == "error"
            assert "No audio data" in r1["message"]