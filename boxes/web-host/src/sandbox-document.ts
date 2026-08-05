/**
 * The document verification runs a module in. It is served from a route rather than written
 * into a srcdoc or a blob, because only an http response carries its own policy: a local
 * scheme inherits the page's, and then the module could never be locked down on its own.
 *
 * Nothing here is inline script, so the policy needs no hashes and no `unsafe-inline` for
 * scripts. `runner.js` belongs to the stage, ships with the app build, and reads its own
 * query string; this box only points at it.
 */

/**
 * `'self'` matches nothing in a sandboxed document, so the script sources are absolute
 * origins with a path prefix. `connect-src 'none'` is the network gate: a module that tries
 * to fetch is blocked here, whatever the static checks concluded earlier.
 */
export function sandboxPolicy(origin: string): string {
  return [
    "default-src 'none'",
    `script-src ${origin}/sandbox/ ${origin}/api/artifact/`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    'sandbox allow-scripts',
  ].join('; ')
}

function attribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

export function sandboxDocument(options: { bundleUrl: string; parentOrigin: string }): string {
  const src = attribute(
    `/sandbox/runner.js?bundle=${encodeURIComponent(options.bundleUrl)}` +
      `&parent=${encodeURIComponent(options.parentOrigin)}`,
  )
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>verify</title>
<style>html,body{margin:0;height:100%}#root{height:100%;overflow:hidden}</style>
<div id="root"></div>
<script type="module" src="${src}" crossorigin="anonymous"></script>
`
}
