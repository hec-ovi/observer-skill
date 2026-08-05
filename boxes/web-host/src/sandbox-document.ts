/**
 * The verify frame, and the policy it runs under.
 *
 * The document belongs to `app/stage`: it ships with the app build as `sandbox.html` and
 * uses the same loader the visible stage does, so passing verification means the module will
 * render. This box serves it, and only this box can give it a policy, because a policy
 * travels on an http response and a srcdoc or blob would inherit the page's instead.
 *
 * The document carries one inline script that nothing else can replace: the import map that
 * resolves `echarts`, `d3` and `katex` to the built registry. A policy without an allowance
 * for it silently blocks the map, every artifact fails to resolve its library, and the whole
 * visual toolkit reports `REGISTRY_MISSING`. So the allowance is not written by hand: the
 * hashes are computed from the inline scripts of the document actually being served, which
 * is the one form of this that cannot drift away from the page it protects.
 */

import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'

/** Inline `<script>` bodies, in document order. A script with a `src` has no body to hash. */
export function inlineScripts(html: string): string[] {
  const bodies: string[] = []
  const tag = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
  for (const match of html.matchAll(tag)) {
    const attributes = match[1] ?? ''
    if (/\bsrc\s*=/i.test(attributes)) continue
    bodies.push(match[2] ?? '')
  }
  return bodies
}

/** The `'sha256-...'` source expression for one inline script body, base64 of the raw bytes. */
export function scriptHash(body: string): string {
  return `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`
}

/**
 * `'self'` matches nothing in a sandboxed document, so every source is an absolute origin
 * with a path prefix. `connect-src 'none'` is the network gate: a module that tries to fetch
 * is blocked here, whatever the static checks concluded earlier.
 */
export function sandboxPolicy(origin: string, hashes: string[] = []): string {
  const scripts = [`${origin}/sandbox/`, `${origin}/assets/`, `${origin}/api/artifact/`, ...hashes]
  return [
    "default-src 'none'",
    `script-src ${scripts.join(' ')}`,
    `style-src ${origin}/assets/ 'unsafe-inline'`,
    'img-src data: blob:',
    'font-src data:',
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    'sandbox allow-scripts',
  ].join('; ')
}

/**
 * The frame's document and the hashes of its own inline scripts, read once and re-read when
 * the file changes, so a rebuilt app is picked up without a restart.
 */
export class SandboxFrame {
  readonly #path: string
  #cached: { key: string; html: string; hashes: string[] } | null = null

  constructor(path: string) {
    this.#path = path
  }

  async read(): Promise<{ html: string; hashes: string[] }> {
    const info = await stat(this.#path)
    const key = `${info.size}:${info.mtimeMs}`
    if (this.#cached?.key === key) return this.#cached

    const html = await readFile(this.#path, 'utf8')
    const hashes = inlineScripts(html).map(scriptHash)
    this.#cached = { key, html, hashes }
    return this.#cached
  }
}
