/**
 * The wire between the page and the verify frame.
 *
 * The frame is served on its own route so it carries its own CSP; it is sandboxed without
 * `allow-same-origin`, so it has an opaque origin, no storage, and no way into the page.
 * Identity is established once by `hello`, and everything after that rides a MessagePort,
 * which is unforgeable and point to point.
 */

/** The document `web-host` serves the frame from. */
export const SANDBOX_PATH = '/sandbox/frame'

/** Every module is verified at the same size, so two runs are comparable. */
export const SANDBOX_SIZE = { width: 960, height: 540 }

export const DEFAULT_TIMEOUT_MS = 8000

/** Parent to frame, once, carrying the port the rest of the run travels on. */
export interface SandboxInit {
  type: 'init'
  url: string
}

/** Frame to parent. */
export type SandboxMessage =
  | { type: 'hello' }
  | { type: 'error'; message: string }
  | { type: 'mounted'; width: number; height: number }
  | { type: 'snapshot'; png: string }
  | { type: 'done' }
