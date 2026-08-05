import { join } from 'node:path'
import * as z from 'zod/v4'
import { ARTIFACT_KINDS } from '#artifact'
import { fail } from '#errors'
import type { Session } from '#session'
import { rangeOf } from '../range.ts'
import { seconds, sessionIdInput } from '../schema.ts'
import { artifactsDir, writeSnapshot } from '../snapshot.ts'
import { defineTool } from '../tool.ts'

/** What the record says while the page is still looking at the module. */
const UNVERIFIED = 'Verification has not finished.'

const buildErrorSchema = z.object({
  stage: z.enum(['check', 'bundle', 'verify']),
  message: z.string(),
  line: z.number().int().optional(),
  column: z.number().int().optional(),
  snippet: z.string().optional(),
  fix: z.string().optional(),
})

/**
 * "Build visuals" is the user's switch. With it off there is no visual pass to open, and a
 * session already past it would take the artifact anyway, so the setting is the gate.
 */
function requireToolkit(session: Session): void {
  if (session.settings.toolkit) return
  fail(
    'WRONG_PHASE',
    'This session has visuals turned off, so nothing is built for it.',
    session.phase === 'live'
      ? 'Answer with `say` instead.'
      : 'Close preparation with `ready` instead.',
  )
}

/**
 * An answer comes first and it comes as text, so authoring in `live` has to name the answer
 * that already went out.
 */
function requireAnswered(session: Session, afterEntryId: string | undefined): void {
  if (afterEntryId === undefined) {
    fail(
      'WRONG_PHASE',
      'Building during a live session needs `afterEntryId`, the id of an answer already sent.',
      'Answer with `say` first, then build with the `entryId` it returned.',
    )
  }
  const answered = session.log.some(
    (entry) => entry.id === afterEntryId && entry.role === 'agent',
  )
  if (!answered) {
    fail(
      'WRONG_PHASE',
      `No answer ${afterEntryId} has been sent in this session.`,
      'Answer with `say` first, then build with the `entryId` it returned.',
    )
  }
}

export const build = defineTool({
  name: 'build',
  description:
    'Compile one visual, run it in the open page, and return either line-accurate errors or ' +
    'the snapshot to look at. Rebuilding the same `id` replaces it.',
  // The first build is what opens the visual pass, the way the first `wait` starts the
  // session: nothing else moves a session out of the reading pass.
  phases: ['researching', 'building', 'ready', 'live'],
  input: z.object({
    sessionId: sessionIdInput,
    id: z.string().min(1).describe('Stable across rebuilds, so fixing one replaces it.'),
    title: z.string().min(1).describe('What the stage draws above it. Match `meta.title`.'),
    kind: z.enum(ARTIFACT_KINDS),
    source: z.string().min(1).describe('The ES module: `meta` and `mount(el, ctx)`.'),
    caption: z
      .string()
      .min(1)
      .optional()
      .describe(
        'One line the stage draws under the title. A chart whose values are illustrative ' +
          'says so here.',
      ),
    narration: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Spoken in the user's chosen voice when this visual is shown. For a process worth " +
          'walking through, not the caption read aloud.',
      ),
    conceptId: z.string().min(1).optional().describe('Links it in the same call.'),
    startsAt: seconds.optional().describe('The stretch of video this visual is about.'),
    endsAt: seconds.optional(),
    afterEntryId: z
      .string()
      .min(1)
      .optional()
      .describe('Required during a live session: the id of an answer already sent.'),
  }),
  output: z.object({
    ok: z.boolean(),
    artifactId: z.string(),
    size: z.object({ width: z.number(), height: z.number() }).optional(),
    snapshotPath: z.string().optional(),
    errors: z.array(buildErrorSchema).optional(),
  }),

  async run(input, call) {
    const session = call.require()
    const { store, artifact, host, knowledge, config } = call.runtime.deps
    const range = rangeOf(input.startsAt, input.endsAt)

    requireToolkit(session)
    if (session.phase === 'live') requireAnswered(session, input.afterEntryId)

    // Verification runs in the user's own page. Without one there is nowhere to check the
    // module, and an unchecked module is never stored.
    if (!host.hasPage(session.id)) {
      fail(
        'PAGE_NOT_OPEN',
        `No page is listening to session ${session.id}, so nothing can be verified.`,
        'Ask the user to open the session page, then build again.',
      )
    }
    if (session.phase === 'researching') await store.advance(session.id, 'building')

    const compiled = await artifact.build({
      sessionId: session.id,
      id: input.id,
      source: input.source,
      home: config.home,
    })
    if (!compiled.ok) {
      return { ok: false, artifactId: input.id, errors: compiled.errors }
    }

    // The page fetches the bundle by id, which means the record has to name it before the
    // sandbox can run it. It stays failed until the page says otherwise.
    const pending = {
      id: input.id,
      title: input.title,
      kind: input.kind,
      caption: input.caption ?? null,
      narration: input.narration ?? null,
      conceptId: input.conceptId ?? null,
      startsAt: range?.startsAt ?? null,
      endsAt: range?.endsAt ?? null,
      bundlePath: compiled.bundlePath,
    }
    await store.putArtifact(session.id, { ...pending, status: 'failed', error: UNVERIFIED })

    const verified = await host.verify({ sessionId: session.id, artifactId: input.id })
    if (!verified.ok) {
      await store.putArtifact(session.id, {
        ...pending,
        status: 'failed',
        error: verified.errors.join('\n'),
      })
      return {
        ok: false,
        artifactId: input.id,
        errors: verified.errors.map((message) => ({ stage: 'verify' as const, message })),
      }
    }

    const snapshot = await writeSnapshot(
      join(artifactsDir(config.home, session.id), `${input.id}.png`),
      verified.snapshot,
    )
    await store.putArtifact(session.id, {
      ...pending,
      status: 'built',
      snapshotPath: snapshot?.path ?? null,
      error: null,
    })
    if (input.conceptId !== undefined) {
      await knowledge.linkArtifact(session.id, input.conceptId, input.id, range)
    }

    // The picture goes back with the result, so the agent judges what it made without a
    // second call.
    if (snapshot !== null) {
      call.attach({ type: 'image', data: snapshot.base64, mimeType: 'image/png' })
    }

    return {
      ok: true,
      artifactId: input.id,
      size: verified.size,
      ...(snapshot === null ? {} : { snapshotPath: snapshot.path }),
    }
  },
})
