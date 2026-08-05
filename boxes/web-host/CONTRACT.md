# web-host

## Purpose

The HTTP half of the process: it serves the built app and carries the live channel to and
from the page. The agent talks to `agent-io` over stdio and never comes through here.

## Inputs

```ts
createHost({ store, appDir, port, bind }): Promise<Host>
```

`Host` is `{ url, port, close() }`. The listener is started on demand, the first time a
session exists, so a CLI session that never opens a video costs nothing. If `port` is taken
the host moves up one at a time and reports the port it got.

## HTTP surface

| Route | Method | Purpose |
|---|---|---|
| `/` and the app's assets | GET | The built frontend, with SPA fallback |
| `/s/:id` | GET | The same app, deep-linked to a session |
| `/api/session` | POST | Resolve a URL and create a session; returns the record |
| `/api/session/:id` | GET | The record, once, for a page that just loaded or reloaded |
| `/api/session/:id/transcript` | GET | Paginated segments, `?from&to&offset&limit` |
| `/api/artifact/:sessionId/:artifactId` | GET | The built bundle, as a JavaScript module |
| `/api/snapshot/:sessionId/:artifactId` | GET | The PNG the agent looked at |
| `/live/:id` | GET | Server-sent events for this session |
| `/live/:id/event` | POST | One upstream event from the page |
| `/sandbox/:sessionId/:artifactId` | GET | The isolated document that verification runs a module in |
| `/healthz` | GET | Liveness, and the version |

## The live channel

Downstream, as SSE, each with an id so a reconnect can resume:

| Event | Data |
|---|---|
| `patch` | A partial session record |
| `phase` | `{ phase, progress }` |
| `say` | `{ entryId, text, speak, artifactId? }` |
| `show` / `hide` | `{ artifactId }` / `{}` |
| `verify` | `{ requestId, url, timeoutMs }` |
| `ping` | Heartbeat, so proxies and sleeping tabs do not drop the connection |

Upstream, as JSON posts:

| Event | Data |
|---|---|
| `position` | `{ time, state }` |
| `ask` | `{ text, at, via }` |
| `settings` | A settings patch |
| `verify-result` | `{ requestId, ok, errors[], size, snapshot? }` |

`ask` goes into the session inbox and is answered by the agent. `position` updates the
record and is not queued. `verify-result` resolves the pending verification.

## Errors

HTTP status plus a body of `{ code, message, hint }` using the shared error set. A route
that fails does not take the process down, and a failing SSE subscriber is dropped without
disturbing the others.

## Dependencies

`session`.

## Invariants

- One port serves everything the browser needs. There is no second process and no second
  origin.
- Binds to loopback by default. Serving to a network is opt-in and is logged when it
  happens.
- Nothing is written to stdout. The process speaks MCP on stdout, so every log line goes to
  stderr, and a stray `console.log` anywhere in this box corrupts the protocol.
- SSE responses set no-transform and no buffering, flush on write, heartbeat on an
  interval, and clean up their subscription when the socket closes, including when the
  client vanishes without a close frame.
- A reconnecting page gets the record once over REST and then follows patches. The channel
  never replays state it does not own.
- Artifact bundles are served with a content type that lets a module load, and from a path
  that cannot escape the session's own directory.
- The port in use is reported as a clear message naming the port, not a stack trace.

## How to modify this box safely

Routes are thin: they validate, call `session` or the handler they were given, and
serialize. Nothing here decides anything. Tests drive the real server on an ephemeral port
with a fake store: a subscriber receives a patch within a tick of a write, an upstream
event reaches the bus, a heartbeat arrives, and a dropped socket unsubscribes.
