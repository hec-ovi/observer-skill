import { describe, expect, it } from 'vitest'

async function load(url: string): Promise<unknown> {
  return await import(/* @vite-ignore */ url)
}

describe('probe', () => {
  it('reports', async () => {
    const seen: string[] = []
    for (const url of [
      new URL('./fixtures/missing-library.ts', import.meta.url).pathname,
      '/boxes/app/stage/test/fixtures/nope.ts',
    ]) {
      try {
        await load(url)
        seen.push('no error')
      } catch (error) {
        seen.push(`${(error as Error).name} :: ${(error as Error).message}`)
      }
    }
    expect(seen).toEqual([])
  })
})
