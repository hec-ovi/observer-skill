/**
 * artifact: a module the agent wrote becomes a checked bundle, or errors precise enough to
 * fix in one pass. Nothing here ever runs the module.
 */

export { build } from './build.ts'
export { ARTIFACT_KINDS } from './schema.ts'
export { ARTIFACT_REGISTRY } from './registry.ts'
export type { ArtifactKind, BuildError, BuildInput, BuildResult } from './schema.ts'
