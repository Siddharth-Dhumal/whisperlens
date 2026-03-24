# WhisperLens Local Setup Guide

This guide explains how to run WhisperLens locally for development, testing, and demo use.

WhisperLens is intentionally local-first:
- local backend
- local frontend
- local Ollama inference
- local speech-to-text
- local SQLite persistence

## 1. Prerequisites

Install these first:
- Python 3.11+ recommended, Python 3.13 works well for local development
- Node.js 20+
- npm
- Ollama installed locally

You should also have:
- microphone access for voice testing
- camera access for snapshot testing

## 2. Repository layout

Main working directories:

```text
apps/backend
apps/web
docs
```

## 3. Backend setup

```bash
cd apps/backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload
```

Backend default URL:

```text
http://localhost:8000
```

Health check:

```text
GET http://localhost:8000/health
```

## 4. Backend environment file

Create `apps/backend/.env` if you want explicit local config.

Example:

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
OLLAMA_VISION_MODEL=moondream
STT_MODEL=base
DB_PATH=whisperlens.db
```

Notes:
- `DB_PATH=whisperlens.db` creates the SQLite file inside `apps/backend`
- the backend initializes the schema automatically on startup

## 5. Frontend setup

Open a second terminal:

```bash
cd apps/web
npm install
npm run dev
```

Frontend default URL:

```text
http://localhost:3000
```

## 6. Frontend environment file

Create `apps/web/.env.local` if needed.

Example:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_BACKEND_WS_URL=ws://localhost:8000/ws/live
```

## 7. Ollama setup

Make sure Ollama is running locally.

Required baseline models:

```bash
ollama pull llama3.2
ollama pull moondream
```

Current defaults assume:
- text model: `llama3.2`
- vision model: `moondream`

## 8. First-run smoke test

After backend, frontend, and Ollama are running:

1. load the frontend
2. confirm the sidebar appears
3. connect the live chat socket
4. send a simple typed message
5. create a study source
6. search inside that source
7. test voice input
8. test the camera snapshot flow

## 9. Test commands

### Backend

```bash
cd apps/backend
source .venv/bin/activate
pytest -q
```

### Frontend

```bash
cd apps/web
npm test
npm run build
```

## 10. Verified baseline

Latest confirmed green baseline:
- backend: `77 passed`
- frontend: `46 passed`
- production build: passing

## 11. Common manual test flow

Use this order when verifying a branch:

1. typed chat works
2. new chat resets correctly
3. Study Vault refreshes after saved turns
4. pasted-text source creation works
5. source detail loads correctly
6. source search returns expected chunks
7. file upload for `.txt` and `.md` works
8. voice input works
9. camera preview and capture work
10. stale source content does not remain on failed source loads

## 12. Troubleshooting

### Frontend cannot reach backend
Check:
- backend is running on port 8000
- frontend is pointing at the correct backend URL
- CORS is not being blocked by a mismatched origin

### WebSocket chat does not connect
Check:
- backend is running
- `NEXT_PUBLIC_BACKEND_WS_URL` is correct
- browser devtools do not show a failed WebSocket handshake

### Ollama replies fail
Check:
- Ollama is running
- the configured model names exist locally
- the backend can reach the configured Ollama base URL

### Voice input fails
Check:
- microphone permission is allowed
- backend dependencies installed correctly
- local STT model can load normally

### Camera popup is black
Check:
- camera permission is allowed
- no other app is blocking the camera
- the live preview stream is visible before capture

### Study source search returns nothing
Check:
- the source was saved successfully
- the source appears in the sidebar
- search terms actually exist in the saved content
- the backend database file is the one currently in use

## 13. Recommended developer workflow

A clean workflow for future work:

1. start from updated `main`
2. create a focused branch
3. make one moderate slice
4. run backend tests
5. run frontend tests
6. run a quick manual smoke test
7. commit only after green checks
8. open a PR with a clear summary and verification notes

## 14. Related docs

- project overview: `README.md`
- product and engineering spec: `docs/spec.md`
- architecture overview: `docs/architecture/overview.md`
- manual E2E checklist: `docs/demo/manual-e2e-checklist.md`