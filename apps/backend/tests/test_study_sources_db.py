"""Tests for study-source persistence and local FTS retrieval."""

from __future__ import annotations

import asyncio
import os
import tempfile

import pytest

from app.db import (
    add_document_chunk,
    create_document,
    get_document,
    init_db,
    list_documents,
    search_document_chunks,
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


@pytest.mark.asyncio
async def test_create_and_get_document_round_trip():
    document_id = await create_document(
        title="Linear Algebra Notes",
        source_type="pasted_text",
        content="Vectors, dot products, and eigenvalues.",
    )

    document = await get_document(document_id)

    assert document is not None
    assert document["id"] == document_id
    assert document["title"] == "Linear Algebra Notes"
    assert document["source_type"] == "pasted_text"
    assert document["content"] == "Vectors, dot products, and eigenvalues."
    assert document["chunks"] == []


@pytest.mark.asyncio
async def test_document_chunks_are_returned_in_chunk_order():
    document_id = await create_document(
        title="Database Systems",
        source_type="markdown",
        content="Normalization\nTransactions\nIndexes",
    )

    await add_document_chunk(document_id, 0, "Normalization reduces redundant data.")
    await add_document_chunk(document_id, 1, "Transactions keep changes consistent.")
    await add_document_chunk(document_id, 2, "Indexes improve lookup speed.")

    document = await get_document(document_id)
    assert document is not None

    chunk_indexes = [chunk["chunk_index"] for chunk in document["chunks"]]
    chunk_texts = [chunk["text"] for chunk in document["chunks"]]

    assert chunk_indexes == [0, 1, 2]
    assert chunk_texts == [
        "Normalization reduces redundant data.",
        "Transactions keep changes consistent.",
        "Indexes improve lookup speed.",
    ]


@pytest.mark.asyncio
async def test_list_documents_returns_newest_updated_first():
    older_id = await create_document(
        title="Old Notes",
        source_type="text_file",
        content="Old content",
    )
    newer_id = await create_document(
        title="New Notes",
        source_type="text_file",
        content="New content",
    )

    # Touch the older document so it becomes the most recently updated one.
    await add_document_chunk(older_id, 0, "Fresh chunk added later.")

    documents = await list_documents()
    returned_ids = [document["id"] for document in documents]

    assert returned_ids == [older_id, newer_id]


@pytest.mark.asyncio
async def test_search_document_chunks_finds_relevant_chunk_and_title():
    algebra_id = await create_document(
        title="Algebra Review",
        source_type="pasted_text",
        content="Matrices, determinants, and vector spaces.",
    )
    history_id = await create_document(
        title="History Review",
        source_type="pasted_text",
        content="Industrial revolution and world wars.",
    )

    await add_document_chunk(algebra_id, 0, "A matrix can represent a linear transformation.")
    await add_document_chunk(algebra_id, 1, "Determinants help describe scaling behavior.")
    await add_document_chunk(history_id, 0, "The industrial revolution changed manufacturing.")

    matches = await search_document_chunks("matrix", limit=3)

    assert len(matches) == 1
    assert matches[0]["document_id"] == algebra_id
    assert matches[0]["document_title"] == "Algebra Review"
    assert matches[0]["chunk_index"] == 0
    assert "matrix" in matches[0]["text"].lower()


@pytest.mark.asyncio
async def test_search_document_chunks_returns_empty_for_blank_query():
    results = await search_document_chunks("   ")
    assert results == []