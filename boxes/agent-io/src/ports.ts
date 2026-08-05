/**
 * What this box needs from the boxes around it, written as the narrow surface it actually
 * calls. The real `ingest`, `transcript`, `artifact` and `web-host` satisfy these as they
 * are; a test stands in for them without a network, a bundler, or a browser.
 */

import type { BuildInput, BuildResult } from '#artifact'
import type { Source } from '#ingest'
import type { Knowledge } from '#knowledge'
import type { SessionStore } from '#session'
import type {
  AtOptions,
  FetchOptions,
  ProviderChoice,
  ReadOptions,
  TranscriptPage,
  TranscriptRef,
  TranscriptWindow,
} from '#transcript'
import type { VerifyResult } from '#web-host'

export interface IngestPort {
  resolve(input: { url: string; hasAds?: boolean }): Promise<Source>
}

export interface TranscriptPort {
  fetch(source: Source, options: FetchOptions): Promise<TranscriptRef>
  read(sessionId: string, options?: ReadOptions): TranscriptPage
  at(sessionId: string, time: number, options?: AtOptions): TranscriptWindow
}

export interface ArtifactPort {
  build(input: BuildInput): Promise<BuildResult>
}

export interface HostPort {
  /** `null` until the listener starts. */
  readonly url: string | null
  start(): Promise<{ url: string; port: number }>
  /** True while a browser is listening to this session, which is what `build` needs. */
  hasPage(sessionId: string): boolean
  verify(request: { sessionId: string; artifactId: string; timeoutMs?: number }): Promise<VerifyResult>
}

/** The part of the process configuration this box reads. */
export interface AgentIoConfig {
  /** Where sessions, transcripts, artifacts and snapshots live. */
  home: string
  /** Which transcript provider to ask for. */
  transcript: ProviderChoice
  /** Open the study page in the user's browser when a session starts. */
  openBrowser: boolean
  /** Reported to the client as the server version. */
  version?: string
}

export interface AgentIoDeps {
  store: SessionStore
  ingest: IngestPort
  transcript: TranscriptPort
  knowledge: Knowledge
  artifact: ArtifactPort
  host: HostPort
  config: AgentIoConfig
}
