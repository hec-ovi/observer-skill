/**
 * The local model: what reaches the worker, and the fact that the worker outlives a hold, so
 * two holds share one channel and each has to get its own answer back.
 */

import { describe, expect, it, vi } from 'vitest'
import { FakeWorker } from '../../testing/fakes.ts'
import type { TranscribeRequest } from '../src/providers/whisper-web.ts'
import { flush, hear, recordedListener } from './support.ts'

// jsdom has no Worker, and the provider is right to check for one. This file is the only
// place that hands it one.
vi.stubGlobal('Worker', FakeWorker)

const MODULE_URL = 'http://127.0.0.1:4830/vendor/transformers'

/** Everything handed to the worker so far, newest last. */
function requests(): TranscribeRequest[] {
  return FakeWorker.instances.flatMap((worker) => worker.posted as TranscribeRequest[])
}

function listening(model?: string) {
  return recordedListener({ provider: 'whisper-web', moduleUrl: MODULE_URL, model })
}

describe('the whisper-web provider', () => {
  it('hands the worker the configured build, model, language and 16 kHz samples', async () => {
    const { listener, heard } = listening('onnx-community/whisper-base')
    expect(listener.engine).toBe('whisper-web')

    await listener.start()
    hear(1.5, 0.4)
    const stopped = listener.stop()
    await flush()

    const request = requests().at(-1)
    expect(request?.moduleUrl).toBe(MODULE_URL)
    expect(request?.model).toBe('onnx-community/whisper-base')
    expect(request?.language).toBe('english')
    expect(request?.sampleRate).toBe(16000)
    expect(request?.pcm).toHaveLength(24000)

    FakeWorker.last().reply({ id: request?.id, ok: true, text: '  what is a matrix  ' })
    await stopped

    expect(heard).toEqual(['what is a matrix'])
    expect(listener.state).toBe('idle')
  })

  it('keeps two holds sharing the worker from crossing their answers', async () => {
    const a = listening()
    const b = listening()

    await a.listener.start()
    hear(1, 0.5)
    await b.listener.start()
    hear(1, 0.5)

    const finished = Promise.all([a.listener.stop(), b.listener.stop()])
    await flush()

    const [first, second] = requests().slice(-2)
    expect(FakeWorker.live()).toHaveLength(1)
    expect(first?.id).not.toBe(second?.id)

    // The later hold answers first, which is what the shorter clip does.
    FakeWorker.last().reply({ id: second?.id, ok: true, text: 'b said that' })
    FakeWorker.last().reply({ id: first?.id, ok: true, text: 'a said this' })
    await flush()

    expect(a.heard).toEqual(['a said this'])
    expect(b.heard).toEqual(['b said that'])
    await finished
  })

  it('delivers an empty utterance when the worker breaks, carrying its message', async () => {
    const { listener, heard } = listening()

    await listener.start()
    hear(1, 0.5)
    const stopped = listener.stop()
    await flush()

    const broken = FakeWorker.last()
    broken.fail('out of memory')
    await stopped

    expect(heard).toEqual([''])
    expect(listener.reason).toBe('out of memory')
    expect(listener.state).toBe('idle')
    expect(broken.terminated).toBe(true)
  })
})
