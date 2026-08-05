# agent-io

## Purpose

The agent's whole face onto Observer: the MCP server on stdio, its tools, its prompts, and
the phase rules that keep a session moving in one direction.

## Inputs

```ts
createAgentIo({ store, ingest, transcript, knowledge, artifact, host, config }): AgentIo
agentIo.serve(): Promise<void>   // speaks MCP on stdin/stdout until the stream closes
agentIo.openSession(input): Promise<Session>
```

`config` is `{ home, transcript, openBrowser, version? }`: where sessions live, which
transcript provider to ask for, whether to put the page in front of the user, and what to
report as the server version.

The CLI spawns `observer mcp`, which builds the boxes, calls `serve`, and starts the HTTP
listener lazily the first time a session is opened. The one other call in is `openSession`,
which the CLI hands to `web-host` so the page can open a video by itself.

### `openSession`

```ts
openSession({ url, hasAds?, settings?, userPrompt?, openBrowser? }): Promise<Session>
```

The `open` tool without the tool: the page has its own feed screen, and `web-host` takes a
`createSession` handler for `POST /api/session` that it cannot satisfy itself. This is it.
`settings` is a `SettingsPatch`, so anything left out keeps its default; `openBrowser`
overrides the process setting, which the page passes as `false` because the user is already
looking at it.

Both ways in run the same code, so a session opened from the page is the session the tool
would have made: same phase, same transcription run behind it, and `status` with no
`sessionId` finds it, because it is the newest session in the process.

Wiring it is a closure, not a value: `web-host` is built before `agent-io` and `agent-io`
holds the host, so the CLI passes
`createSession: (input) => agentIo.openSession({ ...input, openBrowser: false })`.

## Tools

Names are short because they are namespaced by the server (`mcp__observer__wait`). Every
tool takes `sessionId`, optional everywhere: absent means the newest session in this
process. Every result carries the phase it left the session in.

### `open`

`{ url, hasAds?, extraKnowledge?, toolkit?, userPrompt? }` →
`{ sessionId, pageUrl, source, phase }`

Resolves the source, refuses one that cannot be embedded, creates the session, starts the
HTTP listener, opens the page in the user's browser, starts transcription, and returns
without waiting for it. The same path as `openSession`, which is what the page calls.

Where the session goes once the words are in follows the switches as they read at that
moment, not as they read here: the user can flip them in the page while transcription runs.

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
`generated` comes off the record, so a respawned server still knows a human wrote the words.

### `concepts`

`{ sessionId?, concepts: Concept[] }` → `{ written, total, phase }`

Writes or merges the concept list. Calling it is what moves a session out of
`transcribing`.

### `note`

`{ sessionId?, conceptId, notes: Note[] }` → `{ conceptId, noteCount }`

Attaches research. `kind: 'current'` marks something that changed after the video was
recorded; the session prompt surfaces those as a one-line update after an answer.

### `build`

`{ sessionId?, id, title, kind, source, conceptId?, startsAt?, endsAt?, afterEntryId? }` →
`{ ok, artifactId, size?, snapshotPath?, errors? }` plus the snapshot itself as an image in
the result when the build succeeded, so the agent looks at what it made without a second
call.

Compiles, verifies in the open page, stores. Nothing usable is stored on failure: a module
that does not compile never reaches the record, and one the page rejects is kept as failed
with the reason, never as a visual that can be shown. Errors are line-accurate with a
suggested fix. `conceptId` links it in the same call, with `startsAt`/`endsAt` as the link's
range. `afterEntryId` is required in `live` and must name an answer already sent.

The first `build` of a session opens the visual pass, the way the first `wait` starts the
session: nothing else moves a session out of the reading pass.

A session whose `toolkit` setting is off builds nothing, in any phase: the switch is the
user's, and the refusal names `ready` or `say` as the call to make instead.

### `link`

`{ sessionId?, artifactId, conceptId, startsAt?, endsAt? }` → `{ artifactId, conceptId }`

Binds a visual to the concept and the stretch of video where it means something. An
artifact linked to nothing is never shown.

`startsAt` and `endsAt` come as a pair or not at all, here and in `build`. Neither means the
link is offered across the whole concept; one alone is refused with `INVALID_PATCH` rather
than read as none, which would widen the range already stored instead of narrowing it.

### `ready`

`{ sessionId? }` → `{ phase, counts, pageUrl }`

Closes preparation and unlocks the player. Legal from `researching` and `building`, so
preparation can be cut short at either pass.

### `wait`

`{ sessionId?, after?, timeoutMs? }` → `{ events, cursor, idle, next }`

The first `wait` is what starts the session: called in `ready`, it moves the session to
`live` and then blocks. Starting is idempotent, so two waits arriving together both block on
the inbox instead of one of them losing a race. Blocks until the user does something or the
timeout elapses. The
default block is 45 seconds and the ceiling is 60, both under the ninety-second presence
window, so a blocked agent never reads as a detached one. Each event arrives with its
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
| `researching` | `status`, `transcript`, `concepts`, `note`, `build`, `ready` |
| `building` | the above, plus `link` |
| `ready` | everything in `building` except `ready`, plus `wait` |
| `live` | `wait`, `where`, `say`, `show`, `hide`, `transcript`, `status`, `concepts`, `note`, `link`, and `build` with `afterEntryId` |

The table is generated from what the tools declare, so it cannot drift from them. Two
settings narrow it further: `build` is refused whatever the phase when `toolkit` is off, and
`researching` is skipped entirely when `extraKnowledge` is off.

A tool called outside its phase returns `WRONG_PHASE` with the phase, the reason, and the
call to make instead. Tools are always listed; the gate is the enforcement, because the
protocol's tool list does not vary per connection.

`open` is the one call the gate does not apply to: it acts on the session it creates, which
is in `feed` by construction, so a second video is always openable.

## Prompts

Exposed as MCP prompts and shipped as skill references, one file each in `prompts/`:
`study-plan`, `research`, `visual-plan`, `artifact-authoring`, `session-answer`, `ads`.
`ads` is appended to the preparation prompts by the server when `source.hasAds` is set, so
the agent does not have to remember to ask for it.

The directory is `../prompts/` beside the module in the source layout and `./prompts/` in
the published one, first that exists, overridden by `OBSERVER_PROMPTS`. They are read once
at startup, so a broken install says so before the first tool call.

No prompt text lives in code. Tool descriptions are the only words in this box: one or two
lines each, saying what the tool does and when to reach for it.

## Errors

A tool failure comes back as a tool result carrying the shared error shape
(`{ code, message, hint }`) and marked as an error, never as a protocol error, so the agent
can read it and recover in the same turn. `openSession` has no tool result to put an error
in, so it throws the same shape, which is what `web-host` turns into a status.

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
- Settings are read from the record at the moment they are acted on. The user can flip a
  switch at any time, including mid-transcription, and the session still moves.
- There is one open path. The tool and `openSession` are the same call, so a session cannot
  start in two slightly different shapes.

## How to modify this box safely

Tools are one file each, exporting `{ name, description, phases, input, output, run }`, and
`src/tools/registry.ts` is the list of them. The phase table is generated from the tools, so
a tool that forgets to declare its phases fails a test. Every tool has one happy-path test
and one wrong-phase test, driven through a real in-process MCP client rather than by calling
`run` directly.

`src/api.ts` is the surface `createAgentIo` returns, built on one runtime; `fixtures.ts`
builds it the same way, so a test drives the exported `openSession` and the MCP client
against the same sessions.

Nothing in this box writes to stdout: stdout is the protocol, and every diagnostic goes
through `src/report.ts` to stderr.

Tests live in `test/` and share `fixtures.ts` at the box root, which sits outside `test/`
because the node runner counts every file under a `test/` directory as a test. Run them with
`node --test "boxes/agent-io/test/*.test.ts"`.
