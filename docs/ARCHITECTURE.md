# Architecture

One Node process, spawned by the CLI. It speaks MCP on stdio, serves the study page on a
local port, and holds the session both of them read. Nothing else runs, and nothing has to
be started by hand.

```
   Claude Code (CLI)                     Browser (the study page)
          |                                        |
    MCP tools on stdio                   HTTP + SSE live channel
          |                                        |
          v                                        v
   +------------------------- observer -------------------------+
   |  agent-io  ->  session  <-  web-host                        |
   |     |            ^                                          |
   |     +--> ingest -+--> transcript                            |
   |     +--> knowledge                                          |
   |     +--> artifact                                           |
   +-------------------------------------------------------------+
```

The transport is stdio because an HTTP-only endpoint assumes something is already
listening, and the CLI connects to its servers when a session begins. Spawning removes that
whole class of failure. One consequence runs through every box: **stdout belongs to the
protocol**, so all logging goes to stderr. The HTTP listener starts lazily, the first time a
video is opened, on `OBSERVER_PORT` or the next free port above it.

## Who thinks, who serves

The service calls no model and holds no API key. Every judgement (what a concept is, what
chart explains it, what the answer to a doubt is) belongs to the agent. The service is
deterministic: it fetches the transcript, indexes it by time, keeps the session record,
compiles and verifies artifacts, moves pixels, and carries events between the page and the
agent. That split is why the whole thing installs with no configuration.

## The five phases

```
feed  ->  transcribing  ->  researching?  ->  building?  ->  ready  ->  live
```

`researching` and `building` are the two toggles. Each phase reports `{step, done, total,
message}` to the page loader, and the player stays locked until `ready`. `live` is the
session: the user watches, pauses, asks; the agent answers in the same second because
everything it needs was prepared before the video started.

## Boxes

A box is one folder with a `CONTRACT.md`. Outsiders read the contract, never the code.

| Box | One line | Depends on |
|---|---|---|
| `session` | The session record, the phase machine, the event bus, persistence to disk | nothing |
| `ingest` | A URL becomes a source: provider, video id, title, duration | nothing |
| `transcript` | A source becomes timed segments and a time index | `ingest` |
| `knowledge` | Concepts, jargon, notes, and what artifact explains what | `session` |
| `artifact` | Source becomes a checked bundle: allowlist, style lint, esbuild | nothing |
| `web-host` | HTTP: the app build, the REST face, the SSE live channel, the sandbox route | `session` |
| `agent-io` | The MCP tools, the prompts, the phase gates, the error set | all of the above |
| `app` | The page shell: phases, layout, theme, settings (nests the four below) | `web-host` contract |
| `app/player` | The video port and its YouTube provider, position and state events | nothing |
| `app/stage` | Artifact runtime, registry, transitions, theme bridge, verify sandbox | nothing |
| `app/voice-out` | Say a line: Pocket TTS in browser, speechSynthesis, or an endpoint | nothing |
| `app/voice-in` | Hold to talk: browser recognition, whisper-web, or an endpoint | nothing |
| `app/dialogue` | Transcript rail, question box, answer log, the loaders | `app/stage`, `app/voice-*` |

Edges point one way. `app/*` boxes know the page contract they are mounted into and
nothing about the server beyond `web-host`'s HTTP shape.

## The session record

One directory per session under `$OBSERVER_HOME/sessions/<id>/`: `session.json`, the
transcript beside it, and the built artifacts and their snapshots. The record is the only
shared state and both faces read and write it through `session`; the transcript has its own
file so a patch never carries a hundred kilobytes of text.

```
{
  id, createdAt,
  source:   { provider, videoId, url, title, channel, duration, publishedAt,
              hasCaptions, captionLanguages, hasAds, embeddable, degraded },
  settings: { theme, language, extraKnowledge, toolkit,
              voiceOut: { provider, voice }, voiceIn: { provider, endpoint } },
  phase, progress: { step, done, total, message },
  transcript: { provider, language, segmentCount, duration, generated },
  concepts: [{ id, label, kind, startsAt, endsAt, summary, notes[], artifactIds[] }],
  artifacts:[{ id, title, kind, conceptId, status, bundlePath, snapshotPath, error }],
  position: { time, state },
  log:      [{ role, text, at, artifactId }]
}
```

`kind` on a concept is `definition`, `equation`, `system`, or `jargon`. `kind` on an
artifact is `chart`, `dataviz`, `diagram`, or `simulation`.

## Time is the join key

Everything is indexed by video seconds. `transcript` builds a segment index; a lookup at
time `t` returns the segment, a window of context around it (default 90 s back, 30 s
forward), and every concept whose range covers `t`. That single lookup is what makes a
pause meaningful: the agent is told where the user is, what was being said, and which
prepared material applies.

## The live channel

SSE downstream at `GET /live/:sessionId`, JSON upstream at `POST /live/:sessionId/event`.
Both are `web-host`'s contract; the app is the only client.

Server to page:

| Event | Carries |
|---|---|
| `phase` | phase and progress, for the loader |
| `patch` | a diff of the session record |
| `say` | `{ text, speak, artifactId }`, the agent's answer |
| `show` / `hide` | an artifact id, or back to the video |
| `verify` | `{ requestId, bundleUrl }` for the hidden sandbox |

Page to server:

| Event | Carries |
|---|---|
| `position` | `{ time, state }` on play, pause, seek, and every second while playing |
| `ask` | `{ text, at, via }` where `via` is `text` or `voice` |
| `settings` | the settings patch the user changed |
| `verify-result` | `{ requestId, ok, errors[], size, snapshot }` |

## The agent's tool surface

All tools are listed at all times (the protocol's tool list is connection independent). A
tool called in the wrong phase returns `WRONG_PHASE` and names the legal next call, so the
stage discipline is enforced without hiding anything. Names are short because the client
namespaces them (`mcp__observer__wait`).

| Tool | Phase | Does |
|---|---|---|
| `open` | feed | Take a URL and options, start transcription, open the page, return its URL |
| `status` | any | Phase, progress, counts, whether a page is connected, what is still missing |
| `transcript` | after transcribing | Read the transcript whole or by time range, paginated |
| `concepts` | researching, building | Write the concept list: label, kind, range, summary |
| `note` | researching | Attach a research finding to a concept |
| `build` | building, live | Compile and verify a visual, return errors or the snapshot to look at |
| `link` | building | Bind a visual to a concept and a time range |
| `ready` | building | Close preparation, unlock the player |
| `wait` | live | Block until the user asks, pauses, or changes a setting; returns the event with its context |
| `where` | live | The same context on demand, for questions typed in the CLI |
| `say` | live | Send an answer to the page, optionally spoken, optionally showing a visual |
| `show` / `hide` | live | Move the stage between video and visual |

`wait` is the session loop. It blocks with a bounded timeout, returns `{ idle: true }` when
nothing happened, and always names the next call, so the agent stays present for the whole
video without burning a turn per second.

### The rule that keeps answers fast

In `live`, an answer comes first and it comes as text. `build` in `live` requires the id of
an answer that already went out, so nothing can be authored while the user waits. Building
during a session is for a follow-up the user explicitly asked to see, never for the first
reply.

## The artifact pipeline

```
agent writes source  ->  artifact.build  ->  static checks  ->  esbuild bundle
                                                                     |
                       snapshot + errors  <-  hidden sandbox iframe  <+
```

An artifact is one ES module:

```ts
export const meta = { title: string, kind: 'chart'|'dataviz'|'diagram'|'simulation' }
export function mount(el: HTMLElement, ctx: { theme, data, time, on }): () => void
```

`ctx.theme` carries the resolved tokens and fires on theme change, so one build serves
light and dark. The returned function unmounts. Imports resolve against the registry
(`echarts`, `d3`, `katex`) and nothing else; any other import fails the build.

Static checks before bundling: the import allowlist, no network, and no heading that
repeats `meta.title` (the stage renders the title, the artifact does not). Verification then mounts the bundle in a sandboxed iframe inside the open page,
which is the environment it will actually run in, and reports mount errors, console
errors, rendered size, and a PNG snapshot when a canvas is present. The agent reads that
snapshot and iterates until the visual is right.

## Voice

Both voice boxes are pure ports with named providers, chosen in settings and stored per
session, so a browser default today and a cloud voice tomorrow is a settings change.

- `voice-out`: `pocket` (Pocket TTS ONNX in a worker, PCM through an AudioWorklet),
  `web-speech`, `endpoint` (`POST {base}/v1/audio/speech`). One line at a time; starting a
  line cuts off the previous one. Nothing caps the text length.
- `voice-in`: `web-speech`, `whisper-web` (transformers.js), `endpoint`
  (`POST {base}/v1/audio/transcriptions`). One microphone session per hold; a hold under
  0.6 s or under 0.01 peak amplitude is discarded.

## Design

Tokens live in one stylesheet and reach charts through `ctx.theme`, so light, dark, and
system look deliberate everywhere.

- Surfaces layer instead of ruling: the page, a panel on it, a control inside the panel. A
  border is a hairline that separates. Corners are soft, from `--radius`, which artifacts
  read off `ctx.theme` like every other token.
- One title per thing, rendered by the stage. Artifacts draw data, not headings.
- Transitions between the video and the stage are opacity, a small lift, and a blur, and
  they respect `prefers-reduced-motion`.
- The transcript rail follows the player and is the only always-visible text; everything
  else appears when it has something to say.

## Prompts

Prompts are files, never string literals in code. They live in `agent-io/prompts/` and are
exposed both as MCP prompts and as skill references:

| File | Used when |
|---|---|
| `study-plan.md` | Reading the transcript and writing the concept list |
| `research.md` | The extra-knowledge pass and what counts as a useful note |
| `artifact-authoring.md` | The module shape, the registry API, the style rules |
| `session-answer.md` | Fast mode: answer first, text first, cite the timestamp |
| `ads.md` | Appended when `hasAds` is set, so ad copy is read as noise |

## Errors

One closed set, shared by tools and the REST face: `BAD_SOURCE`, `NO_TRANSCRIPT`,
`WRONG_PHASE`, `UNKNOWN_SESSION`, `UNKNOWN_ARTIFACT`, `ARTIFACT_INVALID`,
`ARTIFACT_UNVERIFIED`, `PAGE_NOT_OPEN`, `PROVIDER_UNAVAILABLE`. Every one carries a hint
naming the next legal action.

## Swap points

| Port | Providers today | Selected by |
|---|---|---|
| `ingest` | `youtube` | source URL |
| `transcript` | `captions`, `endpoint-asr`, `file` | `OBSERVER_TRANSCRIPT` |
| `voice-out` | `pocket`, `web-speech`, `endpoint` | settings |
| `voice-in` | `web-speech`, `whisper-web`, `endpoint` | settings |
| `stage registry` | `echarts`, `d3`, `katex` | registry entry |
| `player` | `youtube-iframe` | source provider |

A provider name appears inside its own box and nowhere else. Adding one is a file plus a
registry line, and no other box is edited.

## Configuration

Environment only, with defaults that work unset: `OBSERVER_PORT` (4830), `OBSERVER_HOME`
(`$XDG_DATA_HOME/observer`), `OBSERVER_TRANSCRIPT`, `OBSERVER_ASR_URL`, `YTDLP_BIN`, and the
rest. `shared/config.ts` reads all of them, once, and is the only file in the project that
touches the environment; `observer --help` prints the whole list from `Config` itself, so a
setting cannot exist without a line describing it. No path from a home directory is written
into code.

## Tests

Each box proves its own contract through its real entry point. `transcript` parses
recorded caption fixtures. `artifact` proves that a bad import, a network call, and a
duplicated title all fail, and that a good module bundles. `agent-io` calls every tool
through an in-process MCP client, including one wrong-phase call each. `app` boxes run on
a simulated DOM with Testing Library and user-event, with the player, both voice ports,
and the live channel faked at their contract. The whole project verifies by running every
box's tests in one pass.
