/**
 * Loading a built artifact module by URL.
 *
 * The visible stage and the verifier both come through here, so a module that passed
 * verification loads the same way when the user opens it.
 */

import { StageError } from './errors.ts'
import { REGISTRY_NAMES } from './registry.ts'
import type { ArtifactModule } from './types.ts'

/**
 * A failed import that names one of the registry specifiers means the document has no
 * import map (or the map points at nothing), not that the module is bad.
 */
function isRegistryFailure(message: string): boolean {
  return REGISTRY_NAMES.some((name) => new RegExp(`\\b${name}\\b`).test(message))
}

export async function loadArtifactModule(url: string): Promise<ArtifactModule> {
  let loaded: unknown
  try {
    loaded = await import(/* @vite-ignore */ url)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    throw new StageError(
      isRegistryFailure(message) ? 'REGISTRY_MISSING' : 'ARTIFACT_LOAD_FAILED',
      `${url} could not be loaded: ${message}`,
      { cause },
    )
  }

  const mount = (loaded as Partial<ArtifactModule>).mount
  if (typeof mount !== 'function') {
    throw new StageError('ARTIFACT_LOAD_FAILED', `${url} does not export mount() as a function`)
  }
  return loaded as ArtifactModule
}
