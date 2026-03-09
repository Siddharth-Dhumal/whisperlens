"""SQLite-backed local persistence for sessions and messages."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

import aiosqlite

from app.settings import get_settings

logger = logging.getLogger(__name__)

_DB_PATH: str | None = None


def _get_db_path() -> str:
    global _DB_PATH
    if _DB_PATH is None:
        _DB_PATH = get_settings().db_path
    return _DB_PATH


def set_db_path(path: str) -> None:
    """Override the DB path (used in tests)."""
    global _DB_PATH
    _DB_PATH = path


async def init_db() -> None:
    """Create tables if they don't exist."""
    async with aiosqlite.connect(_get_db_path()) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id         TEXT PRIMARY KEY,
                title      TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id         TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(id),
                role       TEXT NOT NULL,
                text       TEXT NOT NULL,
                source     TEXT NOT NULL DEFAULT 'typed',
                created_at TEXT NOT NULL
            )
        """)
        await db.commit()
    logger.info("Database initialized at %s", _get_db_path())


async def create_session(title: str) -> str:
    """Create a new session and return its id."""
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(_get_db_path()) as db:
        await db.execute(
            "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (session_id, title, now, now),
        )
        await db.commit()
    return session_id


async def add_message(
    session_id: str,
    role: str,
    text: str,
    source: str = "typed",
) -> str:
    """Add a message to a session and return its id."""
    message_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(_get_db_path()) as db:
        await db.execute(
            "INSERT INTO messages (id, session_id, role, text, source, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (message_id, session_id, role, text, source, now),
        )
        await db.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            (now, session_id),
        )
        await db.commit()
    return message_id


async def list_sessions() -> list[dict]:
    """Return all sessions, newest first by updated_at."""
    async with aiosqlite.connect(_get_db_path()) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC"
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def get_session(session_id: str) -> dict | None:
    """Return a session with its messages in chronological order, or None."""
    async with aiosqlite.connect(_get_db_path()) as db:
        db.row_factory = aiosqlite.Row

        cursor = await db.execute(
            "SELECT id, title, created_at, updated_at FROM sessions WHERE id = ?",
            (session_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            return None

        session = dict(row)

        cursor = await db.execute(
            "SELECT id, role, text, source, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,),
        )
        messages = await cursor.fetchall()
        session["messages"] = [dict(m) for m in messages]

        return session
