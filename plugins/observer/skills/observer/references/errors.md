# Errors

Every error carries `code`, `message`, and `hint`. The hint names the next legal call. This
file is what to do when the hint is not enough.

| Code | What happened | What to do |
|---|---|---|
| `BAD_SOURCE` | The url is not a video link | Ask the user for the video link. Do not guess an id. |
| `SOURCE_UNAVAILABLE` | Private, deleted, region blocked, or age restricted | Tell the user plainly and ask for another link. Nothing else works. |
| `SOURCE_NOT_EMBEDDABLE` | The owner disabled embedding | The player cannot load it, so a session is impossible. Say so before any preparation. |
| `NO_TRANSCRIPT` | No captions and no speech-recognition endpoint | Tell the user the video has no captions and that `OBSERVER_ASR_URL` points at a transcription endpoint when they want the fallback. |
| `TRANSCRIPT_FAILED` | The provider ran and produced nothing | The hint names the provider and what it said. Retry once with `open`; if it fails the same way, report it. |
| `PROVIDER_UNAVAILABLE` | A required tool is missing | The hint names it (`yt-dlp`, `ffmpeg`). Tell the user what to install. Do not try to install it yourself. |
| `WRONG_PHASE` | The call does not belong in this phase | The hint names the call to make instead. Make that one. |
| `UNKNOWN_SESSION` | No such session | Call `status` with no id to attach to the newest one. |
| `UNKNOWN_CONCEPT` | The concept id does not exist | Write it with `concepts` first, then attach the note. |
| `UNKNOWN_ARTIFACT` | The artifact id does not exist or failed to build | Build it before showing it. |
| `ARTIFACT_INVALID` | A check or the compile failed | The errors are line-accurate with a suggested fix. Fix and build again with the same id. |
| `PAGE_NOT_OPEN` | Verification needs the page, and nothing is connected | Ask the user to open the session url shown in the hint, then build again. |
| `STORE_UNWRITABLE` | The data directory cannot be written | Report the path. This is a permissions problem on the machine, not something to work around. |

## Two that are not errors

`wait` returning `idle: true` is normal. Call it again.

A `build` that returns `ok: false` is not an exception. It is the loop working: read the
errors, fix the source, build again with the same id.
