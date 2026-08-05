/**
 * The browser recognizer ends its own session after a few seconds of silence, and there is no
 * setting for that. A hold that outlives a session reopens one, twice, and then stops asking.
 */

import { describe, expect, it, vi } from 'vitest'
import { FakeSpeechRecognition } from '../../testing/fakes.ts'
import { hear, recordedListener } from './support.ts'

const PAST_THE_RESTART_DELAY = 200

describe('the web-speech provider', () => {
  it('reopens a session that ended by itself, at most twice', async () => {
    vi.useFakeTimers()
    const { listener, heard } = recordedListener({ provider: 'web-speech' })

    await listener.start()
    hear(1, 0.5)

    for (let i = 0; i < 5; i += 1) {
      FakeSpeechRecognition.last().stop()
      await vi.advanceTimersByTimeAsync(PAST_THE_RESTART_DELAY)
    }
    expect(FakeSpeechRecognition.instances).toHaveLength(3)

    FakeSpeechRecognition.last().say('still holding')
    await listener.stop()

    expect(heard).toEqual(['still holding'])
  })

  it('reports the engine's own failure and delivers an empty utterance', async () => {
    const { listener, heard } = recordedListener({ provider: 'web-speech' })

    await listener.start()
    hear(1, 0.5)
    FakeSpeechRecognition.last().fail('network')
    await listener.stop()

    expect(heard).toEqual([''])
    expect(listener.reason).toBe('network')
  })
})
