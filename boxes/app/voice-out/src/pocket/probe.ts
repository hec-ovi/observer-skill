/**
 * Can this browser run Pocket TTS at all, and how well.
 *
 * Cheap and synchronous apart from the storage estimate, and free of any model code, so the
 * provider can answer `available()` without pulling 190 MB of intent behind it.
 */

export type PocketCapability = 'full' | 'degraded' | 'unsupported'

export interface PocketProbe {
  level: PocketCapability
  reason: string
}

/** The shipped ORT artifacts are SIMD-only, so a browser without SIMD cannot run them. */
const SIMD_MODULE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253,
  15, 253, 98, 11,
])

/** The model weights, the KV state, and the cached bundle need room to sit. */
const REQUIRED_STORAGE_BYTES = 400e6

export async function probePocket(): Promise<PocketProbe> {
  if (typeof Worker === 'undefined') return { level: 'unsupported', reason: 'no Worker' }
  if (typeof AudioWorkletNode === 'undefined') {
    return { level: 'unsupported', reason: 'no AudioWorklet' }
  }
  if (typeof WebAssembly === 'undefined') return { level: 'unsupported', reason: 'no WebAssembly' }
  if (!WebAssembly.validate(SIMD_MODULE)) {
    return { level: 'unsupported', reason: 'no WebAssembly SIMD' }
  }
  if (!isSecureContext) return { level: 'unsupported', reason: 'needs a secure context' }

  const quota = await navigator.storage?.estimate?.().catch(() => null)
  if (quota?.quota != null && quota.quota < REQUIRED_STORAGE_BYTES) {
    return { level: 'unsupported', reason: 'not enough storage for the model' }
  }

  if (!crossOriginIsolated) return { level: 'degraded', reason: 'single-threaded' }
  if ((navigator.hardwareConcurrency ?? 1) < 4) return { level: 'degraded', reason: 'few cores' }
  return { level: 'full', reason: '' }
}
