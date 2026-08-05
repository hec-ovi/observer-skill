import type { ServerResponse } from 'node:http'
import { join } from 'node:path'
import express from 'express'
import type { Router } from 'express'
import { fail } from '#errors'
import type { HostContext } from '../context.ts'
import { SandboxFrame, sandboxPolicy } from '../sandbox-document.ts'

/**
 * Everything the frame loads is a CORS fetch: a sandboxed document has an opaque origin, so
 * its own server is cross-origin to it.
 */
function allowAnyOrigin(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-cache')
}

export function sandboxRoutes(ctx: HostContext): Router {
  const router = express.Router()

  // The frame. One document for every verification; which module to run arrives over the
  // port the page hands it, so nothing about a session is in the URL. The policy carries the
  // hashes of this document's own inline scripts, which is what lets its import map run.
  const frame = new SandboxFrame(join(ctx.appDir, 'sandbox.html'))

  router.get('/frame', async (_req, res) => {
    const { html, hashes } = await frame.read().catch(() => {
      fail(
        'UNKNOWN_ARTIFACT',
        'The app build has no sandbox.html.',
        'Build the app, then start the host with that directory as appDir.',
      )
    })
    res.set('Content-Security-Policy', sandboxPolicy(ctx.origin(), hashes))
    res.set('Content-Type', 'text/html; charset=utf-8')
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Cache-Control', 'no-store')
    res.send(html)
  })

  // The registry modules the import map points at, and whatever ships beside them.
  router.use(
    express.static(join(ctx.appDir, 'sandbox'), {
      index: false,
      fallthrough: false,
      setHeaders: allowAnyOrigin,
    }),
  )

  return router
}
