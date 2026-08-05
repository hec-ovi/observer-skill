# voice-out

## Purpose

Say one line out loud, in the browser, through whichever voice the user picked. Starting a
line stops the previous one.

## Inputs

Schema: [`schema/voice-out.ts`](schema/voice-out.ts)

```ts
speak(text, { config, language, onStart, onBoundary, onEnd, signal }): Handle
warm(config, onProgress?): Promise<void>
voices(config): Promise<Voice[]>
providerInfo(config): ProviderInfo
dispose(): void
```

- `text` goes to the provider whole. Nothing truncates it, and no length parameter of any
  kind is sent.
- `config`: `{ provider, voice, baseUrl?, model?, apiKey? }`, read from settings.
- `warm` downloads and compiles whatever the provider needs so the first spoken line is not
  the slow one. Safe to call repeatedly. `onProgress({ step, loaded, total })` reports the
  download as it happens, so the settings panel can show a bar instead of a frozen button.
- `providerInfo` is `{ id, downloadBytes, attribution }`: what this provider costs before it
  can speak, and the credit the product must display while it is in use. The panel shows
  both before the user agrees to a download.

## Providers

| Provider | Runs | Needs |
|---|---|---|
| `web-speech` | `speechSynthesis` | nothing |
| `pocket` | Pocket TTS in a worker, ONNX in the browser, PCM through an AudioWorklet | a one-time model download, no key |
| `endpoint` | `POST {baseUrl}/v1/audio/speech`, audio bytes back | a reachable endpoint, a key when it asks |

`web-speech` is the default: zero bytes, and it speaks the moment the page loads. `pocket`
downloads 195,361,827 bytes once and then needs nothing else, ever; see
[`docs/pocket.md`](docs/pocket.md).

## Outputs

There is no data output. `Handle` is `{ stop() }`, and `stop` reports the end exactly once
whether or not the line had begun.

Events:

- `onStart({ analyser })` when audio actually begins. `analyser` is a live AnalyserNode for
  the providers that give us the audio, null for `web-speech`.
- `onBoundary({ charIndex })` where the provider reports word boundaries, so the page can
  follow along. Never assume it fires.
- `onEnd({ error? })` exactly once: finished, stopped, or failed.

## Errors

`INVALID_VOICE_CONFIG`, `VOICE_UNAVAILABLE`. Nothing else throws.

`INVALID_VOICE_CONFIG` throws from the call, because the settings are wrong and no line ever
starts: an unknown provider, or `endpoint` without an http URL. `VOICE_UNAVAILABLE` arrives
on `onEnd`, because it is only discovered while trying: a provider that cannot run falls back
to `web-speech` when the browser has it, and only reports `VOICE_UNAVAILABLE` when there is
no way to make a sound.

## Dependencies

None. This box does not know what a session, a concept, or a chart is.

## Invariants

- One line at a time across all providers. A new line cuts the old one off inside a frame.
- The full text is spoken. No caps, no truncation, no "read the first N characters".
- One AudioContext for the box, created on first use and resumed on a user gesture.
- The heavy provider loads in a worker; the main thread never blocks on model work.
- A key reaches only the endpoint the user configured.
- The first call after `warm` starts speaking without a second download.
- Switching provider mid-session takes effect on the next line, never mid-sentence.

## How to modify this box safely

Every provider is one file exporting `{ id, available(), warm(), speak(), voices(), info() }`
and a registry line in `src/registry.ts`. The fallback and the single `onEnd` live in
`src/line.ts`, not in the providers.

The tests drive `speak` with each provider faked at its own boundary (`speechSynthesis`,
`AudioContext`, `fetch`) and assert the event sequence, the cut-off, the full text on the
wire, and that only a machine with no way to make a sound reports `VOICE_UNAVAILABLE`. No
test downloads a model: jsdom has no `Worker`, which is exactly what the Pocket provider
refuses to run without.

The Pocket provider's assets, URLs, worker protocol, and attribution are in
[`docs/pocket.md`](docs/pocket.md).
