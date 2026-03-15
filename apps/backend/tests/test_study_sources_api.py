"""Tests for study-source API endpoints."""

from __future__ import annotations

import asyncio
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from app.db import init_db, set_db_path
from app.main import app


@pytest.fixture(autouse=True)
def _use_temp_db():
    """Use a fresh temp DB for each test."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    set_db_path(path)
    asyncio.run(init_db())
    yield
    os.unlink(path)


def test_create_study_source_success():
    client = TestClient(app)

    response = client.post(
        "/api/study-sources",
        json={
            "title": "Linear Algebra Notes",
            "source_type": "pasted_text",
            "content": """
            Vectors have magnitude and direction.

            Matrices can represent linear transformations.

            Eigenvalues help describe important transformation behavior.
            """,
            "max_chars": 120,
        },
    )

    assert response.status_code == 200

    body = response.json()
    assert "document_id" in body
    assert body["chunk_count"] >= 2


def test_create_study_source_rejects_blank_content():
    client = TestClient(app)

    response = client.post(
        "/api/study-sources",
        json={
            "title": "Bad Notes",
            "source_type": "pasted_text",
            "content": "   \n\n   ",
            "max_chars": 120,
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "content must not be blank"


def test_list_study_sources_returns_created_documents():
    client = TestClient(app)

    first_response = client.post(
        "/api/study-sources",
        json={
            "title": "OS Notes",
            "source_type": "pasted_text",
            "content": "Processes, threads, and scheduling.",
            "max_chars": 120,
        },
    )
    second_response = client.post(
        "/api/study-sources",
        json={
            "title": "DB Notes",
            "source_type": "pasted_text",
            "content": "Normalization, transactions, and indexes.",
            "max_chars": 120,
        },
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200

    response = client.get("/api/study-sources")
    assert response.status_code == 200

    body = response.json()
    titles = [document["title"] for document in body]

    assert "OS Notes" in titles
    assert "DB Notes" in titles


def test_get_study_source_returns_document_with_chunks():
    client = TestClient(app)

    create_response = client.post(
        "/api/study-sources",
        json={
            "title": "Networks Notes",
            "source_type": "pasted_text",
            "content": """
            Routers forward packets between networks.

            Switches help move frames inside a LAN.
            """,
            "max_chars": 100,
        },
    )

    assert create_response.status_code == 200
    document_id = create_response.json()["document_id"]

    response = client.get(f"/api/study-sources/{document_id}")
    assert response.status_code == 200

    body = response.json()
    assert body["id"] == document_id
    assert body["title"] == "Networks Notes"
    assert body["source_type"] == "pasted_text"
    assert len(body["chunks"]) >= 1


def test_get_study_source_missing_returns_404():
    client = TestClient(app)

    response = client.get("/api/study-sources/does-not-exist")
    assert response.status_code == 404
    assert response.json()["detail"] == "study source not found"


def test_search_study_sources_returns_relevant_chunks():
    client = TestClient(app)

    response_1 = client.post(
        "/api/study-sources",
        json={
            "title": "Algebra Review",
            "source_type": "pasted_text",
            "content": """
            A matrix can represent a linear transformation.

            Determinants help describe scaling behavior.
            """,
            "max_chars": 120,
        },
    )
    response_2 = client.post(
        "/api/study-sources",
        json={
            "title": "History Review",
            "source_type": "pasted_text",
            "content": """
            The industrial revolution changed manufacturing systems.
            """,
            "max_chars": 120,
        },
    )

    assert response_1.status_code == 200
    assert response_2.status_code == 200

    search_response = client.get("/api/study-sources/search", params={"q": "matrix", "limit": 3})
    assert search_response.status_code == 200

    body = search_response.json()
    assert len(body) == 1
    assert body[0]["document_title"] == "Algebra Review"
    assert "matrix" in body[0]["text"].lower()


def test_search_study_sources_rejects_invalid_limit():
    client = TestClient(app)

    response = client.get("/api/study-sources/search", params={"q": "matrix", "limit": 0})
    assert response.status_code == 400
    assert response.json()["detail"] == "limit must be at least 1"