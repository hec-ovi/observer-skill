/**
 * The first shape of the page: a link, three switches, and optionally what the user wants
 * out of the video.
 *
 * The source is resolved by the server as the session is created, which is why a video that
 * cannot be embedded is refused right here, under the field, instead of eight seconds into
 * a session that was never going to play.
 */

import { useState } from 'react'
import { createSession, failureOf } from '../session/api.ts'
import type { Failure, Session } from '../session/record.ts'
import { FailureLine } from '../parts/FailureLine.tsx'
import { Switch } from '../parts/Switch.tsx'
import './feed.css'

const NOT_EMBEDDABLE: Failure = {
  code: 'SOURCE_NOT_EMBEDDABLE',
  message: 'This video cannot be played inside another page.',
  hint: 'Its owner disabled embedding. Try another recording of the same talk.',
}

export interface FeedProps {
  onOpened(session: Session): void
}

export function Feed({ onOpened }: FeedProps) {
  const [url, setUrl] = useState('')
  const [hasAds, setHasAds] = useState(false)
  const [extraKnowledge, setExtraKnowledge] = useState(true)
  const [toolkit, setToolkit] = useState(true)
  const [want, setWant] = useState('')
  const [opening, setOpening] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)

  async function open(): Promise<void> {
    setOpening(true)
    setFailure(null)
    try {
      const session = await createSession({
        url: url.trim(),
        hasAds,
        settings: { extraKnowledge, toolkit },
        userPrompt: want.trim() || null,
      })
      if (!session.source.embeddable) {
        setFailure(NOT_EMBEDDABLE)
        return
      }
      onOpened(session)
    } catch (error) {
      setFailure(failureOf(error))
    } finally {
      setOpening(false)
    }
  }

  return (
    <form
      className="feed"
      onSubmit={(event) => {
        event.preventDefault()
        void open()
      }}
    >
      <h1 className="feed-title">Observer</h1>

      <input
        className="feed-url"
        type="url"
        name="url"
        required
        value={url}
        placeholder="Video link"
        aria-label="Video link"
        onChange={(event) => setUrl(event.target.value)}
      />
      {failure ? <FailureLine failure={failure} /> : null}

      <div className="feed-switches">
        <Switch label="This video has ads" checked={hasAds} onChange={setHasAds} />
        <Switch label="Use extra knowledge" checked={extraKnowledge} onChange={setExtraKnowledge} />
        <Switch label="Build visuals" checked={toolkit} onChange={setToolkit} />
      </div>

      <input
        className="feed-want"
        type="text"
        value={want}
        placeholder="What do you want from this video"
        aria-label="What do you want from this video"
        onChange={(event) => setWant(event.target.value)}
      />

      <button className="feed-open" type="submit" disabled={opening || url.trim() === ''}>
        {opening ? 'Opening' : 'Open'}
      </button>
    </form>
  )
}
