import { Bus } from './bus.ts'
import { deepFreeze } from './frozen.ts'
import { Inbox } from './inbox.ts'
import type { TakeOptions, TakeResult } from './inbox.ts'
import { diff } from './merge.ts'
import { sessionFile } from './paths.ts'
import { SerialQueue } from './queue.ts'
import { inboxEventInputSchema, sessionSchema } from './schema.ts'
import type { InboxEvent, InboxEventInput, Session, Signal, Subscriber } from './schema.ts'
import { parse } from './validate.ts'
import { RecordWriter } from './writer.ts'

/** How long after its last tool call an agent still counts as listening. */
const PRESENCE_MS = 90_000

interface Applied {
  record: Session
  changed: boolean
}

/** True while the agent's last tool call is recent enough to answer. */
export function isPresent(lastSeen: string | null, now = Date.now()): boolean {
  return lastSeen !== null && now - Date.parse(lastSeen) < PRESENCE_MS
}

/**
 * One session: its record, the queue that keeps two writers apart, the file it lands in,
 * its inbox, and its live subscribers.
 */
export class SessionHandle {
  readonly seq: number
  readonly #queue = new SerialQueue()
  readonly #bus = new Bus()
  readonly #inbox = new Inbox()
  readonly #writer: RecordWriter
  #record: Session
  #presence: NodeJS.Timeout | null = null

  constructor(home: string, record: Session, seq: number) {
    this.seq = seq
    this.#record = deepFreeze(record)
    this.#writer = new RecordWriter(sessionFile(home, record.id), () => this.#record)
    this.#armPresence()
  }

  get record(): Session {
    return this.#record
  }

  subscribe(listener: Subscriber): () => void {
    return this.#bus.subscribe(listener)
  }

  emitSignal(signal: Signal): void {
    this.#bus.emit({ type: 'signal', signal })
  }

  take(options: TakeOptions): Promise<TakeResult> {
    return this.#inbox.take(options)
  }

  /** Apply a change, validate it, tell the subscribers, and land it on disk. */
  mutate(apply: (draft: Session) => Session | void): Promise<Session> {
    return this.#commit(() => this.#apply(apply))
  }

  /** Land the record as it stands, changed or not. This is how a new session first exists. */
  flush(): Promise<void> {
    return this.#writer.flush()
  }

  /** The cursor bump and the inbox insert are one step, so events stay in cursor order. */
  async push(input: InboxEventInput): Promise<number> {
    const event = parse(
      inboxEventInputSchema,
      input,
      'Inbox event',
      'Use one of ask, pause, seek, settings, or ready, with the fields that kind requires.',
    )
    const record = await this.#commit(() => {
      const applied = this.#apply((draft) => {
        draft.cursor += 1
      })
      const stamped: InboxEvent = { ...event, cursor: applied.record.cursor }
      this.#inbox.push(stamped)
      return applied
    })
    return record.cursor
  }

  /** The agent called a tool: it is attached now, and stops being so on its own. */
  async touch(): Promise<Session> {
    const record = await this.mutate((draft) => {
      draft.agent = { attached: true, lastSeen: new Date().toISOString() }
    })
    this.#armPresence()
    return record
  }

  async close(): Promise<void> {
    if (this.#presence !== null) {
      clearTimeout(this.#presence)
      this.#presence = null
    }
    this.#inbox.close()
    this.#bus.clear()
    await this.#writer.close()
  }

  async #commit(job: () => Applied): Promise<Session> {
    const applied = await this.#queue.run(job)
    if (applied.changed) await this.#writer.flush()
    return applied.record
  }

  #apply(apply: (draft: Session) => Session | void): Applied {
    const before = this.#record
    const draft = structuredClone(before)
    const next = parse(
      sessionSchema,
      apply(draft) ?? draft,
      'Session record',
      'Fix the field named above and write again; nothing was stored.',
    )

    const changes = diff(before, next)
    if (Object.keys(changes).length === 0) return { record: before, changed: false }

    next.updatedAt = new Date().toISOString()
    changes.updatedAt = next.updatedAt
    this.#record = deepFreeze(next)

    this.#bus.emit({ type: 'patch', patch: changes })
    if (changes.phase !== undefined || changes.progress !== undefined) {
      this.#bus.emit({ type: 'phase', phase: next.phase, progress: next.progress })
    }
    return { record: next, changed: true }
  }

  #armPresence(): void {
    if (this.#presence !== null) clearTimeout(this.#presence)
    this.#presence = null

    const lastSeen = this.#record.agent.lastSeen
    if (lastSeen === null || !this.#record.agent.attached) return
    const remaining = PRESENCE_MS - (Date.now() - Date.parse(lastSeen))
    if (remaining <= 0) return

    this.#presence = setTimeout(() => {
      this.#presence = null
      void this.mutate((draft) => {
        draft.agent.attached = false
      }).catch((error: unknown) => {
        console.error('[session] could not record the agent going quiet:', error)
      })
    }, remaining)
    this.#presence.unref()
  }
}
