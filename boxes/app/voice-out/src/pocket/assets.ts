/**
 * What Pocket TTS downloads, where from, and how much of it there is.
 *
 * Sizes are the real byte counts of the shipped bundle, so the settings panel can tell the
 * user what they are agreeing to before the first byte moves. Nothing here is hardcoded to
 * one host beyond the default: every URL is built from `baseUrl`, which the caller sets.
 */

import type { Voice } from '../../schema/voice-out.ts'

/**
 * The static host that serves the bundle. Same-origin copies work by pointing `baseUrl` at
 * your own deployment; the layout under it must stay `onnx/<bundle>/<file>`.
 */
export const POCKET_BASE_URL = 'https://kevinahm-pocket-tts-web.static.hf.space/'

/** The English bundle. Each bundle is self-contained: own tokenizer, voices, metadata. */
export const POCKET_BUNDLE = 'english_2026-04'

/** The rate the Mimi decoder produces. Also `bundle.json`'s `sample_rate`. */
export const POCKET_SAMPLE_RATE = 24000

/**
 * ONNX Runtime Web, wasm execution provider only. The default entry point of 1.27 pulls the
 * 26.8 MB WebGPU-capable wasm, which these dynamically quantized graphs cannot run on.
 */
export const POCKET_ORT_BASE_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/'
export const POCKET_ORT_ENTRY = 'ort.wasm.min.mjs'

/**
 * SentencePiece, as a browser-ready ES module. The npm build imports `fs` and `buffer` by
 * bare specifier, which no browser resolves, so this is the shimmed copy served next to the
 * model assets.
 */
export const POCKET_TOKENIZER_MODULE = 'sentencepiece.js'

export interface PocketAsset {
  file: string
  bytes: number
}

/** Everything a voice needs to speak. Cloning-only assets are not fetched. */
export const POCKET_ASSETS: readonly PocketAsset[] = [
  { file: 'bundle.json', bytes: 24_381 },
  { file: 'tokenizer.model', bytes: 59_339 },
  { file: 'text_conditioner_int8.onnx', bytes: 16_388_384 },
  { file: 'flow_lm_main_int8.onnx', bytes: 76_341_079 },
  { file: 'flow_lm_flow_int8.onnx', bytes: 9_962_530 },
  { file: 'mimi_decoder_int8.onnx', bytes: 22_684_077 },
  { file: 'voices.bin', bytes: 52_401_928 },
]

const sum = (total: number, asset: PocketAsset): number => total + asset.bytes

/** 177,861,718 bytes of model assets. */
export const POCKET_ASSET_BYTES = POCKET_ASSETS.reduce(sum, 0)

/** 13,479,978 bytes of ORT wasm plus 4,020,131 of SentencePiece, both once per browser. */
export const POCKET_RUNTIME_BYTES = 13_479_978 + 4_020_131

/**
 * 195,361,827 bytes, about 186 MiB, downloaded once and then served from the Cache API.
 * This is the number the settings panel shows before the user agrees to it.
 */
export const POCKET_DOWNLOAD_BYTES = POCKET_ASSET_BYTES + POCKET_RUNTIME_BYTES

export const POCKET_DEFAULT_VOICE = 'alba'

/**
 * The six permissively licensed built-in voices. The bundle also carries `cosette` and
 * `jean`, whose source recordings are CC BY-NC, so they are not offered here.
 */
export const POCKET_VOICES: readonly Voice[] = [
  { id: 'alba', label: 'Alba', lang: 'en' },
  { id: 'azelma', label: 'Azelma', lang: 'en' },
  { id: 'eponine', label: 'Eponine', lang: 'en' },
  { id: 'fantine', label: 'Fantine', lang: 'en' },
  { id: 'javert', label: 'Javert', lang: 'en' },
  { id: 'marius', label: 'Marius', lang: 'en' },
]

/** `https://host/onnx/english_2026-04/voices.bin` and friends. */
export function assetUrl(baseUrl: string, bundle: string, file: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/onnx/${bundle}/${file}`
}

export function siblingUrl(baseUrl: string, file: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${file}`
}
