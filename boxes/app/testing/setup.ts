/**
 * Runs before every `boxes/app` test file: jest-dom matchers, the design tokens in the
 * document so `readTokens()` has something to read, and the browser fakes on the globals.
 */

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import '../src/tokens.css'
import { installBrowserFakes, resetBrowserFakes } from './fakes.ts'

installBrowserFakes()

afterEach(() => {
  cleanup()
  resetBrowserFakes()
  vi.useRealTimers()
})
