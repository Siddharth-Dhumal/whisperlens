# WhisperLens

WhisperLens is a local-first AI study assistant built for real-time text, voice, and vision study workflows.

## What WhisperLens does

WhisperLens helps a student:
- ask questions by text
- ask questions by voice
- use snapshot-based vision
- save conversations locally
- add local study materials
- search those study materials
- ground assistant responses with local study-source context
- see lightweight source hints under grounded replies

## Current MVP status

The current system supports:

### Live chat
- typed chat over WebSockets
- voice chat over WebSockets
- local speech-to-text with `faster-whisper`
- local LLM responses through Ollama
- session continuity across turns

### Grounding
- typed chat grounded with local Study Sources
- voice chat grounded with local Study Sources
- local retrieval using SQLite FTS
- lightweight source hints shown under grounded assistant replies

### Study Sources
- create sources from pasted text
- import local `.txt` files
- import local `.md` files
- search study-source chunks
- open full source detail
- show chunk counts and full content
- imported files saved as `local_file`
- pasted manual text saved as `pasted_text`

### Study Vault
- local persistence of saved sessions
- text, voice, and vision turns stored locally
- Study Vault refresh support for saved turns

### Vision
- local snapshot-based vision through Ollama
- currently functional enough for the MVP
- intentionally not the current roadmap focus

## Product principles

WhisperLens is intentionally built around these rules:

1. local-first comes first
2. no paid API usage
3. no required cloud inference dependency in the main runtime path
4. preserve working features while extending carefully
5. keep retrieval simple and explainable
6. prefer moderate safe slices over giant refactors
7. keep tests green before moving forward

## Tech stack

### Frontend
- Next.js
- React
- TypeScript

### Backend
- FastAPI
- Python

### Runtime and AI
- Ollama for local model inference
- faster-whisper for local speech-to-text

### Persistence
- SQLite

### Retrieval
- SQLite FTS5 over deterministic study-source chunks

## Repository structure

```text
apps/
  backend/   FastAPI backend, websocket orchestration, persistence, retrieval
  web/       Next.js frontend UI
docs/
  spec.md    Internal architecture and product spec
```

## Architecture overview

WhisperLens has four main product surfaces:

1. Live chat
2. Study Sources
3. Study Vault
4. Backend status

At a high level:

- the frontend talks to the backend
- the backend owns websocket orchestration, persistence, study-source ingestion, and retrieval
- Ollama handles local text and vision model inference
- faster-whisper handles local speech-to-text
- SQLite stores sessions, messages, study documents, and study chunks

For the detailed internal architecture, read:

`docs/spec.md`

## Local setup

### Requirements
- Python 3.13 recommended for the backend
- Node.js for the frontend
- Ollama installed and running locally

### Default backend settings
The backend defaults currently include:
- Ollama base URL: `http://localhost:11434`
- text model: `llama3.2`
- vision model: `moondream`
- STT model: `base`

These are loaded through the backend settings layer.

## Backend setup

```bash
cd apps/backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload
```

Backend will run on:

`http://localhost:8000`

Health check:

`GET /health`

## Frontend setup

```bash
cd apps/web
npm install
npm run dev
```

Frontend will run on:

`http://localhost:3000`

## Running tests

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
```

## Current tested baseline

Latest confirmed green baseline in development:

### Backend
- full backend suite passing
- 77 tests

### Frontend
- full frontend suite passing
- 37 tests

## Current API surface

### Study Vault
- `GET /api/sessions`
- `GET /api/sessions/{session_id}`

### Study Sources
- `POST /api/study-sources`
- `POST /api/study-sources/upload`
- `GET /api/study-sources`
- `GET /api/study-sources/search?q=...`
- `GET /api/study-sources/{document_id}`

### Vision
- `POST /api/vision`

### System
- `GET /health`
- `WebSocket /ws/live`

## Important behavior contracts

### Grounding
- typed chat is grounded with local Study Sources
- voice chat is grounded with local Study Sources
- retrieval uses SQLite FTS

### Persistence
- raw user input is preserved in Study Vault
- internal grounded prompts are not stored as the visible user message

### Source hints
- assistant replies can include lightweight source attribution
- source hints appear only when a match exists
- no hint appears when no source matched

## Near-term roadmap direction

- setup polish
- Study Sources search/result polish
- MVP finishing-line refinement
- later source-display improvements
- later local eval groundwork

## Why this project matters

WhisperLens is trying to be something sharper:
a clean, local-first study assistant with real engineering discipline, practical product decisions, and an architecture that is easy to understand and extend.

That simplicity is part of the quality.