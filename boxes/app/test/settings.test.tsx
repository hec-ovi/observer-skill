/**
 * Settings: a change lands on the page and goes upstream at once, a heavy voice states its
 * download before it is chosen, and a refused microphone is reported beside the control that
 * asked for it.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import { fakeSpeechSynthesis, setMicrophoneAccess } from '../testing/fakes.ts'
import { makeSession, segmentsOf } from './fixtures.ts'
import { postedOf, serve } from './server.ts'
import type { FakeServer } from './server.ts'

async function openSettings(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByLabelText('Ask about this moment')
  await user.click(screen.getByRole('button', { name: 'Settings' }))
  return user
}

describe('the settings panel', () => {
  let server: FakeServer

  beforeEach(() => {
    history.replaceState(null, '', '/s/s1')
    server = serve(makeSession(), segmentsOf(20))
  })

  it('applies a change and sends it upstream', async () => {
    const user = await openSettings()

    await user.click(screen.getByRole('switch', { name: 'Build visuals' }))

    expect(screen.getByRole('switch', { name: 'Build visuals' })).not.toBeChecked()
    expect(postedOf(server, 'settings')).toEqual([
      { type: 'settings', at: 0, settings: { toolkit: false } },
    ])
  })

  it('states what a heavy voice downloads before it is chosen, and speaks a test line', async () => {
    const user = await openSettings()

    expect(screen.getByRole('option', { name: /^Pocket, \d+ MB download$/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Speak a test line' }))

    await waitFor(() => expect(fakeSpeechSynthesis().spoken).toHaveLength(1))
  })

  it('reports a refused microphone beside the control that tests it', async () => {
    setMicrophoneAccess('denied')
    const user = await openSettings()

    const hold = screen.getByRole('button', { name: 'Hold to test' })
    await user.pointer({ keys: '[MouseLeft>]', target: hold })
    await user.pointer({ keys: '[/MouseLeft]' })

    expect(await screen.findByRole('alert')).toHaveTextContent('The microphone is blocked')
  })
})
