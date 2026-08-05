# transcript

## Purpose

Turn a source into timed text the agent can read and the page can follow, and answer "what
was being said at second N" without a scan.

## Inputs

Schema: [`src/schema.ts`](src/schema.ts)

```ts
fetch(source, { home, sessionId, provider?, language?, file?, onProgress }): Promise<TranscriptRef>
```

- `provider`: one of the providers below, or `auto` (the default), which tries them in
  order and stops at the first that produces text.
- `file`: path to the SRT or VTT the `file` provider reads. The other providers ignore it.
- `onProgress({ step, done, total, message })` fires often enough for a loader to move on a
  three-hour podcast, and the totals are real, not invented.

```ts
read(sessionId, { from?, to?, offset?, limit? }): TranscriptPage
at(sessionId, time, { back = 90, forward = 30 }): TranscriptWindow
```

## Outputs

```ts
TranscriptRef    = { provider, language, segmentCount, duration, generated }
Segment          = { i, start, end, text }
TranscriptPage   = { segments: Segment[], offset, total, nextOffset? }
TranscriptWindow = { at, segment, before: Segment[], after: Segment[], text }
```

- `generated` is true for machine captions and ASR, false for captions a human wrote. The
  agent needs to know how much to trust the words.
- `TranscriptWindow.text` is the window already flattened into readable prose with a
  timestamp marker at the pause point, so the agent reads one string instead of assembling
  one.

The transcript file lives at `$home/sessions/<id>/transcript.json` and is the only copy.

## Errors

- `NO_TRANSCRIPT`: no captions and no ASR endpoint configured.
- `TRANSCRIPT_FAILED`: the provider ran and could not produce text; the hint names the
  provider and what it said.
- `PROVIDER_UNAVAILABLE`: the binary, endpoint, or file this provider needs is missing.
- `STORE_UNWRITABLE`: the words came back but `home` would not take them.
- `UNKNOWN_SESSION`

## Providers

| Provider | Source of text | Needs |
|---|---|---|
| `captions` | The platform's own captions, human first, machine second | the caption fetcher binary |
| `innertube` | The same captions through the platform's own transcript panel | nothing |
| `endpoint-asr` | Audio, extracted and sent to an OpenAI-compatible transcription route | the caption fetcher binary, ffmpeg, an endpoint |
| `file` | An SRT or VTT the user supplies | nothing |

`auto` tries them in that order and stops at the first that produces text. The two caption
providers take different routes to the same words, and each works in cases where the other
is blocked, which is why both exist. A machine gets a transcript with nothing installed;
installing the fetcher binary raises the hit rate.

## Invariants

- Segments are ordered by `start`, never overlap, and never repeat text. Rolling machine
  captions arrive as overlapping windows that restate the previous line; the normalizer
  removes the repetition and keeps every word exactly once. This is the one thing this box
  must get right, and it has its own fixtures.
- Segments are sentences where the text allows it, not caption frames. A sentence that
  spans three caption frames is one segment with the first frame's start and the last
  frame's end.
- Times are seconds as floats, relative to the video, and match what the player reports.
- `at` is O(log n) and does no I/O beyond the one cached file.
- Nothing here labels ads, concepts, or importance. It produces text and times.
- A long video streams to disk as it is produced; the whole transcript is never held twice
  in memory.

## Dependencies

`ingest` (for the source it is given).

## How to modify this box safely

Every provider produces `Segment[]` and nothing else, so a new one is a file plus a
registry line. The normalizer is pure and tested against recorded fixtures: a human caption
track, a rolling machine track with the classic duplication, a track with music and
applause markers, a track with a fifteen-minute gap, a rolling VTT, an SRT, a transcript
panel payload, and a two-chunk speech-recognition stitch. Add a fixture before touching it.
The binaries and the network are faked at their own boundary, so the tests never leave the
machine.
