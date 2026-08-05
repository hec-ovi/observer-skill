# stage

## Purpose

The surface a visual appears on. It loads a built module, gives it the theme and the space,
takes it away again, and it is also where a new module is checked before the user ever
sees it.

## Inputs

Types: [`src/types.ts`](src/types.ts)

```ts
<Stage active artifact time onDismiss />
createVerifier({ onResult }): Verifier
```

- `artifact`: `{ id, title, caption?, url }`, or `null`. The url is the built module served
  by `web-host`.
- `active` drives the cross-fade with the player. The stage never appears without an
  artifact and never lingers after `onDismiss`.
- `time` is the video second the artifact was opened at, which reaches the module as
  `ctx.time`. It defaults to `0`.
- `Verifier` is the hidden half: `verify({ requestId, url, timeoutMs })`, default 8000 ms.

## Outputs

- Rendered visual, with the title and caption drawn by the stage, once.
- `onDismiss()` when the user closes it or presses escape. The app calls it for play.
- Verification results, on `onResult`: `{ requestId, ok, errors[], size, snapshot? }`.
  `errors` are lines of text for the agent, `snapshot` is a PNG data URL.

## The registry

`echarts`, `d3`, and `katex` are provided to artifact modules. Each is one built module
under `/sandbox/vendor/`, mapped to its bare name by a single inline import map, carried
with the same bytes by `index.html` and `sandbox.html`, so they are loaded once and shared
and the tenth chart costs nothing to open. Import maps are per document and cannot be loaded
from a file, which is why there are two copies; a test holds them to each other and to
`src/registry.ts`. `vendor/echarts.ts` registers the charts and components an artifact may
use, and the `observer-light` and `observer-dark` themes, built from the page's tokens in
`vendor/themes.ts`. Adding a library is one entry in `src/registry.ts`, one entry in
`vendor/vite.config.ts`, and one line in the artifact contract's allowlist.

Build them with the app, after it, because they land in its output directory:

```
npx vite build && npx vite build --config boxes/app/stage/vendor/vite.config.ts
```

## Theme

The stage resolves the current tokens, passes them into `mount` (colours, fonts, the corner
radius, and the motion length), and calls the module's `onTheme` subscriber when the user
switches light and dark. A chart restyles in place. No artifact is rebuilt, reloaded, or
remounted for a theme change.

## Transitions

The player and the stage occupy the same region and cross-fade in `--motion` with a small
translate. Under `prefers-reduced-motion` that is `0` and they swap without motion. The
video pauses when the stage takes over and stays paused when it leaves, because the user
was reading.

## Verification

`verify` opens a hidden sandboxed frame on `/sandbox/frame`, the isolated document
`web-host` serves with its own content policy. It:

1. Loads the module in an opaque origin with the registry available and no access to the
   page, the session, or the network.
2. Calls `mount` at 960x540 in the light theme.
3. Captures thrown errors, rejected promises, console errors, and anything the policy
   blocked.
4. Times out a module that never finishes mounting, and reports that as an error rather
   than hanging.
5. Renders once, takes a PNG of the result, and unmounts.

The frame lives for one run: removing it is what stops a module that will not stop. The
result goes upstream so the agent sees exactly what failed, or looks at the picture. A
visual that has not passed here is never shown to the user.

## Errors

`ARTIFACT_LOAD_FAILED`, `ARTIFACT_MOUNT_FAILED`, `ARTIFACT_TIMEOUT`, `REGISTRY_MISSING`.
A failed artifact shows a single line and a way back to the video, never a stack trace.
`REGISTRY_MISSING` is for the one case it names: the engine could not resolve one of the
registry's specifiers. Everything else that will not load is `ARTIFACT_LOAD_FAILED`.

## Dependencies

The page's design tokens, and its `.button` and `.button-ghost` classes for the two controls
the frame owns. Nothing else: it is handed a url and a theme, and it does not know what a
session or a concept is.

## Invariants

- One artifact mounted at a time. Opening another unmounts the first, and its cleanup runs.
- The module's cleanup is called on every path out, including an error and a page unload.
- A module cannot reach the page: the frame is sandboxed with `allow-scripts` alone, so it
  has no parent document, no storage, and no network.
- The stage owns the title and the caption. Whatever an artifact draws inside itself, the
  frame around it is consistent.
- The verifier and the visible stage run the same loader, so passing verification means it
  will render.

## What `web-host` has to serve

- `GET /sandbox/frame` → the built `sandbox.html`, with the sandbox headers and CSP.
- That CSP's `script-src` has to allow the document's inline import map, as a
  `'sha256-...'` of the script body or a nonce stamped on the tag. Without the allowance the
  map is dropped, no artifact resolves `echarts`, `d3`, or `katex`, and every artifact that
  uses the registry comes back `REGISTRY_MISSING`. Compute it from the inline scripts of the
  document being served, never from a copy kept elsewhere, so the policy cannot drift away
  from the page it protects. Any policy later put on the app's own document needs the same
  allowance: it carries the same map.
- `GET /sandbox/vendor/*.js` and the app's `/assets/*`, both with
  `Access-Control-Allow-Origin: *`: every module and stylesheet the frame loads is a CORS
  fetch from an opaque origin.

## How to modify this box safely

The loader (`src/loader.ts`) and the runtime (`src/runtime.ts`) are one pair used by both
the visible stage and the frame's script in `sandbox/`; change them once. Tests mount a real
fixture module in a simulated DOM, assert cleanup runs, assert a theme change and a resize
reach the module without a remount, assert both ways out call `onDismiss`, and assert a
module that throws produces one line and a working way back. The verifier is driven through
the port it hands the frame, which is the whole of the protocol between them.
