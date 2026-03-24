# WhisperLens Architecture Overview

This document explains how the main parts of WhisperLens fit together.

## 1. High-level system view

```text
Browser UI
  ├─ Live workspace
  ├─ Study Vault sidebar
  ├─ Session detail view
  ├─ Study Sources sidebar
  └─ Source detail / create source view
          |
          v
FastAPI backend
  ├─ REST endpoints
  ├─ /ws/live WebSocket
  ├─ session persistence
  ├─ study-source ingestion
  ├─ study-source search
  ├─ voice transcription orchestration
  └─ vision request handling
          |
          +--> SQLite
          |     ├─ sessions
          |     ├─ messages
          |     ├─ documents
          |     ├─ document_chunks
          |     └─ document_chunks_fts
          |
          +--> Ollama
          |     ├─ text model
          |     └─ vision model
          |
          +--> faster-whisper
                └─ speech-to-text
```

## 2. Frontend responsibilities

### Live workspace
Owns:
- typed message submission
- voice recording controls
- camera open / close / capture flow
- streaming assistant output
- grounded source hint display

### Study Vault
Owns:
- session list rendering
- opening saved sessions
- exposing a new chat action

### Session detail
Owns:
- rendering one saved session
- providing a stable history view

### Study Sources
Owns:
- source list rendering
- opening a source
- entering new-source mode

### Source detail / create source
Owns:
- source creation
- file import
- full source rendering
- chunk rendering
- source search inside the saved corpus

## 3. Backend responsibilities

### WebSocket live flow
The backend receives typed messages and audio events through `/ws/live`.
It manages:
- session creation and reuse
- routing typed questions to the local model path
- buffering voice input and transcribing it
- grounding typed and voice queries with local study sources
- streaming assistant output back to the client

### REST flow
The backend also provides simpler REST endpoints for:
- health checks
- session list and session detail
- study source list and detail
- study source search
- study source creation and file upload
- vision snapshot requests

## 4. Grounding path

The grounding path is intentionally simple:

1. user asks a typed or spoken question
2. backend searches `document_chunks_fts`
3. backend builds a grounded prompt if matches exist
4. model generates the reply
5. turn metadata carries source hint information back to the frontend

This design keeps retrieval explainable and easy to debug.

## 5. Persistence path

### Conversation data
Saved locally in SQLite:
- session metadata in `sessions`
- turn messages in `messages`

### Study source data
Saved locally in SQLite:
- source metadata and full text in `documents`
- deterministic chunks in `document_chunks`
- search index in `document_chunks_fts`

## 6. Design choices that matter

### Why WebSockets for live chat
WebSockets keep typed and voice interaction in one continuous channel and support streaming responses.

### Why SQLite
SQLite keeps the MVP local, simple, inspectable, and easy to ship.

### Why FTS5 instead of embeddings
FTS5 is lightweight, deterministic, and enough for the current local study-source use case.

### Why separate session and source detail views
This keeps the main workspace focused while still letting the user inspect older sessions and documents.

## 7. Stability rules

WhisperLens is in good shape when these remain true:
- chat reset works from the sidebar
- new sources refresh into the sidebar immediately
- source search results match the backend response shape
- stale source detail never stays visible after a failed load
- camera preview appears before capture
- green tests stay green before merge