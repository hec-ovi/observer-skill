/**
 * The live channel: one `EventSource` per session, for as long as the page is on it.
 *
 * The browser reconnects a stream it lost on its own; a stream the server closed outright is
 * reopened here on a timer. Either way the record has to be read again once the stream is
 * back, because the channel replays nothing.
 */

import type { PhaseEvent, SayEvent, ShowEvent, VerifyEvent } from './events.ts'
import type { SessionPatch } from './record.ts'

/** How long to wait before reopening a stream the server closed. */
const RETRY_MS = 1000

export interface ChannelHandlers {
  patch(patch: SessionPatch): void
  phase(event: PhaseEvent): void
  say(event: SayEvent): void
  show(event: ShowEvent): void
  hide(): void
  verify(event: VerifyEvent): void
  /** The stream is back after a drop, so the record has to be read again. */
  resumed(): void
}

function parse<T>(event: MessageEvent): T | null {
  try {
    return JSON.parse(String(event.data)) as T
  } catch {
    return null
  }
}

export class LiveChannel {
  readonly #url: string
  readonly #handlers: ChannelHandlers
  readonly #retryMs: number

  #source: EventSource | null = null
  #timer: ReturnType<typeof setTimeout> | null = null
  #dropped = false
  #closed = false

  constructor(sessionId: string, handlers: ChannelHandlers, retryMs = RETRY_MS) {
    this.#url = `/live/${encodeURIComponent(sessionId)}`
    this.#handlers = handlers
    this.#retryMs = retryMs
  }

  open(): void {
    if (this.#closed || this.#source) return
    const source = new EventSource(this.#url)
    this.#source = source

    source.addEventListener('open', this.#onOpen)
    source.addEventListener('error', this.#onError)
    this.#listen<SessionPatch>(source, 'patch', this.#handlers.patch)
    this.#listen<PhaseEvent>(source, 'phase', this.#handlers.phase)
    this.#listen<SayEvent>(source, 'say', this.#handlers.say)
    this.#listen<ShowEvent>(source, 'show', this.#handlers.show)
    this.#listen<VerifyEvent>(source, 'verify', this.#handlers.verify)
    source.addEventListener('hide', () => this.#handlers.hide())
  }

  close(): void {
    this.#closed = true
    if (this.#timer !== null) clearTimeout(this.#timer)
    this.#timer = null
    this.#source?.close()
    this.#source = null
  }

  #listen<T>(source: EventSource, name: string, handle: (event: T) => void): void {
    source.addEventListener(name, (event) => {
      const data = parse<T>(event as MessageEvent)
      if (data) handle(data)
    })
  }

  readonly #onOpen = (): void => {
    if (!this.#dropped) return
    this.#dropped = false
    this.#handlers.resumed()
  }

  readonly #onError = (): void => {
    this.#dropped = true
    if (this.#closed || this.#source?.readyState !== EventSource.CLOSED) return

    // The stream is gone for good; the browser will not retry this one.
    this.#source.close()
    this.#source = null
    this.#timer = setTimeout(() => {
      this.#timer = null
      this.open()
    }, this.#retryMs)
  }
}
