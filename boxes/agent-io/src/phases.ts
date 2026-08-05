/**
 * The gate. Tools are always listed, because the protocol's tool list does not vary per
 * connection, so the phase is enforced here instead: a call outside its phase comes back as
 * `WRONG_PHASE` naming the call to make now.
 */

import { ObserverError } from '#errors'
import { PHASES } from '#session'
import type { Phase } from '#session'
import type { Tool } from './tool.ts'

/** What the agent should do in each phase, when it just tried something else. */
const IN_PHASE: Record<Phase, { reason: string; next: string }> = {
  feed: { reason: 'No video is open yet.', next: 'open' },
  transcribing: { reason: 'Transcription is still running.', next: 'status' },
  researching: { reason: 'The session is in the reading pass.', next: 'concepts' },
  building: { reason: 'The session is in the visual pass.', next: 'build' },
  ready: { reason: 'Preparation is closed and the player is unlocked.', next: 'wait' },
  live: { reason: 'The session is live.', next: 'wait' },
}

/** The legal tools of every phase, read off what the tools themselves declare. */
export function phaseTable(tools: readonly Tool[]): Record<Phase, string[]> {
  const table = Object.fromEntries(PHASES.map((phase) => [phase, [] as string[]])) as Record<
    Phase,
    string[]
  >
  for (const tool of tools) {
    for (const phase of tool.phases) table[phase].push(tool.name)
  }
  return table
}

export function isLegal(tool: Tool, phase: Phase): boolean {
  return tool.phases.includes(phase)
}

export function nextCall(phase: Phase): string {
  return IN_PHASE[phase].next
}

export function wrongPhase(toolName: string, phase: Phase): ObserverError {
  const { reason, next } = IN_PHASE[phase]
  return new ObserverError(
    'WRONG_PHASE',
    `\`${toolName}\` is not available while the session is ${phase}. ${reason}`,
    `Call \`${next}\` instead.`,
  )
}

/** The phase a session moves to once its transcript is in. */
export function afterTranscribing(settings: { extraKnowledge: boolean; toolkit: boolean }): Phase {
  if (settings.extraKnowledge) return 'researching'
  return settings.toolkit ? 'building' : 'ready'
}
