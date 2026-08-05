/**
 * Loading a built artifact module by URL.
 *
 * The visible stage and the verifier both come through here, so a module that passed
 * verification loads the same way when the user opens it.
 */

import { StageError } from './errors.ts'
import { REGISTRY_NAMES } from './registry.ts'
import type { ArtifactModule } from './types.ts'

/** How every engine words a bare specifier it could not resolve. */
const RESOLUTION_FAILURE = /\b(?:module|bare) specifier\b/i

/** The engines quote the specifier they name: Chrome and Safari `'x'`, Firefox `“x”`. */
function quotedSpecifier(name: string): RegExp {
  return new RegExp(`["'“”]${name}["'“”]`)
}

/**
 * A failed import that could not resolve one of the registry specifiers means the document
 * has no import map (or the map points at nothing), not that the module is bad.
 *
 * Both halves matter. Reading the name out of any failure text mistakes ordinary failures
 * for this one: a module that will not load from `/api/artifact/s1/d3-force-layout.js`, or a
 * top-level `d3.scaleLinear is not a function`, has a registry that works fine.
 */
function isRegistryFailure(message: string): boolean {
  if (!RESOLUTION_FAILURE.test(message)) return false
  return REGISTRY_NAMES.some((name) => quotedSpecifier(name).test(message))
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
