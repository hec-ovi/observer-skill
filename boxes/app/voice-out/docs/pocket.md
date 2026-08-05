# Pocket TTS in the browser

Kyutai's Pocket TTS, running as ONNX in a worker with PCM through an AudioWorklet. It speaks
without a key and without sending anything anywhere, and it costs one large download.

It is a continuous audio language model, not a codec-token model: `flow_lm_main` produces one
1024-dim conditioning vector per 80 ms frame, `flow_lm_flow` solves a single Euler step of a
flow-matching field into a 32-dim latent, and Mimi's decoder turns runs of latents into 24 kHz
samples. Paper: arXiv 2509.06926.

## The download

195,361,827 bytes, about 186 MiB, once per browser. `providerInfo({ provider: 'pocket' })`
returns it as `downloadBytes` so the settings panel can show the number before the user agrees
to it. The Cache API keeps every asset, so a second session pays nothing.

| File | Bytes |
|---|---:|
| `bundle.json` | 24,381 |
| `tokenizer.model` | 59,339 |
| `text_conditioner_int8.onnx` | 16,388,384 |
| `flow_lm_main_int8.onnx` | 76,341,079 |
| `flow_lm_flow_int8.onnx` | 9,962,530 |
| `mimi_decoder_int8.onnx` | 22,684,077 |
| `voices.bin` | 52,401,928 |
| ONNX Runtime Web wasm | 13,479,978 |
| SentencePiece (wasm inlined) | 4,020,131 |

`mimi_encoder_int8.onnx` and `bos_before_voice.npy` are not fetched: they exist for cloning a
voice from an uploaded recording, which this box does not do.

## Where the URLs are configured

`src/pocket/assets.ts` holds every one of them.

- `POCKET_BASE_URL` is the default host. Model files are read from `<base>/onnx/<bundle>/<file>`
  and the SentencePiece module from `<base>/sentencepiece.js`. Point it at your own deployment
  by setting `baseUrl` in the voice config; keep that layout under it.
- `POCKET_ORT_BASE_URL` is the ONNX Runtime dist directory. The entry point is
  `ort.wasm.min.mjs`, the wasm-only build: the default entry of 1.27 carries WebGPU and pulls a
  26.8 MB wasm, and the WebGPU backend implements neither `MatMulInteger` nor
  `DynamicQuantizeLinear`, so these dynamically quantized graphs could not run on it anyway.
- The SentencePiece module is served next to the model assets because the npm build imports
  `fs` and `buffer` by bare specifier, which no browser resolves.

## Worker protocol

`src/pocket/protocol.ts` is the only file the page and the worker share. Every request that
makes sound carries a line id and every chunk carries it back, so audio from a line that was
cut is dropped instead of playing over its replacement.

Page to worker:

| Message | Meaning |
|---|---|
| `{ type: 'load', baseUrl, bundle, voice, ortBaseUrl }` | Fetch, compile, build the voice state, speak one line into the void. Happens once however often it is sent. |
| `{ type: 'speak', line, text, voice }` | Say this, whole. |
| `{ type: 'stop', line }` | Stop generating this line. |
| `{ type: 'dispose' }` | Drop everything and close. |

Worker to page:

| Message | Meaning |
|---|---|
| `{ type: 'progress', step, loaded, total }` | `step` is `runtime`, `model`, `voice`, or `ready`. |
| `{ type: 'ready' }` | Loading finished. |
| `{ type: 'audio', line, pcm, sampleRate }` | One chunk, buffer transferred. |
| `{ type: 'done', line }` | Generation finished for this line. |
| `{ type: 'failed', line, reason }` | `line` is null when loading failed. |

The generation loop yields to the event loop every four frames. That is the only thing that
lets a stop message be seen: a single `session.run()` cannot be cancelled.

## Threads

Threading needs `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` on the document, plus
`Cross-Origin-Resource-Policy: cross-origin` on assets from another host. Without them the
runtime uses one thread and generation is slower; everything still works. `probePocket()`
reports that as `degraded`.

## Attribution the product must show

Programmatically it is `providerInfo({ provider: 'pocket' }).attribution`, defined in
`src/pocket/attribution.ts`. Verbatim:

```
Speech synthesis by Pocket TTS (https://github.com/kyutai-labs/pocket-tts), (c) Kyutai:
Manu Orsini, Simon Rouard, Gabriel de Marmiesse, Vaclav Volhejn, Neil Zeghidour,
Alexandre Defossez. Model weights licensed CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/); modified: exported to ONNX and quantized
to INT8 by KevinAHM (https://huggingface.co/KevinAHM/pocket-tts-onnx). Built-in voices
from https://huggingface.co/kyutai/tts-voices, licences per voice. Pocket TTS code MIT.
Runtime: ONNX Runtime Web (MIT), SentencePiece (Apache-2.0).

Use must comply with all applicable laws and must not involve or facilitate any illegal,
harmful, deceptive, fraudulent, or unauthorized activity. Prohibited uses include voice
impersonation or cloning without explicit and lawful consent; misinformation or deception
(fake news, fraudulent calls, presenting generated content as genuine recordings of real
people or events); and unlawful, harmful, libelous, abusive, harassing, discriminatory,
hateful, or privacy-invasive content. All liability disclaimed.
```

## Voices

Six are offered: `alba`, `azelma`, `eponine`, `fantine`, `javert`, `marius`. `voices.bin` also
carries `cosette` and `jean`, whose source recordings (Expresso and EARS) are CC BY-NC, so they
are not in the list. Regenerating `voices.bin` with only the voices you ship is the largest
download saving available: about 46 MB for a single voice.

Picking a built-in voice runs no model. It is a saved FlowLM state copied into the fixed
1000-position cache the graph was exported with.
