import type { LiveHub } from './live-hub.ts'
import type { CreateSession, ReadTranscript, SessionPort } from './session-port.ts'
import type { Verifications } from './verifications.ts'

/** What every route is handed. Routes validate, call one of these, and serialize. */
export interface HostContext {
  store: SessionPort
  /** Where sessions live; artifact bundles and snapshots resolve inside it. */
  home: string
  /** The built app: `index.html`, `assets/`, `sandbox.html`, and `sandbox/vendor/`. */
  appDir: string
  version: string
  hub: LiveHub
  verifications: Verifications
  createSession: CreateSession | null
  readTranscript: ReadTranscript | null
  /** The origin this host is listening on, for absolute URLs and the sandbox policy. */
  origin: () => string
}
