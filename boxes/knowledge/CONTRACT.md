# knowledge

## Purpose

Keep what the agent worked out about the video: the concepts, their notes, and which
visual explains which. Answer "what covers this second" fast enough to sit inside a pause.

## Inputs

Schema: [`schema/knowledge.ts`](schema/knowledge.ts)

```ts
writeConcepts(sessionId, Concept[]): Concept[]
addNote(sessionId, conceptId, Note): Concept
linkArtifact(sessionId, conceptId, artifactId, range?): Concept
```

- `Concept`: `{ label, kind, startsAt, endsAt, summary }`. The id is assigned here, derived
  from the label so the same concept written twice is the same concept.
- `Note`: `{ kind: 'background'|'current', text, source? }`. `current` marks something that
  changed after the video was recorded.
- `range` on a link overrides the concept's own range for when that artifact is relevant.

`writeConcepts` merges: a concept whose label already exists has its range widened and its
summary replaced, and keeps its notes and links. That is what lets the agent write the list
in passes without losing the research attached to the first pass.

## Outputs

```ts
at(sessionId, time): { concepts: Concept[], artifacts: Artifact[] }
byLabel(sessionId, label): Concept | null
jargon(sessionId): Concept[]
all(sessionId): Concept[]
```

- `at` returns concepts whose range covers `time`, tightest range first, so the most
  specific thing the user could be asking about is the first thing read. Artifacts are
  those linked to those concepts, in the order they were built.
- `jargon` is the fast-iteration list: every `jargon` concept with its one-line summary,
  ordered by first appearance.

## Errors

- `UNKNOWN_SESSION`
- `UNKNOWN_CONCEPT`
- `RANGE_OUT_OF_BOUNDS`: a concept range that falls outside the video's duration.
- `INVALID_CONCEPT`: missing label, unknown kind, or `endsAt` before `startsAt`.

## Dependencies

`session` (the record is where concepts live).

## Invariants

- A concept's range sits inside `[0, source.duration]`.
- Notes are appended and never edited. A later note that contradicts an earlier one wins by
  being later, and both stay, because the agent reads them in order.
- `at` is a pure function of the stored concepts. It performs no I/O and is safe to call on
  every position event.
- Ordering is deterministic: same concepts and same second always give the same list.
- Nothing here judges what a concept is worth. It stores what the agent decided.

## How to modify this box safely

`at` is the hot path and has its own test with overlapping ranges, touching ranges, and a
concept spanning the whole video. Keep it allocation-light and keep it pure.
