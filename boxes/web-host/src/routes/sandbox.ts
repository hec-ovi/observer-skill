import type { ServerResponse } from 'node:http'
import { join } from 'node:path'
import express from 'express'
import type { Router } from 'express'
import { artifactOf } from '../artifact-lookup.ts'
import type { HostContext } from '../context.ts'
import { sandboxDocument, sandboxPolicy } from '../sandbox-document.ts'

/** The runner is a module script fetched from an opaque origin, so it needs CORS headers. */
function allowAnyOrigin(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-cache')
}

export function sandboxRoutes(ctx: HostContext): Router {
  const router = express.Router()

  router.get('/:sessionId/:artifactId', (req, res) => {
    const { sessionId, artifactId } = req.params
    artifactOf(ctx, sessionId, artifactId)

    const origin = ctx.origin()
    res.set('Content-Type', 'text/html; charset=utf-8')
    res.set('Content-Security-Policy', sandboxPolicy(origin))
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Cache-Control', 'no-store')
    res.send(
      sandboxDocument({
        bundleUrl: `/api/artifact/${encodeURIComponent(sessionId)}/${encodeURIComponent(artifactId)}`,
        parentOrigin: origin,
      }),
    )
  })

  // `runner.js` and anything else the stage ships beside it.
  router.use(
    express.static(join(ctx.appDir, 'sandbox'), {
      index: false,
      fallthrough: false,
      setHeaders: allowAnyOrigin,
    }),
  )

  return router
}
