/**
 * What the user did, with the context to answer it already attached: the words around that
 * second and the concepts covering it. The agent reads one object and answers; it never has
 * to fetch anything first.
 */

import * as z from 'zod/v4'
import { settingsPatchSchema } from '#session'
import type { InboxEvent } from '#session'
import { contextAt, contextView } from './context.ts'
import type { Runtime } from './runtime.ts'
import { seconds } from './schema.ts'

export const eventView = z.object({
  cursor: z.number().int(),
  kind: z.enum(['ask', 'pause', 'seek', 'settings', 'ready']),
  /** The second of the video the user was on. */
  at: seconds,
  /** The question, on an `ask`. */
  text: z.string().optional(),
  via: z.enum(['text', 'voice']).optional(),
  /** What the user changed, on a `settings`. */
  settings: settingsPatchSchema.optional(),
  context: contextView,
})

export type EventView = z.infer<typeof eventView>

export function viewOf(runtime: Runtime, sessionId: string, event: InboxEvent): EventView {
  const base = {
    cursor: event.cursor,
    kind: event.kind,
    at: event.at,
    context: contextAt(runtime, sessionId, event.at),
  }
  if (event.kind === 'ask') return { ...base, text: event.text, via: event.via }
  if (event.kind === 'settings') return { ...base, settings: event.settings }
  return base
}

/** The call to make now. An unanswered question outranks everything else. */
export function nextAfter(events: readonly EventView[]): string {
  return events.some((event) => event.kind === 'ask') ? 'say' : 'wait'
}
