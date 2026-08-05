# Plan

Contracts first, then one agent per box, then wiring, then two review passes. Each box was
implemented against its `CONTRACT.md` alone, touched only its own folder, and landed with its
own tests green. A box that needs another reads that box's contract, never its source.

## How it was built

**Research.** Every library, protocol and API this is built on was verified against live
sources on 2026-08-05, one investigator per subsystem: the MCP SDK, Node 24 TypeScript, the
YouTube player, the transcript pipeline, Pocket TTS in the browser, browser speech
recognition, the visualization stack, bundling and sandboxing, skill packaging, the HTTP layer
and the frontend toolchain. What was chosen and why is in [DECISIONS.md](DECISIONS.md).

**Contracts.** All thirteen, plus the closed error set and the environment config. The shapes
that cross boxes (the session record, the live channel, the artifact module, the tool surface)
were written together so they interlock.

**Boxes.** One agent each, in dependency order: `session`, `artifact` and the app foundation
first; then `web-host`, `knowledge`, `ingest`, `transcript`; then the frontend leaves
`player`, `stage`, `voice-out`, `voice-in`; then `dialogue`, the app shell, `agent-io`, and
the CLI that wires them together.

**Review.** Two passes over every box: a reviewer against the contract and the research
reference, then a second agent whose job was to refute each finding by reproducing it. Only
what survived was fixed, each fix with a test that failed without it. Sixty-three findings
survived and were fixed; none were skipped.

## What that caught

The defects that mattered were all at the seams, where every box was individually correct:

- The verify frame's import map was blocked by the policy the server sent it, so every visual
  would have failed to find its chart library.
- The page carried no import map at all, so a verified visual would still have rendered
  nothing once shown.
- `build` was unreachable whenever research was enabled, and `wait` was unreachable at all, so
  neither the toolkit nor the session loop could be entered.
- The phase after transcription was read from a stale settings snapshot, so flipping a switch
  during transcription stranded the session with no legal move.
- whisper.cpp returns per-token pieces, so every local speech-recognition transcript would have
  come out fragmented.
- A word timed inside a pause belonged to no segment and was dropped from the transcript.
- `serve` exited the instant it started unless stdin was a terminal.
- The published CLI had two shebangs and would not run, which only running it could show.

## Verification

```
node --run typecheck    both TypeScript projects
node --run test         every box, server then browser
node scripts/build.ts   the published output
```

393 tests: 272 server, 121 browser. A failure is handed to an agent scoped to the failing box
with the error output.
