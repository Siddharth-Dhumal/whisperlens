"""SQLite-backed local persistence for sessions, messages, and study sources."""

from __future__ import annotations

import logging
import uuid
import re
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


def _now_iso() -> str:
    """Return the current UTC time in ISO-8601 format."""
    return datetime.now(timezone.utc).isoformat()

_FTS_STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "did",
    "do",
    "does",
    "explain",
    "for",
    "from",
    "how",
    "i",
    "in",
    "is",
    "it",
    "me",
    "of",
    "on",
    "or",
    "tell",
    "the",
    "to",
    "was",
    "were",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "with",
}


def _build_fts5_query(query: str) -> str:
    """
    Convert natural-language user input into a safe FTS5 query.

    Examples:
    - "What is a process?" -> '"process"'
    - "Explain matrix multiplication" -> '"matrix" OR "multiplication"'
    """
    raw_tokens = re.findall(r"[A-Za-z0-9_]+", query.lower())

    filtered_tokens: list[str] = []
    seen_tokens: set[str] = set()

    for token in raw_tokens:
        if len(token) < 2:
            continue
        if token in _FTS_STOP_WORDS:
            continue
        if token in seen_tokens:
            continue

        filtered_tokens.append(token)
        seen_tokens.add(token)

    if not filtered_tokens:
        return ""

    return " OR ".join(f'"{token}"' for token in filtered_tokens)


async def _enable_foreign_keys(db: aiosqlite.Connection) -> None:
    """Enable SQLite foreign key enforcement for the current connection."""
    await db.execute("PRAGMA foreign_keys = ON")


async def init_db() -> None:
    """Create tables if they don't exist."""
    async with aiosqlite.connect(_get_db_path()) as db:
        await _enable_foreign_keys(db)

        # -----------------------------
        # Existing session/message data
        # -----------------------------
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

        # -----------------------------
        # New study source data
        # -----------------------------
        await db.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                source_type TEXT NOT NULL,
                content     TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS document_chunks (
                rowid       INTEGER PRIMARY KEY AUTOINCREMENT,
                id          TEXT NOT NULL UNIQUE,
                document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                chunk_index INTEGER NOT NULL,
                text        TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                UNIQUE(document_id, chunk_index)
            )
        """)

        # External-content FTS table:
        # - real text lives in document_chunks
        # - this table is only the search index
        await db.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts
            USING fts5(
                text,
                content='document_chunks',
                content_rowid='rowid',
                tokenize='unicode61'
            )
        """)

        # Keep FTS index synchronized with the real chunk table
        await db.executescript("""
            CREATE TRIGGER IF NOT EXISTS document_chunks_ai
            AFTER INSERT ON document_chunks
            BEGIN
                INSERT INTO document_chunks_fts(rowid, text)
                VALUES (new.rowid, new.text);
            END;

            CREATE TRIGGER IF NOT EXISTS document_chunks_ad
            AFTER DELETE ON document_chunks
            BEGIN
                INSERT INTO document_chunks_fts(document_chunks_fts, rowid, text)
                VALUES ('delete', old.rowid, old.text);
            END;

            CREATE TRIGGER IF NOT EXISTS document_chunks_au
            AFTER UPDATE ON document_chunks
            BEGIN
                INSERT INTO document_chunks_fts(document_chunks_fts, rowid, text)
                VALUES ('delete', old.rowid, old.text);

                INSERT INTO document_chunks_fts(rowid, text)
                VALUES (new.rowid, new.text);
            END;
        """)

        await db.commit()

    logger.info("Database initialized at %s", _get_db_path())


async def create_session(title: str) -> str:
    """Create a new session and return its id."""
    session_id = str(uuid.uuid4())
    now = _now_iso()

    async with aiosqlite.connect(_get_db_path()) as db:
        await _enable_foreign_keys(db)
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
    now = _now_iso()

    async with aiosqlite.connect(_get_db_path()) as db:
        await _enable_foreign_keys(db)
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
        await _enable_foreign_keys(db)
        db.row_factory = aiosqlite.Row

        cursor = await db.execute(
            "SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC"
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def get_session(session_id: str) -> dict | None:
    """Return a session with its messages in chronological order, or None."""
    async with aiosqlite.connect(_get_db_path()) as db:
        await _enable_foreign_keys(db)
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


async def create_document(
    title: str,
    source_type: str,
    content: str,
) -> str:
    """Create a study source document and return its id."""
    document_id = str(uuid.uuid4())
    now = _now_iso()

    async with aiosqlite.connect(_get_db_path()) as db:
        await _enable_foreign_keys(db)
        await db.execute(
            """
            INSERT INTO documents (id, title, source_type, content, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (document_id, title, source_type, content, now, now),
        )
        await db.commit()

    return document_id


async def add_document_chunk(
    document_id: str,
    chunk_index: int,
    text: str,
) -> str:
    """Insert one chunk for a study source document and return its id."""
    chunk_id = str(uuid.uuid4())
    now = _now_iso()

    async with aiosqlite.connect(_get_db_path()) as db:
        await _enable_foreign_keys(db)
        await db.execute(
            """
            INSERT INTO document_chunks (id, document_id, chunk_index, text, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (chunk_id, document_id, chunk_index, text, now),
        )
        await db.execute(
            "UPDATE documents SET updated_at = ? WHERE id = ?",
            (now, document_id),
        )
        await db.commit()

    return chunk_id


async def list_documents() -> list[dict]:
    """Return all study source documents, newest first by updated_at."""
    async with aiosqlite.connect(_get_db_path()) as db:
        await _enable_foreign_keys(db)
        db.row_factory = aiosqlite.Row

        cursor = await db.execute(
            """
            SELECT id, title, source_type, created_at, updated_at
            FROM documents
            ORDER BY updated_at DESC
            """
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def get_document(document_id: str) -> dict | None:
    """Return a study source document with its chunks, or None."""
    async with aiosqlite.connect(_get_db_path()) as db:
        await _enable_foreign_keys(db)
        db.row_factory = aiosqlite.Row

        cursor = await db.execute(
            """
            SELECT id, title, source_type, content, created_at, updated_at
            FROM documents
            WHERE id = ?
            """,
            (document_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            return None

        document = dict(row)

        cursor = await db.execute(
            """
            SELECT id, document_id, chunk_index, text, created_at
            FROM document_chunks
            WHERE document_id = ?
            ORDER BY chunk_index ASC
            """,
            (document_id,),
        )
        chunks = await cursor.fetchall()
        document["chunks"] = [dict(chunk) for chunk in chunks]

        return document


async def search_document_chunks(query: str, limit: int = 5) -> list[dict]:
    """Search study source chunks using SQLite FTS5."""
    stripped_query = query.strip()
    if not stripped_query:
        return []

    fts_query = _build_fts5_query(stripped_query)
    if not fts_query:
        return []

    async with aiosqlite.connect(_get_db_path()) as db:
        await _enable_foreign_keys(db)
        db.row_factory = aiosqlite.Row

        cursor = await db.execute(
            """
            SELECT
                dc.id,
                dc.document_id,
                d.title AS document_title,
                dc.chunk_index,
                dc.text,
                snippet(document_chunks_fts, 0, '[', ']', ' ... ', 12) AS snippet,
                bm25(document_chunks_fts) AS score
            FROM document_chunks_fts
            JOIN document_chunks AS dc
              ON document_chunks_fts.rowid = dc.rowid
            JOIN documents AS d
              ON d.id = dc.document_id
            WHERE document_chunks_fts MATCH ?
            ORDER BY bm25(document_chunks_fts), dc.chunk_index ASC
            LIMIT ?
            """,
            (fts_query, limit),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]