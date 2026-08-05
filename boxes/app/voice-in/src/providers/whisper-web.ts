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

export const TRANSFORMERS_MODULE_URL =
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0'

/** 28 MB at q8, English, and stronger than whisper-tiny on utterances this short. */
const DEFAULT_MODEL = 'onnx-community/moonshine-tiny-ONNX'

export interface TranscribeRequest {
  moduleUrl: string
  model: string
  /** A language name, which is the form the pipeline takes. Null lets it detect. */
  language: string | null
  pcm: Float32Array<ArrayBuffer>
  sampleRate: number
}

export type TranscribeReply = { ok: true; text: string } | { ok: false; message: string }

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

function ensureWorker(): Worker {
  worker ??= new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })
  return worker
}

function dropWorker(): void {
  worker?.terminate()
  worker = null
}

function transcribe(request: TranscribeRequest): Promise<string> {
  const active = ensureWorker()
  return new Promise<string>((resolve, reject) => {
    active.onmessage = (event: MessageEvent<TranscribeReply>) => {
      active.onmessage = null
      active.onerror = null
      if (event.data.ok) resolve(event.data.text)
      else reject(new EngineFailure(event.data.message))
    }
    active.onerror = (event: ErrorEvent) => {
      dropWorker()
      reject(new EngineFailure(event.message || 'worker failed'))
    }
    active.postMessage(request, [request.pcm.buffer])
  })
}

class WhisperHold implements Hold {
  #options: HoldOptions
  #cancelled = false

  constructor(options: HoldOptions) {
    this.#options = options
  }

  async finish(recording: Recording): Promise<string> {
    if (this.#cancelled) return ''
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
    this.#cancelled = true
  }
}

export const whisperWebProvider: Provider = {
  id: 'whisper-web',
  // No worker means no way to keep inference off the main thread, and inference on the main
  // thread freezes the page for the length of the decode.
  available: () => typeof Worker === 'function',
  listen: (options) => new WhisperHold(options),
}
