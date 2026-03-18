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


def test_build_grounded_user_prompt_builds_explicit_no_context_prompt_when_no_matches():
    prompt = build_grounded_user_prompt(
        "Explain matrix multiplication",
        [],
    )

    assert "No matching study-source context was found for this turn." in prompt
    assert "Do not rely on study-source context from earlier turns" in prompt
    assert "User question:" in prompt
    assert "Explain matrix multiplication" in prompt


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
async def test_build_grounded_prompt_for_query_builds_explicit_no_context_prompt_when_no_match():
    result = await build_grounded_prompt_for_query("What is a compiler?")

    assert result["matches"] == []
    assert "No matching study-source context was found for this turn." in result["prompt"]
    assert "Do not rely on study-source context from earlier turns" in result["prompt"]
    assert "User question:" in result["prompt"]
    assert "What is a compiler?" in result["prompt"]


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

@pytest.mark.asyncio
async def test_build_grounded_prompt_for_query_does_not_reuse_previous_turn_context():
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

    first_result = await build_grounded_prompt_for_query("What is a process?")
    second_result = await build_grounded_prompt_for_query("What is photosynthesis?")

    assert len(first_result["matches"]) >= 1
    assert "Operating Systems Notes" in first_result["prompt"]
    assert "A process is a program in execution." in first_result["prompt"]

    assert second_result["matches"] == []
    assert "No matching study-source context was found for this turn." in second_result["prompt"]
    assert "Do not rely on study-source context from earlier turns" in second_result["prompt"]
    assert "What is photosynthesis?" in second_result["prompt"]

    assert "Operating Systems Notes" not in second_result["prompt"]
    assert "A process is a program in execution." not in second_result["prompt"]