# ingest

## Purpose

Turn whatever the user pasted into a source the rest of the system can work with, and say
early whether it can actually be watched and transcribed.

## Inputs

Schema: [`src/schema.ts`](src/schema.ts) → `ResolveInput`

```ts
resolve({ url, hasAds }): Promise<Source>
```

- `url`: what the user pasted. Full watch URLs, short links, embed URLs, shorts, live URLs,
  playlist URLs with a video in them, and a bare eleven-character id are all accepted. A
  missing `https://` is tolerated.
- `hasAds`: the user's answer to "does this video carry ads", carried through untouched.
  Optional, false when not asked.

## Outputs

Schema: [`src/schema.ts`](src/schema.ts) → `Source`

```ts
{ provider: 'youtube', videoId, url, title, channel, duration, publishedAt,
  hasCaptions, captionLanguages, hasAds, embeddable, degraded }
```

- `url` is the canonical watch URL, whatever form was pasted.
- `duration` in seconds. `publishedAt` is `YYYY-MM-DD` and is what the research pass
  compares against today to find what has moved since.
- `hasCaptions` and `captionLanguages` let the caller pick the transcript provider before
  spending a minute finding out.
- `embeddable` is false when the owner disabled embedding. The caller must refuse the
  session then, before any preparation, because the player will never load.
- `degraded` is true when only the keyless lookup answered. `duration`, `publishedAt` and
  `hasCaptions` are then null and `captionLanguages` empty, so an unknown is never read as
  a no.

## Errors

- `BAD_SOURCE`: not a recognizable video URL.
- `SOURCE_UNAVAILABLE`: private, deleted, region blocked, or age restricted.
- `SOURCE_NOT_EMBEDDABLE`: real video, but it cannot be played inside our page.
- `PROVIDER_UNAVAILABLE`: the tool this provider needs is missing or refused.

Each error carries a `hint` naming what the user can do: paste a different link, install
the missing tool, pick another video.

## Dependencies

None.

## Invariants

- Resolution is read-only and downloads no media.
- It works with nothing installed. The fast keyless embed lookup answers "does this exist
  and can we play it" on its own; the richer lookup fills in duration, publish date, and the
  caption list, and its absence degrades those fields rather than failing the call.
- One network round trip's worth of work. This runs while the user is still looking at the
  paste box, so it answers in seconds or it fails.
- The provider is chosen by the URL, and its name appears nowhere outside this box.
- No cookies, tokens, or account state are required for a public video. When a provider
  needs credentials to see a video, that is `SOURCE_UNAVAILABLE` with a hint, not a prompt.
  A challenge aimed at us rather than at the video degrades the source instead.
- Nothing here reads captions. It only reports whether they exist.

## How to modify this box safely

A provider is one file exporting `{ id, matches(url), resolve(url, hasAds) }` plus a line in
`src/registry.ts`. Add its fixtures to the tests: a normal video, one with no captions, one
that cannot be embedded, one that does not exist. Those four cases are the contract.
