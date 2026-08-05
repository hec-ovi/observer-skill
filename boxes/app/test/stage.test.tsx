/**
 * The region the player and the stage share: a `show` takes it, a `hide` gives it back, and
 * a theme change reaches the module that is already mounted in it.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '@app/theme.ts'
import { App } from '../src/App.tsx'
import type { ArtifactRecord } from '../src/session/record.ts'
import { makeSession, segmentsOf } from './fixtures.ts'
import { push, serve } from './server.ts'

// Where a built visual is served from, pointed at a real module instead of the running host.
vi.mock('../src/session/artifact-url.ts', () => ({
  artifactUrl: (): string => new URL('./fixtures/panel.ts', import.meta.url).pathname,
}))

const ARTIFACT: ArtifactRecord = {
  id: 'a1',
  title: 'Where attention goes',
  kind: 'diagram',
  conceptId: null,
  startsAt: null,
  endsAt: null,
  status: 'built',
  error: null,
}

describe('the shared region', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/s/s1')
  })

  afterEach(() => {
    theme.set('system')
  })

  it('gives the region to a visual and takes it back', async () => {
    serve(makeSession({ artifacts: [ARTIFACT] }), segmentsOf(20))
    const { container } = render(<App />)
    await screen.findByLabelText('Ask about this moment')

    push('show', { artifactId: 'a1' })

    expect(await screen.findByTestId('panel-mode')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Where attention goes' })).toBeInTheDocument()
    expect(container.querySelector('.video')).toHaveAttribute('data-covered', 'true')

    push('hide')

    await waitFor(() => expect(screen.queryByTestId('panel-mode')).not.toBeInTheDocument())
    expect(container.querySelector('.video')).toHaveAttribute('data-covered', 'false')
  })

  it('carries a theme switch into a mounted visual', async () => {
    const user = userEvent.setup()
    serve(makeSession({ artifacts: [ARTIFACT] }), segmentsOf(20))
    render(<App />)
    await screen.findByLabelText('Ask about this moment')

    push('show', { artifactId: 'a1' })
    expect(await screen.findByTestId('panel-mode')).toHaveTextContent('light')

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('radio', { name: 'Dark' }))

    expect(screen.getByTestId('panel-mode')).toHaveTextContent('dark')
  })
})
