# knowledge

## Purpose

Keep what the agent worked out about the video: the concepts, their notes, and which
visual explains which. Answer "what covers this second" fast enough to sit inside a pause.

## Inputs

Schema: [`src/schema.ts`](src/schema.ts)

```ts
createKnowledge({ store }): Knowledge
```

```ts
writeConcepts(sessionId, Concept[]): Promise<Concept[]>
addNote(sessionId, conceptId, Note): Promise<Concept>
linkArtifact(sessionId, conceptId, artifactId, range?): Promise<Concept>
```

Every write resolves once `session` has it on disk. The stored shapes come back as `session`
holds them: `Concept` with its id, notes and artifact ids, so the caller reads the ids of
what it just wrote.

- `Concept`: `{ label, kind, startsAt, endsAt, summary? }`. The id is assigned here, derived
  from the label so the same concept written twice is the same concept. Case, spacing and
  punctuation are noise: "Back-Propagation" and "back propagation" are one concept.
- `Note`: `{ kind: 'background'|'current', text, source? }`. `current` marks something that
  changed after the video was recorded.
- `range` on a link overrides the concept's own range for when that artifact is relevant.
  Linking a visual that is already bound to another concept moves it: it leaves the list of
  the concept it was on and joins the new one, with the range given here or none.

`writeConcepts` merges: a concept whose label already exists has its range widened, its
summary and kind replaced by what the new pass says, and keeps its notes and links. A
summary left out keeps the one already stored. That is what lets the agent write the list
in passes without losing the research attached to the first pass.

## Outputs

```ts
at(sessionId, time): { concepts: Concept[], artifacts: Artifact[] }
byLabel(sessionId, label): Concept | null
jargon(sessionId): Concept[]
all(sessionId): Concept[]
```

- `at` returns concepts whose range covers `time`, tightest range first, so the most
  specific thing the user could be asking about is the first thing read. Both ends count, so
  a second where one range ends and the next begins reads both. Equal spans go to the
  earlier one, then to the lower id. Artifacts are those linked to those concepts, in the
  order they were built, minus any whose link range does not cover `time`.
- `jargon` is the fast-iteration list: every `jargon` concept with its one-line summary,
  ordered by first appearance.
- Reads are synchronous: they answer from the record `session` already holds.

## Errors

- `UNKNOWN_SESSION`
- `UNKNOWN_CONCEPT`
- `UNKNOWN_ARTIFACT`: a link to a visual this session never built.
- `RANGE_OUT_OF_BOUNDS`: a concept or link range that falls outside the video's duration.
- `INVALID_CONCEPT`: missing label, unknown kind, `endsAt` before `startsAt`, or a note
  without a kind of `background` or `current` and some text.

## Dependencies

`session` (the record is where concepts live).

## Invariants

- A concept's range sits inside `[0, source.duration]`. So does a link range.
- Notes are appended and never edited. A later note that contradicts an earlier one wins by
  being later, and both stay, because the agent reads them in order.
- A visual is on one concept at a time, the one its last link named.
- Concept writes on one session take turns. A link, a note and a second research pass fired
  together all land: a link writes artifact ids only, a pass writes range, kind and summary
  only, so neither erases the other's work.
- `at` is a pure function of the stored concepts. It performs no I/O and is safe to call on
  every position event.
- Ordering is deterministic: same concepts and same second always give the same list.
- Nothing here judges what a concept is worth. It stores what the agent decided.

## How to modify this box safely

`at` is the hot path and has its own test with overlapping ranges, touching ranges, and a
concept spanning the whole video. Keep it allocation-light and keep it pure: the sorted
index in `src/timeline.ts` is built once per record and reused by every lookup, so a change
that sorts inside `at` is a change in the wrong direction.

Writes that read the record before writing it back (widening a range, adding an artifact id)
run one at a time per session through `src/queue.ts`, and each one re-reads inside its turn.
The taking of turns lives in the `Knowledge` object, so one store gets one `Knowledge`.

Ids come from `src/ids.ts` and are stable by construction: normalize the label, then a
digest of the normalized form. Changing that normalization renames every concept already on
disk, so treat it as a data migration.

Tests live in `test/` and share `fixtures.ts` at the box root, which sits outside `test/`
because the node runner counts every file under a `test/` directory as a test.
Run them with `node --test "boxes/knowledge/test/*.test.ts"`.
