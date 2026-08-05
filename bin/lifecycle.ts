/**
 * How the process ends: SIGINT from the user, SIGTERM from a supervisor, and nothing else.
 *
 * A closed stdin deliberately does NOT end it. `serve` exists to stay up, and every ordinary
 * way of running a server in the background hands it a stdin that is already closed: `nohup`,
 * a unit file with no standard input, a detached container. `mcp` does not need it either,
 * because `agent-io` reads that stream itself and returns when the client lets go of it.
 */

import { toErrorShape } from '#errors'

export class Shutdown {
  readonly #close: () => Promise<void>
  readonly #asked = Promise.withResolvers<void>()
  #leaving: Promise<never> | null = null

  constructor(close: () => Promise<void>) {
    this.#close = close
  }

  /** The two signals a foreground process is stopped with. */
  onSignals(): this {
    process.once('SIGINT', this.#ask)
    process.once('SIGTERM', this.#ask)
    return this
  }


  /** Park until something asks, then land what is owed and leave. */
  async run(): Promise<never> {
    await this.#asked.promise
    return this.now()
  }

  /** Land what is owed and leave. A second ask waits for the first rather than cutting it short. */
  now(): Promise<never> {
    this.#leaving ??= this.#leave()
    return this.#leaving
  }

  readonly #ask = (): void => {
    this.#asked.resolve()
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
