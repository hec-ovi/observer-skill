# session

## Purpose

Hold one study session: its record, its phase, its event inbox, and its live
subscribers. Every other box reads and writes the session through here, and nothing else
touches the disk.

Every call that changes the record returns a promise, and that promise resolves only once
the change is on disk.

## Inputs

### New session

Schema: [`src/schema.ts`](src/schema.ts) → `NewSessionInput`

```ts
createStore({ home }): SessionStore
store.create({ source, settings, userPrompt? }): Promise<Session>
```

- `source`: the video exactly as `ingest` resolved it. Everything it learned is kept: the
  research pass reads `publishedAt` to find what has moved since the recording, and
  `hasCaptions` decides which transcript provider runs first. Unknown fields are `null`, so
  a degraded lookup is never read as a no.
- `settings`: `{ theme, language, extraKnowledge, toolkit, voiceOut, voiceIn }`. Every field
  has a default, so `{}` is a complete answer.
- `userPrompt`: what the user wants from this video, in their words, or absent.

`home` comes from the caller. Records land in `$home/sessions/<id>/session.json`, beside
the transcript and the artifacts of the same session.

### Patch

```ts
store.patch(id, patch): Promise<Session>
```

A partial session, deep-merged into the record. Arrays are replaced, never merged. The
result is validated before it is persisted; an invalid patch throws and nothing is written.
A patch that changes nothing writes nothing and moves no timestamp.

`id`, `createdAt`, `updatedAt`, `cursor`, `phase` and `agent` belong to the store and are
refused here; they move through `advance`, `touchAgent` and `push`.

### Appends

```ts
store.appendConcepts(id, Concept[]): Promise<Session>
store.appendNotes(id, conceptId, Note[]): Promise<Session>
store.putArtifact(id, Artifact): Promise<Session>
store.appendLog(id, LogEntry): Promise<Session>
```

Appends are how growing collections are written, so two writers never clobber each other's
work with a whole-array patch.

- `appendConcepts` adds a concept whose id is new and patches one already there, so a
  second pass can widen a range without dropping the notes attached in the first.
- `appendNotes` on a concept the session does not have is `INVALID_PATCH`.
- `putArtifact` replaces the artifact with the same id, and rewrites `bundlePath` and
  `snapshotPath` as paths relative to `home`.
- `appendLog` assigns the entry's id; it is the last element of `log` in the returned
  record.

### Phase

```ts
store.advance(id, phase): Promise<Session>
```

Legal moves only. Anything else throws `ILLEGAL_PHASE`.

```
feed ──▶ transcribing ──┬──▶ researching ──┬──▶ building ──▶ ready ──▶ live
                        ├──────────────────┘                  ▲
                        └──────────────────────────────────────┘
```

`researching` is skipped when `settings.extraKnowledge` is false, `building` when
`settings.toolkit` is false. `ready` is reachable from `transcribing`, `researching`, and
`building`, which is how a preparation phase is cut short. `live` is entered once and does
not go back.

Advancing resets `progress` to the new phase and clears `error`, so the loader and the page
never show the phase that just ended.

### Agent presence

```ts
store.touchAgent(id): Promise<Session>
```

Called on every tool call. `agent.attached` is true while `lastSeen` is within the
presence window of ninety seconds, so the page can show whether anyone is listening rather
than let the user ask into nothing. It falls back to false on its own, and the drop reaches
subscribers as a patch.

### Progress and failure

```ts
store.progress(id, { step?, done?, total?, message? }): Promise<Session>
store.fail(id, { code, message, hint }): Promise<Session>
```

`progress` merges over what is already there, so a provider can move `done` alone. `fail`
records the error on the record and leaves the phase where it is, so the phase can be
retried without inventing a dead state.

## Outputs

### Session record

Schema: [`src/schema.ts`](src/schema.ts) → `Session`

```ts
store.get(id): Session          // throws UNKNOWN_SESSION
store.list(): Session[]         // newest first
```

```ts
{
  id, createdAt, updatedAt,
  source:   { provider, videoId, url, title, channel, duration, publishedAt,
              hasCaptions, captionLanguages, hasAds, embeddable, degraded },
  settings: { theme, language, extraKnowledge, toolkit,
              voiceOut: { provider, voice },
              voiceIn:  { provider, endpoint } },
  userPrompt: string | null,
  phase: 'feed'|'transcribing'|'researching'|'building'|'ready'|'live',
  progress: { step, done, total, message },
  error:      { code, message, hint } | null,
  transcript: { provider, language, segmentCount, duration } | null,
  concepts:  Concept[],
  artifacts: Artifact[],
  position:  { time, state },
  agent:     { attached, lastSeen },
  log:       LogEntry[],
  cursor:    number
}
```

```ts
Concept  = { id, label, kind: 'definition'|'equation'|'system'|'jargon',
             startsAt, endsAt, summary, notes: Note[], artifactIds: string[] }
Note     = { id, kind: 'background'|'current', text, source, addedAt }
Artifact = { id, title, kind: 'chart'|'dataviz'|'diagram'|'simulation',
             conceptId, startsAt, endsAt, status: 'built'|'failed',
             bundlePath, snapshotPath, error }
LogEntry = { id, role: 'user'|'agent', text, at, artifactId, spoken }
```

A field that has no value is `null`, never missing, so the JSON on disk reads back as the
object that was written. Ids, timestamps and defaults are filled in here: a caller writes
what it knows.

The transcript itself is **not** in the record. It lives in
`$home/sessions/<id>/transcript.json` and is served by `transcript`, so a patch to the
record never carries a hundred kilobytes of text.

### Subscription

```ts
store.subscribe(id, (message) => void): () => void
```

Messages are `{ type: 'patch', patch }`, `{ type: 'phase', phase, progress }`, or
`{ type: 'signal', signal }`. Patches carry only what changed. A write that moves the phase
or the progress sends both a patch and a phase message. Subscribing does not replay
history; the subscriber reads the record once and then follows patches.

### Signals

```ts
store.signal(id, signal): void
```

Transient, not persisted, delivered to live subscribers only:
`{ type: 'say' | 'show' | 'hide' | 'verify', ... }` outbound to the page.

### Inbox

Ordered and consumed with a cursor, so a question asked while the agent is busy waits for
it and is never delivered twice.

```ts
store.push(id, event): Promise<number>                      // the new cursor
store.take(id, { after?, timeoutMs?, signal? }): Promise<{ events, cursor }>
```

`take` returns immediately when events sit past `after`, otherwise waits up to `timeoutMs`
(thirty seconds by default) and resolves with an empty list and the cursor it was given. An
aborted signal resolves empty rather than throwing, and leaves no timer or listener behind.
Inbox events are `{ cursor, at, kind: 'ask'|'pause'|'seek'|'settings'|'ready', ... }`, where
`at` is the second of the video the user was on.

Events live in this process, and a restart starts with an empty inbox: a `seek` or a `pause`
from before it points at a moment the user has already left, and the page pushes what it
still wants once it reconnects. The cursor is on the record, so a restart never hands out one
twice.

### Shutdown

```ts
store.close(): Promise<void>
```

Lands what is owed, drops the presence timers, and releases anyone waiting on an inbox.

## Errors

`UNKNOWN_SESSION`, `ILLEGAL_PHASE`, `INVALID_PATCH`, `STORE_UNWRITABLE`.
Nothing else throws. Anything that does not fit a schema is `INVALID_PATCH` with the field
named.

## Dependencies

None.

## Invariants

- One writer at a time per session: writes are serialized through an in-process queue, so
  concurrent appends from the MCP face and the HTTP face cannot interleave.
- Writes are atomic: temp file, fsync, rename, never a partial JSON on disk. A burst of
  changes lands as one write, and every write lands before its call resolves.
- `id` is a short opaque string, safe as a path segment and as a URL segment.
- Records handed out are deeply frozen. A reader cannot corrupt the store by accident.
- A session read back from disk after a restart is identical to the one held in memory,
  including its cursor. Live subscribers and pending inbox events are not restored; the page
  resubscribes and pushes again.
- Persisted files never contain a machine-specific absolute path. Paths inside the record
  are relative to `home`.
- `home` comes from the caller, never from an environment variable read inside this box.
- Nothing here knows what a video, a chart, or a transcript means. It stores and notifies.

## How to modify this box safely

The phase machine is a table in `src/phases.ts`, typed as a full map of every phase, so a
phase added to the schema and forgotten in the table fails the type check. The record shape
is one Zod schema in `src/schema.ts` and every write goes through it, so a new field is one
edit plus a default. Concurrency is proven by a test that fires overlapping appends and
asserts nothing is lost.

Tests live in `test/` and share `fixtures.ts` at the box root, which sits outside `test/`
because the node runner counts every file under a `test/` directory as a test. `one-shot.ts`
sits beside it: a test spawns it as a caller that creates a session and exits, which is how
the owed write is proven to land with nothing else holding the loop open.
Run them with `node --test "boxes/session/test/*.test.ts"`.
