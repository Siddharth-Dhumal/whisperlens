"""Tests for study-source chunking and ingestion service."""

from __future__ import annotations

import asyncio
import os
import tempfile

import pytest

from app.db import get_document, init_db, set_db_path
from app.study_sources import chunk_text, ingest_document


@pytest.fixture(autouse=True)
def _use_temp_db():
    """Use a fresh temp DB for each test."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    set_db_path(path)
    asyncio.run(init_db())
    yield
    os.unlink(path)


def test_chunk_text_returns_single_chunk_for_short_text():
    text = "Vectors are quantities with magnitude and direction."
    chunks = chunk_text(text, max_chars=200)

    assert chunks == ["Vectors are quantities with magnitude and direction."]


def test_chunk_text_respects_max_chars_for_larger_input():
    text = """
    Vectors are quantities with magnitude and direction.
    They are useful in physics, graphics, and machine learning.

    Matrices can represent linear transformations.
    Determinants can describe scaling behavior.

    Eigenvalues and eigenvectors help us understand how transformations act.
    They are important in many areas of applied mathematics.
    """

    chunks = chunk_text(text, max_chars=120)

    assert len(chunks) >= 2
    assert all(chunk.strip() for chunk in chunks)
    assert all(len(chunk) <= 120 for chunk in chunks)

    combined = " ".join(chunk.replace("\n", " ") for chunk in chunks)

    assert "Vectors are quantities with magnitude and direction." in combined
    assert "Matrices can represent linear transformations." in combined
    assert "Eigenvalues and eigenvectors help us understand" in combined


def test_chunk_text_splits_single_oversized_block():
    text = (
        "A database transaction groups multiple operations into one logical unit. "
        "Transactions help keep data correct even if something fails halfway through. "
        "Atomicity, consistency, isolation, and durability are the key ACID properties. "
        "Indexes improve retrieval speed, but they also add maintenance cost on writes. "
        "Normalization reduces unnecessary duplication in relational schemas."
    )

    chunks = chunk_text(text, max_chars=120)

    assert len(chunks) >= 2
    assert all(len(chunk) <= 120 for chunk in chunks)
    assert "database transaction" in chunks[0].lower()


@pytest.mark.asyncio
async def test_ingest_document_creates_document_and_chunks_in_order():
    result = await ingest_document(
        title="Operating Systems Notes",
        source_type="pasted_text",
        content="""
        Processes are programs in execution.
        Threads allow finer-grained concurrency inside a process.

        Virtual memory gives each process an isolated address space.
        Paging moves memory in fixed-size blocks.

        Scheduling decides which runnable task gets CPU time next.
        """,
        max_chars=100,
    )

    assert "document_id" in result
    assert result["chunk_count"] >= 2

    document = await get_document(result["document_id"])
    assert document is not None
    assert document["title"] == "Operating Systems Notes"
    assert document["source_type"] == "pasted_text"
    assert len(document["chunks"]) == result["chunk_count"]

    chunk_indexes = [chunk["chunk_index"] for chunk in document["chunks"]]
    assert chunk_indexes == list(range(len(document["chunks"])))


@pytest.mark.asyncio
async def test_ingest_document_rejects_blank_title():
    with pytest.raises(ValueError, match="title must not be blank"):
        await ingest_document(
            title="   ",
            source_type="pasted_text",
            content="Useful study text.",
            max_chars=200,
        )


@pytest.mark.asyncio
async def test_ingest_document_rejects_blank_content():
    with pytest.raises(ValueError, match="content must not be blank"):
        await ingest_document(
            title="Test Notes",
            source_type="pasted_text",
            content="   \n\n   ",
            max_chars=200,
        )