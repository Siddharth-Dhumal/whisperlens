# WhisperLens Local Setup Guide

This guide explains how to run WhisperLens locally for development.

WhisperLens is intentionally local-first:
- local backend
- local frontend
- local Ollama inference
- local SQLite persistence
- local speech-to-text

## 1. Prerequisites

You should have these installed:

- Python 3.13 recommended
- Node.js
- npm
- Ollama installed locally

## 2. Repository structure

Main working directories:

- `apps/backend`
- `apps/web`
- `docs`

## 3. Backend setup

Go into the backend folder:

```bash
cd apps/backend
```

Create and activate a virtual environment:

```bash
python3.13 -m venv .venv
source .venv/bin/activate
```

Install backend dependencies:

```bash
pip install -r requirements.txt -r requirements-dev.txt
```

Start the backend:

```bash
uvicorn app.main:app --reload
```

The backend should run at:

```text
http://localhost:8000
```

## 4. Frontend setup

Open a new terminal and go into the frontend folder:

```bash
cd apps/web
```

Install frontend dependencies:

```bash
npm install
```

Start the frontend:

```bash
npm run dev
```

The frontend should run at:

```text
http://localhost:3000
```

## 5. Ollama setup

WhisperLens expects Ollama to be running locally.

Start Ollama if needed.

Default backend settings currently assume:

- Ollama base URL: `http://localhost:11434`
- text model: `llama3.2`
- vision model: `moondream`

You should make sure the required models are available locally.

Example pulls:

```bash
ollama pull llama3.2
ollama pull moondream
```

## 6. Backend configuration

Backend settings are loaded from the backend settings layer.

Current defaults include:

- `ollama_base_url = "http://localhost:11434"`
- `ollama_model = "llama3.2"`
- `ollama_vision_model = "moondream"`
- `stt_model = "base"`
- `db_path = "whisperlens.db"`

These values can be overridden through environment variables or a backend `.env` file.

## 7. Suggested backend .env file

Create this file if you want explicit local configuration:

Path:

```text
apps/backend/.env
```

Example contents:

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
OLLAMA_VISION_MODEL=moondream
STT_MODEL=base
DB_PATH=whisperlens.db
```

## 8. Running tests

### Backend tests

```bash
cd apps/backend
source .venv/bin/activate
pytest -q
```

### Frontend tests

```bash
cd apps/web
npm test
```

## 9. Current known green baseline

Latest confirmed green baseline:

### Backend
- `pytest -q`
- 77 passed

### Frontend
- `npm test`
- 37 passed

## 10. Main product flows to manually test

After starting backend, frontend, and Ollama, verify these flows:

### Typed chat
- ask a normal typed question
- verify assistant responds

### Voice chat
- ask a voice question
- verify transcript appears
- verify assistant responds

### Study Sources
- add a pasted text source
- import a `.txt` source
- import a `.md` source
- search for a phrase from a saved source
- click a search result and open full source detail

### Grounding
- ask a typed question that matches a study source
- verify a source hint appears under the assistant reply

- ask a voice question that matches a study source
- verify a source hint appears under the assistant reply

### Study Vault
- verify saved turns appear in Study Vault
- verify text and voice persistence behave correctly

## 11. Important behavior notes

### Grounding behavior
- typed chat is grounded with local Study Sources
- voice chat is grounded with local Study Sources
- retrieval uses SQLite FTS

### Persistence behavior
- raw user input is stored in Study Vault
- internal grounded prompts are not shown as the saved user message

### Vision behavior
- vision exists and is usable
- vision is intentionally not the current roadmap focus
- do not treat vision polish as the next default task

## 12. Troubleshooting

### Frontend cannot reach backend
Make sure:
- backend is running on port 8000
- frontend is running on port 3000
- frontend backend URL is configured correctly if overridden

### Ollama replies fail
Make sure:
- Ollama is running
- the configured models are installed locally
- the backend Ollama base URL is correct

### Speech-to-text issues
Make sure:
- microphone permissions are allowed
- backend dependencies installed correctly
- local model files for STT can load normally

## 13. Recommended developer workflow

A clean workflow for future work:

1. start from updated `main`
2. create a focused branch
3. make one moderate safe slice
4. run backend tests
5. run frontend tests
6. manually verify the user-facing flow
7. commit only after green tests
8. merge back cleanly

## 14. Related docs

- Product and architecture spec: `docs/spec.md`
- Project overview: `README.md`