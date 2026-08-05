/**
 * One screen that changes shape. Without a session it is the feed; with one it is the
 * session, deep-linked at `/s/:id` so a reload lands back where the user was.
 */

import { useEffect, useState } from 'react'
import { Feed } from './screens/Feed.tsx'
import { sessionIdFrom, sessionPath } from './session/route.ts'
import { SessionView } from './SessionView.tsx'
import './app.css'

export function App() {
  const [sessionId, setSessionId] = useState<string | null>(() => sessionIdFrom(location.pathname))

  useEffect(() => {
    const onPop = (): void => setSessionId(sessionIdFrom(location.pathname))
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])

  if (!sessionId) {
    return (
      <Feed
        onOpened={(session) => {
          history.pushState(null, '', sessionPath(session.id))
          setSessionId(session.id)
        }}
      />
    )
  }

  return <SessionView key={sessionId} sessionId={sessionId} />
}
