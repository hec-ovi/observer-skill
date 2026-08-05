# artifact

## Purpose

Take a module the agent wrote and turn it into something that is safe to put on the user's
screen, or into an error message precise enough to fix in one pass.

## Inputs

Schema: [`src/schema.ts`](src/schema.ts)

```ts
build({ sessionId, id, source, home }): Promise<BuildResult>
```

- `source`: one ES module, TypeScript or JavaScript, as a string.
- `id`: stable across rebuilds, so fixing an artifact replaces it rather than piling up.
- `sessionId` and `id` become path segments: letters, digits, dot, dash, underscore.

## The module the source must be

```ts
export const meta = {
  title: string,
  kind: 'chart' | 'dataviz' | 'diagram' | 'simulation',
  caption?: string,
}

export function mount(el: HTMLElement, ctx: Ctx): () => void
```

```ts
Ctx = {
  theme: Theme,                       // resolved tokens, current at mount
  onTheme(cb: (t: Theme) => void): void,   // fires on light/dark change
  time: number,                       // the second of the video this was opened at
  size: { width, height },
  onResize(cb): void,
}
```

`mount` returns its own cleanup. Imports resolve to `echarts`, `d3`, and `katex` and
nothing else.

## Outputs

```ts
BuildResult =
  | { ok: true,  bundlePath, bytes, warnings: string[] }
  | { ok: false, errors: BuildError[] }

BuildError = { stage: 'check'|'bundle', message, line?, column?, snippet?, fix? }
```

`fix` is a sentence naming what to do, because the reader is an agent under time pressure
and a raw compiler message costs it a round trip.

The bundle is written to `<home>/sessions/<sessionId>/artifacts/<id>.js`: ESM, browser targeted,
source map inline, with `echarts`, `d3` and `katex` left as bare imports for the stage to
resolve.

Also exported: `ARTIFACT_KINDS`, `ARTIFACT_REGISTRY`, and the types above.

## Checks, before bundling

| Check | Why |
|---|---|
| Only `echarts`, `d3`, `katex` are imported, and only as ES imports | Everything else is unavailable at runtime, and an unknown import (or a `require`) is a silent blank screen |
| No `fetch`, `XMLHttpRequest`, `WebSocket`, or dynamic `import()` | A visual is drawn from data it was given, not from the network |
| No `border-radius` other than `0` | The design has no rounded corners, and this is where that is enforced |
| No heading element whose text repeats `meta.title` | The stage renders the title; repeating it is the exact bloat we refuse |
| `meta` and `mount` are both exported, with the right shapes | A module missing either is a blank stage |

Every failed check names the line and what to write instead.

## Errors

`ARTIFACT_INVALID` (a check or the bundle failed; the errors are in the result, not thrown),
`ARTIFACT_TOO_LARGE` (the built bundle is over 2 MB), `STORE_UNWRITABLE`. The last two are
thrown; everything else comes back as `{ ok: false, errors }`.

## Dependencies

None. This box does not know about sessions beyond the directory it is told to write to,
and it never runs the code it builds. Running it is `app/stage`'s job.

## Invariants

- A successful build produces one self-contained module file whose only free variables are
  the three registry names.
- Building is pure with respect to the session: the same source always gives the same
  result, and a failed build writes nothing.
- The build never executes the module, so nothing the agent wrote runs on the server.
- Errors are line-accurate against the source the agent submitted, not against a
  transformed copy.
- No time limit is placed on the module's own logic here; that belongs to verification.

## How to modify this box safely

Checks are a list of pure functions over the parsed source, each with its own test and its
own fixture that fails it. The bundler is behind one function so it can be swapped. The
test that matters most: every check's error message, given to a fresh agent with the bad
source, produces a correct fix.
