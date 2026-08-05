/**
 * The default provider, and with it the box's own promises: the whole line reaches the
 * engine, `onStart` then `onEnd` fire once each, a new line cuts the old one inside the
 * call, and `stop` ends a line that never began.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeSpeechSynthesis } from '../../testing/fakes.ts'
import { dispose, speak, voices, warm } from '../src/index.ts'
import type { SpeakEnd, VoiceOutConfig } from '../src/index.ts'

const config: VoiceOutConfig = { provider: 'web-speech' }

/** Long, punctuated, and quoted: nothing in the box may shorten or reshape it. */
const LONG_LINE = [
  'The transcript says the model was trained on 1.4 trillion tokens, which is roughly four',
  'times the size of the previous run; the speaker then walks through the scaling law, notes',
  'that the loss curve flattens after the third epoch, and asks whether the same holds for',
  '"mixture of experts" architectures - a question nobody in the room answers, so he moves on',
  'to the evaluation suite, where the numbers are reported without confidence intervals.',
].join(' ')

afterEach(() => {
  dispose()
})

describe('web-speech', () => {
  it('speaks the whole line and reports the start and the end once each', async () => {
    const synth = fakeSpeechSynthesis()
    const events: string[] = []
    let analyser: AnalyserNode | null | undefined

    speak(LONG_LINE, {
      config,
      onStart: (event) => {
        analyser = event.analyser
        events.push('start')
      },
      onEnd: () => events.push('end'),
    })

    await vi.waitFor(() => expect(synth.spoken).toHaveLength(1))
    expect(synth.spoken[0]?.text).toBe(LONG_LINE)

    await vi.waitFor(() => expect(events).toEqual(['start']))
    expect(analyser).toBeNull()

    synth.finish()
    await vi.waitFor(() => expect(events).toEqual(['start', 'end']))
  })

  it('reports word boundaries where the engine gives them', async () => {
    const synth = fakeSpeechSynthesis()
    const marks: number[] = []

    speak('follow along here', { config, onBoundary: (event) => marks.push(event.charIndex) })
    await vi.waitFor(() => expect(synth.spoken).toHaveLength(1))

    synth.spoken[0]?.dispatchEvent(Object.assign(new Event('boundary'), { charIndex: 7 }))
    expect(marks).toEqual([7])
  })

  it('cuts the previous line inside the call that starts the next one', async () => {
    const synth = fakeSpeechSynthesis()
    const first: string[] = []
    const second: string[] = []

    speak('the first answer', { config, onEnd: () => first.push('end') })
    await vi.waitFor(() => expect(synth.spoken).toHaveLength(1))

    speak('the second answer', { config, onEnd: () => second.push('end') })
    expect(first).toEqual(['end'])
    expect(second).toEqual([])

    await vi.waitFor(() => expect(synth.spoken).toHaveLength(1))
    expect(synth.spoken[0]?.text).toBe('the second answer')

    synth.finish()
    await vi.waitFor(() => expect(second).toEqual(['end']))
    expect(first).toEqual(['end'])
  })

  it('ends exactly once when stopped before the line began', async () => {
    const synth = fakeSpeechSynthesis()
    const ends: SpeakEnd[] = []
    let started = false

    const handle = speak('never heard', {
      config,
      onStart: () => {
        started = true
      },
      onEnd: (event) => ends.push(event),
    })
    handle.stop()
    handle.stop()

    expect(ends).toHaveLength(1)
    expect(ends[0]?.error).toBeUndefined()

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(started).toBe(false)
    expect(synth.spoken).toHaveLength(0)
  })

  it('ends the line when the outside signal aborts it', async () => {
    const synth = fakeSpeechSynthesis()
    const controller = new AbortController()
    const ends: SpeakEnd[] = []

    speak('interrupted', { config, signal: controller.signal, onEnd: (event) => ends.push(event) })
    await vi.waitFor(() => expect(synth.spoken).toHaveLength(1))

    controller.abort()
    expect(ends).toHaveLength(1)
    expect(synth.spoken).toHaveLength(0)
  })

  it('reports VOICE_UNAVAILABLE when the only engine there is fails', async () => {
    const synth = fakeSpeechSynthesis()
    const ends: SpeakEnd[] = []

    speak('this will fail', { config, onEnd: (event) => ends.push(event) })
    await vi.waitFor(() => expect(synth.spoken).toHaveLength(1))

    synth.fail()
    await vi.waitFor(() => expect(ends).toHaveLength(1))
    expect(ends[0]?.error?.code).toBe('VOICE_UNAVAILABLE')
  })

  it('lists the engine voices, waiting for the ones that arrive late', async () => {
    fakeSpeechSynthesis().loadVoicesLate()

    const listed = await voices(config)
    expect(listed.map((voice) => voice.id)).toEqual(['fake-en', 'fake-es'])
    expect(listed[0]?.lang).toBe('en-US')
  })

  it('warms without downloading anything, twice over', async () => {
    const real = globalThis.fetch
    const fetched = vi.fn()
    vi.stubGlobal('fetch', fetched)

    await warm(config)
    await warm(config)
    vi.stubGlobal('fetch', real)

    expect(fetched).not.toHaveBeenCalled()
  })
})
