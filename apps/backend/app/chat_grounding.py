"""Local retrieval + prompt building for grounded typed chat."""

from __future__ import annotations

from app.db import search_document_chunks

DEFAULT_RETRIEVAL_LIMIT = 3


def build_grounded_user_prompt(user_text: str, matches: list[dict]) -> str:
    """
    Build the exact text that we will send to the local model.

    Rules:
    - Always build a turn-scoped prompt for typed chat.
    - If matches exist, include them as this turn's study-source context.
    - If no matches exist, explicitly state that this turn has no matching
      study-source context and instruct the model not to rely on earlier
      study-source context from prior turns.
    """
    clean_user_text = user_text.strip()

    if not clean_user_text:
        return ""

    if not matches:
        return (
            "You are WhisperLens, a local-first study assistant.\n"
            "No matching study-source context was found for this turn.\n"
            "Do not rely on study-source context from earlier turns when answering this question.\n"
            "Answer normally and be clear about the absence of relevant study-note context.\n\n"
            "User question:\n"
            f"{clean_user_text}"
        )

    context_sections: list[str] = []

    for index, match in enumerate(matches, start=1):
        document_title = str(match["document_title"]).strip()
        chunk_index = int(match["chunk_index"])
        chunk_text = str(match["text"]).strip()

        context_sections.append(
            f"[Source {index} | {document_title} | chunk {chunk_index}]\n{chunk_text}"
        )

    context_block = "\n\n".join(context_sections)

    return (
        "You are WhisperLens, a local-first study assistant.\n"
        "Use the study-source context below when it is relevant to the user's question.\n"
        "If the context is incomplete, say what the context supports and then answer carefully.\n"
        "Do not claim the study sources said anything that is not in the provided context.\n\n"
        "Study-source context:\n"
        f"{context_block}\n\n"
        "User question:\n"
        f"{clean_user_text}"
    )


async def build_grounded_prompt_for_query(
    user_text: str,
    limit: int = DEFAULT_RETRIEVAL_LIMIT,
) -> dict:
    """
    Search local study sources and return both:
    - the prompt to send to the model
    - the matched chunks used to build that prompt
    """
    clean_user_text = user_text.strip()

    if not clean_user_text:
        return {
            "prompt": "",
            "matches": [],
        }

    matches = await search_document_chunks(clean_user_text, limit=limit)
    prompt = build_grounded_user_prompt(clean_user_text, matches)

    return {
        "prompt": prompt,
        "matches": matches,
    }