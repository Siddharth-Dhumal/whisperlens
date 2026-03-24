# WhisperLens Product and Engineering Spec

## 1. Product identity

WhisperLens is a local-first AI study assistant.

It is designed to make local AI workflows feel useful and polished without depending on paid APIs or a hosted backend.

The product helps a student:
- ask questions by text
- ask questions by voice
- use a quick camera snapshot for visual questions
- build a personal study-source library
- search local study materials
- receive grounded answers with lightweight source hints
- reopen prior sessions from a persistent local history

## 2. Product goals

Primary goals:
1. deliver a polished MVP experience for local study workflows
2. keep the main runtime path local-first and low-cost
3. support typed and voice conversation in a single live workspace
4. support lightweight vision through snapshot capture
5. let users create and search a local study-source vault
6. preserve conversation history locally for later review

## 3. Non-goals for the current baseline

The current project does not try to be:
- a hosted multi-user SaaS product
- a full document management system
- a large-scale RAG platform with embeddings and vector databases
- a production deployment platform with auth, billing, and monitoring

## 4. Current user-facing surfaces

The merged MVP has five primary surfaces:

### 4.1 Live workspace
The main surface for typed chat, voice input, and camera snapshot interaction.

### 4.2 Study Vault sidebar
Lists saved sessions and lets the user reopen prior conversations.

### 4.3 Session detail view
Shows the contents of a saved session and supports continuing prior work.

### 4.4 Study Sources sidebar
Lists saved study sources and provides entry to create a new source.

### 4.5 Source detail / create source view
Used for viewing one source, seeing its chunks, searching local study content, and creating new sources.

## 5. Product behavior

### 5.1 Typed chat
Current behavior:
- user sends a typed message over WebSocket
- backend searches local study sources for relevant chunks
- backend builds a grounded prompt when matches exist
- Ollama generates the assistant response
- assistant response streams back to the frontend
- turn metadata can include source attribution
- the raw user message is what gets persisted

### 5.2 Voice chat
Current behavior:
- frontend records audio and streams chunks
- backend buffers audio and runs speech-to-text with faster-whisper
- transcript is returned to the frontend
- transcript follows the same local grounding path as typed chat
- assistant response streams back
- raw spoken transcript is what gets persisted

### 5.3 Vision flow
Current behavior:
- user opens the camera popup
- browser permission is requested if needed
- live preview appears in the popup
- user captures a snapshot
- frontend submits the image to the backend vision endpoint
- Ollama-based vision returns the answer
- the vision turn is persisted

### 5.4 Study source creation
Current behavior:
- user can create a source from pasted text
- user can import `.txt` and `.md` files
- title may be entered manually or derived from file name
- content is chunked deterministically on ingest
- new sources appear in the sidebar after creation

### 5.5 Study source search
Current behavior:
- backend uses SQLite FTS5 over persisted chunks
- frontend shows matching results with document title and chunk number
- source detail shows both full content and chunk list

### 5.6 Session history
Current behavior:
- sessions are stored in SQLite
- messages are stored with role, source, and created timestamp
- Study Vault lists saved sessions
- session detail allows users to inspect prior work

## 6. Technical architecture

### 6.1 Frontend
Stack:
- Next.js 16
- React 19
- TypeScript

Main UI responsibilities:
- render the sidebar + main workspace layout
- manage WebSocket interaction state
- manage audio and camera browser APIs
- render session and source detail views
- call REST endpoints for source and session data

Important frontend components:
- `LiveSessionPanel`
- `StudyVault`
- `StudySources`
- `SessionDetailPanel`
- `SourceDetailPanel`

### 6.2 Backend
Stack:
- FastAPI
- Python
- aiosqlite

Main backend responsibilities:
- expose REST endpoints
- host the `/ws/live` WebSocket
- orchestrate live typed and voice turns
- perform source ingestion and search
- persist sessions and messages
- package source attribution metadata
- handle snapshot-based vision requests

Important backend modules:
- `app/main.py`
- `app/db.py`
- `app/study_sources.py`
- `app/chat_grounding.py`
- `app/stt.py`
- `app/vision.py`
- `app/ollama_live.py`
- `app/settings.py`

### 6.3 Local model runtime
- Ollama for text generation
- Ollama for vision analysis
- faster-whisper for speech-to-text

### 6.4 Persistence and retrieval
- SQLite for sessions, messages, documents, and chunks
- SQLite FTS5 for keyword-based local retrieval

## 7. Data model summary

### 7.1 Sessions
Core table: `sessions`
- `id`
- `title`
- `created_at`
- `updated_at`

### 7.2 Messages
Core table: `messages`
- `id`
- `session_id`
- `role`
- `text`
- `source`
- `created_at`

### 7.3 Study sources
Core tables:
- `documents`
- `document_chunks`
- `document_chunks_fts`

Important behavior:
- chunking is deterministic
- FTS index is kept synchronized with triggers
- retrieval is local and explainable

## 8. API surface

### System
- `GET /health`
- `WebSocket /ws/live`

### Sessions
- `GET /api/sessions`
- `GET /api/sessions/{session_id}`

### Study sources
- `GET /api/study-sources`
- `GET /api/study-sources/{document_id}`
- `GET /api/study-sources/search?q=...`
- `POST /api/study-sources`
- `POST /api/study-sources/upload`

### Vision
- `POST /api/vision`
- `POST /api/vision/warm`

## 9. Important behavior contracts

### 9.1 Grounding contract
- typed chat can be grounded with local Study Sources
- voice chat can be grounded with local Study Sources
- source hints are lightweight and turn-scoped
- the system must not claim study-source support for text not present in retrieved chunks

### 9.2 Persistence contract
- the raw user message or transcript is what gets stored visibly
- internal grounded prompt text is not stored as the visible user message

### 9.3 UI state contract
- new chat should reset the live workspace
- newly created sources should appear in the sidebar
- stale source detail should not remain visible after failed source loads
- camera preview should render before capture

## 10. Quality baseline

Latest confirmed status:
- backend tests passing: `77`
- frontend tests passing: `46`
- frontend production build: passing
- manual end-to-end verification completed for the main MVP flows

## 11. Known limits

Current limits include:
- no auth or account system
- no hosted production deployment workflow
- no advanced retrieval ranking beyond local FTS matching
- no collaborative features
- no long-term analytics or telemetry stack

## 12. Completion state

WhisperLens should be considered a finished MVP baseline when these remain true:
- green backend tests
- green frontend tests
- passing frontend production build
- stable manual demo flow
- documentation consistent with the actual product