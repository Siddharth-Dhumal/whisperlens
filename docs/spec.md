# WhisperLens Spec

## 1. Product Identity

WhisperLens is a local-first AI study assistant.

The product helps a student:
- chat by text
- chat by voice
- use lightweight snapshot-based vision
- save conversations locally
- add local study materials
- retrieve relevant study context from those materials
- ground assistant answers with local study sources
- see lightweight source hints under grounded replies

---

## 2. Core Product Goals

The main product goals are:

1. Provide a polished local AI study assistant experience.
2. Keep the runtime path local-first and free.
3. Support typed and voice conversation with preserved session continuity.
4. Let users build a local study-source vault.
5. Use local retrieval to ground answers from study materials.
6. Show lightweight source attribution without overcomplicating the UI.

---

## 3. Current Tech Stack

### Frontend
- Next.js
- React
- TypeScript

### Backend
- FastAPI
- Python

### Transport
- WebSockets for live chat

### Local Model Runtime
- Ollama

### Local Speech-to-Text
- faster-whisper

### Persistence
- SQLite

### Vision
- local snapshot-based vision through Ollama

---

## 4. High-Level Architecture

WhisperLens has four major product surfaces:

1. Live chat surface
2. Study Sources surface
3. Study Vault surface
4. Backend status / system health surface

The architecture is local-first:

- frontend talks to backend
- backend owns session logic, persistence, ingestion, retrieval, and websocket orchestration
- Ollama handles text and vision model inference locally
- faster-whisper handles speech-to-text locally
- SQLite stores sessions, messages, study documents, and study chunks locally

---

## 5. Frontend Architecture

Main frontend page currently mounts these major panels:

- `BackendStatus`
- `LiveSessionPanel`
- `StudySources`
- `StudyVault`

### 5.1 BackendStatus
Purpose:
- show whether the backend is reachable
- give quick system-level confidence during development and demos

### 5.2 LiveSessionPanel
Purpose:
- main user chat interface
- supports typed chat
- supports voice chat
- supports vision-triggered interaction path
- shows assistant messages
- shows lightweight source hints when `turn_complete.source_info` is present and matched

Important behavior:
- source hint rendering is generic
- it now works for both typed and voice grounded turns
- no hint appears when there is no match or no `source_info`

### 5.3 StudySources
Purpose:
- create and inspect local study sources
- search local study chunks
- import local text-based study files

Current capabilities:
- create source from pasted text
- import `.txt`
- import `.md`
- auto-fill title from file name when title is blank
- preserve user-entered title if already typed
- review and edit imported content before saving
- search local study chunks using backend search
- click a search result to open full source detail
- show full content and chunk count
- list all saved sources
- refresh the list manually

Current file-save behavior:
- pasted text saves as `pasted_text`
- imported file with unchanged content saves through backend multipart upload
- imported file that was edited before save falls back to JSON create flow
- edited imported file still saves as `local_file`

### 5.4 StudyVault
Purpose:
- show saved conversation history
- preserve chat continuity across turns
- allow session review

Important current behavior:
- text, voice, and vision turns persist into Study Vault
- Study Vault auto-refresh behavior exists after saved turns
- open Study Vault detail can auto-refresh

---

## 6. Backend Architecture

Key backend responsibilities:

- websocket live session orchestration
- session creation and message persistence
- local study-source ingestion
- deterministic chunking
- FTS search over study-source chunks
- grounding prompts for supported chat paths
- packaging lightweight source attribution metadata
- REST API for study-source CRUD-lite flows

Important backend modules:

### 6.1 `app/main.py`
Main application entry point.

Responsibilities:
- FastAPI app setup
- websocket live session handler
- REST endpoints
- typed chat flow
- voice chat flow
- vision-related request flow
- source attribution packaging
- study-source upload endpoint

### 6.2 `app/db.py`
Responsibilities:
- SQLite schema creation
- sessions/messages persistence
- study document storage
- study chunk storage
- FTS search support
- list/get/search helpers for study sources

### 6.3 `app/study_sources.py`
Responsibilities:
- deterministic text chunking
- ingest document flow
- handoff from raw content to persisted document + chunks

### 6.4 `app/chat_grounding.py`
Responsibilities:
- query the local study-source search layer
- build a grounded prompt for the current user question
- keep no-match behavior turn-scoped
- return matches for source attribution

---

## 7. Persistence Model

### 7.1 Conversation Persistence
The backend persists conversation turns in SQLite.

Important product rule:
- the raw user input is stored
- internal grounded prompts are not stored as the visible user message

This keeps the Study Vault faithful to the real user interaction.

### 7.2 Study Source Persistence
Study sources use these core tables:

- `documents`
- `document_chunks`
- `document_chunks_fts`

Important details:
- FTS5 is used for local retrieval
- triggers keep the FTS table synchronized
- document ingestion produces deterministic chunk boundaries

---

## 8. Live Chat Behavior

### 8.1 Typed Chat
Current behavior:
- user sends typed message over websocket
- backend calls local grounding over study sources
- backend builds grounded prompt
- Ollama receives the grounded prompt
- assistant response streams back
- `turn_complete` includes `source_info`
- raw typed input is what gets saved to Study Vault

Current source attribution:
- `source_info.matched`
- `source_info.match_count`
- `source_info.source_titles`

### 8.2 Voice Chat
Current behavior:
- frontend starts audio lifecycle
- backend buffers audio
- faster-whisper produces transcript
- transcript is sent back to frontend
- backend grounds the transcript using the same study-source retrieval path
- Ollama receives the grounded voice prompt
- assistant response streams back
- `turn_complete` includes `source_info`
- raw spoken transcript is what gets persisted

Important:
- voice grounding is now implemented
- source hints now work for voice replies too

### 8.3 Vision Chat
Current behavior:
- vision exists and is functionally good enough for now
- smaller snapshot capture path exists
- keep-alive behavior exists for vision requests
- warm-up endpoint exists
- one retry on empty response exists
- frontend shows backend vision error detail

---

## 9. Study Source Grounding Model

Grounding currently uses:
- local SQLite FTS retrieval

Grounding result structure conceptually includes:
- grounded prompt
- list of matched study chunks

Source attribution is derived from those matches:
- whether any chunk matched
- how many chunks matched
- distinct source titles involved

No-match design rule:
- if no relevant match exists, the model should not implicitly rely on prior study-note context from earlier turns
- no-match behavior is scoped to the current turn

This prevents unwanted study-note bleed between unrelated questions.

---

## 10. Current REST API Surface

### 10.1 Create study source from text
`POST /api/study-sources`

Purpose:
- create a study source from provided title, source type, and content

Used by:
- pasted text create flow
- edited imported file fallback flow

### 10.2 Upload study source file
`POST /api/study-sources/upload`

Purpose:
- upload `.txt` or `.md` file
- ingest it as `local_file`

Behavior:
- only `.txt` and `.md` accepted
- empty file rejected
- filename can be used to derive title
- file must decode as UTF-8 text

### 10.3 List study sources
`GET /api/study-sources`

Purpose:
- return saved sources for the Study Sources panel

### 10.4 Search study chunks
`GET /api/study-sources/search?q=...`

Purpose:
- query study chunks by text
- power Study Sources search UI
- support grounding internals through related retrieval helpers

### 10.5 Get study source detail
`GET /api/study-sources/{document_id}`

Purpose:
- return full source detail with content and chunks

---

## 11. Current Frontend Search UX

Study Sources search currently supports:
- manual search query input
- loading search results from backend
- empty search state
- error search state
- clickable result items
- opening full source detail from a result

Current result display includes:
- source title
- chunk number
- content preview snippet

---

## 12. Current Source Types

Known current source types in product behavior:

- `pasted_text`
- `local_file`

Meaning:
- `pasted_text`: user manually pasted the content into the form
- `local_file`: content originated from local file import or upload

---

## 13. Current Reliability and Testing State

Latest known green baseline after recent work:

### Backend
- full backend suite passing
- total: 77 tests

Coverage areas include:
- study-source DB behavior
- study-source chunking and ingestion service
- study-source REST API
- chat grounding behavior
- websocket typed flow
- websocket voice flow
- source attribution behavior
- upload endpoint behavior

### Frontend
- full frontend suite passing
- total: 37 tests

Coverage areas include:
- socket state
- session state
- Study Vault UI
- Live session/source hint UI
- Study Sources create/import/search/detail flows

---

## 14. Mental Model Summary

WhisperLens is now best understood as this:

A local study assistant where:
- the user can talk or type
- the app can remember conversations locally
- the user can build a local study-source vault
- the assistant can pull relevant note context from that vault
- the user gets lightweight visibility that a source was used
- everything stays intentionally simple, local-first, and free

That simplicity is part of the product quality, not a missing feature.