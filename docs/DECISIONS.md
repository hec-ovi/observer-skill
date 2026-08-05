# Decisions

What Observer is built on, and why, checked against the state of each thing in August 2026.
Every entry names the port it sits behind, so it can be swapped without touching another box.

## Runtime: Node 24, TypeScript with no build step

Node 24 runs `.ts` files directly (type stripping, erasable syntax only: no enums, no
parameter properties). The server keeps types as the contract-enforcement layer and still
starts with `node src/main.ts`. The frontend is built by Vite because the browser needs a
bundle anyway.

## Protocol: MCP over stdio, with the page served by the same process

The CLI spawns `observer mcp`. That one process speaks MCP on stdio and listens on a local
port for the browser, which is what makes it a single unified service with nothing to start
by hand. The port serves the page and its live channel only; the agent's whole surface is
the stdio stream.

Stdio is the default because an HTTP-only entry assumes something is already listening: the
CLI connects to its MCP servers when the session begins, and a server that only starts
later is a failed server on every launch. Spawning it removes that whole class of friction,
and the port is chosen at startup (moving up if it is taken), so two sessions never fight.

The 2026-07-28 spec is stateless at the core and its list results are identical per
connection, so stage-specific tool sets are enforced by the session phase inside each tool
(`WRONG_PHASE` plus the next legal call) rather than by hiding tools from `tools/list`.

Sources: [2026-07-28 spec](https://blog.modelcontextprotocol.io/posts/2026-07-28/),
[changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog),
[TypeScript SDK](https://www.npmjs.com/package/@modelcontextprotocol/sdk),
[Claude Code MCP](https://code.claude.com/docs/en/mcp).

## Transcript: captions first, ASR endpoint second

`yt-dlp` is the reliable path to YouTube captions in 2026 (it tracks the PoToken
requirement that now covers some caption requests). We read `json3`, which carries word
timings, and normalize to `{start, end, text}`. When a video has no captions, audio goes
through `ffmpeg` to an OpenAI-compatible `/v1/audio/transcriptions` endpoint, so a local
whisper.cpp server and a cloud transcriber are the same provider.

Sources: [yt-dlp subtitles](https://github.com/yt-dlp/yt-dlp),
[PoToken on subtitles](https://github.com/yt-dlp/yt-dlp/issues/13075).

## Voice out: Pocket TTS in the browser

Kyutai Pocket TTS is 100M parameters, ~200 ms to first audio, real-time on two CPU cores,
and KevinAHM's ONNX export runs it in the browser through onnxruntime-web on the wasm
execution provider: an inference worker, a SentencePiece tokenizer, and an AudioWorklet
playing PCM as frames arrive. No server dependency and no install, at the price of one
195 MB download kept in the Cache API. A session starts on `speechSynthesis`, which loads
nothing; Pocket is the upgrade the settings panel offers, with the size on the option and a
bar while the bytes arrive. The same port also drives any OpenAI-compatible
`/v1/audio/speech` endpoint, so moving the voice to the cloud is a settings change.

Sources: [Pocket TTS](https://kyutai-labs.github.io/pocket-tts/),
[pocket-tts-web space](https://huggingface.co/spaces/KevinAHM/pocket-tts-web).

## Voice in: hold to talk, three providers

Hold the key, speak, release, one utterance. The default is the browser's
`SpeechRecognition` because it costs nothing to load. `whisper-web` runs Moonshine or
Whisper ONNX through transformers.js (WebGPU when present) for browsers without
recognition and for accuracy. `endpoint` posts the recorded blob to an OpenAI-compatible
transcription route. Holds shorter than 0.6 s or under a peak amplitude of 0.01 are
dropped, since a transcriber handed silence invents words.

Sources: [transformers.js speech](https://blog.rasc.ch/2025/01/transformers-js-speech.html),
[browser STT landscape 2026](https://offlinetts.com/blog/browser-speech-recognition-whisper-comparison/).

## Stage runtime: ECharts, D3, KaTeX

An artifact is an ES module that mounts into a container and is handed a theme object.
ECharts covers configured interactive charts and large series on canvas, D3 covers bespoke
geometry and simulations, KaTeX renders equations. The runtime is a registry, so a
`three` module for 3D systems is one entry later. Artifacts import from the registry only;
the bundler rejects any other import.

## Artifact verification: esbuild, then the real page

`esbuild` bundles the artifact and static checks run first (import allowlist, no
`border-radius` other than 0, no top-level title element). Then the bundle is mounted in a
hidden sandboxed iframe inside the page that is already open, which is the exact
environment it will run in, and the page reports mount errors, console errors, rendered
size, and a canvas snapshot when the artifact draws to canvas. The agent reads the
snapshot as an image and iterates. A closed page fails the call rather than passing an
unverified artifact.

## Player: YouTube IFrame API behind a player port

`getCurrentTime`, `getPlayerState`, and `onStateChange` give position and pause events.
The port exposes `load/play/pause/seek/time/state`, so an HTML5 file player is a second
provider without the rest of the app noticing.

Source: [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference).

## Research: the agent's own web search

The extra-knowledge phase uses the agent's search tools, not a search client in this
service. The service stores what comes back as notes attached to concepts, so the same
material is in context during the session.
