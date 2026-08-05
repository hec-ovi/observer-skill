<h1 align="center">Observer</h1>

<p align="center">
Watch a hard video with a coding agent sitting next to you.
</p>

Paste a podcast, a lecture, or a conference talk. Observer transcribes it, serves a page
with the player, and hands your CLI agent a set of MCP tools: read the transcript, prepare
the concepts, build the charts, then answer the moment you pause. One Node process serves
the page and speaks MCP, so there is a single thing to start.

Status: the boxes and their contracts are defined in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
and built in the order set out in [docs/PLAN.md](docs/PLAN.md). [CHANGELOG.md](CHANGELOG.md)
says what runs today.

## How a session goes

1. **Feed.** Paste the URL. Say whether the video carries ads, and whether you want the
   research pass and the visual toolkit.
2. **Transcript.** Captions when the video has them, speech recognition when it does not.
3. **Research** (optional). The agent searches the concepts it did not already know and
   pins what it finds to the part of the video it belongs to.
4. **Toolkit** (optional). The agent writes the charts and diagrams for the equations and
   systems in the talk, compiles them, and fixes them until they render.
5. **Session.** You watch. You pause. You ask, by voice or by typing. The answer comes
   back in text first, spoken if you want it, with a prepared visual behind it when one
   fits.

The preparation is the point: by the time you press play, the transcript, the definitions,
the jargon list, the research, and the visuals are already in the agent's context. A doubt
at minute 34 gets an answer, not a wait.

## What the agent knows when you pause

Your position in the video is the join key. Every pause tells the agent the second you
stopped at, the words around it, and which prepared concepts cover that moment. It answers
about what was actually being said, not about the video in general.

## Tools

| Tool | Does |
|---|---|
| `observer_open` | Take a URL and options, start transcription, return the page URL |
| `observer_transcript` | Read the transcript whole or by time range |
| `observer_concepts` | Write the concept list: definitions, equations, systems, jargon |
| `observer_note` | Pin a research finding to a concept |
| `observer_artifact_build` | Compile a visual, verify it in the real page, return a snapshot to look at |
| `observer_ready` | Close preparation, unlock the player |
| `observer_wait` | Wait for the next pause, question, or setting change |
| `observer_say` | Answer, optionally spoken, optionally showing a visual |
| `observer_show` / `observer_hide` | Move the stage between video and visual |

Full surface, phases, and error set: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Visuals

A visual is a small ES module that mounts into the stage and gets the current theme. It
can use ECharts for interactive and large series, D3 for bespoke geometry and simulations,
and KaTeX for equations. Before anything reaches your screen it is bundled, linted, and
mounted in a hidden sandbox inside the page you already have open, so the agent sees the
real errors and a snapshot of the result and iterates until it is right.

## Voice

Speaking is Kyutai Pocket TTS running in the browser through ONNX Runtime Web: no install,
no key, first audio in about a fifth of a second. Listening is hold to talk. Both sit
behind a port with three providers each (browser, local model, OpenAI-compatible
endpoint), picked in settings, so moving either to a cloud voice is a setting and not a
rewrite.

## Design

Sharp rectangles, radius zero, one title per thing, and nothing on screen that is not
carrying signal. Light, dark, and system reach the charts too: the theme travels into
every visual, so switching restyles them without rebuilding. Transitions between the video
and a visual are short and respect reduced motion.

## Configuration

Environment variables, all with working defaults.

| Variable | Default | What |
|---|---|---|
| `OBSERVER_PORT` | `4830` | Port for the page and `/mcp` |
| `OBSERVER_HOME` | `$XDG_DATA_HOME/observer` | Where sessions and artifacts live |
| `OBSERVER_TRANSCRIPT` | `captions` | `captions`, `endpoint-asr`, or `file` |
| `OBSERVER_ASR_URL` | unset | OpenAI-compatible transcription endpoint |

`yt-dlp` is used for captions and `ffmpeg` for the speech-recognition path.

## Repository

| Path | What |
|---|---|
| `boxes/` | One folder per box, each with its `CONTRACT.md` |
| `skills/observer/` | The skill the agent loads |
| `docs/` | Index, architecture, decisions, plan |
| `plugins/observer/` | Claude plugin packaging |

MIT.
