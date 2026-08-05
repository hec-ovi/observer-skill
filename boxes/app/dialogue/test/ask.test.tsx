/**
 * Asking: typed and sent, or spoken and released. Both carry the second the user started.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AnswerLog, AskBox, type LogEntry } from '../src/index.ts'
import { stubListening } from './stub-listener.ts'

function draftBox(): HTMLElement {
  return screen.getByRole('textbox', { name: 'Ask about this moment' })
}

describe('AskBox', () => {
  it('sends what was typed, stamped with the second the user started asking', async () => {
    const user = userEvent.setup()
    const onAsk = vi.fn()
    const { source } = stubListening()
    let second = 120
    render(<AskBox at={() => second} listener={source} onAsk={onAsk} onOpenSettings={vi.fn()} />)

    await user.type(draftBox(), 'what is a tensor')
    // The video played on while they typed. The question is still about second 120.
    second = 154
    await user.keyboard('{Enter}')

    expect(onAsk).toHaveBeenCalledWith({ text: 'what is a tensor', at: 120, via: 'text' })
    expect(draftBox()).toHaveValue('')
  })

  it('asks what it heard when the talk button is released', async () => {
    const user = userEvent.setup()
    const onAsk = vi.fn()
    const { source, listener } = stubListening()
    let second = 300
    render(<AskBox at={() => second} listener={source} onAsk={onAsk} onOpenSettings={vi.fn()} />)
    const talk = screen.getByRole('button', { name: 'Hold to talk' })

    await user.pointer({ keys: '[MouseLeft>]', target: talk })
    expect(talk).toHaveAttribute('aria-pressed', 'true')

    act(() => listener().hears('what is a ten'))
    expect(screen.getByRole('status')).toHaveTextContent('what is a ten')

    second = 999
    await user.pointer({ keys: '[/MouseLeft]' })

    await waitFor(() =>
      expect(onAsk).toHaveBeenCalledWith({ text: 'What is a tensor?', at: 300, via: 'voice' }),
    )
    expect(talk).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps the second of the hold that spoke when a press lands mid-transcription', async () => {
    const user = userEvent.setup()
    const onAsk = vi.fn()
    const { source, listener } = stubListening()
    let second = 300
    render(<AskBox at={() => second} listener={source} onAsk={onAsk} onOpenSettings={vi.fn()} />)
    const talk = screen.getByRole('button', { name: 'Hold to talk' })
    listener().slow = true

    await user.pointer({ keys: '[MouseLeft>]', target: talk })
    await user.pointer({ keys: '[/MouseLeft]' })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Transcribing.'))

    // The video played on and the user presses again while the words are still out. That
    // press opens nothing, so the button does not go down on a hold that is not happening.
    second = 340
    await user.pointer({ keys: '[MouseLeft>]', target: talk })
    expect(talk).toHaveAttribute('aria-pressed', 'false')
    await user.pointer({ keys: '[/MouseLeft]' })

    await act(async () => listener().finishes())

    expect(onAsk).toHaveBeenCalledWith({ text: 'What is a tensor?', at: 300, via: 'voice' })
  })

  it('closes a keyboard hold when the talk button loses focus', async () => {
    const user = userEvent.setup()
    const onAsk = vi.fn()
    const { source } = stubListening()
    render(<AskBox at={() => 300} listener={source} onAsk={onAsk} onOpenSettings={vi.fn()} />)
    const talk = screen.getByRole('button', { name: 'Hold to talk' })

    talk.focus()
    // The window goes away mid-hold, so the keyup that would end it is delivered elsewhere.
    await user.keyboard('{Enter>}')
    expect(talk).toHaveAttribute('aria-pressed', 'true')

    await user.tab()

    await waitFor(() =>
      expect(onAsk).toHaveBeenCalledWith({ text: 'What is a tensor?', at: 300, via: 'voice' }),
    )
    expect(talk).toHaveAttribute('aria-pressed', 'false')
  })

  it('says so when a hold produced nothing', async () => {
    const user = userEvent.setup()
    const onAsk = vi.fn()
    const { source, listener } = stubListening()
    render(<AskBox at={() => 12} listener={source} onAsk={onAsk} onOpenSettings={vi.fn()} />)
    listener().utterance = null

    const talk = screen.getByRole('button', { name: 'Hold to talk' })
    await user.pointer({ keys: '[MouseLeft>]', target: talk })
    await user.pointer({ keys: '[/MouseLeft]' })

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Nothing was heard.'))
    expect(onAsk).not.toHaveBeenCalled()
  })

  it('points a refused microphone at the settings that fix it', async () => {
    const user = userEvent.setup()
    const onOpenSettings = vi.fn()
    const { source, listener } = stubListening()
    render(
      <AskBox at={() => 12} listener={source} onAsk={vi.fn()} onOpenSettings={onOpenSettings} />,
    )
    listener().refuse = true

    const talk = screen.getByRole('button', { name: 'Hold to talk' })
    await user.pointer({ keys: '[MouseLeft>]', target: talk })
    await user.pointer({ keys: '[/MouseLeft]' })

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('The microphone is blocked.'),
    )
    await user.click(screen.getByRole('button', { name: 'Open settings' }))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('keeps a question typed while nothing is attached, and says why', async () => {
    const user = userEvent.setup()
    const onAsk = vi.fn()
    const { source } = stubListening()
    render(
      <AskBox at={() => 60} listener={source} disabled onAsk={onAsk} onOpenSettings={vi.fn()} />,
    )

    await user.type(draftBox(), 'why is it called attention')
    await user.keyboard('{Enter}')

    expect(onAsk).not.toHaveBeenCalled()
    expect(draftBox()).toHaveValue('why is it called attention')
    expect(screen.getByText('No agent attached. Your question waits here.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hold to talk' })).toBeDisabled()
  })

  it('keeps the draft when an answer lands mid-sentence', async () => {
    const user = userEvent.setup()
    const { source } = stubListening()
    const answer: LogEntry = { id: 'e1', role: 'agent', text: 'It is an array of numbers.', at: 42 }

    function Dialogue({ entries }: { entries: LogEntry[] }) {
      return (
        <>
          <AskBox at={() => 42} listener={source} onAsk={vi.fn()} onOpenSettings={vi.fn()} />
          <AnswerLog entries={entries} onShow={vi.fn()} onReplay={vi.fn()} />
        </>
      )
    }

    const { rerender } = render(<Dialogue entries={[]} />)
    await user.type(draftBox(), 'and what is a rank')

    rerender(<Dialogue entries={[answer]} />)

    expect(draftBox()).toHaveValue('and what is a rank')
    expect(screen.getByText('It is an array of numbers.')).toBeInTheDocument()
  })
})
