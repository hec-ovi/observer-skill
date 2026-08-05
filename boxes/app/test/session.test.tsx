/**
 * The session: a question leaves the page carrying the second it was about, and an answer
 * arrives, is read out loud, and can be heard again.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import { fakeSpeechSynthesis } from '../testing/fakes.ts'
import { answer, makeSession, segmentsOf } from './fixtures.ts'
import { postedOf, push, serve } from './server.ts'

const ANSWER = 'Because the curve flattens after the warmup.'

describe('a live session', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/s/s1')
  })

  it('sends a question with the second the user was on', async () => {
    const user = userEvent.setup()
    const server = serve(makeSession(), segmentsOf(100))
    render(<App />)
    await screen.findByLabelText('Ask about this moment')

    await user.click(screen.getByRole('button', { name: /Sentence 3\./ }))
    await user.type(screen.getByLabelText('Ask about this moment'), 'why is it flat here?{Enter}')

    expect(postedOf(server, 'ask')).toEqual([
      { type: 'ask', text: 'why is it flat here?', at: 6, via: 'text' },
    ])
    expect(screen.getByText('why is it flat here?')).toBeInTheDocument()
    expect(screen.getByText('Working')).toBeInTheDocument()
  })

  it('shows an answer, says it out loud, and says it again on request', async () => {
    const user = userEvent.setup()
    serve(makeSession(), segmentsOf(20))
    render(<App />)
    await screen.findByLabelText('Ask about this moment')

    push('patch', { log: [answer(ANSWER, { spoken: true })] })
    push('say', { entryId: 'e1', text: ANSWER, speak: true, artifactId: null })

    expect(screen.getByText(ANSWER)).toBeInTheDocument()
    await waitFor(() => expect(fakeSpeechSynthesis().spoken).toHaveLength(1))
    expect(fakeSpeechSynthesis().spoken[0]?.text).toBe(ANSWER)

    act(() => fakeSpeechSynthesis().finish())
    await user.click(screen.getByRole('button', { name: 'Replay' }))

    await waitFor(() => expect(fakeSpeechSynthesis().spoken).toHaveLength(2))
    expect(fakeSpeechSynthesis().spoken[1]?.text).toBe(ANSWER)
  })

  it('restores the position and the log a reload finds on the server', async () => {
    serve(
      makeSession({ position: { time: 128, state: 'paused' }, log: [answer(ANSWER)] }),
      segmentsOf(100),
    )
    render(<App />)

    expect(await screen.findByText(ANSWER)).toBeInTheDocument()
    expect(screen.getByRole('button', { current: true })).toHaveTextContent('Sentence 64.')
  })
})
