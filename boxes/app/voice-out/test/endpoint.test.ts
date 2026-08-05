/**
 * The endpoint provider: what goes on the wire, what comes back out of the speaker, and what
 * happens when the server is not there.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeAudioContext, fakeSpeechSynthesis } from '../../testing/fakes.ts'
import { dispose, speak } from '../src/index.ts'
import type { SpeakEnd, VoiceOutConfig } from '../src/index.ts'
import { installAudioPlayback } from './audio-playback.ts'
import type { FakeBufferSource } from './audio-playback.ts'

const config: VoiceOutConfig = {
  provider: 'endpoint',
  baseUrl: 'https://speech.example/',
  apiKey: 'sk-test',
  model: 'kokoro',
  voice: 'af_heart',
}

const LINE = 'Pause here: the chart on screen is a cumulative distribution, not a histogram.'

let sources: FakeBufferSource[]
let fetched: ReturnType<typeof vi.fn>
let realFetch: typeof globalThis.fetch

function answerWith(bytes = new ArrayBuffer(64)): void {
  fetched.mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => bytes })
}

function body(): Record<string, unknown> {
  const init = fetched.mock.calls[0]?.[1] as { body: string }
  return JSON.parse(init.body) as Record<string, unknown>
}

beforeEach(() => {
  sources = installAudioPlayback()
  realFetch = globalThis.fetch
  fetched = vi.fn()
  vi.stubGlobal('fetch', fetched)
  answerWith()
})

afterEach(() => {
  dispose()
  vi.stubGlobal('fetch', realFetch)
})

describe('endpoint', () => {
  it('posts the whole line and plays what comes back, through a live analyser', async () => {
    const events: string[] = []
    let analyser: AnalyserNode | null | undefined

    speak(LINE, {
      config,
      onStart: (event) => {
        analyser = event.analyser
        events.push('start')
      },
      onEnd: () => events.push('end'),
    })

    await vi.waitFor(() => expect(sources).toHaveLength(1))
    expect(fetched.mock.calls[0]?.[0]).toBe('https://speech.example/v1/audio/speech')

    const sent = body()
    expect(sent.input).toBe(LINE)
    // Nothing that could cap or reshape the line rides along with it.
    expect(Object.keys(sent).sort()).toEqual(['input', 'model', 'response_format', 'voice'])

    expect(events).toEqual(['start'])
    expect(analyser).not.toBeNull()
    expect(sources[0]?.started).toBe(true)

    sources[0]?.finish()
    await vi.waitFor(() => expect(events).toEqual(['start', 'end']))
  })

  it('sends the key as a Bearer header, and no header at all without one', async () => {
    speak(LINE, { config })
    await vi.waitFor(() => expect(sources).toHaveLength(1))
    const withKey = fetched.mock.calls[0]?.[1] as { headers: Record<string, string> }
    expect(withKey.headers.authorization).toBe('Bearer sk-test')

    fetched.mockClear()
    speak(LINE, { config: { provider: 'endpoint', baseUrl: config.baseUrl } })
    await vi.waitFor(() => expect(fetched).toHaveBeenCalledTimes(1))
    const withoutKey = fetched.mock.calls[0]?.[1] as { headers: Record<string, string> }
    expect(withoutKey.headers).not.toHaveProperty('authorization')
  })

  it('opens one AudioContext for the box, however many lines it plays', async () => {
    speak('first', { config })
    await vi.waitFor(() => expect(sources).toHaveLength(1))
    sources[0]?.finish()

    speak('second', { config })
    await vi.waitFor(() => expect(sources).toHaveLength(2))

    expect(FakeAudioContext.instances).toHaveLength(1)
  })

  it('gives the audio device back on dispose, and stops listening for gestures', async () => {
    const ends: SpeakEnd[] = []
    speak(LINE, { config, onEnd: (event) => ends.push(event) })
    await vi.waitFor(() => expect(sources).toHaveLength(1))

    dispose()

    expect(ends).toHaveLength(1)
    expect(FakeAudioContext.live()).toHaveLength(0)
    // A gesture listener left behind would open a second context on the next click.
    dispatchEvent(new Event('pointerdown'))
    expect(FakeAudioContext.instances).toHaveLength(1)
  })

  it('cuts the line it is playing when the next one starts', async () => {
    const ends: SpeakEnd[] = []
    speak('first', { config, onEnd: (event) => ends.push(event) })
    await vi.waitFor(() => expect(sources).toHaveLength(1))

    speak('second', { config })
    expect(sources[0]?.stopped).toBe(true)
    expect(ends).toHaveLength(1)
    expect(ends[0]?.error).toBeUndefined()
  })

  it('falls back to web-speech when the endpoint is not there', async () => {
    const synth = fakeSpeechSynthesis()
    const ends: SpeakEnd[] = []
    fetched.mockRejectedValue(new Error('connection refused'))

    speak(LINE, { config, onEnd: (event) => ends.push(event) })

    await vi.waitFor(() => expect(synth.spoken).toHaveLength(1))
    expect(synth.spoken[0]?.text).toBe(LINE)
    expect(sources).toHaveLength(0)

    synth.finish()
    await vi.waitFor(() => expect(ends).toHaveLength(1))
    expect(ends[0]?.error).toBeUndefined()
  })

  it('falls back when the endpoint answers with a failure', async () => {
    const synth = fakeSpeechSynthesis()
    fetched.mockResolvedValue({ ok: false, status: 401, arrayBuffer: async () => new ArrayBuffer(0) })

    speak(LINE, { config })

    await vi.waitFor(() => expect(synth.spoken).toHaveLength(1))
    expect(synth.spoken[0]?.text).toBe(LINE)
  })
})
