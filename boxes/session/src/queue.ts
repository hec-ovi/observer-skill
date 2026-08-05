/**
 * One job at a time, in call order. Two faces write the same session (the MCP tools and the
 * HTTP routes) and neither may see a half-applied record from the other.
 */
export class SerialQueue {
  #tail: Promise<unknown> = Promise.resolve()

  run<T>(job: () => T | Promise<T>): Promise<T> {
    const result = this.#tail.then(job, job)
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}
