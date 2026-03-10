"""Ollama-based local vision analysis (single-image, one-shot)."""

from __future__ import annotations

import logging

import httpx

from app.settings import get_settings

logger = logging.getLogger(__name__)


class VisionError(Exception):
    """Raised when the vision analysis fails."""


async def analyze_image(
    image_b64: str,
    question: str = "Describe what you see.",
) -> str:
    """Send a single image + question to a vision-capable Ollama model.

    Args:
        image_b64: Base64-encoded image data (no data-URI prefix).
        question: The user's question about the image.

    Returns:
        The model's text answer.
    """
    settings = get_settings()
    url = f"{settings.ollama_base_url}/api/chat"

    payload = {
        "model": settings.ollama_vision_model,
        "messages": [
            {
                "role": "user",
                "content": question,
                "images": [image_b64],
            }
        ],
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0, read=120.0, write=10.0, pool=5.0),
        ) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
    except httpx.ConnectError as exc:
        raise VisionError(
            f"Cannot reach Ollama at {settings.ollama_base_url}. Is Ollama running?"
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise VisionError(
            f"Ollama returned HTTP {exc.response.status_code}: {exc.response.text}"
        ) from exc

    data = resp.json()
    answer = data.get("message", {}).get("content", "").strip()
    if not answer:
        raise VisionError("Vision model returned an empty response.")

    logger.info("[vision] answer length=%d chars", len(answer))
    return answer
