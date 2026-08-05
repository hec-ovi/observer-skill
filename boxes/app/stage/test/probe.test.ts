import { describe, expect, it } from 'vitest'

async function load(url: string): Promise<Record<string, unknown>> {
  return (await import(/* @vite-ignore */ url)) as Record<string, unknown>
}

describe('dynamic import shapes', () => {
  it('href', async () => {
    const url = new URL('./fixtures/probe.ts', import.meta.url).href
    console.log('href', url)
    const m = await load(url)
    expect(typeof m.mount).toBe('function')
  })
  it('pathname', async () => {
    const url = new URL('./fixtures/probe.ts', import.meta.url).pathname
    console.log('pathname', url)
    const m = await load(url)
    expect(typeof m.mount).toBe('function')
  })
  it('missing url rejects', async () => {
    await expect(load('/nope/missing.ts')).rejects.toThrow()
  })
})
