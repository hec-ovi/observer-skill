import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SubscriberMessage } from '#session'
import type { SessionPort } from './session-port.ts'
import { SseChannel } from './sse/channel.ts'

interface Live {
  channel: SseChannel
  off: () => void
}

/**
 * One channel per session, opened when the first page subscribes and released when the last
 * one goes. Store messages become the events the contract names; nothing else is sent.
 */
export class LiveHub {
  readonly #store: SessionPort
  readonly #heartbeatMs: number
  readonly #live = new Map<string, Live>()

  constructor(store: SessionPort, heartbeatMs: number) {
    this.#store = store
    this.#heartbeatMs = heartbeatMs
  }

  /** True while a page is listening to this session. */
  hasPage(sessionId: string): boolean {
    const live = this.#live.get(sessionId)
    return live !== undefined && live.channel.size > 0
  }

  attach(sessionId: string, req: IncomingMessage, res: ServerResponse): void {
    const live = this.#live.get(sessionId) ?? this.#open(sessionId)
    live.channel.subscribe(req, res)
  }

  closeAll(): void {
    for (const [sessionId, live] of [...this.#live]) {
      this.#live.delete(sessionId)
      live.off()
      live.channel.closeAll()
    }
  }

  #open(sessionId: string): Live {
    const channel = new SseChannel({
      heartbeatMs: this.#heartbeatMs,
      onEmpty: () => this.#release(sessionId),
    })
    const off = this.#store.subscribe(sessionId, (message) => {
      this.#forward(channel, message)
    })
    const live: Live = { channel, off }
    this.#live.set(sessionId, live)
    return live
  }

  #release(sessionId: string): void {
    const live = this.#live.get(sessionId)
    if (live === undefined) return
    this.#live.delete(sessionId)
    live.off()
  }

  #forward(channel: SseChannel, message: SubscriberMessage): void {
    if (message.type === 'patch') {
      channel.publish('patch', message.patch)
      return
    }
    if (message.type === 'phase') {
      channel.publish('phase', { phase: message.phase, progress: message.progress })
      return
    }
    const signal = message.signal
    switch (signal.type) {
      case 'say':
        channel.publish('say', {
          entryId: signal.entryId,
          text: signal.text,
          speak: signal.speak,
          artifactId: signal.artifactId,
        })
        return
      case 'show':
        channel.publish('show', { artifactId: signal.artifactId })
        return
      case 'hide':
        channel.publish('hide', {})
        return
      case 'verify':
        channel.publish('verify', {
          requestId: signal.requestId,
          url: signal.url,
          timeoutMs: signal.timeoutMs,
        })
        return
    }
  }
}
