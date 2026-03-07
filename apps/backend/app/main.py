import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.gemini_live import GeminiLiveSession

logger = logging.getLogger(__name__)

app = FastAPI(title="WhisperLens Backend", version="0.1.0")

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


@app.websocket("/ws/live")
async def live_websocket(websocket: WebSocket) -> None:
    await websocket.accept()

    gemini = GeminiLiveSession()

    try:
        await gemini.connect()
        logger.info("[ws/live] Gemini Live session connected")

        while True:
            message = await websocket.receive()
            message_type = message["type"]

            if message_type == "websocket.disconnect":
                logger.info("[ws/live] client disconnected")
                break

            if message_type == "websocket.receive":
                text = message.get("text")

                if text is not None:
                    logger.info("[ws/live] received text: %s", text[:80])

                    await gemini.send_text(text)

                    full_response = ""
                    async for chunk in gemini.receive_text():
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

    except WebSocketDisconnect:
        logger.info("[ws/live] client disconnected (exception)")
    except Exception:
        logger.exception("[ws/live] unexpected error")
        try:
            await websocket.send_json(
                {"type": "error", "message": "Internal server error"}
            )
        except Exception:
            pass
    finally:
        await gemini.close()