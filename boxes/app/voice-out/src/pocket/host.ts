/**
 * The page's side of Pocket TTS: one worker, one player, one line at a time.
 *
 * Loading is asked for as often as the settings panel likes and happens once. A line that is
 * cut stops the worker, fades the speaker, and settles immediately; audio tagged with an old
 * line id is dropped rather than played over its replacement.
 */

import type { ProgressListener } from '../../schema/voice-out.ts'
import type { AudioHub } from '../audio.ts'
import type { SpeakRequest } from '../providers/provider.ts'
import { PcmStreamPlayer } from './pcm-player.ts'
import type { EngineMessage, LoadRequest } from './protocol.ts'

export type PocketOptions = Omit<LoadRequest, 'type'>

interface ActiveLine {
  id: number
  request: SpeakRequest
  started: boolean
  audible: boolean
  settle: (error?: Error) => void
}

export class PocketHost {
  readonly #audio: AudioHub
  readonly #worker: Worker
  #player: PcmStreamPlayer | null = null
  #loaded: Promise<void> | null = null
  #settleLoad: { resolve: () => void; reject: (error: Error) => void } | null = null
  readonly #progress = new Set<ProgressListener>()
  #next = 0
  #line: ActiveLine | null = null

  constructor(audio: AudioHub) {
    this.#audio = audio
    this.#worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    this.#worker.addEventListener('message', (event: MessageEvent<EngineMessage>) => {
      this.#receive(event.data)
    })
  }

  /**
   * Download, compile, and speak one line into the void. Safe to call repeatedly: the work
   * happens once, and every listener handed in along the way hears it, so a line spoken
   * mid-download cannot take the settings panel's bar away from it.
   */
  load(options: PocketOptions, onProgress?: ProgressListener): Promise<void> {
    if (onProgress) this.#progress.add(onProgress)
    this.#loaded ??= new Promise<void>((resolve, reject) => {
      this.#settleLoad = { resolve, reject }
      this.#worker.postMessage({ type: 'load', ...options })
    })
    return this.#loaded
  }

  async speak(text: string, voice: string, request: SpeakRequest): Promise<void> {
    const player = await this.#ensurePlayer()
    await this.#audio.resume()

    const id = (this.#next += 1)
    player.reset()

    return new Promise<void>((resolve, reject) => {
      const line: ActiveLine = {
        id,
        request,
        started: false,
        audible: false,
        settle: (error) => {
          if (this.#line?.id !== id) return
          this.#line = null
          request.signal.removeEventListener('abort', cut)
          if (error) reject(error)
          else resolve()
        },
      }
      const cut = (): void => {
        this.#worker.postMessage({ type: 'stop', line: id })
        player.reset()
        line.settle()
      }

      this.#line = line
      request.signal.addEventListener('abort', cut, { once: true })
      this.#worker.postMessage({ type: 'speak', line: id, text, voice })
    })
  }

  dispose(): void {
    this.#line?.settle()
    this.#player?.dispose()
    this.#player = null
    this.#loaded = null
    this.#progress.clear()
    this.#worker.postMessage({ type: 'dispose' })
    this.#worker.terminate()
  }

  async #ensurePlayer(): Promise<PcmStreamPlayer> {
    this.#player ??= await PcmStreamPlayer.open(this.#audio, {
      onStarted: () => {
        const line = this.#line
        if (!line || line.started) return
        line.started = true
        line.request.onStart(this.#audio.output().analyser)
      },
      onComplete: () => this.#line?.settle(),
    })
    return this.#player
  }

  #receive(message: EngineMessage): void {
    switch (message.type) {
      case 'progress': {
        const progress = { step: message.step, loaded: message.loaded, total: message.total }
        for (const listen of this.#progress) listen(progress)
        return
      }
      case 'ready':
        this.#progress.clear()
        this.#settleLoad?.resolve()
        return
      case 'audio': {
        const line = this.#line
        if (!line || line.id !== message.line) return
        line.audible = true
        this.#player?.push(message.pcm, message.sampleRate)
        return
      }
      case 'done': {
        const line = this.#line
        if (!line || line.id !== message.line) return
        // Nothing was produced, so nothing will play out and say so.
        if (line.audible) this.#player?.endStream()
        else line.settle()
        return
      }
      case 'failed':
        if (message.line === null) {
          this.#loaded = null
          this.#progress.clear()
          this.#settleLoad?.reject(new Error(message.reason))
          return
        }
        if (this.#line?.id === message.line) this.#line.settle(new Error(message.reason))
        return
    }
  }
}
