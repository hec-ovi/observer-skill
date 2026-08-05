# transcript

## Purpose

Turn a source into timed text the agent can read and the page can follow, and answer "what
was being said at second N" without a scan.

## Inputs

Schema: [`src/schema.ts`](src/schema.ts)

```ts
fetch(source, { home, sessionId, provider?, language?, file?,
                ytdlpBin?, ffmpegBin?, onProgress }): Promise<TranscriptRef>
```

- `provider`: one of the providers below, or `auto` (the default), which tries them in
  order and stops at the first that produces text.
- `file`: path to the SRT or VTT the `file` provider reads. The other providers ignore it.
- `ytdlpBin` (`yt-dlp`) and `ffmpegBin` (`ffmpeg`): the binaries to run. Named by the
  caller, because which ones this machine has is the process's business, not this box's.
- `onProgress({ step, done, total, message })` fires often enough for a loader to move on a
  three-hour podcast. `done` and `total` are seconds of the media: how much of the video is
  through, out of how long it is. A step that cannot know a duration sends both as zero and
  carries what it is doing in `message`, so nothing is invented. Speech recognition counts
  the seconds it has transcribed out of the audio's length; the transcript write counts the
  whole video once the words are on disk; the caption passes, the transcript panel, the
  subtitle file, and the audio download send zeros.

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
- A sound cue keeps its own segment and ends the sentence it interrupts, so no segment
  carries words from both sides of a music break.
- Times are seconds as floats, relative to the video, and match what the player reports.
  Per-word times from a provider are used only when those words spell out the cue's own
  text; a list of token pieces or one missing a word is spread over the cue's span instead.
- `at` is O(log n) and does no I/O beyond the one cached file.
- Nothing here labels ads, concepts, or importance. It produces text and times.
- A long video streams to disk as it is produced; the whole transcript is never held twice
  in memory.

## Dependencies

`ingest` (for the source it is given).

## How to modify this box safely

Every provider produces `Segment[]` and nothing else, so a new one is a file plus a
registry line. A provider that throws instead of answering is treated as one that failed,
so `auto` walks on. The normalizer is pure and tested against recorded fixtures: a human
caption track, a rolling machine track with the classic duplication, a track with music and
applause markers, a track whose speech run is two words long next to a marker, a track with
a fifteen-minute gap, a rolling VTT, an SRT, a transcript panel payload, and three
speech-recognition payloads (a two-chunk stitch, token pieces, a word timed outside its own
segment). Add a fixture before touching it. The binaries and the network are faked at their
own boundary, so the tests never leave the machine.
