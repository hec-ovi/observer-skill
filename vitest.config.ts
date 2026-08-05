import { fileURLToPath, URL } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

const at = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default mergeConfig(
  viteConfig,
  defineConfig({
    // Tests span every box under boxes/app, so they are globbed from the repo root
    // rather than from the page root the dev server uses.
    root: at('.'),
    test: {
      globals: true,
      environment: 'jsdom',
      environmentOptions: { jsdom: { url: 'http://127.0.0.1:4830' } },
      setupFiles: [at('./boxes/app/testing/setup.ts')],
      include: ['boxes/app/**/*.test.{ts,tsx}'],
      css: true,
      restoreMocks: true,
      clearMocks: true,
    },
  }),
)
