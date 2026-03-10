"""Tests for the vision service and POST /api/vision endpoint."""

from __future__ import annotations

import asyncio
import os
import tempfile

import httpx
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from fastapi.testclient import TestClient

from app.db import init_db, set_db_path
from app.main import app
from app.vision import analyze_image, VisionError

client = TestClient(app)

FAKE_B64 = "aW1hZ2VkYXRh"  # base64 of "imagedata"


@pytest.fixture(autouse=True)
def _use_temp_db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    set_db_path(path)
    asyncio.get_event_loop().run_until_complete(init_db())
    yield
    os.unlink(path)


# ------------------------------------------------------------------
# Unit: analyze_image
# ------------------------------------------------------------------

@pytest.mark.asyncio
async def test_analyze_image_success():
    """analyze_image should call Ollama with images field and return content."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "message": {"role": "assistant", "content": "I see a cat."}
    }

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("app.vision.httpx.AsyncClient", return_value=mock_client):
        result = await analyze_image(FAKE_B64, "What is this?")

    assert result == "I see a cat."
    # Verify images field was passed
    call_kwargs = mock_client.post.call_args
    payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
    assert payload["messages"][0]["images"] == [FAKE_B64]
    assert payload["messages"][0]["content"] == "What is this?"


@pytest.mark.asyncio
async def test_analyze_image_empty_response():
    """analyze_image should raise VisionError on empty response."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {"message": {"content": ""}}

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("app.vision.httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(VisionError, match="empty response"):
            await analyze_image(FAKE_B64)


# ------------------------------------------------------------------
# Endpoint: POST /api/vision
# ------------------------------------------------------------------

def test_vision_endpoint_success():
    """POST /api/vision should return answer and persist the turn."""
    with patch("app.main.analyze_image", new_callable=AsyncMock, return_value="A diagram of a circuit."):
        resp = client.post("/api/vision", json={
            "image": FAKE_B64,
            "question": "What is this diagram?"
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["answer"] == "A diagram of a circuit."
    assert "session_id" in data


def test_vision_endpoint_persists():
    """POST /api/vision should persist both user and assistant messages."""
    import sqlite3
    from app.db import _get_db_path

    with patch("app.main.analyze_image", new_callable=AsyncMock, return_value="It's a photo."):
        resp = client.post("/api/vision", json={
            "image": FAKE_B64,
            "question": "Explain this"
        })

    sid = resp.json()["session_id"]
    conn = sqlite3.connect(_get_db_path())
    conn.row_factory = sqlite3.Row
    msgs = conn.execute(
        "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC",
        (sid,),
    ).fetchall()
    conn.close()

    assert len(msgs) == 2
    assert msgs[0]["role"] == "user"
    assert msgs[0]["text"] == "Explain this"
    assert msgs[0]["source"] == "vision"
    assert msgs[1]["role"] == "assistant"
    assert msgs[1]["text"] == "It's a photo."


def test_vision_endpoint_no_image():
    """POST /api/vision without image field should return 422."""
    resp = client.post("/api/vision", json={"question": "hello"})
    assert resp.status_code == 422


def test_vision_endpoint_ollama_error():
    """POST /api/vision should return 502 if vision model fails."""
    with patch("app.main.analyze_image", new_callable=AsyncMock, side_effect=VisionError("model error")):
        resp = client.post("/api/vision", json={"image": FAKE_B64})

    assert resp.status_code == 502
    assert "model error" in resp.json()["detail"]


def test_vision_first_continuity():
    """Two vision requests should share one session when session_id is reused."""
    import sqlite3
    from app.db import _get_db_path

    with patch("app.main.analyze_image", new_callable=AsyncMock, return_value="Answer 1"):
        r1 = client.post("/api/vision", json={"image": FAKE_B64, "question": "Q1"})
    assert r1.status_code == 200
    sid = r1.json()["session_id"]

    # Second vision request reuses session_id from first
    with patch("app.main.analyze_image", new_callable=AsyncMock, return_value="Answer 2"):
        r2 = client.post("/api/vision", json={
            "image": FAKE_B64,
            "question": "Q2",
            "session_id": sid,
        })
    assert r2.status_code == 200
    assert r2.json()["session_id"] == sid  # same session

    # Verify all 4 messages in one session
    conn = sqlite3.connect(_get_db_path())
    conn.row_factory = sqlite3.Row
    msgs = conn.execute(
        "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC",
        (sid,),
    ).fetchall()
    conn.close()

    assert len(msgs) == 4
    assert msgs[0]["text"] == "Q1"
    assert msgs[1]["text"] == "Answer 1"
    assert msgs[2]["text"] == "Q2"
    assert msgs[3]["text"] == "Answer 2"

