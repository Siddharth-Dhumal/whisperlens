from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

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
    total_bytes_received = 0

    while True:
        message = await websocket.receive()
        message_type = message["type"]

        if message_type == "websocket.disconnect":
            print("[ws/live] client disconnected")
            break

        if message_type == "websocket.receive":
            if message.get("bytes") is not None:
                chunk = message["bytes"]
                total_bytes_received += len(chunk)

                print(
                    f"[ws/live] received audio chunk: "
                    f"{len(chunk)} bytes "
                    f"(total={total_bytes_received})"
                )

                await websocket.send_json(
                    {
                        "type": "audio_ack",
                        "chunk_size": len(chunk),
                        "total_bytes_received": total_bytes_received,
                    }
                )

            elif message.get("text") is not None:
                text_message = message["text"]
                print(f"[ws/live] received text message: {text_message}")

                await websocket.send_json(
                    {
                        "type": "text_ack",
                        "message": text_message,
                    }
                )