/**
 * One concept write at a time per session. Widening a range and binding a visual both read
 * the stored concept and write it back, and the store applies a write a turn of the event
 * loop later, so two of them started in the same tick would each write over what the other
 * read. Sessions are independent, so only writes on the same session take turns.
 */
export class SessionQueue {
  readonly #tails = new Map<string, Promise<unknown>>()

  run<T>(sessionId: string, job: () => Promise<T>): Promise<T> {
    const previous = this.#tails.get(sessionId) ?? Promise.resolve()
    const result = previous.then(job, job)
    const tail = result.then(
      () => undefined,
      () => undefined,
    )
    this.#tails.set(sessionId, tail)
    void tail.then(() => {
      if (this.#tails.get(sessionId) === tail) this.#tails.delete(sessionId)
    })
    return result
  }
}
