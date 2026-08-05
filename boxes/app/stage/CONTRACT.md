# stage

## Purpose

The surface a visual appears on. It loads a built module, gives it the theme and the space,
takes it away again, and it is also where a new module is checked before the user ever
sees it.

## Inputs

```ts
<Stage active artifact onDismiss />
createVerifier({ onResult }): Verifier
```

- `artifact`: `{ id, title, caption?, url }`. The url is the built module served by
  `web-host`.
- `active` drives the cross-fade with the player. The stage never appears without an
  artifact and never lingers after `onDismiss`.
- `Verifier` is the hidden half: `verify({ requestId, url, timeoutMs })`.

## Outputs

- Rendered visual, with the title and caption drawn by the stage, once.
- `onDismiss()` when the user closes it, presses escape, or presses play.
- Verification results: `{ requestId, ok, errors[], size, snapshot? }`.

## The registry

`echarts`, `d3`, and `katex` are provided to artifact modules. They are loaded once for the
page and shared, so the tenth chart costs nothing to open. Adding a library is one registry
entry and one line in the artifact contract's allowlist, and nothing else changes.

## Theme

The stage resolves the current tokens, passes them into `mount`, and calls the module's
`onTheme` subscriber when the user switches light and dark. A chart restyles in place. No
artifact is rebuilt, reloaded, or remounted for a theme change.

## Transitions

The player and the stage occupy the same region and cross-fade in 180 ms with a small
translate. Under `prefers-reduced-motion` they swap without motion. The video pauses when
the stage takes over and stays paused when it leaves, because the user was reading.

## Verification

The verifier is a hidden sandboxed iframe that exists whenever the page is open. It:

1. Loads the module in an isolated context with the registry available and no access to the
   page, the session, or the network.
2. Calls `mount` with a fixed size and a fixed theme.
3. Captures thrown errors, rejected promises, and console errors.
4. Times out a module that never finishes mounting, and reports that as an error rather
   than hanging.
5. Renders once, takes a PNG of the result, and unmounts.

The result goes upstream so the agent sees exactly what failed, or looks at the picture.
A visual that has not passed here is never shown to the user.

## Errors

`ARTIFACT_LOAD_FAILED`, `ARTIFACT_MOUNT_FAILED`, `ARTIFACT_TIMEOUT`, `REGISTRY_MISSING`.
A failed artifact shows a single line and a way back to the video, never a stack trace.

## Dependencies

None. It is handed a url and a theme; it does not know what a session or a concept is.

## Invariants

- One artifact mounted at a time. Opening another unmounts the first, and its cleanup runs.
- The module's cleanup is called on every path out, including an error and a page unload.
- A module cannot reach the page: no access to the parent document, to storage, or to the
  network.
- The stage owns the title and the caption. Whatever an artifact draws inside itself, the
  frame around it is consistent.
- The verifier and the visible stage run the same loader, so passing verification means it
  will render.

## How to modify this box safely

The loader is one module used by both the visible stage and the verifier; change it once.
Tests mount a real fixture module in a simulated DOM, assert cleanup runs, assert a theme
change reaches the module without a remount, and assert a module that throws produces one
line and a working way back.
