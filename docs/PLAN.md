# Plan

Contracts first, then one agent per box, then wiring. Each box is implemented against its
`CONTRACT.md` alone, touches only its own folder, and lands with its own tests green. A box
that needs another reads that box's contract, never its source.

## Done

**Research.** Every library, protocol, and API this is built on was verified against live
sources on 2026-08-05, one investigator per subsystem: the MCP SDK, Node 24 TypeScript, the
YouTube player, the transcript pipeline, Pocket TTS in the browser, browser speech
recognition, the visualization stack, bundling and sandboxing, skill packaging, the HTTP
layer, and the frontend toolchain. What was chosen and why is in [DECISIONS.md](DECISIONS.md).

**Contracts.** All thirteen, plus the closed error set and the environment config. The
shapes that cross boxes (the session record, the live channel, the artifact module, the tool
surface) were written together so they interlock.

**Prompts.** The six the agent works from: `study-plan`, `research`, `visual-plan`,
`artifact-authoring`, `session-answer`, `ads`. Plus the skill and its references.

**Packaging.** Local MCP wiring, the Claude plugin, the marketplace entry, the registry
`server.json`, and the skill-copy sync with a drift check.

**Boxes.** `session` and `artifact`, with the app foundation: build config, design tokens,
theme controller, and the shared browser fakes every frontend test runs against.

## In flight

`web-host`, `knowledge`, `ingest`, `transcript`, and the four frontend leaves: `player`,
`stage`, `voice-out`, `voice-in`.

## Left

**`app/dialogue` and the `app` shell.** The transcript rail, the question box, the answer
log, the phase loader, the settings panel, and the layout that cross-fades the player and
the stage. This is where the live channel is consumed and the whole page comes together.

**`agent-io`.** The MCP server on stdio, the twelve tools with their phase gates, the
prompts, and the error mapping. Last on the server side, because it is the face onto
everything else.

**The CLI and the build.** `observer mcp`, `observer serve`, `observer doctor`, and the
publish build that emits JavaScript so the package works once npm copies it.

**End to end.** A real video from paste to a prepared session to an answered pause, with the
voice paths and the visual toolkit exercised by hand. Then a review pass over every box.

## Verification

`node --run test` runs every box's tests in one pass: `node --test` for the server, Vitest
with Testing Library for the frontend. `node --run typecheck` covers both TypeScript
projects. A failure is handed to an agent scoped to the failing box with the error output.
