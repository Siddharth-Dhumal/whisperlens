"""Tests for app.db — SQLite persistence layer."""

from __future__ import annotations

import asyncio
import os
import tempfile

import pytest

from app.db import (
    add_message,
    create_session,
    get_session,
    init_db,
    list_sessions,
    set_db_path,
)


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
async def test_create_and_get_session():
    """create_session + get_session round-trip."""
    sid = await create_session("Test session")
    session = await get_session(sid)

    assert session is not None
    assert session["id"] == sid
    assert session["title"] == "Test session"
    assert session["messages"] == []


@pytest.mark.asyncio
async def test_add_message():
    """add_message should appear in get_session."""
    sid = await create_session("Chat session")
    await add_message(sid, "user", "Hello", source="typed")
    await add_message(sid, "assistant", "Hi there")

    session = await get_session(sid)
    assert session is not None
    assert len(session["messages"]) == 2
    assert session["messages"][0]["role"] == "user"
    assert session["messages"][0]["text"] == "Hello"
    assert session["messages"][0]["source"] == "typed"
    assert session["messages"][1]["role"] == "assistant"
    assert session["messages"][1]["text"] == "Hi there"


@pytest.mark.asyncio
async def test_list_sessions_newest_first():
    """list_sessions should return sessions newest-first by updated_at."""
    sid1 = await create_session("First")
    sid2 = await create_session("Second")

    # Add a message to first session to make it newer
    await add_message(sid1, "user", "update")

    sessions = await list_sessions()
    assert len(sessions) == 2
    # sid1 was updated more recently, so it should be first
    assert sessions[0]["id"] == sid1
    assert sessions[1]["id"] == sid2


@pytest.mark.asyncio
async def test_get_session_not_found():
    """get_session for nonexistent id returns None."""
    result = await get_session("nonexistent-id")
    assert result is None


@pytest.mark.asyncio
async def test_messages_in_chronological_order():
    """get_session returns messages ordered by created_at ASC."""
    sid = await create_session("Ordered")
    await add_message(sid, "user", "first")
    await add_message(sid, "assistant", "second")
    await add_message(sid, "user", "third")

    session = await get_session(sid)
    texts = [m["text"] for m in session["messages"]]
    assert texts == ["first", "second", "third"]
