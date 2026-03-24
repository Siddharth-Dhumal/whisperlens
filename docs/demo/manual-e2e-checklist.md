# WhisperLens Manual End-to-End Checklist

Use this checklist before a demo, before a release-style merge, or after any significant UI or backend change.

## Startup

- backend starts without errors
- frontend starts without errors
- Ollama is running locally
- browser console has no red errors on load

## 1. App shell

- app loads successfully
- sidebar renders correctly
- sidebar collapse works
- sidebar reopen works
- Study Vault section is visible
- Study Sources section is visible

## 2. Typed chat

- connect the live socket
- send a simple typed message
- assistant response appears
- send a second typed message
- conversation order is correct
- composer stays fixed while thread scrolls

## 3. New chat reset

- click New Chat after at least one exchange
- old messages disappear
- input is empty
- fresh chat still works after reset

## 4. Study Vault

- saved session appears in the sidebar
- click a saved session
- correct session detail opens
- session selection highlight is correct

## 5. Create a pasted-text source

- create a new source from pasted text
- save succeeds
- app remains stable
- new source appears in Study Sources immediately

## 6. Source detail

- open the new source
- correct title is shown
- full content is shown
- chunk list is shown

## 7. Source search

- search for a real word from the source
- matching result appears
- result body text is visible
- chunk label is correct

Then also verify:
- nonsense query shows empty state
- Clear removes prior search state

## 8. File upload flow

- upload a valid `.txt` file
- upload a valid `.md` file
- save succeeds
- imported source appears in sidebar
- unsupported file type shows a clean error
- empty file shows a clean error

## 9. Voice flow

- browser microphone permission is allowed
- start voice input
- transcript is produced
- assistant responds
- UI returns to a stable idle state afterward

## 10. Camera / vision flow

- camera permission is allowed
- camera popup shows a live preview
- capture works
- snapshot preview appears
- vision request returns a response
- chat remains usable afterward

## 11. Stale state guard

- open one source successfully
- make the backend unavailable
- click another source
- old source content must not remain visible as if it loaded successfully
- the UI should show loading and then an error state

## 12. Mixed regression pass

Run one realistic mixed sequence:
- create a source
- ask a grounded typed question
- use voice input
- open an older session
- start a new chat
- open a source
- search inside it
- return to the live workspace

Expected result:
- no blank screens
- no stale data leaks
- no console errors
- no crashes

## Required green checks before merge

- backend tests pass
- frontend tests pass
- frontend production build passes
- manual checklist passes