# dialogue

## Purpose

Everything made of words during a session: the transcript rail that follows the video, the
way a question is asked, and the answers as they arrive.

## Inputs

Types: [`src/types.ts`](src/types.ts)

```ts
<TranscriptRail segments position onSeek />
<AskBox at listener disabled onAsk onOpenSettings />
<AnswerLog entries onShow onReplay />
```

- `segments` come from the server once; the rail does not refetch as the video plays.
- `position` is the player's `{ time, state }` as the player reports it.
- `at()` reads the player's second. It is called when the user starts asking, never when the
  question is sent.
- `listener` is `voice-in`'s `createListener` bound to the app's config: the box hands it the
  callbacks one hold needs and disposes what it gets back, so it owns no microphone code.
- `disabled` is true when no agent is attached, and the box says so in one line rather than
  letting the user speak into nothing.
- `onOpenSettings` opens the settings panel, which is where a refused microphone is fixed.

## Outputs

- `onAsk({ text, at, via })` where `at` is the player's second at the moment of asking, not
  the moment of sending.
- `onSeek(seconds)` when a line in the rail is clicked.
- `onShow(artifactId)` when an answer's visual is opened again.
- `onReplay(entryId)` to hear an answer again.

## Behaviour

**The rail** scrolls itself to the line being spoken and stops following the moment the
user scrolls it by hand, until they press play again. The current line is marked, not
enlarged. Clicking a line seeks there.

**Asking** works three ways and they produce the same event: typing and pressing enter,
holding the talk button and releasing, or the user typing in their terminal instead. The
hold button shows what it heard as it hears it, and a hold that produced nothing says so
in place rather than silently doing nothing. A hold ends on release or when the button
loses focus, and a press that lands while the last hold is still being transcribed opens
nothing rather than taking the moment away from the words already on their way.

**Waiting** is shown from the moment a question leaves the page until the answer lands: the
question sits in the log with a working indicator under it. The page knows a question is
outstanding without being told, so the user is never looking at a dead screen wondering
whether it went anywhere.

**Answers** appear as they arrive, newest last, each with the timestamp it was asked at,
stamped once per moment rather than repeated under every line of the same exchange. An
answer that came with a visual keeps a way to open it again. An answer that was spoken can
be replayed. Nothing is collapsed, truncated, or hidden behind "show more".

## Errors

- A hold with no microphone permission points at the settings control that fixes it.
- A question sent while nothing is attached stays in the box with the reason, so the words
  are not lost.

## Dependencies

`app/voice-in` (as an injected listener), `app/voice-out` (for replay), `app/stage` (only
to ask it to show an artifact by id).

## Invariants

- The `at` on a question is the player's own time, captured when the user started asking.
  This is the whole reason the agent can answer about a specific sentence.
- The rail renders a three-hour transcript without stalling: it virtualizes, and following
  playback costs one index lookup per tick, not a scan.
- Nothing here decides what an answer means or whether a visual should appear.

## How to modify this box safely

The three surfaces are separate components with no shared state beyond props. Tests use
Testing Library with user-event: typing and pressing enter, a pointer hold on the talk
button that fires an utterance, a click on a rail line, and an answer arriving while the
user is mid-sentence in the box (it must not clear their draft).

The rail is three units: `SegmentIndex` (which line is being spoken), `RowMetrics` (where
each row sits, on an estimate until it has been on screen once), and `useRailWindow` (which
rows exist, and whether the viewport is still following). A scroll that does not land where
the hook put it is the user's, which is what stops the rail following them around.
