import type { ServerResponse } from 'node:http'

/**
 * One open stream. Writes go straight to the socket; when the socket asks for a pause the
 * frames queue until it drains, and a subscriber that falls too far behind is dropped
 * instead of growing the heap. The page reads the record again when it reconnects, so
 * dropping one is cheap.
 */
export class SseSubscriber {
  readonly #res: ServerResponse
  readonly #maxBufferedBytes: number
  #queue: string[] = []
  #queuedBytes = 0
  #corked = false
  #dead = false

  constructor(res: ServerResponse, maxBufferedBytes: number) {
    this.#res = res
    this.#maxBufferedBytes = maxBufferedBytes
    res.on('drain', () => {
      this.#corked = false
      this.#flush()
    })
  }

  get dead(): boolean {
    return this.#dead
  }

  push(chunk: string): void {
    if (this.#dead) return
    if (this.#corked) {
      this.#queue.push(chunk)
      this.#queuedBytes += Buffer.byteLength(chunk)
      if (this.#queuedBytes > this.#maxBufferedBytes) this.destroy()
      return
    }
    if (!this.#res.write(chunk)) this.#corked = true
  }

  #flush(): void {
    while (!this.#dead && !this.#corked && this.#queue.length > 0) {
      const chunk = this.#queue.shift()
      if (chunk === undefined) return
      this.#queuedBytes -= Buffer.byteLength(chunk)
      if (!this.#res.write(chunk)) this.#corked = true
    }
  }

  destroy(): void {
    if (this.#dead) return
    this.#dead = true
    this.#queue = []
    this.#queuedBytes = 0
    this.#res.end()
  }
}
