import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.db import add_message, create_session, get_session, init_db, list_sessions
from app.ollama_live import OllamaError, OllamaSession
from app.settings import get_settings
from app.stt import SpeechToTextService, SttError

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
# WebSocket
# ------------------------------------------------------------------


async def _handle_ollama_turn(
    websocket: WebSocket,
    session: OllamaSession,
    user_text: str,
) -> str:
    """Send user_text through the Ollama chat and stream the response.

    Returns the full assistant response text.
    """
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

    await websocket.send_json(
        {
            "type": "turn_complete",
            "text": full_response,
        }
    )

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
                            response = await _handle_ollama_turn(websocket, ollama, transcript)

                            # Persist the turn
                            if db_session_id is None:
                                title = transcript[:60] + ("..." if len(transcript) > 60 else "")
                                db_session_id = await create_session(title)
                            await add_message(db_session_id, "user", transcript, source="voice")
                            await add_message(db_session_id, "assistant", response)
                            continue

                    # Plain text message (typed chat)
                    logger.info("[ws/live] received text: %s", text[:80])
                    response = await _handle_ollama_turn(websocket, ollama, text)

                    # Persist the turn
                    if db_session_id is None:
                        title = text[:60] + ("..." if len(text) > 60 else "")
                        db_session_id = await create_session(title)
                    await add_message(db_session_id, "user", text, source="typed")
                    await add_message(db_session_id, "assistant", response)

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