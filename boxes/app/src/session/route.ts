/** The one deep link the page has: `/s/:id`. Anything else is the feed. */

const SESSION_PATH = /^\/s\/([A-Za-z0-9._-]+)\/?$/

export function sessionIdFrom(pathname: string): string | null {
  return SESSION_PATH.exec(pathname)?.[1] ?? null
}

export function sessionPath(sessionId: string): string {
  return `/s/${sessionId}`
}
