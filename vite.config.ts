import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Absolute path from a specifier relative to this file. */
const at = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

/** The Node host in dev. It serves the same routes the built page will call. */
const HOST = 'http://127.0.0.1:4830'
const toHost = { target: HOST, changeOrigin: true }

export default defineConfig({
  // The page is served at the root by web-host, so the base stays '/'.
  root: at('./boxes/app'),
  base: '/',
  plugins: [react()],

  resolve: {
    alias: {
      '@app': at('./boxes/app/src'),
      '@player': at('./boxes/app/player/src'),
      '@stage': at('./boxes/app/stage/src'),
      '@voice-out': at('./boxes/app/voice-out/src'),
      '@voice-in': at('./boxes/app/voice-in/src'),
      '@dialogue': at('./boxes/app/dialogue/src'),
    },
  },

  server: {
    proxy: {
      '/api': toHost,
      // SSE streams through the same proxy; `ws` is for WebSocket only and stays off.
      '/live': toHost,
      '/sandbox': toHost,
    },
  },

  build: {
    outDir: at('./dist/app'),
    // outDir sits outside root, so Vite only clears it when told to.
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: true,
  },

  // iife keeps workers and AudioWorklets import-free in the build output, which is what
  // AudioWorkletGlobalScope needs. Worklets are imported as `./x.worklet.ts?worker&url`
  // so they are transpiled; a plain `?url` would ship TypeScript to addModule().
  worker: { format: 'iife' },
})
