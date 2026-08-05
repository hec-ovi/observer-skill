/**
 * The log: what was asked, when it was asked, what is still being answered, and the ways
 * back into an answer that came with a visual or a voice.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AnswerLog, type LogEntry } from '../src/index.ts'

const asked: LogEntry = { id: 'e1', role: 'user', text: 'What is a tensor?', at: 723 }
const answered: LogEntry = {
  id: 'e2',
  role: 'agent',
  text: 'A tensor is an array of numbers with a rank.',
  at: 723,
  artifactId: 'rank-ladder',
  spoken: true,
}

const later: LogEntry = { id: 'e3', role: 'user', text: 'And what is rank?', at: 812 }

describe('AnswerLog', () => {
  it('works on an outstanding question until its answer lands under it', () => {
    const { rerender } = render(
      <AnswerLog entries={[asked]} onShow={vi.fn()} onReplay={vi.fn()} />,
    )

    expect(screen.getByText('12:03')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Working')

    rerender(<AnswerLog entries={[asked, answered]} onShow={vi.fn()} onReplay={vi.fn()} />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    const lines = screen.getAllByRole('listitem')
    expect(lines[0]).toHaveTextContent('What is a tensor?')
    expect(lines[1]).toHaveTextContent('A tensor is an array of numbers with a rank.')
    // The moment is said once for the whole exchange.
    expect(screen.getAllByText('12:03')).toHaveLength(1)

    rerender(<AnswerLog entries={[asked, answered, later]} onShow={vi.fn()} onReplay={vi.fn()} />)

    expect(screen.getAllByText('12:03')).toHaveLength(1)
    expect(screen.getByText('13:32')).toBeInTheDocument()
  })

  it('works on every question that is still outstanding', () => {
    const { rerender } = render(
      <AnswerLog entries={[asked, later]} onShow={vi.fn()} onReplay={vi.fn()} />,
    )

    expect(screen.getAllByRole('status')).toHaveLength(2)

    // The first answer lands under both questions, and the second one is still out.
    rerender(<AnswerLog entries={[asked, later, answered]} onShow={vi.fn()} onReplay={vi.fn()} />)

    const lines = screen.getAllByRole('listitem')
    expect(lines[0]).not.toHaveTextContent('Working')
    expect(lines[1]).toHaveTextContent('Working')
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('opens an answer visual again and replays what was spoken', async () => {
    const user = userEvent.setup()
    const onShow = vi.fn()
    const onReplay = vi.fn()
    render(<AnswerLog entries={[asked, answered]} onShow={onShow} onReplay={onReplay} />)

    await user.click(screen.getByRole('button', { name: 'Show visual' }))
    await user.click(screen.getByRole('button', { name: 'Replay' }))

    expect(onShow).toHaveBeenCalledWith('rank-ladder')
    expect(onReplay).toHaveBeenCalledWith('e2')
  })
})
