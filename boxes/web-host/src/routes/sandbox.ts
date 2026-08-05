import type { ServerResponse } from 'node:http'
import { join } from 'node:path'
import express from 'express'
import type { Router } from 'express'
import type { HostContext } from '../context.ts'
import { sandboxPolicy } from '../sandbox-document.ts'

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
  // port the page hands it, so nothing about a session is in the URL.
  router.get('/frame', (_req, res, next) => {
    res.set('Content-Security-Policy', sandboxPolicy(ctx.origin()))
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Cache-Control', 'no-store')
    res.sendFile(join(ctx.appDir, 'sandbox.html'), (error) => {
      if (error) next(error)
    })
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
