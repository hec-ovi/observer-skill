/**
 * Everything the Pocket worker holds: the runtime, the four graphs, the tokenizer, and the
 * FlowLM state of each voice that has been asked for.
 *
 * Loading is done once and reported as it happens, because the user is watching 190 MB
 * arrive. The last thing `load` does is speak a word and throw the audio away: that pays the
 * wasm compilation and arena allocation up front, so the first real line starts on time.
 */

import {
  POCKET_ASSETS,
  POCKET_DOWNLOAD_BYTES,
  POCKET_ORT_ENTRY,
  POCKET_ORT_WASM_BYTES,
  POCKET_TOKENIZER_BYTES,
  POCKET_TOKENIZER_MODULE,
  assetUrl,
  siblingUrl,
} from './assets.ts'
import { parseBundle } from './bundle.ts'
import type { PocketBundle } from './bundle.ts'
import { fetchAsset } from './cache.ts'
import { SpeechGenerator } from './generator.ts'
import type { PocketSessions } from './generator.ts'
import { SESSION_OPTIONS, loadOrt } from './ort-runtime.ts'
import type { Ort, Session, TensorMap } from './ort-runtime.ts'
import { stateFromVoice } from './state.ts'
import { createTokenizer, importSentencePiece } from './tokenizer.ts'
import type { Tokenizer } from './tokenizer.ts'
import { parseVoiceStates } from './voices-bin.ts'
import type { VoiceRecords } from './voices-bin.ts'
import type { ProgressMessage } from './protocol.ts'

/** Long enough to prove the graphs run, short enough not to make loading feel longer. */
const WARM_UP_LINE = 'Ready.'

/** One progress message per chunk would be thousands; the panel only needs a bar moving. */
const PROGRESS_INTERVAL_MS = 100

export interface EngineOptions {
  baseUrl: string
  bundle: string
  ortBaseUrl: string
  voice: string
}

type Report = (progress: Omit<ProgressMessage, 'type'>) => void

export class PocketEngine {
  readonly #ort: Ort
  readonly #bundle: PocketBundle
  readonly #sessions: PocketSessions
  readonly #tokenizer: Tokenizer
  readonly #records: VoiceRecords
  readonly #states = new Map<string, TensorMap>()

  private constructor(
    ort: Ort,
    bundle: PocketBundle,
    sessions: PocketSessions,
    tokenizer: Tokenizer,
    records: VoiceRecords,
  ) {
    this.#ort = ort
    this.#bundle = bundle
    this.#sessions = sessions
    this.#tokenizer = tokenizer
    this.#records = records
  }

  static async load(options: EngineOptions, report: Report): Promise<PocketEngine> {
    const total = POCKET_DOWNLOAD_BYTES
    let loaded = 0
    let lastPost = 0
    const credit = (bytes: number, step: ProgressMessage['step'], force = false): void => {
      loaded += bytes
      const now = Date.now()
      if (!force && now - lastPost < PROGRESS_INTERVAL_MS) return
      lastPost = now
      report({ step, loaded, total })
    }

    const ort = await loadOrt(options.ortBaseUrl, POCKET_ORT_ENTRY)
    credit(POCKET_ORT_WASM_BYTES, 'runtime', true)
    const sentencePiece = await importSentencePiece(
      siblingUrl(options.baseUrl, POCKET_TOKENIZER_MODULE),
    )
    credit(POCKET_TOKENIZER_BYTES, 'runtime', true)

    const files = new Map<string, ArrayBuffer>()
    for (const asset of POCKET_ASSETS) {
      const url = assetUrl(options.baseUrl, options.bundle, asset.file)
      files.set(asset.file, await fetchAsset(url, (bytes) => credit(bytes, 'model')))
    }
    credit(0, 'model', true)

    const bundle = parseBundle(take(files, 'bundle.json'))
    const sessions = await createSessions(ort, files)

    credit(0, 'voice', true)
    const tokenizer = await createTokenizer(sentencePiece, take(files, bundle.tokenizer_file))
    const records = parseVoiceStates(take(files, 'voices.bin'))

    const engine = new PocketEngine(ort, bundle, sessions, tokenizer, records)
    await engine.speak(WARM_UP_LINE, options.voice, () => {}, () => false)

    report({ step: 'ready', loaded: total, total })
    return engine
  }

  get voiceNames(): string[] {
    return this.#bundle.predefined_voices
  }

  get sampleRate(): number {
    return this.#bundle.sample_rate
  }

  async speak(
    text: string,
    voice: string,
    emit: (pcm: Float32Array) => void,
    stopped: () => boolean,
  ): Promise<void> {
    const generator = new SpeechGenerator({
      ort: this.#ort,
      bundle: this.#bundle,
      sessions: this.#sessions,
      tokenizer: this.#tokenizer,
      voiceState: this.#voiceState(voice),
      emit,
      stopped,
    })
    await generator.speak(text)
  }

  /** Built for the first line in a voice, then kept: it is pure reshaping, but not free. */
  #voiceState(voice: string): TensorMap {
    const cached = this.#states.get(voice)
    if (cached) return cached

    const record = this.#records[voice] ?? this.#records[this.voiceNames[0] ?? '']
    if (!record) throw new Error(`the bundle carries no voice called ${voice}`)

    const state = stateFromVoice(this.#ort, this.#bundle.flow_lm_state_manifest, record)
    this.#states.set(voice, state)
    return state
  }
}

async function createSessions(ort: Ort, files: Map<string, ArrayBuffer>): Promise<PocketSessions> {
  const create = (file: string): Promise<Session> =>
    ort.InferenceSession.create(new Uint8Array(take(files, file)), SESSION_OPTIONS)

  const [textConditioner, flowLmMain, flowLmFlow, mimiDecoder] = await Promise.all([
    create('text_conditioner_int8.onnx'),
    create('flow_lm_main_int8.onnx'),
    create('flow_lm_flow_int8.onnx'),
    create('mimi_decoder_int8.onnx'),
  ])
  return { textConditioner, flowLmMain, flowLmFlow, mimiDecoder }
}

function take(files: Map<string, ArrayBuffer>, file: string): ArrayBuffer {
  const bytes = files.get(file)
  if (!bytes) throw new Error(`the bundle is missing ${file}`)
  return bytes
}
