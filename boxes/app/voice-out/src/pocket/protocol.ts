/**
 * The only thing the page and the Pocket worker share.
 *
 * Every request that produces audio carries a line id, and every chunk carries it back, so
 * audio from a line that was cut is dropped instead of playing over its replacement.
 */

import type { WarmStep } from '../../schema/voice-out.ts'

export interface LoadRequest {
  type: 'load'
  /** Where `onnx/<bundle>/<file>` and the tokenizer module are served from. */
  baseUrl: string
  bundle: string
  voice: string
  /** ORT's dist directory: the wasm-only entry point and its `.wasm` live here. */
  ortBaseUrl: string
}

export interface SpeakRequest {
  type: 'speak'
  line: number
  text: string
  voice: string
}

export interface StopRequest {
  type: 'stop'
  line: number
}

export interface DisposeRequest {
  type: 'dispose'
}

export type EngineRequest = LoadRequest | SpeakRequest | StopRequest | DisposeRequest

export interface ProgressMessage {
  type: 'progress'
  step: WarmStep
  loaded: number
  total: number
}

export interface ReadyMessage {
  type: 'ready'
}

export interface AudioMessage {
  type: 'audio'
  line: number
  pcm: Float32Array
  sampleRate: number
}

export interface DoneMessage {
  type: 'done'
  line: number
}

export interface FailedMessage {
  type: 'failed'
  /** Null when loading failed, before any line existed. */
  line: number | null
  reason: string
}

export type EngineMessage =
  | ProgressMessage
  | ReadyMessage
  | AudioMessage
  | DoneMessage
  | FailedMessage
