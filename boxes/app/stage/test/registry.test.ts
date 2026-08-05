/**
 * The registry: the map the artifacts resolve their imports through, and the chart themes
 * built from the page's tokens.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildThemes } from '../vendor/themes.ts'
import { importMapScript } from '../src/registry.ts'

/** A document under `boxes/app`, as the bytes the browser parses and a policy hashes. */
function sourceOf(name: string): string {
  // Under jsdom `import.meta.url` is an http url whose path is relative to the repo root.
  return readFileSync(
    resolve(process.cwd(), `.${new URL(`../../${name}`, import.meta.url).pathname}`),
    'utf8',
  )
}

function occurrences(text: string, part: string): number {
  return text.split(part).length - 1
}

/** Every `borderRadius` anywhere in a theme object. */
function radii(value: unknown): number[] {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) =>
    key === 'borderRadius' ? [Number(child)] : radii(child),
  )
}

describe('the registry', () => {
  it('is mapped identically in the verify document', () => {
    expect(bare(sandboxDocument)).toContain(bare(importMapScript()))
  })

  it('builds a theme per mode from the page tokens, and leaves the document as it found it', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    const themes = buildThemes()

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(themes.light.color).toEqual(['#2563a8', '#b7472a', '#1f7a3d', '#7c3aed', '#8a6100', '#0e7490', '#be185d', '#4d7c0f'])
    expect(themes.dark.color).not.toEqual(themes.light.color)
    expect(themes.dark.darkMode).toBe(true)
  })

  it('rounds nothing', () => {
    const themes = buildThemes()
    expect(radii(themes.light)).not.toHaveLength(0)
    expect(radii(themes.light).every((radius) => radius === 0)).toBe(true)
    expect(radii(themes.dark).every((radius) => radius === 0)).toBe(true)
  })
})
