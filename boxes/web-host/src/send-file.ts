import type { Response } from 'express'
import { ObserverError } from '#errors'

/**
 * `res.sendFile` as a promise, with a missing file reported as the shared 404 rather than as
 * a filesystem error.
 */
export function sendFile(
  res: Response,
  file: string,
  missing: { message: string; hint: string },
): Promise<void> {
  return new Promise((done, failed) => {
    res.sendFile(file, (error?: Error) => {
      if (error === undefined || error === null) {
        done()
        return
      }
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT' || code === 'EISDIR') {
        failed(new ObserverError('UNKNOWN_ARTIFACT', missing.message, missing.hint))
        return
      }
      failed(error)
    })
  })
}
