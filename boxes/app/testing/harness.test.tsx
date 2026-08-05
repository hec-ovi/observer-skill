/**
 * The harness itself: rendering, pointer holds, the theme, and the live channel. If this
 * file fails, no other `boxes/app` test can be trusted.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act, useEffect, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { theme } from '@app/theme.ts'
import { FakeEventSource } from './fakes.ts'

function HoldToTalk() {
  const [held, setHeld] = useState(false)
  return (
    <button
      type="button"
      aria-pressed={held}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        setHeld(true)
      }}
      onPointerUp={() => setHeld(false)}
    >
      {held ? 'Listening' : 'Hold to talk'}
    </button>
  )
}

function LiveLine() {
  const [line, setLine] = useState('waiting')
  useEffect(() => {
    const source = new EventSource('/live/s1')
    source.onmessage = (event) => setLine(String(event.data))
    return () => source.close()
  }, [])
  return <p>{line}</p>
}

describe('app test harness', () => {
  it('renders a component and holds a pointer down on it', async () => {
    const user = userEvent.setup()
    render(<HoldToTalk />)
    const button = screen.getByRole('button')

    await user.pointer({ keys: '[MouseLeft>]', target: button })
    expect(button).toHaveAttribute('aria-pressed', 'true')

    await user.pointer({ keys: '[/MouseLeft]' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  it('reads different tokens after the theme flips', () => {
    const seen: string[] = []
    const unsubscribe = theme.subscribe((resolved) => seen.push(resolved))

    theme.set('light')
    const light = theme.readTokens()
    theme.set('dark')
    const dark = theme.readTokens()
    unsubscribe()
    theme.set('system')

    expect(light.mode).toBe('light')
    expect(dark.mode).toBe('dark')
    expect(light.series).toHaveLength(8)
    expect(dark.surface).not.toBe(light.surface)
    expect(dark.text).not.toBe(light.text)
    expect(seen).toContain('dark')
  })

  it('delivers a server-sent event to the page', () => {
    render(<LiveLine />)
    const source = FakeEventSource.last()
    expect(source.url).toBe('/live/s1')

    act(() => {
      source.open()
      source.emit('ready')
    })

    expect(screen.getByText('ready')).toBeInTheDocument()
  })
})
