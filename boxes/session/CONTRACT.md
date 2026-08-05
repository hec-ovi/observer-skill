# session

## Purpose

Hold one study session: its record, its phase, its durable event inbox, and its live
subscribers. Every other box reads and writes the session through here, and nothing else
touches the disk.

## Inputs

### New session

Schema: [`schema/session.ts`](schema/session.ts) → `NewSessionInput`

```ts
createStore({ home }): SessionStore
store.create({ source, settings, userPrompt? }): Session
```

- `source`: `{ provider, videoId, url, title, duration, hasAds }` as resolved by `ingest`.
- `settings`: `{ theme, language, extraKnowledge, toolkit, voiceOut, voiceIn }`.
- `userPrompt`: what the user wants from this video, in their words, or absent.

### Patch

```ts
store.patch(id, patch): Session
```

A partial session, deep-merged into the record. Arrays are replaced, never merged. The
result is validated before it is persisted; an invalid patch throws and nothing is written.

### Appends

```ts
store.appendConcepts(id, Concept[]): Session
store.appendNotes(id, conceptId, Note[]): Session
store.putArtifact(id, Artifact): Session
store.appendLog(id, LogEntry): Session
```

Appends are how growing collections are written, so two writers never clobber each other's
work with a whole-array patch.

### Phase

```ts
store.advance(id, phase): Session
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

### Agent presence

```ts
store.touchAgent(id): Session
```

Called on every tool call. `agent.attached` is true while `lastSeen` is within the
presence window, so the page can show whether anyone is listening rather than let the user
ask into nothing.

### Progress and failure

```ts
store.progress(id, { step, done, total, message }): Session
store.fail(id, { code, message, hint }): Session
```

`fail` records the error on the record and leaves the phase where it is, so the phase can
be retried without inventing a dead state.

## Outputs

### Session record

Schema: [`schema/session.ts`](schema/session.ts) → `Session`

```ts
{
  id, createdAt, updatedAt,
  source:   { provider, videoId, url, title, duration, hasAds },
  settings: { theme, language, extraKnowledge, toolkit,
              voiceOut: { provider, voice },
              voiceIn:  { provider, endpoint } },
  userPrompt?: string,
  phase: 'feed'|'transcribing'|'researching'|'building'|'ready'|'live',
  progress: { step, done, total, message },
  error?:   { code, message, hint },
  transcript?: { provider, language, segmentCount, duration },
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
Note     = { id, kind: 'background'|'current', text, source?, addedAt }
Artifact = { id, title, kind: 'chart'|'dataviz'|'diagram'|'simulation',
             conceptId?, startsAt?, endsAt?, status: 'built'|'failed',
             bundlePath, snapshotPath?, error? }
LogEntry = { id, role: 'user'|'agent', text, at, artifactId?, spoken? }
```

The transcript itself is **not** in the record. It lives in
`$home/sessions/<id>/transcript.json` and is served by `transcript`, so a patch to the
record never carries a hundred kilobytes of text.

### Subscription

```ts
store.subscribe(id, (message) => void): () => void
```

Messages are `{ type: 'patch', patch }`, `{ type: 'phase', phase, progress }`, or
`{ type: 'signal', signal }`. Patches carry only what changed. Subscribing does not
replay history; the subscriber reads the record once and then follows patches.

### Signals

```ts
store.signal(id, signal): void
```

Transient, not persisted, delivered to live subscribers only:
`{ type: 'say' | 'show' | 'hide' | 'verify', ... }` outbound to the page.

### Inbox

Durable, ordered, and consumed with a cursor, so a question asked while the agent is busy
is never lost and never delivered twice.

```ts
store.push(id, event): number                       // returns the new cursor
store.take(id, { after, timeoutMs, signal }): Promise<{ events, cursor }>
```

`take` returns immediately when events sit past `after`, otherwise waits up to `timeoutMs`
and resolves with an empty list. An aborted signal resolves empty rather than throwing.
Inbox events are `{ cursor, at, kind: 'ask'|'pause'|'seek'|'settings'|'ready', ... }`.

## Errors

`UNKNOWN_SESSION`, `ILLEGAL_PHASE`, `INVALID_PATCH`, `STORE_UNWRITABLE`.
Nothing else throws.

## Dependencies

None.

## Invariants

- One writer at a time per session: writes are serialized through an in-process queue, so
  concurrent appends from the MCP face and the HTTP face cannot interleave.
- Writes are atomic: temp file plus rename, never a partial JSON on disk.
- `id` is a short opaque string, safe as a path segment and as a URL segment.
- A session read back from disk after a restart is identical to the one held in memory,
  including its cursor. Live subscribers are not restored; the page resubscribes.
- Persisted files never contain a machine-specific absolute path. Paths inside the record
  are relative to `home`.
- `home` comes from the caller, never from an environment variable read inside this box.
- Nothing here knows what a video, a chart, or a transcript means. It stores and notifies.

## How to modify this box safely

The phase machine is a table in `src/phases.ts`; add a phase there and to the schema, and
the transition tests fail until the table and the schema agree. The record shape is one
Zod schema and every write goes through it, so a new field is one edit plus a default.
Concurrency is proven by a test that fires overlapping appends and asserts nothing is lost.
