import type {
  InboxEventInput,
  Session,
  SessionPatch,
  SignalInput,
  Subscriber,
} from '#session'

/**
 * The part of the `session` contract this box uses. The real store satisfies it, and a test
 * can stand in for it without reaching for the disk.
 */
export interface SessionPort {
  get(id: string): Session
  patch(id: string, patch: SessionPatch): Promise<Session>
  subscribe(id: string, listener: Subscriber): () => void
  signal(id: string, signal: SignalInput): void
  push(id: string, event: InboxEventInput): Promise<number>
}

/** Resolves a URL into a session. Wired by the caller, because this box knows no providers. */
export type CreateSession = (input: {
  url: string
  settings?: Record<string, unknown>
  userPrompt: string | null
}) => Promise<Session>

/** Reads a page of transcript segments. Serialized as-is; this box does not read them. */
export type ReadTranscript = (
  sessionId: string,
  range: { from?: number; to?: number; offset: number; limit: number },
) => Promise<unknown>
