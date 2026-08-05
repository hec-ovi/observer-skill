/**
 * The verify frame's script.
 *
 * It runs in an opaque origin with no network, no storage, and no way into the page. It
 * loads the module through the same loader the visible stage uses, mounts it at a fixed
 * size and a fixed theme, reports everything that went wrong, photographs what was drawn,
 * and unmounts.
 */

import '@app/tokens.css'
import { theme } from '@app/theme.ts'
import { describeError } from '../src/errors.ts'
import { loadArtifactModule } from '../src/loader.ts'
import type { SandboxInit, SandboxMessage } from '../src/protocol.ts'
import { ArtifactRuntime } from '../src/runtime.ts'
import { capture } from './capture.ts'

let port: MessagePort | null = null
const queued: SandboxMessage[] = []

/** Nothing is lost that happened before the parent handed over the port. */
function send(message: SandboxMessage): void {
  if (port) port.postMessage(message)
  else queued.push(message)
}

/* ------------------------------------------------------------------ everything that fails */

addEventListener(
  'error',
  (event: Event) => {
    if (event instanceof ErrorEvent) {
      send({ type: 'error', message: event.error ? describeError(event.error) : event.message })
      return
    }
    // A resource failed to load. These do not bubble, hence the capture phase.
    const target = event.target as { tagName?: string; src?: string; href?: string } | null
    send({ type: 'error', message: `failed to load ${target?.src ?? target?.href ?? target?.tagName}` })
  },
  true,
)

addEventListener('unhandledrejection', (event) => {
  send({ type: 'error', message: `unhandled rejection: ${describeError(event.reason)}` })
})

// The proof that a module tried to reach the network, or anything else the CSP refuses.
document.addEventListener('securitypolicyviolation', (event) => {
  send({ type: 'error', message: `blocked by ${event.effectiveDirective}: ${event.blockedURI}` })
})

const consoleError = console.error.bind(console)
console.error = (...args: unknown[]): void => {
  send({ type: 'error', message: `console.error: ${args.map((arg) => describeError(arg)).join(' ')}` })
  consoleError(...args)
}

/* ------------------------------------------------------------------------------- storage */

/** The real ones throw in an opaque origin, and ordinary chart code reads them. */
function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, String(value)),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    },
  } as Storage
}

for (const name of ['localStorage', 'sessionStorage']) {
  try {
    Object.defineProperty(window, name, { value: memoryStorage(), configurable: true })
  } catch {
    // Left as the engine provides it; every read below is guarded anyway.
  }
}

/* ----------------------------------------------------------------------------------- run */

function rootElement(): HTMLElement {
  const el = document.getElementById('root')
  if (!el) throw new Error('the verify document has no #root')
  return el
}

/** Fonts loaded and two frames painted: what "it has rendered" means. */
async function settled(): Promise<void> {
  await document.fonts.ready
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

async function run(url: string): Promise<void> {
  let runtime: ArtifactRuntime | null = null
  try {
    // Fixed theme: the picture must not depend on the machine that took it.
    theme.set('light')
    const tokens = theme.readTokens()
    const root = rootElement()
    const module = await loadArtifactModule(url)

    const box = root.getBoundingClientRect()
    runtime = new ArtifactRuntime(root, module, {
      theme: tokens,
      time: 0,
      size: { width: box.width, height: box.height },
    })
    runtime.mount()
    await settled()

    const drawn = root.getBoundingClientRect()
    if (root.childElementCount === 0 || drawn.width < 1 || drawn.height < 1) {
      throw new Error('mount() returned but drew nothing')
    }
    send({ type: 'mounted', width: Math.round(drawn.width), height: Math.round(drawn.height) })
    send({ type: 'snapshot', png: await capture(root, tokens.surface) })
  } catch (error) {
    send({ type: 'error', message: describeError(error) })
  } finally {
    runtime?.unmount()
    send({ type: 'done' })
  }
}

/* ----------------------------------------------------------------------------- handshake */

addEventListener('message', (event) => {
  const data = event.data as Partial<SandboxInit> | null
  const channel = event.ports[0]
  if (data?.type !== 'init' || typeof data.url !== 'string' || !channel) return
  port = channel
  port.start()
  for (const message of queued.splice(0)) port.postMessage(message)
  void run(data.url)
})

// The parent identifies this frame by its window, so the greeting carries nothing.
parent.postMessage({ type: 'hello' }, '*')
