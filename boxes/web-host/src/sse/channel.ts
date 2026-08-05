import type { IncomingMessage, ServerResponse } from 'node:http'
import { frame } from './frame.ts'
import { SseSubscriber } from './subscriber.ts'

const MAX_BUFFERED_BYTES = 1_000_000

export interface SseChannelOptions {
  /** Comment interval, shorter than the shortest idle timeout on the path. */
  heartbeatMs: number
  /** What the client waits before reconnecting. */
  retryMs?: number
  /** Called when the last subscriber leaves, so the caller can release what it held open. */
  onEmpty: () => void
}

/**
 * One broadcast stream, for one session. Every event carries an id so the page can order
 * what it receives; nothing is replayed, because a page that reconnects reads the record
 * over REST and follows patches from there.
 */
export class SseChannel {
  readonly #subs = new Set<SseSubscriber>()
  readonly #heartbeatMs: number
  readonly #retryMs: number
  readonly #onEmpty: () => void
  #nextId = 1
  #heartbeat: NodeJS.Timeout | undefined
  #closed = false

  constructor(options: SseChannelOptions) {
    this.#heartbeatMs = options.heartbeatMs
    this.#retryMs = options.retryMs ?? 3_000
    this.#onEmpty = options.onEmpty
  }

  get size(): number {
    return this.#subs.size
  }

  subscribe(req: IncomingMessage, res: ServerResponse): void {
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform keeps proxies, and any compression middleware, off the stream.
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    }
    // Connection is hop-by-hop and illegal on HTTP/2.
    if (req.httpVersionMajor === 1) headers['Connection'] = 'keep-alive'

    res.writeHead(200, headers)
    res.flushHeaders()
    res.socket?.setNoDelay(true)

    const sub = new SseSubscriber(res, MAX_BUFFERED_BYTES)
    this.#subs.add(sub)
    sub.push(frame({ retry: this.#retryMs, comment: 'open' }))

    // 'close' fires whether the client sent a close frame or simply vanished.
    const drop = (): void => this.#drop(sub)
    res.on('close', drop)
    res.on('error', drop)

    this.#startHeartbeat()
  }

  publish(event: string, payload: unknown): void {
    if (this.#subs.size === 0) return
    const chunk = frame({ id: String(this.#nextId++), event, data: JSON.stringify(payload) })
    for (const sub of [...this.#subs]) {
      sub.push(chunk)
      if (sub.dead) this.#drop(sub)
    }
  }

  /** End every stream, so the socket is not left holding the server open. */
  closeAll(): void {
    this.#closed = true
    for (const sub of [...this.#subs]) {
      this.#subs.delete(sub)
      sub.destroy()
    }
    this.#stopHeartbeat()
  }

  #drop(sub: SseSubscriber): void {
    if (!this.#subs.delete(sub)) return
    sub.destroy()
    this.#stopHeartbeat()
    if (this.#subs.size === 0 && !this.#closed) this.#onEmpty()
  }

  #startHeartbeat(): void {
    if (this.#heartbeat !== undefined || this.#subs.size === 0) return
    this.#heartbeat = setInterval(() => {
      this.publish('ping', { at: Date.now() })
    }, this.#heartbeatMs)
    // A heartbeat never keeps the process alive.
    this.#heartbeat.unref()
  }

  #stopHeartbeat(): void {
    if (this.#heartbeat !== undefined && this.#subs.size === 0) {
      clearInterval(this.#heartbeat)
      this.#heartbeat = undefined
    }
  }
}
