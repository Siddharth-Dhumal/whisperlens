"""Tests for the Study Vault REST API endpoints."""

from __future__ import annotations

import asyncio
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from app.db import add_message, create_session, init_db, set_db_path
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _use_temp_db():
    """Use a fresh temp DB for each test."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    set_db_path(path)
    asyncio.get_event_loop().run_until_complete(init_db())
    yield
    os.unlink(path)


@pytest.mark.asyncio
async def test_list_sessions_empty():
    """GET /api/sessions should return empty list when no sessions exist."""
    response = client.get("/api/sessions")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_list_sessions_with_data():
    """GET /api/sessions should return saved sessions."""
    await create_session("Session A")
    await create_session("Session B")

    response = client.get("/api/sessions")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    titles = [s["title"] for s in data]
    assert "Session A" in titles
    assert "Session B" in titles


@pytest.mark.asyncio
async def test_get_session_with_messages():
    """GET /api/sessions/{id} should return session with messages."""
    sid = await create_session("Chat")
    await add_message(sid, "user", "Hello", source="typed")
    await add_message(sid, "assistant", "Hi back")

    response = client.get(f"/api/sessions/{sid}")
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Chat"
    assert len(data["messages"]) == 2
    assert data["messages"][0]["role"] == "user"
    assert data["messages"][1]["role"] == "assistant"


def test_get_session_not_found():
    """GET /api/sessions/{id} for nonexistent id returns 404."""
    response = client.get("/api/sessions/does-not-exist")
    assert response.status_code == 404
