import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fail } from '#errors'
import { SessionHandle, isPresent } from './handle.ts'
import { newId } from './ids.ts'
import type { TakeOptions, TakeResult } from './inbox.ts'
import { deepMerge } from './merge.ts'
import { sessionsDir, toHomeRelative } from './paths.ts'
import { assertTransition } from './phases.ts'
import {
  STORE_OWNED_KEYS,
  artifactSchema,
  conceptSchema,
  logEntrySchema,
  newSessionInputSchema,
  noteSchema,
  sessionErrorSchema,
  sessionSchema,
  signalSchema,
} from './schema.ts'
import type {
  ArtifactInput,
  ConceptInput,
  InboxEventInput,
  LogEntryInput,
  NewSessionInput,
  NoteInput,
  Phase,
  ProgressInput,
  Session,
  SessionErrorInput,
  SessionPatch,
  SignalInput,
  Subscriber,
} from './schema.ts'
import { parse } from './validate.ts'

const RECORD_FILE = 'session.json'

export interface StoreOptions {
  /** Where sessions live. It comes from the caller; this box reads no environment. */
  home: string
}

/**
 * Every session in this process, and the only thing that writes them to disk.
 */
class SessionStore {
  readonly #home: string
  readonly #handles = new Map<string, SessionHandle>()
  #seq = 0

  constructor(home: string) {
    this.#home = home
    this.#ensureHome()
    this.#load()
  }

  // --- reading -------------------------------------------------------------

  get(id: string): Session {
    return this.#require(id).record
  }

  /** Newest first, which is what "the session I am working on" means to a caller. */
  list(): Session[] {
    return [...this.#handles.values()]
      .sort((a, b) => {
        const byDate = Date.parse(b.record.createdAt) - Date.parse(a.record.createdAt)
        return byDate !== 0 ? byDate : b.seq - a.seq
      })
      .map((handle) => handle.record)
  }

  // --- writing -------------------------------------------------------------

  async create(input: NewSessionInput): Promise<Session> {
    const parsed = parse(
      newSessionInputSchema,
      input,
      'New session input',
      'Pass the source resolved by ingest and the settings the user picked.',
    )
    const now = new Date().toISOString()
    const id = this.#freeId()
    const record = parse(
      sessionSchema,
      {
        id,
        createdAt: now,
        updatedAt: now,
        source: parsed.source,
        settings: parsed.settings,
        userPrompt: parsed.userPrompt,
        progress: { step: 'feed' },
      },
      'New session',
      'Fix the field named above and create the session again.',
    )

    const handle = new SessionHandle(this.#home, record, this.#seq++)
    this.#handles.set(id, handle)
    await handle.flush()
    return handle.record
  }

  async patch(id: string, patch: SessionPatch): Promise<Session> {
    const owned = STORE_OWNED_KEYS.filter((key) => key in patch)
    if (owned.length > 0) {
      fail(
        'INVALID_PATCH',
        `${owned.join(', ')} belong to the store and cannot be patched.`,
        'Use advance for the phase, touchAgent for presence, and push for the cursor.',
      )
    }
    return this.#require(id).mutate((draft) => deepMerge(draft, patch))
  }

  /** New concepts are appended; a concept already there is patched, keeping its notes. */
  async appendConcepts(id: string, concepts: ConceptInput[]): Promise<Session> {
    return this.#require(id).mutate((draft) => {
      for (const incoming of concepts) {
        const index = draft.concepts.findIndex((c) => c.id === incoming.id)
        const existing = index === -1 ? undefined : draft.concepts[index]
        const concept = parse(
          conceptSchema,
          existing === undefined ? incoming : deepMerge(existing, incoming),
          'Concept',
          'A concept needs an id, a label, a kind, a start and an end.',
        )
        if (index === -1) draft.concepts.push(concept)
        else draft.concepts[index] = concept
      }
    })
  }

  async appendNotes(id: string, conceptId: string, notes: NoteInput[]): Promise<Session> {
    return this.#require(id).mutate((draft) => {
      const concept = draft.concepts.find((c) => c.id === conceptId)
      if (concept === undefined) {
        fail(
          'INVALID_PATCH',
          `This session has no concept ${conceptId}.`,
          'Write the concept with appendConcepts before attaching notes to it.',
        )
      }
      for (const note of notes) {
        concept.notes.push(
          parse(noteSchema, note, 'Note', 'A note needs a kind of background or current and some text.'),
        )
      }
    })
  }

  /** Building the same artifact id twice replaces it. */
  async putArtifact(id: string, artifact: ArtifactInput): Promise<Session> {
    const stored = parse(
      artifactSchema,
      {
        ...artifact,
        bundlePath: toHomeRelative(this.#home, artifact.bundlePath),
        snapshotPath:
          artifact.snapshotPath == null ? null : toHomeRelative(this.#home, artifact.snapshotPath),
      },
      'Artifact',
      'An artifact needs an id, a title, a kind, a status and a bundle path inside home.',
    )
    return this.#require(id).mutate((draft) => {
      const index = draft.artifacts.findIndex((a) => a.id === stored.id)
      if (index === -1) draft.artifacts.push(stored)
      else draft.artifacts[index] = stored
    })
  }

  /** The appended entry is the last element of `log` in the returned record. */
  async appendLog(id: string, entry: LogEntryInput): Promise<Session> {
    return this.#require(id).mutate((draft) => {
      draft.log.push(
        parse(
          logEntrySchema,
          entry,
          'Log entry',
          'A log entry needs a role of user or agent, its text, and the second it belongs to.',
        ),
      )
    })
  }

  async advance(id: string, phase: Phase): Promise<Session> {
    return this.#require(id).mutate((draft) => {
      assertTransition(draft.phase, phase, draft.settings)
      draft.phase = phase
      draft.progress = { step: phase, done: 0, total: 0, message: '' }
      draft.error = null
    })
  }

  async touchAgent(id: string): Promise<Session> {
    return this.#require(id).touch()
  }

  async progress(id: string, progress: ProgressInput): Promise<Session> {
    return this.#require(id).mutate((draft) => {
      draft.progress = deepMerge(draft.progress, progress)
    })
  }

  /** Records the failure and leaves the phase alone, so it can be retried. */
  async fail(id: string, error: SessionErrorInput): Promise<Session> {
    return this.#require(id).mutate((draft) => {
      draft.error = parse(
        sessionErrorSchema,
        error,
        'Session error',
        'Use one of the shared error codes with a message and a hint.',
      )
    })
  }

  // --- live ----------------------------------------------------------------

  subscribe(id: string, listener: Subscriber): () => void {
    return this.#require(id).subscribe(listener)
  }

  signal(id: string, signal: SignalInput): void {
    this.#require(id).emitSignal(
      parse(signalSchema, signal, 'Signal', 'Use one of say, show, hide, or verify.'),
    )
  }

  async push(id: string, event: InboxEventInput): Promise<number> {
    return this.#require(id).push(event)
  }

  async take(id: string, options: TakeOptions = {}): Promise<TakeResult> {
    return this.#require(id).take(options)
  }

  /** Land what is owed, drop the timers, release anyone waiting on the inbox. */
  async close(): Promise<void> {
    const handles = [...this.#handles.values()]
    this.#handles.clear()
    await Promise.all(handles.map((handle) => handle.close()))
  }

  // --- internals -----------------------------------------------------------

  #require(id: string): SessionHandle {
    const handle = this.#handles.get(id)
    if (handle === undefined) {
      fail(
        'UNKNOWN_SESSION',
        `There is no session ${id}.`,
        'List the sessions or open a video to create one.',
      )
    }
    return handle
  }

  #freeId(): string {
    let id = newId()
    while (this.#handles.has(id)) id = newId()
    return id
  }

  #ensureHome(): void {
    try {
      mkdirSync(sessionsDir(this.#home), { recursive: true })
    } catch (error) {
      fail(
        'STORE_UNWRITABLE',
        `Could not create ${sessionsDir(this.#home)}: ${error instanceof Error ? error.message : String(error)}`,
        'Point the store home at a directory this user can write to.',
      )
    }
  }

  /** Sessions written by an earlier run. Live subscribers are not restored. */
  #load(): void {
    const root = sessionsDir(this.#home)
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const file = join(root, entry.name, RECORD_FILE)
      let raw: unknown
      try {
        raw = JSON.parse(readFileSync(file, 'utf8'))
      } catch {
        continue
      }
      const parsed = sessionSchema.safeParse(raw)
      if (!parsed.success) {
        console.error(`[session] ignoring unreadable record at ${file}`)
        continue
      }
      const record = parsed.data
      record.agent = { ...record.agent, attached: isPresent(record.agent.lastSeen) }
      this.#handles.set(record.id, new SessionHandle(this.#home, record, this.#seq++))
    }
  }
}

export type { SessionStore }

export function createStore(options: StoreOptions): SessionStore {
  return new SessionStore(options.home)
}
