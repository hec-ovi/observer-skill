/**
 * The hidden half: a module is loaded, mounted, photographed, and unmounted in an isolated
 * frame before the user ever sees it.
 *
 * The frame is off screen rather than `display: none`, because a module that is never laid
 * out never draws. It is removed when the run ends, which is also the only way to stop a
 * module that will not stop on its own.
 */

import { DEFAULT_TIMEOUT_MS, SANDBOX_PATH, SANDBOX_SIZE, type SandboxMessage } from './protocol.ts'
import type { ArtifactSize, VerifyRequest, VerifyResult, Verifier } from './types.ts'

export interface VerifierOptions {
  onResult(result: VerifyResult): void
}

const FRAME_STYLE = [
  'position:fixed',
  'left:-10000px',
  'top:0',
  `width:${SANDBOX_SIZE.width}px`,
  `height:${SANDBOX_SIZE.height}px`,
  'border:0',
  'opacity:0',
  'pointer-events:none',
].join(';')

class Verification {
  readonly #request: VerifyRequest
  readonly #onResult: (result: VerifyResult) => void
  readonly #frame = document.createElement('iframe')
  readonly #timeoutMs: number
  readonly #errors: string[] = []

  #size: ArtifactSize = { ...SANDBOX_SIZE }
  #snapshot: string | undefined
  #mounted = false
  #port: MessagePort | null = null
  #timer: ReturnType<typeof setTimeout> | null = null
  #settled = false

  constructor(request: VerifyRequest, onResult: (result: VerifyResult) => void) {
    this.#request = request
    this.#onResult = onResult
    this.#timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  start(): void {
    const frame = this.#frame
    // No `allow-same-origin`: with it, a same-origin document could remove the attribute.
    frame.setAttribute('sandbox', 'allow-scripts')
    frame.setAttribute('referrerpolicy', 'no-referrer')
    frame.setAttribute('allow', '')
    frame.setAttribute('aria-hidden', 'true')
    frame.title = 'artifact verification'
    frame.style.cssText = FRAME_STYLE
    frame.src = SANDBOX_PATH

    addEventListener('message', this.#onWindowMessage)
    this.#timer = setTimeout(() => {
      this.#errors.push(
        `ARTIFACT_TIMEOUT: the module did not finish mounting within ${this.#timeoutMs} ms`,
      )
      this.#finish()
    }, this.#timeoutMs)

    document.body.append(frame)
  }

  /** The frame says it is running. An opaque origin has no origin string, so `e.source` is
   * the identity, and `'*'` is the only target that can match. */
  readonly #onWindowMessage = (event: MessageEvent): void => {
    if (event.source !== this.#frame.contentWindow) return
    if ((event.data as Partial<SandboxMessage> | null)?.type !== 'hello') return
    removeEventListener('message', this.#onWindowMessage)

    const channel = new MessageChannel()
    this.#port = channel.port1
    channel.port1.onmessage = this.#onPortMessage
    channel.port1.start()
    this.#frame.contentWindow?.postMessage(
      { type: 'init', url: new URL(this.#request.url, location.href).href },
      '*',
      [channel.port2],
    )
  }

  readonly #onPortMessage = (event: MessageEvent): void => {
    const message = event.data as SandboxMessage
    switch (message.type) {
      case 'error':
        this.#errors.push(message.message)
        break
      case 'mounted':
        this.#mounted = true
        this.#size = { width: message.width, height: message.height }
        break
      case 'snapshot':
        this.#snapshot = message.png
        break
      case 'done':
        this.#finish()
        break
    }
  }

  #finish(): void {
    if (this.#settled) return
    this.#settled = true
    if (this.#timer !== null) clearTimeout(this.#timer)
    removeEventListener('message', this.#onWindowMessage)
    this.#port?.close()
    // Removing the frame is what actually stops the module.
    this.#frame.remove()

    this.#onResult({
      requestId: this.#request.requestId,
      ok: this.#mounted && this.#errors.length === 0,
      errors: this.#errors,
      size: this.#size,
      snapshot: this.#snapshot,
    })
  }
}

export function createVerifier({ onResult }: VerifierOptions): Verifier {
  return {
    verify(request) {
      new Verification(request, onResult).start()
    },
  }
}
