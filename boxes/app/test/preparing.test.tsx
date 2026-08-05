/**
 * The loader: what the server says is happening, the count that makes it legible, and the
 * lock on the player that only the server's phase can lift.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import type { Progress } from '../src/session/record.ts'
import { makeSession, segmentsOf } from './fixtures.ts'
import { postedOf, push, serve } from './server.ts'

function progress(over: Partial<Progress> = {}): Progress {
  return { step: '', done: 0, total: 0, message: '', ...over }
}

/** A caption fetch is two round trips, so it sends no seconds: zeros and a message. */
const CAPTIONS = progress({
  step: 'captions',
  done: 0,
  total: 0,
  message: 'looking for published captions',
})

/** Speech recognition knows the chunk it is on and how long the audio is, both in seconds. */
const TRANSCRIBE = progress({
  step: 'transcribe',
  done: 120,
  total: 600,
  message: 'transcribing chunk 1 of 2',
})

const TRANSCRIBING = makeSession({
  phase: 'transcribing',
  transcript: null,
  progress: CAPTIONS,
})

describe('the loader', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/s/s1')
  })

  it('shows the step message alone when the step reports no duration', async () => {
    serve(TRANSCRIBING, segmentsOf(20))
    const { container } = render(<App />)

    expect(await screen.findByText('Transcribing')).toBeInTheDocument()
    expect(screen.getByText('looking for published captions')).toBeInTheDocument()
    expect(container.querySelector('.preparing-count')).not.toBeInTheDocument()
    expect(screen.queryByText(/minute/)).not.toBeInTheDocument()
  })

  it('follows the phase messages the server sends', async () => {
    serve(TRANSCRIBING, segmentsOf(20))
    render(<App />)

    expect(await screen.findByText('Transcribing')).toBeInTheDocument()

    push('phase', { phase: 'transcribing', progress: TRANSCRIBE })

    expect(screen.getByText('2 of 10 minutes')).toBeInTheDocument()
    expect(screen.getByText('transcribing chunk 1 of 2')).toBeInTheDocument()

    push('phase', {
      phase: 'researching',
      progress: progress({ step: 'concepts', message: 'Reading for concepts' }),
    })
    push('patch', {
      concepts: [
        {
          id: 'c1',
          label: 'Softmax',
          kind: 'definition',
          startsAt: 0,
          endsAt: 10,
          summary: '',
          notes: [],
          artifactIds: [],
        },
      ],
    })

    expect(screen.getByText('Researching')).toBeInTheDocument()
    expect(screen.getByText('1 concept')).toBeInTheDocument()
    expect(screen.getByText('Softmax')).toBeInTheDocument()
  })

  it('keeps the player locked until the server says the session is ready', async () => {
    serve(TRANSCRIBING, segmentsOf(20))
    const { container } = render(<App />)

    await screen.findByText('Transcribing')
    expect(container.querySelector('.video-lock')).toBeInTheDocument()
    expect(screen.queryByLabelText('Ask about this moment')).not.toBeInTheDocument()

    push('phase', { phase: 'ready', progress: progress() })
    push('patch', {
      transcript: { provider: 'captions', language: 'en', segmentCount: 20, duration: 40 },
    })

    expect(container.querySelector('.video-lock')).not.toBeInTheDocument()
    expect(await screen.findByLabelText('Ask about this moment')).toBeInTheDocument()
  })

  it('shows a failed phase with its hint and a way to ask for it again', async () => {
    const server = serve(
      makeSession({
        phase: 'transcribing',
        transcript: null,
        progress: progress(),
        error: {
          code: 'TRANSCRIPT_FAILED',
          message: 'The captions could not be read.',
          hint: 'Install yt-dlp, or set an ASR endpoint.',
        },
      }),
      [],
    )
    const user = userEvent.setup()
    render(<App />)

    const failure = await screen.findByRole('alert')
    expect(failure).toHaveTextContent('The captions could not be read.')
    expect(failure).toHaveTextContent('Install yt-dlp, or set an ASR endpoint.')

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(postedOf(server, 'ask')[0]?.text).toBe('Try transcribing again.')
  })
})
