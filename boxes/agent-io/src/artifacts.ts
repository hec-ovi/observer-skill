/**
 * A visual only reaches the screen once it has been verified, so anything that puts one in
 * front of the user resolves it through here.
 */

import { fail } from '#errors'
import type { Artifact, Session } from '#session'

export function requireBuilt(session: Session, artifactId: string): Artifact {
  const artifact = session.artifacts.find((candidate) => candidate.id === artifactId)
  if (artifact === undefined) {
    fail(
      'UNKNOWN_ARTIFACT',
      `This session has no visual ${artifactId}.`,
      'Build it first; the id comes back from `build`.',
    )
  }
  if (artifact.status !== 'built') {
    fail(
      'ARTIFACT_INVALID',
      `Visual ${artifactId} did not verify: ${artifact.error ?? 'unknown failure'}`,
      'Fix the module and build it again with the same id.',
    )
  }
  return artifact
}
