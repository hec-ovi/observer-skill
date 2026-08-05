# player

## Purpose

Play the video inside our page and report where the user is, accurately enough that a
pause can be turned into a question about a specific sentence.

## Inputs

Schema: [`schema/player.ts`](schema/player.ts)

```ts
createPlayer(el, { source, onReady, onPosition, onState, onError }): Player
```

`Player` is `{ play, pause, seek(seconds), time(), state(), duration(), destroy }`.

`source` is `{ provider, videoId, url?, title?, duration? }`. The provider name picks the
implementation; the title and duration stand in until the player reports its own, which it
cannot do until the video has started.

## Outputs

- `onReady({ duration, title })` once the video can be controlled, and again when the
  player's own title or duration correct what was reported then. A source that knew neither
  is told `{ duration: 0, title: '' }` first and the real pair once playback starts, so a
  caller reads the latest call, not the first. `duration()` carries the same value.
- `onPosition({ time, state })` on play, on pause, on seek, on end, and on a steady tick
  while playing. The tick is fast enough that a pause maps to the right sentence and slow
  enough that it is not a network event storm: `POSITION_TICK_MS` is exported, so the
  caller reads the cadence instead of guessing it.
- `onState(state)`: `unstarted`, `playing`, `paused`, `buffering`, `ended`, `cued`. Seeking
  is reported as a position jump, not as a state.
- `onError({ code, message, hint })`.

## Errors

- `PLAYER_UNAVAILABLE`: the provider's script would not load.
- `NOT_EMBEDDABLE`: the owner disabled embedding, or the video is restricted where we are.
  This is the failure the user must hear about before a session is prepared, not after. A
  video that paints its own refusal inside the frame and reports nothing (an age wall, a
  regional block, a sign-in) is reported the same way, eight seconds after the user pressed
  play.
- `VIDEO_UNAVAILABLE`: removed, private, or wrong id.

## Invariants

- `time()` is the truth. Everything downstream (transcript window, concepts, the question
  the agent answers) is keyed to it, so it is read from the player and never inferred from
  a wall clock.
- Mounting twice does not create two players. The provider script loads once per page, and
  a remount reuses or cleanly replaces the instance, including under React's double
  invocation in development.
- `destroy` removes the iframe, the listeners, and the tick. Nothing survives a route
  change, and a command that arrives after it does nothing.
- The page never autoplays. Playback starts from a user gesture, which also unlocks audio
  for the voice box.
- The provider name and every provider-specific parameter live inside this box. Callers
  pass a `source` and read `time`.

## Dependencies

None.

## How to modify this box safely

A provider is one file exporting `{ id, matches(source), create(el, opts) }` plus its line
in the registry. The fake provider implements the same interface with no network and no
frame, so player-driven behaviour elsewhere in the app is testable and buildable without
one: pass a source with `provider: 'fake'`, or call the exported `createFakePlayer` to also
get `advance(seconds)` and `fail(code)`. The real provider has its own tests: the script
loads once across a teardown and remount, and every error code maps correctly.
