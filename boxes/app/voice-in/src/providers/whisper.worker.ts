/**
 * Transcription off the main thread: WASM inference is synchronous C++, so on the page's
 * thread a hold would freeze everything for the length of the decode.
 *
 * One message in, one message out carrying the id it came in with. The pipeline is built on
 * the first request and kept, so only the first hold pays for the download and the compile.
 */

import type { TranscribeReply, TranscribeRequest } from './whisper-web.ts'

/** Whisper truncates past 30 seconds unless the pipeline is told to chunk. */
const CHUNK_SECONDS = 30

interface Transcriber {
  (audio: Float32Array<ArrayBuffer>, options: Record<string, unknown>): Promise<{ text: string }>
}

interface Transformers {
  pipeline: (
    task: string,
    model: string,
    options: Record<string, unknown>,
  ) => Promise<Transcriber>
}

const scope = globalThis as unknown as {
  postMessage: (message: TranscribeReply) => void
  onmessage: ((event: MessageEvent<TranscribeRequest>) => void) | null
  navigator: { gpu?: unknown }
}

let loaded: { model: string; transcriber: Transcriber } | null = null

async function ensure(request: TranscribeRequest): Promise<Transcriber> {
  if (loaded?.model === request.model) return loaded.transcriber

  const transformers = (await import(/* @vite-ignore */ request.moduleUrl)) as Transformers
  // The dtype has to be explicit: only the wasm path defaults to q8, everything else
  // defaults to fp32 and downloads several times as much.
  const gpu = 'gpu' in scope.navigator
  const transcriber = await transformers.pipeline(
    'automatic-speech-recognition',
    request.model,
    { device: gpu ? 'webgpu' : 'wasm', dtype: gpu ? 'fp16' : 'q8' },
  )

  loaded = { model: request.model, transcriber }
  return transcriber
}

scope.onmessage = async (event: MessageEvent<TranscribeRequest>) => {
  const request = event.data
  try {
    const transcriber = await ensure(request)
    const options: Record<string, unknown> = {}
    if (request.language) options.language = request.language
    if (request.pcm.length / request.sampleRate > CHUNK_SECONDS) {
      options.chunk_length_s = CHUNK_SECONDS
    }
    const output = await transcriber(request.pcm, options)
    scope.postMessage({ id: request.id, ok: true, text: output.text.trim() })
  } catch (error) {
    scope.postMessage({
      id: request.id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
