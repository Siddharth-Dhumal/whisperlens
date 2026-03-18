"""Tests for local typed-chat grounding."""

from __future__ import annotations

import asyncio
import os
import tempfile

import pytest

from app.chat_grounding import (
    build_grounded_prompt_for_query,
    build_grounded_user_prompt,
)
from app.db import (
    add_document_chunk,
    create_document,
    init_db,
    set_db_path,
)


@pytest.fixture(autouse=True)
def _use_temp_db():
    """Use a fresh temp DB for each test."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    set_db_path(path)
    asyncio.run(init_db())
    yield
    os.unlink(path)


def test_build_grounded_user_prompt_returns_original_text_when_no_matches():
    prompt = build_grounded_user_prompt(
        "Explain matrix multiplication",
        [],
    )

    assert prompt == "Explain matrix multiplication"


def test_build_grounded_user_prompt_includes_context_when_matches_exist():
    matches = [
        {
            "document_id": "doc-1",
            "document_title": "Linear Algebra Notes",
            "chunk_index": 0,
            "text": "Matrix multiplication combines rows and columns.",
        },
        {
            "document_id": "doc-1",
            "document_title": "Linear Algebra Notes",
            "chunk_index": 1,
            "text": "The inner dimensions must match.",
        },
    ]

    prompt = build_grounded_user_prompt(
        "Explain matrix multiplication",
        matches,
    )

    assert "You are WhisperLens, a local-first study assistant." in prompt
    assert "Study-source context:" in prompt
    assert "[Source 1 | Linear Algebra Notes | chunk 0]" in prompt
    assert "[Source 2 | Linear Algebra Notes | chunk 1]" in prompt
    assert "Matrix multiplication combines rows and columns." in prompt
    assert "The inner dimensions must match." in prompt
    assert "User question:" in prompt
    assert "Explain matrix multiplication" in prompt


@pytest.mark.asyncio
async def test_build_grounded_prompt_for_query_returns_original_text_when_no_match():
    result = await build_grounded_prompt_for_query("What is a compiler?")

    assert result["matches"] == []
    assert result["prompt"] == "What is a compiler?"


@pytest.mark.asyncio
async def test_build_grounded_prompt_for_query_uses_local_fts_matches():
    document_id = await create_document(
        title="Operating Systems Notes",
        source_type="pasted_text",
        content="Processes, threads, and scheduling.",
    )

    await add_document_chunk(
        document_id=document_id,
        chunk_index=0,
        text="A process is a program in execution.",
    )
    await add_document_chunk(
        document_id=document_id,
        chunk_index=1,
        text="Threads allow concurrency within a process.",
    )

    result = await build_grounded_prompt_for_query("What is a process?")

    assert len(result["matches"]) >= 1
    assert result["matches"][0]["document_title"] == "Operating Systems Notes"
    assert "Study-source context:" in result["prompt"]
    assert "Operating Systems Notes" in result["prompt"]
    assert "A process is a program in execution." in result["prompt"]
    assert "What is a process?" in result["prompt"]