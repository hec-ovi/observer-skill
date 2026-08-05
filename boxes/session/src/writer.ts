import { mkdir, open, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fail, isObserverError } from '#errors'
import { newId } from './ids.ts'

/** A burst of writes inside this window lands on disk as one file write. */
const DEBOUNCE_MS = 10

interface Waiter {
  resolve: () => void
  reject: (reason: unknown) => void
}

/**
 * The record's only route to disk: temp file, fsync, rename. A reader never sees partial
 * JSON, and `flush()` resolves only once a file containing the state at call time has
 * landed.
 */
export class RecordWriter {
  readonly #file: string
  readonly #snapshot: () => unknown
  #timer: NodeJS.Timeout | null = null
  #current: Promise<void> | null = null
  #waiters: Waiter[] = []

  constructor(file: string, snapshot: () => unknown) {
    this.#file = file
    this.#snapshot = snapshot
  }

  flush(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.#waiters.push({ resolve, reject })
      this.#schedule()
    })
  }

  /** Stop the debounce and land whatever is still owed. */
  async close(): Promise<void> {
    if (this.#timer !== null) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
    while (this.#current !== null || this.#waiters.length > 0) {
      const inflight = this.#current
      if (inflight !== null) await inflight
      else await this.#run()
    }
  }

  #schedule(): void {
    if (this.#timer !== null || this.#current !== null) return
    this.#timer = setTimeout(() => {
      this.#timer = null
      void this.#run()
    }, DEBOUNCE_MS)
    this.#timer.unref()
  }

  #run(): Promise<void> {
    if (this.#current !== null) return this.#current
    const batch = this.#waiters
    if (batch.length === 0) return Promise.resolve()
    this.#waiters = []

    const task = this.#writeBatch(batch)
    this.#current = task
    return task
  }

  async #writeBatch(batch: Waiter[]): Promise<void> {
    try {
      await this.#write(JSON.stringify(this.#snapshot(), null, 2))
      for (const waiter of batch) waiter.resolve()
    } catch (error) {
      const reason = isObserverError(error) ? error : new Error(String(error))
      for (const waiter of batch) waiter.reject(reason)
    } finally {
      this.#current = null
    }
    if (this.#waiters.length > 0) this.#schedule()
  }

  async #write(json: string): Promise<void> {
    const temp = `${this.#file}.${process.pid}.${newId(4)}.tmp`
    try {
      await mkdir(dirname(this.#file), { recursive: true })
      const handle = await open(temp, 'w')
      try {
        await handle.writeFile(json, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      await rename(temp, this.#file)
    } catch (error) {
      await rm(temp, { force: true })
      fail(
        'STORE_UNWRITABLE',
        `Could not write the session to ${this.#file}: ${error instanceof Error ? error.message : String(error)}`,
        'Check that the store home points at a writable directory with free space.',
      )
    }
  }
}
