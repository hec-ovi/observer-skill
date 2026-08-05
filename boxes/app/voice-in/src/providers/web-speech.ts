/**
 * The browser's own recognizer. It listens while the button is down and hands over the text
 * it settled on when the button comes up.
 *
 * Two facts shape this file. The engine ends its own session after a few seconds of silence
 * and there is no setting for that timeout, so a hold that outlives a session reopens one.
 * And it opens the microphone itself: the samples it hears are not readable, which is why
 * the gate and the diagnostic come from the listener's own capture instead.
 */

import { EngineFailure, nameOf } from '../errors.ts'
import type { Hold, HoldOptions, Provider } from './provider.ts'

/** Never call start() straight out of the end handler; Chrome answers with a network storm. */
const RESTART_DELAY_MS = 120
/** A session that ends itself reopens twice. After that the hold rides on what it has. */
const MAX_RESTARTS = 2
/** stop() does not always report the end promptly. */
const FINAL_WAIT_MS = 3000

/** Lifecycle noise during a hold rather than a failure. */
const SILENCE = new Set(['no-speech', 'aborted'])
/** The service itself refused; another press will not help. */
const REFUSALS = new Set(['not-allowed', 'service-not-allowed'])

interface RecognitionAlternative {
  readonly transcript: string
}

interface RecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: RecognitionAlternative | undefined
}

interface RecognitionResultList {
  readonly length: number
  readonly [index: number]: RecognitionResult | undefined
}

interface RecognitionEvent extends Event {
  readonly results: RecognitionResultList
  readonly resultIndex: number
}

interface RecognitionErrorEvent extends Event {
  readonly error: string
}

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: RecognitionErrorEvent) => void) | null
  onend: ((event: Event) => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionCtor = new () => Recognition

/** One space between two pieces, whichever of them the engine left empty. */
function joinText(left: string, right: string): string {
  const head = left.trim()
  const tail = right.trim()
  if (!tail) return head
  return head ? `${head} ${tail}` : tail
}

function recognitionCtor(): RecognitionCtor | null {
  const scope = globalThis as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

class WebSpeechHold implements Hold {
  #options: HoldOptions
  #recognition: Recognition | null = null
  #final = ''
  #held = true
  #ended = false
  #restarts = 0
  #lastError: string | null = null
  #failure: EngineFailure | null = null
  #resolve: ((text: string) => void) | null = null
  #timer: ReturnType<typeof setTimeout> | null = null

  constructor(options: HoldOptions) {
    this.#options = options
    this.#open()
  }

  async finish(): Promise<string> {
    this.#held = false
    this.#clearTimer()
    const recognition = this.#recognition

    if (this.#failure) {
      recognition?.abort()
      throw this.#failure
    }
    if (!recognition || this.#ended) return this.#final.trim()

    const text = await new Promise<string>((resolve) => {
      this.#resolve = resolve
      this.#timer = setTimeout(() => this.#settle(), FINAL_WAIT_MS)
      try {
        recognition.stop()
      } catch {
        // Already ended: the end handler settles it, or the timer does.
      }
    })

    if (this.#failure) throw this.#failure
    return text
  }

  cancel(): void {
    this.#held = false
    this.#clearTimer()
    this.#recognition?.abort()
    this.#recognition = null
  }

  #open(): void {
    const Ctor = recognitionCtor()
    if (!Ctor) {
      this.#failure = new EngineFailure('no-recognizer', 'unavailable')
      return
    }

    const recognition = new Ctor()
    recognition.lang = this.#options.language
    // Survives intra-hold pauses where the engine honours it.
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => this.#read(event)
    recognition.onerror = (event) => this.#failed(event.error)
    recognition.onend = () => this.#closed()

    this.#recognition = recognition
    this.#ended = false
    this.#lastError = null
    try {
      recognition.start()
    } catch (error) {
      // Already running is the one throw here, and it means the session we want is open.
      const name = nameOf(error)
      if (name !== 'InvalidStateError') this.#failure = new EngineFailure(name)
    }
  }

  #read(event: RecognitionEvent): void {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i]
      const alternative = result?.[0]
      if (!result || !alternative) continue
      if (result.isFinal) this.#final = joinText(this.#final, alternative.transcript)
      else interim = joinText(interim, alternative.transcript)
    }
    this.#options.onPartial(joinText(this.#final, interim))
  }

  #failed(error: string): void {
    this.#lastError = error
    if (SILENCE.has(error)) return
    this.#failure = new EngineFailure(error, REFUSALS.has(error) ? 'unavailable' : 'idle')
  }

  #closed(): void {
    this.#ended = true
    const silence = this.#lastError === null || this.#lastError === 'no-speech'
    if (this.#held && !this.#failure && silence && this.#restarts < MAX_RESTARTS) {
      this.#restarts += 1
      this.#timer = setTimeout(() => {
        if (this.#held) this.#open()
      }, RESTART_DELAY_MS)
      return
    }
    this.#settle()
  }

  #settle(): void {
    this.#clearTimer()
    const resolve = this.#resolve
    this.#resolve = null
    resolve?.(this.#final.trim())
  }

  #clearTimer(): void {
    if (this.#timer !== null) clearTimeout(this.#timer)
    this.#timer = null
  }
}

export const webSpeechProvider: Provider = {
  id: 'web-speech',
  available: () => recognitionCtor() !== null,
  listen: (options) => new WebSpeechHold(options),
}
