/**
 * Every box, built once in dependency order and handed the config the process read. This is
 * the only place that knows which box a port is satisfied by.
 */

import { createAgentIo } from '#agent-io'
import type { AgentIo, ArtifactPort, IngestPort, TranscriptPort } from '#agent-io'
import { build } from '#artifact'
import type { Config } from '#config'
import { resolve } from '#ingest'
import { createKnowledge } from '#knowledge'
import { createStore } from '#session'
import { at, fetch, read } from '#transcript'
import { createHost } from '#web-host'
import type { Host } from '#web-host'
import { VERSION, appDir } from './paths.ts'

export interface Wiring {
  host: Host
  agentIo: AgentIo
  /** Land what is owed, drop the listener, and let the loop empty. */
  close(): Promise<void>
}

export async function wire(config: Config): Promise<Wiring> {
  const store = createStore({ home: config.home })

  const ingest: IngestPort = { resolve }
  const transcript: TranscriptPort = { fetch, read, at }
  const artifact: ArtifactPort = { build }
  const knowledge = createKnowledge({ store })

  // Nothing listens yet. `agent-io` starts the listener the first time a session is opened,
  // so a CLI session that never opens a video costs nothing.
  const host = await createHost({
    store,
    appDir: appDir(),
    home: config.home,
    port: config.port,
    bind: config.bind,
    version: VERSION,
    readTranscript: async (sessionId, range) => read(sessionId, range),
  })

  const agentIo = createAgentIo({
    store,
    ingest,
    transcript,
    knowledge,
    artifact,
    host,
    config: {
      home: config.home,
      transcript: config.transcript,
      openBrowser: config.openBrowser,
      version: VERSION,
    },
  })

  return {
    host,
    agentIo,
    // The listener goes first: its open streams are what a waiting store write would sit
    // behind, and `close` on the store is the call that lands the record.
    close: async () => {
      await host.close()
      await store.close()
    },
  }
}
