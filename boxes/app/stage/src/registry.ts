/**
 * The libraries an artifact module may import, and where they are served from.
 *
 * One built copy each, shared by the page and every artifact through an import map, so the
 * tenth chart costs nothing to open and every artifact sees the same registered themes.
 * Adding a library is one entry here, one line in the artifact contract's allowlist, and a
 * fourth entry in `vendor/vite.config.ts`.
 *
 * Import maps are per-document and cannot be loaded from a file, so `index.html` and
 * `sandbox.html` each carry the map inline, with the same bytes. `test/registry.test.ts`
 * holds them to this table and to each other.
 */

export const REGISTRY = {
  echarts: '/sandbox/vendor/echarts.js',
  d3: '/sandbox/vendor/d3.js',
  katex: '/sandbox/vendor/katex.js',
} as const

export const REGISTRY_NAMES = Object.keys(REGISTRY)
