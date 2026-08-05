# agent-io

## Purpose

The agent's whole face onto Observer: the MCP server, its tools, its prompts, and the phase
rules that keep a session moving in one direction.

## Inputs

```ts
createAgentIo({ store, ingest, transcript, knowledge, artifact, host }): { handler, server }
```

`handler` is mounted by `web-host` at `/mcp`. Nothing else in the system calls into here.

## Tools

Every tool takes `sessionId` except `observer_open`, and every result carries the phase it
left the session in, so the agent always knows where it stands without a second call.

### `observer_open`

`{ url, hasAds?, extraKnowledge?, toolkit?, userPrompt? }` →
`{ sessionId, pageUrl, source, phase, transcript: { provider, expected } }`

Resolves the source, refuses one that cannot be embedded, creates the session, starts
transcription, and returns immediately. Transcription progress is read with
`observer_status`. If the user already opened a session in the page, the agent attaches to
it with the id shown there instead of calling this.

### `observer_status`

`{ sessionId }` → `{ phase, progress, error?, counts: { segments, concepts, notes, artifacts }, missing: string[], settings, source }`

`missing` is the list of things still owed before `ready`, in the order to do them. This is
the tool the agent polls during transcription, and the one it uses to recover after any
interruption.

### `observer_transcript`

`{ sessionId, from?, to?, offset?, limit? }` →
`{ segments, offset, total, nextOffset?, generated }`

The whole transcript is read in pages during preparation. `from`/`to` in seconds is how a
specific stretch is re-read later.

### `observer_concepts`

`{ sessionId, concepts: Concept[] }` → `{ written, total, phase }`

Writes or merges the concept list. Called during `researching` and `building`. Calling it
is what moves a session out of `transcribing`.

### `observer_note`

`{ sessionId, conceptId, notes: Note[] }` → `{ conceptId, noteCount }`

Attaches research. `kind: 'current'` marks something that changed after the video was
recorded, which the session prompt surfaces as a one-line update after an answer.

### `observer_artifact_build`

`{ sessionId, id, title, kind, source, conceptId?, startsAt?, endsAt?, afterEntryId? }` →
`{ ok, artifactId, snapshotPath?, size?, errors? }`

Builds, then verifies in the open page, then stores. On failure the errors are
line-accurate with a suggested fix and nothing is stored. `snapshotPath` is a PNG on disk
the agent reads as an image to check the result looks right.

`afterEntryId` is required in `live` and must name an answer already sent. That is the
mechanism behind the rule that a user waiting on a question is never waiting on a compiler.

### `observer_ready`

`{ sessionId }` → `{ phase, counts, pageUrl }`

Closes preparation and unlocks the player. Legal from `transcribing`, `researching`, or
`building`, so preparation can be cut short.

### `observer_wait`

`{ sessionId, after?, timeoutMs? }` →
`{ events: Event[], cursor, idle, next }`

Blocks until something happens or the timeout elapses. Each event arrives with its context
already assembled: for an `ask`, the question, the second it was asked at, the transcript
window around that second, and the concepts covering it with their notes and artifacts.
`idle: true` means nothing happened and the agent calls again. The cursor makes delivery
exactly once, so a question asked while the agent was answering the previous one is still
there. `next` names the call to make now (`observer_wait` with the returned cursor, until
the user ends the session), because a loop that must not stop should not depend on the
agent remembering that it is in one.

### `observer_where`

`{ sessionId }` → `{ time, state, window, concepts, artifacts }`

The same context on demand, for when the user types in the terminal instead of the page.

### `observer_say`

`{ sessionId, text, speak?, artifactId? }` → `{ entryId }`

Sends an answer. `speak` reads it aloud through the user's chosen voice. `artifactId` shows
a visual with it, in the same beat.

### `observer_show` / `observer_hide`

`{ sessionId, artifactId }` / `{ sessionId }` → `{ shown }`

Moves the stage without saying anything.

## Prompts

Exposed as MCP prompts and shipped as skill references, one file each in `prompts/`:
`study-plan`, `research`, `visual-plan`, `artifact-authoring`, `session-answer`, `ads`.
`ads` is appended by the server to the preparation prompts when `source.hasAds` is set, so
the agent does not have to remember to ask for it.

No prompt text lives in code. The tool descriptions are the only words in this box, and
they say what a tool does and when to reach for it, in one or two lines each.

## Phase gates

| Phase | Legal tools |
|---|---|
| `feed` | `observer_open` |
| `transcribing` | `observer_status` |
| `researching` | `observer_status`, `observer_transcript`, `observer_concepts`, `observer_note`, `observer_ready` |
| `building` | the above, plus `observer_artifact_build`, `observer_ready` |
| `ready` | `observer_status`, `observer_transcript`, everything in `building` |
| `live` | `observer_wait`, `observer_where`, `observer_say`, `observer_show`, `observer_hide`, `observer_transcript`, `observer_status`, `observer_artifact_build` with `afterEntryId` |

A tool called outside its phase returns `WRONG_PHASE` with the phase, the reason, and the
call to make instead. Tools are always listed; the gate is the enforcement.

## Errors

The shared closed set: `BAD_SOURCE`, `SOURCE_UNAVAILABLE`, `SOURCE_NOT_EMBEDDABLE`,
`NO_TRANSCRIPT`, `TRANSCRIPT_FAILED`, `WRONG_PHASE`, `UNKNOWN_SESSION`, `UNKNOWN_CONCEPT`,
`UNKNOWN_ARTIFACT`, `ARTIFACT_INVALID`, `PAGE_NOT_OPEN`, `PROVIDER_UNAVAILABLE`,
`STORE_UNWRITABLE`. Every error carries `hint`, which names the next legal action.

## Dependencies

`session`, `ingest`, `transcript`, `knowledge`, `artifact`, `web-host`.

## Invariants

- No model is called from here. This box moves data and enforces order.
- Every tool is idempotent where it can be: writing the same concepts twice merges, building
  the same artifact id twice replaces.
- A tool result never dumps the whole session. It returns what was asked plus the phase.
- `observer_wait` holds at most one waiter per session and always returns within its
  timeout, including when the client disconnects.
- A verification attempted with no page open fails with `PAGE_NOT_OPEN` rather than storing
  an unverified artifact.
- Tool descriptions are short and behavioural. The long instructions live in prompts and in
  the skill, where they can be read once instead of on every tool list.

## How to modify this box safely

Tools are one file each, exporting `{ name, description, phases, input, output, run }`, and
the registry is a list of those files. The phase table is generated from the tools, so a
tool that forgets to declare its phases fails a test. Every tool has one happy-path test
and one wrong-phase test through a real in-process MCP client.
