/**
 * The autoregressive loop: text in, 24 kHz PCM out, one 80 ms frame at a time.
 *
 * Pocket TTS is a continuous audio language model. There are no codec tokens: `flow_lm_main`
 * produces a 1024-dim conditioning vector per frame, `flow_lm_flow` solves one Euler step of
 * a flow-matching field into a 32-dim latent, and Mimi's decoder turns a run of latents into
 * samples. The first audio chunk is three frames so speech starts fast; after that they come
 * twelve at a time.
 *
 * The loop yields to the event loop every few steps. That is the only thing that lets the
 * worker see a stop message: a single `run()` cannot be cancelled.
 */

import type { PocketBundle } from './bundle.ts'
import { framesAfterEos, prepareText, splitChunks } from './chunker.ts'
import { output } from './ort-runtime.ts'
import type { Ort, Session, TensorMap } from './ort-runtime.ts'
import { cloneState, initState, updateState } from './state.ts'
import type { Tokenizer } from './tokenizer.ts'

/** Frames per chunk, 40 seconds, well inside the 1000-position KV cache. */
const MAX_FRAMES = 500
/** Euler steps in the flow solver. One is what the distilled model was trained for. */
const LSD_STEPS = 1
const TEMPERATURE = 0.7
const EOS_THRESHOLD = -4
const FIRST_CHUNK_FRAMES = 3
const NORMAL_CHUNK_FRAMES = 12
const CHUNK_GAP_SEC = 0.25
const YIELD_EVERY = 4

export interface PocketSessions {
  textConditioner: Session
  flowLmMain: Session
  flowLmFlow: Session
  mimiDecoder: Session
}

export interface GeneratorDeps {
  ort: Ort
  bundle: PocketBundle
  sessions: PocketSessions
  tokenizer: Tokenizer
  /** The FlowLM state of the chosen voice. Every chunk starts from a copy of it. */
  voiceState: TensorMap
  emit: (pcm: Float32Array) => void
  stopped: () => boolean
}

export class SpeechGenerator {
  readonly #deps: GeneratorDeps
  #firstAudio = true

  constructor(deps: GeneratorDeps) {
    this.#deps = deps
  }

  async speak(text: string): Promise<void> {
    const { bundle, tokenizer, emit, stopped } = this.#deps
    const prepared = prepareText(text, bundle)
    const chunks = splitChunks(prepared, tokenizer, bundle.max_token_per_chunk)
    const gap = Math.round(CHUNK_GAP_SEC * bundle.sample_rate)

    for (const [index, chunk] of chunks.entries()) {
      if (stopped()) return
      if (index > 0) emit(new Float32Array(gap))
      await this.#speakChunk(chunk)
    }
  }

  async #speakChunk(chunk: string): Promise<void> {
    const { ort, bundle, sessions, emit, stopped } = this.#deps
    const latentDim = bundle.latent_dim

    const flowState = cloneState(this.#deps.voiceState)
    const mimiState = initState(ort, bundle.mimi_state_manifest)
    const textEmbeddings = await this.#conditionText(chunk)

    // Prefill: the text goes in once, and only the state it leaves behind is kept.
    const empty = new ort.Tensor('float32', new Float32Array(0), [1, 0, latentDim])
    const prefill = await sessions.flowLmMain.run({
      sequence: empty,
      text_embeddings: textEmbeddings,
      ...flowState,
    })
    updateState(flowState, prefill, bundle.flow_lm_state_manifest)

    const noText = new ort.Tensor('float32', new Float32Array(0), [1, 0, bundle.conditioning_dim])
    const flowStart = new ort.Tensor('float32', new Float32Array([0]), [1, 1])
    const flowEnd = new ort.Tensor('float32', new Float32Array([1]), [1, 1])
    // NaN is not a bug: the graph substitutes its learned start embedding wherever it sees one.
    let sequence = new ort.Tensor(
      'float32',
      new Float32Array(latentDim).fill(Number.NaN),
      [1, 1, latentDim],
    )

    const latents: Float32Array[] = []
    const tailFrames = framesAfterEos(chunk, bundle)
    const noise = Math.sqrt(TEMPERATURE)
    const step = 1 / LSD_STEPS
    let decoded = 0
    let eosAt: number | null = null

    for (let frame = 0; frame < MAX_FRAMES; frame += 1) {
      const ar = await sessions.flowLmMain.run({
        sequence,
        text_embeddings: noText,
        ...flowState,
      })
      const eosLogit = (output(ar, 'eos_logit').data as Float32Array)[0] ?? 0
      if (eosAt === null && eosLogit > EOS_THRESHOLD) eosAt = frame

      const latent = gaussian(latentDim, noise)
      const flow = await sessions.flowLmFlow.run({
        c: output(ar, 'conditioning'),
        s: flowStart,
        t: flowEnd,
        x: new ort.Tensor('float32', latent, [1, latentDim]),
      })
      const direction = output(flow, 'flow_dir').data as Float32Array
      for (let i = 0; i < latentDim; i += 1) {
        latent[i] = (latent[i] ?? 0) + (direction[i] ?? 0) * step
      }

      sequence = new ort.Tensor('float32', latent, [1, 1, latentDim])
      latents.push(latent)
      updateState(flowState, ar, bundle.flow_lm_state_manifest)

      const finished = (eosAt !== null && frame >= eosAt + tailFrames) || stopped()
      const pending = latents.length - decoded
      const target = this.#firstAudio ? FIRST_CHUNK_FRAMES : NORMAL_CHUNK_FRAMES
      const size = finished ? pending : pending >= target ? target : 0

      if (size > 0) {
        const packed = new Float32Array(size * latentDim)
        for (let f = 0; f < size; f += 1) {
          packed.set(latents[decoded + f] ?? new Float32Array(latentDim), f * latentDim)
        }
        decoded += size

        const audio = await sessions.mimiDecoder.run({
          latent: new ort.Tensor('float32', packed, [1, size, latentDim]),
          ...mimiState,
        })
        updateState(mimiState, audio, bundle.mimi_state_manifest)
        emit(new Float32Array(output(audio, 'audio_frame').data as Float32Array))
        this.#firstAudio = false
      }

      if (finished) return
      if (frame % YIELD_EVERY === YIELD_EVERY - 1) await breathe()
    }
  }

  async #conditionText(chunk: string): Promise<TensorMap[string]> {
    const { ort, bundle, sessions, tokenizer } = this.#deps
    const ids = tokenizer.encode(chunk)
    const tokens = new ort.Tensor(
      'int64',
      BigInt64Array.from(ids, (id) => BigInt(id)),
      [1, ids.length],
    )
    const conditioned = await sessions.textConditioner.run({ token_ids: tokens })
    const embeddings = output(conditioned, 'embeddings')
    if (embeddings.dims.length === 3) return embeddings
    return new ort.Tensor('float32', embeddings.data as Float32Array, [
      1,
      ids.length,
      bundle.conditioning_dim,
    ])
  }
}

/** Box-Muller, `count` independent draws at the model's sampling temperature. */
function gaussian(count: number, deviation: number): Float32Array {
  const out = new Float32Array(count)
  for (let i = 0; i < count; i += 1) {
    let u = 0
    let v = 0
    while (u === 0) u = Math.random()
    while (v === 0) v = Math.random()
    out[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * deviation
  }
  return out
}

function breathe(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
