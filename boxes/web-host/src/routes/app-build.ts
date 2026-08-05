import { join } from 'node:path'
import express from 'express'
import type { Express } from 'express'
import type { HostContext } from '../context.ts'
import { sendFile } from '../send-file.ts'

/** Paths this server answers itself. The page never gets served over one of them. */
const SERVER_PATHS = ['/api', '/live', '/sandbox', '/assets', '/healthz']

/**
 * The built app, in three layers: hashed assets that never change, everything else in the
 * build, and the shell for every route the page owns.
 */
export function mountAppBuild(app: Express, ctx: HostContext): void {
  const index = join(ctx.appDir, 'index.html')

  // A missing hashed asset is a 404, never the shell: a page that gets HTML where it asked
  // for a module fails with a syntax error nobody can read.
  app.use(
    '/assets',
    express.static(join(ctx.appDir, 'assets'), {
      index: false,
      immutable: true,
      maxAge: '365d',
      fallthrough: false,
    }),
  )

  app.use(express.static(ctx.appDir, { index: false, maxAge: 0 }))

  app.get('/{*splat}', async (req, res, next) => {
    if (SERVER_PATHS.some((path) => req.path === path || req.path.startsWith(`${path}/`))) {
      next()
      return
    }
    // The shell names the hashed assets, so it is revalidated on every load.
    res.set('Cache-Control', 'no-cache')
    await sendFile(res, index, {
      message: 'The app build has no index.html.',
      hint: 'Build the app, then start the host with that directory as appDir.',
    })
  })
}
