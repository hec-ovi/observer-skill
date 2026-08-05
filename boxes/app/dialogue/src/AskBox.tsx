/**
 * How a question is asked: typed and sent with enter, or spoken while the talk button is
 * held. Both carry the second the user started asking, because that is the second the
 * question is about.
 */

import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react'
import { isBlocked } from './hold-lines.ts'
import type { AskBoxProps } from './types.ts'
import { type HoldControls, useHold } from './use-hold.ts'
import './ask.css'

/** Keys that hold the talk button down, for a user who is not holding a pointer. */
const TALK_KEYS = new Set([' ', 'Enter'])

function holdStatus(hold: HoldControls): string | null {
  if (hold.partial) return hold.partial
  if (hold.state === 'listening') return 'Listening.'
  if (hold.state === 'working') return 'Transcribing.'
  return hold.problem
}

export function AskBox({ at, listener, disabled = false, onAsk, onOpenSettings }: AskBoxProps) {
  const [draft, setDraft] = useState('')
  /** The second the draft was started at, held until it is sent or emptied. */
  const draftAt = useRef<number | null>(null)
  const holdAt = useRef(0)

  const hold = useHold({
    listener,
    onUtterance: (text) => onAsk({ text, at: holdAt.current, via: 'voice' }),
  })

  function edit(value: string): void {
    if (!value.trim()) draftAt.current = null
    else if (draftAt.current === null) draftAt.current = at()
    setDraft(value)
  }

  function send(): void {
    const text = draft.trim()
    if (!text || disabled) return
    onAsk({ text, at: draftAt.current ?? at(), via: 'text' })
    draftAt.current = null
    setDraft('')
  }

  function onDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    send()
  }

  function onTalkDown(event: PointerEvent<HTMLButtonElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId)
    holdAt.current = at()
    hold.press()
  }

  function onTalkKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (!TALK_KEYS.has(event.key) || event.repeat) return
    event.preventDefault()
    holdAt.current = at()
    hold.press()
  }

  function onTalkKeyUp(event: KeyboardEvent<HTMLButtonElement>): void {
    if (!TALK_KEYS.has(event.key)) return
    hold.release()
  }

  const status = holdStatus(hold)
  return (
    <div className="ask">
      <textarea
        className="ask-draft"
        value={draft}
        rows={2}
        placeholder="Ask about this moment"
        aria-label="Ask about this moment"
        onChange={(event) => edit(event.target.value)}
        onKeyDown={onDraftKeyDown}
      />

      <button
        type="button"
        className="ask-talk"
        aria-pressed={hold.holding}
        disabled={disabled}
        onPointerDown={onTalkDown}
        onPointerUp={hold.release}
        onPointerCancel={hold.release}
        onKeyDown={onTalkKeyDown}
        onKeyUp={onTalkKeyUp}
      >
        Hold to talk
      </button>

      {disabled ? <p className="ask-note">No agent attached. Your question waits here.</p> : null}

      <p className="ask-note" role="status">
        {status}
        {status && isBlocked(hold.state) ? (
          <button type="button" className="ask-fix" onClick={onOpenSettings}>
            Open settings
          </button>
        ) : null}
      </p>
    </div>
  )
}
