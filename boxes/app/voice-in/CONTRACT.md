# voice-in

## Purpose

Turn one held button into one finished sentence, through whichever engine this browser can
run. Press and hold, speak, release, and the utterance arrives once.

## Inputs

Schema: [`schema/voice-in.ts`](schema/voice-in.ts)

```ts
createListener({ config, language, onPartial, onUtterance, onState, onDiagnostic }): Listener
```

- `config`: `{ provider, model?, baseUrl?, apiKey?, minSeconds = 0.6, minPeak = 0.01,
  moduleUrl? }`. `provider` is `auto`, which picks in the order below, or one engine by name.
  `moduleUrl` overrides the pinned transformers.js build `whisper-web` imports at runtime.
- `Listener`: `{ supported, engine, state, reason, start, stop, setLanguage, dispose }`.
  `start` opens a hold, `stop` closes it and is idempotent. Both resolve when the hold has
  settled, so a caller can await one; neither rejects.

## Providers

| Provider | Runs | Needs |
|---|---|---|
| `web-speech` | `SpeechRecognition` | a browser that has it |
| `whisper-web` | A small ASR model in a worker, WebGPU when present | a one-time model download |
| `endpoint` | `POST {baseUrl}/v1/audio/transcriptions`, multipart | a reachable endpoint |

`auto` takes the first one that can run: `endpoint` when a base URL is configured, then
`web-speech` when the browser has it, then `whisper-web`. A named provider that cannot run
here leaves the listener `unavailable` rather than quietly becoming another one.

## Outputs

- `onPartial(text)` while the sentence firms up, where the engine gives partials. Never
  assume it fires.
- `onUtterance(text)` exactly once per hold that passed the gate. An engine that failed
  delivers an empty string rather than nothing, so the caller can recover.
- `onState(state)`: `idle`, `listening`, `working`, `denied`, `unavailable`. `working` is a
  recording being transcribed. `denied` is a refused microphone and is never retried.
- `onDiagnostic({ device, seconds, peak })` once per hold, so the settings panel can show
  the user why a hold produced nothing.

## The gate

A hold shorter than `minSeconds`, or whose peak amplitude is under `minPeak`, produces no
utterance and no request. A transcriber handed silence or a fragment invents words, and an
invented question is worse than a missed one.

## Errors

`INVALID_LISTENING_CONFIG` is thrown by `createListener`. `MIC_DENIED` settles the listener
into `denied` and is the `reason` there. Nothing else throws; engine failures settle into a
state and a `reason` carrying the engine's own message.

## Dependencies

None.

## Invariants

- One microphone session per hold. `getUserMedia` on start, every track stopped on stop.
- A hold is `start` to `stop`, not a pause in the speech. Silence inside a hold is kept.
- No audio is stored anywhere. The recording exists for the length of one transcription.
- No unbounded restart loops: a session that ends by itself reopens at most twice per hold,
  and only when the failure was silence.
- Nothing here interprets what was said.

## How to modify this box safely

Providers are one file each, `{ id, available(config), listen(opts) }`, plus a registry line.
A hold is opened on press, so an engine that transcribes live hears all of it, and finished
on release with the recording the gate already accepted.

The capture is shared: one `getUserMedia` session per hold through an AudioWorklet, kept as
16 kHz mono samples. The model takes them as they are, the endpoint takes a WAV built from
them, and the gate's peak comes with them. `web-speech` cannot be fed audio, so it runs on
its own microphone and uses this capture only for the gate and the diagnostic.

The tests fake `getUserMedia`, `AudioContext`, the worklet port, `SpeechRecognition`, and
`fetch`, and assert: one utterance per hold, the gate dropping a short hold and a silent
one, a denied microphone settling into `denied` and never asking again, a failing endpoint
delivering an empty utterance, and a recognition session that ends by itself reopening at
most twice.
