# web-host

## Purpose

The HTTP half of the process: it serves the built app and carries the live channel to and
from the page. The agent talks to `agent-io` over stdio and never comes through here.

## Inputs

Schema: [`src/schema.ts`](src/schema.ts) → `UpstreamEvent`, `CreateSessionInput`,
`TranscriptQuery`

```ts
createHost({ store, appDir, home, port, bind, version, heartbeatMs,
             createSession, readTranscript }): Promise<Host>
```

- `store`: anything satisfying `SessionPort`, the part of the `session` contract used here.
- `appDir`: the built app. `index.html`, `assets/`, `sandbox.html`, and `sandbox/vendor/`.
- `home`: where sessions live. Bundles and snapshots resolve inside the session's folder.
- `port` (4830), `bind` (`127.0.0.1`), `version` (`0.0.0`), `heartbeatMs` (15000) are
  defaults. `port: 0` asks the kernel for a free one.
- `createSession` and `readTranscript` are the two things this box cannot do itself: it
  knows no providers and does not read transcripts. Without them those two routes answer
  `PROVIDER_UNAVAILABLE`.

```ts
Host = {
  url: string | null            // null until the listener starts
  port: number | null
  start(): Promise<{ url, port }>
  verify({ sessionId, artifactId, timeoutMs? }): Promise<VerifyResult>
  close(): Promise<void>
}
```

`createHost` does not listen. `start()` does, and the caller calls it the first time a
session exists, so a CLI session that never opens a video costs nothing. If `port` is taken
the host moves up one at a time, up to twenty, and reports the port it got.

`verify` shows one artifact to the open page's sandbox and resolves with what the page
reports. It rejects with `PAGE_NOT_OPEN` when nothing is listening to that session, and one
artifact of one session has one verification at a time: asking again supersedes the older
request, and the same artifact id in another session is a separate run. A page that never
answers resolves as a failed verification, never as a hang.

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
| `/sandbox/frame` | GET | The isolated document verification runs a module in |
| `/sandbox/*` | GET | The library registry an artifact imports, from `appDir/sandbox` |
| `/healthz` | GET | Liveness, and the version |

The verify frame is served from a route, not a `srcdoc` or a blob, because only an HTTP
response carries its own content policy: it runs with `default-src 'none'`,
`connect-src 'none'` and `sandbox allow-scripts`. The document itself is the app build's
own `sandbox.html`, so it runs the same loader the visible stage does; that document and the
protocol it speaks belong to `app/stage`, and which module to run reaches it over a port
rather than through the URL. It has one address only: the build's own `/sandbox.html` is a
404, so the document cannot be framed without the policy on it. Every script route sends
`Access-Control-Allow-Origin: *`, because a module script is always a CORS fetch and a
sandboxed document has an opaque origin.

## The live channel

Downstream, as SSE, each with an id so the page can order what it receives:

| Event | Data |
|---|---|
| `patch` | A partial session record |
| `phase` | `{ phase, progress }` |
| `say` | `{ entryId, text, speak, artifactId }` |
| `show` / `hide` | `{ artifactId }` / `{}` |
| `verify` | `{ requestId, url, timeoutMs }` |
| `ping` | Heartbeat, so proxies and sleeping tabs do not drop the connection |

Upstream, as JSON posts, answered with `202` and `{ ok: true }`:

| Event | Data |
|---|---|
| `position` | `{ time, state }` |
| `ask` | `{ text, at, via }` |
| `settings` | `{ at, settings }` |
| `verify-result` | `{ requestId, ok, errors[], size, snapshot }` |

`ask` goes into the session inbox and is answered by the agent. `position` updates the
record and is not queued. `settings` does both: the record keeps it, and the inbox carries
it, because the agent waits on a settings change. `verify-result` resolves the pending
verification.

## Errors

HTTP status plus a body of `{ code, message, hint }` using the shared error set. A body or
query that does not fit its schema is `INVALID_PATCH` with the field named; a path this
server has nothing at is `UNKNOWN_ARTIFACT`. When the framework decided the status (a static
file that is not there, a body over the limit) the body is written here, and the framework's
own text, which names a path on this disk, goes to stderr. A route that fails does not take
the process down, and a failing SSE subscriber is dropped without disturbing the others.

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
- `close()` returns while a page is still attached: the streams are ended and the sockets
  behind them are reaped rather than waited out. A `close()` that lands while `start()` is
  still binding waits for that bind and takes the listener down with it.

## How to modify this box safely

Routes are thin: they validate, call `store` or one of the two handlers they were given,
and serialize. Nothing here decides anything. Route order is the design, and it lives in
one file, [`src/app.ts`](src/app.ts): what this server owns, then the app build, then the
shell, which is why an API call can never be answered with HTML.

Tests drive the real server on an ephemeral port with a fake store: a subscriber receives a
patch within a tick of a write, an upstream event reaches the bus, a heartbeat arrives, a
dropped socket unsubscribes, and a verification with no page open is refused. Fixtures sit
in `fixtures.ts` at the box root, outside `test/`, because the runner counts every file
under a `test/` directory as a test. Run them with
`node --test "boxes/web-host/test/*.test.ts"`.
