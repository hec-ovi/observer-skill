# Tools

Every tool is `mcp__observer__<name>`. `sessionId` is optional everywhere and defaults to
the newest session, so you only pass it when juggling two videos. Every result carries the
phase it left the session in.

## Preparing

**`open`** `{ url, hasAds?, extraKnowledge?, toolkit?, userPrompt? }`
→ `{ sessionId, pageUrl, source, phase }`
Resolves the video, refuses one that cannot be embedded, opens the page in the user's
browser, and starts transcription without waiting for it. `source` carries `title`,
`duration`, `publishedAt`, and whether captions exist. `publishedAt` is what you compare
against today when looking for what has moved since.

**`status`** `{ sessionId? }`
→ `{ phase, progress, error?, counts, missing, settings, source, pageUrl, pageOpen }`
Poll this during transcription. `missing` lists what is still owed before `ready`, in order.
`pageOpen` tells you whether `build` can verify.

**`transcript`** `{ from?, to?, offset?, limit? }`
→ `{ segments, offset, total, nextOffset?, generated }`
Read it all in pages during preparation; use `from`/`to` in seconds to re-read a stretch
later. `generated: true` means machine captions or speech recognition, so the words are
approximate.

**`concepts`** `{ concepts: [{ label, kind, startsAt, endsAt, summary }] }`
→ `{ written, total, phase }`
`kind` is `definition`, `equation`, `system`, or `jargon`. Writing the same label twice
merges: the range widens, the summary is replaced, notes and links survive.

**`note`** `{ conceptId, notes: [{ kind, text, source? }] }`
→ `{ conceptId, noteCount }`
`kind` is `background` or `current`. `current` is for something that changed after the video
was recorded; those get surfaced as a one-line update after an answer.

**`build`** `{ id, title, kind, source, caption?, conceptId?, startsAt?, endsAt?, afterEntryId? }`
→ `{ ok, artifactId, size?, snapshotPath?, errors? }` plus the snapshot image itself when it
succeeded. Compiles, verifies in the open page, stores. Same `id` replaces. See
[artifacts.md](artifacts.md).

**`link`** `{ artifactId, conceptId, startsAt?, endsAt? }` → `{ artifactId, conceptId }`
An artifact linked to nothing is never shown.

**`ready`** `{}` → `{ phase, counts, pageUrl }`
Unlocks the player. Legal from any preparation phase, so you can cut preparation short.

## In session

**`wait`** `{ after?, timeoutMs? }` → `{ events, cursor, idle, next }`
Blocks until something happens. An `ask` event carries the question, the second it was asked
at, the transcript window around it, and the concepts covering it with their notes and
artifact ids. `idle: true` means call again with the cursor it returned. `next` always names
the call to make.

**`where`** `{}` → `{ time, state, window, concepts, artifacts }`
The same context on demand, for a question typed in the terminal.

**`say`** `{ text, speak?, artifactId? }` → `{ entryId }`
The answer. `speak` reads it aloud. `artifactId` shows a visual in the same beat. The
`entryId` is what `build` needs as `afterEntryId` if the user then asks to see something new.

**`show`** `{ artifactId }` / **`hide`** `{}` → `{ shown }`
Move the stage without saying anything.

## The one ordering rule

In a live session, `build` requires `afterEntryId`: the id of an answer you already sent. You
cannot compile while the user waits. Answer in text first, always.
