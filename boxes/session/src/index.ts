/**
 * session: the record, the phase machine, the durable inbox, the subscriber bus, and the
 * only code in the system that writes session state to disk.
 */

export { createStore } from './store.ts'
export type { SessionStore, StoreOptions } from './store.ts'

export { PHASES } from './schema.ts'
export {
  inboxEventInputSchema,
  newSessionInputSchema,
  sessionSchema,
  settingsPatchSchema,
  signalSchema,
} from './schema.ts'

export type {
  Agent,
  Artifact,
  ArtifactInput,
  Concept,
  ConceptInput,
  InboxEvent,
  InboxEventInput,
  LogEntry,
  LogEntryInput,
  NewSessionInput,
  Note,
  NoteInput,
  Phase,
  Position,
  Progress,
  ProgressInput,
  Session,
  SessionDiff,
  SessionError,
  SessionErrorInput,
  SessionPatch,
  Settings,
  SettingsPatch,
  Signal,
  SignalInput,
  Source,
  Subscriber,
  SubscriberMessage,
  TranscriptRef,
} from './schema.ts'

export type { TakeOptions, TakeResult } from './inbox.ts'
