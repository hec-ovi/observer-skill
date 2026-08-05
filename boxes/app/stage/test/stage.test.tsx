/**
 * The visible stage, driven with real modules in a simulated DOM.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { theme } from '@app/theme.ts'
import { Stage, type Artifact } from '../src/index.ts'

function fixture(name: string): string {
  return new URL(`./fixtures/${name}.ts`, import.meta.url).pathname
}

const panel: Artifact = {
  id: 'a1',
  title: 'Attention is a weighted average',
  caption: 'Values are illustrative',
  url: fixture('panel'),
}

afterEach(() => {
  theme.set('system')
})

describe('Stage', () => {
  it('draws the module under the title and caption it owns', async () => {
    render(<Stage active artifact={panel} time={42} onDismiss={vi.fn()} />)

    await screen.findByTestId('panel')
    expect(screen.getByRole('heading', { name: panel.title })).toBeInTheDocument()
    expect(screen.getByText('Values are illustrative')).toBeInTheDocument()
    expect(screen.getByTestId('panel-time')).toHaveTextContent('42')
  })

  it('runs the module cleanup when the stage is dismissed', async () => {
    const { rerender } = render(<Stage active artifact={panel} onDismiss={vi.fn()} />)
    await screen.findByTestId('panel')
    expect(screen.getByTestId('panel-overlay')).toBeInTheDocument()

    rerender(<Stage active={false} artifact={panel} onDismiss={vi.fn()} />)

    await waitFor(() => expect(screen.queryByTestId('panel-overlay')).not.toBeInTheDocument())
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: panel.title })).not.toBeInTheDocument()
  })

  it('restyles a mounted module on a theme change without remounting it', async () => {
    render(<Stage active artifact={panel} onDismiss={vi.fn()} />)
    await screen.findByTestId('panel')
    const mounts = screen.getByTestId('panel-mounts').textContent

    act(() => {
      theme.set('dark')
    })

    expect(screen.getByTestId('panel-mode')).toHaveTextContent('dark')
    expect(screen.getByTestId('panel-mounts')).toHaveTextContent(String(mounts))
    expect(screen.getByTestId('panel')).toBeInTheDocument()
  })

  it('shows one line and a way back when a module throws', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    render(
      <Stage active artifact={{ ...panel, url: fixture('throws') }} onDismiss={onDismiss} />,
    )

    const failure = await screen.findByRole('alert')
    expect(failure).toHaveTextContent('This visual could not be drawn.')
    expect(failure.textContent).not.toContain('TypeError')

    await user.click(screen.getByRole('button', { name: 'Back to the video' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('names the registry when a module needs a library the page does not serve', async () => {
    render(
      <Stage active artifact={{ ...panel, url: fixture('missing-library') }} onDismiss={vi.fn()} />,
    )

    const failure = await screen.findByRole('alert')
    expect(failure).toHaveTextContent('This page is missing the chart libraries this visual needs.')
  })

  it('blames the registry only for a specifier it maps, not for a url that reads like one', async () => {
    // No such fixture file: the import fails to load, and the url happens to spell `d3`.
    render(
      <Stage active artifact={{ ...panel, url: fixture('d3-force-layout') }} onDismiss={vi.fn()} />,
    )

    const failure = await screen.findByRole('alert')
    expect(failure).toHaveTextContent('This visual could not be loaded.')
  })
})
