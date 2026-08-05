# Plan

Build order, one box per step. Each step starts by writing that box's `CONTRACT.md`, ends
with its tests green, and touches no folder but its own. One agent per step, given the
contract of its box and the contracts it depends on.

Steps 1 to 4 land a running page with a real transcript. Steps 5 to 8 give the agent its
tools and its visuals. Steps 9 to 11 close the loop and the packaging.

## 0. Skeleton

`package.json` (type module, Node 24 engine), `tsconfig` with `erasableSyntaxOnly`, Vite
config for `app`, `bin/observer`, `.gitignore`, MIT `LICENSE`, test runner wired to
`node --test` for server boxes and Vitest with Testing Library for `app` boxes.
**Done when** `observer --help` prints and an empty test pass runs.

## 1. `session`

The record, the phase machine (`feed -> transcribing -> researching? -> building? -> ready
-> live`), the event bus, atomic writes under `$OBSERVER_HOME/sessions/`. Illegal phase
moves throw. Subscribers get patches, not whole documents.
**Done when** a session survives a restart, an illegal transition fails, and two
subscribers see the same patch.

## 2. `web-host`

Express with `@modelcontextprotocol/express`, serving the `app` build, `GET
/live/:id` (SSE), `POST /live/:id/event`, a small REST face for the initial snapshot, and
the `/mcp` mount point that step 6 fills. Request and response shapes are the contract.
**Done when** a fake client receives a patch over SSE within a frame of a session write,
and an event posted upstream reaches the bus.

## 3. `app` shell plus `app/player`

The page: theme (light, dark, system, tokens with `--radius: 0`), settings panel, the
phase loader, the layout that holds player and stage. `app/player` wraps the YouTube
IFrame API behind `load/play/pause/seek/time/state` and pushes `position` events on play,
pause, seek, and each second of playback.
**Done when** pasting a URL creates a session, the loader shows the phase, the theme
switch survives reload, and a faked player drives `position` events through the channel.

## 4. `ingest` plus `transcript`

`ingest` resolves a URL to `{provider, videoId, title, duration}`. `transcript` runs the
`captions` provider (yt-dlp, `json3`, normalized to `{start, end, text}`), the
`endpoint-asr` provider (ffmpeg to an OpenAI-compatible transcription route), and `file`
(SRT or VTT). It also owns the time index: a lookup at second `t` returns the segment and
a context window.
**Done when** recorded caption fixtures parse to the same segments, a video with no
captions falls to ASR, and a lookup at an arbitrary second returns the right window.

At this point a pasted URL produces a transcript on screen. Everything below is the agent.

## 5. `knowledge`

Concepts with kind, range, summary, notes, and artifact bindings. A concept range must sit
inside the transcript. Notes are appended, never rewritten. Lookup by time and by label
for the jargon list.
**Done when** a concept out of range is refused, and a time lookup returns concepts
ordered by how tightly they cover that second.

## 6. `agent-io`, preparation half

The MCP server on `/mcp` with `observer_open`, `observer_status`, `observer_transcript`,
`observer_concepts`, `observer_note`, `observer_ready`, the phase gates, the closed error
set, and the prompt files (`study-plan.md`, `research.md`, `ads.md`) exposed as MCP
prompts. `hasAds` appends the ads prompt.
**Done when** an in-process MCP client walks a session from `feed` to `ready`, and each
tool called in the wrong phase returns `WRONG_PHASE` naming the next legal call.

## 7. `artifact` plus `app/stage`

`artifact`: static checks (import allowlist, no non-zero `border-radius`, no heading
repeating `meta.title`), then an esbuild bundle. `app/stage`: the registry (`echarts`,
`d3`, `katex`), the mount and unmount lifecycle, the theme bridge, the 180 ms transition
between video and artifact, and the hidden sandbox iframe that answers `verify` with
errors, rendered size, and a canvas snapshot.
**Done when** a bad import, a rounded corner, and a duplicated title each fail the build;
a good module mounts, restyles on theme change without rebuilding, and returns a snapshot.

## 8. `agent-io`, toolkit half

`observer_artifact_build` (build, verify through the open page, write the snapshot, return
its path), `observer_artifact_link`, and `artifact-authoring.md`. A closed page returns
`PAGE_NOT_OPEN` rather than accepting an unverified artifact.
**Done when** the agent authors a chart, sees an error, fixes it, and gets a snapshot path
it can read as an image.

## 9. `agent-io`, session half plus `app/dialogue`

`observer_wait` (bounded long poll, returns the event with the transcript window and
matching concepts, `{idle: true}` on timeout), `observer_where`, `observer_say`,
`observer_show`, `observer_hide`, and `session-answer.md`. `app/dialogue` renders the
transcript rail that follows the player, the question box, and the answer log.
`observer_artifact_build` in `live` requires the id of an answer already sent.
**Done when** a pause plus a typed question reaches the agent with the right context, the
answer appears and can be spoken, and building without a prior answer is refused.

## 10. `app/voice-out` plus `app/voice-in`

`voice-out`: Pocket TTS ONNX in a worker with an AudioWorklet playing PCM as it arrives,
plus `web-speech` and `endpoint`. `voice-in`: hold to talk with `web-speech`,
`whisper-web`, and `endpoint`, dropping holds under 0.6 s or 0.01 peak. Both are chosen in
settings and tried from the settings panel itself.
**Done when** a held button produces one utterance that arrives as an `ask` event, and an
answer is spoken through the selected provider with the fallback path proven.

## 11. Skill and packaging

`skills/observer/SKILL.md` with the phase to tool map, the fast-mode rule, and level 3
references; the synced root `SKILL.md`; `plugins/observer/`; `.mcp.json`; `server.json`;
`README.md` verified against the code; `CHANGELOG.md`.
**Done when** a fresh checkout installs, `observer` starts, a pasted podcast reaches
`ready`, and a pause during playback gets an answer with a chart behind it.

## Verification

Every box's tests run in one pass. A failure is handed to an agent scoped to that box with
the error output, never to whoever happens to be nearby.
