import express from 'express'
import type { Router } from 'express'
import type { HostContext } from '../context.ts'
import type { UpstreamEvent } from '../schema.ts'
import { upstreamEventSchema } from '../schema.ts'
import { parse } from '../validate.ts'

/** Downstream as events, upstream as one JSON post. Both belong to the open page. */
export function liveRoutes(ctx: HostContext): Router {
  const router = express.Router()

  router.get('/:id', (req, res) => {
    const id = req.params.id
    ctx.store.get(id)
    ctx.hub.attach(id, req, res)
  })

  // A verify result can carry a snapshot, so the limit is generous.
  router.post('/:id/event', express.json({ limit: '8mb' }), async (req, res) => {
    const id = req.params.id
    ctx.store.get(id)
    const event = parse(upstreamEventSchema, req.body, 'live event')
    await apply(ctx, id, event)
    res.status(202).json({ ok: true })
  })

  return router
}

async function apply(ctx: HostContext, id: string, event: UpstreamEvent): Promise<void> {
  switch (event.type) {
    case 'position':
      // The player moves constantly; it updates the record and is never queued.
      await ctx.store.patch(id, { position: { time: event.time, state: event.state } })
      return
    case 'ask':
      await ctx.store.push(id, {
        kind: 'ask',
        text: event.text,
        at: event.at,
        via: event.via,
      })
      return
    case 'settings':
      // Kept on the record, and queued as well, because the agent waits on this.
      await ctx.store.patch(id, { settings: event.settings })
      await ctx.store.push(id, { kind: 'settings', at: event.at, settings: event.settings })
      return
    case 'verify-result':
      ctx.verifications.settle(event.requestId, {
        ok: event.ok,
        errors: event.errors,
        size: event.size,
        snapshot: event.snapshot,
      })
      return
  }
}
