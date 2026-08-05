# ingest

## Purpose

Turn whatever the user pasted into a source the rest of the system can work with, and say
early whether it can actually be watched and transcribed.

## Inputs

Schema: [`schema/source.ts`](schema/source.ts) → `ResolveInput`

```ts
resolve({ url, hasAds }): Promise<Source>
```

- `url`: what the user pasted. Full watch URLs, short links, embed URLs, playlist URLs with
  a video in them, and a bare eleven-character id are all accepted.
- `hasAds`: the user's answer to "does this video carry ads", carried through untouched.

## Outputs

Schema: [`schema/source.ts`](schema/source.ts) → `Source`

```ts
{ provider: 'youtube', videoId, url, title, channel, duration, publishedAt,
  hasCaptions, captionLanguages, hasAds, embeddable }
```

- `duration` in seconds. `publishedAt` is an ISO date and is what the research pass
  compares against today to find what has moved since.
- `hasCaptions` and `captionLanguages` let the caller pick the transcript provider before
  spending a minute finding out.
- `embeddable` is false when the owner disabled embedding. The caller must refuse the
  session then, before any preparation, because the player will never load.

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
- One network round trip's worth of work. This runs while the user is still looking at the
  paste box, so it answers in seconds or it fails.
- The provider is chosen by the URL, and its name appears nowhere outside this box.
- No cookies, tokens, or account state are required for a public video. When a provider
  needs credentials to see a video, that is `SOURCE_UNAVAILABLE` with a hint, not a prompt.
- Nothing here reads captions. It only reports whether they exist.

## How to modify this box safely

A provider is one file exporting `{ matches(url), resolve(url) }` plus a registry line.
Add its fixtures to the tests: a normal video, one with no captions, one that cannot be
embedded, one that does not exist. Those four cases are the contract.
