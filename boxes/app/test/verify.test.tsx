/**
 * A `verify` signal is a question the agent is waiting on, so it is always answered: the
 * module runs in the stage's hidden frame and the result goes back up the channel.
 */

import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import { makeSession, segmentsOf } from './fixtures.ts'
import { postedOf, push, serve } from './server.ts'

describe('verification', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/s/s1')
  })

  it('answers a verify signal with a result rather than a silence', async () => {
    const server = serve(makeSession(), segmentsOf(20))
    render(<App />)
    await screen.findByLabelText('Ask about this moment')

    push('verify', { requestId: 'r1', url: '/api/artifact/s1/a1', timeoutMs: 10 })

    await waitFor(() => expect(postedOf(server, 'verify-result')).toHaveLength(1))
    const result = postedOf(server, 'verify-result')[0]
    expect(result?.requestId).toBe('r1')
    expect(result?.ok).toBe(false)
    expect(result?.errors[0]).toMatch(/ARTIFACT_TIMEOUT/)
    expect(result?.snapshot).toBeNull()
  })
})
