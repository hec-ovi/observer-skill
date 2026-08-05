import express from 'express'
import type { Express } from 'express'
import type { HostContext } from './context.ts'
import { errorHandler, notFound } from './respond.ts'
import { apiRoutes } from './routes/api.ts'
import { mountAppBuild } from './routes/app-build.ts'
import { liveRoutes } from './routes/live.ts'
import { sandboxRoutes } from './routes/sandbox.ts'

/**
 * Route order is the design: the routes this server owns come first, the app build fills in
 * the rest, and the shell answers last so it can never swallow an API call. Body parsing is
 * scoped to the two routes that read one, so nothing buffers the event stream.
 */
export function buildApp(ctx: HostContext): Express {
  const app = express()
  app.disable('x-powered-by')

  app.get('/healthz', (_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ ok: true, version: ctx.version })
  })

  app.use('/api', apiRoutes(ctx))
  app.use('/live', liveRoutes(ctx))
  app.use('/sandbox', sandboxRoutes(ctx))

  mountAppBuild(app, ctx)

  app.use(notFound)
  app.use(errorHandler)
  return app
}
