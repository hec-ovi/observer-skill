# web-host

## Purpose

One HTTP server on one port: it serves the built app, carries the live channel to and from
the page, and hosts the MCP endpoint the agent connects to.

## Inputs

```ts
createHost({ store, mcp, appDir, port, bind }): Promise<Host>
```

`Host` is `{ url, port, close() }`. `mcp` is a request handler supplied by `agent-io`;
this box mounts it and knows nothing about what it does.

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
| `/mcp` | POST, GET | The MCP endpoint, mounted from `agent-io` |
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

- One port serves everything. There is no second process and no second origin.
- Binds to loopback by default. Serving to a network is opt-in and is logged when it
  happens.
- The MCP mount receives the request body untouched; body parsing for the API routes is
  scoped to those routes only.
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
