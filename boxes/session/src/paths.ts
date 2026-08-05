import { isAbsolute, join, normalize, relative, sep } from 'node:path'
import { fail } from '#errors'

/** Every session lives in its own directory, beside its transcript and its artifacts. */
export function sessionsDir(home: string): string {
  return join(home, 'sessions')
}

export function sessionDir(home: string, id: string): string {
  return join(sessionsDir(home), id)
}

export function sessionFile(home: string, id: string): string {
  return join(sessionDir(home, id), 'session.json')
}

/**
 * A path as it is stored in the record: relative to `home` and written with forward
 * slashes, so moving the home directory or reading the file on another machine still
 * works. Absolute paths inside `home` are converted; anything outside it is refused.
 */
export function toHomeRelative(home: string, path: string): string {
  const rel = isAbsolute(path) ? relative(home, path) : normalize(path)
  const parts = rel.split(sep)
  if (rel === '' || isAbsolute(rel) || parts.includes('..')) {
    fail(
      'INVALID_PATCH',
      `Path ${path} is not inside the store home ${home}.`,
      'Write artifact files under $home/sessions/<id>/ and pass that path.',
    )
  }
  return parts.join('/')
}
