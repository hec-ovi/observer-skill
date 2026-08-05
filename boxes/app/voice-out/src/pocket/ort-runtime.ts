/**
 * ONNX Runtime Web, fetched at runtime from a configurable dist directory.
 *
 * It is loaded rather than bundled so the worker chunk stays free of `import.meta` and of
 * 14 MB nobody pays for until they choose this voice. The entry point is the wasm-only one:
 * the default entry of 1.27 carries WebGPU and pulls a 26.8 MB wasm that cannot run these
 * dynamically quantized graphs anyway, because it implements neither `MatMulInteger` nor
 * `DynamicQuantizeLinear`.
 */

import type * as ORT from 'onnxruntime-web'

export type Ort = typeof ORT
export type Tensor = ORT.Tensor
export type Session = ORT.InferenceSession
export type TensorMap = Record<string, Tensor>

/**
 * The autoregressive loop is a chain of small sequential matmuls that over-subscribes
 * easily; the upstream runtime settles on four threads for the same reason.
 */
const THREAD_CAP = 4

export const SESSION_OPTIONS: ORT.InferenceSession.SessionOptions = {
  executionProviders: ['wasm'],
  graphOptimizationLevel: 'all',
}

export async function loadOrt(baseUrl: string, entry: string): Promise<Ort> {
  const loaded = await import(/* @vite-ignore */ `${baseUrl}${entry}`)
  const ort = ((loaded as { default?: Ort }).default ?? loaded) as Ort
  ort.env.wasm.wasmPaths = baseUrl
  // Threads need `Cross-Origin-Opener-Policy: same-origin` and
  // `Cross-Origin-Embedder-Policy: require-corp` on the document. Without them, one thread.
  ort.env.wasm.numThreads = crossOriginIsolated
    ? Math.min(navigator.hardwareConcurrency || 4, THREAD_CAP)
    : 1
  return ort
}

/** One output of a `run`, by name, with a readable failure when the graph changed shape. */
export function output(results: Record<string, unknown>, name: string): Tensor {
  const found = results[name]
  if (!found) throw new Error(`the model produced no ${name}`)
  return found as Tensor
}
