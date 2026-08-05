/**
 * `bundle.json`: the contract between the shipped assets and this code.
 *
 * It names the tokenizer file, the audio rate, the chunk size, and the two state manifests
 * that say which tensors the FlowLM and the Mimi decoder carry between steps.
 */

export type StateDtype = 'float32' | 'int64' | 'bool'
export type StateFill = 'nan' | 'ones' | 'zeros' | 'empty'

/** One tensor threaded through a graph: in as `input_name`, back out as `output_name`. */
export interface StateEntry {
  dtype: StateDtype
  fill: StateFill
  input_name: string
  output_name: string
  key: string
  module: string
  path: string
  shape: number[]
}

export interface PocketBundle {
  bundle_name: string
  language: string
  sample_rate: number
  samples_per_frame: number
  frame_rate: number
  latent_dim: number
  conditioning_dim: number
  max_token_per_chunk: number
  tokenizer_file: string
  remove_semicolons: boolean
  pad_with_spaces_for_short_inputs: boolean
  model_recommended_frames_after_eos: number | null
  predefined_voices: string[]
  flow_lm_state_manifest: StateEntry[]
  mimi_state_manifest: StateEntry[]
}

export function parseBundle(bytes: ArrayBuffer): PocketBundle {
  return JSON.parse(new TextDecoder().decode(bytes)) as PocketBundle
}
