# Decisions

What Observer is built on, and why, checked against the state of each thing in August 2026.
Every entry names the port it sits behind, so it can be swapped without touching another box.

## Runtime: Node 24, TypeScript with no build step

Node 24 runs `.ts` files directly (type stripping, erasable syntax only: no enums, no
parameter properties). The server keeps types as the contract-enforcement layer and still
starts with `node src/main.ts`. The frontend is built by Vite because the browser needs a
bundle anyway.

## Protocol: MCP 2026-07-28 over Streamable HTTP, `@modelcontextprotocol/sdk` v2

The 2026-07-28 spec is stateless at the core: no `Mcp-Session-Id`, list results are
cacheable and identical per connection, and server-to-client asks (elicitation, sampling)
travel as Multi Round-Trip Requests instead of a held-open stream. Two consequences we
design around:

- **Tool lists do not vary per connection.** Stage-specific tool sets are enforced by the
  session phase inside each tool (`WRONG_PHASE` plus the next legal call), not by hiding
  tools from `tools/list`.
- **Streamable HTTP on the same port as the page.** One `node` process, `/mcp` for the
  agent, `/` for the app, `/live` for the browser stream. That is the single unified
  service asked for.

Sources: [2026-07-28 spec](https://blog.modelcontextprotocol.io/posts/2026-07-28/),
[changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog),
[TypeScript SDK](https://www.npmjs.com/package/@modelcontextprotocol/sdk).

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
and KevinAHM's ONNX export runs it in the browser through onnxruntime-web: an inference
worker, a SentencePiece tokenizer, and an AudioWorklet playing PCM as frames arrive. No
server dependency and no install, which is why it is the default provider. The same port
also drives `speechSynthesis` and any OpenAI-compatible `/v1/audio/speech` endpoint, so
moving the voice to the cloud is a settings change.

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
