# WhisperLens

WhisperLens is a local-first AI study assistant for text, voice, and snapshot-based vision workflows.

It is built to feel like a real product while staying simple, explainable, and inexpensive to run:
- local FastAPI backend
- local Next.js frontend
- local Ollama text and vision models
- local faster-whisper speech-to-text
- local SQLite persistence and retrieval
- no paid API required in the normal runtime path

## What the product does

WhisperLens helps a student:
- chat by text in a live workspace
- ask questions by voice
- use a camera snapshot for quick visual questions
- save sessions locally in Study Vault
- create local study sources from pasted text or local `.txt` / `.md` files
- search those study sources with local retrieval
- show lightweight source hints under grounded assistant replies
- reopen saved sessions and inspect saved sources from the sidebar

## Current product surfaces

The merged MVP has five user-facing surfaces:
1. Live workspace
2. Study Vault sidebar list
3. Session detail view
4. Study Sources sidebar list
5. Source detail / create source view

## Verified project status

Latest confirmed baseline:
- backend tests: `77 passed`
- frontend tests: `46 passed`
- frontend production build: passing
- manual end-to-end flow: verified for typed chat, new chat reset, source creation, source search, voice, and camera preview/capture

This is a strong MVP and demo-ready baseline.

## Main features

### Live workspace
- WebSocket-based typed chat
- voice input and transcription
- snapshot-based vision flow
- fixed composer with scrollable conversation area
- grounded source hints under supported assistant replies

### Study Vault
- saved sessions listed in the sidebar
- session detail view for reopening prior conversations
- local persistence of text, voice, and vision turns

### Study Sources
- create sources from pasted text
- import `.txt` and `.md` files
- deterministic chunking on ingest
- SQLite FTS search over stored chunks
- source detail view with full content and chunk list
- immediate sidebar refresh after new source creation

### Grounding
- typed chat grounded with local study sources
- voice chat grounded with local study sources
- lightweight attribution metadata returned at turn completion

## Tech stack

### Frontend
- Next.js 16
- React 19
- TypeScript
- Vitest + Testing Library

### Backend
- FastAPI
- Python
- aiosqlite
- pytest

### Local AI runtime
- Ollama
- faster-whisper

### Storage and retrieval
- SQLite
- FTS5

## Repository structure

```text
apps/
  backend/   FastAPI backend, WebSocket orchestration, persistence, retrieval
  web/       Next.js UI

docs/
  setup.md                     local setup and troubleshooting
  spec.md                      product and technical spec
  architecture/overview.md     architecture guide
  demo/manual-e2e-checklist.md demo and manual verification checklist
```

## Quick start

### 1. Start the backend

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

### 2. Start the frontend

```bash
cd apps/web
npm install
npm run dev
```

Frontend default URL:

```text
http://localhost:3000
```

### 3. Start Ollama and pull the models

```bash
ollama pull llama3.2
ollama pull moondream
```

## Environment files

### Backend example
Path: `apps/backend/.env`

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
OLLAMA_VISION_MODEL=moondream
STT_MODEL=base
DB_PATH=whisperlens.db
```

### Frontend example
Path: `apps/web/.env.local`

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_BACKEND_WS_URL=ws://localhost:8000/ws/live
```

## Testing

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

## Main API surface

### System
- `GET /health`
- `WebSocket /ws/live`

### Sessions
- `GET /api/sessions`
- `GET /api/sessions/{session_id}`

### Study Sources
- `GET /api/study-sources`
- `GET /api/study-sources/{document_id}`
- `GET /api/study-sources/search?q=...`
- `POST /api/study-sources`
- `POST /api/study-sources/upload`

### Vision
- `POST /api/vision`
- `POST /api/vision/warm`

## Demo flow

A clean MVP demo sequence:
1. open the live workspace
2. send a typed question
3. start a new chat and show reset behavior
4. create a new study source
5. open the source detail view and search inside it
6. ask a grounded question
7. use voice input
8. use the camera snapshot flow
9. open Study Vault and show saved history

## Important product rules

- keep the runtime local-first
- keep retrieval simple and explainable
- preserve raw user input in saved history
- do not store internal grounded prompt text as the visible user message
- prefer safe, tested slices over large speculative rewrites

## Known limits

- this is an MVP, not a production SaaS system
- retrieval is intentionally lightweight and local
- there is no multi-user auth or hosted deployment story in the current baseline

## Documentation map

- local setup: `docs/setup.md`
- product and engineering spec: `docs/spec.md`
- architecture overview: `docs/architecture/overview.md`
- manual E2E test checklist: `docs/demo/manual-e2e-checklist.md`