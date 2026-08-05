import { fail } from '#errors'
import type { Artifact } from '#session'
import type { HostContext } from './context.ts'

/** The artifact a URL names, or the 404 that says which part was wrong. */
export function artifactOf(ctx: HostContext, sessionId: string, artifactId: string): Artifact {
  const session = ctx.store.get(sessionId)
  const artifact = session.artifacts.find((candidate) => candidate.id === artifactId)
  if (artifact === undefined) {
    fail(
      'UNKNOWN_ARTIFACT',
      `Session ${sessionId} has no artifact ${artifactId}.`,
      'Build the artifact first, then read it back by the id it was given.',
    )
  }
  return artifact
}
