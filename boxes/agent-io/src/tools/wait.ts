import * as z from 'zod/v4'
import { fitPrefix } from '../budget.ts'
import { eventView, nextAfter, viewOf } from '../events.ts'
import { sessionIdInput } from '../schema.ts'
import { defineTool } from '../tool.ts'

/**
 * `session` marks the agent detached ninety seconds after its last call, and every call
 * touches presence. A wait that outlives that window shows the page nobody is listening
 * while somebody is, so the block always ends first.
 */
const DEFAULT_TIMEOUT_MS = 45_000
const MAX_TIMEOUT_MS = 60_000

export const wait = defineTool({
  name: 'wait',
  description:
    'Block until the user asks, pauses, seeks, or changes a setting, each event arriving ' +
    'with the context to answer it. This is the session loop: call it again after every answer.',
  phases: ['ready', 'live'],
  input: z.object({
    sessionId: sessionIdInput,
    after: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('The `cursor` of the last result. Left out, this session resumes where it was.'),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .max(MAX_TIMEOUT_MS)
      .optional()
      .describe(`How long to block. ${DEFAULT_TIMEOUT_MS} ms by default.`),
  }),
  output: z.object({
    events: z.array(eventView),
    cursor: z.number().int(),
    idle: z.boolean(),
    /** The call to make now, so a loop does not depend on remembering it is in one. */
    next: z.string(),
  }),

  async run(input, call) {
    const { store } = call.runtime.deps
    const session = call.require()
    // The first wait is the moment the user starts watching.
    const id = session.phase === 'ready' ? (await store.advance(session.id, 'live')).id : session.id

    const waiter = call.runtime.waiters.claim(id, call.signal)
    try {
      const taken = await store.take(id, {
        after: input.after ?? call.runtime.waiters.delivered(id) ?? 0,
        timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        signal: waiter.signal,
      })

      const events = fitPrefix(taken.events.map((event) => viewOf(call.runtime, id, event)))
      // The cursor is the last event actually handed over, so a trimmed batch is finished
      // by the next call instead of being lost.
      const cursor = events.at(-1)?.cursor ?? taken.cursor
      call.runtime.waiters.deliver(id, cursor)

      return { events, cursor, idle: events.length === 0, next: nextAfter(events) }
    } finally {
      waiter.release()
    }
  },
})
