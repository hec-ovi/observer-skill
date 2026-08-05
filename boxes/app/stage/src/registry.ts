/**
 * The libraries an artifact module may import, and where they are served from.
 *
 * One built copy each, shared by the page and every artifact through an import map, so the
 * tenth chart costs nothing to open and every artifact sees the same registered themes.
 * Adding a library is one entry here, one line in the artifact contract's allowlist, and a
 * fourth entry in `vendor/vite.config.ts`.
 */

export const REGISTRY = {
  echarts: '/api/vendor/echarts.js',
  d3: '/api/vendor/d3.js',
  katex: '/api/vendor/katex.js',
} as const

export const REGISTRY_NAMES = Object.keys(REGISTRY)

/**
 * The import map, as the tag both documents carry. Import maps are per-document and cannot
 * be loaded from a file, so the page and the verify frame each hold a copy of this string.
 */
export function importMapScript(): string {
  return `<script type="importmap">\n${JSON.stringify({ imports: REGISTRY }, null, 2)}\n</script>`
}
