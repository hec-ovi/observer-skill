<h1 align="center">Observer</h1>

<p align="center">
Watch a hard video with a coding agent sitting next to you.
</p>

Paste a podcast, a lecture, or a conference talk. Observer transcribes it, serves a page with
the player, and hands your CLI agent a set of MCP tools: read the transcript, prepare the
concepts, build the charts, then answer the moment you pause. One process serves the page and
speaks MCP, so there is nothing to start by hand.

## How a session goes

1. **Feed.** Paste the URL, in the page or to the agent. Say whether the video carries ads,
   and whether you want the research pass and the visual toolkit.
2. **Transcript.** Captions when the video has them, speech recognition when it does not.
3. **Research** (optional). The agent searches the concepts it did not already know, and
   looks specifically for what moved after the recording date, so a two-year-old talk arrives
   with its corrections attached.
4. **Toolkit** (optional). The agent writes the charts and diagrams for the equations and
   systems in the talk, compiles them, and fixes them until they render.
5. **Session.** You watch. You pause. You ask, by voice or by typing. The answer comes back in
   text first, spoken if you want it, with a prepared visual behind it when one fits.

The preparation is the point: by the time you press play, the transcript, the definitions, the
jargon list, the research and the visuals are already in the agent's context. A doubt at
minute 34 gets an answer, not a wait.

## What the agent knows when you pause

Your position in the video is the join key. Every pause tells the agent the second you stopped
at, the words around it, and which prepared concepts cover that moment. It answers about what
was actually being said, not about the video in general.

## Install

Needs Node 24.12 or newer. `yt-dlp` widens which videos have captions, and `ffmpeg` is needed
only for the speech-recognition path.

```
git clone https://github.com/hec-ovi/observer-skill
cd observer-skill
npm install
node bin/observer.ts doctor
```

`doctor` reports what your machine can do and names what to install to widen it.

Point a CLI agent at it:

```
claude mcp add observer -- node /path/to/observer-skill/bin/observer.ts mcp
```

Then tell it to study something, or run `node bin/observer.ts serve` and paste a URL into the
page yourself.

## Tools

| Tool | Does |
|---|---|
| `open` | Take a URL and options, start transcription, open the page |
| `status` | Phase, progress, counts, whether a page is connected, what is still missing |
| `transcript` | Read the transcript whole or by time range, paginated |
| `concepts` | Write the concept list: definitions, equations, systems, jargon |
| `note` | Pin a research finding to a concept |
| `build` | Compile a visual, verify it in the real page, return a snapshot to look at |
| `link` | Bind a visual to a concept and a stretch of video |
| `ready` | Close preparation, unlock the player |
| `wait` | Wait for the next pause, question, or setting change |
| `where` | The same context on demand, for a question typed in the terminal |
| `say` | Answer, optionally spoken, optionally showing a visual |
| `show` / `hide` | Move the stage between video and visual |

Phases, error set and the full argument list: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Visuals

A visual is a small ES module that mounts into the stage and gets the current theme. It can
use ECharts for interactive and large series, D3 for bespoke geometry and simulations, and
KaTeX for equations, all shared through one import map so the tenth chart costs nothing to
open.

Before anything reaches your screen it is bundled, linted, and mounted in a hidden sandbox
inside the page you already have open, under a content policy derived from that document. The
agent sees the real errors and a snapshot of the result, and iterates until it is right. A
visual that has not passed cannot be shown.

## Voice

Speaking defaults to the browser's own voice, which costs nothing to load. Kyutai Pocket TTS
runs entirely in the browser through ONNX Runtime Web for a better one, and the settings panel
states the one-time download before you agree to it. Listening is hold to talk. Both sit
behind a port with three providers each (browser, local model, OpenAI-compatible endpoint), so
moving either to a cloud voice is a setting and not a rewrite.

## Design

Sharp rectangles, radius zero, one title per thing, and nothing on screen that is not carrying
signal. Light, dark and system reach the charts too: the theme travels into every visual, so
switching restyles them in place without rebuilding. Transitions between the video and a
visual are short and respect reduced motion.

## Configuration

Environment variables, all with working defaults. `node bin/observer.ts --help` lists them
with the values in force on your machine.

| Variable | Default | What |
|---|---|---|
| `OBSERVER_PORT` | `4830` | First port to try for the page; a taken one moves up |
| `OBSERVER_HOME` | `$XDG_DATA_HOME/observer` | Where sessions, transcripts and artifacts live |
| `OBSERVER_TRANSCRIPT` | `auto` | `auto`, `captions`, `endpoint-asr`, or `file` |
| `OBSERVER_ASR_URL` | unset | OpenAI-compatible transcription endpoint |

## Repository

| Path | What |
|---|---|
| `boxes/` | One folder per box, each with its `CONTRACT.md` |
| `boxes/agent-io/prompts/` | The prompts the agent works from |
| `skills/observer/` | The skill the agent loads |
| `docs/` | Index, architecture, decisions, plan |
| `bin/` | The CLI: `mcp`, `serve`, `doctor` |

Every box is built against its contract alone and tested through its real entry point. `node
--run test` runs all of them; `node --run typecheck` covers both TypeScript projects.

MIT.
