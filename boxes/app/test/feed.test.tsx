/**
 * The feed: a link becomes a session, and a video that cannot be played inside a page is
 * refused where it was pasted.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import { makeSession, segmentsOf } from './fixtures.ts'
import { serve } from './server.ts'

describe('the feed', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/')
  })

  it('turns a pasted link into a session', async () => {
    const user = userEvent.setup()
    const server = serve(makeSession(), segmentsOf(20))
    render(<App />)

    await user.type(screen.getByLabelText('Video link'), 'https://example.com/watch?v=v1')
    await user.click(screen.getByRole('switch', { name: 'This video has ads' }))
    await user.type(screen.getByLabelText('What do you want from this video'), 'the maths')
    await user.click(screen.getByRole('button', { name: 'Open' }))

    expect(await screen.findByRole('heading', { name: 'Attention, explained' })).toBeInTheDocument()
    expect(server.creations).toEqual([
      {
        url: 'https://example.com/watch?v=v1',
        hasAds: true,
        settings: { extraKnowledge: true, toolkit: true },
        userPrompt: 'the maths',
      },
    ])
    expect(location.pathname).toBe('/s/s1')
  })

  it('refuses a video that cannot be embedded, under the field', async () => {
    const user = userEvent.setup()
    const server = serve(makeSession())
    server.refusal = {
      code: 'SOURCE_NOT_EMBEDDABLE',
      message: 'This video cannot be played inside another page.',
      hint: 'Its owner disabled embedding.',
    }
    render(<App />)

    await user.type(screen.getByLabelText('Video link'), 'https://example.com/watch?v=nope')
    await user.click(screen.getByRole('button', { name: 'Open' }))

    const refusal = await screen.findByRole('alert')
    expect(refusal).toHaveTextContent('This video cannot be played inside another page.')
    expect(refusal).toHaveTextContent('Its owner disabled embedding.')
    expect(screen.getByLabelText('Video link')).toHaveValue('https://example.com/watch?v=nope')
    expect(location.pathname).toBe('/')
  })
})
