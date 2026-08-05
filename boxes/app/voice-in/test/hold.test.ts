/**
 * The hold itself: one utterance out, one microphone session, and the gate that keeps
 * silence away from the engine.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  FakeAudioContext,
  FakeMediaStream,
  FakeSpeechRecognition,
  setMicrophoneAccess,
} from '../../testing/fakes.ts'
import { createListener, ListenError } from '../src/index.ts'
import { hear, recordedListener } from './support.ts'

describe('a hold', () => {
  it('delivers one utterance and lets go of the microphone', async () => {
    const { listener, heard, partials, states, diagnostics } = recordedListener({
      provider: 'auto',
    })
    expect(listener.engine).toBe('web-speech')

    await listener.start()
    expect(listener.state).toBe('listening')
    hear(1, 0.5)

    const recognition = FakeSpeechRecognition.last()
    recognition.say('what is a', { isFinal: false })
    recognition.say('what is a matrix')

    await listener.stop()
    await listener.stop()

    expect(heard).toEqual(['what is a matrix'])
    expect(partials).toContain('what is a')
    expect(states).toEqual(['listening', 'working', 'idle'])
    expect(diagnostics).toEqual([{ device: 'default', seconds: 1, peak: 0.5 }])
    expect(FakeMediaStream.live()).toHaveLength(0)
    expect(FakeAudioContext.live()).toHaveLength(0)
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('drops a hold shorter than minSeconds', async () => {
    const { listener, heard, diagnostics } = recordedListener({ provider: 'auto' })

    await listener.start()
    hear(0.3, 0.5)
    FakeSpeechRecognition.last().say('too short')
    await listener.stop()

    expect(heard).toEqual([])
    expect(diagnostics[0]?.seconds).toBeCloseTo(0.3)
    expect(listener.state).toBe('idle')
  })

  it('drops a hold under minPeak', async () => {
    const { listener, heard, diagnostics } = recordedListener({ provider: 'auto' })

    await listener.start()
    hear(2, 0.004)
    FakeSpeechRecognition.last().say('room tone')
    await listener.stop()

    expect(heard).toEqual([])
    expect(diagnostics[0]?.peak).toBeCloseTo(0.004)
    expect(FakeMediaStream.live()).toHaveLength(0)
  })

  it('settles into denied and never asks for the microphone again', async () => {
    setMicrophoneAccess('denied')
    const { listener, heard, states } = recordedListener({ provider: 'auto' })

    await listener.start()
    await listener.stop()
    await listener.start()

    expect(listener.state).toBe('denied')
    expect(listener.reason).toBe('MIC_DENIED')
    expect(states).toEqual(['listening', 'denied'])
    expect(heard).toEqual([])
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('refuses a config it cannot run', () => {
    expect(() => createListener({ config: { provider: 'endpoint' } })).toThrow(ListenError)
    try {
      createListener({ config: { provider: 'endpoint' } })
    } catch (error) {
      expect((error as ListenError).code).toBe('INVALID_LISTENING_CONFIG')
    }
  })
})

describe('the listener', () => {
  it('is unavailable when the named engine cannot run here', async () => {
    // jsdom has no Worker, which is what whisper-web needs to keep inference off the page.
    const { listener, states } = recordedListener({ provider: 'whisper-web' })

    expect(listener.supported).toBe(false)
    expect(listener.engine).toBeNull()
    expect(listener.state).toBe('unavailable')
    expect(listener.reason).toBe('NO_PROVIDER')

    await listener.start()
    expect(states).toEqual([])
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
  })

  it('takes a new language on the next hold', async () => {
    const { listener } = recordedListener({ provider: 'web-speech' })

    listener.setLanguage('es-ES')
    await listener.start()

    expect(FakeSpeechRecognition.last().lang).toBe('es-ES')
    await listener.stop()
  })

  it('gives the microphone back when disposed mid-hold', async () => {
    const { listener, heard } = recordedListener({ provider: 'auto' })

    await listener.start()
    hear(1, 0.5)
    listener.dispose()

    expect(FakeMediaStream.live()).toHaveLength(0)
    expect(FakeSpeechRecognition.last().started).toBe(false)

    await listener.start()
    await listener.stop()

    expect(heard).toEqual([])
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('gives the microphone back when disposed while it is still opening', async () => {
    // The permission prompt, the device open and the first worklet fetch all live in this
    // window, so an unmount mid-press lands here rather than after the microphone is live.
    let grant = (): void => {}
    const prompt = new Promise<void>((resolve) => {
      grant = resolve
    })
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(async () => {
      await prompt
      return new FakeMediaStream() as unknown as MediaStream
    })

    const { listener, heard, states } = recordedListener({ provider: 'auto' })
    const started = listener.start()
    listener.dispose()
    grant()
    await started
    await listener.stop()

    expect(FakeMediaStream.live()).toHaveLength(0)
    expect(FakeAudioContext.live()).toHaveLength(0)
    expect(FakeSpeechRecognition.last().started).toBe(false)
    expect(heard).toEqual([])
    expect(states).toEqual(['listening'])
  })
})
