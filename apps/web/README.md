# WhisperLens Web App

This package contains the Next.js frontend for WhisperLens.

## Purpose

The web app provides the user interface for:
- the live workspace
- Study Vault navigation
- session detail view
- Study Sources navigation
- source detail and source creation

## Stack

- Next.js 16
- React 19
- TypeScript
- Vitest
- Testing Library

## Run locally

```bash
npm install
npm run dev
```

Default local URL:

```text
http://localhost:3000
```

## Environment file

Create `apps/web/.env.local` if needed:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_BACKEND_WS_URL=ws://localhost:8000/ws/live
```

## Main scripts

```bash
npm run dev
npm run lint
npm test
npm run build
```

## Main UI components

- `LiveSessionPanel.tsx`
- `StudyVault.tsx`
- `SessionDetailPanel.tsx`
- `StudySources.tsx`
- `SourceDetailPanel.tsx`

## Notes

- the frontend assumes the backend is running locally
- voice and camera flows require browser permissions
- the live workspace depends on the backend WebSocket endpoint