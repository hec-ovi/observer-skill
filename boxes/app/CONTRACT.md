# app

## Purpose

The page. It holds the phase loader, the player, the stage, the dialogue, and the settings,
carries the theme into all of them, and is the only thing that talks to the server.

## Inputs

- The server's REST snapshot and its live channel, both defined by `web-host`.
- The user: a pasted URL, three toggles, the settings panel, the player, the question box,
  the hold-to-talk button.

## Outputs

- Upstream events to `web-host`: `position`, `ask`, `settings`, `verify-result`.
- Everything else is pixels.

## Screens

There is one screen and it changes shape.

**Feed.** A URL field and three switches: this video has ads, use extra knowledge, build
visuals. Optionally a line saying what the user wants from the video, which reaches the
agent as `userPrompt`. Nothing else. Resolving the source happens while they type the last
character, so a video that cannot be embedded is refused here.

**Preparing.** The loader: the phase, what is happening, and a real count. Transcribing
shows minutes done of minutes total. Researching and building show concepts and visuals as
they land, named, so the wait is legible instead of a spinner. The player is visible and
locked.

**Session.** Player, transcript rail, dialogue. The stage takes over the player's space
when a visual is shown and gives it back when it is dismissed.

## Layout

Player and stage share one region and cross-fade; they are never both at full size. The
transcript rail follows playback and is scrollable back. The dialogue sits under the rail:
the question box, the hold-to-talk button, and the answers in order. Settings is a panel
over the page, not a route.

## Theme

`light`, `dark`, `system`. The resolved theme is a `data-theme` attribute on the root, set
before first paint from a tiny inline script so there is no flash, and every colour in the
app is a custom property. A change notifies subscribers, which is how `stage` restyles a
mounted chart without rebuilding it, and how the player's surround follows.

## Design language

- `--radius: 0`. Sharp rectangles everywhere. Nothing is rounded, including buttons,
  panels, inputs, and chart geometry.
- One title per thing. The stage renders an artifact's title; the artifact does not. The
  page does not repeat the video's name in three places.
- Nothing on screen that is not carrying signal: no captions restating a label, no helper
  text explaining an obvious control, no empty states with an illustration.
- Motion is short and purposeful: 180 ms, opacity plus a small translate, and none of it
  when `prefers-reduced-motion` is set.
- Density over decoration. Type scale is small and tight; whitespace does the separating,
  not borders.

## Errors

Errors are shown where they happened: a bad URL under the field, a failed transcription in
the loader with the hint and a retry, a dead microphone in the settings panel next to the
control that tests it. There is no global toast.

## Dependencies

`app/player`, `app/stage`, `app/voice-out`, `app/voice-in`, `app/dialogue`, and the
`web-host` HTTP contract.

## Invariants

- The app holds no logic that belongs to a nested box. It composes them and routes events.
- Every server fact arrives through the live channel; the app never polls the record.
- The player is locked until the session is `ready`, and the lock is the server's phase, not
  a local flag.
- A settings change is applied locally and sent upstream in the same tick, so the agent and
  the page never disagree about which voice is speaking.
- Reload restores the session from the server, including position, without losing the log.

## How to modify this box safely

Screens are components with no data fetching of their own; the shell owns the connection
and passes state down. Tests drive the real components with the live channel, the player,
and both voice boxes faked at their contracts, and assert what the user sees: a locked
player during preparation, a question reaching the wire, an answer appearing, the stage
taking over and giving back.
