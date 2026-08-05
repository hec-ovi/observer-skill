/**
 * stdout belongs to the MCP protocol. Every diagnostic this box emits goes to stderr, and
 * it goes through here so there is one place to look for it.
 */

export function report(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[observer/${scope}] ${message}`)
}
