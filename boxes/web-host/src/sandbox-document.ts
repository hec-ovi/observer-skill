/**
 * The policy the verify frame runs under.
 *
 * The document itself belongs to `app/stage`: it ships with the app build as `sandbox.html`
 * and uses the same loader the visible stage does, so passing verification means the module
 * will render. This box only serves it, and only this box can give it a policy, because a
 * policy travels on an http response and a srcdoc or blob would inherit the page's instead.
 */

/**
 * `'self'` matches nothing in a sandboxed document, so every source is an absolute origin
 * with a path prefix. `connect-src 'none'` is the network gate: a module that tries to
 * fetch is blocked here, whatever the static checks concluded earlier.
 */
export function sandboxPolicy(origin: string): string {
  return [
    "default-src 'none'",
    `script-src ${origin}/sandbox/ ${origin}/assets/ ${origin}/api/artifact/`,
    `style-src ${origin}/assets/ 'unsafe-inline'`,
    'img-src data: blob:',
    'font-src data:',
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    'sandbox allow-scripts',
  ].join('; ')
}
