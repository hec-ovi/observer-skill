/**
 * What the loader says: which phase, and the count that makes the wait legible.
 *
 * Every number here comes off the record. Nothing is estimated, and nothing spins in place
 * of a figure the server already knows.
 */

import type { ArtifactRecord, Concept, Phase, Progress } from '../session/record.ts'

const TITLES: Record<Phase, string> = {
  feed: 'Opening',
  transcribing: 'Transcribing',
  researching: 'Researching',
  building: 'Building visuals',
  ready: 'Ready',
  live: 'Live',
}

export function phaseTitle(phase: Phase): string {
  return TITLES[phase]
}

function minutes(seconds: number): number {
  return Math.round(seconds / 60)
}

function counted(count: number, thing: string): string {
  return `${count} ${thing}${count === 1 ? '' : 's'}`
}

export function phaseCount(
  phase: Phase,
  progress: Progress,
  concepts: readonly Concept[],
  artifacts: readonly ArtifactRecord[],
): string {
  if (phase === 'transcribing') {
    // `done` and `total` are media seconds; a step that cannot know a duration sends zeros,
    // and then the step's own message is the whole line.
    if (progress.total <= 0) return ''
    return `${minutes(progress.done)} of ${counted(minutes(progress.total), 'minute')}`
  }
  if (phase === 'researching') return counted(concepts.length, 'concept')
  if (phase === 'building') return counted(built(artifacts).length, 'visual')
  return ''
}

function built(artifacts: readonly ArtifactRecord[]): readonly ArtifactRecord[] {
  return artifacts.filter((artifact) => artifact.status === 'built')
}

/** What has landed so far, named, so the wait shows work instead of a spinner. */
export function phaseNames(
  phase: Phase,
  concepts: readonly Concept[],
  artifacts: readonly ArtifactRecord[],
): string[] {
  if (phase === 'researching') return concepts.map((concept) => concept.label)
  if (phase === 'building') return built(artifacts).map((artifact) => artifact.title)
  return []
}
