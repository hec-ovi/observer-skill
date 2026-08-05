/** Where `web-host` serves a built visual, as a JavaScript module the stage can import. */

export function artifactUrl(sessionId: string, artifactId: string): string {
  return `/api/artifact/${encodeURIComponent(sessionId)}/${encodeURIComponent(artifactId)}`
}
