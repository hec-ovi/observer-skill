/**
 * What happens when the chosen provider cannot run: it falls back to `web-speech`, and only
 * when that is gone too does the box report `VOICE_UNAVAILABLE`. Plus the two configs that
 * are wrong before any line starts, and the cost the settings panel shows up front.
 *
 * No model is downloaded here: jsdom has no Worker, which is exactly the condition the
 * Pocket provider refuses to run under.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSpeechSynthesis } from '../../testing/fakes.ts'
import { VoiceOutError, dispose, providerInfo, speak, voices, warm } from '../src/index.ts'
import type { SpeakEnd, VoiceOutConfig } from '../src/index.ts'

const pocket: VoiceOutConfig = { provider: 'pocket', voice: 'alba' }
const LINE = 'The second half of the talk is where the argument actually lands.'

let fetched: ReturnType<typeof vi.fn>
let realFetch: typeof globalThis.fetch

beforeEach(() => {
  realFetch = globalThis.fetch
  fetched = vi.fn()
  vi.stubGlobal('fetch', fetched)
})

afterEach(() => {
  dispose()
  vi.stubGlobal('fetch', realFetch)
  vi.stubGlobal('speechSynthesis', fakeSpeechSynthesis())
})

describe('falling back', () => {
  it('speaks through web-speech when the browser cannot run the model', async () => {
    const synth = fakeSpeechSynthesis()
    const ends: SpeakEnd[] = []

    speak(LINE, { config: pocket, onEnd: (event) => ends.push(event) })

    await vi.waitFor(() => expect(synth.spoken).toHaveLength(1))
    expect(synth.spoken[0]?.text).toBe(LINE)
    expect(fetched).not.toHaveBeenCalled()

    synth.finish()
    await vi.waitFor(() => expect(ends).toHaveLength(1))
    expect(ends[0]?.error).toBeUndefined()
  })

  it('reports VOICE_UNAVAILABLE only when nothing can make a sound', async () => {
    vi.stubGlobal('speechSynthesis', undefined)
    const ends: SpeakEnd[] = []

    speak(LINE, { config: pocket, onEnd: (event) => ends.push(event) })

    await vi.waitFor(() => expect(ends).toHaveLength(1))
    expect(ends[0]?.error).toBeInstanceOf(VoiceOutError)
    expect(ends[0]?.error?.code).toBe('VOICE_UNAVAILABLE')
    expect(fetched).not.toHaveBeenCalled()
  })

  it('warms a provider this browser cannot run without downloading anything', async () => {
    await warm(pocket)
    expect(fetched).not.toHaveBeenCalled()
  })
})

describe('a config that is wrong before any line starts', () => {
  it('refuses a provider that does not exist', () => {
    const config = { provider: 'elevenlabs' } as unknown as VoiceOutConfig
    expect(() => speak(LINE, { config })).toThrow(VoiceOutError)
    try {
      speak(LINE, { config })
    } catch (error) {
      expect((error as VoiceOutError).code).toBe('INVALID_VOICE_CONFIG')
    }
  })

  it('refuses to warm a provider that does not exist, before any download', async () => {
    const config = { provider: 'elevenlabs' } as unknown as VoiceOutConfig
    const error = await warm(config).catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(VoiceOutError)
    expect((error as VoiceOutError).code).toBe('INVALID_VOICE_CONFIG')
    expect(fetched).not.toHaveBeenCalled()
  })

  it('refuses the endpoint provider without a URL to reach', () => {
    expect(() => speak(LINE, { config: { provider: 'endpoint' } })).toThrow(
      /needs a baseUrl/,
    )
    expect(() =>
      speak(LINE, { config: { provider: 'endpoint', baseUrl: 'localhost:8880' } }),
    ).toThrow(/is not an http URL/)
  })
})

describe('the voices the panel offers', () => {
  it('offers the six permissively licensed pocket voices and no others', async () => {
    const listed = await voices(pocket)

    expect(listed.map((voice) => voice.id)).toEqual([
      'alba',
      'azelma',
      'eponine',
      'fantine',
      'javert',
      'marius',
    ])
    // The bundle also carries these two, whose source recordings are CC BY-NC.
    expect(listed.map((voice) => voice.id)).not.toContain('cosette')
    expect(listed.map((voice) => voice.id)).not.toContain('jean')
  })
})

describe('what a provider costs', () => {
  it('names the one-time download and the attribution the product must show', () => {
    expect(providerInfo({ provider: 'web-speech' })).toEqual({
      id: 'web-speech',
      downloadBytes: 0,
      attribution: '',
    })

    const info = providerInfo(pocket)
    expect(info.downloadBytes).toBe(195_361_827)
    expect(info.attribution).toContain('CC BY 4.0')
    expect(info.attribution).toContain('Kyutai')
  })
})
