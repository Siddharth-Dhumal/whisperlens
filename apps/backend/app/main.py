import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import httpx

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.db import add_message, create_session, get_session, init_db, list_sessions, get_document, list_documents, search_document_chunks
from app.ollama_live import OllamaError, OllamaSession
from app.settings import get_settings
from app.stt import SpeechToTextService, SttError
from app.vision import VisionError, analyze_image
from app.study_sources import ingest_document
from app.chat_grounding import build_grounded_prompt_for_query

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(application: FastAPI):
    await init_db()
    yield


app = FastAPI(title="WhisperLens Backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok"}

class StudySourceCreateRequest(BaseModel):
    title: str
    source_type: str = "pasted_text"
    content: str
    max_chars: int = 800

def _get_upload_title(filename: str | None, title: str | None) -> str:
    """Prefer explicit title, otherwise derive one from the uploaded filename."""
    clean_title = (title or "").strip()
    if clean_title:
        return clean_title

    clean_filename = (filename or "").strip()
    if not clean_filename:
        raise ValueError("title is required when filename is missing")

    derived_title = Path(clean_filename).stem.strip()
    if not derived_title:
        raise ValueError("could not derive title from uploaded filename")

    return derived_title


def _validate_upload_filename(filename: str | None) -> str:
    """Allow only local text-based study files for now."""
    clean_filename = (filename or "").strip()
    if not clean_filename:
        raise ValueError("uploaded file must have a filename")

    suffix = Path(clean_filename).suffix.lower()
    if suffix not in {".txt", ".md"}:
        raise ValueError("only .txt and .md files are supported right now")

    return clean_filename

# ------------------------------------------------------------------
# Study Vault REST API
# ------------------------------------------------------------------


@app.get("/api/sessions")
async def api_list_sessions() -> list[dict]:
    return await list_sessions()


@app.get("/api/sessions/{session_id}")
async def api_get_session(session_id: str) -> dict:
    session = await get_session(session_id)
    if session is None:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={"detail": "Session not found"})
    return session


# ------------------------------------------------------------------
# Vision API
# ------------------------------------------------------------------

class VisionRequest(BaseModel):
    image: str  # base64-encoded image data
    question: str = "Describe what you see."
    session_id: str | None = None  # reuse existing session if provided


@app.post("/api/vision")
async def api_vision(req: VisionRequest) -> dict:
    try:
        answer = await analyze_image(req.image, req.question)
    except VisionError as exc:
        logger.error("[vision] VisionError: %s", exc)
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=502, content={"detail": str(exc)})

    # Persist the vision turn
    sid = req.session_id
    user_text = req.question if req.question != "Describe what you see." else "📷 Snapshot"
    if sid is None:
        title = user_text[:60] + ("..." if len(user_text) > 60 else "")
        sid = await create_session(title)
    await add_message(sid, "user", user_text, source="vision")
    await add_message(sid, "assistant", answer)

    return {"answer": answer, "session_id": sid}


@app.post("/api/vision/warm")
async def api_vision_warm() -> dict:
    """Pre-warm the vision model with a tiny image so the first real request is faster."""
    settings = get_settings()
    # 1x1 red JPEG — smallest valid image to trigger the vision pipeline
    TINY_IMAGE_B64 = (
        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQE"
        "BQoHBwYIDAoMCwsKCwsKDA0QDBEKCQ4RERMTDAwQHBASFBQUFBQUFBQUFBT/"
        "yQALCAABAAEBAREA/8wABgABAQEAAAAAAAAAAAAAAAAJAAr/2gAIAQEAAD8AVN//"
        "2Q=="
    )
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0, read=120.0, write=10.0, pool=5.0),
        ) as client:
            await client.post(
                f"{settings.ollama_base_url}/api/chat",
                json={
                    "model": settings.ollama_vision_model,
                    "messages": [{
                        "role": "user",
                        "content": "Describe this image briefly.",
                        "images": [TINY_IMAGE_B64],
                    }],
                    "stream": False,
                    "keep_alive": "10m",
                },
            )
    except Exception as exc:
        logger.warning("[vision/warm] warm-up failed (non-fatal): %s", exc)
        return {"status": "failed", "reason": str(exc)}

    logger.info("[vision/warm] vision model pre-warmed")
    return {"status": "ok"}


@app.post("/api/study-sources")
async def create_study_source(payload: StudySourceCreateRequest) -> dict:
    """Create a new study source, chunk it, and persist it locally."""
    try:
        return await ingest_document(
            title=payload.title,
            source_type=payload.source_type,
            content=payload.content,
            max_chars=payload.max_chars,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@app.post("/api/study-sources/upload")
async def upload_study_source(
    file: UploadFile = File(...),
    title: str | None = Form(None),
    max_chars: int = Form(800),
) -> dict:
    """Upload a local text or markdown file and ingest it as a study source."""
    try:
        filename = _validate_upload_filename(file.filename)
        resolved_title = _get_upload_title(filename, title)

        raw_bytes = await file.read()
        if not raw_bytes:
            raise ValueError("uploaded file is empty")

        try:
            content = raw_bytes.decode("utf-8").strip()
        except UnicodeDecodeError as exc:
            raise ValueError("uploaded file must be valid UTF-8 text") from exc

        if not content:
            raise ValueError("uploaded file is empty")

        return await ingest_document(
            title=resolved_title,
            source_type="local_file",
            content=content,
            max_chars=max_chars,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        await file.close()


@app.get("/api/study-sources")
async def api_list_study_sources() -> list[dict]:
    """Return all stored study sources."""
    return await list_documents()


@app.get("/api/study-sources/search")
async def api_search_study_sources(q: str, limit: int = 5) -> list[dict]:
    """Search study-source chunks using local SQLite FTS."""
    if limit < 1:
        raise HTTPException(status_code=400, detail="limit must be at least 1")

    capped_limit = min(limit, 20)
    return await search_document_chunks(query=q, limit=capped_limit)


@app.get("/api/study-sources/{document_id}")
async def api_get_study_source(document_id: str) -> dict:
    """Return one study source with all of its chunks."""
    document = await get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="study source not found")
    return document


# ------------------------------------------------------------------
# WebSocket
# ------------------------------------------------------------------
def _build_source_info_from_matches(matches: list[dict]) -> dict:
    """Build lightweight source attribution metadata from grounding matches."""
    source_titles: list[str] = []

    for match in matches:
        title = str(match["document_title"]).strip()
        if title and title not in source_titles:
            source_titles.append(title)

    return {
        "matched": len(matches) > 0,
        "match_count": len(matches),
        "source_titles": source_titles,
    }

async def _handle_ollama_turn(
    websocket: WebSocket,
    session: OllamaSession,
    user_text: str,
    source_info: dict | None = None,
) -> str:
    await session.send_text(user_text)

    full_response = ""
    async for chunk in session.receive_text():
        full_response += chunk
        await websocket.send_json(
            {
                "type": "transcript",
                "text": chunk,
            }
        )

    turn_complete_payload = {
        "type": "turn_complete",
        "text": full_response,
    }

    if source_info is not None:
        turn_complete_payload["source_info"] = source_info

    await websocket.send_json(turn_complete_payload)
    return full_response


@app.websocket("/ws/live")
async def live_websocket(websocket: WebSocket) -> None:
    await websocket.accept()

    settings = get_settings()
    ollama = OllamaSession()
    stt = SpeechToTextService(model_name=settings.stt_model)

    # Audio buffering state
    audio_buffer: bytearray = bytearray()
    audio_recording = False

    # Persistence state — session created lazily on first turn
    db_session_id: str | None = None

    try:
        await ollama.connect()
        logger.info("[ws/live] Ollama session connected")

        while True:
            message = await websocket.receive()
            message_type = message["type"]

            if message_type == "websocket.disconnect":
                logger.info("[ws/live] client disconnected")
                break

            if message_type == "websocket.receive":
                text = message.get("text")
                raw_bytes = message.get("bytes")

                # --- Binary frame: audio chunk ---
                if raw_bytes is not None:
                    if audio_recording:
                        audio_buffer.extend(raw_bytes)
                    continue

                # --- Text frame: JSON control or plain text ---
                if text is not None:
                    # Try to parse as JSON control message
                    control = None
                    try:
                        parsed = json.loads(text)
                        if isinstance(parsed, dict) and "type" in parsed:
                            control = parsed
                    except (json.JSONDecodeError, TypeError):
                        pass

                    if control is not None:
                        ctrl_type = control["type"]

                        if ctrl_type == "audio_start":
                            audio_buffer.clear()
                            audio_recording = True
                            logger.info("[ws/live] audio recording started")
                            continue

                        if ctrl_type == "session_bind":
                            bound_id = control.get("session_id", "")
                            if bound_id:
                                db_session_id = bound_id
                                logger.info("[ws/live] session bound to %s", bound_id)
                            continue

                        if ctrl_type == "audio_end":
                            audio_recording = False
                            logger.info(
                                "[ws/live] audio recording ended, %d bytes",
                                len(audio_buffer),
                            )

                            if not audio_buffer:
                                await websocket.send_json(
                                    {"type": "error", "message": "No audio data received"}
                                )
                                continue

                            # Transcribe audio in a thread to avoid blocking the event loop
                            try:
                                transcript = await asyncio.to_thread(stt.transcribe, bytes(audio_buffer))
                            except SttError as exc:
                                logger.error("[ws/live] STT failed: %s", exc)
                                await websocket.send_json(
                                    {"type": "error", "message": f"Speech recognition failed: {exc}"}
                                )
                                audio_buffer.clear()
                                continue

                            audio_buffer.clear()

                            # Send transcript back to client
                            await websocket.send_json(
                                {"type": "stt_result", "text": transcript}
                            )

                            # Feed into Ollama chat
                            grounding = await build_grounded_prompt_for_query(transcript)
                            grounded_prompt = grounding["prompt"]
                            matches = grounding["matches"]
                            source_info = _build_source_info_from_matches(matches)

                            # Feed grounded voice transcript into Ollama chat
                            response = await _handle_ollama_turn(
                                websocket,
                                ollama,
                                grounded_prompt,
                                source_info=source_info,
                            )

                            # Persist the turn
                            if db_session_id is None:
                                title = transcript[:60] + ("..." if len(transcript) > 60 else "")
                                db_session_id = await create_session(title)
                                await websocket.send_json({"type": "session_created", "session_id": db_session_id})
                            await add_message(db_session_id, "user", transcript, source="voice")
                            await add_message(db_session_id, "assistant", response)
                            await websocket.send_json({"type": "turn_saved"})
                            continue

                    # Plain text message (typed chat)
                    logger.info("[ws/live] received text: %s", text[:80])

                    grounding = await build_grounded_prompt_for_query(text)
                    grounded_prompt = grounding["prompt"]
                    matches = grounding["matches"]
                    source_info = _build_source_info_from_matches(matches)

                    response = await _handle_ollama_turn(
                        websocket,
                        ollama,
                        grounded_prompt,
                        source_info=source_info,
                    )

                    # Persist the raw typed turn, not the grounded prompt
                    if db_session_id is None:
                        title = text[:60] + ("..." if len(text) > 60 else "")
                        db_session_id = await create_session(title)
                        await websocket.send_json({"type": "session_created", "session_id": db_session_id})
                    await add_message(db_session_id, "user", text, source="typed")
                    await add_message(db_session_id, "assistant", response)
                    await websocket.send_json({"type": "turn_saved"})

    except WebSocketDisconnect:
        logger.info("[ws/live] client disconnected (exception)")
    except OllamaError as exc:
        logger.error("[ws/live] Ollama error: %s", exc)
        try:
            await websocket.send_json(
                {"type": "error", "message": str(exc)}
            )
        except Exception:
            pass
    except Exception:
        logger.exception("[ws/live] unexpected error")
        try:
            await websocket.send_json(
                {"type": "error", "message": "Internal server error"}
            )
        except Exception:
            pass
    finally:
        await ollama.close()