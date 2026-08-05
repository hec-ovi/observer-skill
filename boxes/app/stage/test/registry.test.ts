/**
 * The registry: the map the artifacts resolve their imports through, and the chart themes
 * built from the page's tokens.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildThemes } from '../vendor/themes.ts'
import { REGISTRY } from '../src/registry.ts'

/** The two documents that mount artifacts: the page the user sees, the verify frame. */
const DOCUMENTS = ['index.html', 'sandbox.html'] as const

/** A document under `boxes/app`, as the bytes the browser parses and a policy hashes. */
function sourceOf(name: string): string {
  // Under jsdom `import.meta.url` is an http url whose path is relative to the repo root.
  return readFileSync(
    resolve(process.cwd(), `.${new URL(`../../${name}`, import.meta.url).pathname}`),
    'utf8',
  )
}

/** The body of every `<script type="importmap">` in a document, in document order. */
function importMaps(html: string): string[] {
  const tag = /<script\b[^>]*\btype="importmap"[^>]*>([\s\S]*?)<\/script\s*>/gi
  return [...html.matchAll(tag)].map((match) => match[1] ?? '')
}

/** Every `borderRadius` anywhere in a theme object. */
function radii(value: unknown): number[] {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) =>
    key === 'borderRadius' ? [Number(child)] : radii(child),
  )
}

/** A custom property as the document resolves it right now. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

describe('the registry', () => {
  it.each(DOCUMENTS)('is the one import map %s carries', (name) => {
    const maps = importMaps(sourceOf(name))

    expect(maps).toHaveLength(1)
    expect(JSON.parse(maps[0] ?? 'null')).toEqual({ imports: REGISTRY })
  })

  it('is the same bytes in both documents, so one script hash covers both', () => {
    expect(importMaps(sourceOf('index.html'))).toEqual(importMaps(sourceOf('sandbox.html')))
  })

  it('builds a theme per mode from the page tokens, and leaves the document as it found it', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    const themes = buildThemes()

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(themes.light.color).toEqual(['#2563a8', '#b7472a', '#1f7a3d', '#7c3aed', '#8a6100', '#0e7490', '#be185d', '#4d7c0f'])
    expect(themes.dark.color).not.toEqual(themes.light.color)
    expect(themes.dark.darkMode).toBe(true)
  })

  it('takes its corners from --radius and its axis from the readable hairline', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    const { light } = buildThemes()
    const axis = light.valueAxis as { axisLine: { lineStyle: { color: string } } }
    const grid = light.valueAxis as { splitLine: { lineStyle: { color: string } } }

    expect(radii(light)).not.toHaveLength(0)
    expect(radii(light).every((radius) => radius > 0)).toBe(true)
    expect(axis.axisLine.lineStyle.color).toBe(token('--border-strong'))
    expect(grid.splitLine.lineStyle.color).toBe(token('--border'))
  })
})
