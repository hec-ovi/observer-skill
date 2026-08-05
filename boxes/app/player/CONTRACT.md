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

## Outputs

- `onReady({ duration, title })` once the video can be controlled.
- `onPosition({ time, state })` on play, on pause, on seek, on end, and on a steady tick
  while playing. The tick is fast enough that a pause maps to the right sentence and slow
  enough that it is not a network event storm; the caller is told the cadence and does not
  guess.
- `onState(state)`: `unstarted`, `playing`, `paused`, `buffering`, `ended`, `cued`. Seeking
  is reported as a position jump, not as a state.
- `onError({ code, message, hint })`.

## Errors

- `PLAYER_UNAVAILABLE`: the provider's script would not load.
- `NOT_EMBEDDABLE`: the owner disabled embedding, or the video is restricted where we are.
  This is the failure the user must hear about before a session is prepared, not after.
- `VIDEO_UNAVAILABLE`: removed, private, or wrong id.

## Invariants

- `time()` is the truth. Everything downstream (transcript window, concepts, the question
  the agent answers) is keyed to it, so it is read from the player and never inferred from
  a wall clock.
- Mounting twice does not create two players. The provider script loads once per page, and
  a remount reuses or cleanly replaces the instance, including under React's double
  invocation in development.
- `destroy` removes the iframe, the listeners, and the tick. Nothing survives a route
  change.
- The page never autoplays. Playback starts from a user gesture, which also unlocks audio
  for the voice box.
- The provider name and every provider-specific parameter live inside this box. Callers
  pass a `source` and read `time`.

## Dependencies

None.

## How to modify this box safely

A provider is one file exporting `{ id, matches(source), create(el, opts) }`. The tests run
against a fake provider that implements the same interface, so player-driven behaviour
elsewhere in the app is testable without a network or an iframe. The real provider has its
own thin test that asserts the script loads once and the error codes map correctly.
