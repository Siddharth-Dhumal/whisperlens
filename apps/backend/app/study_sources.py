"""Study-source ingestion and deterministic text chunking."""

from __future__ import annotations

import re

from app.db import add_document_chunk, create_document


def _normalize_text(text: str) -> str:
    """Normalize line endings and trim excess whitespace."""
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    normalized = re.sub(r"[ \t]+", " ", normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def _split_into_blocks(text: str) -> list[str]:
    """
    Split text into paragraph-like blocks.

    We use blank lines as the main separator so that natural sections
    in notes/markdown stay together when possible.
    """
    normalized = _normalize_text(text)
    if not normalized:
        return []

    raw_blocks = re.split(r"\n\s*\n", normalized)

    cleaned_blocks = []
    for raw_block in raw_blocks:
        block = re.sub(r"\s+", " ", raw_block).strip()
        if block:
            cleaned_blocks.append(block)

    return cleaned_blocks


def _hard_split(text: str, max_chars: int) -> list[str]:
    """
    Split oversized text by character length.

    We try to split on the last space before max_chars.
    If that is not possible, we split exactly at max_chars.
    """
    remaining = text.strip()
    pieces: list[str] = []

    while len(remaining) > max_chars:
        split_at = remaining.rfind(" ", 0, max_chars + 1)
        if split_at <= 0:
            split_at = max_chars

        piece = remaining[:split_at].strip()
        if piece:
            pieces.append(piece)

        remaining = remaining[split_at:].strip()

    if remaining:
        pieces.append(remaining)

    return pieces


def _split_large_block(block: str, max_chars: int) -> list[str]:
    """
    Split a large block into smaller pieces.

    Preferred strategy:
    1. split on sentence boundaries
    2. if one sentence is still too large, hard-split it
    """
    sentences = re.split(r"(?<=[.!?])\s+", block.strip())

    if len(sentences) == 1:
        return _hard_split(block, max_chars)

    pieces: list[str] = []
    current = ""

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue

        candidate = sentence if not current else f"{current} {sentence}"

        if len(candidate) <= max_chars:
            current = candidate
            continue

        if current:
            pieces.append(current)
            current = ""

        if len(sentence) <= max_chars:
            current = sentence
        else:
            pieces.extend(_hard_split(sentence, max_chars))

    if current:
        pieces.append(current)

    return pieces


def chunk_text(text: str, max_chars: int = 800) -> list[str]:
    """
    Chunk text into deterministic, retrieval-friendly pieces.

    Design goals:
    - stable and easy to reason about
    - paragraph-aware first
    - sentence-aware fallback
    - hard split only when needed
    """
    if max_chars < 100:
        raise ValueError("max_chars must be at least 100")

    blocks = _split_into_blocks(text)
    if not blocks:
        return []

    chunks: list[str] = []
    current = ""

    for block in blocks:
        if len(block) <= max_chars:
            block_parts = [block]
        else:
            block_parts = _split_large_block(block, max_chars)

        for part in block_parts:
            candidate = part if not current else f"{current}\n\n{part}"

            if len(candidate) <= max_chars:
                current = candidate
            else:
                if current:
                    chunks.append(current)
                current = part

    if current:
        chunks.append(current)

    return chunks


async def ingest_document(
    title: str,
    source_type: str,
    content: str,
    max_chars: int = 800,
) -> dict:
    """
    Create a study-source document and persist its chunks.

    Returns a small summary payload that the future API layer can reuse.
    """
    clean_title = title.strip()
    clean_source_type = source_type.strip()
    normalized_content = _normalize_text(content)

    if not clean_title:
        raise ValueError("title must not be blank")

    if not clean_source_type:
        raise ValueError("source_type must not be blank")

    if not normalized_content:
        raise ValueError("content must not be blank")

    chunks = chunk_text(normalized_content, max_chars=max_chars)
    if not chunks:
        raise ValueError("content must produce at least one chunk")

    document_id = await create_document(
        title=clean_title,
        source_type=clean_source_type,
        content=normalized_content,
    )

    for chunk_index, chunk_value in enumerate(chunks):
        await add_document_chunk(
            document_id=document_id,
            chunk_index=chunk_index,
            text=chunk_value,
        )

    return {
        "document_id": document_id,
        "chunk_count": len(chunks),
    }