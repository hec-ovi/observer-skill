/**
 * A small ASR model in the browser, through transformers.js in a worker.
 *
 * `@huggingface/transformers` is deliberately not an npm dependency of this repo: its
 * Node-side dependencies carry advisories for code a browser never runs. The worker pulls the
 * pinned build below at runtime instead, and `config.moduleUrl` overrides it for a mirror or
 * an air-gapped copy.
 *
 * The worker is kept between holds so the model is downloaded and compiled once.
 */

import type { Recording } from '../capture.ts'
import { EngineFailure, messageOf } from '../errors.ts'
import type { Hold, HoldOptions, Provider } from './provider.ts'

const TRANSFORMERS_MODULE_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0'

/** 28 MB at q8, English, and stronger than whisper-tiny on utterances this short. */
const DEFAULT_MODEL = 'onnx-community/moonshine-tiny-ONNX'

export interface TranscribeRequest {
  /** Echoed back on the reply. The worker outlives a hold, so replies have to be addressed. */
  id: number
  moduleUrl: string
  model: string
  /** A language name, which is the form the pipeline takes. Null lets it detect. */
  language: string | null
  pcm: Float32Array<ArrayBuffer>
  sampleRate: number
}

export type TranscribeReply =
  | { id: number; ok: true; text: string }
  | { id: number; ok: false; message: string }

type TranscribeInput = Omit<TranscribeRequest, 'id'>

interface Waiting {
  resolve: (text: string) => void
  reject: (failure: EngineFailure) => void
}

/** `en-US` reaches the pipeline as `english`. */
function languageName(tag: string): string | null {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'language' })
    return names.of(tag.split('-')[0] ?? tag)?.toLowerCase() ?? null
  } catch {
    return null
  }
}

let worker: Worker | null = null
let lastId = 0
const waiting = new Map<number, Waiting>()

/** Built once and kept, with handlers bound once, so replies are routed rather than raced. */
function ensureWorker(): Worker {
  if (worker) return worker
  const active = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })
  active.onmessage = (event: MessageEvent<TranscribeReply>) => {
    const reply = event.data
    const pending = waiting.get(reply.id)
    if (!pending) return
    waiting.delete(reply.id)
    if (reply.ok) pending.resolve(reply.text)
    else pending.reject(new EngineFailure(reply.message))
  }
  active.onerror = (event: ErrorEvent) => {
    dropWorker(new EngineFailure(event.message || 'worker failed'))
  }
  worker = active
  return active
}

/** The worker is gone, so every request still on it is gone with it. */
function dropWorker(failure: EngineFailure): void {
  worker?.terminate()
  worker = null
  const abandoned = [...waiting.values()]
  waiting.clear()
  for (const pending of abandoned) pending.reject(failure)
}

function transcribe(input: TranscribeInput): Promise<string> {
  const active = ensureWorker()
  const id = (lastId += 1)
  return new Promise<string>((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    active.postMessage({ ...input, id }, [input.pcm.buffer])
  })
}

class WhisperHold implements Hold {
  #options: HoldOptions

  constructor(options: HoldOptions) {
    this.#options = options
  }

  async finish(recording: Recording): Promise<string> {
    const { config, language } = this.#options
    try {
      return await transcribe({
        moduleUrl: config.moduleUrl ?? TRANSFORMERS_MODULE_URL,
        model: config.model ?? DEFAULT_MODEL,
        language: languageName(language),
        pcm: recording.pcm,
        sampleRate: recording.sampleRate,
      })
    } catch (error) {
      throw error instanceof EngineFailure ? error : new EngineFailure(messageOf(error))
    }
  }

  cancel(): void {
    // A gated-out hold sent nothing: the model only ever sees a hold that passed the gate. A
    // disposed one lets the worker finish and throws the answer away, because terminating it
    // would cost the next hold the model download and the graph compile again.
  }
}

export const whisperWebProvider: Provider = {
  id: 'whisper-web',
  // No worker means no way to keep inference off the main thread, and inference on the main
  // thread freezes the page for the length of the decode.
  available: () => typeof Worker === 'function',
  listen: (options) => new WhisperHold(options),
}
