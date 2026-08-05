/**
 * Every box, built once in dependency order and handed the config the process read. This is
 * the only place that knows which box a port is satisfied by.
 */

import { createAgentIo } from '#agent-io'
import type { AgentIo, ArtifactPort, IngestPort, TranscriptPort } from '#agent-io'
import { build } from '#artifact'
import type { Config } from '#config'
import { resolve } from '#ingest'
import type { Source } from '#ingest'
import { createKnowledge } from '#knowledge'
import { createStore } from '#session'
import { at, fetch as fetchTranscript, read } from '#transcript'
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
  const transcript: TranscriptPort = {
    // The binaries are the process's business, not the agent's: the box takes them per call.
    fetch: (source: Source, options) =>
      fetchTranscript(source, { ...options, ytdlpBin: config.ytdlpBin, ffmpegBin: config.ffmpegBin }),
    read,
    at,
  }
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
    // The page's feed screen opens videos itself, through the one open path `agent-io` owns,
    // so a link pasted in the browser starts the session the `open` tool would have started.
    // A closure, because `agent-io` is built on this host and exists by the time a request
    // arrives. No browser is opened: the user is already looking at the page that asked.
    createSession: (input) => agentIo.openSession({ ...input, openBrowser: false }),
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
      prompts: config.prompts,
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
