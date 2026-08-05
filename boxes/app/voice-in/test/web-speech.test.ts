/**
 * The browser recognizer ends its own session after a few seconds of silence, and there is no
 * setting for that. A hold that outlives a session reopens one, twice, and then stops asking.
 */

import { describe, expect, it, vi } from 'vitest'
import { FakeSpeechRecognition } from '../../testing/fakes.ts'
import { flush, hear, recordedListener } from './support.ts'

const PAST_THE_RESTART_DELAY = 200
const PAST_THE_FINAL_WAIT = 3500

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

  it('shuts a session down that never reported its end, so no late result lands', async () => {
    vi.useFakeTimers()
    const { listener, heard, partials } = recordedListener({ provider: 'web-speech' })

    await listener.start()
    hear(1, 0.5)
    const recognition = FakeSpeechRecognition.last()
    recognition.say('what is a matrix')
    // A stop() the engine never answers is the case the final wait exists for.
    recognition.stop = (): void => {}

    const stopped = listener.stop()
    await vi.advanceTimersByTimeAsync(PAST_THE_FINAL_WAIT)
    await stopped

    expect(heard).toEqual(['what is a matrix'])
    expect(listener.state).toBe('idle')
    expect(recognition.started).toBe(false)

    const delivered = partials.length
    recognition.say('stale tail')
    expect(partials).toHaveLength(delivered)
  })

  it('lets go of a release that was still waiting when the listener was disposed', async () => {
    const { listener, heard } = recordedListener({ provider: 'web-speech' })

    await listener.start()
    hear(1, 0.5)
    const recognition = FakeSpeechRecognition.last()
    recognition.say('half a question')
    recognition.stop = (): void => {}

    const stopped = listener.stop()
    await flush()
    expect(listener.state).toBe('working')

    listener.dispose()
    await stopped

    expect(recognition.started).toBe(false)
    expect(heard).toEqual([])
  })

  it('delivers an empty utterance when the engine fails, with the reason', async () => {
    const { listener, heard } = recordedListener({ provider: 'web-speech' })

    await listener.start()
    hear(1, 0.5)
    FakeSpeechRecognition.last().fail('network')
    await listener.stop()

    expect(heard).toEqual([''])
    expect(listener.reason).toBe('network')
  })
})
