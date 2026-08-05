import { fail } from '#errors'
import type { Phase, Settings } from './schema.ts'

/**
 * Every move the machine allows, before settings are consulted.
 *
 *   feed ──▶ transcribing ──┬──▶ researching ──┬──▶ building ──▶ ready ──▶ live
 *                           ├──────────────────┘                  ▲
 *                           └──────────────────────────────────────┘
 */
const TRANSITIONS: Readonly<Record<Phase, readonly Phase[]>> = {
  feed: ['transcribing'],
  transcribing: ['researching', 'building', 'ready'],
  researching: ['building', 'ready'],
  building: ['ready'],
  ready: ['live'],
  live: [],
}

/** A preparation phase the settings switched off is not a phase this session has. */
function enabled(phase: Phase, settings: Settings): boolean {
  if (phase === 'researching') return settings.extraKnowledge
  if (phase === 'building') return settings.toolkit
  return true
}

function legalNext(from: Phase, settings: Settings): Phase[] {
  return TRANSITIONS[from].filter((to) => enabled(to, settings))
}

export function assertTransition(from: Phase, to: Phase, settings: Settings): void {
  const allowed = legalNext(from, settings)
  if (allowed.includes(to)) return
  fail(
    'ILLEGAL_PHASE',
    `A session in ${from} cannot move to ${to}.`,
    allowed.length > 0
      ? `Advance to ${allowed.join(' or ')} instead.`
      : `${from} is the last phase; there is nothing to advance to.`,
  )
}
