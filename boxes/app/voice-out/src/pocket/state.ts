/**
 * The tensors the FlowLM and the Mimi decoder carry from one step to the next.
 *
 * Both graphs take their whole state in as `state_*` and hand it back as `out_state_*`, so
 * a step is: run, then move every output back into its input slot. The manifests in
 * `bundle.json` say which is which, what shape it has, and what it starts filled with.
 *
 * A built-in voice is a saved FlowLM state. Its `cache` is shorter than the fixed 1000
 * positions the graph was exported with, so it is copied in strided rather than swapped,
 * and the remaining positions stay NaN, which the graph reads as "not written yet".
 */

import type { StateDtype, StateEntry, StateFill } from './bundle.ts'
import type { Ort, TensorMap } from './ort-runtime.ts'
import type { VoiceTensor } from './voices-bin.ts'

type StateData = Float32Array | BigInt64Array | Uint8Array

export function makeFilled(shape: number[], dtype: StateDtype, fill: StateFill): StateData {
  const size = shape.reduce((total, dimension) => total * dimension, 1)
  if (dtype === 'int64') return new BigInt64Array(size)
  if (dtype === 'bool') {
    const data = new Uint8Array(size)
    if (fill === 'ones') data.fill(1)
    return data
  }
  const data = new Float32Array(size)
  if (fill === 'nan') data.fill(Number.NaN)
  else if (fill === 'ones') data.fill(1)
  return data
}

export function initState(ort: Ort, manifest: StateEntry[]): TensorMap {
  const state: TensorMap = {}
  for (const entry of manifest) {
    const data = makeFilled(entry.shape, entry.dtype, entry.fill)
    state[entry.input_name] = new ort.Tensor(entry.dtype, data as never, entry.shape)
  }
  return state
}

/** Move every `out_state_*` back into its `state_*` slot, ready for the next run. */
export function updateState(
  state: TensorMap,
  results: Record<string, unknown>,
  manifest: StateEntry[],
): void {
  for (const entry of manifest) {
    const produced = results[entry.output_name]
    if (produced) state[entry.input_name] = produced as TensorMap[string]
  }
}

/** A shallow copy is enough: run never mutates its inputs, and updates replace references. */
export function cloneState(state: TensorMap): TensorMap {
  return { ...state }
}

/** The FlowLM state that makes one built-in voice sound like itself. No model runs. */
export function stateFromVoice(
  ort: Ort,
  manifest: StateEntry[],
  record: Record<string, VoiceTensor>,
): TensorMap {
  const state = initState(ort, manifest)

  for (const entry of manifest) {
    if (entry.key === 'cache') {
      const source = record[`${entry.module}/cache`]
      if (!source) continue
      const target = makeFilled(entry.shape, entry.dtype, entry.fill) as Float32Array
      copyStrided(source.data as Float32Array, source.shape, target, entry.shape)
      state[entry.input_name] = new ort.Tensor('float32', target, entry.shape)
    } else if (entry.key === 'step') {
      const step = new BigInt64Array([stepOf(record, entry.module)])
      state[entry.input_name] = new ort.Tensor('int64', step, entry.shape)
    }
    // `current_end` keeps its manifest default: the saved records carry no equivalent.
  }

  return state
}

/** Records store an `offset`; the manifest wants a `step`. They are the same number. */
function stepOf(record: Record<string, VoiceTensor>, module: string): bigint {
  for (const key of ['step', 'offset']) {
    const found = record[`${module}/${key}`]
    if (found?.data instanceof BigInt64Array && found.data.length > 0) return found.data[0] ?? 0n
  }
  const end = record[`${module}/current_end`]
  return end ? BigInt(end.shape[0] ?? 0) : 0n
}

function strides(shape: number[]): number[] {
  const out = new Array<number>(shape.length).fill(1)
  for (let axis = shape.length - 2; axis >= 0; axis -= 1) {
    out[axis] = (out[axis + 1] ?? 1) * (shape[axis + 1] ?? 1)
  }
  return out
}

/** Copy the overlapping corner of `source` into `target`, axis by axis. */
function copyStrided(
  source: Float32Array,
  sourceShape: number[],
  target: Float32Array,
  targetShape: number[],
): void {
  const rank = sourceShape.length
  const sourceStrides = strides(sourceShape)
  const targetStrides = strides(targetShape)
  const limits = sourceShape.map((size, axis) => Math.min(size, targetShape[axis] ?? 0))
  const total = limits.reduce((count, size) => count * size, 1)
  const index = new Array<number>(rank).fill(0)

  for (let n = 0; n < total; n += 1) {
    let from = 0
    let to = 0
    for (let axis = 0; axis < rank; axis += 1) {
      const at = index[axis] ?? 0
      from += at * (sourceStrides[axis] ?? 0)
      to += at * (targetStrides[axis] ?? 0)
    }
    target[to] = source[from] ?? 0

    for (let axis = rank - 1; axis >= 0; axis -= 1) {
      const next = (index[axis] ?? 0) + 1
      index[axis] = next
      if (next < (limits[axis] ?? 0)) break
      index[axis] = 0
    }
  }
}
