/**
 * The `katex` entry of the registry, with its stylesheet.
 *
 * The stylesheet carries its fonts as `data:` URIs: the verify frame has `font-src data:`
 * and no network, so a font referenced by URL would rasterise as fallback glyphs there and
 * the picture the agent looks at would not be the picture the user gets.
 */

import css from 'virtual:katex-css'

const STYLE_ID = 'observer-katex'

if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = css
  document.head.append(style)
}

export { default, ParseError, render, renderToString, version } from 'katex'
