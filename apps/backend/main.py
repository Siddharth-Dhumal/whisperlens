from fastapi import FastAPI

app = FastAPI(title="WhisperLens Backend", version="0.1.0")

@app.get("/health")
def health_check() -> dict:
    return {"status": "ok"}