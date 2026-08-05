/**
 * How the process ends. SIGINT and SIGTERM are the user and the supervisor; a closed stdin is
 * whoever spawned this going away, which leaves nobody to talk to. All three mean the same
 * thing, and the first one to arrive is the one that runs.
 */

import type { Readable } from 'node:stream'
import { toErrorShape } from '#errors'

export class Shutdown {
  readonly #close: () => Promise<void>
  #leaving: Promise<never> | null = null

  constructor(close: () => Promise<void>) {
    this.#close = close
  }

  /** The two signals a foreground process is stopped with. */
  onSignals(): this {
    process.once('SIGINT', () => void this.now())
    process.once('SIGTERM', () => void this.now())
    return this
  }

  /**
   * A stream that has ended. Only for a face that does not read stdin itself: resuming it
   * here would take the bytes the MCP transport is waiting for.
   */
  onClosed(stream: Readable): this {
    stream.resume()
    stream.once('end', () => void this.now())
    stream.once('close', () => void this.now())
    return this
  }

  /** Land what is owed and leave. A second ask waits for the first rather than cutting it short. */
  now(): Promise<never> {
    this.#leaving ??= this.#leave()
    return this.#leaving
  }

  async #leave(): Promise<never> {
    try {
      await this.#close()
    } catch (error) {
      console.error(`[observer] shutdown: ${toErrorShape(error).message}`)
    }
    process.exit(0)
  }
}
