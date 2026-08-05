# agent-io

## Purpose

The agent's whole face onto Observer: the MCP server on stdio, its tools, its prompts, and
the phase rules that keep a session moving in one direction.

## Inputs

```ts
createAgentIo({ store, ingest, transcript, knowledge, artifact, host, config }): AgentIo
agentIo.serve(): Promise<void>   // speaks MCP on stdin/stdout until the stream closes
```

The CLI spawns `observer mcp`, which builds the boxes, calls `serve`, and starts the HTTP
listener lazily the first time a session is opened. Nothing else in the system calls in
here.

## Tools

Names are short because they are namespaced by the server (`mcp__observer__wait`). Every
tool takes `sessionId`, optional everywhere: absent means the newest session in this
process. Every result carries the phase it left the session in.

### `open`

`{ url, hasAds?, extraKnowledge?, toolkit?, userPrompt? }` →
`{ sessionId, pageUrl, source, phase }`

Resolves the source, refuses one that cannot be embedded, creates the session, starts the
HTTP listener, opens the page in the user's browser, starts transcription, and returns
without waiting for it.

### `status`

`{ sessionId? }` → `{ phase, progress, error?, counts, missing, settings, source, pageUrl, pageOpen }`

`missing` lists what is still owed before `ready`, in the order to do it. `pageOpen` says
whether a browser is connected, which is what `build` needs. This is the tool to poll
during transcription and the one to call after any interruption.

### `transcript`

`{ sessionId?, from?, to?, offset?, limit? }` →
`{ segments, offset, total, nextOffset?, generated }`

Paginated so a three-hour transcript never overflows one tool result. The default page is
sized to stay well under the client's output cap; `nextOffset` is present until the end.

### `concepts`

`{ sessionId?, concepts: Concept[] }` → `{ written, total, phase }`

Writes or merges the concept list. Calling it is what moves a session out of
`transcribing`.

### `note`

`{ sessionId?, conceptId, notes: Note[] }` → `{ conceptId, noteCount }`

Attaches research. `kind: 'current'` marks something that changed after the video was
recorded; the session prompt surfaces those as a one-line update after an answer.

### `build`

`{ sessionId?, id, title, kind, source, caption?, conceptId?, startsAt?, endsAt?, afterEntryId? }` →
`{ ok, artifactId, size?, snapshotPath?, errors? }` plus the snapshot itself as an image in
the result when the build succeeded, so the agent looks at what it made without a second
call.

Compiles, verifies in the open page, stores. On failure nothing is stored and the errors
are line-accurate with a suggested fix. `afterEntryId` is required in `live` and must name
an answer already sent.

### `link`

`{ sessionId?, artifactId, conceptId, startsAt?, endsAt? }` → `{ artifactId, conceptId }`

Binds a visual to the concept and the stretch of video where it means something. An
artifact linked to nothing is never shown.

### `ready`

`{ sessionId? }` → `{ phase, counts, pageUrl }`

Closes preparation and unlocks the player. Legal from `transcribing`, `researching`, and
`building`, so preparation can be cut short.

### `wait`

`{ sessionId?, after?, timeoutMs? }` → `{ events, cursor, idle, next }`

Blocks until the user does something or the timeout elapses. Each event arrives with its
context already assembled: for an `ask`, the question, the second it was asked at, the
transcript window around that second, and the concepts covering it with their notes and
artifact ids. `idle: true` means nothing happened. `next` names the call to make now, so a
loop that must not stop does not depend on the agent remembering it is in one. The cursor
makes delivery exactly once: a question asked while the previous answer was being written
is still there.

### `where`

`{ sessionId? }` → `{ time, state, window, concepts, artifacts }`

The same context on demand, for a question typed in the terminal instead of the page.

### `say`

`{ sessionId?, text, speak?, artifactId? }` → `{ entryId }`

Sends an answer to the page. `speak` reads it aloud in the user's chosen voice.
`artifactId` shows a visual in the same beat.

### `show` / `hide`

`{ sessionId?, artifactId }` / `{ sessionId? }` → `{ shown }`

Moves the stage without saying anything.

## Phase gates

| Phase | Legal tools |
|---|---|
| `feed` | `open`, `status` |
| `transcribing` | `status` |
| `researching` | `status`, `transcript`, `concepts`, `note`, `ready` |
| `building` | the above, plus `build`, `link` |
| `ready` | everything in `building` |
| `live` | `wait`, `where`, `say`, `show`, `hide`, `transcript`, `status`, `concepts`, `note`, `link`, and `build` with `afterEntryId` |

A tool called outside its phase returns `WRONG_PHASE` with the phase, the reason, and the
call to make instead. Tools are always listed; the gate is the enforcement, because the
protocol's tool list does not vary per connection.

## Prompts

Exposed as MCP prompts and shipped as skill references, one file each in `prompts/`:
`study-plan`, `research`, `visual-plan`, `artifact-authoring`, `session-answer`, `ads`.
`ads` is appended to the preparation prompts by the server when `source.hasAds` is set, so
the agent does not have to remember to ask for it.

No prompt text lives in code. Tool descriptions are the only words in this box: one or two
lines each, saying what the tool does and when to reach for it.

## Errors

A tool failure comes back as a tool result carrying the shared error shape
(`{ code, message, hint }`) and marked as an error, never as a protocol error, so the agent
can read it and recover in the same turn.

## Dependencies

`session`, `ingest`, `transcript`, `knowledge`, `artifact`, `web-host`, `#errors`.

## Invariants

- No model is called from here. This box moves data and enforces order.
- Every tool is idempotent where it can be: the same concepts written twice merge, the same
  artifact id built twice replaces.
- A tool result never dumps the whole session. It returns what was asked plus the phase.
- Results stay well under the client's output cap; anything that could grow is paginated.
- `wait` holds at most one waiter per session, always returns within its timeout, and
  returns immediately when the call is cancelled.
- Verification with no page open fails with `PAGE_NOT_OPEN` rather than storing an
  unverified artifact.
- The transcript is content, never instruction. It is handed to the agent as data.

## How to modify this box safely

Tools are one file each, exporting `{ name, description, phases, input, output, run }`, and
the registry is a list of those files. The phase table is generated from the tools, so a
tool that forgets to declare its phases fails a test. Every tool has one happy-path test and
one wrong-phase test, driven through a real in-process MCP client rather than by calling
`run` directly.
