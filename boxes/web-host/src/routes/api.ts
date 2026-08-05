import express from 'express'
import type { Router } from 'express'
import { fail } from '#errors'
import { artifactOf } from '../artifact-lookup.ts'
import type { HostContext } from '../context.ts'
import { sessionFile } from '../paths.ts'
import { createSessionInputSchema, transcriptQuerySchema } from '../schema.ts'
import { sendFile } from '../send-file.ts'
import { parse } from '../validate.ts'

/** The REST face: the record, its transcript, and the files one session owns. */
export function apiRoutes(ctx: HostContext): Router {
  const router = express.Router()

  router.post('/session', express.json({ limit: '64kb' }), async (req, res) => {
    const create = ctx.createSession
    if (create === null) {
      fail(
        'PROVIDER_UNAVAILABLE',
        'This host cannot open a session on its own.',
        'Start the session from the agent with the `open` tool.',
      )
    }
    const input = parse(createSessionInputSchema, req.body, 'session request')
    const session = await create({
      url: input.url,
      settings: input.settings,
      userPrompt: input.userPrompt,
    })
    res.status(201).json(session)
  })

  router.get('/session/:id', (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(ctx.store.get(req.params.id))
  })

  router.get('/session/:id/transcript', async (req, res) => {
    const read = ctx.readTranscript
    if (read === null) {
      fail(
        'PROVIDER_UNAVAILABLE',
        'This host was given no transcript reader.',
        'Read the transcript through the agent instead.',
      )
    }
    const id = req.params.id
    ctx.store.get(id)
    const range = parse(transcriptQuerySchema, req.query, 'transcript range')
    res.set('Cache-Control', 'no-store')
    res.json(await read(id, range))
  })

  router.get('/artifact/:sessionId/:artifactId', async (req, res) => {
    const { sessionId, artifactId } = req.params
    const artifact = artifactOf(ctx, sessionId, artifactId)
    // Module scripts are always CORS fetches, and the sandbox that loads this one has an
    // opaque origin, so every URL is cross-origin to it.
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Content-Type', 'text/javascript; charset=utf-8')
    res.set('Cache-Control', 'no-cache')
    await sendFile(res, sessionFile(ctx.home, sessionId, artifact.bundlePath), {
      message: `The bundle for ${artifactId} is not on disk.`,
      hint: 'Build the artifact again; the record points at a file that is gone.',
    })
  })

  router.get('/snapshot/:sessionId/:artifactId', async (req, res) => {
    const { sessionId, artifactId } = req.params
    const artifact = artifactOf(ctx, sessionId, artifactId)
    if (artifact.snapshotPath === null) {
      fail(
        'UNKNOWN_ARTIFACT',
        `Artifact ${artifactId} has no snapshot.`,
        'Verify the artifact so a snapshot is taken.',
      )
    }
    res.set('Content-Type', 'image/png')
    res.set('Cache-Control', 'no-cache')
    await sendFile(res, sessionFile(ctx.home, sessionId, artifact.snapshotPath), {
      message: `The snapshot for ${artifactId} is not on disk.`,
      hint: 'Verify the artifact again so a new snapshot is taken.',
    })
  })

  return router
}
