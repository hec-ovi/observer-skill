import type { Subscriber, SubscriberMessage } from './schema.ts'

/**
 * Live subscribers. Subscribing does not replay history: a subscriber reads the record once
 * and then follows what changes. One listener that throws does not stop the others.
 */
export class Bus {
  readonly #listeners = new Set<Subscriber>()

  subscribe(listener: Subscriber): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  emit(message: SubscriberMessage): void {
    for (const listener of [...this.#listeners]) {
      try {
        listener(message)
      } catch (error) {
        console.error('[session] subscriber threw:', error)
      }
    }
  }

  clear(): void {
    this.#listeners.clear()
  }
}
