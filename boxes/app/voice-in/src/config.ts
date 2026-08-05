/**
 * The config a caller hands in, checked once and filled in. Everything downstream reads the
 * resolved shape, so no provider has to think about defaults.
 */

import type { ListenConfig, ListenProvider } from '../schema/voice-in.ts'
import { ListenError } from './errors.ts'

export const DEFAULT_LANGUAGE = 'en-US'
const DEFAULT_MIN_SECONDS = 0.6
const DEFAULT_MIN_PEAK = 0.01

const PROVIDERS: readonly ListenProvider[] = ['auto', 'web-speech', 'whisper-web', 'endpoint']

export interface ResolvedConfig {
  provider: ListenProvider
  model: string | null
  baseUrl: string | null
  apiKey: string | null
  minSeconds: number
  minPeak: number
  moduleUrl: string | null
}

function invalid(message: string): never {
  throw new ListenError('INVALID_LISTENING_CONFIG', message)
}

/** An absolute origin with no trailing slash, so paths can be appended to it. */
function origin(value: string, field: string): string {
  try {
    return new URL(value).href.replace(/\/$/, '')
  } catch {
    return invalid(`${field} must be an absolute URL`)
  }
}

function fraction(value: number | undefined, fallback: number, field: string): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value) || value < 0) invalid(`${field} must be a number of at least 0`)
  return value
}

export function resolveConfig(config: ListenConfig): ResolvedConfig {
  if (!PROVIDERS.includes(config.provider)) invalid(`unknown provider ${String(config.provider)}`)

  const baseUrl = config.baseUrl ? origin(config.baseUrl, 'baseUrl') : null
  if (config.provider === 'endpoint' && !baseUrl) invalid('the endpoint provider needs a baseUrl')

  const minPeak = fraction(config.minPeak, DEFAULT_MIN_PEAK, 'minPeak')
  if (minPeak > 1) invalid('minPeak must be between 0 and 1')

  return {
    provider: config.provider,
    model: config.model ?? null,
    baseUrl,
    apiKey: config.apiKey ?? null,
    minSeconds: fraction(config.minSeconds, DEFAULT_MIN_SECONDS, 'minSeconds'),
    minPeak,
    moduleUrl: config.moduleUrl ? origin(config.moduleUrl, 'moduleUrl') : null,
  }
}
