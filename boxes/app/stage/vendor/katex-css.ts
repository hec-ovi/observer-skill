/**
 * Build step: KaTeX's stylesheet with the fonts maths and engineering content needs inlined
 * as `data:` URIs, exposed to the katex entry as `virtual:katex-css`.
 *
 * The families left out (Fraktur, Script, Caligraphic, SansSerif, Typewriter, and the bold
 * italics) cost 128 KB and appear in almost nothing; their `@font-face` rules are dropped
 * rather than left pointing at a file that will not load.
 */

import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'

const VIRTUAL_ID = 'virtual:katex-css'
const RESOLVED_ID = '\0virtual:katex-css'

const INLINED = [
  'Main-Regular',
  'Main-Italic',
  'Main-Bold',
  'Math-Italic',
  'Size1-Regular',
  'Size2-Regular',
  'Size3-Regular',
  'Size4-Regular',
  'AMS-Regular',
]

async function inlineFonts(): Promise<string> {
  const require = createRequire(import.meta.url)
  const distDir = dirname(require.resolve('katex/dist/katex.min.css'))

  // `katex.css` uses font-display: block, so a snapshot never catches fallback glyphs.
  let css = await readFile(join(distDir, 'katex.min.css'), 'utf8')

  for (const name of INLINED) {
    const font = await readFile(join(distDir, 'fonts', `KaTeX_${name}.woff2`))
    css = css.replaceAll(
      `fonts/KaTeX_${name}.woff2`,
      `data:font/woff2;base64,${font.toString('base64')}`,
    )
  }

  // The woff and truetype fallbacks are files, not data, and there is nothing to fetch them
  // with; then any face whose woff2 was not inlined goes with them.
  css = css.replace(/,url\(fonts\/[^)]+\)\s*format\("(?:woff|truetype)"\)/g, '')
  css = css.replace(/@font-face\{[^}]*url\(fonts\/[^}]*\}/g, '')

  return css
}

export function katexCss(): Plugin {
  return {
    name: 'observer-katex-css',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null
    },
    async load(id) {
      if (id !== RESOLVED_ID) return null
      return `export default ${JSON.stringify(await inlineFonts())}`
    },
  }
}
