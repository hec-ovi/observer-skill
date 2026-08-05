/**
 * Builds the registry: one ES module per library, at a stable path, shared by the page and
 * every artifact through the import map.
 *
 * Separate from the app build on purpose. These files are addressed by name in an import
 * map, so they cannot be hashed, and they must survive an app rebuild.
 *
 *   npx vite build --config boxes/app/stage/vendor/vite.config.ts
 */

import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { katexCss } from './katex-css.ts'

const at = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  root: at('.'),
  plugins: [katexCss()],
  build: {
    outDir: at('../../../../dist/vendor'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    lib: {
      entry: { echarts: at('./echarts.ts'), d3: at('./d3.ts'), katex: at('./katex.ts') },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
  },
})
