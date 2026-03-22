"""Tests for the /ws/live WebSocket endpoint with mocked Ollama, STT, and DB."""

import json
import os
import tempfile
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.db import set_db_path
from app.main import app

@pytest.fixture(autouse=True)
def _use_temp_db():
    """Give each websocket test its own temp SQLite DB path."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    set_db_path(path)
    yield
    os.unlink(path)


@pytest.fixture
def client():
    """Create a fresh TestClient per test so lifespan startup/shutdown is clean."""
    with TestClient(app) as test_client:
        yield test_client

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

def _grounding_result(prompt: str) -> dict:
    """Return a no-op grounding result for typed-chat tests."""
    return {
        "prompt": prompt,
        "matches": [],
    }

# ------------------------------------------------------------------
# Existing text path (must still work)
# ------------------------------------------------------------------


def test_live_websocket_text_round_trip(client: TestClient):
    """Text sent over WS should produce transcript + turn_complete responses."""
    fake = _FakeOllamaSession()
    mock_ground = AsyncMock(return_value=_grounding_result("hello"))

    with patch("app.main.OllamaSession", return_value=fake), \
         patch("app.main.SpeechToTextService", return_value=_FakeStt()), \
         patch("app.main.build_grounded_prompt_for_query", mock_ground):
        with client.websocket_connect("/ws/live") as websocket:
            websocket.send_text("hello")

            r1 = websocket.receive_json()
            assert r1["type"] == "transcript"
            assert r1["text"] == "Hello "

            r2 = websocket.receive_json()
            assert r2["type"] == "transcript"
            assert r2["text"] == "from Ollama!"

            r3 = websocket.receive_json()
            assert r3["type"] == "turn_complete"
            assert r3["text"] == "Hello from Ollama!"

        fake.connect.assert_awaited_once()
        fake.close.assert_awaited_once()
        mock_ground.assert_awaited_once_with("hello")
        fake.send_text.assert_awaited_once_with("hello")

def test_typed_text_uses_grounded_prompt_but_persists_raw_user_text(client: TestClient):
    """Typed chat should send grounded prompt to Ollama but store the raw user text."""
    fake = _FakeOllamaSession()
    mock_create = AsyncMock(return_value="session-typed-grounded")
    mock_add = AsyncMock(return_value="msg-1")
    mock_ground = AsyncMock(
        return_value={
            "prompt": "GROUND_PROMPT_FROM_LOCAL_RETRIEVAL",
            "matches": [
                {
                    "document_id": "doc-1",
                    "document_title": "OS Notes",
                    "chunk_index": 0,
                    "text": "A process is a program in execution.",
                }
            ],
        }
    )

    with patch("app.main.OllamaSession", return_value=fake), \
         patch("app.main.SpeechToTextService", return_value=_FakeStt()), \
         patch("app.main.build_grounded_prompt_for_query", mock_ground), \
         patch("app.main.create_session", mock_create), \
         patch("app.main.add_message", mock_add):
        with client.websocket_connect("/ws/live") as websocket:
            websocket.send_text("What is a process?")

            websocket.receive_json()  # transcript chunk 1
            websocket.receive_json()  # transcript chunk 2
            websocket.receive_json()  # turn_complete

            sc = websocket.receive_json()
            assert sc["type"] == "session_created"
            assert sc["session_id"] == "session-typed-grounded"

            ts = websocket.receive_json()
            assert ts["type"] == "turn_saved"

    mock_ground.assert_awaited_once_with("What is a process?")
    fake.send_text.assert_awaited_once_with("GROUND_PROMPT_FROM_LOCAL_RETRIEVAL")

    mock_add.assert_any_await(
        "session-typed-grounded",
        "user",
        "What is a process?",
        source="typed",
    )
    mock_add.assert_any_await(
        "session-typed-grounded",
        "assistant",
        "Hello from Ollama!",
    )


# ------------------------------------------------------------------
# Audio lifecycle
# ------------------------------------------------------------------


def test_audio_lifecycle_round_trip(client: TestClient):
    """audio_start → binary → audio_end should produce stt_result + grounded Ollama response."""
    fake_ollama = _FakeOllamaSession()
    fake_stt = _FakeStt(transcript="hello from voice")

    with patch("app.main.OllamaSession", return_value=fake_ollama), \
         patch("app.main.SpeechToTextService", return_value=fake_stt):
        with client.websocket_connect("/ws/live") as websocket:
            websocket.send_text(json.dumps({"type": "audio_start"}))
            websocket.send_bytes(b"\x00\x01\x02\x03")
            websocket.send_bytes(b"\x04\x05\x06\x07")
            websocket.send_text(json.dumps({"type": "audio_end"}))

            r1 = websocket.receive_json()
            assert r1["type"] == "stt_result"
            assert r1["text"] == "hello from voice"

            r2 = websocket.receive_json()
            assert r2["type"] == "transcript"
            assert r2["text"] == "Hello "

            r3 = websocket.receive_json()
            assert r3["type"] == "transcript"
            assert r3["text"] == "from Ollama!"

            r4 = websocket.receive_json()
            assert r4["type"] == "turn_complete"
            assert r4["text"] == "Hello from Ollama!"
            assert r4["source_info"] == {
                "matched": False,
                "match_count": 0,
                "source_titles": [],
            }

            r5 = websocket.receive_json()
            assert r5["type"] == "session_created"

            r6 = websocket.receive_json()
            assert r6["type"] == "turn_saved"

        fake_ollama.send_text.assert_awaited_once_with(
            "You are WhisperLens, a local-first study assistant.\n"
            "No matching study-source context was found for this turn.\n"
            "Do not rely on study-source context from earlier turns when answering this question.\n"
            "Answer normally and be clear about the absence of relevant study-note context.\n\n"
            "User question:\n"
            "hello from voice"
        )


def test_audio_end_without_data_returns_error(client: TestClient):
    """audio_end with no audio data should send an error."""
    fake_ollama = _FakeOllamaSession()

    with patch("app.main.OllamaSession", return_value=fake_ollama), \
         patch("app.main.SpeechToTextService", return_value=_FakeStt()):
        with client.websocket_connect("/ws/live") as websocket:
            websocket.send_text(json.dumps({"type": "audio_start"}))
            websocket.send_text(json.dumps({"type": "audio_end"}))

            r1 = websocket.receive_json()
            assert r1["type"] == "error"
            assert "No audio data" in r1["message"]


def test_binary_without_audio_start_is_ignored(client: TestClient):
    """Binary frames sent without audio_start should be silently ignored."""
    fake_ollama = _FakeOllamaSession()
    mock_ground = AsyncMock(return_value=_grounding_result("hello"))

    with patch("app.main.OllamaSession", return_value=fake_ollama), \
         patch("app.main.SpeechToTextService", return_value=_FakeStt()), \
         patch("app.main.build_grounded_prompt_for_query", mock_ground):
        with client.websocket_connect("/ws/live") as websocket:
            websocket.send_bytes(b"\x00\x01\x02\x03")
            websocket.send_text("hello")

            r1 = websocket.receive_json()
            assert r1["type"] == "transcript"

    mock_ground.assert_awaited_once_with("hello")


def test_audio_end_without_audio_start_returns_error(client: TestClient):
    """audio_end sent without a preceding audio_start should return error."""
    fake_ollama = _FakeOllamaSession()

    with patch("app.main.OllamaSession", return_value=fake_ollama), \
         patch("app.main.SpeechToTextService", return_value=_FakeStt()):
        with client.websocket_connect("/ws/live") as websocket:
            websocket.send_text(json.dumps({"type": "audio_end"}))

            r1 = websocket.receive_json()
            assert r1["type"] == "error"
            assert "No audio data" in r1["message"]

def test_voice_path_uses_grounding(client: TestClient):
    """Voice turns should now use study-source grounding before calling Ollama."""
    fake_ollama = _FakeOllamaSession()
    fake_stt = _FakeStt(transcript="hello from voice")
    mock_ground = AsyncMock(
        return_value={
            "prompt": "VOICE_GROUNDED_PROMPT",
            "matches": [
                {
                    "chunk_id": 1,
                    "document_id": 10,
                    "document_title": "Operating Systems Notes",
                    "chunk_index": 0,
                    "content": "A process is a program in execution.",
                }
            ],
        }
    )

    with patch("app.main.OllamaSession", return_value=fake_ollama), \
         patch("app.main.SpeechToTextService", return_value=fake_stt), \
         patch("app.main.build_grounded_prompt_for_query", mock_ground):
        with client.websocket_connect("/ws/live") as websocket:
            websocket.send_text(json.dumps({"type": "audio_start"}))
            websocket.send_bytes(b"\x00\x01\x02\x03")
            websocket.send_text(json.dumps({"type": "audio_end"}))

            r1 = websocket.receive_json()
            assert r1["type"] == "stt_result"
            assert r1["text"] == "hello from voice"

            websocket.receive_json()  # transcript chunk 1
            websocket.receive_json()  # transcript chunk 2

            turn_complete = websocket.receive_json()
            assert turn_complete["type"] == "turn_complete"
            assert turn_complete["text"] == "Hello from Ollama!"
            assert turn_complete["source_info"] == {
                "matched": True,
                "match_count": 1,
                "source_titles": ["Operating Systems Notes"],
            }

            websocket.receive_json()  # session_created
            websocket.receive_json()  # turn_saved

    mock_ground.assert_awaited_once_with("hello from voice")
    fake_ollama.send_text.assert_awaited_once_with("VOICE_GROUNDED_PROMPT")


# ------------------------------------------------------------------
# Persistence
# ------------------------------------------------------------------


def test_typed_turn_persists_messages(client: TestClient):
    """Typed turn should persist messages, send session_created, then turn_saved."""
    fake = _FakeOllamaSession()
    mock_create = AsyncMock(return_value="session-123")
    mock_add = AsyncMock(return_value="msg-1")
    mock_ground = AsyncMock(return_value=_grounding_result("hello world"))

    with patch("app.main.OllamaSession", return_value=fake), \
         patch("app.main.SpeechToTextService", return_value=_FakeStt()), \
         patch("app.main.build_grounded_prompt_for_query", mock_ground), \
         patch("app.main.create_session", mock_create), \
         patch("app.main.add_message", mock_add):
        with client.websocket_connect("/ws/live") as websocket:
            websocket.send_text("hello world")

            websocket.receive_json()  # transcript chunk 1
            websocket.receive_json()  # transcript chunk 2
            websocket.receive_json()  # turn_complete

            sc = websocket.receive_json()
            assert sc["type"] == "session_created"
            assert sc["session_id"] == "session-123"

            ts = websocket.receive_json()
            assert ts["type"] == "turn_saved"

    mock_ground.assert_awaited_once_with("hello world")
    mock_create.assert_awaited_once_with("hello world")
    assert mock_add.await_count == 2
    mock_add.assert_any_await("session-123", "user", "hello world", source="typed")
    mock_add.assert_any_await("session-123", "assistant", "Hello from Ollama!")


def test_voice_turn_persists_messages(client: TestClient):
    """Voice turn should persist messages, send session_created, then turn_saved."""
    fake_ollama = _FakeOllamaSession()
    fake_stt = _FakeStt(transcript="hello from voice")
    mock_create = AsyncMock(return_value="session-456")
    mock_add = AsyncMock(return_value="msg-1")

    with patch("app.main.OllamaSession", return_value=fake_ollama), \
         patch("app.main.SpeechToTextService", return_value=fake_stt), \
         patch("app.main.create_session", mock_create), \
         patch("app.main.add_message", mock_add):
        with client.websocket_connect("/ws/live") as websocket:
            websocket.send_text(json.dumps({"type": "audio_start"}))
            websocket.send_bytes(b"\x00\x01\x02\x03")
            websocket.send_text(json.dumps({"type": "audio_end"}))

            websocket.receive_json()  # stt_result
            websocket.receive_json()  # transcript chunk 1
            websocket.receive_json()  # transcript chunk 2
            websocket.receive_json()  # turn_complete

            sc = websocket.receive_json()
            assert sc["type"] == "session_created"
            assert sc["session_id"] == "session-456"

            ts = websocket.receive_json()
            assert ts["type"] == "turn_saved"

    mock_create.assert_awaited_once_with("hello from voice")
    assert mock_add.await_count == 2
    mock_add.assert_any_await("session-456", "user", "hello from voice", source="voice")
    mock_add.assert_any_await("session-456", "assistant", "Hello from Ollama!")


def test_second_typed_turn_reuses_session(client: TestClient):
    """A second typed turn should reuse the existing session (no second create_session)."""
    fake = _FakeOllamaSession()
    mock_create = AsyncMock(return_value="session-789")
    mock_add = AsyncMock(return_value="msg-1")
    mock_ground = AsyncMock(
        side_effect=[
            _grounding_result("first message"),
            _grounding_result("second message"),
        ]
    )

    with patch("app.main.OllamaSession", return_value=fake), \
         patch("app.main.SpeechToTextService", return_value=_FakeStt()), \
         patch("app.main.build_grounded_prompt_for_query", mock_ground), \
         patch("app.main.create_session", mock_create), \
         patch("app.main.add_message", mock_add):
        with client.websocket_connect("/ws/live") as websocket:
            # First turn — creates session
            websocket.send_text("first message")
            websocket.receive_json()  # transcript 1
            websocket.receive_json()  # transcript 2
            websocket.receive_json()  # turn_complete
            sc = websocket.receive_json()
            assert sc["type"] == "session_created"
            websocket.receive_json()  # turn_saved

            # Second turn — should reuse session
            websocket.send_text("second message")
            websocket.receive_json()  # transcript 1
            websocket.receive_json()  # transcript 2
            websocket.receive_json()  # turn_complete
            websocket.receive_json()  # turn_saved (no session_created)

    assert mock_ground.await_count == 2
    mock_create.assert_awaited_once_with("first message")
    assert mock_add.await_count == 4


def test_session_bind_reuses_existing_session(client: TestClient):
    """session_bind should set the session id so typed turns skip create_session."""
    fake = _FakeOllamaSession()
    mock_create = AsyncMock(return_value="should-not-be-called")
    mock_add = AsyncMock(return_value="msg-1")
    mock_ground = AsyncMock(return_value=_grounding_result("hello after bind"))

    with patch("app.main.OllamaSession", return_value=fake), \
         patch("app.main.SpeechToTextService", return_value=_FakeStt()), \
         patch("app.main.build_grounded_prompt_for_query", mock_ground), \
         patch("app.main.create_session", mock_create), \
         patch("app.main.add_message", mock_add):
        with client.websocket_connect("/ws/live") as websocket:
            websocket.send_text(json.dumps({
                "type": "session_bind",
                "session_id": "existing-session-abc",
            }))

            websocket.send_text("hello after bind")
            websocket.receive_json()  # transcript 1
            websocket.receive_json()  # transcript 2
            websocket.receive_json()  # turn_complete
            websocket.receive_json()  # turn_saved

    mock_ground.assert_awaited_once_with("hello after bind")
    mock_create.assert_not_awaited()
    assert mock_add.await_count == 2
    mock_add.assert_any_await("existing-session-abc", "user", "hello after bind", source="typed")
    mock_add.assert_any_await("existing-session-abc", "assistant", "Hello from Ollama!")

def test_typed_turn_complete_includes_source_info_when_grounding_matches(client):
    """Typed turns with study-source matches should include lightweight source info."""
    fake = _FakeOllamaSession()
    mock_create = AsyncMock(return_value="session-source-info")
    mock_add = AsyncMock(return_value="msg-1")
    mock_ground = AsyncMock(
        return_value={
            "prompt": "GROUND_PROMPT_FROM_LOCAL_RETRIEVAL",
            "matches": [
                {
                    "document_id": "doc-1",
                    "document_title": "Operating Systems Notes",
                    "chunk_index": 0,
                    "text": "A process is a program in execution.",
                },
                {
                    "document_id": "doc-1",
                    "document_title": "Operating Systems Notes",
                    "chunk_index": 1,
                    "text": "Threads are smaller units of execution inside a process.",
                },
            ],
        }
    )

    with patch("app.main.OllamaSession", return_value=fake), \
         patch("app.main.SpeechToTextService", return_value=_FakeStt()), \
         patch("app.main.build_grounded_prompt_for_query", mock_ground), \
         patch("app.main.create_session", mock_create), \
         patch("app.main.add_message", mock_add):
        with client.websocket_connect("/ws/live") as websocket:
            websocket.send_text("What is a process?")

            websocket.receive_json()  # transcript chunk 1
            websocket.receive_json()  # transcript chunk 2

            turn_complete = websocket.receive_json()
            assert turn_complete["type"] == "turn_complete"
            assert turn_complete["text"] == "Hello from Ollama!"
            assert turn_complete["source_info"] == {
                "matched": True,
                "match_count": 2,
                "source_titles": ["Operating Systems Notes"],
            }

            websocket.receive_json()  # session_created
            websocket.receive_json()  # turn_saved